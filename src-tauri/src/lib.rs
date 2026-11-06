pub mod events;
pub mod geom;
pub mod hooks;
pub mod i18n;
pub mod launcher;
pub mod layout;
pub mod menu;
pub mod physics;
pub mod server;
pub mod settings;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Theme, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_opener::OpenerExt;

use geom::Area;
use physics::{Body, Bounds, ShakeDetector, Sim, Start};
use settings::Settings;

const SHORTCUT: &str = "CommandOrControl+Alt+M";
const MAIN: &str = "main";
const TRAY: &str = "main-tray";

struct Drag {
    ox: f64,
    oy: f64,
    k: f64,
    samples: Vec<(f64, f64, u64)>,
    shake: ShakeDetector,
    vx: f64,
    sent_vx: f64,
    sent_at: u64,
}

enum Motion {
    Idle,
    Drag(Drag),
    Fly(Sim),
}

pub struct Shared {
    settings: Mutex<Settings>,
    settings_path: PathBuf,
    dirty: AtomicBool,
    motion: Mutex<Motion>,
    server: Mutex<Option<server::HookServer>>,
    server_error: Mutex<Option<String>>,
    last_cwd: Mutex<String>,
    first_run: AtomicBool,
    locale: String,
    epoch: Instant,
    geo: Mutex<Geo>,
    visible: AtomicBool,
    regions: Mutex<(Vec<[f64; 4]>, bool)>,
    ignoring: AtomicBool,
}

impl Shared {
    fn now_ms(&self) -> u64 {
        self.epoch.elapsed().as_millis() as u64
    }
    fn settings(&self) -> Settings {
        self.settings.lock().unwrap().clone()
    }
    fn tr(&self) -> i18n::Tr {
        i18n::Tr::new(&self.settings.lock().unwrap().lang, &self.locale)
    }
}

fn shared(app: &AppHandle) -> tauri::State<'_, Shared> {
    app.state::<Shared>()
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(MAIN)
}

