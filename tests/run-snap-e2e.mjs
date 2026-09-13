import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('/Users/jinbit/.nvm/versions/node/v24.13.1/lib/node_modules/playwright');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Start local HTTP server
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
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
});

await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));
console.log('Test HTTP server listening on http://127.0.0.1:4173');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const pageErrors = [];
page.on('pageerror', err => pageErrors.push(err.message));

try {
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForSelector('#canvas');

  console.log('--- E2E 1: Check buttons initial state ---');
  const snapBtn = page.locator('#snapBtn');
  const inspSnapBtn = page.locator('#inspectorSnapBtn');

  await snapBtn.waitFor({ state: 'visible' });
  await inspSnapBtn.waitFor({ state: 'visible' });

  assert.equal(await snapBtn.getAttribute('aria-pressed'), 'false', 'snapBtn initially not pressed');
  assert.equal(await inspSnapBtn.getAttribute('aria-pressed'), 'false', 'inspSnapBtn initially not pressed');
  console.log('✓ Initial button states are false');

  console.log('--- E2E 2: Click snapBtn on stage toolbar ---');
  await snapBtn.click();
  await page.waitForTimeout(300);

  assert.equal(await snapBtn.getAttribute('aria-pressed'), 'true', 'snapBtn pressed is true');
  assert.equal(await inspSnapBtn.getAttribute('aria-pressed'), 'true', 'inspSnapBtn synced to true');
  assert(await snapBtn.evaluate(el => el.classList.contains('active')), 'snapBtn has active class');
  assert(await inspSnapBtn.evaluate(el => el.classList.contains('active')), 'inspSnapBtn has active class');

  const toastText = await page.locator('#dynamicToast').textContent();
  assert(toastText.includes('磁吸对齐已开启'), `Toast text matches: "${toastText}"`);
  console.log(`✓ Snap enabled via stage toolbar, toast: "${toastText}"`);

  console.log('--- E2E 3: Toggle off via inspectorSnapBtn ---');
  await inspSnapBtn.click();
  await page.waitForTimeout(300);

  assert.equal(await snapBtn.getAttribute('aria-pressed'), 'false', 'snapBtn pressed is false');
  assert.equal(await inspSnapBtn.getAttribute('aria-pressed'), 'false', 'inspSnapBtn pressed is false');
  assert(!await snapBtn.evaluate(el => el.classList.contains('active')), 'snapBtn active class removed');
  assert(!await inspSnapBtn.evaluate(el => el.classList.contains('active')), 'inspSnapBtn active class removed');

  const toastOff = await page.locator('#dynamicToast').textContent();
  assert(toastOff.includes('磁吸对齐已关闭'), `Toast text matches: "${toastOff}"`);
  console.log(`✓ Snap toggled off via inspector panel, toast: "${toastOff}"`);

  console.log('--- E2E 4: Enable snapping and test keyboard grid alignment ---');
  await snapBtn.click();
  await page.waitForTimeout(300);

  await page.locator('#canvas').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);

  const posText = await page.locator('#posDisplay').textContent();
  console.log('Position after ArrowRight with snap:', posText);
  assert(posText.includes('0.5'), `Position text should reflect 0.5 step: ${posText}`);
  console.log('✓ Keyboard movement aligns with 0.5 grid');

  console.log('--- E2E 5: Check Net Mode disabling of snapBtn ---');
  await page.locator('#tabNetMode').click();
  await page.waitForTimeout(300);

  assert(await snapBtn.isDisabled(), 'snapBtn is disabled in Net mode');
  console.log('✓ snapBtn disabled in Net Mode');

  await page.locator('#tab3DMode').click();
  await page.waitForTimeout(300);
  assert(!await snapBtn.isDisabled(), 'snapBtn re-enabled in 3D mode');
  console.log('✓ snapBtn re-enabled in 3D Mode');

  console.log('--- E2E 6: Test Quick Align Buttons with single object vs multiple objects ---');
  const alignSnapBtn = page.locator('#alignSnapBtn');
  const alignFrontBtn = page.locator('#alignFrontBtn');
  const alignTopBtn = page.locator('#alignTopBtn');
  const alignGroundBtn = page.locator('#alignGroundBtn');

  // With only 1 object (Cube), multi-object buttons must be disabled
  assert(await alignSnapBtn.isDisabled(), 'alignSnapBtn disabled with single object');
  assert(await alignFrontBtn.isDisabled(), 'alignFrontBtn disabled with single object');
  assert(await alignTopBtn.isDisabled(), 'alignTopBtn disabled with single object');
  assert(!await alignGroundBtn.isDisabled(), 'alignGroundBtn enabled with single object');
  console.log('✓ Button disabled states verified for single object');

  // Add Box (Cuboid)
  const addBoxBtn = page.locator('.dock-item[data-shape="box"] .quick-add-btn');
  await addBoxBtn.click();
  await page.waitForTimeout(300);

  // Now with 2 objects, all buttons must be enabled
  assert(!await alignSnapBtn.isDisabled(), 'alignSnapBtn enabled with 2 objects');
  assert(!await alignFrontBtn.isDisabled(), 'alignFrontBtn enabled with 2 objects');
  assert(!await alignTopBtn.isDisabled(), 'alignTopBtn enabled with 2 objects');
  assert(!await alignGroundBtn.isDisabled(), 'alignGroundBtn enabled with 2 objects');
  console.log('✓ Button states enabled for multiple objects');

  console.log('--- E2E 7: Test 1-click snap contact (abut) and flush alignment ---');
  // Move Box near Cube (Cube is at (0.5, 0, 0), width 1.6 -> max.x = 1.3)
  // Box is added at (0, 0, 0)
  await alignSnapBtn.click();
  await page.waitForTimeout(300);

  // Verify Box left face touches Cube right face or vice versa with 0 gap
  const gapCheck = await page.evaluate(() => {
    const o0 = window.objects[0];
    const o1 = window.objects[1];
    o0.mesh.updateMatrixWorld(true);
    o1.mesh.updateMatrixWorld(true);
    const box0 = new window.THREE.Box3().setFromObject(o0.mesh);
    const box1 = new window.THREE.Box3().setFromObject(o1.mesh);
    const gapX = Math.min(
      Math.abs(box1.min.x - box0.max.x),
      Math.abs(box0.min.x - box1.max.x)
    );
    const frontDiff = Math.abs(box1.max.z - box0.max.z);
    return { gapX, frontDiff, min0Y: box0.min.y, min1Y: box1.min.y };
  });

  console.log('Contact & flush check results:', gapCheck);
  assert(gapCheck.gapX < 1e-4, `Gap between shapes in X should be zero: ${gapCheck.gapX}`);
  assert(gapCheck.frontDiff < 1e-4, `Front surfaces should be flush in Z: ${gapCheck.frontDiff}`);
  console.log('✓ Shapes snap together with 0 gap and flush front faces!');

  // Test front align button
  await alignFrontBtn.click();
  await page.waitForTimeout(200);
  const frontCheck = await page.evaluate(() => {
    const box0 = new window.THREE.Box3().setFromObject(window.objects[0].mesh);
    const box1 = new window.THREE.Box3().setFromObject(window.objects[1].mesh);
    return Math.abs(box1.max.z - box0.max.z);
  });
  assert(frontCheck < 1e-4, `Front faces aligned flush: ${frontCheck}`);
  console.log('✓ alignFrontBtn flushes front faces!');

  // Test top align button
  await alignTopBtn.click();
  await page.waitForTimeout(200);
  const topCheck = await page.evaluate(() => {
    const box0 = new window.THREE.Box3().setFromObject(window.objects[0].mesh);
    const box1 = new window.THREE.Box3().setFromObject(window.objects[1].mesh);
    return Math.abs(box1.max.y - box0.max.y);
  });
  assert(topCheck < 1e-4, `Top faces aligned flush: ${topCheck}`);
  console.log('✓ alignTopBtn flushes top faces!');

  // Test ground align button
  await alignGroundBtn.click();
  await page.waitForTimeout(200);
  const groundCheck = await page.evaluate(() => {
    const box1 = new window.THREE.Box3().setFromObject(window.objects[1].mesh);
    return Math.abs(box1.min.y);
  });
  assert(groundCheck < 1e-4, `Bottom touches ground Y=0: ${groundCheck}`);
  console.log('✓ alignGroundBtn aligns bottom to ground Y=0!');

  // Take screenshot for visual walkthrough
  await page.screenshot({ path: 'output/playwright/snap-feature-1440x900.png', fullPage: true });
  console.log('✓ Screenshot saved to output/playwright/snap-feature-1440x900.png');

  assert.equal(pageErrors.length, 0, `Browser page errors: ${pageErrors.join(', ')}`);
  console.log('\n======================================');
  console.log('ALL E2E BROWSER SNAP TESTS PASSED 100%');
  console.log('======================================\n');
} finally {
  await browser.close();
  server.close();
}
