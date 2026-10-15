import { readResponseTextLimited } from './core/bounded-response.js';

export const UPDATE_DOWNLOAD_PAGE = 'https://toolknit.com/exe.html';
export const UPDATE_TAG_SOURCES = Object.freeze([
  Object.freeze({ name: 'github', url: 'https://api.github.com/repos/ZihangDong/toolknit-desktop/tags' }),
  Object.freeze({ name: 'atomgit', url: 'https://api.atomgit.com/api/v5/repos/ZihangDong/toolknit-desktop/tags' })
]);
export const UPDATE_CACHE_KEY = 'toolknit.update-check.v2';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_UPDATE_API_BYTES = 512 * 1024;
const PAGE_SIZE = 100;
const MAX_PAGES = 3;
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function normalizeVersion(value) {
  const raw = typeof value === 'string' ? value.trim().replace(/^v/i, '') : '';
  if (raw.length > 96) return null;
  const match = VERSION_PATTERN.exec(raw);
  if (!match) return null;
  const parts = match.slice(1, 4).map(Number);
  const prerelease = match[4]?.split('.') || [];
  if (parts.some(part => !Number.isSafeInteger(part)) || prerelease.some(part => /^0\d+$/.test(part))) return null;
  return { raw, major: parts[0], minor: parts[1], patch: parts[2], prerelease };
}

export function compareVersions(leftValue, rightValue) {
  const left = normalizeVersion(leftValue);
  const right = normalizeVersion(rightValue);
  if (!left || !right) return 0;
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
  }
  if (!left.prerelease.length || !right.prerelease.length) {
    return left.prerelease.length === right.prerelease.length ? 0 : left.prerelease.length ? -1 : 1;
  }
  for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index += 1) {
    const a = left.prerelease[index];
    const b = right.prerelease[index];
    if (a === b) continue;
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    const an = /^\d+$/.test(a);
    const bn = /^\d+$/.test(b);
    if (an && bn) return a.length === b.length ? (a > b ? 1 : -1) : (a.length > b.length ? 1 : -1);
    if (an !== bn) return an ? -1 : 1;
    return a > b ? 1 : -1;
  }
  return 0;
}

export function stableTagVersion(name) {
  const version = normalizeVersion(name);
  return version && !version.prerelease.length ? `${version.major}.${version.minor}.${version.patch}` : null;
}

async function fetchSource(fetchImpl, source, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('update:timeout'));
    }, timeoutMs);
  });
  try {
    // One deadline covers headers, bounded body reads and all pages for this source.
    return await Promise.race([deadline, (async () => {
      let newest = null;
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const url = `${source.url}?per_page=${PAGE_SIZE}&page=${page}`;
        const response = await fetchImpl(url, {
          signal: controller.signal, credentials: 'omit', redirect: 'error',
          headers: { Accept: 'application/json' }
        });
        if (controller.signal.aborted) throw new Error('update:timeout');
        if (!response.ok) throw new Error(`update:http:${response.status}`);
        const tags = JSON.parse(await readResponseTextLimited(response, MAX_UPDATE_API_BYTES));
        if (controller.signal.aborted) throw new Error('update:timeout');
        if (!Array.isArray(tags) || tags.length > PAGE_SIZE) throw new Error('update:invalid-tags');
        for (const tag of tags) {
          const version = stableTagVersion(tag?.name);
          if (version && (!newest || compareVersions(version, newest) > 0)) newest = version;
        }
        if (tags.length < PAGE_SIZE) break;
      }
      if (!newest) throw new Error('update:no-stable-tags');
      return { version: newest, source: source.name, htmlUrl: UPDATE_DOWNLOAD_PAGE };
    })()]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function readCache(storage) {
  try {
    const text = storage?.getItem?.(UPDATE_CACHE_KEY);
    if (!text || text.length > 2048) return null;
    const value = JSON.parse(text);
    const version = stableTagVersion(value?.release?.version);
    if (!version || !Number.isFinite(value.checkedAt) || !UPDATE_TAG_SOURCES.some(s => s.name === value.release?.source)) return null;
    return { checkedAt: value.checkedAt, release: { version, source: value.release.source, htmlUrl: UPDATE_DOWNLOAD_PAGE } };
  } catch { return null; }
}

export function createUpdateService({
  fetchImpl = globalThis.fetch?.bind(globalThis), storage = globalThis.localStorage,
  now = () => Date.now(), timeoutMs = REQUEST_TIMEOUT_MS
} = {}) {
  let inFlight = null;
  async function check({ force = false } = {}) {
    if (inFlight) return inFlight;
    const cached = readCache(storage);
    const age = now() - (cached?.checkedAt || 0);
    if (!force && cached && age >= 0 && age < CACHE_TTL_MS) return { release: cached.release, fromCache: true };
    if (typeof fetchImpl !== 'function') throw new Error('update:network-unavailable');
    inFlight = (async () => {
      const outcomes = await Promise.allSettled(UPDATE_TAG_SOURCES.map(source => fetchSource(fetchImpl, source, timeoutMs)));
      const releases = outcomes.filter(result => result.status === 'fulfilled').map(result => result.value);
      if (!releases.length) throw new Error('update:sources-unavailable');
      let release = releases.reduce((best, item) => compareVersions(item.version, best.version) > 0 ? item : best);
      // A temporarily lagging mirror must not erase a previously verified higher tag.
      if (cached && compareVersions(cached.release.version, release.version) > 0) release = cached.release;
      try { storage?.setItem?.(UPDATE_CACHE_KEY, JSON.stringify({ checkedAt: now(), release })); } catch { /* Optional cache. */ }
      return { release, fromCache: false };
    })();
    try { return await inFlight; } finally { inFlight = null; }
  }
  return {
    check,
    shouldPrompt: (result, currentVersion) => Boolean(normalizeVersion(currentVersion) && result?.release && compareVersions(result.release.version, currentVersion) > 0)
  };
}
