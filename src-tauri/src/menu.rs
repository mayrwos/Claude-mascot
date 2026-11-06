use tauri::menu::{CheckMenuItemBuilder, IsMenuItem, Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Runtime};

use crate::hooks::Status;
use crate::i18n::Tr;
use crate::layout;
use crate::settings::Settings;

pub struct MenuState<'a> {
    pub tr: Tr,
    pub settings: &'a Settings,
    pub visible: bool,
    pub hooks: Status,
    pub port_error: bool,
    pub autostart: Option<bool>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    Toggle,
    Open,
    Command(String),
    Set(String, serde_json::Value),
    Flip(String),
    CodeDir,
    HooksInstall,
    HooksRemove,
    HooksOpen,
    Autostart,
    About,
    Quit,
    Nothing,
}

pub fn parse(id: &str) -> Action {
    let mut parts = id.splitn(3, ':');
    match (parts.next(), parts.next(), parts.next()) {
        (Some("toggle"), None, None) => Action::Toggle,
        (Some("open"), None, None) => Action::Open,
        (Some("cmd"), Some(name), None) => Action::Command(name.into()),
        (Some("flip"), Some(key), None) => Action::Flip(key.into()),
        (Some("set"), Some(key), Some(v)) => {
            let value = if key == "scale" {
                v.parse::<f64>().map(serde_json::Value::from).unwrap_or(serde_json::Value::Null)
            } else {
                serde_json::Value::String(v.into())
            };
            Action::Set(key.into(), value)
        }
        (Some("codeDir"), None, None) => Action::CodeDir,
        (Some("hooks"), Some("install"), None) => Action::HooksInstall,
        (Some("hooks"), Some("remove"), None) => Action::HooksRemove,
        (Some("hooks"), Some("open"), None) => Action::HooksOpen,
        (Some("autostart"), None, None) => Action::Autostart,
        (Some("about"), None, None) => Action::About,
        (Some("quit"), None, None) => Action::Quit,
        _ => Action::Nothing,
    }
}

