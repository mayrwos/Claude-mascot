#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Bounds {
    pub min_x: f64,
    pub max_x: f64,
    pub min_y: f64,
    pub floor_y: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Body {
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Event {
    Fall,
    Bounce(f64),
    Land(f64),
    Drop,
}

impl Event {
    pub fn to_json(self) -> serde_json::Value {
        match self {
            Event::Fall => serde_json::json!({ "type": "fall" }),
            Event::Bounce(p) => serde_json::json!({ "type": "bounce", "power": p }),
            Event::Land(p) => serde_json::json!({ "type": "land", "power": p }),
            Event::Drop => serde_json::json!({ "type": "drop" }),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Sim {
    pub body: Body,
    pub gravity: bool,
    pub k: f64,
    pub frames: u32,
}

pub enum Start {
    Immediate(Body, Event),
    Simulate(Sim, Option<Event>),
}

pub fn clamp_body(b: Body, bounds: &Bounds) -> Body {
    Body {
        x: b.x.clamp(bounds.min_x, bounds.max_x.max(bounds.min_x)),
        y: b.y.clamp(bounds.min_y, bounds.floor_y.max(bounds.min_y)),
        ..b
    }
}

pub fn start(body: Body, bounds: &Bounds, gravity: bool, k: f64) -> Start {
    let speed = body.vx.hypot(body.vy);
    if speed < 2.0 * k && (!gravity || body.y >= bounds.floor_y - k) {
        let mut b = clamp_body(body, bounds);
        if gravity {
            b.y = bounds.floor_y;
        }
        return Start::Immediate(Body { vx: 0.0, vy: 0.0, ..b }, Event::Drop);
    }
    let max = 70.0 * k;
    let mut b = body;
    if speed > max {
        b.vx *= max / speed;
        b.vy *= max / speed;
    }
    let first = if gravity { Some(Event::Fall) } else { None };
    Start::Simulate(Sim { body: b, gravity, k, frames: 0 }, first)
}

impl Sim {
    pub fn step(&mut self, bounds: &Bounds) -> (Option<Event>, bool) {
        let k = self.k;
        let b = &mut self.body;
        self.frames += 1;
        if self.gravity {
            b.vy += 1.15 * k;
        } else {
            b.vx *= 0.9;
            b.vy *= 0.9;
        }
        b.x += b.vx;
        b.y += b.vy;
        if b.x < bounds.min_x {
            b.x = bounds.min_x;
            b.vx = -b.vx * 0.45;
        }
        if b.x > bounds.max_x {
            b.x = bounds.max_x;
            b.vx = -b.vx * 0.45;
        }
        if b.y < bounds.min_y {
            b.y = bounds.min_y;
            b.vy = -b.vy * 0.4;
        }
        let mut event = None;
        let mut done = false;
        if b.y >= bounds.floor_y {
            b.y = bounds.floor_y;
            if self.gravity && b.vy > 7.0 * k {
                event = Some(Event::Bounce(b.vy / k));
                b.vy = -b.vy * 0.32;
                b.vx *= 0.7;
            } else {
                let power = b.vy / k;
                b.vy = 0.0;
                if self.gravity {
                    b.vx *= 0.6;
                    if b.vx.abs() < 1.5 * k {
                        event = Some(Event::Land(power));
                        done = true;
                    }
                }
            }
        }
        if !self.gravity && b.vx.hypot(b.vy) < 0.6 * k {
            event = Some(Event::Drop);
            done = true;
        }
        if self.frames > 900 && !done {
            event = Some(Event::Land(0.0));
            done = true;
        }
        (event, done)
    }
}

pub fn throw_velocity(samples: &[(f64, f64, u64)], now: u64) -> (f64, f64) {
    let recent: Vec<&(f64, f64, u64)> = samples.iter().filter(|s| now.saturating_sub(s.2) < 110).collect();
    if recent.len() < 2 {
        return (0.0, 0.0);
    }
    let a = recent[0];
    let b = recent[recent.len() - 1];
    let dt = (b.2.saturating_sub(a.2)).max(1) as f64;
    ((b.0 - a.0) / dt * 16.0, (b.1 - a.1) / dt * 16.0)
}

#[derive(Debug, Default)]
pub struct ShakeDetector {
    dir: i8,
    flips: Vec<u64>,
}

impl ShakeDetector {
    pub fn push(&mut self, vx: f64, now: u64) -> bool {
        if vx.abs() > 1.1 {
            let dir = if vx > 0.0 { 1 } else { -1 };
            if self.dir != 0 && dir != self.dir {
                self.flips.push(now);
            }
            self.dir = dir;
        }
        self.flips.retain(|t| now.saturating_sub(*t) < 1300);
        if self.flips.len() >= 4 {
            self.flips.clear();
            return true;
        }
        false
    }
}
