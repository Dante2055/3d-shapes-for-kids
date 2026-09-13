import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../tests/utils/get-playwright.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = 4222;

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
  const filePath = path.join(ROOT_DIR, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, async () => {
  console.log(`Preview server running on http://127.0.0.1:${PORT}`);
  const outDir = path.join(ROOT_DIR, 'docs', 'screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader']
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2 // Crisp retina quality
  });

  try {
    // --- Screenshot 1: 3D 自由探索 (Cube with updated UI & Zoom controls) ---
    console.log('Capturing 1: 3d-explore.png...');
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForTimeout(800);
    // Dismiss toast if any
    await page.evaluate(() => {
      const toast = document.getElementById('dynamicToast');
      if (toast) toast.classList.remove('show');
    });
    await page.screenshot({ path: path.join(outDir, '3d-explore.png') });

    // --- Screenshot 2: 展开图课堂 (Cube at ~40% folding with labels) ---
    console.log('Capturing 2: net-folding.png...');
    await page.click('#tabNetMode');
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const slider = document.getElementById('foldSlider');
      if (slider) {
        slider.value = 0.45;
        slider.dispatchEvent(new Event('input'));
      }
      const toast = document.getElementById('dynamicToast');
      if (toast) toast.classList.remove('show');
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, 'net-folding.png') });

    // --- Screenshot 3: 六棱柱展开图 (Hexprism flat net at 0%) ---
    console.log('Capturing 3: net-hexprism.png...');
    await page.click('.dock-item[data-shape="hexPrism"] .shape-select');
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const slider = document.getElementById('foldSlider');
      if (slider) {
        slider.value = 0;
        slider.dispatchEvent(new Event('input'));
      }
      const toast = document.getElementById('dynamicToast');
      if (toast) toast.classList.remove('show');
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, 'net-hexprism.png') });

    // --- Screenshot 4: 磁吸拼合 (Snap & Alignment feature with two shapes) ---
    console.log('Capturing 4: snap-align.png...');
    await page.click('#tab3DMode');
    await page.waitForTimeout(400);
    // Switch to box shape, add a box, enable snap
    await page.click('.dock-item[data-shape="box"] .quick-add-btn');
    await page.waitForTimeout(300);
    await page.click('#snapBtn');
    await page.waitForTimeout(200);
    // Click ground align
    await page.click('#alignGroundBtn');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, 'snap-align.png') });

    console.log('All fresh screenshots captured successfully!');
  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    await browser.close();
    server.close();
  }
});
