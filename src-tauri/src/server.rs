use std::io::Read;
use std::sync::Arc;
use std::thread::JoinHandle;

use serde_json::Value;
use tiny_http::{Header, Request, Response, Server};

use crate::events::{self, Event};

pub const MAX_BODY: usize = 8 * 1024 * 1024;
pub const ACTIONS: [&str; 11] = ["pet", "jump", "dance", "coffee", "wave", "sleep", "wake", "celebrate", "laptop", "tip", "say"];

#[derive(Debug, Clone, PartialEq)]
pub enum Incoming {
    Hook(Event, Option<String>),
    Say(String),
    Action(String),
}

pub struct HookServer {
    server: Arc<Server>,
    thread: Option<JoinHandle<()>>,
    pub port: u16,
}

impl HookServer {
    pub fn stop(mut self) {
        self.server.unblock();
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

fn strip_port(host: &str) -> &str {
    if let Some(rest) = host.strip_prefix('[') {
        return rest.split(']').next().unwrap_or("");
    }
    host.split(':').next().unwrap_or("")
}

pub fn is_loopback_host(host: &str) -> bool {
    matches!(strip_port(&host.to_ascii_lowercase()), "127.0.0.1" | "localhost" | "::1")
}

pub fn is_loopback_origin(origin: &str) -> bool {
    let o = origin.to_ascii_lowercase();
    let rest = o.strip_prefix("http://").or_else(|| o.strip_prefix("https://"));
    rest.is_some_and(|r| !r.contains('/') && is_loopback_host(r))
}

pub fn from_browser(headers: &[(String, String)]) -> bool {
    for (k, v) in headers {
        let k = k.to_ascii_lowercase();
        if k.starts_with("sec-fetch-") {
            return true;
        }
        if k == "origin" && !is_loopback_origin(v) {
            return true;
        }
    }
    false
}

fn header_pairs(req: &Request) -> Vec<(String, String)> {
    req.headers().iter().map(|h| (h.field.as_str().as_str().to_string(), h.value.as_str().to_string())).collect()
}

pub fn route(method: &str, url: &str, headers: &[(String, String)], body: &[u8]) -> (u16, Option<String>, Option<Incoming>) {
    let host = headers.iter().find(|(k, _)| k.eq_ignore_ascii_case("host")).map(|(_, v)| v.as_str()).unwrap_or("");
    if !is_loopback_host(host) || from_browser(headers) {
        return (403, None, None);
    }
    let path = url.split('?').next().unwrap_or("");
    if method == "GET" && path == "/health" {
        let v = serde_json::json!({ "ok": true, "app": "claude-mascot", "version": env!("CARGO_PKG_VERSION") });
        return (200, Some(v.to_string()), None);
    }
    if method != "POST" || !["/hook", "/say", "/action"].contains(&path) {
        return (404, None, None);
    }
    if body.len() > MAX_BODY {
        return (200, None, None);
    }
    let Ok(json) = serde_json::from_slice::<Value>(body) else { return (200, None, None) };
    let msg = match path {
        "/hook" => events::normalize(&json).map(|ev| Incoming::Hook(ev, json.get("cwd").and_then(Value::as_str).map(String::from))),
        "/say" => json.get("text").and_then(Value::as_str).filter(|t| !t.trim().is_empty()).map(|t| Incoming::Say(t.chars().take(200).collect())),
        "/action" => json.get("name").and_then(Value::as_str).filter(|n| ACTIONS.contains(n)).map(|n| Incoming::Action(n.to_string())),
        _ => None,
    };
    (200, None, msg)
}

fn handle(mut req: Request, on: &(dyn Fn(Incoming) + Send + Sync)) {
    let headers = header_pairs(&req);
    let method = req.method().as_str().to_string();
    let url = req.url().to_string();
    let mut body = Vec::new();
    let _ = req.as_reader().take(MAX_BODY as u64 + 1).read_to_end(&mut body);
    let (status, text, msg) = route(&method, &url, &headers, &body);
    let response = match text {
        Some(t) => Response::from_string(t)
            .with_status_code(status)
            .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).expect("static header")),
        None => Response::from_string(String::new()).with_status_code(status),
    };
    let _ = req.respond(response);
    if let Some(m) = msg {
        on(m);
    }
}

pub fn start(port: u16, on: impl Fn(Incoming) + Send + Sync + 'static) -> Result<HookServer, String> {
    let server = Arc::new(Server::http(("127.0.0.1", port)).map_err(|e| e.to_string())?);
    let s2 = server.clone();
    let thread = std::thread::Builder::new()
        .name("hook-server".into())
        .spawn(move || {
            for req in s2.incoming_requests() {
                handle(req, &on);
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(HookServer { server, thread: Some(thread), port })
}
