import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({ configFile: false, logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
  plugins: [{ name: 'home-interaction-fixture', configureServer(devServer) {
    devServer.middlewares.use('/interaction-fixture', (_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><body></body>');
    });
  } }] });
await server.listen();
const browser = await chromium.launch({ headless: true,
  ...(process.env.TOOLKNIT_TEST_BROWSER ? { executablePath: process.env.TOOLKNIT_TEST_BROWSER } : {}) });
try {
  const page = await browser.newPage();
  const origin = server.resolvedUrls.local[0];
  await page.goto(`${origin}interaction-fixture`);
  const result = await page.evaluate(async () => {
    const { createHomeController } = await import('/src/app/home-controller.js');
    const doc = new DOMParser().parseFromString(`<body><div class="app"></div><div class="main-content"></div>
      <div id="transitionMask"></div><div class="tool-card"><span class="tool-name">PDF</span></div>
      <input id="audioSearchInput"><button id="audioSearchBtn"></button><button id="audioClearBtn"></button><div id="audioSearchFooter"></div>
      <section class="content-section active" data-category="audio"><div class="audio-list-item">Music</div></section>
      <section class="content-section" data-category="pdf"><input class="tools-search-input"><button class="tools-search-btn"></button>
      <button class="tools-clear-btn"></button><div class="audio-list-item">Merge</div><div class="audio-list-item">Crop</div></section></body>`, 'text/html');
    const frames = new Map(), view = new EventTarget(); let frameId = 0, reads = 0, hidden = false;
    view.requestAnimationFrame = fn => { frames.set(++frameId, fn); return frameId; };
    view.cancelAnimationFrame = id => frames.delete(id);
    Object.defineProperty(doc, 'defaultView', { value: view });
    Object.defineProperty(doc, 'hidden', { get: () => hidden });
    const card = doc.querySelector('.tool-card');
    card.getBoundingClientRect = () => { reads++; return { left: 0, top: 0, width: 200, height: 100 }; };
    const runtime = createHomeController({ root: doc }); runtime.bind(); runtime.bind();
    const move = x => card.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: 50 }));
    for (let i = 0; i < 100; i++) move(i);
    const queued = frames.size, before = reads;
    for (const [id, fn] of [...frames]) { frames.delete(id); fn(); }
    const after = reads, x = card.style.getPropertyValue('--mouse-x');
    move(100); hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
    const hiddenFrames = frames.size;
    hidden = false;
    const input = doc.getElementById('audioSearchInput'); input.value = 'missing';
    doc.getElementById('audioSearchBtn').click();
    const searchImmediate = doc.querySelector('.audio-list-item').style.display === 'none';
    doc.getElementById('audioClearBtn').click();
    const resetImmediate = doc.querySelector('.audio-list-item').style.display === '' && input.value === '';
    const section = doc.querySelector('[data-category="pdf"]'); section.querySelector('input').value = 'crop';
    section.querySelector('.tools-search-btn').click();
    const categoryImmediate = section.querySelectorAll('.audio-list-item')[0].style.display === 'none'
      && section.querySelectorAll('.audio-list-item')[1].style.display === '';
    const mask = doc.getElementById('transitionMask').classList.contains('visible');
    move(150); runtime.dispose(); runtime.dispose(); move(155);
    return { queued, before, after, x, hiddenFrames, searchImmediate, resetImmediate, categoryImmediate, mask, disposedFrames: frames.size };
  });
  assert.deepEqual(result, { queued: 1, before: 0, after: 1, x: '49.5%', hiddenFrames: 0,
    searchImmediate: true, resetImmediate: true, categoryImmediate: true, mask: false, disposedFrames: 0 });
  console.log('Home: 100 pointer events -> one layout read; immediate search/reset; hidden/disposed frames cancelled');
} finally { await browser.close(); await server.close(); }
