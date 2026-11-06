(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.SessionTracker = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const HELPER_TOOLS = new Set(['Task', 'Agent']);
  const WAIT_NOTIFICATIONS = new Set(['permission_prompt', 'elicitation_dialog']);

  const STALE_ACTIVE_MS = 10 * 60 * 1000;
  const STALE_WAIT_MS = 30 * 60 * 1000;
  const FORGET_MS = 45 * 60 * 1000;
  const DONE_SHOW_MS = 6000;
  const ERROR_SHOW_MS = 6000;

  const PRIORITY = { wait: 5, work: 4, think: 3, error: 2, done: 1, idle: 0 };

  class SessionTracker {
    constructor() {
      this.sessions = new Map();
      this.helpers = new Map();
      this.lastSessionStart = -Infinity;
    }

    _get(id, ev, now) {
      let s = this.sessions.get(id);
      if (!s) {
        s = {
          id,
          project: ev.project || '',
          state: 'idle',
          tool: null,
          target: '',
          ultra: false,
          message: '',
          turnStart: 0,
          turnMs: 0,
          startedAt: now,
          stateAt: now,
          lastAt: now,
        };
        this.sessions.set(id, s);
      }
      if (ev.project) s.project = ev.project;
      s.lastAt = now;
      return s;
    }

    _set(s, state, now) {
      if (s.state !== state) {
        s.state = state;
        s.stateAt = now;
      }
    }

    apply(ev, now) {
      if (!ev || !ev.event) return [];
      now = now == null ? Date.now() : now;
      const effects = [];
      const id = ev.session || 'default';
      const s = this._get(id, ev, now);

      switch (ev.event) {
        case 'SessionStart':
          if (ev.source !== 'compact' && ev.source !== 'clear' && now - this.lastSessionStart > 20000) {
            effects.push('greet');
          }
          this.lastSessionStart = now;
          if (s.state !== 'wait') this._set(s, 'idle', now);
          break;

        case 'UserPromptSubmit':
          s.ultra = !!ev.ultra;
          s.tool = null;
          s.target = '';
          s.turnStart = now;
          s.turnMs = 0;
          this._set(s, 'think', now);
          effects.push(s.ultra ? 'ultra' : 'think');
          break;

        case 'PreToolUse':
          if (!s.turnStart) s.turnStart = now;
          s.tool = ev.tool || null;
          s.target = ev.target || '';
          this._set(s, 'work', now);
          if (HELPER_TOOLS.has(ev.tool) && ev.toolUseId) {
            this.helpers.set('tool:' + ev.toolUseId, { session: id, linked: false, at: now, type: ev.target || '' });
          }
          break;

        case 'PostToolUse':
          if (s.state === 'wait' || s.state === 'idle' || s.state === 'think') this._set(s, 'work', now);
          if (HELPER_TOOLS.has(ev.tool) && ev.toolUseId) this.helpers.delete('tool:' + ev.toolUseId);
          break;

        case 'PostToolUseFailure':
          if (s.state === 'wait' || s.state === 'idle') this._set(s, 'work', now);
          if (HELPER_TOOLS.has(ev.tool) && ev.toolUseId) this.helpers.delete('tool:' + ev.toolUseId);
          if (!ev.interrupt) effects.push('oops');
          break;

        case 'PermissionRequest':
          if (s.state !== 'wait') effects.push('alert');
          s.tool = ev.tool || s.tool;
          s.target = ev.target || s.target;
          s.message = '';
          this._set(s, 'wait', now);
          break;

        case 'Notification': {
          const type = ev.notification || '';
          const msg = ev.message || '';
          if (WAIT_NOTIFICATIONS.has(type) || (!type && /permission|разреш/i.test(msg))) {
            if (s.state !== 'wait') effects.push('alert');
            s.message = msg;
            this._set(s, 'wait', now);
          } else if (type === 'idle_prompt') {
            if (s.state !== 'wait') {
              this._set(s, 'idle', now);
              effects.push('nudge');
            }
          }
          break;
        }

        case 'Stop':
          s.turnMs = s.turnStart ? now - s.turnStart : 0;
          s.turnStart = 0;
          s.ultra = false;
          s.tool = null;
          s.target = '';
          this._set(s, 'done', now);
          effects.push('celebrate');
          break;

        case 'StopFailure':
          s.ultra = false;
          s.tool = null;
          this._set(s, 'error', now);
          effects.push('oops');
          break;

        case 'SubagentStart': {
          const key = 'agent:' + (ev.agentId || now + ':' + Math.random());
          let linked = false;
          let type = ev.agentType || '';
          for (const [k, h] of this.helpers) {
            if (k.startsWith('tool:') && !h.linked && h.session === id) {
              this.helpers.delete(k);
              linked = true;
              type = type || h.type;
              break;
            }
          }
          this.helpers.set(key, { session: id, linked, at: now, type });
          break;
        }

        case 'SubagentStop': {
          const key = 'agent:' + (ev.agentId || '');
          if (ev.agentId && this.helpers.has(key)) this.helpers.delete(key);
          else {
            for (const [k, h] of this.helpers) {
              if (k.startsWith('agent:') && h.session === id) {
                this.helpers.delete(k);
                break;
              }
            }
          }
          break;
        }

        case 'PreCompact':
          effects.push('squish');
          break;

        case 'SessionEnd':
          this.sessions.delete(id);
          for (const [k, h] of this.helpers) if (h.session === id) this.helpers.delete(k);
          if (this.sessions.size === 0) effects.push('bye');
          break;

        default:
          break;
      }
      return effects;
    }

    prune(now) {
      now = now == null ? Date.now() : now;
      for (const [id, s] of this.sessions) {
        const quiet = now - s.lastAt;
        if (quiet > FORGET_MS) {
          this.sessions.delete(id);
          continue;
        }
        if ((s.state === 'think' || s.state === 'work') && quiet > STALE_ACTIVE_MS) this._set(s, 'idle', now);
        if (s.state === 'wait' && quiet > STALE_WAIT_MS) this._set(s, 'idle', now);
        if (s.state === 'done' && now - s.stateAt > DONE_SHOW_MS) this._set(s, 'idle', now);
        if (s.state === 'error' && now - s.stateAt > ERROR_SHOW_MS) this._set(s, 'idle', now);
      }
      for (const [k, h] of this.helpers) {
        if (now - h.at > STALE_ACTIVE_MS && !this.sessions.has(h.session)) this.helpers.delete(k);
        else if (now - h.at > 2 * STALE_ACTIVE_MS) this.helpers.delete(k);
      }
    }

    aggregate(now) {
      this.prune(now);
      const list = [...this.sessions.values()]
        .filter((s) => s.state !== 'idle')
        .sort((a, b) => PRIORITY[b.state] - PRIORITY[a.state] || b.stateAt - a.stateAt);
      const top = list[0];
      let state = 'idle';
      if (top && (top.state === 'wait' || top.state === 'work' || top.state === 'think')) state = top.state;
      const ultra = list.some((s) => s.ultra && (s.state === 'think' || s.state === 'work' || s.state === 'wait'));
      return {
        state,
        ultra,
        helpers: this.helpers.size,
        helperTypes: [...this.helpers.values()].sort((a, b) => a.at - b.at).map((h) => h.type || ''),
        list,
        total: this.sessions.size,
      };
    }
  }

  return SessionTracker;
});
