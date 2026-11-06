const fs = require('fs');
const path = require('path');
const A = require('../src/renderer/art.js');

const OUT = path.join(__dirname, '..', 'src-tauri', 'icons');

function parseColor(c) {
  if (c.startsWith('#')) {
    const h = c.slice(1);
    const v = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), 255];
  }
  const m = /hsl\((\d+),(\d+)%,(\d+)%\)/.exec(c.replace(/\s/g, ''));
  if (m) {
    const h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100;
    const f = (n) => {
      const k = (n + h * 12) % 12;
      const a = s * Math.min(l, 1 - l);
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4), 255];
  }
  return [0, 0, 0, 255];
}

class Raster {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Uint8ClampedArray(w * h * 4);
    this.fillStyle = '#000';
    this.globalAlpha = 1;
  }
  fillRect(x, y, w, h) {
    const [r, g, b] = parseColor(this.fillStyle);
    const a = this.globalAlpha;
    for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(this.w, x + w); xx++) blend(this.px, (yy * this.w + xx) * 4, r, g, b, a);
    }
  }
}

function blend(px, i, r, g, b, a) {
  const da = px[i + 3] / 255;
  const oa = a + da * (1 - a);
  if (oa <= 0) return;
  px[i] = (r * a + px[i] * da * (1 - a)) / oa;
  px[i + 1] = (g * a + px[i + 1] * da * (1 - a)) / oa;
  px[i + 2] = (b * a + px[i + 2] * da * (1 - a)) / oa;
  px[i + 3] = oa * 255;
}

const { png } = require('./png');

function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  const blobs = [];
  images.forEach((img, i) => {
    const data = png(img);
    const e = 6 + i * 16;
    head[e] = img.w >= 256 ? 0 : img.w;
    head[e + 1] = img.h >= 256 ? 0 : img.h;
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += data.length;
    blobs.push(data);
  });
  return Buffer.concat([head, ...blobs]);
}

function upscale(src, k, dst, ox, oy) {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4;
      if (!src.px[i + 3]) continue;
      for (let yy = 0; yy < k; yy++) {
        for (let xx = 0; xx < k; xx++) {
          const X = ox + x * k + xx;
          const Y = oy + y * k + yy;
          if (X < 0 || Y < 0 || X >= dst.w || Y >= dst.h) continue;
          blend(dst.px, (Y * dst.w + X) * 4, src.px[i], src.px[i + 1], src.px[i + 2], src.px[i + 3] / 255);
        }
      }
    }
  }
}

function roundedSquare(img, color, radius) {
  const [r, g, b] = parseColor(color);
  const n = img.w;
  const S = 4;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let cover = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = x + (sx + 0.5) / S;
          const py = y + (sy + 0.5) / S;
          const dx = Math.max(radius - px, 0, px - (n - radius));
          const dy = Math.max(radius - py, 0, py - (n - radius));
          if (dx * dx + dy * dy <= radius * radius) cover++;
        }
      }
      if (cover) blend(img.px, (y * n + x) * 4, r, g, b, cover / (S * S));
    }
  }
}

function appIcon(size) {
  const img = new Raster(size, size);
  roundedSquare(img, '#F0EEE6', size * 0.22);
  if (size < 64) {
    const u = size < 32 ? 1 : 2;
    const mini = new Raster(16 * u, 11 * u);
    A.drawMini(mini, 8 * u, 10 * u + 0.5, { u });
    const k = Math.max(1, Math.floor((size * 0.9) / (16 * u)));
    upscale(mini, k, img, Math.round((size - 16 * u * k) / 2), Math.round((size - 11 * u * k) / 2));
    return img;
  }
  const sprite = new Raster(64, 41);
  A.drawClawd(sprite, { cx: 32, ground: 40, eyes: 'open' });
  const k = Math.max(1, Math.floor((size * 0.8) / 64));
  upscale(sprite, k, img, Math.round((size - 64 * k) / 2), Math.round((size - 40 * k) / 2));
  return img;
}

function trayIcon(size) {
  const u = size >= 32 ? 2 : 1;
  const base = new Raster(16 * u, 16 * u);
  A.drawMini(base, 8 * u, 13 * u, { u });
  const k = Math.max(1, Math.floor(size / (16 * u)));
  const img = new Raster(size, size);
  upscale(base, k, img, Math.round((size - 16 * u * k) / 2), Math.round((size - 16 * u * k) / 2));
  return img;
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon.png'), png(appIcon(512)));
fs.writeFileSync(path.join(OUT, '32x32.png'), png(appIcon(32)));
fs.writeFileSync(path.join(OUT, '128x128.png'), png(appIcon(128)));
fs.writeFileSync(path.join(OUT, '128x128@2x.png'), png(appIcon(256)));
fs.writeFileSync(path.join(OUT, 'icon.ico'), ico([16, 24, 32, 48, 64, 128, 256].map(appIcon)));
fs.writeFileSync(path.join(OUT, 'tray.png'), png(trayIcon(32)));
console.log('icons written to', OUT);