fn home_dir(app: &AppHandle) -> PathBuf {
    app.path().home_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn claude_settings(app: &AppHandle) -> PathBuf {
    hooks::settings_path(&home_dir(app))
}

#[derive(Default)]
struct Geo {
    x: f64,
    y: f64,
    k: f64,
    synced: Option<Instant>,
    areas: Vec<Area>,
    primary: Option<(Area, f64)>,
    fetched: Option<Instant>,
}

fn monitors(app: &AppHandle) -> (Vec<Area>, Option<(Area, f64)>) {
    let to_area = |m: &tauri::Monitor| {
        let wa = m.work_area();
        Area { x: wa.position.x as f64, y: wa.position.y as f64, w: wa.size.width as f64, h: wa.size.height as f64 }
    };
    let list = app.available_monitors().unwrap_or_default();
    let areas = list.iter().map(to_area).collect();
    let primary = app.primary_monitor().ok().flatten().or_else(|| list.into_iter().next()).map(|m| (to_area(&m), m.scale_factor()));
    (areas, primary)
}

fn work_areas(app: &AppHandle) -> (Vec<Area>, Option<(Area, f64)>) {
    let st = shared(app);
    {
        let g = st.geo.lock().unwrap();
        if g.fetched.is_some_and(|t| t.elapsed() < Duration::from_secs(2)) {
            return (g.areas.clone(), g.primary);
        }
    }
    let (areas, primary) = monitors(app);
    let mut g = st.geo.lock().unwrap();
    g.areas = areas.clone();
    g.primary = primary;
    g.fetched = Some(Instant::now());
    (areas, primary)
}

fn win_geo(app: &AppHandle, win: &WebviewWindow) -> (f64, f64, f64) {
    let st = shared(app);
    {
        let g = st.geo.lock().unwrap();
        if g.synced.is_some_and(|t| t.elapsed() < Duration::from_millis(500)) {
            return (g.x, g.y, g.k);
        }
    }
    let (x, y) = win.outer_position().map(|p| (p.x as f64, p.y as f64)).unwrap_or((0.0, 0.0));
    let k = win.scale_factor().unwrap_or(1.0);
    let mut g = st.geo.lock().unwrap();
    (g.x, g.y, g.k, g.synced) = (x, y, k, Some(Instant::now()));
    (x, y, k)
}

fn win_pos(app: &AppHandle, win: &WebviewWindow) -> (f64, f64) {
    let (x, y, _) = win_geo(app, win);
    (x, y)
}

fn set_pos(app: &AppHandle, win: &WebviewWindow, x: f64, y: f64) {
    let (x, y) = (x.round(), y.round());
    let _ = win.set_position(PhysicalPosition::new(x as i32, y as i32));
    let st = shared(app);
    let mut g = st.geo.lock().unwrap();
    g.x = x;
    g.y = y;
}

fn bounds_at(app: &AppHandle, x: f64, y: f64, scale: f64, k: f64) -> Bounds {
    let bb = layout::body_box(scale);
    let (cx, cy) = geom::body_center(x, y, &bb, k);
    let area = geom::area_for(&work_areas(app).0, cx, cy).unwrap_or(Area { x: 0.0, y: 0.0, w: 1920.0, h: 1080.0 });
    geom::bounds_for(&area, &bb, k)
}

fn on_screen(app: &AppHandle, x: f64, y: f64, scale: f64, k: f64) -> bool {
    let (cx, cy) = geom::body_center(x, y, &layout::body_box(scale), k);
    work_areas(app).0.iter().any(|a| a.contains(cx, cy))
}

fn default_position(app: &AppHandle, scale: f64) -> (f64, f64) {
    let bb = layout::body_box(scale);
    match work_areas(app).1 {
        Some((a, k)) => (a.x + a.w - (bb.right + 32.0) * k, a.y + a.h - bb.feet * k),
        None => (100.0, 100.0),
    }
}

fn current_viewport(app: &AppHandle, win: &WebviewWindow, scale: f64) -> Option<geom::Viewport> {
    let (wx, wy, k) = win_geo(app, win);
    let size = layout::window_size(scale);
    let (cx, cy) = geom::body_center(wx, wy, &layout::body_box(scale), k);
    geom::area_for(&work_areas(app).0, cx, cy).map(|a| geom::viewport(&a, wx, wy, k, size.width, size.height))
}

fn remember_position(app: &AppHandle, win: &WebviewWindow) {
    let (x, y) = win_pos(app, win);
    let st = shared(app);
    let mut s = st.settings.lock().unwrap();
    s.x = Some(x as i32);
    s.y = Some(y as i32);
    st.dirty.store(true, Ordering::Relaxed);
}

fn create_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let s = shared(app).settings();
    let size = layout::window_size(s.scale);
    #[allow(unused_mut)]
    let mut b = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("renderer/index.html".into()))
        .title("Claude Mascot")
        .inner_size(size.width, size.height)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(s.always_on_top)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .theme(Some(Theme::Dark));
    #[cfg(windows)]
    {
        b = b.focusable(false).additional_browser_args(
            "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required",
        );
    }
    let win = b.build()?;

    let k = win.scale_factor().unwrap_or(1.0);
    let (x, y) = match (s.x, s.y) {
        (Some(x), Some(y)) if on_screen(app, x as f64, y as f64, s.scale, k) => {
            geom::clamp_into(&bounds_at(app, x as f64, y as f64, s.scale, k), x as f64, y as f64)
        }
        _ => default_position(app, s.scale),
    };
    set_pos(app, &win, x, y);
    win.show()?;
    let _ = win.set_ignore_cursor_events(true);
    shared(app).visible.store(true, Ordering::Relaxed);
    Ok(win)
}

fn is_visible(app: &AppHandle) -> bool {
    shared(app).visible.load(Ordering::Relaxed)
}

fn show_window(app: &AppHandle) {
    if let Some(win) = main_window(app) {
        if !is_visible(app) {
            let _ = win.show();
            let _ = win.set_always_on_top(shared(app).settings().always_on_top);
            shared(app).visible.store(true, Ordering::Relaxed);
            let _ = app.emit_to(MAIN, "visibility", json!({ "visible": true }));
            let _ = app.emit_to(MAIN, "command", json!({ "name": "appear" }));
        }
    }
    refresh_tray(app);
}

fn hide_window(app: &AppHandle) {
    if let Some(win) = main_window(app) {
        let _ = win.hide();
        shared(app).visible.store(false, Ordering::Relaxed);
        let _ = app.emit_to(MAIN, "visibility", json!({ "visible": false }));
    }
    refresh_tray(app);
}

