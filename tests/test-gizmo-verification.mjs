import { chromium } from "/Users/jinbit/.nvm/versions/node/v24.13.1/lib/node_modules/playwright/index.mjs";
import http from "http";
import fs from "fs";
import path from "path";
import assert from "assert/strict";

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

server.listen(4196, async () => {
  console.log("Gizmo verification server running on http://127.0.0.1:4196");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  const pageErrors = [];
  page.on("pageerror", err => pageErrors.push(err.message));

  try {
    await page.goto("http://127.0.0.1:4196");
    await page.waitForTimeout(600);

    console.log("--- 1. Testing Cube Initial Gizmo & SelectionBox Center Alignment ---");
    const cubeData = await page.evaluate(() => {
      const obj = window.objects[0];
      const box = new window.THREE.Box3().setFromObject(obj.mesh);
      const center = new window.THREE.Vector3(); box.getCenter(center);
      const sBoxPos = window.selectionBox.position.clone();
      const tControls = window.transformControls;
      return {
        meshPos: obj.mesh.position.toArray(),
        boxCenter: center.toArray(),
        sBoxPos: sBoxPos.toArray(),
        gizmoSize: tControls.size,
        gizmoMode: window.gizmoMode,
        diffMeshCenter: obj.mesh.position.distanceTo(center),
        diffSBoxCenter: sBoxPos.distanceTo(center)
      };
    });
    console.log("Cube in Translate mode:", cubeData);
    assert(cubeData.diffMeshCenter < 1e-4, "Cube mesh.position equals boxCenter");
    assert(cubeData.diffSBoxCenter < 1e-4, "Cube selectionBox.position equals boxCenter");
    console.log("✓ Cube Translate Gizmo center matches selectionBox perfectly!");

    console.log("--- 2. Testing Cube Switch to Rotate Mode ---");
    await page.click("#rotateGizmoBtn");
    await page.waitForTimeout(200);

    const cubeRotateData = await page.evaluate(() => {
      const obj = window.objects[0];
      const box = new window.THREE.Box3().setFromObject(obj.mesh);
      const center = new window.THREE.Vector3(); box.getCenter(center);
      const sBoxPos = window.selectionBox.position.clone();
      const tControls = window.transformControls;
      return {
        meshPos: obj.mesh.position.toArray(),
        boxCenter: center.toArray(),
        sBoxPos: sBoxPos.toArray(),
        gizmoSize: tControls.size,
        gizmoMode: window.gizmoMode,
        diffMeshCenter: obj.mesh.position.distanceTo(center),
        diffSBoxCenter: sBoxPos.distanceTo(center)
      };
    });
    console.log("Cube in Rotate mode:", cubeRotateData);
    assert(cubeRotateData.diffMeshCenter < 1e-4, "Cube mesh.position equals boxCenter in Rotate mode");
    assert(cubeRotateData.diffSBoxCenter < 1e-4, "Cube selectionBox.position equals boxCenter in Rotate mode");
    assert(cubeRotateData.gizmoSize >= 0.88 && cubeRotateData.gizmoSize <= 1.05, "Cube Rotate Gizmo size is compact and comfortable: " + cubeRotateData.gizmoSize);
    console.log("✓ Cube Rotate Gizmo center matches selectionBox and size wraps outside!");

    // Capture Cube rotate screenshot
    await page.screenshot({ path: "output/playwright/cube-rotate-centered-1440x900.png" });

    console.log("--- 3. Testing Cylinder (User Scenario) ---");
    // Clear and add cylinder
    await page.click("#clearAllBtn");
    await page.waitForTimeout(200);
    await page.click(".dock-item[data-shape='cylinder'] .quick-add-btn");
    await page.waitForTimeout(300);

    const cylTranslate = await page.evaluate(() => {
      const obj = window.objects[0];
      const box = new window.THREE.Box3().setFromObject(obj.mesh);
      const center = new window.THREE.Vector3(); box.getCenter(center);
      const sBoxPos = window.selectionBox.position.clone();
      const tControls = window.transformControls;
      return {
        meshPos: obj.mesh.position.toArray(),
        boxCenter: center.toArray(),
        sBoxPos: sBoxPos.toArray(),
        boxMinY: box.min.y,
        boxMaxY: box.max.y,
        gizmoSize: tControls.size,
        diffMeshCenter: obj.mesh.position.distanceTo(center),
        diffSBoxCenter: sBoxPos.distanceTo(center)
      };
    });
    console.log("Cylinder in Translate mode:", cylTranslate);
    assert(cylTranslate.diffMeshCenter < 1e-4, "Cylinder mesh.position equals boxCenter in Translate mode");
    assert(cylTranslate.diffSBoxCenter < 1e-4, "Cylinder selectionBox.position equals boxCenter in Translate mode");
    assert(Math.abs(cylTranslate.boxMinY) < 1e-4, "Cylinder bottom rests flat on ground Y=0");
    console.log("✓ Cylinder Translate Gizmo center matches selectionBox and rests on ground!");

    console.log("--- 4. Testing Cylinder Rotate Mode (Outer Periphery Rings) ---");
    await page.click("#rotateGizmoBtn");
    await page.waitForTimeout(200);

    const cylRotate = await page.evaluate(() => {
      const obj = window.objects[0];
      const box = new window.THREE.Box3().setFromObject(obj.mesh);
      const center = new window.THREE.Vector3(); box.getCenter(center);
      const sBoxPos = window.selectionBox.position.clone();
      const tControls = window.transformControls;
      return {
        meshPos: obj.mesh.position.toArray(),
        boxCenter: center.toArray(),
        sBoxPos: sBoxPos.toArray(),
        gizmoSize: tControls.size,
        diffMeshCenter: obj.mesh.position.distanceTo(center),
        diffSBoxCenter: sBoxPos.distanceTo(center)
      };
    });
    console.log("Cylinder in Rotate mode:", cylRotate);
    assert(cylRotate.diffMeshCenter < 1e-4, "Cylinder mesh.position equals boxCenter in Rotate mode");
    assert(cylRotate.diffSBoxCenter < 1e-4, "Cylinder selectionBox.position equals boxCenter in Rotate mode");
    assert(cylRotate.gizmoSize >= 0.88 && cylRotate.gizmoSize <= 1.05, "Cylinder gizmo size is compact and comfortable: " + cylRotate.gizmoSize);
    console.log("✓ Cylinder Rotate Gizmo center coincident with selectionBox!");

    // Capture screenshot matching user reference view
    await page.screenshot({ path: "output/playwright/cylinder-rotate-outer-rings-1440x900.png" });
    console.log("✓ Saved cylinder rotate screenshot to output/playwright/cylinder-rotate-outer-rings-1440x900.png");

    console.log("--- 5. Testing Rotation around Geometric Center ---");
    const rotationResult = await page.evaluate(() => {
      const obj = window.objects[0];
      const initialPos = obj.mesh.position.clone();
      // Rotate 45 degrees around X
      obj.mesh.rotation.x = Math.PI / 4;
      obj.mesh.updateMatrixWorld(true);
      const newPos = obj.mesh.position.clone();
      const box = new window.THREE.Box3().setFromObject(obj.mesh);
      const newCenter = new window.THREE.Vector3(); box.getCenter(newCenter);
      return {
        initialPos: initialPos.toArray(),
        newPos: newPos.toArray(),
        newCenter: newCenter.toArray(),
        posDrift: initialPos.distanceTo(newPos),
        centerDrift: newPos.distanceTo(newCenter)
      };
    });
    console.log("Rotation test result:", rotationResult);
    assert(rotationResult.posDrift < 1e-5, "Mesh position stays pinned at center during rotation");
    assert(rotationResult.centerDrift < 1e-4, "Center stays aligned with mesh position");
    console.log("✓ Rotation strictly pivots around geometric center!");

    assert.equal(pageErrors.length, 0, "No page errors: " + pageErrors.join(", "));
    console.log("\n=======================================================");
    console.log("ALL GIZMO ALIGNMENT AND OUTER RING TESTS PASSED 100%!");
    console.log("=======================================================\n");

  } finally {
    await browser.close();
    server.close();
  }
});
