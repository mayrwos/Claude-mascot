(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.MascotLayout = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const L = {
    GRID_W: 160,
    GRID_H: 120,
    GROUND: 108,
    CX: 80,
    BODY_HALF: 32,
    BODY_HEIGHT: 40,
    TOP_AREA: 112,
    MIN_WIDTH: 300,
    SCALES: [1.5, 2, 2.5, 3],
    DEFAULT_SCALE: 2,
  };

  L.windowSize = function (scale) {
    return {
      width: Math.round(Math.max(L.GRID_W * scale, L.MIN_WIDTH)),
      height: Math.round(L.GRID_H * scale + L.TOP_AREA),
    };
  };

  L.bodyBox = function (scale) {
    const size = L.windowSize(scale);
    const canvasLeft = (size.width - L.GRID_W * scale) / 2;
    return {
      left: Math.round(canvasLeft + (L.CX - L.BODY_HALF) * scale),
      right: Math.round(canvasLeft + (L.CX + L.BODY_HALF) * scale),
      top: Math.round(L.TOP_AREA + (L.GROUND - L.BODY_HEIGHT - 4) * scale),
      feet: Math.round(L.TOP_AREA + L.GROUND * scale),
      width: size.width,
      height: size.height,
    };
  };

  return L;
});
