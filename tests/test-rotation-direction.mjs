import { chromium } from "./utils/get-playwright.mjs";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

const server = http.createServer((req, res) => {
  const filePath = path.join(ROOT_DIR, req.url === "/" ? "index.html" : req.url);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mime = ext === ".html" ? "text/html" : ext === ".js" || ext === ".mjs" ? "text/javascript" : "text/plain";
    res.writeHead(200, { "Content-Type": mime });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(4207, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://127.0.0.1:4207");
  await page.waitForTimeout(600);

  const canvas = await page.$("#canvas");
  const box = await canvas.boundingBox();
  const emptyX = box.x + 80;
  const emptyY = box.y + 80;

  // Helper to get screen position of cube's front face center (0, 0.8, 0.8)
  const getFrontScreenPos = async () => {
    return await page.evaluate(() => {
      const p = new THREE.Vector3(0, 0.8, 0.8);
      p.project(window.camera);
      return { x: p.x, y: p.y };
    });
  };

  async function testFourDirections(modeName) {
    console.log(`\n=======================================================`);
    console.log(`Testing 4 Directions in [${modeName}] mode`);
    console.log(`=======================================================`);

    // 1. Drag Left
    await page.click("#resetBtn");
    await page.waitForTimeout(500);
    const p0L = await getFrontScreenPos();

    await page.mouse.move(emptyX, emptyY);
    await page.mouse.down();
    await page.mouse.move(emptyX - 60, emptyY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const pLeft = await getFrontScreenPos();
    console.log(`[${modeName}] Drag LEFT: x changed from ${p0L.x.toFixed(3)} to ${pLeft.x.toFixed(3)}`);
    if (pLeft.x < p0L.x) {
      console.log(`✓ [${modeName}] 向左拖动 ⟹ 物体向左旋转!`);
    } else {
      throw new Error(`[${modeName}] Expected front face to move left, but moved ${pLeft.x - p0L.x}`);
    }

    // 2. Drag Right
    await page.click("#resetBtn");
    await page.waitForTimeout(500);
    const p0R = await getFrontScreenPos();

    await page.mouse.move(emptyX, emptyY);
    await page.mouse.down();
    await page.mouse.move(emptyX + 60, emptyY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const pRight = await getFrontScreenPos();
    console.log(`[${modeName}] Drag RIGHT: x changed from ${p0R.x.toFixed(3)} to ${pRight.x.toFixed(3)}`);
    if (pRight.x > p0R.x) {
      console.log(`✓ [${modeName}] 向右拖动 ⟹ 物体向右旋转!`);
    } else {
      throw new Error(`[${modeName}] Expected front face to move right, but moved ${pRight.x - p0R.x}`);
    }

    // 3. Drag Up
    await page.click("#resetBtn");
    await page.waitForTimeout(500);
    const p0U = await getFrontScreenPos();

    await page.mouse.move(emptyX, emptyY);
    await page.mouse.down();
    await page.mouse.move(emptyX, emptyY - 60, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const pUp = await getFrontScreenPos();
    console.log(`[${modeName}] Drag UP: y changed from ${p0U.y.toFixed(3)} to ${pUp.y.toFixed(3)}`);
    if (pUp.y > p0U.y) {
      console.log(`✓ [${modeName}] 向上拖动 ⟹ 物体向上仰起 (露出底面)!`);
    } else {
      throw new Error(`[${modeName}] Expected front face to move up, but moved ${pUp.y - p0U.y}`);
    }

    // 4. Drag Down
    await page.click("#resetBtn");
    await page.waitForTimeout(500);
    const p0D = await getFrontScreenPos();

    await page.mouse.move(emptyX, emptyY);
    await page.mouse.down();
    await page.mouse.move(emptyX, emptyY + 60, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const pDown = await getFrontScreenPos();
    console.log(`[${modeName}] Drag DOWN: y changed from ${p0D.y.toFixed(3)} to ${pDown.y.toFixed(3)}`);
    if (pDown.y < p0D.y) {
      console.log(`✓ [${modeName}] 向下拖动 ⟹ 物体向下俯低 (露出顶面)!`);
    } else {
      throw new Error(`[${modeName}] Expected front face to move down, but moved ${pDown.y - p0D.y}`);
    }
  }

  // Test Mode 1: Steady View ON (Default)
  await testFourDirections("平稳视角 (开启)");

  // Test Mode 2: Steady View OFF (Tumble 360°)
  await page.click("#steadyViewBtn");
  await page.waitForTimeout(300);
  await testFourDirections("平稳视角 (关闭 / 360°自由翻转)");

  console.log("\n=================================================================");
  console.log("ALL 4-WAY DRAG DIRECTIONS PASSED IN BOTH STEADY & TUMBLE MODES!");
  console.log("=================================================================\n");

  await browser.close();
  server.close();
  process.exit(0);
});
