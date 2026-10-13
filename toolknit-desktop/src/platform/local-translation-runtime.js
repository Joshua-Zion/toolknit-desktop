import { tauriCorePromise, tauriEventPromise } from './tauri-runtime.js';

export function createLocalTranslationRuntime({ isTauri = false, session } = {}) {
  async function call(action, payload = {}) {
    if (!isTauri) throw new Error('translation:desktop-only');
    const { invoke } = await tauriCorePromise;
    return invoke('local_translation', { request: { action, ...(session === undefined ? {} : {session}), ...payload } });
  }
  return {
    call,
    async translate(texts, target, signal) {
      const { invoke } = await tauriCorePromise;
      if (signal?.aborted) throw new Error('translation:cancelled');
      if (!isTauri) throw new Error('translation:desktop-only');
      const requestId = crypto.randomUUID();
      const abort = () => { void call('cancel', {requestId}).catch(() => {}); };
      signal?.addEventListener('abort', abort, {once:true});
      try {
        const result = await invoke('local_translation', {request:{action:'translate',session,texts,target,requestId}});
        if (signal?.aborted) throw new Error('translation:cancelled');
        return result.results;
      } finally { signal?.removeEventListener('abort', abort); }
    },
    async listen(name, handler) {
      if (!isTauri) return () => {};
      const {listen} = await tauriEventPromise;
      return listen(name, event => handler(event.payload));
    }
  };
}