fn request_hide(app: &AppHandle) {
    let _ = app.emit_to(MAIN, "command", json!({ "name": "hide" }));
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1500));
        if is_visible(&app) {
            hide_window(&app);
        }
    });
}

fn toggle_window(app: &AppHandle) {
    if is_visible(app) {
        request_hide(app);
    } else {
        show_window(app);
    }
}

fn resize_for_scale(app: &AppHandle, old: f64, new: f64) {
    let Some(win) = main_window(app) else { return };
    let (x, y, k) = win_geo(app, &win);
    let (a, b) = (layout::body_box(old), layout::body_box(new));
    let foot_x = x + (a.left + a.right) / 2.0 * k;
    let foot_y = y + a.feet * k;
    let nx = foot_x - (b.left + b.right) / 2.0 * k;
    let ny = foot_y - b.feet * k;
    let _ = win.set_size(PhysicalSize::new((b.width * k).round() as u32, (b.height * k).round() as u32));
    let (cx, cy) = geom::clamp_into(&bounds_at(app, nx, ny, new, k), nx, ny);
    set_pos(app, &win, cx, cy);
    remember_position(app, &win);
}

fn start_flight(app: &AppHandle, win: &WebviewWindow, vx: f64, vy: f64) {
    let st = shared(app);
    let s = st.settings();
    let (x, y, k) = win_geo(app, win);
    let bounds = bounds_at(app, x, y, s.scale, k);
    match physics::start(Body { x, y, vx, vy }, &bounds, s.gravity, k) {
        Start::Immediate(b, ev) => {
            set_pos(app, win, b.x, b.y);
            *st.motion.lock().unwrap() = Motion::Idle;
            remember_position(app, win);
            let _ = app.emit_to(MAIN, "physics", ev.to_json());
        }
        Start::Simulate(sim, first) => {
            if let Some(ev) = first {
                let _ = app.emit_to(MAIN, "physics", ev.to_json());
            }
            *st.motion.lock().unwrap() = Motion::Fly(sim);
        }
    }
}

fn step_motion(app: &AppHandle, win: &WebviewWindow) {
    let st = shared(app);
    let mut motion = st.motion.lock().unwrap();
    match &mut *motion {
        Motion::Idle => {}
        Motion::Drag(d) => {
            let Ok(c) = app.cursor_position() else { return };
            let (x, y) = (c.x - d.ox, c.y - d.oy);
            set_pos(app, win, x, y);
            let now = st.now_ms();
            if let Some(&(lx, _, lt)) = d.samples.last() {
                let vx = (x - lx) / d.k / (now.saturating_sub(lt).max(1) as f64);
                if d.shake.push(vx, now) {
                    let _ = app.emit_to(MAIN, "physics", json!({ "type": "shake" }));
                }
                d.vx = d.vx * 0.7 + vx * 0.3;
                if (d.vx - d.sent_vx).abs() > 0.05 && now.saturating_sub(d.sent_at) >= 50 {
                    d.sent_vx = d.vx;
                    d.sent_at = now;
                    let _ = app.emit_to(MAIN, "physics", json!({ "type": "swing", "vx": (d.vx * 16.0 * 10.0).round() / 10.0 }));
                }
            }
            d.samples.push((x, y, now));
            if d.samples.len() > 12 {
                d.samples.remove(0);
            }
        }
        Motion::Fly(sim) => {
            let scale = st.settings.lock().unwrap().scale;
            let bounds = bounds_at(app, sim.body.x, sim.body.y, scale, sim.k);
            let (ev, done) = sim.step(&bounds);
            set_pos(app, win, sim.body.x, sim.body.y);
            if let Some(e) = ev {
                let _ = app.emit_to(MAIN, "physics", e.to_json());
            } else if sim.gravity && sim.frames % 3 == 0 {
                let _ = app.emit_to(MAIN, "physics", json!({ "type": "air", "vy": (sim.body.vy / sim.k).round() }));
            }
            if done {
                *motion = Motion::Idle;
                drop(motion);
                remember_position(app, win);
            }
        }
    }
}

