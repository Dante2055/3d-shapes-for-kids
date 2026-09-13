import { chromium } from "/Users/jinbit/.nvm/versions/node/v24.13.1/lib/node_modules/playwright/index.mjs";
import http from "http";
import fs from "fs";
import path from "path";

const server = http.createServer((req, res) => {
  const filePath = path.join("/Volumes/Assets/06_编程项目/3d-shapes-for-kids", req.url === "/" ? "index.html" : req.url);
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

server.listen(4195, async () => {
  console.log("Server running on http://127.0.0.1:4195");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://127.0.0.1:4195");
  await page.waitForTimeout(500);

  // Switch to cylinder
  await page.click('.dock-item[data-shape="cylinder"] .quick-add-btn');
  await page.waitForTimeout(300);

  // Switch to rotate mode
  await page.click("#rotateGizmoBtn");
  await page.waitForTimeout(300);

  // Take screenshot with current (old) size
  await page.screenshot({ path: "output/playwright/old-cylinder-rotate.png" });

  // Now let us test dynamically modifying in page:
  const comparison = await page.evaluate(() => {
    const obj = window.objects[window.objects.length - 1];
    const geo = obj.mesh.geometry;
    geo.center();
    geo.computeBoundingBox();
    const halfH = (geo.boundingBox.max.y - geo.boundingBox.min.y) / 2;
    obj.mesh.position.y = halfH;
    obj.mesh.updateMatrixWorld(true);

    const box = new window.THREE.Box3().setFromObject(obj.mesh);
    const center = new window.THREE.Vector3(); box.getCenter(center);
    const size = new window.THREE.Vector3(); box.getSize(size);
    const maxRadius = Math.max(size.x, size.y, size.z) / 2;

    const tControls = window.transformControls;
    if (tControls) {
      tControls.setSize(1.4);
    }
    return {
      meshPos: obj.mesh.position.toArray(),
      boxCenter: center.toArray(),
      maxRadius
    };
  });
  console.log("Evaluation with centered & sized:", comparison);

  await page.waitForTimeout(200);
  await page.screenshot({ path: "output/playwright/new-cylinder-rotate-1.4.png" });

  await browser.close();
  server.close();
});
