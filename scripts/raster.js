function parseColor(c) {
  c = String(c);
  if (c[0] === '#') {
    let h = c.slice(1);
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = /hsl\((\d+),(\d+)%,(\d+)%\)/.exec(c.replace(/\s/g, ''));
  if (m) {
    const h = +m[1] / 360;
    const s = +m[2] / 100;
    const l = +m[3] / 100;
    const f = (n) => {
      const k = (n + h * 12) % 12;
      const a = s * Math.min(l, 1 - l);
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  }
  return [0, 0, 0];
}

class Context {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '#000';
    this.globalAlpha = 1;
    this.imageSmoothingEnabled = true;
    this.calls = 0;
  }
  get px() {
    return this.canvas.px;
  }
  fillRect(x, y, w, h) {
    this.calls++;
    const [r, g, b] = parseColor(this.fillStyle);
    const a = this.globalAlpha;
    const W = this.canvas.width;
    const H = this.canvas.height;
    for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) {
        const i = (yy * W + xx) * 4;
        const da = this.px[i + 3] / 255;
        const oa = a + da * (1 - a);
        if (oa <= 0) continue;
        this.px[i] = (r * a + this.px[i] * da * (1 - a)) / oa;
        this.px[i + 1] = (g * a + this.px[i + 1] * da * (1 - a)) / oa;
        this.px[i + 2] = (b * a + this.px[i + 2] * da * (1 - a)) / oa;
        this.px[i + 3] = oa * 255;
      }
    }
  }
  clearRect(x, y, w, h) {
    const W = this.canvas.width;
    for (let yy = Math.max(0, y); yy < Math.min(this.canvas.height, y + h); yy++) {
      this.px.fill(0, (yy * W + Math.max(0, x)) * 4, (yy * W + Math.min(W, x + w)) * 4);
    }
  }
  drawImage(src, dx, dy, dw, dh) {
    dw = dw == null ? src.width : dw;
    dh = dh == null ? src.height : dh;
    const W = this.canvas.width;
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const sx = Math.floor((x * src.width) / dw);
        const sy = Math.floor((y * src.height) / dh);
        const si = (sy * src.width + sx) * 4;
        if (!src.px[si + 3]) continue;
        const tx = dx + x;
        const ty = dy + y;
        if (tx < 0 || ty < 0 || tx >= W || ty >= this.canvas.height) continue;
        const di = (ty * W + tx) * 4;
        const a = src.px[si + 3] / 255;
        const da = this.px[di + 3] / 255;
        const oa = a + da * (1 - a);
        for (let k = 0; k < 3; k++) this.px[di + k] = (src.px[si + k] * a + this.px[di + k] * da * (1 - a)) / oa;
        this.px[di + 3] = oa * 255;
      }
    }
  }
  createImageData(w, h) {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  putImageData(img, x, y) {
    const W = this.canvas.width;
    for (let yy = 0; yy < img.height; yy++) {
      for (let xx = 0; xx < img.width; xx++) {
        const tx = x + xx;
        const ty = y + yy;
        if (tx < 0 || ty < 0 || tx >= W || ty >= this.canvas.height) continue;
        const si = (yy * img.width + xx) * 4;
        const di = (ty * W + tx) * 4;
        for (let k = 0; k < 4; k++) this.px[di + k] = img.data[si + k];
      }
    }
  }
  getImageData(x, y, w, h) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const si = ((y + yy) * this.canvas.width + (x + xx)) * 4;
        data.set(this.px.subarray(si, si + 4), (yy * w + xx) * 4);
      }
    }
    return { data, width: w, height: h };
  }
}

class Canvas {
  constructor(w, h) {
    this.style = {};
    this.resize(w, h);
  }
  resize(w, h) {
    this._w = w;
    this._h = h;
    this.px = new Uint8ClampedArray(w * h * 4);
  }
  get width() {
    return this._w;
  }
  set width(v) {
    this.resize(v, this._h);
  }
  get height() {
    return this._h;
  }
  set height(v) {
    this.resize(this._w, v);
  }
  getContext() {
    if (!this.ctx) this.ctx = new Context(this);
    return this.ctx;
  }
  alphaAt(x, y) {
    return this.px[(y * this._w + x) * 4 + 3];
  }
  colorAt(x, y) {
    const i = (y * this._w + x) * 4;
    return '#' + [0, 1, 2].map((k) => this.px[i + k].toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  bbox() {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < this._h; y++) {
      for (let x = 0; x < this._w; x++) {
        if (this.alphaAt(x, y)) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  count(color) {
    let n = 0;
    for (let y = 0; y < this._h; y++) for (let x = 0; x < this._w; x++) if (this.alphaAt(x, y) && this.colorAt(x, y) === color) n++;
    return n;
  }
}

module.exports = { Canvas, Context, parseColor };
