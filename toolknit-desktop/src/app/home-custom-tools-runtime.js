import { createLifecycleScope } from './tool-lifecycle.js';
import { createModalSession } from './modal-runtime.js';
import { prepareWebButton } from '../shared/tool-page-chrome.js';
import { copySensitiveText } from '../platform/clipboard-runtime.js';

export function createHomeCustomToolsRuntime({ root = document, isTauri = false, tauriCorePromise, translate = key => key, notify = () => {} } = {}) {
  const scope = createLifecycleScope();
  const overlay = root.getElementById('customToolsOverlay');
  const trigger = root.getElementById('homeCustomTools');
  const closeButton = root.getElementById('customToolsClose');
  const copyButton = root.getElementById('customToolsCopy');
  const session = createModalSession({ root: overlay, background: root.querySelector('.app'), initialFocus: closeButton, onClose: () => session.close() });
  scope.use(session.dispose);
  root.querySelectorAll('.hero-actions [data-home-link="website"], .home-weaving-link').forEach(prepareWebButton);
  if (trigger) scope.event(trigger, 'click', () => session.open());
  if (closeButton) scope.event(closeButton, 'click', () => session.close());
  if (overlay) scope.event(overlay, 'click', event => { if (event.target === overlay) session.close(); });
  if (copyButton) scope.event(copyButton, 'click', async () => {
    copyButton.disabled = true;
    try {
      await copySensitiveText('wunanvip6', { isTauri, tauri: tauriCorePromise, clipboard: root.defaultView?.navigator?.clipboard });
      if (!scope.disposed) notify(translate('home.wechatCopied'));
    } catch {
      if (!scope.disposed) notify(translate('home.wechatCopyFailed'));
    } finally { copyButton.disabled = false; }
  });
  if (root.defaultView) scope.event(root.defaultView, 'pagehide', scope.dispose, { once: true });
  return { open: session.open, close: session.close, dispose: scope.dispose };
}