fn spawn_ticker(app: AppHandle) {
    std::thread::Builder::new()
        .name("mascot-ticker".into())
        .spawn(move || {
            let mut last_cursor = (f64::NAN, f64::NAN);
            let mut last_emit = Instant::now();
            let mut last_save = Instant::now();
            let mut last_check = Instant::now();
            let mut last_view: Option<geom::Viewport> = None;
            let mut last_view_at = Instant::now();
            loop {
                let st = shared(&app);
                let (moving, dragging) = {
                    let m = st.motion.lock().unwrap();
                    (!matches!(*m, Motion::Idle), matches!(*m, Motion::Drag(_)))
                };
                let visible = st.visible.load(Ordering::Relaxed);
                std::thread::sleep(Duration::from_millis(if moving { 16 } else if visible { 33 } else { 150 }));
                let Some(win) = main_window(&app) else { continue };

                if visible {
                    if moving {
                        step_motion(&app, &win);
                    }
                    let (wx, wy, k) = win_geo(&app, &win);
                    let scale = st.settings.lock().unwrap().scale;
                    let size = layout::window_size(scale);
                    if let Ok(c) = app.cursor_position() {
                        let (rx, ry) = ((c.x - wx) / k, (c.y - wy) / k);
                        let catch = dragging || {
                            let r = st.regions.lock().unwrap();
                            r.1 || geom::hit(&r.0, rx, ry)
                        };
                        if catch == st.ignoring.load(Ordering::Relaxed) {
                            let _ = win.set_ignore_cursor_events(!catch);
                            st.ignoring.store(!catch, Ordering::Relaxed);
                        }
                        let near = rx > -60.0 && ry > -60.0 && rx < size.width + 60.0 && ry < size.height + 60.0;
                        let every = Duration::from_millis(if near { 33 } else { 160 });
                        if (rx, ry) != last_cursor && last_emit.elapsed() >= every {
                            last_cursor = (rx, ry);
                            last_emit = Instant::now();
                            let _ = app.emit_to(MAIN, "cursor", json!({ "x": rx.round(), "y": ry.round() }));
                        }
                    }
                    if let Some(vp) = current_viewport(&app, &win, scale) {
                        if last_view != Some(vp) || last_view_at.elapsed() > Duration::from_secs(3) {
                            last_view = Some(vp);
                            last_view_at = Instant::now();
                            let _ = app.emit_to(MAIN, "viewport", vp);
                        }
                    }
                }

                if last_save.elapsed() > Duration::from_secs(1) {
                    last_save = Instant::now();
                    if st.dirty.swap(false, Ordering::Relaxed) {
                        let _ = st.settings().save(&st.settings_path);
                    }
                }
                if visible && !moving && last_check.elapsed() > Duration::from_secs(2) {
                    last_check = Instant::now();
                    let scale = st.settings.lock().unwrap().scale;
                    let (x, y, k) = win_geo(&app, &win);
                    if !on_screen(&app, x, y, scale, k) {
                        let (dx, dy) = default_position(&app, scale);
                        set_pos(&app, &win, dx, dy);
                        remember_position(&app, &win);
                    }
                }
            }
        })
        .expect("ticker thread");
}

fn change_setting(app: &AppHandle, key: &str, value: Value) {
    let st = shared(app);
    let (changed, old, new) = {
        let mut s = st.settings.lock().unwrap();
        let old = s.clone();
        let changed = s.set(key, &value);
        (changed, old, s.clone())
    };
    if !changed {
        return;
    }
    st.dirty.store(true, Ordering::Relaxed);
    match key {
        "scale" => resize_for_scale(app, old.scale, new.scale),
        "alwaysOnTop" => {
            if let Some(w) = main_window(app) {
                let _ = w.set_always_on_top(new.always_on_top);
            }
        }
        "gravity" if new.gravity => {
            if let Some(w) = main_window(app) {
                start_flight(app, &w, 0.0, 0.1);
            }
        }
        "port" => start_server(app),
        _ => {}
    }
    let _ = app.emit_to(MAIN, "settings", &new);
    refresh_tray(app);
}

