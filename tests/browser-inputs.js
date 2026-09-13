// Run against the local preview with Playwright CLI:
// playwright-cli --session shapes-input-check run-code --filename tests/browser-inputs.js
async (page) => {
  const passed = [];
  const errors = [];
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const onError = error => errors.push(String(error));
  page.on('pageerror', onError);

  await page.route('http://127.0.0.1:4173/', async route => {
    const response = await route.fetch();
    const html = await response.text();
    const observe = `
      window.__inputObservation = () => {
        const rect = canvas.getBoundingClientRect();
        const project = point => {
          const p = point.clone().project(camera);
          return [rect.left + (p.x + 1) * rect.width / 2, rect.top + (1 - p.y) * rect.height / 2];
        };
        const objectState = objects.map(o => {
          const box = new THREE.Box3().setFromObject(o.mesh);
          return {
            id: o.id,
            key: o.key,
            position: o.mesh.position.toArray(),
            rotation: o.mesh.rotation.toArray().slice(0,3),
            screen: project(box.getCenter(new THREE.Vector3()))
          };
        });
        const gizmoObject = transformControls?.object;
        const origin = gizmoObject?.getWorldPosition(new THREE.Vector3());
        const axisPoint = axis => origin ? project(origin.clone().add(axis)) : null;
        const gizmoRoot = transformControls?.children.find(c => c.isTransformControlsGizmo);
        const handle = gizmoRoot?.gizmo[gizmoMode].children.find(h => h.name === (gizmoMode === 'translate' ? 'X' : 'E'));
        let handlePoint = null;
        if (handle) {
          handle.geometry.computeBoundingBox();
          const p = gizmoMode === 'translate' ? handle.geometry.boundingBox.getCenter(new THREE.Vector3()) :
            new THREE.Vector3().fromBufferAttribute(handle.geometry.attributes.position, 10);
          handlePoint = project(handle.localToWorld(p));
        }
        const speechButton = document.getElementById('islandSpeechBtn');
        return {
          mode: currentMode,
          key: currentShapeKey,
          selected: selectedObj?.id ?? null,
          objects: objectState,
          gizmo: gizmoObject?.userData.objId ?? null,
          gizmoMode,
          handlePoint,
          gizmoDragging: Boolean(gizmoDragging || transformControls?.dragging),
          gizmoAxes: origin ? {
            origin: project(origin),
            x: axisPoint(new THREE.Vector3(0.85, 0, 0)),
            y: axisPoint(new THREE.Vector3(0, 0.85, 0)),
            z: axisPoint(new THREE.Vector3(0, 0, 0.85))
          } : null,
          camera: camera.position.toArray(),
          canvas: {left: rect.left, top: rect.top, width: rect.width, height: rect.height},
          speech: {
            available: 'speechSynthesis' in window,
            speaking: isSpeaking,
            active: Boolean(activeUtterance),
            pressed: speechButton?.getAttribute('aria-pressed'),
            label: document.getElementById('speechLabel')?.textContent,
            toast: document.getElementById('dynamicToast')?.textContent || ''
          },
          speechCalls: window.__speechCalls || {speak: 0, cancel: 0}
        };
      };
      window.__triggerSpeechEnd = () => activeUtterance?.onend?.();
      window.__triggerSpeechError = error => activeUtterance?.onerror?.({error});
    `;
    await route.fulfill({response, body: html.replace('// 开屏迎宾提示', observe + '\n// 开屏迎宾提示')});
  });

  const state = () => page.evaluate(() => window.__inputObservation());
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const reset = async () => {
    await page.goto('http://127.0.0.1:4173/');
    await page.waitForFunction(() => window.__inputObservation?.().objects.length === 1);
    await settle();
  };
  const canvasBounds = () => page.locator('#canvas').boundingBox();
  const mousePoint = async point => {
    await page.mouse.click(point[0], point[1]);
    await settle();
  };

  await reset();
  await page.setViewportSize({width: 1024, height: 768});
  await settle();
  await page.locator('.quick-add-btn[data-shape="box"]').click();
  let before = await state();
  check(before.objects.length === 2, 'Mouse setup should contain two objects');
  const firstId = before.objects[0].id;
  const secondId = before.objects[1].id;
  await mousePoint(before.objects[0].screen);
  let after = await state();
  check(after.selected === firstId, 'Mouse picking after resize selected the wrong object');
  passed.push('native mouse pick after resize');

  const cameraBeforeOrbit = after.camera.join(',');
  const rect = await canvasBounds();
  await page.mouse.move(rect.x + rect.width * 0.72, rect.y + rect.height * 0.28);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.82, rect.y + rect.height * 0.36, {steps: 5});
  await page.mouse.up();
  await settle();
  after = await state();
  check(after.camera.join(',') !== cameraBeforeOrbit, 'Orbit drag did not move the camera');
  check(after.selected === firstId, 'Orbit drag changed selection');
  const cameraBeforeWheel = after.camera.join(',');
  await page.mouse.wheel(0, -240);
  await settle();
  after = await state();
  check(after.camera.join(',') !== cameraBeforeWheel, 'Mouse wheel did not zoom the camera');
  passed.push('Orbit drag and mouse-wheel zoom');

  await reset();
  before = await state();
  const gizmoId = before.selected;
  const startPosition = before.objects.find(o => o.id === gizmoId).position;
  check(before.gizmo === gizmoId && before.handlePoint, 'Translation gizmo was not attached');
  const translateStart = before.handlePoint;
  await page.mouse.move(translateStart[0], translateStart[1]);
  await page.mouse.down();
  await page.mouse.move(translateStart[0] + 55, translateStart[1], {steps: 6});
  await page.mouse.up();
  await settle();
  after = await state();
  const translated = after.objects.find(o => o.id === gizmoId).position;
  check(translated.some((value, index) => Math.abs(value - startPosition[index]) > 0.01), 'TransformControls translation drag did not move the object');
  check(after.selected === gizmoId && !after.gizmoDragging, 'Translation drag left a stale selection or drag state');
  passed.push('TransformControls translation drag');

  await page.locator('#rotateGizmoBtn').click();
  before = await state();
  const rotationStart = before.objects.find(o => o.id === gizmoId).rotation;
  const rotationPosition = before.objects.find(o => o.id === gizmoId).position;
  const rotatePoint = before.handlePoint;
  await page.mouse.move(rotatePoint[0], rotatePoint[1]);
  await page.mouse.down();
  await page.mouse.move(rotatePoint[0] + 45, rotatePoint[1] + 25, {steps: 6});
  await page.mouse.up();
  await settle();
  after = await state();
  check(after.selected === gizmoId && !after.gizmoDragging, 'Rotation drag left a stale selection or drag state');
  check(after.objects.find(o => o.id === gizmoId).position.join(',') === rotationPosition.join(','), 'Rotation drag unexpectedly translated the object');
  check(after.objects.find(o => o.id === gizmoId).rotation.some((v,i)=>Math.abs(v-rotationStart[i])>.01), 'Rotation drag did not rotate object');
  passed.push('TransformControls rotation drag');
  await reset();
  await page.locator('.quick-add-btn[data-shape="box"]').click();
  await settle();

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 2});
  before = await state();
  const touchTarget = before.objects.find(o => o.id === firstId).screen;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{id: 11, x: touchTarget[0], y: touchTarget[1]}],
    modifiers: 0
  });
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: [], modifiers: 0});
  await settle();
  after = await state();
  check(after.selected === firstId, 'Single-touch selection did not select the target');
  const selectionBeforeMulti = after.selected;
  const multiTarget = after.objects.find(o => o.id === secondId).screen;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{id: 21, x: multiTarget[0], y: multiTarget[1]}],
    modifiers: 0
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      {id: 21, x: multiTarget[0], y: multiTarget[1]},
      {id: 22, x: multiTarget[0] + 24, y: multiTarget[1] + 24}
    ],
    modifiers: 0
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [{id: 22, x: multiTarget[0] + 24, y: multiTarget[1] + 24}],
    modifiers: 0
  });
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: [], modifiers: 0});
  await settle();
  after = await state();
  check(after.selected === selectionBeforeMulti, 'Multi-touch falsely changed object selection');
  await cdp.send('Emulation.setTouchEmulationEnabled', {enabled: false});
  passed.push('browser-emulated single-touch pick and multi-touch rejection');

  await page.evaluate(() => {
    window.__speechCalls = {speak: 0, cancel: 0};
    if ('speechSynthesis' in window) {
      const synth = window.speechSynthesis;
      for (const method of ['speak', 'cancel']) {
        try {
          const original = synth[method].bind(synth);
          synth[method] = (...args) => {
            window.__speechCalls[method] += 1;
            return original(...args);
          };
        } catch {}
      }
    }
  });
  const audioAvailable = await page.evaluate(() => typeof Audio === 'function');
  if (audioAvailable) {
    await page.locator('#islandSpeechBtn').click();
    after = await state();
    check(after.speech.speaking && after.speech.pressed === 'true' && after.speech.label === '停止朗读', 'Speech start state did not update');
    await page.locator('#islandSpeechBtn').click();
    after = await state();
    check(!after.speech.speaking && after.speech.pressed === 'false' && after.speech.label === '听听看', 'Speech stop state did not update');
    check(!after.speech.toast.includes('出错'), 'Intentional speech cancellation showed an error');

    await page.locator('#islandSpeechBtn').click();
    await page.evaluate(() => window.__triggerSpeechError('network'));
    after = await state();
    check(!after.speech.speaking && after.speech.pressed === 'false', 'Speech error did not clear speaking state');
    check(after.speech.toast.includes('朗读出错'), 'Speech error status was not reported');

    await page.locator('#islandSpeechBtn').click();
    await page.evaluate(() => window.__triggerSpeechEnd());
    after = await state();
    check(!after.speech.speaking && after.speech.label === '听听看', 'Speech end did not restore idle state');
    passed.push('Local MP3 start/stop/error/end state');
  } else {
    passed.push('HTMLAudioElement unavailable in this browser; state path not executable');
  }

  check(errors.length === 0, 'Browser page errors: ' + errors.join('\n'));
  await page.unroute('http://127.0.0.1:4173/');
  page.off('pageerror', onError);
  return {passed, errors, audioAvailable};
}
