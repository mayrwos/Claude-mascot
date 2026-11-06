use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

use crate::layout;

pub const HATS: [&str; 7] = ["auto", "none", "party", "crown", "santa", "beanie", "wizard"];
pub const TARGETS: [&str; 4] = ["auto", "app", "code", "web"];
pub const LANGS: [&str; 3] = ["auto", "ru", "en"];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub version: u32,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub scale: f64,
    pub always_on_top: bool,
    pub gravity: bool,
    pub wander: bool,
    pub speech: bool,
    pub sounds: bool,
    pub hat: String,
    pub ultra: bool,
    pub open_target: String,
    pub code_dir: String,
    pub lang: String,
    pub port: u16,
    pub show_on_attention: bool,
    pub sleep_after_min: u32,
    pub pets: u64,
    pub first_run: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            version: 2,
            x: None,
            y: None,
            scale: layout::DEFAULT_SCALE,
            always_on_top: true,
            gravity: false,
            wander: false,
            speech: true,
            sounds: true,
            hat: "auto".into(),
            ultra: false,
            open_target: "auto".into(),
            code_dir: String::new(),
            lang: "auto".into(),
            port: 47821,
            show_on_attention: false,
            sleep_after_min: 5,
            pets: 0,
            first_run: true,
        }
    }
}

fn one_of(value: &str, allowed: &[&str], fallback: &str) -> String {
    if allowed.contains(&value) {
        value.to_string()
    } else {
        fallback.to_string()
    }
}

impl Settings {
    pub fn sanitized(mut self) -> Self {
        let d = Settings::default();
        self.version = d.version;
        if !layout::SCALES.contains(&self.scale) {
            self.scale = d.scale;
        }
        self.hat = one_of(&self.hat, &HATS, &d.hat);
        self.open_target = one_of(&self.open_target, &TARGETS, &d.open_target);
        self.lang = one_of(&self.lang, &LANGS, &d.lang);
        if self.port <= 1024 {
            self.port = d.port;
        }
        if self.sleep_after_min == 0 || self.sleep_after_min > 24 * 60 {
            self.sleep_after_min = d.sleep_after_min;
        }
        self
    }

    pub fn from_json(text: &str) -> Option<Settings> {
        let raw: Value = serde_json::from_str(text).ok()?;
        let obj = raw.as_object()?;
        let mut s = Settings::default();
        let defaults = serde_json::to_value(&s).ok()?;
        let mut merged = defaults.as_object()?.clone();
        for (k, v) in obj {
            if let Some(d) = merged.get(k) {
                let same_kind = match (d, v) {
                    (Value::Null, Value::Number(_)) | (Value::Number(_), Value::Null) => true,
                    (Value::Number(_), Value::Number(_)) => true,
                    (a, b) => std::mem::discriminant(a) == std::mem::discriminant(b),
                };
                if same_kind {
                    merged.insert(k.clone(), v.clone());
                }
            }
        }
        if let Ok(parsed) = serde_json::from_value::<Settings>(Value::Object(merged)) {
            s = parsed;
        }
        if !obj.contains_key("version") && [3.0, 4.0, 5.0, 6.0].contains(&s.scale) {
            s.scale /= 2.0;
        }
        Some(s.sanitized())
    }

    pub fn load(path: &Path) -> Option<Settings> {
        fs::read_to_string(path).ok().and_then(|t| Settings::from_json(&t))
    }

    pub fn load_or_migrate(path: &Path, legacy: &[PathBuf]) -> Settings {
        if let Some(s) = Settings::load(path) {
            return s;
        }
        for old in legacy {
            if let Some(mut s) = Settings::load(old) {
                s.x = None;
                s.y = None;
                return s;
            }
        }
        Settings::default()
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_string_pretty(self).unwrap_or_default())?;
        fs::rename(&tmp, path)
    }

    pub fn set(&mut self, key: &str, value: &Value) -> bool {
        let before = self.clone();
        match (key, value) {
            ("scale", Value::Number(n)) => self.scale = n.as_f64().unwrap_or(self.scale),
            ("alwaysOnTop", Value::Bool(b)) => self.always_on_top = *b,
            ("gravity", Value::Bool(b)) => self.gravity = *b,
            ("wander", Value::Bool(b)) => self.wander = *b,
            ("speech", Value::Bool(b)) => self.speech = *b,
            ("sounds", Value::Bool(b)) => self.sounds = *b,
            ("ultra", Value::Bool(b)) => self.ultra = *b,
            ("showOnAttention", Value::Bool(b)) => self.show_on_attention = *b,
            ("hat", Value::String(s)) => self.hat = s.clone(),
            ("openTarget", Value::String(s)) => self.open_target = s.clone(),
            ("lang", Value::String(s)) => self.lang = s.clone(),
            ("codeDir", Value::String(s)) => self.code_dir = s.clone(),
            ("pets", Value::Number(n)) => self.pets = n.as_u64().unwrap_or(self.pets),
            ("port", Value::Number(n)) => self.port = n.as_u64().and_then(|p| u16::try_from(p).ok()).unwrap_or(self.port),
            _ => return false,
        }
        let after = self.clone().sanitized();
        if after != *self {
            *self = before;
            return false;
        }
        *self != before
    }
}