fn start_server(app: &AppHandle) {
    let st = shared(app);
    if let Some(old) = st.server.lock().unwrap().take() {
        old.stop();
    }
    let port = st.settings().port;
    let handle = app.clone();
    let result = server::start(port, move |msg| match msg {
        server::Incoming::Hook(ev, cwd) => {
            let st = shared(&handle);
            if let Some(c) = cwd.filter(|c| !c.is_empty()) {
                *st.last_cwd.lock().unwrap() = c;
            }
            let needs_you = ev.event == "PermissionRequest"
                || (ev.event == "Notification"
                    && matches!(ev.notification.as_deref(), Some("permission_prompt") | Some("elicitation_dialog")));
            let _ = handle.emit_to(MAIN, "claude", &ev);
            if needs_you && st.settings().show_on_attention && !is_visible(&handle) {
                show_window(&handle);
            }
        }
        server::Incoming::Say(text) => {
            let _ = handle.emit_to(MAIN, "command", json!({ "name": "say-text", "arg": text }));
        }
        server::Incoming::Action(name) => {
            let _ = handle.emit_to(MAIN, "command", json!({ "name": name }));
        }
    });
    match result {
        Ok(srv) => {
            *st.server.lock().unwrap() = Some(srv);
            *st.server_error.lock().unwrap() = None;
        }
        Err(e) => {
            eprintln!("[mascot] hook server on port {port} failed: {e}");
            *st.server_error.lock().unwrap() = Some(e);
        }
    }
    refresh_tray(app);
}

fn open_claude(app: &AppHandle) {
    let st = shared(app);
    let s = st.settings();
    let cwd = st.last_cwd.lock().unwrap().clone();
    match launcher::resolve(&s.open_target, launcher::has_desktop_app()) {
        launcher::Target::App => {
            if app.opener().open_url(launcher::APP_URL, None::<&str>).is_ok() {
                return;
            }
        }
        launcher::Target::Code => {
            if launcher::open_terminal(&launcher::working_dir(&s.code_dir, &cwd, &home_dir(app))) {
                return;
            }
        }
        launcher::Target::Web => {}
    }
    let _ = app.opener().open_url(launcher::WEB_URL, None::<&str>);
}

fn info(app: &AppHandle, title: &str, text: String) {
    let ok = shared(app).tr().get("dialogs.ok");
    app.dialog().message(text).title(title).kind(MessageDialogKind::Info).buttons(MessageDialogButtons::OkCustom(ok)).show(|_| {});
}

fn install_hooks(app: &AppHandle) {
    let st = shared(app);
    let tr = st.tr();
    let file = claude_settings(app);
    let port = st.settings().port;
    let body = tr.fmt("dialogs.installBody", &[("file", &file.display().to_string()), ("port", &port.to_string())]);
    let title = tr.get("dialogs.installTitle");
    let handle = app.clone();
    app.dialog()
        .message(body)
        .title(&title)
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(tr.get("dialogs.confirm"), tr.get("dialogs.cancel")))
        .show(move |ok| {
            if !ok {
                return;
            }
            let tr = shared(&handle).tr();
            match hooks::install(&file, port) {
                Ok(status) => {
                    let _ = handle.emit_to(MAIN, "hooks", status);
                    let _ = handle.emit_to(MAIN, "command", json!({ "name": "celebrate" }));
                    info(&handle, &title, tr.get("dialogs.installOk"));
                }
                Err(e) => info(&handle, &title, tr.fmt("dialogs.error", &[("msg", &e)])),
            }
            refresh_tray(&handle);
        });
}

fn uninstall_hooks(app: &AppHandle) {
    let st = shared(app);
    let tr = st.tr();
    let title = tr.get("dialogs.installTitle");
    match hooks::uninstall(&claude_settings(app), st.settings().port) {
        Ok(status) => {
            let _ = app.emit_to(MAIN, "hooks", status);
            info(app, &title, tr.get("dialogs.removeOk"));
        }
        Err(e) => info(app, &title, tr.fmt("dialogs.error", &[("msg", &e)])),
    }
    refresh_tray(app);
}

fn open_claude_settings(app: &AppHandle) {
    let file = claude_settings(app);
    if file.exists() {
        let _ = app.opener().open_path(file.display().to_string(), None::<&str>);
    } else if let Some(dir) = file.parent() {
        let _ = std::fs::create_dir_all(dir);
        let _ = app.opener().open_path(dir.display().to_string(), None::<&str>);
    }
}

fn pick_code_dir(app: &AppHandle) {
    let st = shared(app);
    let s = st.settings();
    let start = if s.code_dir.is_empty() { home_dir(app) } else { PathBuf::from(&s.code_dir) };
    let handle = app.clone();
    app.dialog().file().set_title(st.tr().get("dialogs.pickDir")).set_directory(start).pick_folder(move |picked| {
        if let Some(path) = picked.and_then(|p| p.into_path().ok()) {
            change_setting(&handle, "codeDir", Value::String(path.display().to_string()));
        }
    });
}

