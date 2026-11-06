use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

pub const MARK: &str = "src=claude-mascot";

pub const EVENTS: [&str; 13] = [
    "SessionStart",
    "SessionEnd",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "PermissionRequest",
    "Notification",
    "Stop",
    "StopFailure",
    "SubagentStart",
    "SubagentStop",
    "PreCompact",
];

const TOOL_EVENTS: [&str; 4] = ["PreToolUse", "PostToolUse", "PostToolUseFailure", "PermissionRequest"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub installed: bool,
    pub count: usize,
    pub port_ok: bool,
}

pub fn config_dir(env_dir: Option<String>, home: &Path) -> PathBuf {
    match env_dir.filter(|d| !d.is_empty()) {
        Some(d) => PathBuf::from(d),
        None => home.join(".claude"),
    }
}

pub fn settings_path(home: &Path) -> PathBuf {
    config_dir(std::env::var("CLAUDE_CONFIG_DIR").ok(), home).join("settings.json")
}

pub fn hook_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/hook?{MARK}")
}

pub fn is_ours(hook: &Value) -> bool {
    hook.get("type").and_then(Value::as_str) == Some("http")
        && hook.get("url").and_then(Value::as_str).is_some_and(|u| u.contains(MARK))
}

pub fn remove_hooks(settings: &Value) -> Value {
    let mut out = settings.clone();
    let Some(obj) = out.as_object_mut() else { return out };
    let Some(hooks) = obj.get_mut("hooks").and_then(Value::as_object_mut) else { return out };
    let events: Vec<String> = hooks.keys().cloned().collect();
    for event in events {
        let groups = hooks.get(&event).and_then(Value::as_array).cloned().unwrap_or_default();
        let mut kept = Vec::new();
        for g in groups {
            match g.get("hooks").and_then(Value::as_array) {
                Some(list) => {
                    let rest: Vec<Value> = list.iter().filter(|h| !is_ours(h)).cloned().collect();
                    if !rest.is_empty() {
                        let mut g2 = g.clone();
                        g2["hooks"] = Value::Array(rest);
                        kept.push(g2);
                    }
                }
                None => kept.push(g),
            }
        }
        if kept.is_empty() {
            hooks.shift_remove(&event);
        } else {
            hooks.insert(event, Value::Array(kept));
        }
    }
    if hooks.is_empty() {
        obj.shift_remove("hooks");
    }
    out
}

pub fn add_hooks(settings: &Value, port: u16) -> Value {
    let mut out = remove_hooks(settings);
    if !out.is_object() {
        out = Value::Object(Map::new());
    }
    let obj = out.as_object_mut().expect("object");
    if !obj.get("hooks").is_some_and(Value::is_object) {
        obj.insert("hooks".into(), Value::Object(Map::new()));
    }
    let hooks = obj.get_mut("hooks").and_then(Value::as_object_mut).expect("hooks object");
    let hook = json!({ "type": "http", "url": hook_url(port), "timeout": 3 });
    for event in EVENTS {
        let group = if TOOL_EVENTS.contains(&event) {
            json!({ "matcher": "*", "hooks": [hook.clone()] })
        } else {
            json!({ "hooks": [hook.clone()] })
        };
        let entry = hooks.entry(event.to_string()).or_insert_with(|| Value::Array(vec![]));
        if !entry.is_array() {
            *entry = Value::Array(vec![]);
        }
        entry.as_array_mut().expect("array").push(group);
    }
    out
}

pub fn status(settings: &Value, port: u16) -> Status {
    let mut count = 0;
    let mut port_ok = false;
    if let Some(hooks) = settings.get("hooks").and_then(Value::as_object) {
        for groups in hooks.values() {
            for g in groups.as_array().into_iter().flatten() {
                for h in g.get("hooks").and_then(Value::as_array).into_iter().flatten() {
                    if is_ours(h) {
                        count += 1;
                        if h.get("url").and_then(Value::as_str) == Some(hook_url(port).as_str()) {
                            port_ok = true;
                        }
                    }
                }
            }
        }
    }
    Status { installed: count > 0, count, port_ok }
}

pub fn read_settings(path: &Path) -> Result<Value, String> {
    let text = match fs::read_to_string(path) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(json!({})),
        Err(e) => return Err(e.to_string()),
    };
    if text.trim().is_empty() {
        return Ok(json!({}));
    }
    let v: Value = serde_json::from_str(&text).map_err(|e| format!("settings.json: {e}"))?;
    if !v.is_object() {
        return Err("settings.json is not a JSON object".into());
    }
    Ok(v)
}

fn write_settings(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    if path.exists() {
        fs::copy(path, path.with_extension("json.mascot.bak")).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.mascot.tmp");
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())? + "\n";
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

pub fn install(path: &Path, port: u16) -> Result<Status, String> {
    let next = add_hooks(&read_settings(path)?, port);
    write_settings(path, &next)?;
    Ok(status(&next, port))
}

pub fn uninstall(path: &Path, port: u16) -> Result<Status, String> {
    if !path.exists() {
        return Ok(Status { installed: false, count: 0, port_ok: false });
    }
    let next = remove_hooks(&read_settings(path)?);
    write_settings(path, &next)?;
    Ok(status(&next, port))
}

pub fn check(path: &Path, port: u16) -> Status {
    read_settings(path).map(|v| status(&v, port)).unwrap_or(Status { installed: false, count: 0, port_ok: false })
}
