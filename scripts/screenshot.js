const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const LANG = process.argv[2] || 'en';
const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[3] || path.join(ROOT, 'docs', LANG === 'en' ? 'screenshot.png' : `screenshot.${LANG}.png`));
const APP = 'file://' + path.join(ROOT, 'src/renderer/index.html') + `?mock=1&lang=${LANG}&scale=2&speech=0`;
const TRAY = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'src-tauri/icons/32x32.png')).toString('base64');

const PROMPT = LANG === 'ru' ? 'почини падающий тест в engine.test.js' : 'fix the flaky test in engine.test.js';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const TERM = [
  ['dim', '~/projects/my-app'],
  ['', ''],
  ['prompt', '> ' + PROMPT],
  ['', ''],
  ['tool', '● <b>Read</b>(test/engine.test.js)'],
  ['dim', '  ⎿  Read 182 lines'],
  ['', ''],
  ['tool', '● <b>Edit</b>(src/renderer/engine.js)'],
  ['dim', '  ⎿  Updated with 4 additions and 1 removal'],
  ['', ''],
  ['tool', '● <b>Bash</b>(npm test)'],
]
  .map(([c, t]) => `<div class="l ${c}">${t.includes('<b>') ? t : esc(t)}&nbsp;</div>`)
  .join('');

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; color-scheme: dark; }
  body {
    background:
      radial-gradient(900px 600px at 78% 30%, rgba(215,119,87,.22), transparent 70%),
      radial-gradient(800px 700px at 10% 90%, rgba(120,90,200,.16), transparent 70%),
      linear-gradient(160deg, #2a2522, #171615);
    font-family: "Segoe UI", system-ui, sans-serif;
  }
  .term {
    position: absolute; left: 64px; top: 56px; width: 700px; height: 520px;
    background: #1a1918; border: 1px solid rgba(255,255,255,.1); border-radius: 10px;
    box-shadow: 0 24px 60px rgba(0,0,0,.5); overflow: hidden;
  }
  .bar { height: 38px; display: flex; align-items: center; gap: 10px; padding: 0 12px; background: #232120; }
  .tab { height: 28px; padding: 0 14px; display: flex; align-items: center; gap: 8px; background: #1a1918;
    border-radius: 7px 7px 0 0; margin-top: 10px; color: #e8e6e1; font-size: 12.5px; }
  .tab i { width: 8px; height: 8px; border-radius: 50%; background: #d77757; }
  .win { margin-left: auto; color: #8e8b84; font-size: 13px; letter-spacing: 14px; }
  .body { padding: 16px 20px; font: 14px/1.55 "DejaVu Sans Mono", Consolas, monospace; color: #e8e6e1; }
  .l.dim { color: #8e8b84; }
  .l.prompt { color: #e8e6e1; background: rgba(255,255,255,.05); margin: 0 -8px; padding: 2px 8px; border-radius: 4px; }
  .l.tool b { font-weight: 700; }
  .l.tool { color: #e8e6e1; }
  .l.tool::first-letter { color: #5fbf72; }
  .ask { margin-top: 14px; border: 1px solid #e5b453; border-radius: 8px; padding: 10px 14px; }
  .ask .h { color: #e5b453; font-weight: 700; }
  .ask .sel { color: #e5b453; }
  .ask .d { color: #8e8b84; }
  .task {
    position: absolute; left: 0; right: 0; bottom: 0; height: 48px;
    background: rgba(28,27,26,.92); border-top: 1px solid rgba(255,255,255,.07);
    display: flex; align-items: center; justify-content: center; gap: 10px;
  }
  .task .ic { width: 32px; height: 32px; border-radius: 7px; background: rgba(255,255,255,.08); }
  .task .ic.on { background: rgba(255,255,255,.16); box-shadow: inset 0 -3px 0 #d77757; }
  .tray { position: absolute; right: 16px; top: 0; height: 48px; display: flex; align-items: center; gap: 14px;
    color: #e8e6e1; font-size: 12.5px; text-align: right; line-height: 1.25; }
  .tray img { width: 20px; height: 20px; image-rendering: pixelated; }
  iframe { position: absolute; right: 90px; bottom: 38px; width: 360px; height: 352px; border: 0; background: transparent; }
</style></head><body>
  <div class="term">
    <div class="bar"><div class="tab"><i></i>claude</div><div class="win">–▢✕</div></div>
    <div class="body">${TERM}
      <div class="ask">
        <div class="h">Bash command</div>
        <div>&nbsp;&nbsp;npm test</div>
        <div class="d">&nbsp;&nbsp;Run the test suite</div>
        <div>&nbsp;</div>
        <div>Do you want to proceed?</div>
        <div class="sel">❯ 1. Yes</div>
        <div>&nbsp;&nbsp;2. Yes, and don't ask again for npm test</div>
        <div>&nbsp;&nbsp;3. No, and tell Claude what to do differently</div>
      </div>
    </div>
  </div>
  <iframe src="${APP}" scrolling="no"></iframe>
  <div class="task">
    <div class="ic"></div><div class="ic"></div><div class="ic on"></div><div class="ic"></div><div class="ic"></div>
    <div class="tray"><img src="${TRAY}" alt=""><div>14:32<br>06.11.2026</div></div>
  </div>
</body></html>`;

(async () => {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mascot-shot-')), 'desktop.html');
  fs.writeFileSync(tmp, HTML);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  await page.goto('file://' + tmp);
  let frame;
  for (let i = 0; i < 50 && !frame; i++) {
    frame = page.frames().find((f) => f.url().includes('src/renderer/index.html'));
    if (!frame) await page.waitForTimeout(100);
  }
  await frame.waitForFunction(() => window.__mascot);
  await page.waitForTimeout(1700);
  await frame.evaluate(() => {
    const m = window.__mascot;
    m.engine.nextIdle = Infinity;
    m.say(' ', 1);
    const ev = (e, project) => m.onClaude(Object.assign({ session: project, project }, e));
    ev({ event: 'UserPromptSubmit' }, 'api-server');
    ev({ event: 'PreToolUse', tool: 'Edit', target: 'routes.ts' }, 'api-server');
    ev({ event: 'UserPromptSubmit' }, 'my-app');
    ev({ event: 'PreToolUse', tool: 'Edit', target: 'engine.js' }, 'my-app');
  });
  await page.waitForTimeout(900);
  await frame.evaluate(() => {
    window.__mascot.onClaude({ session: 'my-app', project: 'my-app', event: 'PermissionRequest', tool: 'Bash', target: 'npm test' });
  });
  await page.waitForTimeout(520);
  await page.screenshot({ path: OUT });
  await browser.close();
  console.log('wrote', OUT, Math.round(fs.statSync(OUT).size / 1024) + ' KB');
})();