fn autostart_supported() -> bool {
    !cfg!(debug_assertions) && (cfg!(windows) || cfg!(target_os = "macos"))
}

fn toggle_autostart(app: &AppHandle) {
    let m = app.autolaunch();
    let _ = if m.is_enabled().unwrap_or(false) { m.disable() } else { m.enable() };
    refresh_tray(app);
}

fn show_about(app: &AppHandle) {
    let tr = shared(app).tr();
    info(app, "Claude Mascot", tr.fmt("dialogs.aboutBody", &[("version", env!("CARGO_PKG_VERSION"))]));
}

fn build_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let st = shared(app);
    let s = st.settings();
    let state = menu::MenuState {
        tr: st.tr(),
        settings: &s,
        visible: is_visible(app),
        hooks: hooks::check(&claude_settings(app), s.port),
        port_error: st.server_error.lock().unwrap().is_some(),
        autostart: autostart_supported().then(|| app.autolaunch().is_enabled().unwrap_or(false)),
    };
    menu::build(app, &state)
}

fn refresh_tray(app: &AppHandle) {
    if let (Some(tray), Ok(m)) = (app.tray_by_id(TRAY), build_menu(app)) {
        let _ = tray.set_menu(Some(m));
    }
}

fn on_menu(app: &AppHandle, id: &str) {
    match menu::parse(id) {
        menu::Action::Toggle => toggle_window(app),
        menu::Action::Open => open_claude(app),
        menu::Action::Command(name) => {
            show_window(app);
            let _ = app.emit_to(MAIN, "command", json!({ "name": name }));
        }
        menu::Action::Set(key, value) => change_setting(app, &key, value),
        menu::Action::Flip(key) => {
            let current = serde_json::to_value(shared(app).settings()).ok().and_then(|v| v.get(&key).and_then(Value::as_bool));
            if let Some(b) = current {
                change_setting(app, &key, Value::Bool(!b));
            }
        }
        menu::Action::CodeDir => pick_code_dir(app),
        menu::Action::HooksInstall => install_hooks(app),
        menu::Action::HooksRemove => uninstall_hooks(app),
        menu::Action::HooksOpen => open_claude_settings(app),
        menu::Action::Autostart => toggle_autostart(app),
        menu::Action::About => show_about(app),
        menu::Action::Quit => {
            let st = shared(app);
            if let Some(w) = main_window(app) {
                remember_position(app, &w);
            }
            let _ = st.settings().save(&st.settings_path);
            app.exit(0);
        }
        menu::Action::Nothing => {}
    }
}

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
    TrayIconBuilder::with_id(TRAY)
        .icon(icon)
        .tooltip("Claude Mascot")
        .menu(&build_menu(app)?)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                toggle_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[tauri::command]
fn get_state(app: AppHandle) -> Value {
    let st = shared(&app);
    let s = st.settings();
    let first = st.first_run.swap(false, Ordering::Relaxed);
    if first {
        let mut g = st.settings.lock().unwrap();
        g.first_run = false;
        st.dirty.store(true, Ordering::Relaxed);
    }
    let viewport = main_window(&app).and_then(|w| current_viewport(&app, &w, s.scale));
    json!({
        "settings": s,
        "viewport": viewport,
        "locale": st.locale,
        "firstRun": first,
        "hooksInstalled": hooks::check(&claude_settings(&app), s.port).installed,
        "version": env!("CARGO_PKG_VERSION"),
        "platform": std::env::consts::OS,
    })
}

#[tauri::command]
fn set_regions(app: AppHandle, rects: Vec<[f64; 4]>, capture: bool) {
    let rects: Vec<[f64; 4]> = rects.into_iter().take(64).filter(|r| r.iter().all(|v| v.is_finite())).collect();
    *shared(&app).regions.lock().unwrap() = (rects, capture);
}

#[tauri::command]
fn drag_start(app: AppHandle) {
    let Some(win) = main_window(&app) else { return };
    let Ok(c) = app.cursor_position() else { return };
    let (x, y, k) = win_geo(&app, &win);
    let st = shared(&app);
    let now = st.now_ms();
    *st.motion.lock().unwrap() = Motion::Drag(Drag {
        ox: c.x - x,
        oy: c.y - y,
        k,
        samples: vec![(x, y, now)],
        shake: ShakeDetector::default(),
        vx: 0.0,
        sent_vx: 0.0,
        sent_at: 0,
    });
}

