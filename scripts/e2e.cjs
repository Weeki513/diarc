// End-to-end smoke test: loads dist/ into Chromium, opens the bar on a page, searches, edits the grid.
// Requires Playwright: `npm i -D playwright && npx playwright install chromium`, then `npm run build && npm run test:e2e`.
// Screenshots go to test-results/.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DIST = path.resolve(__dirname, '../dist');
const OUT = path.resolve(__dirname, '../test-results');
fs.mkdirSync(OUT, { recursive: true });

function mockCache() {
  const now = new Date();
  const at = (dayOffset, h, m = 0) => { const d = new Date(now); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const soon = new Date(now.getTime() + 25 * 60_000), soonEnd = new Date(soon.getTime() + 30 * 60_000);
  const t = Date.now();
  return {
    'cache:calendar-1': { updatedAt: t, data: { events: [
      { id: 'e1', title: 'Дизайн-ревью Diarc', start: soon.toISOString(), end: soonEnd.toISOString(), allDay: false, meet: 'https://meet.google.com/x' },
      { id: 'e2', title: 'Созвон с командой', start: new Date(t + 3 * 3600e3).toISOString(), end: new Date(t + 4 * 3600e3).toISOString(), allDay: false, color: '#33b679' },
      { id: 'e3', title: 'Спортзал', start: at(1, 9), end: at(1, 10), allDay: false, color: '#f6bf26' },
      { id: 'e4', title: 'Обед с Машей', start: at(1, 13), end: at(1, 14), allDay: false, location: 'Кафе «Пушкин»' },
    ] } },
    'cache:ticktick-1': { updatedAt: t, data: { tasks: [
      { id: 't1', projectId: 'p', projectName: 'Работа', title: 'Отправить отчёт', due: at(-1, 0), allDay: true, priority: 5 },
      { id: 't2', projectId: 'p', projectName: 'Diarc', title: 'Проверить Karabiner-конфиг', due: at(0, 18), allDay: false, priority: 3 },
      { id: 't3', projectId: 'p', projectName: 'Дом', title: 'Купить продукты', due: at(0, 0), allDay: true, priority: 0 },
      { id: 't4', projectId: 'p', projectName: 'Diarc', title: 'Опубликовать в Web Store', due: at(0, 0), allDay: true, priority: 1 },
    ] } },
    'cache:gmail-1': { updatedAt: t, data: { mode: 'api', unread: 3, mails: [
      { id: 'm1', from: 'GitHub', subject: '[Weeki513/diarc] New star', snippet: 'Someone starred your repository…', date: new Date(t - 600e3).toISOString(), link: 'https://mail.google.com' },
      { id: 'm2', from: 'Google Cloud', subject: 'OAuth consent screen verification', snippet: 'Your app verification request has been received…', date: new Date(t - 3 * 3600e3).toISOString(), link: 'https://mail.google.com' },
      { id: 'm3', from: 'Маша', subject: 'Завтра обед?', snippet: 'Привет! Давай в час в Пушкине', date: new Date(t - 26 * 3600e3).toISOString(), link: 'https://mail.google.com' },
    ] } },
    'cache:weather-1': { updatedAt: t, data: { place: 'Москва', temp: -2, code: 3, max: 0, min: -5, hourly: [] } },
  };
}

(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    const title = decodeURIComponent((req.url || '/').slice(1)) || 'Test page';
    if (req.url === '/' || req.url === '/page') return res.end(fs.readFileSync(path.resolve(__dirname, '../test/page.html')));
    res.end(`<title>${title}</title><h1>${title}</h1>`);
  }).listen(8765);

  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diarc-'));
  const ctx = await chromium.launchPersistentContext(userDir, {
    channel: 'chromium',
    headless: !process.env.HEADED,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: Number(process.env.DPR || 1),
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--disable-features=DisableLoadExtensionCommandLineSwitch'],
  });
  let sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker'));
  const extId = sw.url().split('/')[2];
  console.log('extension id', extId);

  // Mock the suggestion service (no network in CI).
  await ctx.route(/suggestqueries\.google\.com/, (route) => {
    const q = new URL(route.request().url()).searchParams.get('q');
    const ds = new URL(route.request().url()).searchParams.get('ds');
    const body = q.startsWith('yout') && !ds
      ? [q, ['https://www.youtube.com/', 'youtube music', 'youtube kids'], ['YouTube', '', ''], [], { 'google:suggesttype': ['NAVIGATION', 'QUERY', 'QUERY'] }]
      : [q, [q + ' music', q + ' hip hop radio', q + ' beats to study'], ['', '', ''], [], { 'google:suggesttype': ['QUERY', 'QUERY', 'QUERY'] }];
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });

  // Seed layout + mock data (no real accounts in tests).
  await sw.evaluate(async (cache) => {
    await chrome.storage.local.set({
      layout: [
        { id: 'calendar-1', widget: 'calendar', size: 'L', config: {} },
        { id: 'ticktick-1', widget: 'ticktick', size: 'L', config: {} },
        { id: 'gmail-1', widget: 'gmail', size: 'XL', config: {} },
        { id: 'links-1', widget: 'links', size: 'M', config: {} },
        { id: 'weather-1', widget: 'weather', size: 'S', config: {} },
      ],
      ...cache,
    });
  }, mockCache());

  // Some history to search.
  for (const p of ['/Figma%20—%20Diarc%20mockups', '/GitHub%20—%20Weeki513/diarc', '/Linear%20—%20Roadmap']) {
    const pg = await ctx.newPage();
    await pg.goto(`http://localhost:8765${p}`);
    await pg.close();
  }
  for (const p of ctx.pages()) if (p.url() === 'about:blank' && ctx.pages().length > 1) await p.close().catch(() => {});

  await sw.evaluate(async () => {
    const r = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...(r.settings || {}), ambient: { show: 'bar', species: 'manta', count: 14 } } });
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8765/page');
  await page.waitForTimeout(1500); // allow idle prewarm

  const toggle = () => sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return chrome.tabs.sendMessage(tab.id, { diarc: 'toggle' });
  });
  const frame = async () => {
    const handle = await page.waitForSelector('diarc-overlay', { state: 'attached' });
    for (let i = 0; i < 50; i++) {
      const f = page.frames().find((f) => f.url().includes('overlay.html'));
      if (f) return f;
      await page.waitForTimeout(50);
    }
    throw new Error('overlay frame not found ' + !!handle);
  };

  await page.bringToFront();
  const t0 = Date.now();
  await toggle();
  const f = await frame();
  await f.waitForSelector('.root.shown');
  console.log(`open → visible: ${Date.now() - t0} ms (includes test harness overhead)`);
  await f.waitForSelector('.tile');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/1-home.png` });
  // The page must stay scrollable around the open bar.
  await page.mouse.move(80, 600);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(300);
  const scrolled = await page.evaluate(() => window.scrollY);
  console.log('page scroll with bar open:', scrolled, scrolled > 0 ? '✓' : '❌');
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.keyboard.type('diarc');
  await f.waitForSelector('.res');
  await page.waitForTimeout(300);
  const titles = await f.$$eval('.res-title', (els) => els.map((e) => e.textContent));
  console.log('results for "diarc":', titles);
  await page.screenshot({ path: `${OUT}/2-search.png` });
  const leaked = await page.evaluate(() => window.pageKeys.join(''));
  console.log('keys seen by page:', JSON.stringify(leaked), leaked ? '❌ LEAK' : '✓ isolated');

  // Web suggestions (mocked), site tint and Tab-to-search.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await toggle();
  await f.waitForSelector('.root.shown');
  await page.keyboard.type('yout');
  await page.waitForTimeout(500);
  const ytRows = await f.$$eval('.res', (els) => els.map((e) => e.querySelector('.res-title').textContent + ' | ' + e.querySelector('.res-kind').textContent));
  console.log('results for "yout":', ytRows);
  const tinted = await f.$eval('.bar', (b) => b.className + ' ' + b.style.getPropertyValue('--site'));
  console.log('bar tint:', tinted, tinted.includes('tinted') ? '✓' : '❌');
  await page.screenshot({ path: `${OUT}/2b-suggest.png` });
  await f.$$eval('.res', (els) => els.find((e) => e.textContent.includes('youtube music')).querySelector('.res-close').click());
  await page.waitForTimeout(150);
  const afterRemove = await f.$$eval('.res-title', (els) => els.map((e) => e.textContent));
  console.log('× removes suggestion:', afterRemove.includes('youtube music') ? '❌' : '✓');
  await page.keyboard.press('Tab');
  await page.keyboard.type('lofi');
  await page.waitForTimeout(400);
  const scope = await f.$eval('.bar-scope', (e) => e.textContent).catch(() => null);
  console.log('tab-to-search scope:', scope, scope === 'YouTube' ? '✓' : '❌');
  await page.screenshot({ path: `${OUT}/2c-scope.png` });
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  const scopeGone = await f.$('.bar-scope');
  console.log('backspace leaves scope:', scopeGone ? '❌' : '✓');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await toggle();
  await f.waitForSelector('.root.shown');
  await page.keyboard.type('diarc');
  await page.waitForTimeout(300);

  await page.keyboard.press('Meta+A').catch(() => {});
  await f.fill('.bar input', 't купить молоко завтра в 10');
  await page.waitForTimeout(150);
  const first = await f.$eval('.res .res-title', (e) => e.textContent);
  console.log('widget command:', first);
  await page.screenshot({ path: `${OUT}/3-command.png` });

  await f.fill('.bar input', 'закрыть дубл');
  await page.waitForTimeout(150);
  console.log('command search:', await f.$eval('.res .res-title', (e) => e.textContent));

  await f.fill('.bar input', '');
  await f.click('.bar-btn');
  await f.waitForSelector('.tile.jiggle');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/4-edit.png` });
  // resize the calendar tile to M
  await f.$eval('.tile-calendar .tile-controls button[title="Размер M"]', (e) => e.click());
  await page.waitForTimeout(200);
  const layout = await sw.evaluate(async () => (await chrome.storage.local.get('layout')).layout.map((t) => `${t.widget}:${t.size}`));
  console.log('layout after resize:', layout.join(', '));
  await f.$eval('.tile-add', (e) => e.click());
  await f.waitForSelector('.gallery');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/5-gallery.png` });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  // Reopen and click outside: should close.
  await toggle();
  await f.waitForSelector('.root.shown');
  await page.mouse.click(60, 700);
  await page.waitForTimeout(200);
  console.log('click outside closes:', await page.$eval('diarc-overlay', (e) => getComputedStyle(e).display));
  await page.waitForTimeout(200);
  const hidden = await page.$eval('diarc-overlay', (e) => getComputedStyle(e).display);
  console.log('after Esc host display:', hidden);

  // Re-open (warm): should be instant.
  const t1 = Date.now();
  await toggle();
  await f.waitForSelector('.root.shown');
  console.log(`warm re-open: ${Date.now() - t1} ms`);
  const focused = await f.evaluate(() => document.activeElement?.tagName + '.' + document.activeElement?.closest('.bar')?.className);
  console.log('focused element:', focused);
  await toggle();

  // Dark theme screenshot
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => { document.body.style.background = '#fff'; });
  await toggle();
  await f.waitForSelector('.root.shown');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/6-dark.png` });
  await toggle();

  // Fallback window page renders standalone.
  const win = await ctx.newPage();
  await win.setViewportSize({ width: 780, height: 620 });
  await win.goto(`chrome-extension://${extId}/overlay.html?mode=page`);
  await win.waitForSelector('.tile');
  await win.screenshot({ path: `${OUT}/7-window.png` });

  const errors = [];
  win.on('pageerror', (e) => errors.push(e.message));
  console.log('page errors:', errors.length ? errors : 'none');
  await ctx.close();
  server.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
