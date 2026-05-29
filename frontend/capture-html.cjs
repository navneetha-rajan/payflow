const { chromium } = require('playwright');
const { readFileSync, existsSync } = require('node:fs');

(async () => {
  let browser;
  let ownsBrowser = true;
  const wsFile = '/tmp/pw-ws';

  // Try to connect to pre-warmed browser server if available
  if (existsSync(wsFile)) {
    const ws = readFileSync(wsFile, 'utf8').trim();
    try {
      browser = await chromium.connect(ws);
      ownsBrowser = false;
    } catch (_e) {
      browser = await chromium.launch({ headless: true });
    }
  } else {
    browser = await chromium.launch({ headless: true });
  }

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  // Navigate and wait for initial render
  await page.goto(process.env.FRONTEND_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

  // Give React a moment to hydrate/render
  await page.waitForTimeout(2000);

  // Capture the fully-rendered HTML
  const html = await page.content();
  console.log(html);

  await page.close();
  if (ownsBrowser) { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('CAPTURE_ERROR: ' + e.message); process.exit(1); });
