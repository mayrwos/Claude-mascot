(function (root) {
  'use strict';

  class Sfx {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.enabled = true;
      this.volume = 0.18;
    }

    _ensure() {
      if (this.ctx) return this.ctx;
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      return this.attach(new AC());
    }

    attach(ctx) {
      this.ctx = ctx;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      return this.ctx;
    }

    _tone(freq, at, dur, opt) {
      opt = opt || {};
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = opt.type || 'square';
      osc.frequency.setValueAtTime(freq, at);
      if (opt.slide) osc.frequency.exponentialRampToValueAtTime(opt.slide, at + dur);
      const v = opt.vol == null ? 1 : opt.vol;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(v, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(at);
      osc.stop(at + dur + 0.02);
    }

    _noise(at, dur, opt) {
      opt = opt || {};
      const ctx = this.ctx;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = opt.cutoff || 1800;
      const gain = ctx.createGain();
      gain.gain.value = opt.vol == null ? 0.6 : opt.vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start(at);
    }

    play(name) {
      if (!this.enabled) return;
      const ctx = this._ensure();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const t = ctx.currentTime + 0.01;
      const T = (f, d, dt, o) => this._tone(f, t + (dt || 0), d, o);
      switch (name) {
        case 'pet':
          T(880, 0.06, 0, { vol: 0.5 });
          T(1318, 0.09, 0.06, { vol: 0.45 });
          break;
        case 'love':
          T(784, 0.08, 0, { type: 'triangle' });
          T(988, 0.08, 0.08, { type: 'triangle' });
          T(1175, 0.08, 0.16, { type: 'triangle' });
          T(1568, 0.22, 0.24, { type: 'triangle' });
          break;
        case 'jump':
          T(330, 0.16, 0, { slide: 990, vol: 0.45 });
          break;
        case 'land':
          T(160, 0.09, 0, { type: 'triangle', slide: 80, vol: 0.9 });
          break;
        case 'done':
          T(523, 0.08, 0, { vol: 0.5 });
          T(659, 0.08, 0.08, { vol: 0.5 });
          T(784, 0.08, 0.16, { vol: 0.5 });
          T(1047, 0.25, 0.24, { vol: 0.5 });
          break;
        case 'alert':
          T(988, 0.12, 0, { type: 'triangle', vol: 0.9 });
          T(1319, 0.22, 0.13, { type: 'triangle', vol: 0.9 });
          break;
        case 'oops':
          T(440, 0.25, 0, { slide: 180, vol: 0.4 });
          break;
        case 'poof':
          this._noise(t, 0.22, { cutoff: 2400, vol: 0.5 });
          break;
        case 'squish':
          T(620, 0.22, 0, { type: 'sine', slide: 260, vol: 0.8 });
          break;
        case 'power':
          [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => T(f, 0.07, i * 0.045, { vol: 0.4 }));
          T(2093, 0.3, 0.29, { type: 'triangle', vol: 0.4 });
          break;
        case 'startle':
          T(660, 0.05, 0, { vol: 0.5 });
          T(990, 0.08, 0.05, { vol: 0.5 });
          break;
        case 'dizzy':
          T(520, 0.4, 0, { type: 'sine', slide: 300, vol: 0.6 });
          T(380, 0.4, 0.2, { type: 'sine', slide: 560, vol: 0.6 });
          break;
        case 'pop':
          this._noise(t, 0.08, { cutoff: 5000, vol: 0.35 });
          T(1760, 0.05, 0.01, { type: 'triangle', vol: 0.4 });
          break;
        case 'boop':
          T(600, 0.05, 0, { type: 'sine', vol: 0.7 });
          break;
        default:
          break;
      }
    }
  }

  root.MascotSfx = Sfx;
})(typeof self !== 'undefined' ? self : this);