pub fn build<R: Runtime>(app: &AppHandle<R>, st: &MenuState) -> tauri::Result<Menu<R>> {
    let t = |k: &str| st.tr.get(&format!("menu.{k}"));
    let s = st.settings;
    let item = |id: &str, label: String| MenuItemBuilder::with_id(id, label).build(app);
    let check = |id: &str, label: String, on: bool| CheckMenuItemBuilder::with_id(id, label).checked(on).build(app);
    let sep = || PredefinedMenuItem::separator(app);

    let mut toggle = MenuItemBuilder::with_id("toggle", if st.visible { t("hide") } else { t("show") });
    if !cfg!(target_os = "linux") {
        toggle = toggle.accelerator("CmdOrCtrl+Alt+M");
    }
    let toggle = toggle.build(app)?;
    let open = item("open", t("open"))?;

    let actions = SubmenuBuilder::new(app, t("actions"))
        .item(&item("cmd:pet", t("pet"))?)
        .item(&item("cmd:jump", t("jump"))?)
        .item(&item("cmd:dance", t("dance"))?)
        .item(&item("cmd:coffee", t("coffee"))?)
        .item(&item("cmd:wave", t("wave"))?)
        .separator()
        .item(&item("cmd:laptop", t("laptop"))?)
        .item(&item("cmd:sleep", t("sleep"))?)
        .separator()
        .item(&item("cmd:say", t("say"))?)
        .item(&item("cmd:tip", t("tip"))?)
        .build()?;

    let ultra = check("flip:ultra", t("ultra"), s.ultra)?;

    let hats = [("auto", "hatAuto"), ("none", "hatNone"), ("party", "hatParty"), ("crown", "hatCrown"), ("santa", "hatSanta"), ("beanie", "hatBeanie"), ("wizard", "hatWizard")];
    let mut hat_items = vec![];
    for (v, k) in hats {
        hat_items.push(check(&format!("set:hat:{v}"), t(k), s.hat == v)?);
    }
    let hat_refs: Vec<&dyn IsMenuItem<R>> = hat_items.iter().map(|i| i as &dyn IsMenuItem<R>).collect();
    let hat = SubmenuBuilder::new(app, t("hat")).items(&hat_refs).build()?;

    let sizes = st.tr.list("menu.sizes");
    let mut size_items = vec![];
    for (i, sc) in layout::SCALES.iter().enumerate() {
        let label = sizes.get(i).cloned().unwrap_or_else(|| sc.to_string());
        size_items.push(check(&format!("set:scale:{sc}"), label, (s.scale - sc).abs() < 1e-9)?);
    }
    let size_refs: Vec<&dyn IsMenuItem<R>> = size_items.iter().map(|i| i as &dyn IsMenuItem<R>).collect();
    let size = SubmenuBuilder::new(app, t("size")).items(&size_refs).build()?;

    let behavior = SubmenuBuilder::new(app, t("behavior"))
        .item(&check("flip:gravity", t("gravity"), s.gravity)?)
        .item(&check("flip:wander", t("wander"), s.wander)?)
        .item(&check("flip:speech", t("speech"), s.speech)?)
        .item(&check("flip:sounds", t("sounds"), s.sounds)?)
        .item(&check("flip:alwaysOnTop", t("onTop"), s.always_on_top)?)
        .item(&check("flip:showOnAttention", t("showOnAttention"), s.show_on_attention)?)
        .build()?;

    let dir_label = if s.code_dir.is_empty() {
        t("codeDirNone")
    } else {
        crate::events::base_name(&s.code_dir).to_string()
    };
    let target = SubmenuBuilder::new(app, t("openTarget"))
        .item(&check("set:openTarget:auto", t("targetAuto"), s.open_target == "auto")?)
        .item(&check("set:openTarget:app", t("targetApp"), s.open_target == "app")?)
        .item(&check("set:openTarget:code", t("targetCode"), s.open_target == "code")?)
        .item(&check("set:openTarget:web", t("targetWeb"), s.open_target == "web")?)
        .separator()
        .item(&item("codeDir", format!("{}  ({})", t("codeDir"), dir_label))?)
        .build()?;

    let mut integration = SubmenuBuilder::new(app, t("claudeCode"));
    if st.port_error {
        integration = integration.item(&MenuItemBuilder::with_id("noop:port", st.tr.fmt("menu.portBusy", &[("port", &s.port.to_string())])).enabled(false).build(app)?);
    }
    integration = integration
        .item(&MenuItemBuilder::with_id("noop:status", if st.hooks.installed { t("hooksOn") } else { t("hooksOff") }).enabled(false).build(app)?)
        .item(&item("hooks:install", if st.hooks.installed { t("hooksReinstall") } else { t("hooksInstall") })?);
    if st.hooks.installed {
        integration = integration.item(&item("hooks:remove", t("hooksRemove"))?);
    }
    let integration = integration
        .separator()
        .item(&item("hooks:open", t("hooksOpen"))?)
        .item(&item("cmd:demo", t("demo"))?)
        .build()?;

    let lang = SubmenuBuilder::new(app, t("language"))
        .item(&check("set:lang:auto", t("langAuto"), s.lang == "auto")?)
        .item(&check("set:lang:ru", "Русский".into(), s.lang == "ru")?)
        .item(&check("set:lang:en", "English".into(), s.lang == "en")?)
        .build()?;

    let mut menu = MenuBuilder::new(app)
        .item(&toggle)
        .item(&open)
        .item(&sep()?)
        .item(&actions)
        .item(&ultra)
        .item(&hat)
        .item(&size)
        .item(&behavior)
        .item(&target)
        .item(&sep()?)
        .item(&integration);
    if let Some(on) = st.autostart {
        menu = menu.item(&check("autostart", t("autostart"), on)?);
    }
    menu.item(&lang)
        .item(&sep()?)
        .item(&item("about", t("about"))?)
        .item(&item("quit", t("quit"))?)
        .build()
}
