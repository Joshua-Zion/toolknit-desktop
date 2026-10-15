import assert from 'node:assert/strict';
import { compareVersions, createUpdateService, normalizeVersion, stableTagVersion, UPDATE_CACHE_KEY, UPDATE_DOWNLOAD_PAGE } from '../src/update-service.js';
import { createUpdateRuntime, scheduleAutomaticUpdateCheck } from '../src/app/update-runtime.js';

const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const tags = (...names) => json(names.map(name => ({ name })));
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
};
assert.equal(compareVersions('v3.10.0', '3.9.9'), 1);
assert.equal(compareVersions('3.1.0-beta.2', '3.1.0-beta.10'), -1);
assert.equal(compareVersions('3.1.0', '3.1.0-rc.1'), 1);
assert.equal(compareVersions('3.1.0+build', '3.1.0'), 0);
for (const invalid of ['invalid', '01.1.0', '1.1.0-01', '9007199254740992.0.0', '3.1', 'v3.1.0/path']) {
  assert.equal(normalizeVersion(invalid), null);
}
assert.equal(stableTagVersion('v3.2.0+build'), '3.2.0');
assert.equal(stableTagVersion('v4.0.0-beta.1'), null);
assert.equal(stableTagVersion('font-packs-v1'), null);

const cache = storage();
let calls = 0;
let time = 10000;
const fetchImpl = async (url, options) => {
  calls++;
  assert.equal(options.credentials, 'omit');
  assert.equal(options.redirect, 'error');
  assert.ok(options.signal);
  return url.includes('atomgit') ? tags('v3.10.0', 'font-packs-v1', 'v4.0.0-rc.1') : tags('v3.1.0', 'v3.2.0');
};
const service = createUpdateService({ fetchImpl, storage: cache, now: () => time });
const [first, concurrent] = await Promise.all([service.check(), service.check()]);
assert.deepEqual(first, concurrent);
assert.equal(calls, 2, 'Concurrent callers share both source requests');
assert.equal(first.release.version, '3.10.0');
assert.equal(first.release.htmlUrl, UPDATE_DOWNLOAD_PAGE);
assert.equal(service.shouldPrompt(first, '3.1.0'), true);
assert.equal(service.shouldPrompt(first, 'invalid'), false);
assert.equal(service.shouldPrompt(first, '3.10.0'), false);
assert.equal((await service.check()).fromCache, true);
assert.equal(calls, 2);
await service.check({ force: true });
assert.equal(calls, 4);
time += 7 * 3600000;
await service.check();
assert.equal(calls, 6);

for (const healthy of ['github', 'atomgit']) {
  const partial = createUpdateService({ storage: storage(), fetchImpl: async url => {
    if ((url.includes('atomgit') ? 'atomgit' : 'github') !== healthy) throw Error('offline');
    return tags('v3.3.0');
  } });
  assert.equal((await partial.check()).release.version, '3.3.0');
}
const bothFail = createUpdateService({ storage: storage(), fetchImpl: async () => { throw Error('offline'); } });
await assert.rejects(bothFail.check(), /sources-unavailable/);
await assert.rejects(bothFail.check(), /sources-unavailable/, 'Failure releases the concurrency lock');
for (const data of [{ name: 'v4.0.0' }, Array(101).fill({ name: 'v4.0.0' }), [{ name: 'v4.0.0-beta.1' }]]) {
  await assert.rejects(createUpdateService({ storage: storage(), fetchImpl: async () => json(data) }).check(), /sources-unavailable/);
}
await assert.rejects(createUpdateService({
  storage: storage(), fetchImpl: async () => new Response('x'.repeat(512 * 1024 + 1))
}).check(), /sources-unavailable/);

let pageCalls = 0;
const paged = createUpdateService({ storage: storage(), fetchImpl: async url => {
  pageCalls++;
  const page = new URL(url).searchParams.get('page');
  return page === '1' ? json(Array(100).fill({ name: 'v3.0.0' })) : tags('v3.20.0', 'v3.2.0');
} });
assert.equal((await paged.check()).release.version, '3.20.0', 'Tags are compared numerically across pages');
assert.equal(pageCalls, 4);
let maxPage = 0;
await createUpdateService({ storage: storage(), fetchImpl: async url => {
  maxPage = Math.max(maxPage, Number(new URL(url).searchParams.get('page')));
  return json(Array(100).fill({ name: 'v3.0.0' }));
} }).check();
assert.equal(maxPage, 3, 'Pagination is bounded');
const signals = [];
const stalled = createUpdateService({ timeoutMs: 25, storage: storage(), fetchImpl: async (_url, options) => {
  signals.push(options.signal);
  return { ok: true, headers: { get: () => null }, text: () => new Promise(() => {}) };
} });
await assert.rejects(stalled.check(), /sources-unavailable/, 'Deadline includes stalled response bodies');
assert.ok(signals.every(signal => signal.aborted));
const oneStalled = createUpdateService({ timeoutMs: 25, storage: storage(), fetchImpl: async url =>
  url.includes('atomgit') ? new Promise(() => {}) : tags('v3.4.0')
});
assert.equal((await oneStalled.check()).release.version, '3.4.0');

