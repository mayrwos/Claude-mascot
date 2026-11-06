(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const mod = factory(
    node ? require('./art.js') : root.ClawdArt,
    node ? require('../shared/layout.js') : root.MascotLayout
  );
  if (node) module.exports = mod;
  else root.MascotEngine = mod;
})(typeof self !== 'undefined' ? self : this, function (A, L) {
  'use strict';

  const W = L.GRID_W;
  const H = L.GRID_H;
  const GROUND = L.GROUND;
  const CX = L.CX;

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const cycle = (t, ms, seq) => seq[Math.floor(t / ms) % seq.length];

  const DUR = {
    love: 900,
    loveBurst: 1900,
    jump: 1000,
    celebrate: 2600,
    oops: 1500,
    wave: 1800,
    yawn: 1900,
    coffee: 5200,
    squish: 2400,
    dizzy: 2400,
    land: 320,
    hop: 520,
    stretch: 1500,
    glance: 1700,
    poofOut: 650,
    poofIn: 560,
    powerUp: 1300,
    dance: 6300,
    startle: 750,
    peek: 1600,
  };

  const SEATED_OK = new Set(['love', 'loveBurst', 'oops', 'squish', 'powerUp', 'poofOut', 'poofIn', 'wave', 'land']);
  const PROTECTED = new Set(['poofOut', 'poofIn']);

  const CODE_CHARS = ['<', '>', '/', '{', '}', ';', '=', '0', '1', '(', ')', '+', '*', '#'];
  const CODE_COLORS = ['#7EE787', '#79C0FF', '#FFA657', '#D2A8FF', '#F2CC60'];
  const CONFETTI = ['#FF5C7A', '#FFD34D', '#4F7DF5', '#7EE787', '#D77757', '#C792EA', '#FFFFFF'];
  const TYPE_PATTERN = [0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1];
  const WAVE = ['up', 'upOut', 'high', 'upOut'];
  const WALK_LEGS = ['walk1', 'stand', 'walk2', 'stand'];
  const FIREWORK = ['#FF5C7A', '#FFD34D', '#7EE787', '#79C0FF', '#C792EA', '#FFFFFF'];
  const MINI_H = 20;
  const FLAIL = ['up', 'upOut', 'high', 'upOut'];
  const SPIN_SEQ = [0, 1, 2, 3, 2, 1];

  const spring = (x) => ({ x, v: 0 });
  const easeOutBack = (k) => {
    const c = 1.9;
    return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
  };

  function stepSpring(s, target, k, d, steps) {
    for (let i = 0; i < steps; i++) {
      s.v += (target - s.x) * k;
      s.v *= d;
      s.x += s.v;
    }
    if (steps && Math.abs(target - s.x) < 0.04 && Math.abs(s.v) < 0.04) {
      s.x = target;
      s.v = 0;
    }
    return s.x;
  }

  function defaultCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  class Engine {
    constructor(opts) {
      opts = opts || {};
      this.clock = opts.clock || (() => performance.now());
      const makeCanvas = opts.createCanvas || defaultCanvas;
      this.canvas = opts.canvas;
      this.ctx = this.canvas.getContext('2d');
      this.buf = makeCanvas(W, H);
      this.bctx = this.buf.getContext('2d');
      this.layer = makeCanvas(W, H);
      this.lctx = this.layer.getContext('2d', { willReadFrequently: true });
      this.aura = makeCanvas(W, H);
      this.actx = this.aura.getContext('2d');
      this.auraKey = null;
      this.auraMask = null;
      this.cb = opts.callbacks || {};
      this.settings = Object.assign({ hat: 'none', ultra: false, wander: false, sleepAfterMin: 5 }, opts.settings || {});
      this.scale = 2;

      const now = this.clock();
      this.now = now;
      this.particles = [];
      this.action = null;
      this.mode = 'idle';
      this.manual = null;
      this.sleeping = false;
      this.hidden = false;
      this.drag = null;
      this.falling = false;
      this.walk = null;
      this.walkAcc = 0;
      this.cursor = null;
      this.cursorMovedAt = -Infinity;
      this.look = { x: 0, y: 0 };
      this.eye = { x: 0, y: 0 };
      this.swing = 0;
      this.minis = [];
      this.miniId = 0;
      this.modeSince = now;
      this.typing = { burstAt: now + rand(2500, 5000), pauseAt: now + rand(5000, 9000) };
      this.clockCache = { at: -Infinity, hour: 12, hat: null };
      this.mo = {
        w: spring(48),
        h: spring(32),
        legShift: spring(0),
        hat: spring(0),
        lastTop: null,
        lastVy: 0,
        arms: { L: null, R: null },
        laptop: 0,
      };
      this.frameDt = 0.04;
      this.airVy = 0;
      this.hoverAt = -Infinity;
      this.hoverStart = 0;
      this.hovering = false;
      this.blinkAt = now + rand(1500, 4000);
      this.blinkUntil = 0;
      this.nextIdle = now + rand(6000, 10000);
      this.lastInteract = now;
      this.clickTimes = [];
      this.claude = { state: 'idle', ultra: false, helpers: 0 };
      this.prevUltra = false;
      this.dizzyUntil = 0;
      this.spawnAt = {};
      this.g = A.geometry({ cx: CX, ground: GROUND });
      this.hit = [];
      this.lastT = 0;
      this.lastDraw = -Infinity;
      this.lastSig = '';
      this.stats = { frames: 0, drawn: 0 };
      this.running = false;
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.lastT = 0;
      this.lastSig = '';
      const step = (t) => {
        if (!this.running) return;
        this.frame(t);
        this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    }

    stop() {
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
    }

    setScale(scale, dpr) {
      this.scale = scale;
      this.canvas.width = Math.round(W * scale * (dpr || 1));
      this.canvas.height = Math.round(H * scale * (dpr || 1));
      if (this.canvas.style) {
        this.canvas.style.width = W * scale + 'px';
        this.canvas.style.height = H * scale + 'px';
      }
      this.lastSig = '';
    }

    setSettings(s) {
      Object.assign(this.settings, s);
      this.clockCache.at = -Infinity;
      if (!this.settings.wander) this.walk = null;
      this.lastSig = '';
    }

    isUltra() {
      return !!(this.settings.ultra || this.claude.ultra);
    }

    refreshClock(t) {
      if (t - this.clockCache.at < 60000) return;
      this.clockCache = { at: t, hour: new Date().getHours(), hat: this.hatType() };
    }

    currentHat() {
      if ((this.settings.hat || 'none') !== 'auto') return this.hatType();
      return this.clockCache.hat;
    }

    hatType(date) {
      const h = this.settings.hat || 'none';
      if (h !== 'auto') return h === 'none' ? null : h;
      const d = date || new Date();
      const m = d.getMonth() + 1;
      const day = d.getDate();
      if ((m === 12 && day >= 10) || (m === 1 && day <= 7)) return 'santa';
      if (m === 10 && day === 31) return 'wizard';
      return null;
    }

    hatHeight() {
      const h = this.currentHat();
      return h ? A.hatHeight(h) : 0;
    }

    setCursor(x, y) {
      if (!this.cursor || Math.abs(this.cursor.x - x) + Math.abs(this.cursor.y - y) > 1) {
        this.cursorMovedAt = this.now;
      }
      this.cursor = { x, y };
    }

    tick() {
      this.now = Math.max(this.now, this.clock());
      return this.now;
    }

    jiggle(dw, dh) {
      this.mo.w.v += dw;
      this.mo.h.v += dh;
    }

    hoverPing() {
      this.tick();
      if (!this.hovering) {
        this.hovering = true;
        this.hoverStart = this.now;
        if (this.resolveMode() === 'idle') this.jiggle(-1.5, 2.5);
      }
      this.hoverAt = this.now;
    }

    interact() {
      this.lastInteract = this.tick();
      if (this.sleeping) this.sleeping = false;
    }

    click() {
      if (this.hidden) return;
      const wasAsleep = this.sleeping || this.mode === 'sleep';
      this.interact();
      const now = this.now;
      if (wasAsleep) {
        this.manual = null;
        this.startAction('startle');
        this.sound('startle');
        this.say('startle');
        return;
      }
      this.clickTimes = this.clickTimes.filter((t) => now - t < 1600);
      this.clickTimes.push(now);
      if (this.cb.pet) this.cb.pet();
      this.jiggle(4, -3.5);
      if (this.clickTimes.length >= 6) {
        this.clickTimes = [];
        this.startAction('loveBurst');
        this.burstHearts(12, true);
        this.sound('love');
        this.say('loveBurst');
      } else {
        if (!this.action || this.action.name !== 'loveBurst') this.startAction('love');
        this.burstHearts(3 + Math.floor(Math.random() * 2));
        this.sound('pet');
      }
    }

    dblclick() {
      if (this.hidden) return;
      this.interact();
      if (this.resolveMode() === 'idle') {
        this.startAction('jump');
        this.sound('jump');
      }
    }

    dragStart() {
      this.interact();
      this.walk = null;
      this.drag = { start: this.now };
      this.jiggle(-4, 6);
      if (this.action && !PROTECTED.has(this.action.name)) this.action = null;
      if (Math.random() < 0.45) this.say('drag');
    }

    dragEnd() {
      if (!this.drag) return;
      this.tick();
      this.swing = 0;
      const long = this.now - this.drag.start > 2500;
      this.drag = null;
      if (this.now < this.dizzyUntil) {
        this.startAction('dizzy');
        this.sound('dizzy');
        this.say('dizzy');
      } else if (long && Math.random() < 0.3) {
        this.say('dragLong');
      }
    }

    physics(ev) {
      this.tick();
      switch (ev.type) {
        case 'fall':
          this.falling = true;
          break;
        case 'bounce':
          this.startAction('land', { power: ev.power });
          this.sound('land');
          this.burstDust(ev.power);
          this.jiggle(clamp(ev.power * 0.4, 1, 7), -clamp(ev.power * 0.35, 1, 6));
          break;
        case 'air':
          this.airVy = Number(ev.vy) || 0;
          break;
        case 'land':
          this.falling = false;
          if (!this.action || this.action.name !== 'dizzy') this.startAction('land', { power: ev.power || 0 });
          if ((ev.power || 0) > 4) {
            this.sound('land');
            this.burstDust(ev.power);
          }
          this.airVy = 0;
          this.jiggle(clamp((ev.power || 2) * 0.4, 1.5, 7), -clamp((ev.power || 2) * 0.35, 1, 6));
          break;
        case 'swing':
          this.swing = clamp(Number(ev.vx) || 0, -40, 40);
          break;
        case 'drop':
          this.falling = false;
          this.jiggle(2, -2);
          if (!this.action || this.action.name !== 'dizzy') this.startAction('land', { power: 1 });
          break;
        case 'shake':
          this.dizzyUntil = this.now + 1500;
          break;
        default:
          break;
      }
    }

    command(name) {
      this.interact();
      switch (name) {
        case 'pet':
          this.click();
          break;
        case 'jump':
          this.manual = null;
          this.startAction('jump', null, true);
          this.sound('jump');
          break;
        case 'dance':
          this.manual = null;
          this.startAction('dance', null, true);
          this.say('dance');
          break;
        case 'coffee':
          this.manual = null;
          this.startAction('coffee', null, true);
          this.say('coffee');
          break;
        case 'wave':
          this.startAction('wave', null, true);
          break;
        case 'laptop':
          this.manual = this.manual === 'work' ? null : 'work';
          break;
        case 'sleep':
          this.manual = null;
          this.startAction('yawn', { then: 'sleep' }, true);
          this.say('sleep');
          break;
        case 'wake':
          if (this.sleeping) {
            this.sleeping = false;
            this.startAction('startle');
          }
          break;
        case 'celebrate':
          this.celebrate();
          break;
        case 'hide':
          this.startAction('poofOut', null, true);
          this.sound('poof');
          break;
        case 'appear':
          this.hidden = false;
          this.startAction('poofIn', null, true);
          this.sound('poof');
          break;
        default:
          break;
      }
    }

    setClaude(agg) {
      const prev = this.claude.state;
      this.claude = agg;
      this.syncMinis(agg);
      if (agg.state !== 'idle') {
        this.interact();
        this.walk = null;
        if (prev === 'idle' && this.manual === 'work' && agg.state === 'work') this.manual = null;
      }
    }

    claudeEffect(effect) {
      this.tick();
      switch (effect) {
        case 'celebrate':
          this.celebrate();
          break;
        case 'oops':
          this.startAction('oops');
          this.sound('oops');
          this.spawn('sweat', this.g.right - 6, this.g.top + 2, { ay: 60, life: 0.9 });
          break;
        case 'alert':
          this.sound('alert');
          break;
        case 'squish':
          this.startAction('squish');
          this.sound('squish');
          break;
        case 'greet':
        case 'bye':
          this.startAction('wave');
          break;
        case 'nudge':
          this.startAction('wave');
          this.sound('boop');
          break;
        default:
          break;
      }
    }

    celebrate() {
      this.startAction('celebrate', null, true);
      this.burstConfetti(56);
      this.sound('done');
      for (const side of [-1, 1]) {
        this.spawn('rocket', CX + side * rand(30, 44), GROUND - 10, {
          vx: -side * rand(2, 8),
          vy: rand(-110, -90),
          ay: 70,
          life: rand(0.55, 0.75),
          color: pick(FIREWORK),
          delay: side > 0 ? 0.25 : 0,
        });
      }
    }

    hitTest(x, y) {
      for (const r of this.hit) {
        if (x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 2 && y <= r.y + r.h + 2) return true;
      }
      return false;
    }

    headTop() {
      return GROUND - L.BODY_HEIGHT - this.hatHeight();
    }

    restingTop() {
      let top = this.headTop();
      const m = this.resolveMode();
      if (m === 'think' || m === 'wait') top -= 26;
      else if (m === 'work') top -= 8;
      const a = this.action && this.action.name;
      if (a === 'celebrate' || a === 'loveBurst' || a === 'dance') top -= 18;
      else if (a === 'jump' || a === 'startle') top -= 26;
      if (this.minis.some((m) => m.slot.onHead || m.slot.ground < GROUND)) top = Math.min(top, GROUND - L.BODY_HEIGHT - 24);
      return top;
    }

    say(key) {
      if (this.cb.say) this.cb.say(key);
    }

    sound(name) {
      if (this.cb.sound) this.cb.sound(name);
    }

    startAction(name, data, force) {
      this.tick();
      const cur = this.action;
      if (cur && PROTECTED.has(cur.name) && !force) return false;
      if (this.hidden && name !== 'poofIn') return false;
      const mode = this.resolveMode();
      const seated = mode === 'work' || mode === 'wait' || mode === 'think';
      if (seated && !SEATED_OK.has(name)) return false;
      if ((mode === 'drag' || mode === 'fall') && name !== 'poofOut') return false;
      this.action = { name, start: this.now, dur: DUR[name] || 1000, data: data || {} };
      if (name === 'powerUp') {
        this.burstSparkles(18);
        this.spawn('ring', CX, this.g.top + this.g.h / 2, { r0: 6, r1: 70, life: 0.6, color: '#A78BFA' });
        this.spawn('ring', CX, this.g.top + this.g.h / 2, { r0: 2, r1: 46, life: 0.5, color: '#DDD3FF' });
      }
      if (name === 'peek') this.action_peekDir = Math.random() < 0.5 ? -1 : 1;
      if (name === 'poofOut' || name === 'poofIn') this.burstPuffs(11);
      return true;
    }

    endAction(a) {
      const data = a.data || {};
      if (a.name === 'yawn' && data.then === 'sleep') this.sleeping = true;
      if (a.name === 'poofOut') {
        this.hidden = true;
        this.particles = [];
        if (this.cb.hidden) this.cb.hidden();
      }
    }

    resolveMode() {
      if (this.drag) return 'drag';
      if (this.falling) return 'fall';
      const s = this.claude.state;
      if (s === 'wait') return 'wait';
      if (s === 'work') return 'work';
      if (s === 'think') return 'think';
      if (this.manual === 'work') return 'work';
      if (this.sleeping) return 'sleep';
      return 'idle';
    }

    frame(t) {
      const moving = this.drag || this.falling || (this.action && (this.action.name === 'jump' || this.action.name === 'celebrate'));
      if (t - this.lastDraw < (moving ? 30 : 38)) return;
      const dt = this.lastT ? Math.min(0.06, (t - this.lastT) / 1000) : 0.016;
      this.lastT = t;
      this.lastDraw = t;
      this.now = Math.max(this.now, t);
      this.stats.frames++;
      this.frameDt = dt;
      if (this.hovering && this.now - this.hoverAt > 300) this.hovering = false;
      this.update(dt, this.now);
      this.render(this.now);
    }

    update(dt, t) {
      const ultra = this.isUltra();
      if (ultra && !this.prevUltra && !this.hidden) {
        this.startAction('powerUp', null, true);
        this.sound('power');
      }
      this.prevUltra = ultra;

      if (this.action && t - this.action.start >= this.action.dur) {
        const a = this.action;
        this.action = null;
        this.endAction(a);
      }

      const prevMode = this.mode;
      this.mode = this.resolveMode();
      if (this.mode !== prevMode) {
        this.modeSince = t;
        const kick = { work: [3, -3], think: [-2, 3], wait: [-2, 4], idle: prevMode === 'sleep' ? [0, 0] : [2, -2] }[this.mode];
        if (kick && prevMode !== 'drag' && prevMode !== 'fall') this.jiggle(kick[0], kick[1]);
        if ((this.mode === 'work' || this.mode === 'wait' || this.mode === 'think') && this.action && !SEATED_OK.has(this.action.name)) {
          this.action = null;
        }
      }
      this.refreshClock(t);

      if (t >= this.blinkAt) {
        this.blinkUntil = t + 130;
        this.blinkAt = t + (Math.random() < 0.2 ? 240 : rand(2200, 5500));
      }

      this.updateLook(t);

      const hour = this.clockCache.hour;
      const night = hour >= 1 && hour < 6;
      const sleepAfter = (this.settings.sleepAfterMin || 5) * 60000 * (night ? 0.5 : 1);
      if (this.mode === 'idle' && !this.action && !this.walk && t - this.lastInteract > sleepAfter) {
        this.startAction('yawn', { then: 'sleep' });
      }

      if (this.mode === 'idle' && !this.action && !this.walk && t >= this.nextIdle) this.idleBehavior(t);
      else if (this.mode !== 'idle' && t >= this.nextIdle) this.nextIdle = t + rand(6000, 11000);

      if (this.walk) {
        if (this.mode !== 'idle' || this.action || t > this.walk.until) {
          this.walk = null;
        } else if (this.cb.walk) {
          this.walkAcc += this.walk.dir * 18 * this.scale * dt;
          const px = Math.trunc(this.walkAcc);
          if (px) {
            this.walkAcc -= px;
            const w = this.walk;
            Promise.resolve(this.cb.walk(px)).then((res) => {
              if (res && res.blocked && this.walk === w) {
                w.dir = -w.dir;
                this.jiggle(3, -2.5);
              }
            });
          }
        }
      }

      this.spawners(t, ultra);

      this.updateMinis(dt, t);

      const bursts = [];
      for (const p of this.particles) {
        if (p.delay > 0) {
          p.delay -= dt;
          continue;
        }
        p.age += dt;
        if (p.kind === 'rocket' && p.age >= p.life) bursts.push(p);
        p.vy += (p.ay || 0) * dt;
        if (p.drag) {
          p.vx *= 1 - p.drag * dt;
          p.vy *= 1 - p.drag * dt;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      if (this.particles.length) {
        this.particles = this.particles.filter((p) => p.delay > 0 || (p.age < p.life && p.y < H + 8 && p.y > -24));
      }
      for (const r of bursts) this.burstFirework(r.x, r.y, r.color);
    }

    miniSlots() {
      const head = this.currentHat() ? [] : [{ x: CX, ground: GROUND - L.BODY_HEIGHT, onHead: true }];
      return [
        { x: CX - 54, ground: GROUND },
        { x: CX + 54, ground: GROUND },
        ...head,
        { x: CX - 54, ground: GROUND - MINI_H },
        { x: CX + 54, ground: GROUND - MINI_H },
      ];
    }

    syncMinis(agg) {
      const want = Math.min(agg.helpers || 0, 9);
      const types = agg.helperTypes || [];
      let active = this.minis.filter((m) => m.state !== 'leave' && m.state !== 'bye');
      while (active.length > want) {
        const m = active.pop();
        m.state = 'bye';
        m.byeAt = this.now;
        m.side = m.slot.x < CX ? -1 : 1;
      }
      const slots = this.miniSlots();
      while (active.length < want) {
        const used = new Set(active.map((m) => m.slotIndex));
        let i = 0;
        while (used.has(i)) i++;
        const slot = slots[Math.min(i, slots.length - 1)] || slots[0];
        const side = slot.x < CX ? -1 : slot.x > CX ? 1 : Math.random() < 0.5 ? -1 : 1;
        const m = {
          id: ++this.miniId,
          slotIndex: i,
          slot,
          side,
          state: 'enter',
          x: slot.onHead ? slot.x : slot.x + side * 46,
          drop: slot.onHead || slot.ground < GROUND ? 34 : 0,
          type: '',
          born: this.now,
        };
        this.minis.push(m);
        active.push(m);
        this.burstPuffs(4, m.x, slot.ground - 10);
      }
      active.forEach((m, i) => {
        m.type = types[i] || '';
      });
    }

    updateMinis(dt, t) {
      if (!this.minis.length) return;
      const slots = this.miniSlots();
      for (const m of this.minis) {
        if (m.state !== 'leave' && m.state !== 'bye') m.slot = slots[Math.min(m.slotIndex, slots.length - 1)];
        if (m.state === 'bye' && t - m.byeAt > 450) m.state = 'leave';
        const speed = 46 * dt;
        if (m.state === 'enter') {
          const dx = m.slot.x - m.x;
          m.x += clamp(dx, -speed, speed);
          if (m.drop > 0) m.drop = Math.max(0, m.drop - 120 * dt);
          if (Math.abs(dx) < 0.5 && m.drop === 0) {
            m.state = 'here';
            m.hopAt = t;
          }
        } else if (m.state === 'leave') {
          m.x += m.side * speed;
          if (Math.abs(m.x - m.slot.x) > 46) {
            m.gone = true;
            this.burstPuffs(4, m.x, m.slot.ground - 10);
          }
        }
      }
      this.minis = this.minis.filter((m) => !m.gone);
    }

    updateLook(t) {
      const c = this.cursor;
      if (c && t - this.cursorMovedAt < 3500) {
        const dx = c.x - CX;
        const dy = c.y - (this.g.top + 10);
        this.look.x = dx < -32 ? -1 : dx < -12 ? -0.5 : dx > 32 ? 1 : dx > 12 ? 0.5 : 0;
        this.look.y = dy < -40 ? -1 : dy < -16 ? -0.5 : 0;
      } else if (!this.action) {
        this.look.x = 0;
        this.look.y = 0;
      }
    }

    idleBehavior(t) {
      this.nextIdle = t + rand(5500, 11000);
      const opts = [
        ['glance', 3],
        ['hop', 1],
        ['wave', 0.6],
        ['coffee', 0.7],
        ['stretch', 0.7],
        ['peek', 0.8],
        ['dance', 0.35],
      ];
      if (this.settings.speech !== false) opts.push(['say', 1.3], ['tip', 0.6]);
      if (this.settings.wander) opts.push(['walk', 2.4]);
      let total = 0;
      for (const o of opts) total += o[1];
      let r = Math.random() * total;
      let choice = opts[0][0];
      for (const o of opts) {
        r -= o[1];
        if (r <= 0) {
          choice = o[0];
          break;
        }
      }
      if (choice === 'say' || choice === 'tip') {
        if (this.cb.chatter) this.cb.chatter(choice === 'say' ? 'idle' : 'tip');
      } else if (choice === 'walk') {
        this.walk = { dir: Math.random() < 0.5 ? -1 : 1, until: t + rand(1800, 4500) };
      } else {
        this.startAction(choice);
      }
    }

    spawners(t, ultra) {
      if (this.hidden) return;
      const g = this.g;
      const every = (key, ms, fn) => {
        if (!this.spawnAt[key] || t >= this.spawnAt[key]) {
          this.spawnAt[key] = t + ms;
          fn();
        }
      };
      const a = this.action;
      if (this.mode === 'sleep') {
        every('z', 1300, () => this.spawn('z', g.right - 6, g.top - 4, { vx: 8, vy: -10, life: 2.6 }));
      }
      if (this.mode === 'work') {
        every('code', ultra ? 140 : 430, () => {
          const side = Math.random() < 0.5 ? -1 : 1;
          this.spawn('code', CX + side * rand(26, 40) - 2, g.top + rand(0, 8), {
            vx: side * rand(2, 10),
            vy: rand(-18, -12),
            life: rand(1.2, 1.8),
            char: pick(CODE_CHARS),
            color: pick(CODE_COLORS),
          });
        });
      }
      if (a && a.name === 'dance') {
        every('note', 420, () =>
          this.spawn(Math.random() < 0.5 ? 'note' : 'notes', CX + rand(-36, 28), g.top - 8, {
            vx: rand(-8, 8),
            vy: -16,
            life: 1.6,
            color: pick(['#FF7AA2', '#79C0FF', '#FFD34D', '#7EE787']),
          })
        );
        every('disco', 160, () =>
          this.spawn('sparkleSmall', CX + rand(-62, 58), rand(8, GROUND - 12), { life: 0.5, color: pick(CONFETTI) })
        );
      }
      if (a && a.name === 'coffee' && this.mugPos) {
        every('steam', 200, () =>
          this.spawn('steam', this.mugPos.x + rand(2, 9), this.mugPos.y - 1, { vy: -10, life: 1.3, color: '#E6E6E6' })
        );
      }
      if (ultra && this.mode !== 'sleep') {
        every('ultra', 120, () => {
          const side = Math.random() < 0.5 ? -1 : 1;
          this.spawn('spark', CX + side * rand(12, 34), g.top + rand(-4, g.h), {
            vx: side * rand(0, 6),
            vy: rand(-24, -12),
            life: rand(0.6, 1.1),
            hue: rand(250, 290),
          });
        });
      }
    }

    spawn(kind, x, y, o) {
      if (this.particles.length > 220) this.particles.shift();
      this.particles.push(Object.assign({ kind, x, y, vx: 0, vy: 0, ay: 0, age: 0, life: 1, seed: Math.random() * 100 }, o || {}));
    }

    burstHearts(n, big) {
      const g = this.g;
      for (let i = 0; i < n; i++) {
        this.spawn(Math.random() < 0.35 ? 'heartSmall' : 'heart', CX + rand(-24, 14), g.top + rand(-6, 4), {
          vx: rand(-14, 14),
          vy: rand(-46, -30),
          drag: 1.6,
          life: rand(1.0, 1.7),
        });
      }
      if (big) this.spawn('heartBig', CX - 11, g.top - 26, { vy: -12, life: 1.8 });
    }

    burstConfetti(n) {
      const g = this.g;
      for (let i = 0; i < n; i++) {
        this.spawn('confetti', CX + rand(-8, 8), g.top - 4, {
          vx: rand(-56, 56),
          vy: rand(-80, -32),
          ay: 84,
          drag: 0.6,
          life: rand(1.4, 2.4),
          color: pick(CONFETTI),
          shape: Math.floor(Math.random() * 3),
        });
      }
    }

    burstSparkles(n) {
      const g = this.g;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        this.spawn('sparkle', CX + Math.cos(ang) * 16 - 4, g.top + g.h / 2 + Math.sin(ang) * 12 - 4, {
          vx: Math.cos(ang) * 52,
          vy: Math.sin(ang) * 36,
          drag: 2.5,
          life: 0.9,
          color: A.hsl(252 + (i / n) * 40, 90, 70),
        });
      }
    }

    burstDust(power) {
      const n = clamp(Math.round((power || 6) / 2), 2, 6);
      for (let i = 0; i < n; i++) {
        for (const side of [-1, 1]) {
          this.spawn('dust', CX + side * rand(18, 30), GROUND - 4, {
            vx: side * rand(14, 34),
            vy: rand(-14, -4),
            drag: 3,
            life: rand(0.35, 0.55),
          });
        }
      }
    }

    burstFirework(x, y, color) {
      this.sound('pop');
      for (let i = 0; i < 18; i++) {
        const ang = (i / 18) * Math.PI * 2 + Math.random() * 0.2;
        const sp = rand(26, 40);
        this.spawn('fw', x, y, {
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          ay: 30,
          drag: 1.2,
          life: rand(0.6, 0.9),
          color: Math.random() < 0.7 ? color : pick(FIREWORK),
        });
      }
    }

    burstPuffs(n, x, y) {
      const cx = x == null ? CX : x;
      const cy = y == null ? GROUND - 20 : y;
      const big = x == null;
      if (big) {
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + Math.random() * 0.3;
          this.spawn('smoke', cx + Math.cos(ang) * 26, cy + Math.sin(ang) * 17, {
            vx: Math.cos(ang) * rand(40, 60),
            vy: Math.sin(ang) * rand(26, 40) - 6,
            drag: 4,
            life: rand(0.4, 0.55),
          });
        }
        return;
      }
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        this.spawn('puffSmall', cx + Math.cos(ang) * 5 - 3, cy + Math.sin(ang) * 4 - 3, {
          vx: Math.cos(ang) * 36,
          vy: Math.sin(ang) * 24 - 8,
          drag: 3,
          life: rand(0.45, 0.6),
        });
      }
    }

    buildPose(t, advance) {
      const P = {
        cx: CX,
        ground: GROUND,
        w: 48,
        h: 32,
        lift: 0,
        dx: 0,
        eyes: 'open',
        lookX: this.look.x,
        lookY: this.look.y,
        armL: 'side',
        armR: 'side',
        legs: 'stand',
        legPhase: 0,
        blush: false,
        mouth: null,
        hat: this.currentHat(),
        shades: false,
        hidden: false,
        legShift: 0,
        armLdy: 0,
        armRdy: 0,
        snapArms: false,
        noSpring: false,
      };
      const X = { laptop: false, mug: null, spinner: false, bang: false, stars: false, bulb: false, question: false, nose: 0 };
      const ultra = this.isUltra();
      const br = Math.sin(t / 700);
      const breath = br > 0.75 ? 2 : br > 0.45 ? 1 : 0;

      switch (this.mode) {
        case 'drag':
        case 'fall': {
          const fast = Math.abs(this.swing) > 6;
          const speed = this.mode === 'fall' || fast ? 90 : 160;
          P.armL = cycle(t, speed, FLAIL);
          P.armR = cycle(t + speed * 2, speed, FLAIL);
          P.legs = 'dangle';
          P.legPhase = Math.floor(t / 160) % 2;
          if (this.mode === 'drag') P.legShift = clamp(Math.round(-this.swing / 3), -5, 5);
          if (this.mode === 'fall') {
            const st = clamp(Math.abs(this.airVy) / 4, 0, 5);
            P.h = 32 + Math.round(st);
            P.w = 48 - 2 * Math.round(st / 2.5);
          }
          const long = this.drag && t - this.drag.start > 2500 && !fast;
          P.eyes = long ? 'happy' : 'wide';
          P.mouth = long ? 'smile' : 'o';
          P.lookX = 0;
          P.lookY = 0;
          if (t < this.dizzyUntil) {
            P.eyes = 'x';
            P.mouth = 'wobble';
            X.stars = true;
          }
          break;
        }
        case 'sleep': {
          const s = Math.sin(t / 900);
          P.w = 52;
          P.h = 28 - (s > 0.3 ? 2 : s > -0.3 ? 1 : 0);
          P.legH = 3;
          P.legs = 'tuck';
          P.eyes = 'closed';
          P.armL = P.armR = 'down';
          P.lookX = P.lookY = 0;
          X.nose = 1 + Math.floor(((t - this.modeSince) % 2600) / 2600 * 6);
          break;
        }
        case 'think': {
          P.h = 32 - breath;
          P.lookY = -1;
          P.lookX = Math.floor(t / 1400) % 2 ? 1 : -1;
          P.armR = 'mid';
          P.armRdy = Math.floor(t / 240) % 2;
          const since = t - this.modeSince;
          if (since > 3000 && since % 6500 > 5400) {
            X.bulb = true;
            P.eyes = 'shiny';
            P.lookX = 0;
            P.lookY = 0;
            P.armR = 'high';
          } else {
            X.spinner = true;
          }
          break;
        }
        case 'work': {
          X.laptop = true;
          const speed = ultra ? 65 : 130;
          const f = TYPE_PATTERN[Math.floor(t / speed) % TYPE_PATTERN.length];
          P.armL = f ? 'type' : 'typeUp';
          P.armR = f ? 'typeUp' : 'type';
          P.snapArms = true;
          P.eyes = 'focus';
          P.lookX = 0;
          P.lookY = 0;
          const ty = this.typing;
          if (t >= ty.burstAt && t < ty.burstAt + 240) {
            P.armL = P.armR = 'type';
            P.lift = 1;
            if (!ty.burstDone) {
              ty.burstDone = true;
              for (let i = 0; i < 4; i++) {
                this.spawn('code', CX + rand(-26, 22), this.g.top + rand(0, 6), {
                  vx: rand(-14, 14),
                  vy: rand(-26, -16),
                  life: rand(1, 1.4),
                  char: pick(CODE_CHARS),
                  color: pick(CODE_COLORS),
                });
              }
            }
          } else if (t >= ty.burstAt + 240) {
            ty.burstAt = t + rand(2500, 6000);
            ty.burstDone = false;
          }
          if (t >= ty.pauseAt && t < ty.pauseAt + 900) {
            P.armL = P.armR = 'typeUp';
            P.eyes = 'open';
            P.lookY = -1;
            P.lookX = 0.5;
          } else if (t >= ty.pauseAt + 900) {
            ty.pauseAt = t + rand(5000, 10000);
          }
          if (t % 7000 < 650) {
            P.eyes = 'open';
            P.lookX = this.look.x;
          }
          P.tint = ultra ? '#B39DFF' : '#9CCBFF';
          P.tintAlpha = 0.12 + 0.03 * (Math.floor(t / 110) % 3);
          P.tintH = 17;
          break;
        }
        case 'wait': {
          const since = t - this.modeSince;
          P.eyes = 'shiny';
          P.lookX = 0;
          P.lookY = 0;
          X.bang = true;
          if (since > 7000 && since % 9000 > 3500) {
            P.legs = 'tap';
            P.legPhase = Math.floor(t / 170) % 2;
            P.armR = 'mid';
            P.eyes = t % 2400 < 1800 ? 'focus' : 'open';
          } else {
            const hopT = t % 1800;
            if (hopT < 90) {
              P.w = 52;
              P.h = 29;
            } else if (hopT < 470) {
              P.lift = Math.round(Math.sin(((hopT - 90) / 380) * Math.PI) * 8);
              if (P.lift > 2) P.legs = 'tuck';
            } else if (hopT < 540) {
              P.w = 52;
              P.h = 29;
            }
            P.armR = cycle(t, 130, WAVE);
          }
          break;
        }
        case 'idle':
        default:
          P.h = 32 - breath;
          P.armLdy = P.armRdy = breath === 2 ? 1 : 0;
          if (this.walk) {
            const ph = Math.floor(t / 110) % 4;
            P.legs = WALK_LEGS[ph];
            P.lift = ph % 2 ? 0 : 1;
            P.armL = ph < 2 ? 'swingA' : 'swingB';
            P.armR = ph < 2 ? 'swingB' : 'swingA';
            P.dx = [0, 1, 0, -1][ph];
            P.h = ph % 2 ? 31 : 32;
            P.armLdy = P.armRdy = 0;
            P.lookX = this.walk.dir;
            P.lookY = 0;
          }
          break;
      }

      if (this.hovering && this.mode === 'idle' && !this.walk) {
        const held = t - this.hoverStart;
        if (held > 2500) {
          P.eyes = 'happy';
          P.blush = true;
        } else if (held > 250) {
          P.eyes = 'shiny';
          P.lookY = Math.min(P.lookY, -0.5);
        }
      }

      if (t < this.blinkUntil && (P.eyes === 'open' || P.eyes === 'focus' || P.eyes === 'shiny')) {
        P.eyes = t > this.blinkUntil - 90 && t < this.blinkUntil - 40 ? 'blink' : 'half';
      }

      const a = this.action;
      if (a) this.applyAction(a, t - a.start, (t - a.start) / a.dur, P, X, t);

      if (ultra && this.mode !== 'sleep' && !P.hidden && !['closed', 'heart', 'x', 'squeeze'].includes(P.eyes)) {
        P.shades = true;
      }

      for (const k of ['x', 'y']) {
        const target = k === 'x' ? P.lookX : P.lookY;
        const d = target - this.eye[k];
        this.eye[k] = Math.abs(d) < 0.2 ? target : this.eye[k] + d * 0.45;
      }
      P.lookX = Math.round(this.eye.x * 2) / 2;
      P.lookY = Math.round(this.eye.y * 2) / 2;
      this.applyMotion(P, X, advance ? this.frameDt : 0);
      return { P, X };
    }

    applyMotion(P, X, dt) {
      const mo = this.mo;
      const steps = dt > 0 ? clamp(Math.round(dt / 0.016), 1, 6) : 0;

      if (P.noSpring) {
        mo.w = spring(P.w);
        mo.h = spring(P.h);
      } else {
        const w = stepSpring(mo.w, P.w, 0.3, 0.7, steps);
        const h = stepSpring(mo.h, P.h, 0.3, 0.7, steps);
        P.w = clamp(2 * Math.round(w / 2), 30, 66);
        P.h = clamp(Math.round(h), 16, 44);
      }

      P.legShift = Math.round(stepSpring(mo.legShift, P.legShift || 0, 0.09, 0.88, steps));

      mo.laptop = clamp(mo.laptop + ((X.laptop ? 1 : -1) * (steps * 0.016)) / 0.3, 0, 1);
      X.laptopT = mo.laptop;

      if (P.hidden) return;
      const g = A.geometry(P);
      if (mo.lastTop === null) mo.lastTop = g.top;
      const vy = steps ? (g.top - mo.lastTop) / steps : mo.lastVy;
      if (steps) {
        mo.hat.v -= (vy - mo.lastVy) * 0.9;
        stepSpring(mo.hat, 0, 0.24, 0.72, steps);
        mo.hat.x = clamp(mo.hat.x, -4, 1);
        mo.lastTop = g.top;
        mo.lastVy = vy;
      }
      P.hatDy = Math.round(mo.hat.x);

      for (const side of ['L', 'R']) {
        const kind = side === 'L' ? P.armL : P.armR;
        const target = A.armRect(side === 'L' ? -1 : 1, kind, g);
        if (!target) {
          mo.arms[side] = null;
          P['arm' + side + 'Rect'] = null;
          continue;
        }
        const ax = side === 'L' ? g.left : g.right;
        const lag = P.snapArms ? 0 : clamp(-vy * 2.2, -3, 3);
        const rel = { x: target.x - ax, y: target.y - g.top + (side === 'L' ? P.armLdy : P.armRdy) + lag, w: target.w, h: target.h };
        let a = mo.arms[side];
        if (!a || P.snapArms || P.noSpring) {
          a = mo.arms[side] = { x: spring(rel.x), y: spring(rel.y), w: spring(rel.w), h: spring(rel.h) };
        } else {
          stepSpring(a.x, rel.x, 0.38, 0.6, steps);
          stepSpring(a.y, rel.y, 0.38, 0.6, steps);
          stepSpring(a.w, rel.w, 0.38, 0.6, steps);
          stepSpring(a.h, rel.h, 0.38, 0.6, steps);
        }
        P['arm' + side + 'Rect'] = {
          x: Math.round(ax + a.x.x),
          y: Math.round(g.top + a.y.x),
          w: Math.max(1, Math.round(a.w.x)),
          h: Math.max(1, Math.round(a.h.x)),
          mug: target.mug,
        };
      }
    }

    applyAction(a, e, p, P, X, t) {
      const seated = X.laptop;
      switch (a.name) {
        case 'love':
          P.eyes = e < 90 ? 'squeeze' : 'happy';
          P.blush = e > 90;
          if (!seated && e > 90 && e < 540) {
            P.lift = Math.round(Math.sin(((e - 90) / 450) * Math.PI) * 6);
            P.armL = P.armR = 'up';
          }
          break;
        case 'loveBurst':
          P.eyes = 'heart';
          P.blush = true;
          if (!seated) {
            P.armL = cycle(e, 140, ['up', 'high']);
            P.armR = cycle(e + 140, 140, ['up', 'high']);
            P.lift = Math.round(Math.abs(Math.sin(e / 160)) * 4);
          }
          break;
        case 'jump':
          if (e < 140) {
            P.w = 54;
            P.h = 27;
            P.armL = P.armR = 'down';
            P.eyes = 'squeeze';
          } else if (e < 220) {
            P.w = 42;
            P.h = 38;
            P.lift = 5;
            P.armL = P.armR = 'high';
          } else if (e < 800) {
            const q = (e - 220) / 580;
            P.lift = Math.round(Math.sin(q * Math.PI) * 26);
            P.armL = P.armR = q < 0.6 ? 'high' : 'upOut';
            P.legs = q > 0.75 ? 'stand' : 'tuck';
            P.eyes = 'happy';
            P.mouth = 'smile';
            if (q > 0.8) {
              P.w = 44;
              P.h = 35;
            }
          } else {
            P.w = 56;
            P.h = 26;
            P.armL = P.armR = 'down';
            if (!a.data.landed) {
              a.data.landed = true;
              this.burstDust(6);
              this.sound('land');
            }
          }
          break;
        case 'celebrate': {
          const cyc = e % 1300;
          if (cyc < 80) {
            P.w = 54;
            P.h = 27;
          } else if (cyc < 700) {
            P.lift = Math.round(Math.sin(((cyc - 80) / 620) * Math.PI) * 16);
            if (P.lift > 3) P.legs = 'tuck';
          } else if (cyc < 800) {
            P.w = 54;
            P.h = 27;
          }
          if (e > 1250 && !a.data.second) {
            a.data.second = true;
            this.burstConfetti(30);
          }
          P.armL = cycle(e, 160, ['up', 'high']);
          P.armR = cycle(e + 160, 160, ['up', 'high']);
          P.eyes = 'happy';
          P.mouth = 'smile';
          P.blush = true;
          break;
        }
        case 'oops':
          P.eyes = e < 800 ? 'x' : 'open';
          P.mouth = 'wobble';
          if (e < 450) P.dx = Math.floor(e / 50) % 2 ? 2 : -2;
          if (!seated) P.armL = P.armR = 'down';
          break;
        case 'wave':
          P.armR = cycle(e, 130, WAVE);
          if (P.eyes === 'open' || P.eyes === 'blink' || P.eyes === 'half') P.eyes = 'happy';
          break;
        case 'yawn':
          if (e > 250 && e < 1500) {
            P.armL = P.armR = 'high';
            P.eyes = 'closed';
            P.mouth = 'yawn';
            P.h = 34;
            P.w = 44;
          } else if (e >= 1500) {
            P.eyes = 'half';
          }
          break;
        case 'coffee': {
          const sip = e > 1800 && e < 3200;
          P.armR = sip ? 'sip' : 'hold';
          X.mug = sip ? 'sip' : 'hold';
          if (sip) P.eyes = 'closed';
          else if (e >= 3200 && e < 4000) {
            P.eyes = 'happy';
            P.blush = true;
          }
          break;
        }
        case 'squish': {
          const k = e < 500 ? e / 500 : e > 1900 ? Math.max(0, 1 - (e - 1900) / 500) : 1;
          P.w = 48 + 2 * Math.round(k * 6);
          P.h = 32 - Math.round(k * 12);
          P.eyes = 'squeeze';
          break;
        }
        case 'dizzy':
          P.eyes = 'x';
          P.mouth = 'wobble';
          P.dx = Math.round(Math.sin(e / 90) * 2);
          X.stars = true;
          break;
        case 'land': {
          const k = 1 - p;
          const power = clamp((a.data.power || 3) / 6, 0.4, 1.4);
          P.w = 48 + 2 * Math.round(k * 4 * power);
          P.h = 32 - Math.round(k * 6 * power);
          if (power > 1) P.eyes = 'squeeze';
          break;
        }
        case 'hop':
          if (e < 90) {
            P.w = 52;
            P.h = 29;
          } else {
            const q = (e - 90) / (a.dur - 90);
            P.lift = Math.round(Math.sin(q * Math.PI) * 7);
            if (P.lift > 2) P.legs = 'tuck';
          }
          break;
        case 'peek': {
          const dir = this.action_peekDir || 1;
          const k = e < 300 ? e / 300 : e > 1250 ? Math.max(0, 1 - (e - 1250) / 300) : 1;
          P.dx = Math.round(dir * 4 * k);
          P.lookX = dir * (k > 0.5 ? 1 : 0.5);
          P.lookY = 0;
          if (dir < 0) P.armL = k > 0.5 ? 'mid' : 'side';
          else P.armR = k > 0.5 ? 'mid' : 'side';
          break;
        }
        case 'stretch':
          if (e > 200 && e < 1300) {
            P.armL = P.armR = 'high';
            P.h = 36;
            P.w = 44;
            P.eyes = 'closed';
          }
          break;
        case 'glance':
          P.lookX = e < 700 ? -1 : e < 850 ? 0 : 1;
          P.lookY = 0;
          break;
        case 'poofOut':
          if (e < 90) {
            P.w = 42;
            P.h = 38;
            P.eyes = 'squeeze';
          } else if (e < 240) {
            const u = e < 165 ? 3 : 2;
            Object.assign(P, { u, w: 12 * u, h: 8 * u, noSpring: true, snapArms: true, hat: null, eyes: 'squeeze' });
          } else P.hidden = true;
          break;
        case 'poofIn':
          if (e < 60) P.hidden = true;
          else if (e < 200) {
            const u = e < 130 ? 2 : 3;
            Object.assign(P, { u, w: 12 * u, h: 8 * u, noSpring: true, snapArms: true, hat: null });
          } else if (!a.data.popped) {
            a.data.popped = true;
            this.mo.w = spring(40);
            this.mo.h = spring(26);
            this.jiggle(7, 5);
          }
          break;
        case 'powerUp':
          if (e < 300) {
            P.w = 52;
            P.h = 28;
            P.eyes = 'squeeze';
          } else if (e < 700) {
            P.w = 44;
            P.h = 36;
            P.lift = seated ? 0 : 4;
            if (!seated) P.armL = P.armR = 'high';
          } else if (!seated) {
            P.armL = cycle(e, 150, ['up', 'upOut']);
            P.armR = cycle(e + 150, 150, ['up', 'upOut']);
          }
          break;
        case 'dance': {
          const beat = 420;
          const ph = (e % beat) / beat;
          const n = Math.floor(e / beat);
          P.lift = ph < 0.5 ? Math.round(Math.sin(ph * 2 * Math.PI) * 4) : 0;
          if (ph > 0.5 && ph < 0.62) {
            P.w = 52;
            P.h = 30;
          }
          P.armL = n % 2 ? 'high' : 'down';
          P.armR = n % 2 ? 'down' : 'high';
          P.dx = n % 4 === 1 ? 2 : n % 4 === 3 ? -2 : 0;
          P.eyes = 'happy';
          P.mouth = 'smile';
          break;
        }
        case 'startle':
          P.eyes = 'wide';
          P.mouth = 'o';
          P.armL = P.armR = 'high';
          P.lift = e < 300 ? Math.round(Math.sin((e / 300) * Math.PI) * 8) : 0;
          X.question = true;
          break;
        default:
          break;
      }
    }

    signature(P, X, t) {
      if (this.particles.length || this.isUltra()) return null;
      return this.poseKey(P, X, t);
    }

    poseKey(P, X, t) {
      const parts = [
        P.hidden || this.hidden, P.w, P.h, P.lift, P.dx, P.eyes, P.lookX, P.lookY, P.armL, P.armR, P.legs, P.legPhase,
        P.blush, P.mouth, P.hat, P.shades, P.tint, P.tintAlpha, X.laptop, X.mug,
        X.spinner ? Math.floor(t / 120) % SPIN_SEQ.length : '', X.bang ? Math.round(Math.sin(t / 140) * 2) : '',
        X.stars ? Math.floor(t / 33) : '', this.minis.length ? Math.floor(t / 130) : '',
        P.legShift, X.bulb ? Math.floor(t / 200) % 2 : '', X.question, X.nose, P.u, P.hatDy, X.laptopT,
        P.armLRect ? [P.armLRect.x, P.armLRect.y, P.armLRect.w, P.armLRect.h].join() : '',
        P.armRRect ? [P.armRRect.x, P.armRRect.y, P.armRRect.w, P.armRRect.h].join() : '',
        this.minis.map((m) => Math.round(m.x) + ':' + Math.round(m.drop) + m.state[0] + m.type).join(','),
      ];
      return parts.join('|');
    }

    render(t) {
      const { P, X } = this.buildPose(t, true);
      const sig = this.signature(P, X, t);
      if (sig !== null && sig === this.lastSig) return false;
      this.lastSig = sig === null ? '' : sig;
      this.stats.drawn++;

      const b = this.bctx;
      const l = this.lctx;
      b.clearRect(0, 0, W, H);
      l.clearRect(0, 0, W, H);
      this.hit = [];
      const ultra = this.isUltra();
      const visible = !P.hidden && !this.hidden;

      if (visible) {
        const g = A.drawClawd(l, P);
        this.g = g;
        if (X.laptopT > 0) {
          const k = X.laptop ? easeOutBack(X.laptopT) : X.laptopT * X.laptopT;
          const dy = Math.round((1 - k) * 18);
          const r = A.drawLaptop(l, CX, GROUND + dy, { logoColor: ultra ? A.violet(t) : null });
          if (X.laptopT > 0.5) this.hit.push({ x: r.baseX, y: r.y, w: A.LAPTOP.baseW, h: GROUND - r.y });
        }
        if (X.mug && g.armRRect && g.armRRect.mug) {
          this.mugPos = { x: g.armRRect.mug.x, y: g.armRRect.mug.y };
          A.drawMug(l, this.mugPos.x, this.mugPos.y);
        } else {
          this.mugPos = null;
        }
        this.drawHelpers(l, t);

        const hatH = P.hat ? A.hatHeight(P.hat) : 0;
        this.hit.push({ x: g.left, y: g.top - hatH, w: g.w, h: g.h + g.legH + hatH });
        if (g.armLRect) this.hit.push(g.armLRect);
        if (g.armRRect) this.hit.push(g.armRRect);

        if (ultra) this.drawUltraAura(b, l, t, this.poseKey(P, X, t));
        b.drawImage(this.layer, 0, 0);
      }

      for (const p of this.particles) this.drawParticle(b, p, t);
      if (visible) this.drawOverlays(b, X, t);

      const c = this.ctx;
      c.imageSmoothingEnabled = false;
      c.clearRect(0, 0, this.canvas.width, this.canvas.height);
      c.drawImage(this.buf, 0, 0, this.canvas.width, this.canvas.height);
      return true;
    }

    drawHelpers(l, t) {
      const working = this.mode === 'work';
      let extra = 0;
      for (let i = 0; i < this.minis.length; i++) {
        const m = this.minis[i];
        if (m.slotIndex >= 5) {
          extra++;
          continue;
        }
        const walking = m.state === 'enter' || m.state === 'leave';
        const hop = m.hopAt && t - m.hopAt < 260 ? Math.round(Math.sin(((t - m.hopAt) / 260) * Math.PI) * 5) : 0;
        const bob = walking ? Math.floor(t / 110) % 2 : hop || (Math.floor(t / 260) + i) % 2;
        const facing = m.state === 'enter' ? -m.side : m.state === 'leave' ? m.side : m.slot.x < CX ? 1 : m.slot.x > CX ? -1 : 0;
        const prop = m.type === 'Explore' ? 'magnifier' : m.type === 'Plan' ? 'clipboard' : working && !walking && !m.slot.onHead && m.slot.ground === GROUND ? 'laptop' : null;
        const ground = m.slot.onHead ? this.g.top : m.slot.ground;
        const r = A.drawMini(l, m.x, ground - m.drop, {
          lift: bob,
          walk: walking ? (Math.floor(t / 110) % 2) + 1 : 0,
          blink: (t + i * 900) % 4200 < 130,
          lookX: facing,
          facing: facing || 1,
          wave: m.state === 'bye' ? Math.floor(t / 110) % 2 === 0 : !walking && (t + i * 500) % 3000 < 400,
          prop,
        });
        this.hit.push({ x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top });
        if (!walking) {
          const dot = Math.floor(t / 300 + i) % 3;
          A.rect(l, A.C.body, m.x - 6 + dot * 4, r.top - 6, 2, 2);
        }
      }
      if (extra > 0) A.text(l, '+' + extra, CX + 66, GROUND - 54, '#FFFFFF');
    }

    drawUltraAura(b, l, t, key) {
      if (key !== this.auraKey || !this.auraMask) {
        this.auraKey = key;
        this.auraMask = this.findAura(l);
      }
      const m = this.auraMask;
      if (!m) return;
      if (!this.auraImg || this.auraImg.width !== m.w || this.auraImg.height !== m.h) {
        this.auraImg = this.actx.createImageData(m.w, m.h);
      }
      const d = this.auraImg.data;
      d.fill(0);
      const glow = Math.round(255 * (0.22 + 0.12 * Math.sin(t / 200)));
      for (let i = 0; i < m.glow.length; i++) {
        const o = m.glow[i] * 4;
        d[o] = 0xa7;
        d[o + 1] = 0x8b;
        d[o + 2] = 0xfa;
        d[o + 3] = glow;
      }
      let band = -1;
      let rgb = null;
      for (let i = 0; i < m.ring.length; i++) {
        const idx = m.ring[i];
        const x = idx % m.w;
        const y = (idx - x) / m.w;
        const bnd = m.x0 + x + m.y0 + y;
        if (bnd !== band) {
          band = bnd;
          rgb = A.violetRgb(t, bnd * 0.18);
        }
        const o = idx * 4;
        d[o] = rgb[0];
        d[o + 1] = rgb[1];
        d[o + 2] = rgb[2];
        d[o + 3] = 255;
      }
      this.actx.clearRect(0, 0, W, H);
      this.actx.putImageData(this.auraImg, m.x0, m.y0);
      b.drawImage(this.aura, 0, 0);
    }

    findAura(l) {
      let x0 = W;
      let y0 = H;
      let x1 = 0;
      let y1 = 0;
      for (const r of this.hit) {
        x0 = Math.min(x0, r.x);
        y0 = Math.min(y0, r.y);
        x1 = Math.max(x1, r.x + r.w);
        y1 = Math.max(y1, r.y + r.h);
      }
      x0 = clamp(Math.floor(x0) - 3, 0, W);
      y0 = clamp(Math.floor(y0) - 3, 0, H);
      x1 = clamp(Math.ceil(x1) + 3, 0, W);
      y1 = clamp(Math.ceil(y1) + 3, 0, H);
      const w = x1 - x0;
      const h = y1 - y0;
      if (w <= 0 || h <= 0) return null;
      const data = l.getImageData(x0, y0, w, h).data;
      const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 0;
      const isRing = new Uint8Array(w * h);
      const ring = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) {
            isRing[y * w + x] = 1;
            ring.push(y * w + x);
          }
        }
      }
      ring.sort((a, b) => (a % w) + Math.floor(a / w) - ((b % w) + Math.floor(b / w)));
      const inRing = (x, y) => x >= 0 && y >= 0 && x < w && y < h && isRing[y * w + x] === 1;
      const glow = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!isRing[y * w + x] && !solid(x, y) && (inRing(x - 1, y) || inRing(x + 1, y) || inRing(x, y - 1) || inRing(x, y + 1))) {
            glow.push(y * w + x);
          }
        }
      }
      return { x0, y0, w, h, ring: Int32Array.from(ring), glow: Int32Array.from(glow) };
    }

    drawOverlays(b, X, t) {
      const g = this.g;
      const hat = this.currentHat();
      const top = g.top - (hat ? A.hatHeight(hat) : 0);
      if (X.spinner) {
        const f = SPIN_SEQ[Math.floor(t / 120) % SPIN_SEQ.length];
        const color = this.isUltra() ? A.violet(t) : A.C.body;
        A.sprite(b, A.S.spin[f], CX - 6, top - 20, { X: color });
      }
      if (X.bang) {
        A.sprite(b, A.S.bang, CX - 3, top - 22 + Math.round(Math.sin(t / 140) * 2), { X: A.C.alert });
      }
      if (X.bulb) {
        const by = top - 26;
        A.sprite(b, A.S.bulb, CX - 4, by, { Y: '#FFE066', W: '#FFFFFF', G: '#9E9EA9', g: '#7A7A85' });
        if (Math.floor(t / 200) % 2) {
          for (const [dx, dy, w, h] of [[-6, 2, 3, 1], [12, 2, 3, 1], [-4, -3, 2, 2], [11, -3, 2, 2], [3, -6, 1, 3]]) {
            A.rect(b, '#FFE066', CX - 4 + dx, by + dy, w, h);
          }
        }
      }
      if (X.question) {
        A.sprite(b, A.S.bang, CX - 9, top - 22, { X: A.C.alert });
        A.sprite(b, A.S.question, CX + 1, top - 19, { X: '#79C0FF' });
      }
      if (X.nose) {
        const r = X.nose;
        if (r < 6) A.ring(b, '#CFE8FF', g.cx + 9, g.top + 20 - r, r);
        else A.sprite(b, A.S.sparkleSmall, g.cx + 7, g.top + 10, { X: '#CFE8FF' });
      }
      if (X.stars) {
        for (let i = 0; i < 3; i++) {
          const ang = t / 230 + (i * Math.PI * 2) / 3;
          A.sprite(b, A.S.star, CX - 4 + Math.cos(ang) * 28, g.top - 10 + Math.sin(ang) * 6, { X: '#FFD34D' });
        }
      }
    }

    drawParticle(b, p, t) {
      const k = p.age / p.life;
      const fade = k > 0.65 ? Math.max(0, (1 - k) / 0.35) : 1;
      const wob = Math.sin(p.age * 6 + p.seed) * 2.8;
      b.globalAlpha = fade;
      switch (p.kind) {
        case 'heart':
          if (p.age < 0.16) A.sprite(b, A.S.heartSmall, p.x + 2 + wob, p.y + 2, { X: A.C.heart });
          else A.sprite(b, A.S.heart, p.x + wob, p.y, { X: A.C.heart, h: A.C.heartLight });
          break;
        case 'heartSmall':
          A.sprite(b, A.S.heartSmall, p.x + wob, p.y, { X: A.C.heartSmall });
          break;
        case 'heartBig':
          A.sprite(b, A.S.heartBig, p.x, p.y, { X: A.C.heart, h: A.C.heartLight });
          break;
        case 'sparkle':
          A.sprite(b, Math.floor(p.age * 10) % 2 ? A.S.sparkle : A.S.sparkleFull, p.x, p.y, { X: p.color || '#FFFFFF' });
          break;
        case 'sparkleSmall':
          A.sprite(b, A.S.sparkleSmall, p.x, p.y, { X: p.color || '#FFFFFF' });
          break;
        case 'spark': {
          const c = A.hsl(p.hue, 90, 66 + 14 * Math.sin(p.age * 9 + p.seed));
          A.rect(b, c, p.x, p.y, 2, 2);
          break;
        }
        case 'confetti': {
          const flip = Math.floor(p.age * 9 + p.seed) % 2;
          const [w, h] = p.shape === 2 ? [3, 3] : flip ? [4, 2] : [2, 4];
          A.rect(b, p.color, p.x, p.y, w, h);
          break;
        }
        case 'z':
          A.sprite(b, k < 0.4 ? A.S.z : A.S.Z, p.x + wob * 0.6, p.y, { X: A.C.zzz });
          break;
        case 'note':
          A.sprite(b, A.S.note, p.x + wob, p.y, { X: p.color });
          break;
        case 'notes':
          A.sprite(b, A.S.notes, p.x + wob, p.y, { X: p.color });
          break;
        case 'code':
          A.glyph(b, p.char, p.x, p.y, p.color);
          break;
        case 'steam':
          b.globalAlpha = fade * 0.75;
          A.rect(b, p.color, p.x + wob, p.y, 1, 2);
          break;
        case 'puff':
          A.sprite(b, k < 0.5 ? A.S.puff : A.S.puffSmall, p.x + (k < 0.5 ? 0 : 2), p.y + (k < 0.5 ? 0 : 2), { X: A.C.puff });
          break;
        case 'sweat':
          A.sprite(b, A.S.sweat, p.x, p.y, { X: A.C.sweat });
          break;
        case 'puffSmall':
          A.sprite(b, A.S.puffSmall, p.x, p.y, { X: A.C.puff });
          break;
        case 'smoke': {
          const spr = k < 0.35 ? A.S.puff : k < 0.7 ? A.S.puffSmall : A.S.star;
          const sz = A.spriteSize(spr).w;
          A.sprite(b, spr, p.x - sz / 2, p.y - sz / 2, { X: A.C.puff });
          break;
        }
        case 'dust':
          b.globalAlpha = fade * 0.8;
          A.sprite(b, k < 0.5 ? A.S.puffSmall : A.S.star, p.x, p.y, { X: '#D9CDB8' });
          break;
        case 'ring':
          b.globalAlpha = Math.max(0, 1 - k);
          A.ring(b, p.color, p.x, p.y, p.r0 + (p.r1 - p.r0) * Math.sqrt(k));
          break;
        case 'rocket':
          if (p.delay > 0) break;
          A.rect(b, p.color, p.x, p.y, 2, 3);
          b.globalAlpha = 0.6;
          A.rect(b, '#FFE9A8', p.x, p.y + 4, 2, 2);
          A.rect(b, '#FFE9A8', p.x + (p.seed % 2 ? 1 : 0), p.y + 7, 1, 2);
          break;
        case 'fw':
          A.rect(b, p.color, p.x, p.y, k < 0.5 ? 2 : 1, k < 0.5 ? 2 : 1);
          break;
        default:
          break;
      }
      b.globalAlpha = 1;
    }
  }

  Engine.DUR = DUR;
  return Engine;
});
