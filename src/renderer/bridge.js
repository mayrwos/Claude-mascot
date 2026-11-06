(function () {
  'use strict';
  const T = window.__TAURI__;
  if (!T || window.mascot) return;
  const invoke = T.core.invoke;
  const quiet = (p) => p.catch((e) => console.error('[mascot]', e));
  window.mascot = {
    getState: () => invoke('get_state'),
    setRegions: (rects, capture) => quiet(invoke('set_regions', { rects, capture: !!capture })),
    dragStart: () => quiet(invoke('drag_start')),
    dragEnd: () => quiet(invoke('drag_end')),
    walk: (dx) => invoke('walk_step', { dx: Number(dx) || 0 }).catch(() => ({ blocked: false })),
    openClaude: () => quiet(invoke('open_claude_cmd')),
    hide: () => quiet(invoke('hide_window_cmd')),
    contextMenu: () => quiet(invoke('context_menu')),
    setSetting: (key, value) => quiet(invoke('set_renderer_setting', { key: String(key), value })),
    on: (channel, fn) => {
      T.event.listen(channel, (e) => fn(e.payload));
    },
  };
})();
