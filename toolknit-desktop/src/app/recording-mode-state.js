export const RECORDING_SNAPSHOT_KEY = 'toolknit.recording-mode.snapshot.v1';
export const RECORDING_PROMPT_KEY = 'toolknit.recording-mode.prompt-dismissed.v1';
const keys = ['autostart', 'clipboard', 'history'];
export const isRecordingModeEnabled = state => keys.every(key => state?.[key] === true);
export function readRecordingSnapshot(storage) {
  try {
    const value = JSON.parse(storage?.getItem(RECORDING_SNAPSHOT_KEY) || 'null');
    return keys.every(key => typeof value?.[key] === 'boolean') ? Object.fromEntries(keys.map(key => [key, value[key]])) : null;
  } catch { return null; }
}

/** Serialize user actions, verify native state and restore only changes made by this transaction. */
export function createRecordingModeState({ adapter, storage, onChange = () => {} }) {
  let busy = false, disposed = false, revision = 0;
  let state = null;
  const publish = () => { if (!disposed) onChange({ state, busy, enabled: isRecordingModeEnabled(state) }); };
  const refresh = async () => {
    if (disposed || busy || !adapter.available) return state;
    const token = ++revision;
    const value = await adapter.read();
    if (!disposed && !busy && token === revision) { state = value; publish(); }
    return state;
  };
  async function setEnabled(enabled) {
    if (disposed || busy || !adapter.available) return false;
    busy = true; revision++; publish();
    let before, snapshot, stored = false;
    const changed = [];
    try {
      before = await adapter.read();
      if (disposed) return false;
      snapshot = readRecordingSnapshot(storage);
      const target = enabled ? { autostart: true, clipboard: true, history: true } : snapshot || { autostart: false, clipboard: false, history: false };
      // Persist recovery intent before changing any system setting.
      if (enabled && !snapshot) { storage.setItem(RECORDING_SNAPSHOT_KEY, JSON.stringify(before)); stored = true; }
      for (const key of keys) {
        if (disposed) throw new Error('recording:disposed');
        if (before[key] !== target[key]) {
          changed.push(key);
          await adapter.set(key, target[key]);
        }
      }
      const actual = await adapter.read();
      if (disposed || keys.some(key => actual[key] !== target[key])) throw new Error('recording:verification-failed');
      if (!enabled) storage.removeItem(RECORDING_SNAPSHOT_KEY);
      state = actual;
      return true;
    } catch (error) {
      let rollbackFailed = false;
      for (const key of changed.reverse()) {
        try { await adapter.set(key, before[key]); } catch { rollbackFailed = true; }
      }
      try {
        state = await adapter.read();
        if (before && keys.some(key => state[key] !== before[key])) rollbackFailed = true;
      } catch { state = null; rollbackFailed = true; }
      if (stored && !rollbackFailed) {
        try { storage.removeItem(RECORDING_SNAPSHOT_KEY); } catch { /* Recovery intent is safe to retain. */ }
      }
      throw new Error(rollbackFailed ? 'recording:rollback-failed' : 'recording:failed', { cause: error });
    } finally { busy = false; publish(); }
  }
  return { refresh, setEnabled, dispose() { disposed = true; revision++; }, get busy() { return busy; } };
}
