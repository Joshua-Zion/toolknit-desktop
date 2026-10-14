import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { preview } from 'vite';

const require = createRequire(process.env.TOOLKNIT_TEST_MODULES
  ? path.join(process.env.TOOLKNIT_TEST_MODULES, 'package.json') : import.meta.url);
const { chromium } = require('playwright');
const output = path.resolve('tmp/markdown-diagrams');
await mkdir(output, { recursive: true });
const fixture = [
  '# Compatibility',
  'Inline $E=mc^2$ and a linked https://example.com.',
  '$$a^2+b^2=c^2$$',
  '```mermaid\nflowchart LR\n  A[Start] --> B[Preview]\n  B --> C[Export]\n```',
  '```mermaid\nsequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Ready\n```',
  '```mermaid\nclassDiagram\n  Document <|-- Report\n  Document : +export()\n```',
  '```mermaid\nstateDiagram-v2\n  [*] --> Editing\n  Editing --> Saved\n```',
  '```mermaid\nflowchart LR\n  A["$$E=mc^2$$"] --> B[Formula]\n```',
  '<img src=x onerror="window.mdInjected=true">',
  '[unsafe](javascript:alert(1))',
  '$\\href{javascript:alert(1)}{unsafe}$'
].join('\n\n');
const server = await preview({ configFile: false, logLevel: 'error',
  preview: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.TOOLKNIT_TEST_CHANNEL || 'msedge' });
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1401, height: 920 }, acceptDownloads: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(value => localStorage.setItem('toolknit.markdown.draft.v1', value), fixture);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
    await page.locator('[data-tool="markdown-editor"]').first().evaluate(node => node.click());
    await page.waitForSelector('#markdownEditorOverlay.visible');
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await page.waitForFunction(() => document.querySelectorAll('[data-md-preview] .mermaid svg').length === 5);
    assert.equal(await page.locator('[data-md-preview] .md-render-error').count(), 0);
    assert.ok(await page.locator('[data-md-preview] .katex').count() >= 2);
    assert.ok(await page.locator('[data-md-preview] math').count() >= 2);
    assert.equal(await page.locator('[data-md-preview] .katex-html').count(), 0);
    assert.equal(await page.locator('[data-md-preview] a[href="https://example.com/"]').count(), 1);
    assert.equal(await page.locator('[data-md-preview] [onerror], [data-md-preview] a[href^="javascript:"]').count(), 0);
    assert.equal(await page.evaluate(() => window.mdInjected), undefined);
    for (const svg of await page.locator('[data-md-preview] .mermaid svg').all()) {
      const bounds = await svg.boundingBox();
      assert.ok(bounds.width > 40 && bounds.height > 20, JSON.stringify(bounds));
      assert.ok(await svg.locator('path, rect, circle').count() > 0);
    }
    await page.screenshot({ path: path.join(output, `${theme}-preview.png`) });
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-md-export="html"]').click();
    const download = await downloadPromise;
    const saved = path.join(output, `${theme}.html`);
    await download.saveAs(saved);
    const html = await readFile(saved, 'utf8');
    assert.match(html, /Content-Security-Policy/);
    const exported = await browser.newPage();
    await exported.goto(`file://${saved.replaceAll('\\', '/')}`);
    assert.equal(await exported.locator('.mermaid svg').count(), 5);
    assert.ok(await exported.locator('math').count() >= 2);
    assert.equal(await exported.locator('main [onerror], main a[href^="javascript:"]').count(), 0);
    assert.equal(await exported.evaluate(() => window.mdInjected), undefined);
    await exported.close();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#markdownEditorOverlay.visible', { state: 'hidden' });
    await page.locator('[data-tool="markdown-editor"]').first().evaluate(node => node.click());
    await page.waitForFunction(() => document.querySelectorAll('[data-md-preview] .mermaid svg').length === 5);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${theme}: flowchart, sequence, class, state, formula label, Markdown math, sanitized export, reopen`);
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
