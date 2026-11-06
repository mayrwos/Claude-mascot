(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.ClawdArt = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const U = 4;

  const C = {
    body: '#D77757',
    eye: '#1D1714',
    blush: '#F59AA0',
    mouth: '#7A2E2E',
    white: '#FFFFFF',
    heart: '#FF5C7A',
    heartLight: '#FFC2CF',
    heartSmall: '#FF85A1',
    gold: '#F5C542',
    alert: '#FFB224',
    zzz: '#BFD7FF',
    sweat: '#8FD3FF',
    puff: '#EDEDED',
  };

  function rect(ctx, color, x, y, w, h) {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function sprite(ctx, rows, x, y, pal, opt) {
    opt = opt || {};
    const ox = Math.round(x);
    const oy = Math.round(y);
    const prevAlpha = ctx.globalAlpha;
    if (opt.alpha != null) ctx.globalAlpha = prevAlpha * opt.alpha;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      let c = 0;
      while (c < row.length) {
        const ch = row[c];
        if (ch === '.' || ch === ' ') {
          c++;
          continue;
        }
        let end = c + 1;
        while (end < row.length && row[end] === ch) end++;
        const color = opt.color || (pal && pal[ch]) || (pal && pal.X);
        if (color) {
          ctx.fillStyle = color;
          const sx = opt.flip ? row.length - end : c;
          ctx.fillRect(ox + sx, oy + r, end - c, 1);
        }
        c = end;
      }
    }
    ctx.globalAlpha = prevAlpha;
  }

  function spriteSize(rows) {
    let w = 0;
    for (const r of rows) w = Math.max(w, r.length);
    return { w, h: rows.length };
  }

  function rasterize(w, h, f) {
    const rows = [];
    for (let r = 0; r < h; r++) {
      let s = '';
      for (let c = 0; c < w; c++) s += f(c, r) || '.';
      rows.push(s);
    }
    return rows;
  }

  function mirror(rows) {
    return rows.map((r) => r.split('').reverse().join(''));
  }

  function heartRows(w, h, highlight) {
    return rasterize(w, h, (c, r) => {
      const x = ((c + 0.5) / w) * 2.5 - 1.25;
      const y = 1.05 - ((r + 0.5) / h) * 2.35;
      const a = x * x + y * y - 1;
      if (a * a * a - x * x * y * y * y > 0) return null;
      if (highlight && x < -0.3 && x > -0.85 && y > 0.3 && y < 0.8) return 'h';
      return 'X';
    });
  }

  function discRows(d) {
    const r = d / 2;
    return rasterize(d, d, (c, rr) => ((c + 0.5 - r) ** 2 + (rr + 0.5 - r) ** 2 <= r * r ? 'X' : null));
  }

  function sparkleRows(size, hollow) {
    const m = (size - 1) / 2;
    return rasterize(size, size, (c, r) => {
      const dx = Math.abs(c - m);
      const dy = Math.abs(r - m);
      if (hollow && dx + dy <= 1 && size > 5) return null;
      if (dx === 0 || dy === 0) return 'X';
      if (dx + dy <= Math.max(1, Math.floor(size / 5))) return 'X';
      return null;
    });
  }

  function starRows(size) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 ? 0.45 : 1;
      pts.push([Math.cos(ang) * rad, Math.sin(ang) * rad]);
    }
    const inside = (x, y) => {
      let hit = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };
    return rasterize(size, size, (c, r) => (inside(((c + 0.5) / size) * 2 - 1, ((r + 0.5) / size) * 2 - 0.92) ? 'X' : null));
  }

  function spinRows(n, len, size) {
    const m = (size - 1) / 2;
    const cells = new Set([m + ',' + m]);
    for (let i = 0; i < n; i++) {
      const ang = (i * Math.PI * 2) / n - Math.PI / 2;
      for (let t = 1; t <= len; t++) {
        cells.add(Math.round(m + Math.cos(ang) * t) + ',' + Math.round(m + Math.sin(ang) * t));
        if (len > 3 && t >= len - 1) {
          const px = m + Math.cos(ang) * t;
          const py = m + Math.sin(ang) * t;
          cells.add(Math.round(px + Math.cos(ang + Math.PI / 2) * 0.8) + ',' + Math.round(py + Math.sin(ang + Math.PI / 2) * 0.8));
        }
      }
    }
    return rasterize(size, size, (c, r) => (cells.has(c + ',' + r) ? 'X' : null));
  }

  const S = {
    heart: [
      '..XXX...XXX..',
      '.XXXXX.XXXXX.',
      'XXhhXXXXXXXXX',
      'XXhXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      '.XXXXXXXXXXX.',
      '..XXXXXXXXX..',
      '...XXXXXXX...',
      '....XXXXX....',
      '.....XXX.....',
      '......X......',
    ],
    heartSmall: [
      '.XX...XX.',
      'XXXX.XXXX',
      'XXXXXXXXX',
      'XXXXXXXXX',
      '.XXXXXXX.',
      '..XXXXX..',
      '...XXX...',
      '....X....',
    ],
    heartBig: heartRows(23, 20, true),
    heartEye: [
      '.XX.XX.',
      'XXXXXXX',
      'XXXXXXX',
      '.XXXXX.',
      '..XXX..',
      '...X...',
    ],
    sparkle: sparkleRows(9, true),
    sparkleFull: sparkleRows(9, false),
    sparkleSmall: sparkleRows(5, false),
    star: starRows(9),
    puff: discRows(10),
    puffSmall: discRows(6),
    Z: [
      'XXXXXXXX',
      'XXXXXXXX',
      '.....XX.',
      '....XX..',
      '...XX...',
      '..XX....',
      'XXXXXXXX',
      'XXXXXXXX',
    ],
    z: ['XXXXX', '...X.', '..X..', '.X...', 'XXXXX'],
    bang: [
      '.XXXX.',
      'XXXXXX',
      'XXXXXX',
      '.XXXX.',
      '.XXXX.',
      '.XXXX.',
      '..XX..',
      '..XX..',
      '......',
      '..XX..',
      '.XXXX.',
      '..XX..',
    ],
    note: [
      '...XXXX.',
      '...XX.XX',
      '...XX..X',
      '...XX...',
      '...XX...',
      '...XX...',
      '.XXXX...',
      'XXXXX...',
      'XXXXX...',
      '.XXX....',
    ],
    notes: [
      '...XXXXXXXX',
      '...XXXXXXXX',
      '...XX....XX',
      '...XX....XX',
      '...XX....XX',
      '...XX....XX',
      '.XXXX..XXXX',
      'XXXXX.XXXXX',
      'XXXXX.XXXXX',
      '.XXX...XXX.',
    ],
    sweat: ['..X.', '.XX.', '.XXX', 'XXXX', 'XXXX', '.XX.'],
    question: [
      '.XXXXX.',
      'XX...XX',
      '.....XX',
      '...XXX.',
      '..XX...',
      '..XX...',
      '.......',
      '..XX...',
      '..XX...',
    ],
    bulb: [
      '..YYYYY..',
      '.YYWWYYY.',
      'YYWYYYYYY',
      'YYWYYYYYY',
      'YYYYYYYYY',
      '.YYYYYYY.',
      '..YYYYY..',
      '...GGG...',
      '...ggg...',
      '...GGG...',
      '....g....',
    ],
    magnifier: [
      '.GGG..',
      'GWWWG.',
      'GWWWG.',
      'GWWWG.',
      '.GGGG.',
      '....HH',
      '.....H',
    ],
    clipboard: [
      '.BBB.',
      'WWWWW',
      'WKKKW',
      'WWWWW',
      'WKKWW',
      'WWWWW',
    ],
    laptopMini: [
      '..GGGGGG..',
      '..GGOOGG..',
      '..GGGGGG..',
      'LLLLLLLLLL',
    ],
    mug: [
      'WWWWWWWWWW....',
      'WCCCCCCCCW....',
      'WWWWWWWWWWHHH.',
      'WWWWWWWWWW..HH',
      'WOOOOOOOOW...H',
      'WOOOOOOOOW...H',
      'WWWWWWWWWW..HH',
      'WWWWWWWWWWHHH.',
      '.WWWWWWWW.....',
    ],
    spin: [spinRows(0, 0, 13), spinRows(4, 3, 13), spinRows(6, 4, 13), spinRows(8, 6, 13)],
  };

  const FONT = {
    '<': ['...XX', '..XX.', '.XX..', 'XX...', '.XX..', '..XX.', '...XX'],
    '>': ['XX...', '.XX..', '..XX.', '...XX', '..XX.', '.XX..', 'XX...'],
    '/': ['....X', '...XX', '...X.', '..XX.', '.X...', 'XX...', 'X....'],
    '{': ['..XXX', '.XX..', '.XX..', 'XX...', '.XX..', '.XX..', '..XXX'],
    '}': ['XXX..', '..XX.', '..XX.', '...XX', '..XX.', '..XX.', 'XXX..'],
    '(': ['...XX', '..XX.', '.XX..', '.XX..', '.XX..', '..XX.', '...XX'],
    ')': ['XX...', '.XX..', '..XX.', '..XX.', '..XX.', '.XX..', 'XX...'],
    ';': ['.....', '.XX..', '.XX..', '.....', '.XX..', '.XX..', 'XX...'],
    '=': ['.....', 'XXXXX', 'XXXXX', '.....', 'XXXXX', 'XXXXX', '.....'],
    '0': ['.XXX.', 'XX.XX', 'XX.XX', 'XX.XX', 'XX.XX', 'XX.XX', '.XXX.'],
    '1': ['..XX.', '.XXX.', '..XX.', '..XX.', '..XX.', '..XX.', '.XXXX'],
    '2': ['.XXX.', 'XX.XX', '...XX', '..XX.', '.XX..', 'XX...', 'XXXXX'],
    '3': ['XXXX.', '...XX', '..XX.', '...XX', '...XX', 'XX.XX', '.XXX.'],
    '4': ['...XX', '..XXX', '.XXXX', 'XX.XX', 'XXXXX', '...XX', '...XX'],
    '5': ['XXXXX', 'XX...', 'XXXX.', '...XX', '...XX', 'XX.XX', '.XXX.'],
    '6': ['.XXX.', 'XX...', 'XXXX.', 'XX.XX', 'XX.XX', 'XX.XX', '.XXX.'],
    '7': ['XXXXX', '...XX', '..XX.', '..XX.', '.XX..', '.XX..', '.XX..'],
    '8': ['.XXX.', 'XX.XX', 'XX.XX', '.XXX.', 'XX.XX', 'XX.XX', '.XXX.'],
    '9': ['.XXX.', 'XX.XX', 'XX.XX', '.XXXX', '...XX', '...XX', '.XXX.'],
    '#': ['.X.X.', 'XXXXX', '.X.X.', '.X.X.', 'XXXXX', '.X.X.', '.....'],
    '+': ['.....', '..X..', '..X..', 'XXXXX', '..X..', '..X..', '.....'],
    '*': ['.....', 'X.X.X', '.XXX.', 'XXXXX', '.XXX.', 'X.X.X', '.....'],
    '$': ['..X..', '.XXXX', 'XX...', '.XXX.', '...XX', 'XXXX.', '..X..'],
  };

  function glyph(ctx, ch, x, y, color, alpha) {
    const rows = FONT[ch];
    if (!rows) return 4;
    sprite(ctx, rows, x, y, { X: color }, { alpha });
    return 6;
  }

  function text(ctx, str, x, y, color, alpha) {
    let cx = x;
    for (const ch of str) cx += glyph(ctx, ch, cx, y, color, alpha);
  }

  const EYES = {
    open: ['', '', '...XXXX', '...XXXX', '...XXXX', '...XXXX', '...XXXX', '...XXXX', '...XXXX', '...XXXX'],
    half: ['', '', '', '', '', '', '...XXXX', '...XXXX', '...XXXX', '...XXXX'],
    blink: ['', '', '', '', '', '', '', '', '...XXXX', '...XXXX'],
    focus: ['', '', '', '', '...XXXX', '...XXXX', '...XXXX', '...XXXX', '...XXXX', '...XXXX'],
    closed: ['', '', '', '', '', '.XX....XX', '..XX..XX', '...XXXX'],
    happy: ['', '', '', '', '...XXXX', '..XX..XX', '.XX....XX'],
    wide: ['', '..XXXXXX', '..WWXXXX', '..WWXXXX', '..XXXXXX', '..XXXXXX', '..XXXXXX', '..XXXXXX', '..XXXXXX', '..XXXXXX', '..XXXXXX'],
    shiny: ['', '', '...WWXX', '...WWXX', '...XXXX', '...XXXX', '...XXXX', '...XXXW', '...XXXX', '...XXXX'],
    dot: ['', '', '', '', '...XXXX', '...XXXX', '...XXXX', '...XXXX'],
    x: ['', '', '', '.XX....XX', '..XX..XX', '...XXXX', '....XX', '...XXXX', '..XX..XX', '.XX....XX'],
    squeeze: ['', '', '', '.XX', '..XXX', '....XXXX', '....XXXX', '..XXX', '.XX'],
  };
  const EYE_W = 10;
  const EYE_OX = 3;
  const EYE_OY = 2;
  for (const k of Object.keys(EYES)) EYES[k] = EYES[k].map((r) => r.padEnd(EYE_W, '.'));
  const EYES_R = {};
  for (const k of Object.keys(EYES)) EYES_R[k] = k === 'wide' || k === 'shiny' ? EYES[k] : mirror(EYES[k]);

  function drawEyes(ctx, g, kind, lx, ly) {
    const big = g.u === U;
    const dx = Math.round((lx || 0) * (big ? 2 : 1));
    const dy = Math.round((ly || 0) * (big ? 2 : 1));
    if (!big) {
      const closed = kind === 'blink' || kind === 'closed' || kind === 'happy';
      const eh = closed ? Math.max(1, g.u / 2) : 2 * g.u;
      const oy = 2 * g.u - eh;
      rect(ctx, C.eye, g.eyeL.x + dx, g.eyeL.y + oy + dy, g.u, eh);
      rect(ctx, C.eye, g.eyeR.x + dx, g.eyeR.y + oy + dy, g.u, eh);
      return;
    }
    if (kind === 'heart') {
      const hw = S.heartEye[0].length;
      sprite(ctx, S.heartEye, g.eyeL.x - 2 + dx, g.eyeL.y + 1 + dy, { X: C.heart });
      sprite(ctx, S.heartEye, g.eyeR.x + U + 2 - hw + dx, g.eyeR.y + 1 + dy, { X: C.heart });
      return;
    }
    const k = EYES[kind] ? kind : 'open';
    const pal = { X: C.eye, W: C.white };
    sprite(ctx, EYES[k], g.eyeL.x - EYE_OX + dx, g.eyeL.y - EYE_OY + dy, pal);
    sprite(ctx, EYES_R[k], g.eyeR.x - (EYE_W - EYE_OX - U) + dx, g.eyeR.y - EYE_OY + dy, pal);
  }

  const MOUTHS = {
    o: ['.XX.', 'XXXX', 'XXXX', '.XX.'],
    yawn: ['.XXXX.', 'XXXXXX', 'XXRRXX', 'XRRRRX', 'XRRRRX', '.XXXX.'],
    smile: ['X....X', 'XX..XX', '.XXXX.'],
    wobble: ['.XX...XX..', 'XX.XXX.XX.', '.....X..X.'],
  };

  function drawMouth(ctx, g, kind) {
    const rows = MOUTHS[kind];
    if (!rows || g.u !== U) return;
    const size = spriteSize(rows);
    sprite(ctx, rows, Math.round(g.cx - size.w / 2), g.top + Math.round(g.h * 0.62), { X: C.eye, R: C.mouth });
  }

  function drawShades(ctx, g, lx) {
    const dx = Math.round((lx || 0) * 2);
    const y = g.eyeL.y;
    const x0 = g.eyeL.x - 6 + dx;
    const x1 = g.eyeR.x + U + 6 + dx;
    const lw = 13;
    rect(ctx, '#111111', x0, y, x1 - x0, 2);
    rect(ctx, '#111111', x0, y + 2, lw, 6);
    rect(ctx, '#111111', x1 - lw, y + 2, lw, 6);
    rect(ctx, '#111111', x0 + 1, y + 8, lw - 2, 1);
    rect(ctx, '#111111', x1 - lw + 1, y + 8, lw - 2, 1);
    rect(ctx, C.white, x0 + 2, y + 2, 3, 1);
    rect(ctx, C.white, x0 + 2, y + 3, 1, 1);
    rect(ctx, C.white, x1 - lw + 2, y + 2, 3, 1);
    rect(ctx, C.white, x1 - lw + 2, y + 3, 1, 1);
  }

  function hatParty() {
    const w = 19;
    const h = 22;
    return {
      rows: rasterize(w, h, (c, r) => {
        if ((c - 9) ** 2 + (r - 2.5) ** 2 <= 7) return (c + r) % 3 === 0 ? 'p' : 'P';
        if (r < 4) return null;
        const half = 0.6 + ((r - 4) / (h - 5)) * 9;
        if (Math.abs(c - 9) > half) return null;
        if (r >= h - 2) return 'Y';
        return Math.floor((c - r * 0.8 + 40) / 3) % 2 ? 'B' : 'Y';
      }),
      pal: { P: '#FF7AA2', p: '#FFB3C7', B: '#4F7DF5', Y: '#FFD34D' },
      dx: 10,
      sink: 0,
    };
  }

  function hatCrown() {
    const spikes = [2, 7.5, 13, 18.5, 24];
    return {
      rows: rasterize(26, 13, (c, r) => {
        if (r >= 6) {
          if (r === 12) return 'D';
          if (r >= 8 && r <= 10) {
            if (c >= 11 && c <= 14) return 'R';
            if ((c >= 4 && c <= 6) || (c >= 19 && c <= 21)) return 'B';
          }
          return 'Y';
        }
        for (const s of spikes) {
          if ((c + 0.5 - s) ** 2 + (r - 1) ** 2 <= 2.2) return 'W';
          if (r >= 2 && Math.abs(c + 0.5 - s) <= (r - 1) * 0.8) return 'Y';
        }
        return null;
      }),
      pal: { Y: '#F5C542', D: '#C9961F', R: '#E5484D', B: '#4C8DF6', W: '#FFF4C2' },
      dx: 0,
      sink: 0,
    };
  }

  function hatSanta() {
    return {
      rows: rasterize(46, 20, (c, r) => {
        if ((c - 40) ** 2 + (r - 4) ** 2 <= 13) return (c * 7 + r * 3) % 5 === 0 ? 'w' : 'W';
        if (r >= 14) {
          if (c < 1 || c > 44) return null;
          if (r === 14 && c % 4 === 0) return null;
          return (c * 3 + r * 5) % 7 === 0 ? 'w' : 'W';
        }
        const t = r / 14;
        const left = 3 + (1 - t) * 22;
        const right = 42 - (1 - t) * (1 - t) * 5;
        const tipDrop = c > 30 ? (c - 30) * 0.15 : 0;
        if (c >= left && c <= right && r >= 3 + tipDrop * (1 - t)) return 'R';
        return null;
      }),
      pal: { R: '#E0323C', W: '#F4F4F4', w: '#DADADA' },
      dx: 3,
      sink: 4,
    };
  }

  function hatBeanie() {
    return {
      rows: rasterize(48, 18, (c, r) => {
        if ((c - 24) ** 2 + (r - 3) ** 2 <= 10) return (c + r) % 3 ? 'W' : 'w';
        if (r < 5) return null;
        if (r >= 12) return c % 4 < 2 ? 'L' : 'N';
        const dy = (12 - r) / 8;
        const half = 24 * Math.sqrt(Math.max(0, 1 - dy * dy));
        if (Math.abs(c + 0.5 - 24) > half) return null;
        return (c + (r % 2)) % 6 === 0 ? 'n' : 'N';
      }),
      pal: { N: '#38476B', n: '#2F3C5B', L: '#55678F', W: '#F2F2F2', w: '#D9D9D9' },
      dx: 0,
      sink: 6,
    };
  }

  function hatWizard() {
    const h = 26;
    return {
      rows: rasterize(34, h, (c, r) => {
        if (r >= h - 4) {
          const dx = (c + 0.5 - 17) / 17;
          const dy = (r - (h - 2.5)) / 2;
          return dx * dx + dy * dy <= 1 ? (r === h - 4 ? 'p' : 'P') : null;
        }
        const t = r / (h - 4);
        const center = 17 + (1 - t) * (1 - t) * 9;
        const half = 1 + t * 9;
        if (Math.abs(c + 0.5 - center) > half) return null;
        if (r === 10 && Math.abs(c + 0.5 - center + 2) <= 1) return 'Y';
        if (r === 16 && Math.abs(c + 0.5 - center - 2) <= 1) return 'Y';
        if ((r === 9 || r === 11) && Math.abs(c + 0.5 - center + 2) < 0.6) return 'Y';
        if ((r === 15 || r === 17) && Math.abs(c + 0.5 - center - 2) < 0.6) return 'Y';
        return 'P';
      }),
      pal: { P: '#6E56CF', p: '#8B76E0', Y: '#FFD34D' },
      dx: 4,
      sink: 2,
    };
  }

  function trimTop(hat) {
    while (hat.rows.length && /^\.*$/.test(hat.rows[0])) hat.rows.shift();
    return hat;
  }

  S.hats = {
    party: trimTop(hatParty()),
    crown: trimTop(hatCrown()),
    santa: trimTop(hatSanta()),
    beanie: trimTop(hatBeanie()),
    wizard: trimTop(hatWizard()),
  };

  function hatHeight(type) {
    const hat = S.hats[type];
    if (!hat) return 0;
    return hat.rows.length - (hat.sink || 0);
  }

  function drawHat(ctx, g, type, dy) {
    const hat = S.hats[type];
    if (!hat) return;
    const size = spriteSize(hat.rows);
    const x = Math.round(g.cx - size.w / 2 + (hat.dx || 0));
    const y = g.top - size.h + (hat.sink || 0) + Math.round(dy || 0);
    sprite(ctx, hat.rows, x, y, hat.pal);
  }

  function geometry(p) {
    const u = p.u || U;
    const w = p.w || 12 * u;
    const h = p.h || 8 * u;
    const legH = p.sit ? 0 : p.legH == null ? 2 * u : p.legH;
    const left = Math.round(p.cx - w / 2) + Math.round(p.dx || 0);
    const bottom = Math.round(p.ground - (p.lift || 0)) - legH;
    const top = bottom - h;
    const right = left + w;
    const ex = Math.round((w * 2) / 12);
    const ey = Math.round((h * 2) / 8);
    return {
      u,
      w,
      h,
      left,
      right,
      top,
      bottom,
      legH,
      cx: left + w / 2,
      eyeL: { x: left + ex, y: top + ey },
      eyeR: { x: right - ex - u, y: top + ey },
      armY: top + Math.round((h * 4) / 8),
    };
  }

  function armRect(side, kind, g) {
    const L = side < 0;
    const a = 2 * g.u;
    const ax = L ? g.left - a : g.right;
    const out = (n) => ax + (L ? -n : n);
    switch (kind) {
      case 'up':
        return { x: ax, y: g.top - a / 2, w: a, h: a };
      case 'upOut':
        return { x: out(g.u / 2), y: g.top - a * 0.75, w: a, h: a };
      case 'high':
        return { x: ax, y: g.top - a, w: a, h: a };
      case 'mid':
        return { x: ax, y: g.top + a * 0.75, w: a, h: a };
      case 'midOut':
        return { x: out(g.u / 2), y: g.top + a / 2, w: a, h: a };
      case 'down':
        return { x: ax, y: g.bottom - a, w: a, h: a };
      case 'out':
        return { x: L ? g.left - a * 1.75 : g.right, y: g.armY + g.u / 2, w: a * 1.75, h: a * 0.75 };
      case 'type':
        return { x: ax + (L ? g.u / 2 : -g.u / 2), y: g.armY + a * 0.75, w: a, h: a * 0.75 };
      case 'typeUp':
        return { x: ax, y: g.armY, w: a, h: a * 0.75 };
      case 'hold':
        return { x: ax, y: g.armY, w: a, h: a, mug: { x: L ? ax - 13 : ax + 3, y: g.armY - 9 } };
      case 'sip':
        return { x: ax, y: g.top + a * 0.75, w: a, h: a, mug: { x: L ? g.left - 11 : g.right - 4, y: g.top + 4 } };
      case 'swingA':
        return { x: ax, y: g.armY - Math.round(g.u / 2), w: a, h: a };
      case 'swingB':
        return { x: ax, y: g.armY + Math.round(g.u / 2), w: a, h: a };
      case 'hidden':
        return null;
      case 'side':
      default:
        return { x: ax, y: g.armY, w: a, h: a };
    }
  }

  function drawArm(ctx, r) {
    if (r) rect(ctx, C.body, r.x, r.y, r.w, r.h);
  }

  const LEG_UNITS = [1, 3, 8, 10];

  function drawLegs(ctx, g, kind, phase, shift) {
    if (!g.legH) return;
    const sh = Math.round(shift || 0);
    for (let i = 0; i < 4; i++) {
      const x = g.left + Math.round((LEG_UNITS[i] * g.w) / 12);
      let h = g.legH;
      let dx = 0;
      if (kind === 'walk1' || kind === 'walk2') {
        const lifted = (i % 2 === 0) === (kind === 'walk1');
        if (lifted) h = Math.max(1, h - Math.round(g.u / 2));
      } else if (kind === 'dangle') {
        const swing = (i + (phase || 0)) % 2;
        h = g.legH + (swing ? Math.round(g.u / 2) : 0);
        dx = swing ? (i < 2 ? -1 : 1) : 0;
      } else if (kind === 'tuck') {
        h = Math.min(Math.round(g.u * 0.75), h);
      } else if (kind === 'tap' && i === 3) {
        h = Math.max(1, h - Math.round(g.u / 2) * (phase || 0));
      }
      if (sh) {
        const top = Math.ceil(h / 2);
        rect(ctx, C.body, x + dx, g.bottom, g.u, top);
        rect(ctx, C.body, x + dx + sh, g.bottom + top, g.u, h - top + Math.min(2, Math.abs(sh) >> 1));
        continue;
      }
      rect(ctx, C.body, x + dx, g.bottom, g.u, h);
    }
  }

  function drawClawd(ctx, pose) {
    const g = geometry(pose);
    const armL = pose.armLRect !== undefined ? pose.armLRect : armRect(-1, pose.armL || 'side', g);
    const armR = pose.armRRect !== undefined ? pose.armRRect : armRect(1, pose.armR || 'side', g);

    drawLegs(ctx, g, pose.legs || 'stand', pose.legPhase || 0, pose.legShift);
    drawArm(ctx, armL);
    drawArm(ctx, armR);
    rect(ctx, C.body, g.left, g.top, g.w, g.h);

    if (pose.tint) {
      const a = ctx.globalAlpha;
      ctx.globalAlpha = a * (pose.tintAlpha == null ? 0.18 : pose.tintAlpha);
      rect(ctx, pose.tint, g.left, g.top, g.w, pose.tintH || g.h);
      ctx.globalAlpha = a;
    }

    if (pose.blush && g.u === U) {
      rect(ctx, C.blush, g.eyeL.x - 5, g.eyeL.y + 10, 6, 2);
      rect(ctx, C.blush, g.eyeR.x + 3, g.eyeR.y + 10, 6, 2);
    }

    if (!pose.shades) drawEyes(ctx, g, pose.eyes || 'open', pose.lookX, pose.lookY);
    drawMouth(ctx, g, pose.mouth);
    if (pose.shades) drawShades(ctx, g, pose.lookX);
    if (pose.hat) drawHat(ctx, g, pose.hat, pose.hatDy);

    g.armLRect = armL;
    g.armRRect = armR;
    return g;
  }

  function drawMini(ctx, cx, ground, opt) {
    opt = opt || {};
    const u = opt.u || U / 2;
    const g = drawClawd(ctx, {
      cx,
      ground,
      u,
      lift: opt.lift || 0,
      legs: opt.walk ? (opt.walk === 1 ? 'walk1' : 'walk2') : 'stand',
      eyes: opt.blink ? 'blink' : 'open',
      lookX: opt.lookX || 0,
      armL: opt.armsUp ? 'up' : 'side',
      armR: opt.wave || opt.armsUp ? 'up' : 'side',
    });
    const side = opt.facing < 0 ? -1 : 1;
    const hand = side > 0 ? g.armRRect : g.armLRect;
    if (opt.prop === 'magnifier' && hand) {
      sprite(ctx, S.magnifier, side > 0 ? hand.x + hand.w - 1 : hand.x - 5, hand.y - 5, { G: '#8E8E99', W: '#CFE8FF', H: '#6B4A2B' }, { flip: side < 0 });
    } else if (opt.prop === 'clipboard' && hand) {
      sprite(ctx, S.clipboard, side > 0 ? hand.x + hand.w : hand.x - 5, hand.y - 3, { B: '#8E8E99', W: '#F4F1EA', K: '#5A5A66' });
    } else if (opt.prop === 'laptop') {
      sprite(ctx, S.laptopMini, Math.round(g.cx - 5), ground - 4, { G: '#3B3B42', O: C.body, L: '#B9B9C3' });
    }
    const top = Math.min(g.top, g.armLRect.y, g.armRRect.y);
    return { left: g.left - 2 * u, top, right: g.right + 2 * u, bottom: ground };
  }

  const LAPTOP = { lidW: 44, lidH: 19, baseW: 56, baseH: 4 };

  function laptopRect(cx, ground) {
    const lx = Math.round(cx - LAPTOP.lidW / 2);
    const ly = ground - LAPTOP.baseH - LAPTOP.lidH;
    return { x: lx, y: ly, w: LAPTOP.lidW, h: LAPTOP.lidH, baseX: Math.round(cx - LAPTOP.baseW / 2), baseY: ground - LAPTOP.baseH };
  }

  const LOGO = spinRows(8, 4, 9);

  function drawLaptop(ctx, cx, ground, opt) {
    opt = opt || {};
    const r = laptopRect(cx, ground);
    rect(ctx, '#46464F', r.x, r.y, r.w, r.h);
    rect(ctx, '#3B3B42', r.x + 1, r.y + 1, r.w - 2, r.h - 3);
    rect(ctx, '#2C2C32', r.x + 3, r.y + r.h - 2, r.w - 6, 2);
    sprite(ctx, LOGO, Math.round(cx - 4), r.y + 4, { X: opt.logoColor || C.body });
    rect(ctx, '#7EE787', r.x + r.w - 9, r.y + 3, 4, 3);
    rect(ctx, '#B9B9C3', r.baseX, r.baseY, LAPTOP.baseW, LAPTOP.baseH - 1);
    rect(ctx, '#8E8E99', r.baseX + 1, r.baseY + LAPTOP.baseH - 1, LAPTOP.baseW - 2, 1);
    rect(ctx, '#A3A3AE', Math.round(cx - 6), r.baseY + 1, 12, 1);
    return r;
  }

  function ring(ctx, color, cx, cy, r) {
    if (r < 1) {
      rect(ctx, color, cx, cy, 1, 1);
      return;
    }
    const steps = Math.max(8, Math.ceil(r * 6.3));
    let lx = null;
    let ly = null;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r);
      if (x === lx && y === ly) continue;
      lx = x;
      ly = y;
      rect(ctx, color, x, y, 1, 1);
    }
  }

  function drawMug(ctx, x, y, opt) {
    sprite(ctx, S.mug, x, y, { W: '#F4F1EA', C: '#6F4026', H: '#F4F1EA', O: C.body }, opt);
  }

  function hsl(h, s, l) {
    return 'hsl(' + Math.round(((h % 360) + 360) % 360) + ',' + s + '%,' + Math.round(l) + '%)';
  }

  function hslToRgb(h, s, l) {
    h = (((h % 360) + 360) % 360) / 360;
    s /= 100;
    l /= 100;
    const f = (n) => {
      const k = (n + h * 12) % 12;
      const a = s * Math.min(l, 1 - l);
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  }

  function violetHsl(t, k) {
    k = k || 0;
    return [262 + 8 * Math.sin(t / 900 + k * 0.5), 86, 64 + 13 * Math.sin(t / 240 - k)];
  }

  function violet(t, k) {
    const [h, s, l] = violetHsl(t, k);
    return hsl(h, s, l);
  }

  function violetRgb(t, k) {
    const [h, s, l] = violetHsl(t, k);
    return hslToRgb(h, s, l);
  }

  return {
    U,
    C,
    S,
    FONT,
    EYES,
    LAPTOP,
    rect,
    sprite,
    spriteSize,
    rasterize,
    glyph,
    text,
    geometry,
    armRect,
    drawClawd,
    drawMini,
    drawEyes,
    drawHat,
    hatHeight,
    drawShades,
    drawLaptop,
    laptopRect,
    drawMug,
    ring,
    hsl,
    hslToRgb,
    violet,
    violetRgb,
  };
});
