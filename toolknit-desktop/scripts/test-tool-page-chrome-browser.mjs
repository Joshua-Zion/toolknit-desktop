import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { LAZY_TOOL_SPECS } from '../src/features/lazy-tools.js';

const require = createRequire(process.env.TOOLKNIT_TEST_MODULES
  ? path.join(process.env.TOOLKNIT_TEST_MODULES, 'package.json') : import.meta.url);
const { chromium } = require('playwright');
const output = path.resolve('tmp/tool-page-chrome-browser');
await mkdir(output, { recursive: true });
const server = await createServer({ configFile: false, logLevel: 'error', optimizeDeps: { entries: ['index.html'] },
  server: { host: '127.0.0.1', port: 0, hmr: false, open: false, watch: { ignored: ['**/src-tauri/**', '**/cli/**', '**/tmp/**'] } } });
await server.listen();
const browser = await chromium.launch({ headless: true,
  ...(process.env.TOOLKNIT_TEST_BROWSER ? { executablePath: process.env.TOOLKNIT_TEST_BROWSER } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const url = server.resolvedUrls.local[0];
await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin
  ? route.continue() : route.abort());
const settle = () => page.waitForFunction(() => {
  const veil = document.querySelector('[data-tk-page-transition-veil]');
  return !veil || getComputedStyle(veil).visibility === 'hidden';
});
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#homeToolGrid .tool-result-card');
  console.log('PASS application startup');
  // Template content has an inert ownerDocument without a documentElement.
  assert.equal(await page.evaluate(async () => {
    const { toolTopbarMarkup } = await import('/src/shared/tool-page-shell.js');
    const { mountTrustedTemplate } = await import('/src/app/trusted-template-runtime.js');
    const { prepareToolPageChrome } = await import('/src/shared/tool-page-chrome.js');
    const host = document.createElement('div');
    mountTrustedTemplate(toolTopbarMarkup({ tag: 'FIXTURE', title: 'Fixture' }), { host });
    prepareToolPageChrome(host);
    prepareToolPageChrome(host);
    return host.querySelectorAll('.tk-nav-maximize svg').length;
  }), 1, 'detached template preparation is safe and idempotent');

  for (const tool of ['pdf-to-scan', 'ppt-draft', 'markdown-editor', 'hardware-overview', 'duplicate-file-cleanup']) {
    await page.mouse.move(0, 250);
    await page.locator(`.audio-list-item[data-tool="${tool}"]`).evaluate(node => node.click());
    const root = `#${LAZY_TOOL_SPECS[tool].overlayId}`;
    await page.waitForSelector(`${root}.visible`);
    await settle();
    const nav = page.locator(`${root} .tk-tool-nav`).first();
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.mouse.move(0, 250);
      assert.equal(await nav.evaluate(n => getComputedStyle(n).backgroundColor),
        theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(8, 8, 9)', `${tool} ${theme} surface`);
      const back = nav.locator('.tk-nav-back');
      await page.waitForFunction(selector => getComputedStyle(document.querySelector(selector)).width === '36px', `${root} .tk-nav-back`);
      const label = nav.locator('.tk-nav-tag').first();
      const before = await label.boundingBox();
      await back.hover();
      await page.waitForFunction(selector => getComputedStyle(document.querySelector(selector)).width === '64px', `${root} .tk-nav-back`);
      const after = await label.boundingBox();
      assert.ok(Math.abs(after.x - before.x - 28) < 1, `${tool} title follows expansion`);
      assert.equal(await back.evaluate(n => getComputedStyle(n, '::after').content), 'none');
      await nav.screenshot({ path: path.join(output, `${tool}-${theme}.png`) });
      await page.mouse.move(0, 250);
      await page.waitForFunction(selector => getComputedStyle(document.querySelector(selector)).width === '36px', `${root} .tk-nav-back`);
      for (let cycle = 0; cycle < 3; cycle++) {
        for (const role of ['web', 'support']) {
          const button = nav.locator(`.tk-nav-${role}`);
          await button.hover();
          await page.waitForFunction(selector => getComputedStyle(document.querySelector(selector)).opacity === '1', `${root} .tk-nav-${role} .tk-nav-alternate`);
          await page.mouse.move(0, 250);
          await page.waitForFunction(selector => getComputedStyle(document.querySelector(selector)).opacity === '0', `${root} .tk-nav-${role} .tk-nav-alternate`);
        }
      }
      for (const role of ['settings', 'minimize', 'maximize', 'close']) {
        const button = nav.locator(`.tk-nav-${role}`);
        for (let cycle = 0; cycle < 2; cycle++) {
          await button.hover();
          assert.ok(await button.locator('svg').evaluate(n => n.getAnimations({ subtree: true }).length > 0), `${role} animation retriggers`);
          await page.mouse.move(0, 250);
          assert.equal(await button.locator('svg').evaluate(n => n.getAnimations({ subtree: true }).length), 0);
        }
      }
      await nav.locator('.tk-nav-support').click();
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#donationOverlay')).opacity === '1');
      assert.equal(await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('#donationOverlay')?.id), 'donationOverlay');
      assert.equal(await page.locator(root).evaluate(n => n.inert), true);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#donationOverlay')).opacity === '0');
      assert.equal(await page.locator(root).evaluate(n => n.classList.contains('visible') && !n.inert), true, 'Escape restores the original tool, not the homepage');
      assert.equal(await nav.locator('.tk-nav-support').evaluate(n => n === document.activeElement), true, 'support restores tool button focus');
    }
    console.log(`PASS ${tool}: both themes, repeated morphs, title displacement and window animations`);
    await nav.locator('.tk-nav-back').click();
    await page.waitForFunction(selector => !document.querySelector(selector).classList.contains('visible'), root);
    await settle();
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.audio-list-item[data-tool="pdf-to-scan"]').evaluate(node => node.click());
  await page.waitForSelector('#pdfScanOverlay.visible');
  await settle();
  const reducedGear = page.locator('#pdfScanOverlay .tk-nav-settings');
  await reducedGear.hover();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#pdfScanOverlay .tk-nav-settings svg')).animationName === 'none');
  assert.equal(await reducedGear.locator('svg').evaluate(n => n.getAnimations({ subtree: true }).length), 0);
  assert.deepEqual(errors, [], 'no startup or navigation page errors');
} finally {
  await browser.close();
  await server.close();
}