#[tauri::command]
fn drag_end(app: AppHandle) {
    let Some(win) = main_window(&app) else { return };
    let st = shared(&app);
    let samples = match std::mem::replace(&mut *st.motion.lock().unwrap(), Motion::Idle) {
        Motion::Drag(d) => d.samples,
        _ => return,
    };
    let (vx, vy) = physics::throw_velocity(&samples, st.now_ms());
    start_flight(&app, &win, vx, vy);
}

#[tauri::command]
fn walk_step(app: AppHandle, dx: f64) -> Value {
    let Some(win) = main_window(&app) else { return json!({ "blocked": false }) };
    let st = shared(&app);
    if !matches!(*st.motion.lock().unwrap(), Motion::Idle) {
        return json!({ "blocked": false });
    }
    let scale = st.settings.lock().unwrap().scale;
    let (x, y, k) = win_geo(&app, &win);
    let b = bounds_at(&app, x, y, scale, k);
    let target = x + dx.clamp(-24.0, 24.0) * k;
    let nx = target.clamp(b.min_x, b.max_x.max(b.min_x));
    set_pos(&app, &win, nx, y);
    remember_position(&app, &win);
    json!({ "blocked": (nx - target).abs() > 0.5 })
}

#[tauri::command]
fn open_claude_cmd(app: AppHandle) {
    open_claude(&app);
}

#[tauri::command]
fn hide_window_cmd(app: AppHandle) {
    hide_window(&app);
}

#[tauri::command]
async fn context_menu(app: AppHandle, window: WebviewWindow) {
    let Ok(m) = build_menu(&app) else { return };
    let _ = window.set_focusable(true);
    let _ = window.popup_menu(&m);
    let _ = window.set_focusable(!cfg!(windows));
}

#[tauri::command]
fn set_renderer_setting(app: AppHandle, key: String, value: Value) {
    if key == "pets" {
        let st = shared(&app);
        if st.settings.lock().unwrap().set(&key, &value) {
            st.dirty.store(true, Ordering::Relaxed);
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_window(app)))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_state,
            set_regions,
            drag_start,
            drag_end,
            walk_step,
            open_claude_cmd,
            hide_window_cmd,
            context_menu,
            set_renderer_setting
        ])
        .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
        .setup(|app| {
            let handle = app.handle().clone();
            let config = app.path().app_config_dir()?;
            let mut legacy = vec![];
            if let Ok(base) = app.path().config_dir() {
                legacy.push(base.join("Claude Mascot").join("settings.json"));
            }
            let settings_path = config.join("settings.json");
            let settings = Settings::load_or_migrate(&settings_path, &legacy);
            let first_run = settings.first_run;
            app.manage(Shared {
                settings: Mutex::new(settings),
                settings_path,
                dirty: AtomicBool::new(true),
                motion: Mutex::new(Motion::Idle),
                server: Mutex::new(None),
                server_error: Mutex::new(None),
                last_cwd: Mutex::new(String::new()),
                first_run: AtomicBool::new(first_run),
                locale: sys_locale::get_locale().unwrap_or_else(|| "en-US".into()),
                epoch: Instant::now(),
                geo: Mutex::new(Geo::default()),
                visible: AtomicBool::new(false),
                regions: Mutex::new((vec![], false)),
                ignoring: AtomicBool::new(true),
            });
            app.set_theme(Some(Theme::Dark));
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            create_window(&handle)?;
            create_tray(&handle)?;
            start_server(&handle);
            if let Err(e) = app.global_shortcut().on_shortcut(SHORTCUT, |app, _sc, ev| {
                if ev.state == ShortcutState::Pressed {
                    toggle_window(app);
                }
            }) {
                eprintln!("[mascot] could not register {SHORTCUT}: {e}");
            }
            spawn_ticker(handle.clone());
            if shared(&handle).settings().gravity {
                let h = handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(800));
                    if let Some(w) = main_window(&h) {
                        start_flight(&h, &w, 0.0, 0.1);
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Claude Mascot")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let st = shared(app);
                let _ = st.settings().save(&st.settings_path);
                let srv = st.server.lock().unwrap().take();
                if let Some(srv) = srv {
                    srv.stop();
                }
            }
        });
}
