const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PAGE = 'file://' + path.join(ROOT, 'src/renderer/index.html') + '?mock=1&lang=' + (process.argv[2] || 'en');
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mascot-rec-'));
const OUT = path.join(ROOT, 'docs', process.argv[3] || 'demo.gif');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 320, height: 330 },
    bypassCSP: true,
    recordVideo: { dir: TMP, size: { width: 320, height: 330 } },
  });
  const page = await ctx.newPage();
  await page.goto(PAGE);
  await page.evaluate(() => {
    document.documentElement.style.background = 'linear-gradient(160deg,#35558a,#6f98c4 60%,#bcd0e4)';
  });
  await page.waitForFunction(() => window.__mascot);
  const S = { session: 's1', project: 'my-app' };
  const run = (fn, arg) => page.evaluate(fn, arg);
  const ev = (e) => run((x) => window.__mascot.onClaude(x), Object.assign({}, S, e));
  const wait = (ms) => page.waitForTimeout(ms);

  await wait(900);
  await page.mouse.move(160, 300);
  await wait(900);
  await run(() => window.__mascot.engine.click());
  await wait(700);
  await run(() => { for (let i = 0; i < 6; i++) window.__mascot.engine.click(); });
  await page.mouse.move(10, 10);
  await wait(2000);
  await ev({ event: 'UserPromptSubmit' });
  await wait(2200);
  await ev({ event: 'PreToolUse', tool: 'Edit', target: 'engine.js' });
  await wait(1800);
  await ev({ event: 'PreToolUse', tool: 'Agent', target: 'Explore', toolUseId: 't1' });
  await ev({ event: 'SubagentStart', agentId: 'a1', agentType: 'Explore' });
  await wait(400);
  await ev({ event: 'SubagentStart', agentId: 'a2', agentType: 'Plan' });
  await wait(2200);
  await ev({ event: 'SubagentStop', agentId: 'a1' });
  await ev({ event: 'SubagentStop', agentId: 'a2' });
  await ev({ event: 'PostToolUse', tool: 'Agent', toolUseId: 't1' });
  await ev({ event: 'PermissionRequest', tool: 'Bash', target: 'npm test' });
  await wait(2400);
  await ev({ event: 'PostToolUse', tool: 'Bash' });
  await wait(300);
  await ev({ event: 'Stop' });
  await wait(2700);
  await ev({ event: 'UserPromptSubmit', ultra: true });
  await wait(1500);
  await ev({ event: 'PreToolUse', tool: 'Write', target: 'ultra.js' });
  await wait(2200);
  await ev({ event: 'Stop' });
  await wait(2600);
  await run(() => window.__mascot.handleCommand('sleep'));
  await wait(3200);
  await page.close();
  await ctx.close();
  await browser.close();

  const webm = fs.readdirSync(TMP).find((f) => f.endsWith('.webm'));
  const src = path.join(TMP, webm);
  const pal = path.join(TMP, 'pal.png');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', '0.6', '-i', src, '-vf', 'fps=14,palettegen=stats_mode=diff', pal]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', '0.6', '-i', src, '-i', pal, '-lavfi', 'fps=14[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle', OUT]);
  console.log('wrote', OUT, Math.round(fs.statSync(OUT).size / 1024) + ' KB');
})();
