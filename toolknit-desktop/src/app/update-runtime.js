import { UPDATE_DOWNLOAD_PAGE } from '../update-service.js';
import { createLifecycleScope } from './tool-lifecycle.js';

/** Update status, version lookup, and tag-check concurrency boundary. */
export function createUpdateRuntime({
  isTauri = false,
  fallbackVersion = '0.0.0',
  updateService,
  compareVersions,
  translate = key => key,
  statusElement = null,
  checkButton = null,
  releaseButton = null,
  getDialogController = () => null,
  openExternalUrl = async () => {},
  loadAppVersion = async () => fallbackVersion
} = {}) {
  let running = false;
  let state = { kind: 'neutral', version: fallbackVersion };

  const getLocalAppVersion = async () => {
    if (!isTauri) return fallbackVersion;
    try {
      const version = await loadAppVersion();
      if (version && String(version).trim()) return String(version).trim();
    } catch (error) {
      console.error('Failed to read app version:', error);
    }
    return fallbackVersion;
  };

  const render = () => {
    if (!statusElement) return;
    const { kind, version } = state;
    const text = kind === 'checking'
      ? translate('settings.versionChecking')
      : kind === 'available'
        ? translate('settings.versionAvailable', { version })
        : kind === 'up-to-date'
          ? translate('settings.versionUpToDate', { version })
          : kind === 'error'
            ? translate('settings.versionUpdateFailed')
            : translate('settings.versionCurrent', { version });
    statusElement.textContent = text;
    statusElement.dataset.kind = kind;
    if (releaseButton) releaseButton.hidden = kind !== 'available';
  };

  const setState = (kind, version = fallbackVersion) => {
    state = { kind, version };
    render();
  };

  const runCheck = async ({ force = true, showUpdate = true } = {}) => {
    if (running) return null;
    running = true;
    if (checkButton) checkButton.disabled = true;
    setState('checking');
    try {
      const localVersion = await getLocalAppVersion();
      const result = await updateService.check({ force });
      if (compareVersions(result.release.version, localVersion) > 0) {
        setState('available', result.release.version);
        if (showUpdate) getDialogController()?.open({ ...result.release, currentVersion: localVersion });
      } else setState('up-to-date', localVersion);
      return result;
    } catch (error) {
      if (showUpdate) console.error('Version update check failed:', error);
      setState('error');
      return null;
    } finally {
      running = false;
      if (checkButton) checkButton.disabled = false;
    }
  };

  return Object.freeze({
    getLocalAppVersion,
    getState: () => ({ ...state }),
    openReleasePage: () => openExternalUrl(UPDATE_DOWNLOAD_PAGE),
    render,
    runCheck,
    service: updateService,
    setState
  });
}

export function scheduleAutomaticUpdateCheck({
  enabled = false,
  runtime,
  getDialogController = () => null,
  document: doc = globalThis.document,
  window: win = globalThis.window,
  delayMs = 5_000
} = {}) {
  const scope = createLifecycleScope();
  if (!enabled) return scope.dispose;
  let ready = false;
  let running = false;
  let completed = false;

  async function checkWhenVisible() {
    if (!ready || running || completed || scope.disposed || doc.hidden) return;
    running = true;
    const token = scope.token();
    try {
      const result = await runtime.runCheck({ force: false, showUpdate: false });
      if (!scope.isCurrent(token) || !result) return;
      completed = true;
      const currentVersion = await runtime.getLocalAppVersion();
      if (scope.isCurrent(token) && runtime.service.shouldPrompt(result, currentVersion)) {
        getDialogController()?.open({ ...result.release, currentVersion });
      }
    } catch { /* Optional automatic check retries on visibility or connectivity. */ }
    finally { running = false; }
  }

  scope.event(doc, 'visibilitychange', () => void checkWhenVisible());
  scope.event(win, 'online', () => void checkWhenVisible());
  scope.event(win, 'pagehide', scope.dispose);
  scope.timeout(() => { ready = true; void checkWhenVisible(); }, delayMs);
  return scope.dispose;
}
