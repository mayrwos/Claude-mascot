(function () {
  'use strict';

  const L = window.MascotLayout;
  const I18N = window.MascotI18n;
  const api = window.mascot || createMockApi();

  const $ = (id) => document.getElementById(id);
  const canvas = $('scene');
  const bubble = $('bubble');
  const bubbleBody = $('bubble-body');
  const toolbar = $('toolbar');
  const btnOpen = $('btn-open');
  const btnHide = $('btn-hide');

  const SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
  let spinIdx = 0;
  const PET_MILESTONES = [10, 50, 100, 250, 500, 1000];

  let settings = {};
  let strings = I18N.dict('en');
  let tracker = new window.SessionTracker();
  const sfx = new window.MascotSfx();
  let speech = null;
  let bubbleDismissedSig = null;
  let lastBubbleSig = '';
  let currentDismissKey = '';
  let press = null;
  let locale = 'en';
  let viewport = null;
  let visible = true;
  let lastRegions = '';
  let dpr = window.devicePixelRatio || 1;
  let hoverUntil = 0;
  let toolbarShown = false;
  let pets = 0;
  let firstRun = false;
  let hooksInstalled = false;
  let lastChatter = -Infinity;

  const engine = new window.MascotEngine({
    canvas,
    settings: {},
    callbacks: {
      say: (key) => sayKey(key, 3200),
      sound: (name) => sfx.play(name),
      walk: (dx) => api.walk(dx),
      hidden: () => api.hide(),
      chatter: (kind) => chatter(kind),
      pet: () => onPet(),
    },
  });

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function line(key, vars) {
    const arr = strings.lines[key];
    if (!arr || !arr.length) return '';
    return I18N.format(arr[Math.floor(Math.random() * arr.length)], vars);
  }

  function say(text, ms, cls) {
    if (!text) return;
    speech = { text, until: performance.now() + (ms || 3500), cls: cls || '' };
    bubbleDismissedSig = null;
    renderBubble(true);
  }

  function sayKey(key, ms, vars) {
    say(line(key, vars), ms);
  }

  function chatter(kind) {
    if (settings.speech === false || engine.sleeping) return;
    const now = performance.now();
    if (now - lastChatter < 15000) return;
    lastChatter = now;
    const hour = new Date().getHours();
    if (kind === 'idle' && hour >= 1 && hour < 5 && Math.random() < 0.5) return sayKey('night', 4500);
    if (kind === 'idle' && hour >= 6 && hour < 10 && Math.random() < 0.2) return sayKey('morning', 4000);
    if (kind === 'tip') return sayKey('tips', 6500);
    sayKey('idle', 4000);
  }

  function onPet() {
    pets += 1;
    api.setSetting('pets', pets);
    const next = PET_MILESTONES.includes(pets) || (pets > 1000 && pets % 1000 === 0);
    if (next) say(I18N.format(line('petMilestone'), { n: pets }), 4000);
  }

  function toolVerb(tool) {
    if (!tool) return strings.tools.default;
    if (strings.tools[tool]) return strings.tools[tool];
    if (/^mcp__/.test(tool)) return strings.tools.mcp;
    return strings.tools.default;
  }

  function sessionVerb(s) {
    let h = 0;
    for (const ch of s.id + ':' + (s.turnStart || 0)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return strings.verbs[h % strings.verbs.length];
  }

  function fmtDuration(ms) {
    const sec = Math.max(0, Math.round(ms / 1000));
    if (sec < 60) return sec + 's';
    const m = Math.floor(sec / 60);
    if (m < 60) return m + 'm ' + (sec % 60) + 's';
    return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  }

  function toolCall(s) {
    if (!s.tool) return '';
    if (/^mcp__/.test(s.tool)) return '<b>' + esc(s.target || s.tool) + '</b> <span class="dim">(MCP)</span>';
    if (!s.target) return '<b>' + esc(s.tool) + '</b>';
    return '<b>' + esc(s.tool) + '</b><span class="dim">(</span>' + esc(s.target) + '<span class="dim">)</span>';
  }

  function spinnerLine(s, verb, proj) {
    const since = s.turnStart || s.stateAt;
    const ultra = s.ultra ? '<span class="ultra">' + esc(strings.ui.ultra) + '</span> ' : '';
    return (
      '<div class="line st-spin"><span class="glyph spin">✻</span><span class="label">' + ultra +
      '<span class="shimmer">' + esc(verb) + '…</span> <span class="dim">(<span class="elapsed" data-since="' + since +
      '"></span>)</span></span>' + (proj || '') + '</div>'
    );
  }

  function statusLine(s, single) {
    const proj = s.project ? '<span class="proj">' + esc(s.project) + '</span>' : '';
    switch (s.state) {
      case 'think':
        return spinnerLine(s, sessionVerb(s), proj);
      case 'work': {
        if (!s.tool) return spinnerLine(s, sessionVerb(s), proj);
        const call = '<div class="line st-work"><span class="glyph dot">●</span><span class="label">' + toolCall(s) + '</span>' + proj + '</div>';
        return single ? call + spinnerLine(s, toolVerb(s.tool)) : call;
      }
      case 'wait': {
        const what = s.tool ? toolCall(s) : esc(s.message || strings.ui.waiting);
        return (
          '<div class="line st-wait"><span class="glyph dot">●</span><span class="label">' + what + '</span>' + proj + '</div>' +
          (s.tool || s.message ? '<div class="line st-ask"><span class="glyph">?</span><span class="label">' + esc(strings.ui.waiting) + '</span></div>' : '')
        );
      }
      case 'done': {
        const text = s.turnMs >= 1000 ? I18N.format(strings.ui.doneIn, { t: fmtDuration(s.turnMs) }) : strings.ui.done;
        return '<div class="line st-done"><span class="glyph">✻</span><span class="label">' + esc(text) + '</span>' + proj + '</div>';
      }
      case 'error':
        return '<div class="line st-error"><span class="glyph">✗</span><span class="label">' + esc(strings.ui.error) + '</span>' + proj + '</div>';
      default:
        return '';
    }
  }

  function updateLive() {
    for (const el of bubbleBody.querySelectorAll('.spin')) el.textContent = SPIN[spinIdx];
    const now = Date.now();
    for (const el of bubbleBody.querySelectorAll('.elapsed')) {
      const t = fmtDuration(now - Number(el.dataset.since || now));
      if (el.textContent !== t) el.textContent = t;
    }
  }

  function renderBubble(force) {
    const now = performance.now();
    const agg = tracker.aggregate(Date.now());
    let html = '';
    let sig = '';
    let dismissKey = '';
    let cls = '';
    if (speech && now < speech.until) {
      html = '<div class="speech">' + esc(speech.text) + '</div>';
      sig = 'speech:' + speech.text;
      dismissKey = sig;
      cls = speech.cls;
    } else if (agg.list.length) {
      speech = null;
      const shown = agg.list.slice(0, 3);
      const multi = agg.total > 1;
      html = shown.map((s) => statusLine(s, shown.length === 1)).join('');
      if (agg.list.length > shown.length) {
        html += '<div class="more">' + esc(I18N.format(strings.ui.more, { n: agg.list.length - shown.length })) + '</div>';
      }
      sig = 'status:' + html;
      dismissKey = 'status:' + agg.list.map((x) => x.id + ':' + x.state).join('|');
      cls = multi ? 'status multi' : 'status';
      if (agg.list[0].state === 'wait') cls += ' attention';
      else if (shown.some((s) => s.ultra)) cls += ' ultra-mode';
    } else {
      speech = null;
    }
    if (dismissKey && dismissKey === bubbleDismissedSig) html = '';
    currentDismissKey = dismissKey;
    if (!html) {
      if (!bubble.classList.contains('hidden')) bubble.classList.add('hidden');
      lastBubbleSig = '';
      return;
    }
    if (sig !== lastBubbleSig || force) {
      bubbleBody.innerHTML = html;
      bubble.className = 'bubble ' + cls;
      lastBubbleSig = sig;
      updateLive();
      layout();
    }
  }

  setInterval(() => {
    if (!visible || bubble.classList.contains('hidden')) return;
    spinIdx = (spinIdx + 1) % SPIN.length;
    updateLive();
  }, 120);
  setInterval(() => {
    engine.setClaude(tracker.aggregate(Date.now()));
    if (!visible) return;
    renderBubble(false);
    layout();
  }, 400);

  bubble.addEventListener('click', () => {
    bubbleDismissedSig = currentDismissKey;
    speech = null;
    bubble.classList.add('hidden');
    lastBubbleSig = '';
  });

  function placeCentered(el, centerX) {
    const w = el.offsetWidth || 0;
    let x = centerX;
    if (viewport && w) {
      const lo = viewport.left + 6 + w / 2;
      const hi = viewport.right - 6 - w / 2;
      x = lo > hi ? (viewport.left + viewport.right) / 2 : Math.min(hi, Math.max(lo, x));
    }
    el.style.left = Math.round(x) + 'px';
    return x - centerX;
  }

  function layout() {
    const scale = settings.scale || L.DEFAULT_SCALE;
    const canvasTop = window.innerHeight - L.GRID_H * scale;
    const headTop = canvasTop + engine.headTop() * scale;
    const overlayTop = canvasTop + engine.restingTop() * scale;
    const center = window.innerWidth / 2;
    const tbH = toolbar.offsetHeight || 32;
    const tbTop = Math.max(4, headTop - tbH - 8);
    toolbar.style.top = tbTop + 'px';
    placeCentered(toolbar, center);
    let anchor = overlayTop - 8;
    if (toolbarShown) anchor = Math.min(anchor, tbTop - 6);
    bubble.style.bottom = Math.round(window.innerHeight - anchor) + 'px';
    if (!bubble.classList.contains('hidden')) {
      const shift = placeCentered(bubble, center);
      const room = Math.max(0, bubble.offsetWidth / 2 - 14);
      bubble.style.setProperty('--tail', Math.round(Math.max(-room, Math.min(room, -shift))) + 'px');
    }
    sendRegions();
  }

  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return [Math.floor(r.left), Math.floor(r.top), Math.ceil(r.width), Math.ceil(r.height)];
  }

  function sendRegions() {
    if (!api.setRegions) return;
    const scale = settings.scale || L.DEFAULT_SCALE;
    const c = canvas.getBoundingClientRect();
    const rects = engine.hit.map((h) => [
      Math.floor(c.left + (h.x - 2) * scale),
      Math.floor(c.top + (h.y - 2) * scale),
      Math.ceil((h.w + 4) * scale),
      Math.ceil((h.h + 4) * scale),
    ]);
    if (toolbarShown) rects.push(rectOf(toolbar));
    if (!bubble.classList.contains('hidden')) rects.push(rectOf(bubble));
    const key = JSON.stringify(rects) + (press ? '!' : '');
    if (key === lastRegions) return;
    lastRegions = key;
    api.setRegions(rects, !!press);
  }

  setInterval(() => {
    if (visible) sendRegions();
  }, 100);

  function showToolbar(v) {
    if (v === toolbarShown) return;
    toolbarShown = v;
    toolbar.classList.toggle('hidden', !v);
    layout();
  }

  function toCell(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const scale = settings.scale || L.DEFAULT_SCALE;
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
  }

  function overMascot(clientX, clientY) {
    const c = toCell(clientX, clientY);
    return engine.hitTest(c.x, c.y);
  }

  function isInteractive(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    if (el && toolbarShown && toolbar.contains(el)) return true;
    if (el && !bubble.classList.contains('hidden') && bubble.contains(el)) return true;
    return overMascot(clientX, clientY);
  }

  function pointerAt(x, y) {
    const c = toCell(x, y);
    engine.setCursor(c.x, c.y);
    if (press || engine.drag || engine.falling) return;
    const inside = x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight;
    const onMascot = inside && overMascot(x, y);
    const onToolbar = inside && toolbarShown && toolbar.contains(document.elementFromPoint(x, y));
    if (onMascot) engine.hoverPing();
    if (onMascot || onToolbar) {
      hoverUntil = performance.now() + 1400;
      showToolbar(true);
    }
  }

  document.addEventListener('mousemove', (e) => pointerAt(e.clientX, e.clientY));

  setInterval(() => {
    if (toolbarShown && !press && performance.now() > hoverUntil) showToolbar(false);
  }, 200);

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (!overMascot(e.clientX, e.clientY)) return;
    press = { x: e.screenX, y: e.screenY, dragging: false, id: e.pointerId };
    sendRegions();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!press || press.dragging) return;
    if (Math.abs(e.screenX - press.x) + Math.abs(e.screenY - press.y) > 4) {
      press.dragging = true;
      showToolbar(false);
      engine.dragStart();
      api.dragStart();
    }
  });

  function endPress(cancelled) {
    if (!press) return;
    const p = press;
    press = null;
    sendRegions();
    if (p.dragging) {
      engine.dragEnd();
      api.dragEnd();
    } else if (!cancelled) {
      engine.click();
    }
  }

  canvas.addEventListener('pointerup', (e) => {
    if (e.button !== 0) return;
    endPress(false);
  });
  canvas.addEventListener('pointercancel', () => endPress(true));
  canvas.addEventListener('lostpointercapture', () => endPress(true));

  canvas.addEventListener('dblclick', (e) => {
    if (overMascot(e.clientX, e.clientY)) engine.dblclick();
  });

  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (isInteractive(e.clientX, e.clientY)) api.contextMenu();
  });

  btnOpen.addEventListener('click', () => {
    sfx.play('boop');
    api.openClaude();
  });
  btnHide.addEventListener('click', () => {
    showToolbar(false);
    engine.command('hide');
  });

  function onClaude(ev) {
    const effects = tracker.apply(ev, Date.now());
    engine.setClaude(tracker.aggregate(Date.now()));
    for (const fx of effects) {
      engine.claudeEffect(fx);
      if (fx === 'greet') sayKey('greet', 3500, { project: ev.project || 'Claude Code' });
      else if (fx === 'bye') sayKey('bye', 3000);
      else if (fx === 'squish') sayKey('compact', 2400);
      else if (fx === 'nudge') sayKey('idlePrompt', 4000);
    }
    renderBubble(true);
  }

  function runDemo() {
    const S = 'demo-session';
    const P = 'claude-mascot';
    const steps = [
      [0, { event: 'SessionStart', source: 'startup' }],
      [1500, { event: 'UserPromptSubmit' }],
      [4200, { event: 'PreToolUse', tool: 'Read', target: 'app.js' }],
      [5600, { event: 'PostToolUse', tool: 'Read' }],
      [5800, { event: 'PreToolUse', tool: 'Edit', target: 'engine.js' }],
      [7800, { event: 'PreToolUse', tool: 'Agent', target: 'Explore', toolUseId: 'demo-t1' }],
      [8000, { event: 'SubagentStart', agentId: 'demo-a1' }],
      [8600, { event: 'SubagentStart', agentId: 'demo-a2' }],
      [11200, { event: 'SubagentStop', agentId: 'demo-a1' }],
      [11600, { event: 'SubagentStop', agentId: 'demo-a2' }],
      [11700, { event: 'PostToolUse', tool: 'Agent', toolUseId: 'demo-t1' }],
      [12000, { event: 'PermissionRequest', tool: 'Bash', target: 'npm test' }],
      [16000, { event: 'PreToolUse', tool: 'Bash', target: 'npm test' }],
      [17500, { event: 'PostToolUseFailure', tool: 'Bash' }],
      [19500, { event: 'PreCompact' }],
      [22000, { event: 'Stop' }],
      [25500, { event: 'UserPromptSubmit', ultra: true }],
      [28000, { event: 'PreToolUse', tool: 'Write', target: 'ultra.js' }],
      [32500, { event: 'Stop' }],
      [36500, { event: 'SessionEnd' }],
    ];
    for (const [at, ev] of steps) {
      setTimeout(() => onClaude(Object.assign({ session: S, project: P, at: Date.now() }, ev)), at);
    }
  }

  function applySettings(s, state) {
    const prevScale = settings.scale;
    settings = Object.assign({}, settings, s);
    if (state && state.locale) locale = state.locale;
    const lang = I18N.resolveLang(settings.lang, locale);
    strings = I18N.dict(lang);
    document.documentElement.lang = lang;
    $('btn-open-label').textContent = strings.ui.open;
    $('btn-hide-label').textContent = strings.ui.hide;
    btnOpen.title = strings.ui.openTitle;
    btnHide.title = strings.ui.hideTitle;
    sfx.enabled = settings.sounds !== false;
    engine.setSettings({
      hat: settings.hat,
      ultra: !!settings.ultra,
      wander: !!settings.wander,
      speech: settings.speech !== false,
      sleepAfterMin: settings.sleepAfterMin || 5,
    });
    if (settings.scale !== prevScale) {
      engine.setScale(settings.scale || L.DEFAULT_SCALE, window.devicePixelRatio || 1);
      document.documentElement.style.setProperty('--scale', String(settings.scale || L.DEFAULT_SCALE));
    }
    if (typeof settings.pets === 'number' && settings.pets > pets) pets = settings.pets;
    renderBubble(true);
    layout();
  }

  function handleCommand(name, arg) {
    switch (name) {
      case 'say':
        lastChatter = -Infinity;
        return chatter('idle');
      case 'tip':
        lastChatter = -Infinity;
        return chatter('tip');
      case 'demo':
        return runDemo();
      case 'welcome':
        engine.command('wave');
        return sayKey('welcome', 3000);
      case 'appear':
        engine.command('appear');
        return;
      case 'say-text':
        return say(String(arg || '').slice(0, 200), 5000);
      default:
        engine.command(name);
    }
  }

  async function boot() {
    const state = await api.getState();
    hooksInstalled = !!state.hooksInstalled;
    if (state.viewport) viewport = state.viewport;
    firstRun = !!state.firstRun;
    pets = (state.settings && state.settings.pets) || 0;
    applySettings(state.settings || {}, state);

    api.on('settings', (s) => applySettings(s));
    api.on('claude', (ev) => onClaude(ev));
    api.on('command', (msg) => handleCommand(msg && msg.name, msg && msg.arg));
    api.on('physics', (ev) => {
      engine.physics(ev);
      if (ev && ev.type === 'fall') showToolbar(false);
    });
    api.on('cursor', (p) => pointerAt(p.x, p.y));
    api.on('hooks', (h) => {
      hooksInstalled = !!(h && h.installed);
    });
    api.on('visibility', (v) => {
      visible = !!(v && v.visible);
      if (visible) engine.start();
      else engine.stop();
    });
    api.on('viewport', (v) => {
      viewport = v;
      layout();
    });
    window.addEventListener('resize', () => {
      if ((window.devicePixelRatio || 1) !== dpr) {
        dpr = window.devicePixelRatio || 1;
        engine.setScale(settings.scale || L.DEFAULT_SCALE, dpr);
      }
      layout();
    });

    engine.start();
    engine.command('appear');

    if (firstRun) {
      setTimeout(() => sayKey('firstRun', 7000), 1200);
      if (!hooksInstalled) setTimeout(() => sayKey('hooksHint', 7000), 22000);
    } else {
      const hour = new Date().getHours();
      if (hour >= 6 && hour < 11) setTimeout(() => sayKey('morning', 3500), 1500);
    }

    window.__mascot = { engine, tracker, onClaude, runDemo, handleCommand, say, applySettings };
  }

  function createMockApi() {
    const listeners = {};
    const q = new URLSearchParams(location.search);
    return {
      getState: async () => ({
        settings: {
          scale: Number(q.get('scale')) || L.DEFAULT_SCALE,
          lang: q.get('lang') || 'ru',
          hat: q.get('hat') || 'none',
          sounds: false,
          speech: q.get('speech') !== '0',
          ultra: q.get('ultra') === '1',
        },
        locale: q.get('lang') || 'ru',
        firstRun: q.get('first') === '1',
        hooksInstalled: true,
      }),
      setRegions: () => {},
      dragStart: () => {},
      dragEnd: () => {},
      walk: async () => ({ blocked: false }),
      openClaude: () => {},
      hide: () => {},
      contextMenu: () => {},
      setSetting: () => {},
      on: (ch, fn) => {
        (listeners[ch] = listeners[ch] || []).push(fn);
      },
      emit: (ch, data) => (listeners[ch] || []).forEach((fn) => fn(data)),
    };
  }

  boot();
})();
