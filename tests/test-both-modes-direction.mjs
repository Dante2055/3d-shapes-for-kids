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

server.listen(4205, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://127.0.0.1:4205");
  await page.waitForTimeout(600);

  const results = await page.evaluate(() => {
    const target = new THREE.Vector3(0, 0, 0);
    const frontPoint = new THREE.Vector3(0, 0, 1);

    function testBranch(steadyView, dx, dy) {
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      camera.position.set(0, 0, 5);
      camera.up.set(0, 1, 0);
      camera.lookAt(target);

      const h = 400;
      const rotateSpeed = 1.0;
      const deltaX = (2 * Math.PI * dx / h) * rotateSpeed * 0.5;
      const deltaY = (2 * Math.PI * dy / h) * rotateSpeed * 0.5;

      if (steadyView) {
        const offset = camera.position.clone().sub(target);
        const radius = Math.max(1e-4, offset.length());
        const hDist = Math.hypot(offset.x, offset.z);
        let theta = hDist > 1e-4 ? Math.atan2(offset.x, offset.z) : 0;
        let phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius)));

        theta -= deltaX;
        phi -= deltaY;

        const sinPhiRadius = Math.sin(phi) * radius;
        offset.x = sinPhiRadius * Math.sin(theta);
        offset.y = Math.cos(phi) * radius;
        offset.z = sinPhiRadius * Math.cos(theta);

        camera.position.copy(target).add(offset);
        camera.up.set(0, 1, 0);
        camera.lookAt(target);
      } else {
        const offset = camera.position.clone().sub(target);
        const dir = target.clone().sub(camera.position).normalize();
        let right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
        const up = new THREE.Vector3().crossVectors(right, dir).normalize();

        const qY = new THREE.Quaternion().setFromAxisAngle(right, -deltaY);
        const qX = new THREE.Quaternion().setFromAxisAngle(up, -deltaX);
        const q = new THREE.Quaternion().multiplyQuaternions(qX, qY);

        offset.applyQuaternion(q);
        camera.position.copy(target).add(offset);
        camera.up.applyQuaternion(q).normalize();
        camera.lookAt(target);
      }

      camera.updateMatrixWorld();
      const projected = frontPoint.clone().project(camera);
      return { screenX: Number(projected.x.toFixed(4)), screenY: Number(projected.y.toFixed(4)) };
    }

    return {
      steady: {
        initial: testBranch(true, 0, 0),
        dragLeft: testBranch(true, -50, 0),
        dragRight: testBranch(true, +50, 0),
        dragUp: testBranch(true, 0, -50),
        dragDown: testBranch(true, 0, +50)
      },
      tumble: {
        initial: testBranch(false, 0, 0),
        dragLeft: testBranch(false, -50, 0),
        dragRight: testBranch(false, +50, 0),
        dragUp: testBranch(false, 0, -50),
        dragDown: testBranch(false, 0, +50)
      }
    };
  });

  console.log("=== RESULTS ===");
  console.log(JSON.stringify(results, null, 2));

  await browser.close();
  server.close();
  process.exit(0);
});
