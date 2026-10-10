import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createServer } from 'vite';

const require = createRequire(process.env.TOOLKNIT_TEST_MODULES ? path.join(process.env.TOOLKNIT_TEST_MODULES, 'package.json') : import.meta.url);
const { chromium } = require('playwright');
const output = path.resolve('tmp/duplicate-file-cleanup-browser');
await mkdir(output, { recursive: true });
const server = await createServer({ configFile: false, logLevel: 'error', optimizeDeps: { entries: ['index.html'] }, server: { host: '127.0.0.1', port: 0, hmr: false, watch: { ignored: ['**/src-tauri/**', '**/cli/**', '**/tmp/**'] } } });
await server.listen();
const browser = await chromium.launch({ headless: true, channel: process.env.TOOLKNIT_TEST_BROWSER || 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/src/main.js') return route.fulfill({ contentType: 'text/javascript', body: '' });
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    return route.continue();
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const { TOOL_MARKUP } = await import('/src/features/duplicate-file-cleanup/template.js');
    const { initDuplicateFileCleanupTool } = await import('/src/features/duplicate-file-cleanup/tool.js');
    const { setLangWithoutFade } = await import('/src/i18n.js');
    const { createIcons, icons } = await import('/node_modules/lucide/dist/esm/lucide.js');
    const { createToastManager } = await import('/src/app/toast-manager.js');
    await import('/src/styles/components/toasts.css');
    document.body.innerHTML = TOOL_MARKUP + '<div id="toastContainer" class="toast-container"></div>';
    const toasts = createToastManager();
    const groups = Array.from({ length: 12 }, (_, n) => ({ id: `group-${n}`, files: Array.from({ length: n === 0 ? 41 : 2 }, (_, i) => ({ name: `sample-${n}-${i}.pdf`, path: `D:/fixtures/${n}/sample-${i}.pdf`, size_bytes: 1024 * (n + 1), modified_at: 1700000000 + i })) }));
    const fixture = window.fixture = { groups, calls: [], scanMode: 'good', recycleMode: 'good', setLang: setLangWithoutFade, progress: { stage: 'hashing', scanned_files: 250, checked_files: 20, candidate_files: 80, read_bytes: 123456 } };
    const invoke = async (command, args) => {
      fixture.calls.push({ command, args });
      if (command === 'scan_duplicate_files') {
        fixture.progress = { stage: 'hashing', scanned_files: 250, checked_files: 20, candidate_files: 80, read_bytes: 123456 };
        const result = { groups: fixture.scanMode === 'none' ? [] : groups, progress: { stage: 'done', scanned_files: fixture.scanMode === 'partial' ? 100000 : 250, skipped: 3, read_bytes: 123456, truncated: fixture.scanMode === 'partial', limit_reason: 'files', filtered_files: 42, elapsed_ms: 2000 } };
        if (fixture.scanMode === 'pending') return new Promise(resolve => { fixture.finishScan = () => resolve(result); });
        if (fixture.scanMode === 'error') throw new Error('fixture scan error');
        return result;
      }
      if (command === 'get_duplicate_file_progress') return fixture.progress;
      if (command === 'recycle_duplicate_files') {
        const paths = args.selections.flatMap(group => group.paths);
        if (fixture.recycleMode === 'error') throw new Error('fixture transport error');
        const result = { moved_bytes: 1024, unprocessed: 0, elapsed_ms: 1500, items: paths.map((path, i) => ({ path, ok: fixture.recycleMode !== 'failure' && (fixture.recycleMode !== 'partial' || i !== 0), error: i === 0 ? '<img src=x onerror=alert(1)> fixture changed file' : null })) };
        if (fixture.recycleMode === 'pending') return new Promise(resolve => {
          fixture.progress = { ...fixture.progress, cleanup_stage: 'validating', cleanup_total: paths.length, cleanup_verified: 2, cleanup_completed: 0, cleanup_succeeded: 0, cleanup_failed: 0, cleanup_bytes: 0, cleanup_current: 'sample.pdf', cleanup_elapsed_ms: 500 };
          fixture.finishCleanup = (mode = 'partial') => resolve(mode === 'stopped' ? { ...result, cancelled: true, items: result.items.slice(0, 1), unprocessed: paths.length - 1 } : { ...result, items: result.items.map((item, i) => ({ ...item, ok: mode !== 'partial' || i !== 0 })) });
        });
        return result;
      }
      return null;
    };
    fixture.controller = initDuplicateFileCleanupTool({ overlay: document.getElementById('duplicateFileCleanupOverlay'), isTauri: true, tauriCore: Promise.resolve({ invoke }), notify: toasts.show, refreshIcons: () => createIcons({ icons }), loadDialog: async () => ({ open: async () => 'D:/fixtures' }) });
    fixture.controller.open();
  });
  await page.locator('#duplicateResults').getByText('还没有扫描结果').waitFor();
  await page.locator('#duplicateAllDrives').click();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    await page.locator('#duplicateScan').hover();
    await page.waitForTimeout(220);
    const colors = await page.locator('#duplicateScan').evaluate(button => { const css = getComputedStyle(button); return [css.backgroundColor, css.color]; });
    assert.deepEqual(colors, theme === 'light' ? ['rgb(32, 36, 40)', 'rgb(255, 255, 255)'] : ['rgb(242, 243, 244)', 'rgb(21, 22, 23)'], 'enabled scan hover stays legible');
    const toast = await page.locator('.app-toast').first().evaluate(node => { const css = getComputedStyle(node); return [css.backgroundColor, css.color]; });
    assert.notEqual(toast[0], toast[1], 'shared Toast contrasts in either theme');
  }
  assert.equal(await page.evaluate(() => window.fixture.calls.filter(call => call.command === 'scan_duplicate_files').length), 0, 'scope selection must not start scanning');
  await page.locator('#duplicateTypesNone').click();
  assert.equal(await page.locator('#duplicateScan').isDisabled(), true);
  const dot = await page.locator('[data-extension="pdf"]').evaluate(node => { const css = getComputedStyle(node, '::after'); return { opacity: css.opacity, duration: css.transitionDuration, content: css.content }; });
  assert.equal(dot.content, '""', 'unselected dot remains animatable');
  assert.notEqual(dot.duration, '0s');
  await page.locator('[data-extension="pdf"]').check();
  await page.locator('#duplicateScan').click();
  await page.locator('.duplicate-group').first().waitFor();
  const allDriveCall = await page.evaluate(() => [...window.fixture.calls].reverse().find(call => call.command === 'scan_duplicate_files'));
  assert.equal(allDriveCall.args.allDrives, true);
  assert.equal(allDriveCall.args.rootPath, '');
  assert.deepEqual(allDriveCall.args.extensions, ['pdf']);
  await page.locator('#duplicateTypesAll').click();
  await page.evaluate(() => { window.fixture.scanMode = 'pending'; });
  await page.locator('#duplicateAllDrives').click();
  await page.locator('#duplicateScan').click();
  assert.equal(await page.locator('#duplicateAllDrives').isDisabled(), true);
  assert.equal(await page.locator('#duplicateChoose').isDisabled(), true);
  assert.equal(await page.locator('#duplicateTypes').evaluate(node => node.disabled), true);
  assert.equal(await page.locator('[data-extension="pdf"]').isDisabled(), true);
  await page.locator('#duplicateResults .duplicate-scan-canvas').waitFor();
  assert.equal(await page.locator('#duplicateCancel svg, #duplicateCancel i').count(), 0, 'scan cancellation is text only');
  await page.evaluate(() => { window.fixture.progress = { ...window.fixture.progress, truncated: true, limit_reason: 'files' }; });
  await page.waitForFunction(() => window.fixture.calls.some(call => call.command === 'get_duplicate_file_progress'));
  assert.equal(await page.locator('#duplicateWarning').isVisible(), false, 'intermediate limit state must not announce finished partial results');
  assert.equal(await page.locator('#duplicateResults').getByText('选择扫描范围和文件类型，再开始查找完全重复的文件。').count(), 0);
  const canvasContent = () => page.locator('.duplicate-scan-canvas:visible').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let nonblank = 0, colored = 0;
    for (let i = 0; i < data.length; i += 4) { if (data[i + 3]) nonblank++; if (data[i] !== data[i + 1] || data[i + 1] !== data[i + 2]) colored++; }
    return { nonblank, colored, url: canvas.toDataURL() };
  });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    await page.waitForTimeout(100);
    const before = await canvasContent(); assert.ok(before.nonblank > 1000, 'supplied curve renders');
    await page.waitForTimeout(180);
    assert.notEqual((await canvasContent()).url, before.url, 'curve moves');
    await page.screenshot({ path: path.join(output, `scanning-${theme}.png`) });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(100);
  const still = await canvasContent(); await page.waitForTimeout(120);
  assert.equal((await canvasContent()).url, still.url, 'reduced motion renders a static curve');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#duplicateCancel').click();
  await page.evaluate(() => { window.fixture.scanMode = 'good'; });
  await page.locator('#duplicateChoose').click();
  await page.locator('#duplicateScan').click();
  await page.locator('.duplicate-group').first().waitFor();
  assert.equal(await page.locator('.duplicate-group').count(), 10);
  assert.equal(await page.locator('.duplicate-group').first().locator('.duplicate-group-tag').count(), 3, 'group summary is split into three tags');
  assert.equal(await page.locator('.duplicate-file').count(), 30, 'only the first accordion renders bounded members');
  assert.equal(await page.locator('#duplicateResults input[type="checkbox"]').count(), 0);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    await page.locator('.duplicate-file-actions [data-keep]').first().evaluate(async node => { await Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {}))); });
    const styles = await page.locator('.duplicate-file-actions [data-keep]').first().evaluate(button => {
      const css = getComputedStyle(button), panel = getComputedStyle(button.closest('.duplicate-members'));
      return { background: css.backgroundColor, foreground: css.color, panel: panel.backgroundColor, height: button.getBoundingClientRect().height };
    });
    assert.equal(styles.background, theme === 'dark' ? 'rgb(23, 25, 27)' : 'rgb(255, 255, 255)', 'buttons invert with the expanded panel');
    assert.equal(styles.foreground, styles.panel);
    assert.ok(styles.height >= 44);
  }
  assert.equal(await page.locator('.duplicate-file-actions [data-keep][aria-pressed="true"]').count(), 30, 'scan defaults to keeping every copy');
  assert.equal(await page.locator('#duplicateRemove').isDisabled(), true);
  await page.locator('.duplicate-file-actions [data-keep]').first().click();
  assert.match(await page.locator('#duplicateSelected').textContent(), /已选 1 个/);
  await page.locator('#duplicateClear').click();
  assert.equal(await page.locator('#duplicateRemove').isDisabled(), true);
  await page.locator('.duplicate-file-actions [data-keep]').nth(1).click();
  assert.match(await page.locator('#duplicateSelected').textContent(), /已选 1 个/);
  assert.equal(await page.locator('[data-keep][aria-pressed="false"]').getAttribute('data-keep'), 'D:/fixtures/0/sample-1.pdf');
  await page.locator('.duplicate-file-actions [data-keep]').nth(1).click();
  assert.equal(await page.locator('#duplicateRemove').isDisabled(), true, 'toggling back retains all copies');
  await page.locator('[data-retain="extras"]').first().click();
  assert.match(await page.locator('#duplicateSelected').textContent(), /已选 40 个/);
  await page.locator('[data-keep][aria-pressed="true"]').click();
  assert.match(await page.locator('#duplicateSelected').textContent(), /已选 40 个/);
  await page.locator('.app-toast-message').getByText('每组至少保留一份，不能选择最后一份清理。', { exact: true }).waitFor();
  await page.locator('[data-retain="all"]').first().click();
  assert.equal(await page.locator('#duplicateRemove').isDisabled(), true);
  const rowGeometry = await page.locator('.duplicate-file').first().evaluate(row => {
    const path = row.querySelector('.duplicate-file-path').getBoundingClientRect(), actions = row.querySelector('.duplicate-file-actions').getBoundingClientRect();
    return { pathWidth: path.width, rowWidth: row.clientWidth, actionsBelow: actions.top >= path.bottom, rightGap: row.getBoundingClientRect().right - actions.right };
  });
  assert.ok(rowGeometry.pathWidth >= rowGeometry.rowWidth - 2 && rowGeometry.actionsBelow);
  assert.ok(Math.abs(rowGeometry.rightGap) < 2, 'row actions stay at the right edge');
  assert.equal(await page.locator('.duplicate-group').nth(1).evaluate(node => getComputedStyle(node).borderTopWidth), '1px');
  assert.equal((await page.locator('#duplicatePrevious').textContent()).trim(), '');
  assert.ok(await page.locator('#duplicatePrevious').getAttribute('aria-label'));
  await page.locator('[data-toggle="group-11"]').click();
  assert.ok(await page.locator('#duplicateMembers-group-11').evaluate(node => node.getAnimations().length > 0), 'opening animates the same accordion node');
  const expandedColors = await page.locator('.duplicate-members').first().evaluate(node => { const css = getComputedStyle(node); return [css.backgroundColor, css.color]; });
  assert.notEqual(expandedColors[0], expandedColors[1], 'expanded area keeps contrasting surface and text');
  assert.equal(await page.locator('.duplicate-file').count(), 32);
  await page.locator('[data-toggle="group-11"]').click();
  assert.equal(await page.locator('#duplicateMembers-group-11').evaluate(node => node.inert), true, 'closing immediately removes keyboard access');
  await page.waitForFunction(() => !document.querySelector('#duplicateMembers-group-11 .duplicate-file'));
  await page.locator('[data-reveal]').first().click();
  assert.equal(await page.evaluate(() => window.fixture.calls.find(call => call.command === 'open_path').args.path), 'D:/fixtures/0/sample-0.pdf');
  await page.locator('[data-file-page="1"]').click();
  assert.equal(await page.locator('.duplicate-file').count(), 11);
  await page.locator('#duplicateSelect').click();
  assert.match(await page.locator('#duplicateSelected').textContent(), /51/);
  assert.equal(await page.locator('[data-toggle="group-0"]').getAttribute('aria-expanded'), 'true', 'selection preserves accordion state');
  await page.locator('#duplicateRemove').click();
  assert.equal(await page.locator('#duplicateFileCleanupOverlay').getAttribute('aria-hidden'), 'true');
  const keepersNotSelected = await page.evaluate(() => {
    const dialogText = document.getElementById('duplicateDialogText').textContent;
    return dialogText.includes('51') && !window.fixture.calls.some(call => call.command === 'recycle_duplicate_files');
  });
  assert.ok(keepersNotSelected, 'no cleanup before confirmation');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    await page.locator('#duplicateCleanupDialog').evaluate(async root => { await Promise.all(root.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))); });
    await page.screenshot({ path: path.join(output, `dialog-${theme}.png`) });
    const colors = await page.locator('#duplicateCleanupDialog .audio-convert-success-dialog').evaluate(node => { const css = getComputedStyle(node); return [css.backgroundColor, css.color]; });
    assert.notEqual(colors[0], colors[1]);
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#duplicateFileCleanupOverlay').getAttribute('aria-hidden'), 'false');
  await page.evaluate(() => { window.fixture.recycleMode = 'pending'; });
  await page.locator('#duplicateRemove').click(); await page.locator('#duplicateDialogConfirm').click();
  await page.locator('#duplicateCleanupLayer').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#duplicateCleanupDialog').evaluate(root => root.classList.contains('visible')), false, 'confirmation closes before cleanup');
  assert.equal(await page.locator('.cleanup-v2-side').evaluate(root => root.inert), true);
  assert.equal(await page.locator('.duplicate-main').evaluate(root => root.inert), true);
  const coverGeometry = await page.evaluate(() => {
    const cover = document.getElementById('duplicateCleanupLayer').getBoundingClientRect(), nav = document.querySelector('#duplicateFileCleanupOverlay header').getBoundingClientRect();
    return { top: cover.top, navBottom: nav.bottom, visible: !!nav.height };
  });
  assert.ok(coverGeometry.visible && coverGeometry.top >= coverGeometry.navBottom, 'navigation stays above the content cover');
  await page.waitForFunction(() => document.getElementById('duplicateCleanupCounts').textContent.includes('已验证 2'));
  assert.equal(await page.locator('#duplicateCleanupPercent').textContent(), '0%', 'verification is not fake completed progress');
  await page.evaluate(() => { Object.assign(window.fixture.progress, { cleanup_stage: 'recycling', cleanup_verified: 32, cleanup_completed: 10, cleanup_succeeded: 9, cleanup_failed: 1 }); });
  await page.waitForFunction(() => document.getElementById('duplicateCleanupPercent').textContent === '19%');
  for (const lang of ['zh', 'en']) for (const theme of ['light', 'dark']) {
    await page.evaluate(({ lang, theme }) => { window.fixture.setLang(lang); document.documentElement.dataset.theme = theme; }, { lang, theme });
    await page.locator('#duplicateFileCleanupOverlay [data-tool-website]').hover();
    await page.waitForTimeout(200);
    const navHover = await page.locator('#duplicateFileCleanupOverlay [data-tool-website]').evaluate(node => { const css = getComputedStyle(node); return { transform: css.transform, color: css.color }; });
    assert.notEqual(navHover.transform, 'none');
    const coverColors = await page.locator('#duplicateCleanupLayer').evaluate(node => { const css = getComputedStyle(node); return [css.backgroundColor, css.color]; });
    assert.deepEqual(coverColors, theme === 'light' ? ['rgb(255, 255, 255)', 'rgb(0, 0, 0)'] : ['rgb(0, 0, 0)', 'rgb(255, 255, 255)']);
    assert.equal(await page.locator('#duplicateCleanupQuote').evaluate(node => /[\u4e00-\u9fff]/.test(node.textContent)), lang === 'zh', 'active quote follows language changes');
    const before = await canvasContent(); await page.waitForTimeout(160);
    assert.ok(before.nonblank > 1000); assert.notEqual((await canvasContent()).url, before.url, 'cleanup reuses moving curve');
    for (const [width, height] of [[1440, 900], [780, 560], [390, 844]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.locator('#duplicateCleanupLayer').evaluate(node => node.scrollWidth <= node.clientWidth + 1), true, 'cover has no horizontal overflow');
      await page.screenshot({ path: path.join(output, `cleanup-${lang}-${theme}-${width}.png`) });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { window.fixture.setLang('zh'); window.fixture.finishCleanup(); });
  await page.waitForFunction(() => document.getElementById('duplicateCleanupLayer').dataset.outcome === 'partial');
  assert.equal(await page.locator('#duplicateCleanupFailed').textContent(), '1');
  assert.equal(await page.locator('#duplicateCleanupSucceeded').textContent(), '50');
  assert.equal(await page.locator('#duplicateCleanupFailureList img').count(), 0, 'failure text is escaped');
  await page.locator('#duplicateCleanupFailureDetails summary').click();
  assert.match(await page.locator('#duplicateCleanupFailureList').textContent(), /fixture changed file/);
  const plans = await page.evaluate(() => window.fixture.calls.find(call => call.command === 'recycle_duplicate_files').args.selections);
  assert.ok(plans.every(plan => !plan.paths.includes(plan.keep_path)));
  await page.screenshot({ path: path.join(output, 'settlement-partial.png') });
  await page.locator('#duplicateCleanupReturn').click();
  await page.locator('#duplicateCleanupLayer').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.duplicate-group').count(), 0);
  assert.equal(await page.locator('#duplicateScan').isDisabled(), true, 'return resets the scan scope');
  assert.equal(await page.locator('.cleanup-v2-side').evaluate(root => root.inert), false);
  await page.locator('#duplicateChoose').click();
  await page.locator('#duplicateScan').click();
  await page.locator('#duplicateNext').click();
  assert.equal(await page.locator('.duplicate-group').count(), 2);
  await page.locator('#duplicateSearch').fill('/0/');
  assert.equal(await page.locator('.duplicate-group').count(), 1);
  await page.locator('#duplicateSearch').fill('');
  for (const outcome of ['success', 'failure', 'stopped', 'error']) {
    await page.evaluate(outcome => { window.fixture.recycleMode = outcome === 'success' ? 'good' : outcome === 'stopped' ? 'pending' : outcome; }, outcome);
    await page.locator('#duplicateSelect').click();
    await page.locator('#duplicateRemove').click(); await page.locator('#duplicateDialogConfirm').click();
    if (outcome === 'stopped') {
      await page.locator('#duplicateCleanupStop').click();
      assert.equal(await page.locator('#duplicateCleanupStop').isDisabled(), true);
      await page.evaluate(() => window.fixture.finishCleanup('stopped'));
    }
    await page.waitForFunction(outcome => document.getElementById('duplicateCleanupLayer').dataset.outcome === outcome, outcome);
    if (outcome === 'stopped') assert.equal(await page.locator('#duplicateCleanupUnprocessed').textContent(), '50');
    if (outcome === 'error') assert.equal(await page.locator('#duplicateCleanupUnprocessed').textContent(), '待确认');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await page.waitForTimeout(650);
      await page.screenshot({ path: path.join(output, `settlement-${outcome}-${theme}.png`) });
    }
    await page.locator('#duplicateCleanupReturn').click();
    await page.locator('#duplicateCleanupLayer').waitFor({ state: 'hidden' });
    await page.locator('#duplicateChoose').click(); await page.locator('#duplicateScan').click();
  }
  await page.evaluate(() => { window.fixture.recycleMode = 'pending'; });
  await page.locator('#duplicateSelect').click(); await page.locator('#duplicateRemove').click(); await page.locator('#duplicateDialogConfirm').click();
  await page.evaluate(() => { window.fixture.controller.close(); window.fixture.controller.open(); window.fixture.finishCleanup('success'); });
  assert.equal(await page.locator('#duplicateCleanupLayer').isVisible(), false, 'late cleanup result cannot overlay a reopened session');
  await page.locator('#duplicateChoose').click(); await page.locator('#duplicateScan').click();
  for (const lang of ['zh', 'en']) for (const theme of ['light', 'dark']) {
    await page.evaluate(({ lang, theme }) => { window.fixture.setLang(lang); document.documentElement.dataset.theme = theme; }, { lang, theme });
    for (const [width, height] of [[1440, 900], [1000, 700], [780, 560], [390, 844]]) {
      await page.setViewportSize({ width, height });
      const overflow = await page.locator('#duplicateFileCleanupOverlay :is(button, input, .cleanup-v2-path)').evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().width && node.scrollWidth > node.clientWidth + 3).map(node => node.id || node.className));
      assert.deepEqual(overflow, [], `${lang}/${theme}/${width}: controls fit`);
      assert.ok(await page.locator('#duplicateResults').evaluate(node => node.clientHeight >= 150), `${lang}/${theme}/${width}: results remain visible`);
      await page.locator('#duplicateCleanupDialog').evaluate(async root => { await Promise.all(root.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))); });
      await page.screenshot({ path: path.join(output, `${lang}-${theme}-${width}.png`) });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { window.fixture.setLang('zh'); window.fixture.scanMode = 'partial'; });
  await page.locator('#duplicateScan').click();
  await page.locator('#duplicateWarning').waitFor({ state: 'visible' });
  assert.match(await page.locator('#duplicateWarning').textContent(), /100000/);
  assert.match(await page.locator('#duplicateStatus').textContent(), /部分扫描结束/);
  await page.evaluate(() => { window.fixture.setLang('zh'); window.fixture.scanMode = 'pending'; });
  await page.locator('#duplicateScan').click();
  await page.locator('#duplicateCancel').click();
  await page.evaluate(() => window.fixture.finishScan());
  assert.equal(await page.locator('.duplicate-group').count(), 0, 'cancelled result must not populate UI');
  await page.locator('#duplicateScan').click();
  await page.evaluate(() => { window.fixture.controller.close(); window.fixture.controller.open(); window.fixture.finishScan(); });
  assert.equal(await page.locator('.duplicate-group').count(), 0, 'closed session cannot write into reopened tool');
  await page.locator('#duplicateChoose').click();
  await page.evaluate(() => { window.fixture.scanMode = 'error'; });
  await page.locator('#duplicateScan').click(); await page.locator('#duplicateError').waitFor({ state: 'visible' });
  assert.ok(await page.locator('#duplicateScan').isEnabled());
  await page.evaluate(() => { window.fixture.scanMode = 'none'; });
  await page.locator('#duplicateScan').click(); await page.locator('#duplicateResults').getByText('没有符合条件的重复组').waitFor();
  await page.evaluate(() => { window.fixture.controller.dispose(); window.fixture.controller.dispose(); });
  assert.equal(await page.locator('#duplicateResults .duplicate-scan-canvas').count(), 0);
  assert.deepEqual(errors, []);
  console.log('Duplicate cleanup browser: light/dark, zh/en, layouts, pagination, keeper selection, confirmation, partial failure, cancellation and reopen passed.');
} finally { await browser.close(); await server.close(); }
