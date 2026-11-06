const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const Engine = require('../src/renderer/engine.js');
const L = require('../src/shared/layout.js');
const { Canvas } = require('./raster');
const { png } = require('./png');

const OUT = path.join(__dirname, '..', 'docs', 'gallery');
const SCALE = 2;
const STEP = 40;
const BG = [31, 30, 29];
const CROP = { x: 8, y: 14, w: 144, h: 106 };

const idle = { state: 'idle', ultra: false, helpers: 0, helperTypes: [] };
const claude = (state, more) => Object.assign({}, idle, { state }, more);

const TILES = {
  think: { dur: 3200, run: (e) => e.setClaude(claude('think')) },
  work: { dur: 3600, run: (e) => e.setClaude(claude('work')) },
  helpers: {
    dur: 4400,
    run: (e) => e.setClaude(claude('work', { helpers: 2, helperTypes: ['Explore', 'Plan'] })),
  },
  wait: {
    dur: 3200,
    run: (e) => {
      e.setClaude(claude('wait'));
      e.claudeEffect('alert');
    },
  },
  done: { dur: 3400, run: (e) => e.claudeEffect('celebrate') },
  oops: { dur: 2400, run: (e, at) => at(200, () => e.claudeEffect('oops')) },
  ultra: {
    dur: 3600,
    run: (e) => {
      e.setSettings({ ultra: true });
      e.setClaude(claude('work', { ultra: true }));
    },
  },
  love: {
    dur: 3000,
    run: (e, at) => {
      at(150, () => e.click());
      [1300, 1420, 1540, 1660, 1780, 1900].forEach((ms) => at(ms, () => e.click()));
    },
  },
  jump: { dur: 2200, run: (e, at) => at(200, () => e.dblclick()) },
  dance: { dur: 3600, run: (e) => e.startAction('dance', null, true) },
  coffee: { dur: 4200, run: (e) => e.startAction('coffee', null, true) },
  sleep: { pre: 2600, dur: 3600, run: (e) => e.command('sleep') },
  grab: {
    dur: 2600,
    run: (e, at) => {
      e.dragStart();
      e.physics({ type: 'swing', vx: 26 });
      at(500, () => e.physics({ type: 'swing', vx: -22 }));
      at(1000, () => e.physics({ type: 'swing', vx: 0 }));
    },
  },
  throw: {
    dur: 2400,
    run: (e, at) => {
      e.physics({ type: 'fall' });
      [4, 9, 14, 19, 24].forEach((vy, i) => at(i * 80, () => e.physics({ type: 'air', vy })));
      at(420, () => e.physics({ type: 'land', power: 16 }));
    },
  },
  hat: {
    dur: 2400,
    run: (e, at) => {
      e.setSettings({ hat: 'wizard' });
      at(300, () => e.dblclick());
    },
  },
};

function render(name) {
  const tile = TILES[name];
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
  engine.blinkAt = t + 1500;
  for (let i = 0; i < 40; i++) engine.frame((t += 40));
  engine.blinkAt = t + 1100;

  const timers = [];
  const at = (ms, fn) => timers.push({ at: t + ms, fn });
  tile.run(engine, at);

  const advance = (ms) => {
    const end = t + ms;
    while (t < end) {
      t += 20;
      for (const tm of timers.filter((x) => x.at <= t)) tm.fn();
      for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= t) timers.splice(i, 1);
      engine.nextIdle = Infinity;
      engine.frame(t);
    }
  };
  if (tile.pre) advance(tile.pre);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mascot-gallery-'));
  const w = CROP.w * SCALE;
  const h = CROP.h * SCALE;
  const frames = Math.round(tile.dur / STEP);
  for (let f = 0; f < frames; f++) {
    advance(STEP);
    engine.lastSig = '';
    engine.render(engine.now);
    const src = canvas.px;
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = ((CROP.y + ((y / SCALE) | 0)) * L.GRID_W + CROP.x + ((x / SCALE) | 0)) * 4;
        const a = src[si + 3] / 255;
        const di = (y * w + x) * 4;
        for (let k = 0; k < 3; k++) out[di + k] = Math.round(src[si + k] * a + BG[k] * (1 - a));
        out[di + 3] = 255;
      }
    }
    fs.writeFileSync(path.join(dir, String(f).padStart(4, '0') + '.png'), png({ w, h, px: out }));
  }

  fs.mkdirSync(OUT, { recursive: true });
  const gif = path.join(OUT, name + '.gif');
  const pal = path.join(dir, 'pal.png');
  const input = ['-framerate', String(1000 / STEP), '-i', path.join(dir, '%04d.png')];
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...input, '-vf', 'palettegen=max_colors=96:stats_mode=full', pal]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...input, '-i', pal, '-lavfi', 'paletteuse=dither=none:diff_mode=rectangle', '-loop', '0', gif]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(name.padEnd(8), Math.round(fs.statSync(gif).size / 1024) + ' KB');
}

const names = process.argv.slice(2);
for (const n of names.length ? names : Object.keys(TILES)) {
  if (!TILES[n]) {
    console.error('unknown tile', n, '- tiles:', Object.keys(TILES).join(' '));
    process.exit(1);
  }
  render(n);
}
