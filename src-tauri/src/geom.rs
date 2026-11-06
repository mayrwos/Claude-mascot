use crate::layout::BodyBox;
use crate::physics::Bounds;

pub const BUBBLE_ROOM: f64 = 100.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Area {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Area {
    pub fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x <= self.x + self.w && y >= self.y && y <= self.y + self.h
    }
}

pub fn body_center(x: f64, y: f64, bb: &BodyBox, k: f64) -> (f64, f64) {
    (x + (bb.left + bb.right) / 2.0 * k, y + (bb.top + bb.feet) / 2.0 * k)
}

pub fn area_for(areas: &[Area], cx: f64, cy: f64) -> Option<Area> {
    areas.iter().find(|a| a.contains(cx, cy)).copied().or_else(|| {
        areas.iter().copied().min_by(|a, b| {
            let d = |r: &Area| (r.x + r.w / 2.0 - cx).hypot(r.y + r.h / 2.0 - cy);
            d(a).total_cmp(&d(b))
        })
    })
}

pub fn bounds_for(area: &Area, bb: &BodyBox, k: f64) -> Bounds {
    Bounds {
        min_x: area.x - bb.left * k,
        max_x: area.x + area.w - bb.right * k,
        min_y: area.y - (bb.top - BUBBLE_ROOM).max(0.0) * k,
        floor_y: area.y + area.h - bb.feet * k,
    }
}

pub fn clamp_into(b: &Bounds, x: f64, y: f64) -> (f64, f64) {
    (x.clamp(b.min_x, b.max_x.max(b.min_x)), y.clamp(b.min_y, b.floor_y.max(b.min_y)))
}

#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
pub struct Viewport {
    pub left: f64,
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
}

pub fn viewport(area: &Area, win_x: f64, win_y: f64, k: f64, width: f64, height: f64) -> Viewport {
    let l = |v: f64| (v / k).round();
    Viewport {
        left: l(area.x - win_x).clamp(0.0, width),
        top: l(area.y - win_y).clamp(0.0, height),
        right: l(area.x + area.w - win_x).clamp(0.0, width),
        bottom: l(area.y + area.h - win_y).clamp(0.0, height),
    }
}

pub fn hit(regions: &[[f64; 4]], x: f64, y: f64) -> bool {
    regions.iter().any(|r| x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3])
}
