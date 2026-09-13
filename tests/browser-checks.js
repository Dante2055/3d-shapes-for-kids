// Run against the local preview with Playwright CLI:
// playwright-cli --session shapes-redesign run-code --filename tests/browser-checks.js
async (page) => {
  const results = [];
  const errors = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const onError = error => errors.push(String(error));
  page.on('pageerror', onError);
  // Expose read-only observations in the test response, without changing the source file.
  await page.route('http://127.0.0.1:4173/', async route => {
    const response = await route.fetch();
    const html = await response.text();
    const observe = `
      window.__labObservation = () => {
        const rect = canvas.getBoundingClientRect();
        const netCorners = [];
        if (currentMode === 'net') {
          const box = new THREE.Box3().setFromObject(NetFoldingManager.group);
          for (const x of [box.min.x,box.max.x]) for (const y of [box.min.y,box.max.y]) for (const z of [box.min.z,box.max.z]) {
            const p = new THREE.Vector3(x,y,z).project(camera);
            netCorners.push([p.x,p.y]);
          }
        }
        return {
          netCorners,
          mode: currentMode, key: currentShapeKey, selected: selectedObj?.id,
          gizmo: transformControls?.object?.userData.objId,
          gizmoMode, selectionVisible: selectionBox?.visible,
          camera: camera.position.toArray(), aspect: camera.aspect,
          canvas: [rect.width, rect.height],
          objects: objects.map(o => {
            const box = new THREE.Box3().setFromObject(o.mesh);
            const p = box.getCenter(new THREE.Vector3()).project(camera);
            return { id:o.id, key:o.key, position:o.mesh.position.toArray(), rotation:o.mesh.rotation.toArray().slice(0,3),
              scale:o.mesh.scale.toArray(), color:o.mesh.material.color.getHex(), wire:o.mesh.material.wireframe,
              bounds:box.min.toArray().concat(box.max.toArray()),
              screen:[rect.left+(p.x+1)*rect.width/2,rect.top+(1-p.y)*rect.height/2] };
          }),
          net: { key:NetFoldingManager.currentKey, fold:NetFoldingManager.foldProgress,
            playing:NetFoldingManager.isPlaying, labels:NetFoldingManager.showLabels,
            bounds:new THREE.Box3().setFromObject(NetFoldingManager.group).min.toArray().concat(new THREE.Box3().setFromObject(NetFoldingManager.group).max.toArray()) },
          previews:Object.entries(previewRenderers).map(([key,r]) => ({key,size:r.getSize(new THREE.Vector2()).toArray()}))
        };
      };
      window.__labLoadNetShape = key => NetFoldingManager.loadShape(key);
    `;
    await route.fulfill({response,body:html.replace('// 开屏迎宾提示', observe+'\n// 开屏迎宾提示')});
  });
  const state = () => page.evaluate(() => window.__labObservation());
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const setRange = (selector,value) => page.locator(selector).evaluate((el,value) => {
    el.value=String(value); el.dispatchEvent(new Event('input',{bubbles:true}));
  },value);
  const reset = async () => { await page.goto('http://127.0.0.1:4173/'); await page.waitForFunction(()=>window.__labObservation?.().objects.length===1); };
  await reset();
  const shapeKeys = await page.locator('.dock-item').evaluateAll(items=>items.map(item=>item.dataset.shape));
  check(shapeKeys.length===16,'Expected 16 shape choices');
  await page.setViewportSize({width:1440,height:900});
  // Real add buttons exercise each geometry creator and object selection.
  for (const key of shapeKeys) {
    await page.locator(`.quick-add-btn[data-shape="${key}"]`).click();
    const s=await state();
    check(s.objects.at(-1).key===key && s.selected===s.objects.at(-1).id,`Add/select ${key}`);
    check(s.objects.at(-1).bounds.every(Number.isFinite),`Finite geometry ${key}`);
  }
  check((await state()).objects.length===17,'All 16 additions retained');
  await page.locator('#canvas').focus();
  await page.keyboard.press('[');
  check((await state()).selected===(await state()).objects.at(-2).id,'Previous object shortcut');
  await page.keyboard.press(']');
  check((await state()).selected===(await state()).objects.at(-1).id,'Next object shortcut');
  await page.locator('.dock-item[data-shape="sphere"] .shape-select').click();
  check((await page.locator('#knowledgeContext').textContent()).includes('预览'),'Library browsing explicitly labeled');
  results.push('16 shapes: add, select, valid geometry, object shortcuts and explicit library preview');
  await page.locator('#clearAllBtn').click();
  check((await state()).objects.length===0,'Clear objects');
  check(await page.locator('#emptyState').isVisible(),'Empty stage shown');
  check(await page.locator('#sizeX').isDisabled(),'Empty controls disabled');
  check(!(await state()).selectionVisible,'Empty selection outline hidden');
  await page.locator('.quick-add-btn[data-shape="cube"]').click();
  for (const [axis,v] of [['X',1.4],['Y',1.8],['Z',0.7]]) await setRange('#size'+axis,v);
  check((await state()).objects[0].scale.join(',')==='1.4,1.8,0.7','XYZ scaling');
  const beforeKeys=(await state()).objects[0].position.join(',');
  await page.locator('#sizeX').focus(); await page.keyboard.press('ArrowRight');
  check((await state()).objects[0].position.join(',')===beforeKeys,'Range key does not move object');
  check(Math.abs((await state()).objects[0].scale[0]-1.45)<.001,'Range arrow changes size');
  await page.keyboard.press('Tab');
  check(await page.locator('#sizeY').evaluate(el=>el===document.activeElement),'Tab uses native focus order');
  await page.locator('#resetSizeBtn').click();
  check((await state()).objects[0].scale.every(x=>x===1),'Restore dimensions');
  await page.locator('.color-chip[data-color="0xFF9500"]').click();
  check((await state()).objects[0].color===0xFF9500,'Color material updated');
  check(await page.locator('.color-chip[data-color="0xFF9500"]').getAttribute('aria-pressed')==='true','Color selection state');
  await page.locator('#wireBtn').click(); check((await state()).objects[0].wire,'Wireframe on');
  await page.locator('#wireBtn').click(); check(!(await state()).objects[0].wire,'Wireframe off');
  await page.locator('#canvas').focus(); await page.keyboard.press('ArrowRight');
  check((await state()).objects[0].position[0]===.2,'Canvas keyboard move');
  await page.locator('#resetBtn').click();
  check((await state()).objects[0].position.every(x=>x===0),'Reset position');
  await page.locator('#rotateGizmoBtn').click(); check((await state()).gizmoMode==='rotate','Rotation handle mode');
  await page.locator('#gizmoBtn').click(); check((await state()).gizmoMode==='translate','Translation handle mode');
  const beforeRotate=(await state()).camera.join(',');
  await page.locator('#rotateBtn').click();
  await page.waitForFunction(before=>window.__labObservation().camera.join(',')!==before,beforeRotate);
  check(await page.locator('#rotateBtn').getAttribute('aria-pressed')==='true','Auto-rotate button state');
  await page.locator('#rotateBtn').click();
  results.push('Empty state, XYZ scaling, colors, wireframe, keyboard isolation, reset and rotation controls');
  await page.locator('#tabNetMode').click();
  const disabledNetShapes=await page.locator('.dock-item .shape-select:disabled').evaluateAll(items=>items.map(item=>item.closest('.dock-item').dataset.shape));
  check(disabledNetShapes.includes('sphere')&&!disabledNetShapes.includes('hexPrism'),'Net mode disables only shapes without a net');
  const nets=['cube','box','cylinder','cone','pyramid','prism','hexPrism','tetra'];
  for (const key of nets) {
    await page.locator(`.dock-item[data-shape="${key}"] .shape-select`).click();
    check((await state()).net.key===key,`Net ${key}`);
    await page.locator('#flatNetBtn').click(); check((await state()).net.fold===0,`Flat ${key}`);
    await setRange('#foldSlider',.5); check((await state()).net.fold===.5,`Intermediate ${key}`);
    check((await state()).net.bounds.every(Number.isFinite),`Finite net ${key}`);
    await settle();
    check((await state()).netCorners.flat().every(v=>Math.abs(v)<=1),`Net inside stage ${key}`);
    await page.locator('#solidNetBtn').click(); check((await state()).net.fold===1,`Solid ${key}`);
  }
  await page.locator('#playFoldBtn').click();
  await page.waitForFunction(()=>window.__labObservation().net.fold<.95);
  check(await page.locator('#playFoldBtn').getAttribute('aria-pressed')==='true','Playback state');
  await page.locator('#playFoldBtn').click(); check(!(await state()).net.playing,'Pause fold');
  await page.locator('#showLabelsCheck').uncheck(); check(!(await state()).net.labels,'Hide labels');
  await page.locator('#showLabelsCheck').check(); check((await state()).net.labels,'Show labels');
  check(await page.locator('.dock-item[data-shape="sphere"] .shape-select').isDisabled(),'Unsupported net shape cannot be selected');
  await page.evaluate(() => window.__labLoadNetShape('sphere'));
  check((await state()).key==='cube' && (await state()).net.key==='cube','Unsupported net fallback');
  check(await page.locator('#stageShapeName').textContent()==='正方体','Fallback stage title');
  check(await page.locator('#islandName').textContent()==='正方体','Fallback knowledge title');
  check(await page.locator('.dock-item[data-shape="cube"] .shape-select').getAttribute('aria-pressed')==='true','Fallback dock selection');
  await page.locator('#tab3DMode').click();
  check((await state()).gizmo===(await state()).selected,'Handle restored after net mode');
  await page.locator('#canvas').focus(); await page.keyboard.press('Delete');
  check((await state()).objects.length===0,'Keyboard deletes last object');
  results.push('8 nets: flat/mid/solid, play/pause, face labels, consistent fallback and return');
  await reset();
  for (const view of ['front','back','top','bottom','left','right']) {
    await page.locator(`.view-cell[data-view="${view}"]`).click();
    await page.waitForTimeout(720);
    const s=await state();
    check(s.camera.every(Number.isFinite),`Finite camera ${view}`);
    check(await page.locator(`.view-cell[data-view="${view}"]`).getAttribute('aria-pressed')==='true',`View state ${view}`);
    if (view==='front') check(Math.abs(s.camera[0])<.01&&s.camera[2]>5,'Front camera');
    if (view==='top') check(s.camera[1]>5&&Math.abs(s.camera[0])<.01,'Top camera');
  }
  results.push('Six orthographic preview buttons and camera transitions');
  await reset();
  for (const [width,height] of [[1440,900],[1280,800],[1024,768],[768,1024]]) {
    await page.setViewportSize({width,height});
    await settle();
    for (const mode of ['3d','net']) {
      await page.locator(mode==='3d'?'#tab3DMode':'#tabNetMode').click();
      if(mode==='net') await setRange('#foldSlider',.4);
      await settle();
      const layout=await page.evaluate(()=>{
        const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height}};
        return {width:innerWidth,scroll:document.documentElement.scrollWidth,stage:rect('#stageViewport'),panel:rect('.inspector-panel'),knowledge:rect('.bottom-island'),card:rect('.stage-card'),library:rect('.shape-dock'),
          previews:[...document.querySelectorAll('.preview')].map(el=>[el.clientWidth,el.clientHeight])};
      });
      check(layout.scroll<=width,`No page overflow ${width} ${mode}`);
      check(layout.stage.right<=layout.panel.x+1,`Panel does not cover stage ${width} ${mode}`);
      check(layout.knowledge.y>=layout.card.bottom,`Knowledge below stage ${width} ${mode}`);
      const s=await state();
      if(mode==='net') check(s.netCorners.flat().every(v=>Math.abs(v)<=1),`Full net fits ${width}`);
      check(Math.abs(s.aspect-layout.stage.w/layout.stage.h)<.01,`Camera ratio ${width} ${mode}`);
      s.previews.forEach((v,i)=>check(v.size.every((n,j)=>Math.abs(n-layout.previews[i][j])<=1),`Preview size ${width} ${v.key}`));
      await page.locator('.inspector-panel').evaluate(el=>el.scrollTop=0);
      await page.locator('#dockList').evaluate(el=>{el.scrollLeft=0;el.scrollTop=0});
      await page.locator('#dynamicToast').evaluate(el=>el.classList.remove('show'));
      await page.evaluate(()=>window.scrollTo(0,0));
      await settle();
      await page.screenshot({path:`output/playwright/${width}x${height}-${mode}.png`,fullPage:true,animations:'disabled'});
    }
    results.push(`${width}x${height}: both layouts, camera ratio, preview resolution, screenshots`);
  }
  check(errors.length===0,'Browser errors: '+errors.join('\n'));
  await page.unroute('http://127.0.0.1:4173/');
  page.off('pageerror',onError);
  await page.setViewportSize({width:1440,height:900});
  await page.goto('http://127.0.0.1:4173/');
  return {passed:results,errors};
}
