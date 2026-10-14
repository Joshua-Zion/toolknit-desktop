import { tauriCorePromise, tauriEventPromise } from './tauri-runtime.js';

/** Uses the same persisted native preferences as Settings, tools and the tray. */
export function createRecordingModeAdapter({ isTauri = false, core = tauriCorePromise, events = tauriEventPromise } = {}) {
  const invoke = async (command, args) => (await core).invoke(command, args);
  return {
    available: isTauri,
    async read() {
      const startup = await invoke('get_autostart');
      if (!startup.supported) throw new Error('recording:unavailable');
      const clipboard = await invoke('clipboard_history', { request: { action: 'status' } });
      const screenshot = await invoke('quick_screenshot', { request: { action: 'preferences' } });
      const state = { autostart: startup.enabled, clipboard: clipboard.enabled, history: screenshot.history };
      if (Object.values(state).some(value => typeof value !== 'boolean')) throw new Error('recording:invalid-state');
      return state;
    },
    async set(key, enabled) {
      if (key === 'autostart') await invoke('set_autostart', { enabled });
      else if (key === 'clipboard') await invoke('clipboard_history', { request: { action: enabled ? 'start' : 'stop' } });
      else if (key === 'history') {
        const preferences = await invoke('quick_screenshot', { request: { action: 'preferences' } });
        await invoke('quick_screenshot', { request: { action: 'configure', preferences: { shortcut: preferences.shortcut, history: enabled } } });
      } else throw new Error('recording:invalid-setting');
    },
    async subscribe(callback) {
      const { listen } = await events;
      const releases = [];
      try {
        for (const name of ['toolknit-autostart-changed', 'clipboard-history-changed', 'screenshot-preferences-changed']) {
          releases.push(await listen(name, callback));
        }
      } catch (error) {
        releases.forEach(release => release());
        throw error;
      }
      return () => releases.forEach(release => release());
    }
  };
}
