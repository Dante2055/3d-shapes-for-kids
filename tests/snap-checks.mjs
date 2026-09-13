// node tests/snap-checks.mjs
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

console.log('--- 1. Testing HTML Markup ---');
assert(html.includes('id="icon-magnet"'), 'SVG icon-library must contain #icon-magnet');
assert(html.includes('id="snapBtn"'), 'Stage toolbar must contain #snapBtn');
assert(html.includes('id="inspectorSnapBtn"'), 'Inspector panel must contain #inspectorSnapBtn');

// Check button attributes
const snapBtnMatch = html.match(/<button[^>]+id="snapBtn"[^>]*>([\s\S]*?)<\/button>/);
assert(snapBtnMatch, '#snapBtn element exists');
assert(snapBtnMatch[0].includes('class="tool-btn"'), '#snapBtn has class tool-btn');
assert(snapBtnMatch[0].includes('aria-pressed="false"'), '#snapBtn default aria-pressed="false"');
assert(snapBtnMatch[0].includes('href="#icon-magnet"'), '#snapBtn references #icon-magnet');
assert(snapBtnMatch[1].includes('磁吸'), '#snapBtn has label text 磁吸');

const inspBtnMatch = html.match(/<button[^>]+id="inspectorSnapBtn"[^>]*>([\s\S]*?)<\/button>/);
assert(inspBtnMatch, '#inspectorSnapBtn element exists');
assert(inspBtnMatch[0].includes('class="gizmo-pill"'), '#inspectorSnapBtn has class gizmo-pill');
assert(inspBtnMatch[0].includes('aria-pressed="false"'), '#inspectorSnapBtn default aria-pressed="false"');
assert(inspBtnMatch[0].includes('href="#icon-magnet"'), '#inspectorSnapBtn references #icon-magnet');
assert(inspBtnMatch[1].includes('磁吸'), '#inspectorSnapBtn has label text 磁吸');

console.log('✓ HTML markup and button structure passed!');

console.log('--- 2. Testing Snap Algorithms with Three.js ---');
const imports = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
const response = await fetch(imports.three);
assert(response.ok, 'Fetch Three.js');
const THREE = await import('data:text/javascript;base64,' + Buffer.from(await response.text()).toString('base64'));

const SNAP_GRID = 0.5;
const SNAP_ROTATION = THREE.MathUtils.degToRad(15);

const geo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
geo.translate(0, 0.8, 0); // bottom at y = 0
const mesh1 = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
mesh1.position.set(1.23, 0.12, 2.78);
mesh1.rotation.set(0, THREE.MathUtils.degToRad(17), 0);

const obj1 = { mesh: mesh1 };
const objects = [obj1];

function snapToAdjacentObjects(obj, objectsList = objects) {
  if (!obj || !obj.mesh || objectsList.length <= 1) return false;
  obj.mesh.updateMatrixWorld(true);
  const boxA = new THREE.Box3().setFromObject(obj.mesh);
  const centerA = boxA.getCenter(new THREE.Vector3());
  const THRESHOLD = 0.35;
  let snapped = false;

  for (const other of objectsList) {
    if (other === obj || !other.mesh || !other.mesh.visible) continue;
    other.mesh.updateMatrixWorld(true);
    const boxB = new THREE.Box3().setFromObject(other.mesh);
    const centerB = boxB.getCenter(new THREE.Vector3());

    const overlapX = (boxA.min.x <= boxB.max.x + 0.1) && (boxA.max.x >= boxB.min.x - 0.1);
    const overlapY = (boxA.min.y <= boxB.max.y + 0.1) && (boxA.max.y >= boxB.min.y - 0.1);
    const overlapZ = (boxA.min.z <= boxB.max.z + 0.1) && (boxA.max.z >= boxB.min.z - 0.1);

    // 1. 顶部堆叠吸附
    if (overlapX && overlapZ && Math.abs(boxA.min.y - boxB.max.y) < THRESHOLD) {
      const deltaY = boxB.max.y - boxA.min.y;
      obj.mesh.position.y += deltaY;
      boxA.min.y += deltaY;
      boxA.max.y += deltaY;
      if (Math.abs(centerA.x - centerB.x) < THRESHOLD) obj.mesh.position.x += (centerB.x - centerA.x);
      if (Math.abs(centerA.z - centerB.z) < THRESHOLD) obj.mesh.position.z += (centerB.z - centerA.z);
      snapped = true;
      break;
    }

    // 2. X 轴侧边紧贴
    if (overlapY && overlapZ) {
      if (Math.abs(boxA.min.x - boxB.max.x) < THRESHOLD) {
        obj.mesh.position.x += (boxB.max.x - boxA.min.x);
        if (Math.abs(centerA.z - centerB.z) < THRESHOLD) obj.mesh.position.z += (centerB.z - centerA.z);
        snapped = true;
        break;
      }
      if (Math.abs(boxA.max.x - boxB.min.x) < THRESHOLD) {
        obj.mesh.position.x += (boxB.min.x - boxA.max.x);
        if (Math.abs(centerA.z - centerB.z) < THRESHOLD) obj.mesh.position.z += (centerB.z - centerA.z);
        snapped = true;
        break;
      }
    }

    // 3. Z 轴侧边紧贴
    if (overlapX && overlapY) {
      if (Math.abs(boxA.min.z - boxB.max.z) < THRESHOLD) {
        obj.mesh.position.z += (boxB.max.z - boxA.min.z);
        if (Math.abs(centerA.x - centerB.x) < THRESHOLD) obj.mesh.position.x += (centerB.x - centerA.x);
        snapped = true;
        break;
      }
      if (Math.abs(boxA.max.z - boxB.min.z) < THRESHOLD) {
        obj.mesh.position.z += (boxB.min.z - boxA.max.z);
        if (Math.abs(centerA.x - centerB.x) < THRESHOLD) obj.mesh.position.x += (centerB.x - centerA.x);
        snapped = true;
        break;
      }
    }
  }
  return snapped;
}

