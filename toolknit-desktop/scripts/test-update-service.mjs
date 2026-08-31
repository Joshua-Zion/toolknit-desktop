import assert from 'node:assert/strict';
import { compareVersions, createUpdateService, normalizeRelease, summarizeReleaseIntroduction, summarizeReleaseNotes } from '../src/update-service.js';

assert.equal(compareVersions('v2.2.0', '2.1.9'), 1);
assert.equal(compareVersions('2.1.1', '2.1.1'), 0);
assert.equal(compareVersions('2.2.0-beta.2', '2.2.0-beta.10'), -1);
assert.equal(compareVersions('2.2.0', '2.2.0-rc.1'), 1);
assert.equal(compareVersions('invalid', '2.2.0'), 0);

const notes = summarizeReleaseNotes('# Title\n\n## Faster exports\n- Preview work is lighter.\n\n## Safer updates\n- The installer remains verified.');
assert.deepEqual(notes, [
  { title: 'Faster exports', body: 'Preview work is lighter.' },
  { title: 'Safer updates', body: 'The installer remains verified.' }
]);
assert.equal(summarizeReleaseIntroduction('# Version\n\nA thoughtful release summary.\n\n## Changes\n- Detail.'), 'A thoughtful release summary.');

const release = normalizeRelease({
  tag_name: 'v2.2.0',
  name: 'ToolKnit Desktop v2.2.0',
  body: '## Highlights\n- A new update flow.',
  published_at: '2026-08-25T00:00:00Z',
  html_url: 'https://github.com/ZihangDong/toolknit-desktop/releases/tag/v2.2.0'
});
assert.equal(release.version, '2.2.0');
assert.equal(release.notes[0].title, 'Highlights');
assert.equal(release.summary, '');

const stored = new Map();
let clock = 10_000;
let apiCalls = 0;
const fetchImpl = async url => {
  apiCalls += 1;
  if (url.includes('raw.githubusercontent.com')) return { ok: false, status: 404, text: async () => '' };
  return {
    ok: true,
    status: 200,
    json: async () => ({
      tag_name: 'v2.2.0',
      name: 'ToolKnit Desktop v2.2.0',
      body: '## Highlights\n- A new update flow.',
      published_at: '2026-08-25T00:00:00Z',
      html_url: 'https://github.com/ZihangDong/toolknit-desktop/releases/tag/v2.2.0'
    })
  };
};
const service = createUpdateService({
  fetchImpl,
  storage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
  now: () => clock
});
const first = await service.check();
assert.equal(first.fromCache, false);
assert.equal(service.shouldPrompt(first, '2.1.1'), true);
service.defer(first.release.version);
const deferred = await service.check();
assert.equal(deferred.fromCache, true);
assert.equal(service.shouldPrompt(deferred, '2.1.1'), false);
assert.equal(apiCalls, 2, 'one release request and one optional note request are expected');

console.log('Update service contract passed: semver, release parsing, caching, and deferral.');
