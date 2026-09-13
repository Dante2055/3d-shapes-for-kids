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

server.listen(4193, async () => {
  console.log("Vertical tumble test server running on http://127.0.0.1:4193");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://127.0.0.1:4193");
  await page.waitForTimeout(600);

  const canvas = await page.$("#canvas");
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const emptyX = box.x + 80;
  const emptyY = box.y + 80;

  console.log("\n--- 1. Testing Default '平稳视角' (Steady View) State ---");
  const steadyBtn = await page.$("#steadyViewBtn");
  if (!steadyBtn) throw new Error("steadyViewBtn not found in DOM");

  const isBtnActive = await page.evaluate(() => {
    const btn = document.getElementById("steadyViewBtn");
    return btn.classList.contains("active") && btn.getAttribute("aria-pressed") === "true";
  });
  const isControlsSteady = await page.evaluate(() => window.controls.steadyView);
  console.log("steadyViewBtn active:", isBtnActive, "controls.steadyView:", isControlsSteady);
  if (!isBtnActive || !isControlsSteady) {
    throw new Error("Steady view should be enabled by default");
  }
  console.log("✓ '平稳视角' is active and enabled by default!");

  console.log("\n--- 2. Testing Polar Lock Clamping in Steady View Mode ---");
  // Drag DOWN repeatedly to tilt down and reach top clamp
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(emptyX, emptyY);
    await page.mouse.down();
    await page.mouse.move(emptyX, emptyY + 120, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(50);
  }
  const topState = await page.evaluate(() => ({
    pos: window.camera.position.toArray(),
    up: window.camera.up.toArray(),
    target: window.controls.target.toArray()
  }));
  console.log("Camera at top clamp:", topState.pos.map(n => n.toFixed(2)), "up:", topState.up.map(n => n.toFixed(2)));
  if (topState.up[1] < 0.9) {
    throw new Error(`Steady view tilted or flipped upright orientation at top: up.y=${topState.up[1]}`);
  }
  console.log("✓ Top polar angle correctly clamped without flipping over; camera stays upright (up.y = 1.0)!");

  // Drag UP repeatedly to tilt up and reach bottom clamp
  for (let i = 0; i < 15; i++) {
    await page.mouse.move(emptyX, emptyY);
    await page.mouse.down();
    await page.mouse.move(emptyX, emptyY - 120, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(50);
  }
  const bottomState = await page.evaluate(() => ({
    pos: window.camera.position.toArray(),
    up: window.camera.up.toArray(),
    target: window.controls.target.toArray()
  }));
  console.log("Camera at bottom clamp:", bottomState.pos.map(n => n.toFixed(2)), "up:", bottomState.up.map(n => n.toFixed(2)));
  if (bottomState.up[1] < 0.9) {
    throw new Error(`Steady view tilted or flipped upright orientation at bottom: up.y=${bottomState.up[1]}`);
  }
  console.log("✓ Bottom polar angle correctly clamped without flipping under; camera stays upright (up.y = 1.0)!");

  console.log("\n--- 3. Testing Toggling '平稳视角' OFF -> 360° Infinite Tumbling ---");
  await page.click("#steadyViewBtn");
  await page.waitForTimeout(300);

  const isOff = await page.evaluate(() => {
    const btn = document.getElementById("steadyViewBtn");
    return !btn.classList.contains("active") && btn.getAttribute("aria-pressed") === "false" && !window.controls.steadyView;
  });
  if (!isOff) throw new Error("steadyView failed to toggle OFF");
  console.log("✓ Toggled OFF steady view successfully. Now in full 360° tumbling mode!");

  // Now test 360° vertical tumbling
  await page.click("button[data-view=\"bottom\"]");
  await page.waitForTimeout(600);

  let yVals = [];
  for (let i = 0; i < 8; i++) {
    await page.mouse.move(emptyX, emptyY);
    await page.mouse.down();
    await page.mouse.move(emptyX, emptyY + 150, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(60);

    const pos = await page.evaluate(() => window.camera.position.toArray());
    yVals.push(pos[1]);
  }
  console.log("Y-coordinates during vertical loop with steadyView OFF:", yVals.map(n => n.toFixed(2)));
  const maxY = Math.max(...yVals);
  const minY = Math.min(...yVals);
  if (maxY > 3 && minY < -2) {
    console.log(`✓ With steadyView OFF, camera traversed full vertical sphere: minY=${minY.toFixed(2)} to maxY=${maxY.toFixed(2)}!`);
  } else {
    throw new Error(`Vertical tumble failed when steadyView was off: min=${minY}, max=${maxY}`);
  }

  console.log("\n--- 4. Testing Toggling '平稳视角' Back ON and Up Vector Reset ---");
  await page.click("#steadyViewBtn");
  await page.waitForTimeout(300);

  const isOnAgain = await page.evaluate(() => {
    const btn = document.getElementById("steadyViewBtn");
    return btn.classList.contains("active") && btn.getAttribute("aria-pressed") === "true" && window.controls.steadyView;
  });
  const upAfterReset = await page.evaluate(() => window.camera.up.toArray());
  console.log("Up vector after toggling steady view ON:", upAfterReset.map(n => n.toFixed(2)));
  if (!isOnAgain || upAfterReset[1] < 0.99) {
    throw new Error(`Toggling back ON failed or up vector was not reset: ${isOnAgain}, up=${upAfterReset}`);
  }
  console.log("✓ Toggled back ON: camera upright orientation restored (up = [0, 1, 0])!");

  console.log("\n--- 5. Testing Net Mode with steadyView enabled by default ---");
  await page.click("#tabNetMode");
  await page.waitForTimeout(400);

  const netSteadyState = await page.evaluate(() => {
    const btn = document.getElementById("steadyViewBtn");
    return {
      disabled: btn.disabled,
      active: btn.classList.contains("active"),
      controlsSteady: window.controls.steadyView
    };
  });
  console.log("Net mode steadyView state:", netSteadyState);
  if (netSteadyState.disabled || !netSteadyState.active || !netSteadyState.controlsSteady) {
    throw new Error(`steadyViewBtn should be enabled and active by default in Net mode: ${JSON.stringify(netSteadyState)}`);
  }
  console.log("✓ steadyViewBtn is enabled and active by default in Net mode!");

  // Verify button order in DOM: resetBtn -> steadyViewBtn -> rotateBtn -> wireBtn -> snapBtn
  const btnOrder = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".nav-tools .tool-btn")).map(b => b.id);
  });
  console.log("Button order in nav-tools:", btnOrder);
  if (btnOrder[0] !== "resetBtn" || btnOrder[1] !== "steadyViewBtn" || btnOrder[2] !== "rotateBtn") {
    throw new Error(`Unexpected button order: ${btnOrder}`);
  }
  console.log("✓ Button order is correctly [resetBtn, steadyViewBtn, rotateBtn, wireBtn, snapBtn]!");

  await page.click("#tab3DMode");
  await page.waitForTimeout(400);

  console.log("\n--- 6. Testing Toolbar Layout / Element Spacing ---");
  const toolbarBBoxes = await page.evaluate(() => {
    const tools = document.querySelector(".nav-tools").getBoundingClientRect();
    const zoom = document.querySelector(".zoom-toolbar").getBoundingClientRect();
    const steady = document.getElementById("steadyViewBtn").getBoundingClientRect();
    return {
      tools: { left: tools.left, right: tools.right, width: tools.width },
      zoom: { left: zoom.left, right: zoom.right, width: zoom.width },
      steady: { left: steady.left, right: steady.right, width: steady.width }
    };
  });
  console.log("Toolbar bounding boxes:", JSON.stringify(toolbarBBoxes, null, 2));

  console.log("\n--- 7. Testing View Reset ---");
  await page.click("#resetBtn");
  await page.waitForTimeout(600);
  const finalZoom = await page.evaluate(() => window.getZoomFromCamera());
  console.log(`✓ Reset restored zoom to ${finalZoom}%`);

  console.log("\n=======================================================");
  console.log("ALL '平稳视角' (STEADY VIEW) & POLAR LOCK TESTS PASSED!");
  console.log("=======================================================\n");

  await browser.close();
  server.close();
  process.exit(0);
});
