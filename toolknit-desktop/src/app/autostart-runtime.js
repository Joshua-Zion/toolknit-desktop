import { createLifecycleScope } from './tool-lifecycle.js';

/** Native status is authoritative; the tray and settings never keep separate preferences. */
export function createAutostartRuntime({ root = document, isTauri = false, tauriCorePromise, tauriEventPromise, translate = key => key, onLanguageChange, notify = () => {} } = {}) {
  const scope = createLifecycleScope();
  const toggle = root.getElementById('autostartToggle');
  const status = root.getElementById('autostartStatus');
  let current = { supported: false, enabled: false };
  let busy = false;
  let failed = false;
  const render = () => {
    if (toggle) {
      toggle.disabled = busy || !current.supported || failed;
      toggle.setAttribute('aria-pressed', String(current.enabled));
    }
    if (status) status.textContent = translate(failed ? 'settings.autostartError' : !current.supported ? 'settings.autostartUnavailable' : current.enabled ? 'settings.autostartOn' : 'settings.autostartOff');
  };
  const refresh = async () => {
    if (!isTauri || busy || scope.disposed) return;
    const revision = scope.invalidate();
    try {
      const { invoke } = await tauriCorePromise;
      const value = await invoke('get_autostart');
      if (!scope.isCurrent(revision)) return;
      current = value;
      failed = false;
    } catch { if (scope.isCurrent(revision)) failed = true; }
    if (scope.isCurrent(revision)) render();
  };
  if (toggle) scope.event(toggle, 'click', async () => {
    if (busy || !current.supported || failed) return;
    const revision = scope.invalidate();
    busy = true;
    render();
    try {
      const { invoke } = await tauriCorePromise;
      const value = await invoke('set_autostart', { enabled: !current.enabled });
      if (!scope.isCurrent(revision)) return;
      current = value;
      notify(translate(value.enabled ? 'settings.autostartEnabled' : 'settings.autostartDisabled'));
    } catch { if (!scope.disposed) notify(translate('settings.autostartError')); }
    finally { busy = false; if (!scope.disposed) { render(); void refresh(); } }
  });
  if (isTauri && tauriEventPromise) {
    void tauriEventPromise.then(({ listen }) => listen('toolknit-autostart-changed', event => {
      if (scope.disposed) return;
      if (!busy) scope.invalidate();
      current = event.payload;
      failed = false;
      render();
    })).then(unlisten => scope.use(unlisten)).catch(() => {});
    void tauriEventPromise.then(({ listen }) => listen('toolknit-autostart-error', () => {
      if (!scope.disposed) { notify(translate('settings.autostartError')); void refresh(); }
    })).then(unlisten => scope.use(unlisten)).catch(() => {});
  }
  if (onLanguageChange) scope.use(onLanguageChange(render));
  if (root.defaultView) {
    scope.event(root.defaultView, 'focus', () => { void refresh(); });
    scope.event(root.defaultView, 'pagehide', scope.dispose, { once: true });
  }
  render();
  void refresh();
  return { refresh, dispose: scope.dispose };
}