cache.setItem(UPDATE_CACHE_KEY, JSON.stringify({ checkedAt: time, release: { version: '9.0.0', source: 'github', htmlUrl: 'https://evil.invalid' } }));
assert.equal((await service.check()).release.htmlUrl, UPDATE_DOWNLOAD_PAGE, 'Cache cannot redirect downloads');
assert.equal((await service.check({ force: true })).release.version, '9.0.0', 'Lagging mirrors do not downgrade a verified version');
for (const corrupt of ['{', 'x'.repeat(2049), JSON.stringify({ checkedAt: time, release: { version: '9.0.0', source: 'evil' } })]) {
  cache.setItem(UPDATE_CACHE_KEY, corrupt);
  assert.equal((await service.check()).fromCache, false);
}
const noStorage = createUpdateService({ storage: { getItem() { throw Error(); }, setItem() { throw Error(); } }, fetchImpl });
assert.equal((await noStorage.check()).release.version, '3.10.0');
const oldCache = storage();
oldCache.setItem('toolknit.update-check.v1', JSON.stringify({ deferredVersion: '3.10.0' }));
assert.equal((await createUpdateService({ storage: oldCache, fetchImpl }).check()).fromCache, false);

const opened = [];
const dialogs = [];
const button = { disabled: false };
const runtime = createUpdateRuntime({
  fallbackVersion: '3.1.0', updateService: service, compareVersions, checkButton: button,
  getDialogController: () => ({ open: value => dialogs.push(value) }),
  openExternalUrl: async url => { opened.push(url); return true; }
});
await runtime.runCheck();
assert.equal(runtime.getState().kind, 'available');
assert.equal(dialogs[0].currentVersion, '3.1.0');
assert.equal(button.disabled, false);
await runtime.openReleasePage();
assert.deepEqual(opened, [UPDATE_DOWNLOAD_PAGE]);
const silent = createUpdateRuntime({ fallbackVersion: '3.1.0', updateService: bothFail, compareVersions });
assert.equal(await silent.runCheck({ showUpdate: false }), null);
assert.equal(silent.getState().kind, 'error');

const doc = new EventTarget();
doc.hidden = true;
const win = new EventTarget();
let automaticCalls = 0;
let automaticDialogs = 0;
let resolveAutomatic;
const automaticRuntime = {
  runCheck: () => {
    automaticCalls++;
    return new Promise(resolve => { resolveAutomatic = resolve; });
  },
  getLocalAppVersion: async () => '3.1.0',
  service: { shouldPrompt: () => true }
};
const automaticOptions = {
  enabled: true, runtime: automaticRuntime, document: doc, window: win, delayMs: 0,
  getDialogController: () => ({ open: () => automaticDialogs++ })
};
const flush = () => new Promise(resolve => setTimeout(resolve, 10));
const stopAutomatic = scheduleAutomaticUpdateCheck(automaticOptions);
await flush();
assert.equal(automaticCalls, 0, 'Tray-hidden startup waits until visible');
doc.hidden = false;
doc.dispatchEvent(new Event('visibilitychange'));
win.dispatchEvent(new Event('online'));
assert.equal(automaticCalls, 1, 'Visibility and online do not duplicate an in-flight check');
resolveAutomatic(null);
await flush();
win.dispatchEvent(new Event('online'));
assert.equal(automaticCalls, 2, 'Network recovery retries a failed automatic check');
resolveAutomatic({ release: { version: '3.2.0' } });
await flush();
assert.equal(automaticDialogs, 1, 'Any main-window page can receive an update');
win.dispatchEvent(new Event('online'));
assert.equal(automaticCalls, 2, 'Successful automatic check runs once per startup');
stopAutomatic();
stopAutomatic();
const stopDisabled = scheduleAutomaticUpdateCheck({ ...automaticOptions, enabled: false });
await flush();
assert.equal(automaticCalls, 2, 'Auxiliary and browser windows do not run automatic checks');
stopDisabled();
scheduleAutomaticUpdateCheck(automaticOptions);
await flush();
assert.equal(automaticCalls, 3);
win.dispatchEvent(new Event('pagehide'));
resolveAutomatic({ release: { version: '3.3.0' } });
await flush();
assert.equal(automaticDialogs, 1, 'Disposed windows reject late responses');
win.dispatchEvent(new Event('online'));
assert.equal(automaticCalls, 3, 'Automatic check listeners are removed at pagehide');
console.log('Update contracts passed: dual tags, stable semver, bounds, timeout, concurrency, cache and download destination.');
