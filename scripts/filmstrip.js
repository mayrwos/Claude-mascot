const fs = require('fs');
const path = require('path');
const Engine = require('../src/renderer/engine.js');
const L = require('../src/shared/layout.js');
const { Canvas } = require('./raster');
const { png } = require('./png');

const SCENES = {
  idle: (e) => {},
  click: (e) => e.click(),
  jump: (e) => e.dblclick(),
  hop: (e) => e.startAction('hop'),
  celebrate: (e) => e.celebrate(),
  wave: (e) => e.startAction('wave'),
  appear: (e) => e.command('appear'),
  hide: (e) => e.command('hide'),
  grab: (e) => e.dragStart(),
  swing: (e) => {
    e.dragStart();
    e.physics({ type: 'swing', vx: 26 });
    setTimeoutLike(e, 400, () => e.physics({ type: 'swing', vx: 0 }));
  },
  fall: (e) => {
    e.physics({ type: 'fall' });
    [4, 10, 16, 22].forEach((vy, i) => setTimeoutLike(e, i * 80, () => e.physics({ type: 'air', vy })));
    setTimeoutLike(e, 360, () => e.physics({ type: 'land', power: 14 }));
  },
  work: (e) => e.setClaude({ state: 'work', ultra: false, helpers: 0 }),
  leaveWork: (e) => {
    e.setClaude({ state: 'work', ultra: false, helpers: 0 });
    setTimeoutLike(e, 500, () => e.setClaude({ state: 'idle', ultra: false, helpers: 0 }));
  },
  think: (e) => e.setClaude({ state: 'think', ultra: false, helpers: 0 }),
  wait: (e) => e.setClaude({ state: 'wait', ultra: false, helpers: 0 }),
  walk: (e) => {
    e.settings.wander = true;
    e.walk = { dir: 1, until: e.now + 99999 };
  },
  helpers: (e) => e.setClaude({ state: 'work', ultra: false, helpers: 2, helperTypes: ['Explore', 'Plan'] }),
  hatJump: (e) => {
    e.setSettings({ hat: 'party' });
    e.dblclick();
  },
  ultra: (e) => e.setSettings({ ultra: true }),
  hover: (e) => {
    for (let i = 0; i < 80; i++) setTimeoutLike(e, i * 40, () => e.hoverPing && e.hoverPing());
  },
};

function setTimeoutLike(e, ms, fn) {
  (e.__timers = e.__timers || []).push({ at: e.now + ms, fn });
}

function run(name, frames, every, scale) {
  let t = 10000;
  const canvas = new Canvas(1, 1);
  const engine = new Engine({
    canvas,
    clock: () => t,
    createCanvas: (w, h) => new Canvas(w, h),
    settings: { hat: 'none', speech: false },
    callbacks: { walk: async () => ({ blocked: false }) },
  });
  engine.setScale(1, 1);
  engine.nextIdle = Infinity;
  engine.blinkAt = Infinity;
  for (let i = 0; i < 40; i++) engine.frame((t += 40));
  SCENES[name](engine);
  const shots = [];
  for (let i = 0; i < frames; i++) {
    const end = t + every;
    while (t < end) {
      t += 20;
      for (const tm of (engine.__timers || []).filter((x) => x.at <= t)) tm.fn();
      if (engine.__timers) engine.__timers = engine.__timers.filter((x) => x.at > t);
      engine.frame(t);
    }
    engine.lastSig = '';
    engine.render(engine.now);
    shots.push(Uint8ClampedArray.from(canvas.px));
  }
  const cw = L.GRID_W;
  const ch = L.GRID_H;
  const x0 = 8;
  const y0 = 24;
  const w = cw - 16;
  const h = ch - 24;
  const out = { w: frames * w * scale + (frames - 1) * scale, h: h * scale, px: null };
  out.px = new Uint8ClampedArray(out.w * out.h * 4);
  for (let i = 0; i < out.px.length; i += 4) {
    out.px[i] = 74;
    out.px[i + 1] = 111;
    out.px[i + 2] = 156;
    out.px[i + 3] = 255;
  }
  shots.forEach((px, f) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = ((y + y0) * cw + (x + x0)) * 4;
        const a = px[si + 3] / 255;
        if (!a) continue;
        for (let yy = 0; yy < scale; yy++) {
          for (let xx = 0; xx < scale; xx++) {
            const di = ((y * scale + yy) * out.w + f * (w * scale + scale) + x * scale + xx) * 4;
            for (let k = 0; k < 3; k++) out.px[di + k] = px[si + k] * a + out.px[di + k] * (1 - a);
          }
        }
      }
    }
    if (f) for (let y = 0; y < out.h; y++) for (let k = 0; k < scale; k++) out.px.set([20, 20, 30, 255], (y * out.w + f * (w * scale + scale) - scale + k) * 4);
  });
  return out;
}

const [name, file, frames = '10', every = '40', scale = '3'] = process.argv.slice(2);
if (!name || name === 'list' || !SCENES[name]) {
  console.log('scenes:', Object.keys(SCENES).join(' '));
  process.exit(name && name !== 'list' ? 1 : 0);
}
const img = run(name, +frames, +every, +scale);
fs.writeFileSync(file || path.join(__dirname, '..', 'preview', name + '.strip.png'), png(img));
console.log('wrote', file, img.w + 'x' + img.h);