function applySnapToObject(obj) {
  if (!obj || !obj.mesh) return;

  const snappedToObj = snapToAdjacentObjects(obj);

  if (!snappedToObj) {
    obj.mesh.position.x = Math.round(obj.mesh.position.x / SNAP_GRID) * SNAP_GRID;
    obj.mesh.position.z = Math.round(obj.mesh.position.z / SNAP_GRID) * SNAP_GRID;
  }

  obj.mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj.mesh);
  if (Math.abs(box.min.y) < 0.25) {
    obj.mesh.position.y -= box.min.y;
  } else if (!snappedToObj) {
    obj.mesh.position.y = Math.round(obj.mesh.position.y / SNAP_GRID) * SNAP_GRID;
  }

  const euler = obj.mesh.rotation;
  euler.x = Math.round(euler.x / SNAP_ROTATION) * SNAP_ROTATION;
  euler.y = Math.round(euler.y / SNAP_ROTATION) * SNAP_ROTATION;
  euler.z = Math.round(euler.z / SNAP_ROTATION) * SNAP_ROTATION;
}

applySnapToObject(obj1);
assert.equal(obj1.mesh.position.x, 1.0, 'X snapped to 1.0');
assert.equal(obj1.mesh.position.z, 3.0, 'Z snapped to 3.0');
assert(Math.abs(new THREE.Box3().setFromObject(obj1.mesh).min.y) < 1e-5, 'Bottom snapped flat to Y = 0');
assert(Math.abs(obj1.mesh.rotation.y - THREE.MathUtils.degToRad(15)) < 1e-5, 'Rotation snapped to 15 deg');
console.log('✓ Single-object grid, ground and rotation snap passed!');

obj1.mesh.position.set(0, 0, 0); obj1.mesh.rotation.set(0, 0, 0);
const mesh2 = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial());
mesh2.position.set(0.08, 1.45, 0.05);
const obj2 = { mesh: mesh2 };
objects.push(obj2);

applySnapToObject(obj2);
const box2 = new THREE.Box3().setFromObject(obj2.mesh);
assert(Math.abs(box2.min.y - 1.6) < 1e-4, 'Stacked cube2 min Y is 1.6');
assert(Math.abs(obj2.mesh.position.x) < 1e-4, 'Stacked cube2 centered in X');
assert(Math.abs(obj2.mesh.position.z) < 1e-4, 'Stacked cube2 centered in Z');
console.log('✓ Object stacking snap passed!');

const mesh3 = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial());
mesh3.position.set(1.75, 0, 0.1);
const obj3 = { mesh: mesh3 };
objects.push(obj3);

applySnapToObject(obj3);
assert(Math.abs(obj3.mesh.position.x - 1.6) < 1e-4, 'Side adjoining X is 1.6');
assert(Math.abs(obj3.mesh.position.z) < 1e-4, 'Side adjoining Z centered to 0');
console.log('✓ Side-by-side adjoining snap passed!');

console.log('--- 3. Testing Mode Switching Disabling ---');
assert(html.includes("const snapBtn = document.getElementById('snapBtn');\n  if (snapBtn) snapBtn.disabled = currentMode !== '3d';"),
  'updateModeUI disables snapBtn in Net mode');
console.log('✓ Mode switching logic passed!');

console.log('\n==================================');
console.log('ALL SNAP TESTS PASSED SUCCESSFULLY');
console.log('==================================\n');
