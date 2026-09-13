// Run against the local preview with Playwright CLI:
// playwright-cli --session shapes-voice-check run-code --filename tests/voice-audio-checks.js
async (page) => {
  const shapeKeys = ['cube','box','cylinder','cone','pyramid','prism','tetra','sphere','capsule','torus','ellipsoid','biconic','hexPrism','octa','dodeca','icosa'];
  const errors = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const onError = error => errors.push(String(error));
  page.on('pageerror', onError);

  await page.route('http://127.0.0.1:4173/', async route => {
    const response = await route.fetch();
    const html = await response.text();
    const observe = `
      window.__voiceObservation = () => ({
        speaking: isSpeaking,
        src: activeAudio?.currentSrc || '',
        readyState: activeAudio?.readyState || 0,
        duration: Number.isFinite(activeAudio?.duration) ? activeAudio.duration : 0,
        pressed: document.getElementById('islandSpeechBtn')?.getAttribute('aria-pressed'),
        label: document.getElementById('speechLabel')?.textContent || ''
      });
    `;
    await route.fulfill({response, body: html.replace('// 开屏迎宾提示', observe + '\n// 开屏迎宾提示')});
  });

  await page.goto('http://127.0.0.1:4173/');
  await page.waitForFunction(() => window.__voiceObservation?.());
  const assets = await page.evaluate(async keys => {
    const results = await Promise.all(keys.map(async key => {
      const response = await fetch(`./vioce/${key}.mp3`, {cache: 'no-store'});
      return {
        key,
        ok: response.ok,
        type: response.headers.get('content-type') || ''
      };
    }));
    return results;
  }, shapeKeys);
  check(assets.length === 16, 'Expected 16 voice assets');
  check(assets.every(asset => asset.ok && asset.type.startsWith('audio/mpeg')), 'Every voice asset must be an audio/mpeg response');

  const observation = () => page.evaluate(() => window.__voiceObservation());
  await page.locator('.dock-item[data-shape="cube"] .shape-select').click();
  await page.locator('#islandSpeechBtn').click();
  await page.waitForFunction(() => {
    const state = window.__voiceObservation();
    return state.speaking && state.readyState >= 1 && state.src.endsWith('/vioce/cube.mp3');
  });
  let state = await observation();
  check(state.pressed === 'true' && state.label === '停止朗读', 'Audio start state did not update');
  check(state.duration > 0, 'Cube audio metadata did not load');

  await page.locator('#islandSpeechBtn').click();
  state = await observation();
  check(!state.speaking && state.pressed === 'false' && state.label === '听听看', 'Audio stop state did not update');
  check(errors.length === 0, 'Browser page errors: ' + errors.join('\n'));
  await page.unroute('http://127.0.0.1:4173/');
  page.off('pageerror', onError);
  return {assets: assets.map(asset => asset.key), cube: state, errors};
}
