use serde_json::Value;
use std::sync::OnceLock;

static STRINGS: OnceLock<Value> = OnceLock::new();

fn all() -> &'static Value {
    STRINGS.get_or_init(|| serde_json::from_str(include_str!("strings.json")).expect("valid strings.json"))
}

pub fn resolve_lang(pref: &str, locale: &str) -> &'static str {
    match pref {
        "ru" => "ru",
        "en" => "en",
        _ => {
            let l = locale.to_ascii_lowercase();
            if ["ru", "be", "kk"].iter().any(|p| l == *p || l.starts_with(&format!("{p}-")) || l.starts_with(&format!("{p}_"))) {
                "ru"
            } else {
                "en"
            }
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Tr {
    pub lang: &'static str,
}

impl Tr {
    pub fn new(pref: &str, locale: &str) -> Tr {
        Tr { lang: resolve_lang(pref, locale) }
    }

    fn lookup(&self, lang: &str, path: &str) -> Option<&'static Value> {
        let mut v = all().get(lang)?;
        for part in path.split('.') {
            v = v.get(part)?;
        }
        Some(v)
    }

    pub fn get(&self, path: &str) -> String {
        self.lookup(self.lang, path)
            .or_else(|| self.lookup("en", path))
            .and_then(Value::as_str)
            .map(String::from)
            .unwrap_or_else(|| path.to_string())
    }

    pub fn list(&self, path: &str) -> Vec<String> {
        self.lookup(self.lang, path)
            .or_else(|| self.lookup("en", path))
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(Value::as_str).map(String::from).collect())
            .unwrap_or_default()
    }

    pub fn fmt(&self, path: &str, vars: &[(&str, &str)]) -> String {
        let mut s = self.get(path);
        for (k, v) in vars {
            s = s.replace(&format!("{{{k}}}"), v);
        }
        s
    }
}
