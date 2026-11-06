const path = require('path');
const fs = require('fs');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('Playwright is not installed: npm i -D playwright');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'preview');
const PAGE = 'file://' + path.join(ROOT, 'src/renderer/index.html');

const SCENES = {
  idle: { wait: 900 },
  hover: { wait: 600, hover: true },
  love: { wait: 350, run: (m) => m.engine.click() },
  loveBurst: { wait: 500, run: (m) => { for (let i = 0; i < 6; i++) m.engine.click(); } },
  think: { wait: 900, run: (m) => m.onClaude({ event: 'UserPromptSubmit', session: 's1', project: 'my-app' }) },
  work: {
    wait: 1400,
    run: (m) => {
      m.onClaude({ event: 'UserPromptSubmit', session: 's1', project: 'my-app' });
      m.onClaude({ event: 'PreToolUse', session: 's1', project: 'my-app', tool: 'Edit', target: 'engine.js' });
    },
  },
  helpers: {
    wait: 1200,
    run: (m) => {
      m.onClaude({ event: 'PreToolUse', session: 's1', project: 'my-app', tool: 'Agent', target: 'Explore', toolUseId: 't1' });
      m.onClaude({ event: 'SubagentStart', session: 's1', agentId: 'a1' });
      m.onClaude({ event: 'SubagentStart', session: 's1', agentId: 'a2' });
      m.onClaude({ event: 'SubagentStart', session: 's1', agentId: 'a3' });
      m.onClaude({ event: 'PreToolUse', session: 's2', project: 'api-server', tool: 'Bash', target: 'npm test' });
    },
  },
  wait: {
    wait: 900,
    run: (m) => m.onClaude({ event: 'PermissionRequest', session: 's1', project: 'my-app', tool: 'Bash', target: 'npm test' }),
  },
  done: {
    wait: 700,
    run: (m) => {
      m.onClaude({ event: 'UserPromptSubmit', session: 's1', project: 'my-app' });
      m.onClaude({ event: 'Stop', session: 's1', project: 'my-app' });
    },
  },
  ultra: {
    wait: 1600,
    run: (m) => {
      m.onClaude({ event: 'UserPromptSubmit', session: 's1', project: 'my-app', ultra: true });
      m.onClaude({ event: 'PreToolUse', session: 's1', project: 'my-app', tool: 'Write', target: 'ultra.js' });
    },
  },
  ultraIdle: { wait: 1600, run: (m) => m.applySettings({ ultra: true }) },
  sleep: { wait: 2600, run: (m) => m.handleCommand('sleep') },
  coffee: { wait: 2400, run: (m) => m.handleCommand('coffee') },
  dance: { wait: 1500, run: (m) => m.handleCommand('dance') },
  jump: { wait: 520, run: (m) => m.handleCommand('jump') },
  oops: { wait: 300, run: (m) => m.engine.claudeEffect('oops') },
  squish: { wait: 900, run: (m) => m.onClaude({ event: 'PreCompact', session: 's1', project: 'my-app' }) },
  drag: { wait: 500, run: (m) => m.engine.dragStart() },
  dizzy: { wait: 500, run: (m) => { m.engine.physics({ type: 'shake' }); m.engine.dragEnd(); m.engine.dragStart(); m.engine.dragEnd(); } },
  tip: { wait: 600, run: (m) => m.handleCommand('tip') },
  santa: { wait: 800, query: '&hat=santa', run: (m) => m.say('Хо-хо-хо!', 4000) },
  crown: { wait: 800, query: '&hat=crown' },
  helpersTyped: {
    wait: 2200,
    run: (m) => {
      m.onClaude({ event: 'PreToolUse', session: 's1', project: 'my-app', tool: 'Agent', target: 'Explore', toolUseId: 't1' });
      m.onClaude({ event: 'SubagentStart', session: 's1', agentId: 'a1', agentType: 'Explore' });
      m.onClaude({ event: 'SubagentStart', session: 's1', agentId: 'a2', agentType: 'Plan' });
      m.onClaude({ event: 'SubagentStart', session: 's1', agentId: 'a3', agentType: 'general-purpose' });
    },
  },
  helpersWalkIn: {
    wait: 350,
    run: (m) => {
      m.onClaude({ event: 'SubagentStart', session: 's1', agentId: 'a1', agentType: 'Explore' });
      m.onClaude({ event: 'SubagentStart', session: 's1', agentId: 'a2', agentType: 'Plan' });
    },
  },
  walk: { wait: 500, run: (m) => { m.applySettings({ wander: true }); m.engine.walk = { dir: 1, until: m.engine.now + 9000 }; } },
  dragSwing: { wait: 300, run: (m) => { m.engine.dragStart(); m.engine.physics({ type: 'swing', vx: 22 }); } },
  sleepBubble: { wait: 4200, run: (m) => m.handleCommand('sleep') },
  bulb: { wait: 700, run: (m) => { m.onClaude({ event: 'UserPromptSubmit', session: 's1', project: 'my-app' }); setTimeout(() => { m.engine.modeSince = m.engine.now - 5500; }, 200); } },
  shockwave: { wait: 160, run: (m) => m.applySettings({ ultra: true }) },
  impatient: { wait: 700, run: (m) => { m.onClaude({ event: 'PermissionRequest', session: 's1', project: 'my-app', tool: 'Bash', target: 'rm -rf build' }); setTimeout(() => { m.engine.modeSince = m.engine.now - 8000; }, 150); } },
  fireworks: { wait: 720, run: (m) => m.engine.celebrate() },
  startle: { wait: 2800, run: (m) => { m.handleCommand('sleep'); setTimeout(() => m.engine.click(), 2600); } },
  peek: { wait: 650, run: (m) => { m.engine.action_peekDir = 1; m.engine.startAction('peek'); } },
  typingBurst: { wait: 900, run: (m) => { m.onClaude({ event: 'PreToolUse', session: 's1', project: 'my-app', tool: 'Edit', target: 'a.js' }); setTimeout(() => { m.engine.typing.burstAt = m.engine.now + 30; }, 700); } },
  english: { wait: 1400, query: '&lang=en', run: (m) => { m.onClaude({ event: 'PreToolUse', session: 's1', project: 'my-app', tool: 'Bash', target: 'npm run build' }); } },
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2);
  const names = only.length ? only : Object.keys(SCENES);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 320, height: 352 }, deviceScaleFactor: 2, bypassCSP: true });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') console.error('console:', msg.text()); });
  for (const name of names) {
    const sc = SCENES[name];
    if (!sc) { console.warn('unknown scene', name); continue; }
    await page.goto(PAGE + '?mock=1' + (sc.query || ''));
    await page.addStyleTag({ content: 'html,body{background:linear-gradient(160deg,#3a5a8c,#7aa2c9 60%,#c9d9e8)!important}' });
    await page.waitForFunction(() => window.__mascot);
    await page.waitForTimeout(700);
    if (sc.run) await page.evaluate(`(${sc.run.toString()})(window.__mascot)`);
    if (sc.hover) await page.mouse.move(160, 300);
    await page.waitForTimeout(sc.wait || 600);
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('saved', name);
  }
  await browser.close();
})();
