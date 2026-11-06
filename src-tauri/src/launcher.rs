use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Target {
    App,
    Code,
    Web,
}

pub const WEB_URL: &str = "https://claude.ai/new";
pub const APP_URL: &str = "claude://";

pub fn resolve(setting: &str, has_app: bool) -> Target {
    match setting {
        "code" => Target::Code,
        "web" => Target::Web,
        "app" if has_app => Target::App,
        "app" => Target::Web,
        _ if has_app => Target::App,
        _ => Target::Web,
    }
}

pub fn has_desktop_app() -> bool {
    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CLASSES_ROOT, HKEY_CURRENT_USER};
        use winreg::RegKey;
        let hkcr = RegKey::predef(HKEY_CLASSES_ROOT);
        if hkcr.open_subkey("claude\\shell\\open\\command").is_ok() {
            return true;
        }
        RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Classes\\claude\\shell\\open\\command").is_ok()
    }
    #[cfg(target_os = "macos")]
    {
        Path::new("/Applications/Claude.app").exists()
            || std::env::var_os("HOME").is_some_and(|h| PathBuf::from(h).join("Applications/Claude.app").exists())
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        false
    }
}

pub fn working_dir(code_dir: &str, last_cwd: &str, home: &Path) -> PathBuf {
    for d in [code_dir, last_cwd] {
        if !d.is_empty() && Path::new(d).is_dir() {
            return PathBuf::from(d);
        }
    }
    home.to_path_buf()
}

fn spawn(cmd: &mut Command) -> bool {
    cmd.spawn().is_ok()
}

pub fn open_terminal(dir: &Path) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        if spawn(Command::new("wt.exe").arg("-d").arg(dir).args(["cmd", "/k", "claude"])) {
            return true;
        }
        spawn(
            Command::new("cmd.exe")
                .current_dir(dir)
                .creation_flags(CREATE_NO_WINDOW)
                .raw_arg("/c start \"Claude Code\" cmd /k claude"),
        )
    }
    #[cfg(target_os = "macos")]
    {
        let lit = format!("\"{}\"", dir.display().to_string().replace('\\', "\\\\").replace('"', "\\\""));
        let script = format!("tell application \"Terminal\"\n do script \"cd \" & quoted form of {lit} & \" && claude\"\n activate\nend tell");
        spawn(Command::new("osascript").arg("-e").arg(script))
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let quoted = format!("'{}'", dir.display().to_string().replace('\'', "'\\''"));
        let shell = format!("cd {quoted} && claude; exec \"$SHELL\"");
        let terminals: [(&str, &[&str]); 4] = [
            ("x-terminal-emulator", &["-e", "bash", "-lc"]),
            ("gnome-terminal", &["--", "bash", "-lc"]),
            ("konsole", &["-e", "bash", "-lc"]),
            ("xterm", &["-e", "bash", "-lc"]),
        ];
        terminals.iter().any(|(t, args)| spawn(Command::new(t).args(*args).arg(&shell).current_dir(dir)))
    }
}
