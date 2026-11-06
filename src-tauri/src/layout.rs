pub const GRID_W: f64 = 160.0;
pub const GRID_H: f64 = 120.0;
pub const GROUND: f64 = 108.0;
pub const CX: f64 = 80.0;
pub const BODY_HALF: f64 = 32.0;
pub const BODY_HEIGHT: f64 = 40.0;
pub const TOP_AREA: f64 = 112.0;
pub const MIN_WIDTH: f64 = 300.0;
pub const SCALES: [f64; 4] = [1.5, 2.0, 2.5, 3.0];
pub const DEFAULT_SCALE: f64 = 2.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BodyBox {
    pub left: f64,
    pub right: f64,
    pub top: f64,
    pub feet: f64,
    pub width: f64,
    pub height: f64,
}

pub fn window_size(scale: f64) -> Size {
    Size {
        width: (GRID_W * scale).max(MIN_WIDTH).round(),
        height: (GRID_H * scale + TOP_AREA).round(),
    }
}

pub fn body_box(scale: f64) -> BodyBox {
    let size = window_size(scale);
    let canvas_left = (size.width - GRID_W * scale) / 2.0;
    BodyBox {
        left: (canvas_left + (CX - BODY_HALF) * scale).round(),
        right: (canvas_left + (CX + BODY_HALF) * scale).round(),
        top: (TOP_AREA + (GROUND - BODY_HEIGHT - 4.0) * scale).round(),
        feet: (TOP_AREA + GROUND * scale).round(),
        width: size.width,
        height: size.height,
    }
}
