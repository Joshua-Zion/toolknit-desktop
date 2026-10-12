import { createScreenshotRuntime } from '../platform/screenshot-runtime.js';
import { createLifecycleScope } from './tool-lifecycle.js';
export const VISION_KEY = 'toolknit.screenshot.vision-provider.v1';
// Auxiliary WebViews have isolated storage. Mirror metadata, never credentials.
export function createScreenshotContextRuntime({ isTauri, getAiPlatformConfig, getLang, onLangChange, notify, translate } = {}) {
  if (!isTauri) return;
  const runtime=createScreenshotRuntime({isTauri}), scope=createLifecycleScope();
  let disposed=false, timer;
  const sync=()=>{
    clearTimeout(timer);
    timer=setTimeout(()=>{
      if(disposed) return;
      const provider=getAiPlatformConfig();
      let vision=false;
      try { vision=localStorage.getItem(VISION_KEY)===JSON.stringify(provider); } catch { /* optional preference */ }
      void runtime.call('context',{context:{theme:document.documentElement.dataset.theme || 'dark',lang:getLang(),provider,vision}}).catch(()=>{});
    },100);
  };
  const observer=new MutationObserver(sync); observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  scope.use(()=>observer.disconnect()); scope.use(onLangChange(sync));
  scope.event(window,'screenshot-provider-changed',sync);
  scope.event(document,'click',sync); scope.event(window,'storage',sync);
  runtime.listen('screenshot-error',error=>notify(translate(`home.quickScreenshot.${String(error).includes('shortcut')?'shortcutConflict':'failed'}`))).then(unlisten=>scope.use(unlisten));
  runtime.listen('screenshot-navigate',target=>{
    const selector=target==='settings'?'#homeV2Settings, #settingsBtn':target==='support'?'#homeSupportAuthor, [data-open-support]':null;
    if(selector)document.querySelector(selector)?.click();
  }).then(unlisten=>scope.use(unlisten));
  scope.event(window,'pagehide',()=>{disposed=true;clearTimeout(timer);scope.dispose();});
  sync();
}
