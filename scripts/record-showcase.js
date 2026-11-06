const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const LANG = process.argv[2] || 'en';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file://' + path.join(ROOT, 'src/renderer/index.html') + '?mock=1&lang=' + LANG;
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mascot-show-'));
const OUT = path.resolve(process.argv[3] || path.join(ROOT, 'docs', 'animations.mp4'));
const W = 320;
const H = 330;

const T = {
  ru: {
    hello: 'Появление', hover: 'Курсор рядом: смотрит и краснеет', poke: 'Тычок: сердечки',
    pets: 'Много тычков', jump: 'Прыжок (двойной клик)', hat: 'Шапка отстаёт и пружинит',
    grab: 'Взяли мышкой: ноги-маятник', fall: 'Падение и приземление', walk: 'Прогулка',
    think: 'Claude думает', work: 'Claude пишет код', helpers: 'Помощники (sub-агенты)',
    wait: 'Ждёт разрешения', done: 'Готово!', oops: 'Ошибка', ultra: 'UltraCode',
    dance: 'Танец', coffee: 'Кофе', wave: 'Привет', sleep: 'Сон', wake: 'Проснулся', bye: 'Скрыть',
  },
  en: {
    hello: 'Appear', hover: 'Cursor nearby: looks up and blushes', poke: 'Poke: hearts',
    pets: 'Lots of pokes', jump: 'Jump (double-click)', hat: 'The hat lags and springs back',
    grab: 'Picked up: legs swing', fall: 'Fall and landing', walk: 'Walk',
    think: 'Claude is thinking', work: 'Claude is coding', helpers: 'Helpers (sub-agents)',
    wait: 'Waiting for permission', done: 'Done!', oops: 'Error', ultra: 'UltraCode',
    dance: 'Dance', coffee: 'Coffee', wave: 'Wave', sleep: 'Sleep', wake: 'Wake up', bye: 'Hide',
  },
}[LANG];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    bypassCSP: true,
    recordVideo: { dir: TMP, size: { width: W, height: H } },
  });
  const page = await ctx.newPage();
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__mascot);
  await page.evaluate(() => {
    document.documentElement.style.background = '#1f1e1d';
    const c = document.createElement('div');
    c.id = 'cap';
    c.style.cssText = 'position:fixed;left:0;right:0;bottom:6px;text-align:center;z-index:99999;' +
      'font:600 15px/1.3 "DejaVu Sans",sans-serif;color:#f3efe9;pointer-events:none;' +
      'text-shadow:0 1px 2px #000;transition:opacity .2s';
    document.body.appendChild(c);
    window.__cap = (t) => { c.textContent = t; };
  });
  const S = { session: 's1', project: 'my-app' };
  const run = (fn, arg) => page.evaluate(fn, arg);
  const E = (fn, arg) => run(new Function('arg', 'const e = window.__mascot.engine; ' + fn), arg);
  const ev = (e) => run((x) => window.__mascot.onClaude(x), Object.assign({}, S, e));
  const wait = (ms) => page.waitForTimeout(ms);
  const cap = (t) => run((x) => window.__cap(x), t);
  const idle = () => ev({ event: 'SessionEnd' });

  await E('e.settings.speech = false; e.nextIdle = Infinity; e.hidden = true;');
  await wait(600);

  await cap(T.hello);
  await E('e.command("appear")');
  await wait(2200);

  await cap(T.hover);
  for (let i = 0; i < 10; i++) { await page.mouse.move(150 + (i % 3) * 8, 250); await E('e.hoverPing && e.hoverPing()'); await wait(260); }
  await page.mouse.move(5, 5);
  await wait(600);

  await cap(T.poke);
  await E('e.click()');
  await wait(1800);

  await cap(T.pets);
  for (let i = 0; i < 7; i++) { await E('e.click()'); await wait(140); }
  await wait(2400);

  await cap(T.jump);
  await E('e.dblclick()');
  await wait(2000);

  await cap(T.hat);
  await E('e.setSettings({ hat: "party" }); e.dblclick()');
  await wait(2000);
  await E('e.setSettings({ hat: "none" })');

  await cap(T.grab);
  await E('e.dragStart(); e.physics({ type: "swing", vx: 28 })');
  await wait(450);
  await E('e.physics({ type: "swing", vx: -24 })');
  await wait(450);
  await E('e.physics({ type: "swing", vx: 0 })');
  await wait(1100);
  await E('e.dragEnd()');

  await cap(T.fall);
  await E('e.physics({ type: "fall" })');
  for (const vy of [4, 9, 14, 19, 24]) { await E('e.physics({ type: "air", vy: arg })', vy); await wait(90); }
  await E('e.physics({ type: "land", power: 16 })');
  await wait(2000);

  await cap(T.think);
  await ev({ event: 'UserPromptSubmit' });
  await wait(2800);

  await cap(T.work);
  await ev({ event: 'PreToolUse', tool: 'Edit', target: 'engine.js' });
  await wait(3200);

  await cap(T.helpers);
  await ev({ event: 'PreToolUse', tool: 'Agent', target: 'Explore', toolUseId: 't1' });
  await ev({ event: 'SubagentStart', agentId: 'a1', agentType: 'Explore' });
  await wait(500);
  await ev({ event: 'SubagentStart', agentId: 'a2', agentType: 'Plan' });
  await wait(3000);
  await ev({ event: 'SubagentStop', agentId: 'a1' });
  await ev({ event: 'SubagentStop', agentId: 'a2' });
  await ev({ event: 'PostToolUse', tool: 'Agent', toolUseId: 't1' });
  await wait(1200);

  await cap(T.wait);
  await ev({ event: 'PermissionRequest', tool: 'Bash', target: 'npm test' });
  await wait(3000);
  await ev({ event: 'PostToolUse', tool: 'Bash' });

  await cap(T.done);
  await ev({ event: 'Stop' });
  await wait(3200);

  await cap(T.oops);
  await ev({ event: 'UserPromptSubmit' });
  await wait(300);
  await ev({ event: 'StopFailure' });
  await wait(2200);

  await cap(T.ultra);
  await ev({ event: 'UserPromptSubmit', ultra: true });
  await wait(1600);
  await ev({ event: 'PreToolUse', tool: 'Write', target: 'ultra.js' });
  await wait(3000);
  await ev({ event: 'Stop' });
  await wait(2600);
  await idle();
  await wait(400);

  await cap(T.dance);
  await E('e.command("dance")');
  await wait(2800);

  await cap(T.coffee);
  await E('e.command("coffee")');
  await wait(3200);

  await cap(T.wave);
  await E('e.command("wave")');
  await wait(1800);

  await cap(T.sleep);
  await E('e.command("sleep")');
  await wait(4500);

  await cap(T.wake);
  await E('e.command("wake")');
  await wait(1800);

  await cap(T.bye);
  await E('e.command("hide")');
  await wait(1500);

  await page.close();
  await ctx.close();
  await browser.close();

  const webm = fs.readdirSync(TMP).find((f) => f.endsWith('.webm'));
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', '0.5', '-i', path.join(TMP, webm),
    '-vf', 'fps=30,crop=320:224:0:106,scale=iw*2:ih*2:flags=neighbor', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', OUT]);
  console.log('wrote', OUT, Math.round(fs.statSync(OUT).size / 1024) + ' KB');
})();
