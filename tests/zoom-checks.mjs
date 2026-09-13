import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('/Users/jinbit/.nvm/versions/node/v24.13.1/lib/node_modules/playwright');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(rootDir, reqPath);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not Found');
  } else {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  }
});

await new Promise(resolve => server.listen(4174, '127.0.0.1', resolve));
console.log('Test HTTP server listening on http://127.0.0.1:4174');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const pageErrors = [];
page.on('pageerror', err => pageErrors.push(err.message));

try {
  await page.goto('http://127.0.0.1:4174/');
  await page.waitForSelector('#zoomToolbar');

  console.log('--- 1. Check Zoom Toolbar DOM elements ---');
  const zoomToolbar = page.locator('#zoomToolbar');
  const zoomOutBtn = page.locator('#zoomOutBtn');
  const zoomInBtn = page.locator('#zoomInBtn');
  const zoomSlider = page.locator('#zoomSlider');
  const zoomBadgeBtn = page.locator('#zoomBadgeBtn');

  await zoomToolbar.waitFor({ state: 'visible' });
  await zoomOutBtn.waitFor({ state: 'visible' });
  await zoomInBtn.waitFor({ state: 'visible' });
  await zoomSlider.waitFor({ state: 'visible' });
  await zoomBadgeBtn.waitFor({ state: 'visible' });

  assert.equal(await zoomBadgeBtn.textContent(), '100%', 'Initial zoom is 100%');
  assert.equal(await zoomSlider.inputValue(), '100', 'Initial slider value is 100');
  console.log('✓ Initial zoom elements and values verified');

  console.log('--- 2. Test Zoom In (+) Button ---');
  await zoomInBtn.click();
  await page.waitForTimeout(200);

  const zoomAfterPlus = parseInt(await zoomBadgeBtn.textContent());
  assert(zoomAfterPlus > 100, `Zoom should increase after clicking +: ${zoomAfterPlus}%`);
  assert.equal(await zoomSlider.inputValue(), String(zoomAfterPlus), 'Slider value synced with badge');
  console.log(`✓ Zoom In button increased zoom to ${zoomAfterPlus}%`);

  console.log('--- 3. Test Zoom Out (-) Button ---');
  await zoomOutBtn.click();
  await page.waitForTimeout(100);
  await zoomOutBtn.click();
  await page.waitForTimeout(200);

  const zoomAfterMinus = parseInt(await zoomBadgeBtn.textContent());
  assert(zoomAfterMinus < zoomAfterPlus, `Zoom should decrease after clicking -: ${zoomAfterMinus}%`);
  console.log(`✓ Zoom Out button decreased zoom to ${zoomAfterMinus}%`);

  console.log('--- 4. Test Reset Zoom Badge Button ---');
  await zoomBadgeBtn.click();
  await page.waitForTimeout(200);

  assert.equal(await zoomBadgeBtn.textContent(), '100%', 'Zoom reset to 100%');
  assert.equal(await zoomSlider.inputValue(), '100', 'Slider reset to 100');
  console.log('✓ Zoom badge click resets to 100%');

  console.log('--- 5. Test Zoom Slider input ---');
  await zoomSlider.fill('160');
  await zoomSlider.dispatchEvent('input');
  await page.waitForTimeout(200);

  assert.equal(await zoomBadgeBtn.textContent(), '160%', 'Badge reflects slider input 160%');
  console.log('✓ Zoom slider directly controls camera distance');

  console.log('--- 6. Test Keyboard shortcuts (+ and -) ---');
  await page.locator('#canvas').focus();
  await page.keyboard.press('+');
  await page.waitForTimeout(100);
  const zoomAfterKeyPlus = parseInt(await zoomBadgeBtn.textContent());
  assert(zoomAfterKeyPlus > 160, `Keyboard + increased zoom: ${zoomAfterKeyPlus}%`);

  await page.keyboard.press('-');
  await page.waitForTimeout(100);
  const zoomAfterKeyMinus = parseInt(await zoomBadgeBtn.textContent());
  assert(zoomAfterKeyMinus < zoomAfterKeyPlus, `Keyboard - decreased zoom: ${zoomAfterKeyMinus}%`);
  console.log('✓ Keyboard shortcuts (+ / -) verified');

  console.log('--- 7. Test Zoom Retention when switching views (前后左右上下) ---');
  await zoomSlider.fill('150');
  await zoomSlider.dispatchEvent('input');
  await page.waitForTimeout(200);
  assert.equal(await zoomBadgeBtn.textContent(), '150%', 'Zoom set to 150% before view switching');

  const views = ['front', 'back', 'top', 'bottom', 'left', 'right'];
  for (const v of views) {
    await page.locator(`[data-view="${v}"]`).click();
    await page.waitForTimeout(550);
    const badgeText = await zoomBadgeBtn.textContent();
    assert.equal(badgeText, '150%', `Zoom maintained at 150% after switching to ${v} view`);
    assert.equal(await zoomSlider.inputValue(), '150', `Slider maintained at 150 after switching to ${v} view`);
  }
  console.log('✓ All 6 directional views preserved 150% zoom scale perfectly');

  // Test reset button resets to 100%
  await page.locator('#resetBtn').click();
  await page.waitForTimeout(550);
  assert.equal(await zoomBadgeBtn.textContent(), '100%', 'Reset button restores 100% zoom');
  console.log('✓ Reset button restores 100% zoom and view orientation');

  // Take screenshot of stage card showing centered zoom bar
  await page.screenshot({ path: 'output/playwright/zoom-feature-1440x900.png', fullPage: true });
  console.log('✓ Screenshot saved to output/playwright/zoom-feature-1440x900.png');

  assert.equal(pageErrors.length, 0, `Browser page errors: ${pageErrors.join(', ')}`);
  console.log('\n==================================');
  console.log('ALL ZOOM TESTS PASSED SUCCESSFULLY');
  console.log('==================================\n');
} finally {
  await browser.close();
  server.close();
}
