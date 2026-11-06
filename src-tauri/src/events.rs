use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub event: String,
    pub session: String,
    pub project: String,
    pub at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_use_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ultra: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notification: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interrupt: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

pub fn short(v: Option<&Value>, max: usize) -> String {
    let raw = match v {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        _ => String::new(),
    };
    let mut cleaned = String::with_capacity(raw.len());
    let mut last_space = false;
    for c in raw.chars() {
        let c = if c.is_control() { ' ' } else { c };
        if c == ' ' && last_space {
            continue;
        }
        last_space = c == ' ';
        cleaned.push(c);
    }
    let cleaned = cleaned.trim();
    if max > 0 && cleaned.chars().count() > max {
        let mut s: String = cleaned.chars().take(max - 1).collect();
        s.push('…');
        s
    } else {
        cleaned.to_string()
    }
}

pub fn base_name(p: &str) -> &str {
    p.split(['/', '\\']).filter(|s| !s.is_empty()).last().unwrap_or("")
}

pub fn host_name(url: &str) -> String {
    let rest = match url.find("://") {
        Some(i) => &url[i + 3..],
        None => return String::new(),
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host = authority.rsplit('@').next().unwrap_or("");
    if let Some(stripped) = host.strip_prefix('[') {
        return stripped.split(']').next().unwrap_or("").to_lowercase();
    }
    host.split(':').next().unwrap_or("").to_lowercase()
}

fn first_words(v: Option<&Value>, n: usize, max: usize) -> String {
    let s = short(v, 0);
    let words: Vec<&str> = s.split_whitespace().take(n).collect();
    short(Some(&Value::String(words.join(" "))), max)
}

pub fn tool_target(tool: &str, input: Option<&Value>) -> String {
    let get = |k: &str| input.and_then(|i| i.get(k));
    let file = |k: &str| short(Some(&Value::String(base_name(get(k).and_then(Value::as_str).unwrap_or("")).to_string())), 40);
    match tool {
        "Read" | "Edit" | "MultiEdit" | "Write" => {
            let f = file("file_path");
            if f.is_empty() { file("path") } else { f }
        }
        "NotebookEdit" => file("notebook_path"),
        "Bash" | "PowerShell" => first_words(get("command"), 3, 32),
        "Grep" | "Glob" => short(get("pattern"), 28),
        "WebFetch" => host_name(get("url").and_then(Value::as_str).unwrap_or("")),
        "WebSearch" => short(get("query"), 32),
        "Task" | "Agent" => {
            let t = short(get("subagent_type"), 32);
            if t.is_empty() { short(get("description"), 32) } else { t }
        }
        "Skill" => {
            let t = short(get("skill"), 32);
            if t.is_empty() { short(get("command"), 32) } else { t }
        }
        _ if tool.starts_with("mcp__") => {
            let parts: Vec<&str> = tool.split("__").skip(1).collect();
            short(Some(&Value::String(parts.join(": "))), 36)
        }
        _ => String::new(),
    }
}

fn is_ultra_prompt(prompt: &str) -> bool {
    let lower = prompt.to_lowercase();
    ["ultrathink", "ultracode", "ultraplan"].iter().any(|w| {
        lower.match_indices(w).any(|(i, _)| {
            let before = lower[..i].chars().next_back();
            let after = lower[i + w.len()..].chars().next();
            let boundary = |c: Option<char>| c.map_or(true, |c| !c.is_alphanumeric() && c != '_');
            boundary(before) && boundary(after)
        })
    })
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn normalize(payload: &Value) -> Option<Event> {
    let obj = payload.as_object()?;
    let event = short(obj.get("hook_event_name"), 40);
    if event.is_empty() || !event.chars().all(|c| c.is_ascii_alphabetic()) {
        return None;
    }
    let mut out = Event {
        session: {
            let s = short(obj.get("session_id"), 80);
            if s.is_empty() { "default".into() } else { s }
        },
        project: short(Some(&Value::String(base_name(obj.get("cwd").and_then(Value::as_str).unwrap_or("")).into())), 40),
        at: now_ms(),
        ..Default::default()
    };
    if let Some(tool) = obj.get("tool_name").map(|t| short(Some(t), 60)).filter(|t| !t.is_empty()) {
        out.target = Some(tool_target(&tool, obj.get("tool_input")));
        out.tool = Some(tool);
    }
    if obj.contains_key("tool_use_id") {
        out.tool_use_id = Some(short(obj.get("tool_use_id"), 80));
    }
    match event.as_str() {
        "UserPromptSubmit" => out.ultra = Some(is_ultra_prompt(obj.get("prompt").and_then(Value::as_str).unwrap_or(""))),
        "Notification" => {
            out.notification = Some(short(obj.get("notification_type"), 40));
            out.message = Some(short(obj.get("message"), 120));
        }
        "PostToolUseFailure" => out.interrupt = Some(obj.get("is_interrupt").and_then(Value::as_bool).unwrap_or(false)),
        "SubagentStart" | "SubagentStop" => {
            out.agent_id = Some(short(obj.get("agent_id"), 80));
            out.agent_type = Some(short(obj.get("agent_type"), 40));
        }
        "SessionStart" => out.source = Some(short(obj.get("source"), 20)),
        "SessionEnd" => out.reason = Some(short(obj.get("reason"), 40)),
        _ => {}
    }
    out.event = event;
    Some(out)
}
