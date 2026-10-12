import { t, applyTranslations, onLangChange } from '../../i18n.js';
import { createLifecycleScope } from '../../app/tool-lifecycle.js';
import { moveFocusOutOfHiddenRegion } from '../../shared/tool-page-shell.js';
import { createScreenshotRuntime } from '../../platform/screenshot-runtime.js';
import { VISION_KEY } from '../../app/screenshot-context-runtime.js';
import { errorKey } from './core.js';
export function createQuickScreenshotController({overlay,isTauri=false,getAiPlatformConfig=()=>({}),notify=()=>{},refreshIcons=()=>{}}) {
  const runtime=createScreenshotRuntime({isTauri}), scope=createLifecycleScope();
  const q=id=>overlay.querySelector(`#screenshot${id}`), tr=(key,vars)=>t(`home.quickScreenshot.${key}`,vars);
  let preferences={shortcut:'Alt+Q',history:false}, revision=0, busy=false, opened=false, disposed=false;
  const error=e=>{q('PageError').textContent=tr(errorKey(e));q('PageError').hidden=false;notify(tr(errorKey(e)));};
  function render() {
    q('Start').disabled=!runtime.available||busy;
    for(const id of ['ShortcutSave','ShortcutReset','ShortcutDisable','HistoryToggle']) q(id).disabled=!runtime.available||busy;
    q('HistoryToggle').setAttribute('aria-checked',String(preferences.history));
    q('ShortcutStatus').textContent=tr(!runtime.available?'desktopOnly':preferences.registered?'shortcutActive':preferences.error?'shortcutConflict':'shortcutDisabled',{shortcut:preferences.registered||''});
    const provider=getAiPlatformConfig(); q('Provider').textContent=provider.model || tr('noModel');
    try {q('Vision').checked=localStorage.getItem(VISION_KEY)===JSON.stringify(provider);} catch {q('Vision').checked=false;}
  }
  async function load() {
    const owner=revision;
    if(runtime.available) try { const p=await runtime.call('preferences');if(owner!==revision||!opened)return;preferences=p;q('Shortcut').value=p.shortcut||''; }catch(e){if(owner===revision)error(e);}
    render();
  }
  async function configure(next) {
    if(busy)return;busy=true;render();const owner=revision;
    try {const p=await runtime.call('configure',{preferences:{shortcut:next.shortcut,history:next.history}});if(owner!==revision||!opened)return;preferences=p;q('Shortcut').value=p.shortcut||'';q('PageError').hidden=true;notify(tr('settingsSaved'));}
    catch(e){if(owner===revision&&opened)error(e);}finally{busy=false;if(opened)render();}
  }
  scope.event(q('Start'),'click',async()=>{if(busy)return;busy=true;render();try{await runtime.call('start');}catch(e){error(e);}finally{busy=false;render();}});
  scope.event(q('ShortcutSave'),'click',()=>void configure({...preferences,shortcut:q('Shortcut').value.trim()||null}));
  scope.event(q('ShortcutReset'),'click',()=>void configure({...preferences,shortcut:'Alt+Q'}));
  scope.event(q('ShortcutDisable'),'click',()=>void configure({...preferences,shortcut:null}));
  scope.event(q('HistoryToggle'),'click',()=>void configure({...preferences,history:!preferences.history}));
  scope.event(q('Vision'),'change',()=>{
    try{if(q('Vision').checked)localStorage.setItem(VISION_KEY,JSON.stringify(getAiPlatformConfig()));else localStorage.removeItem(VISION_KEY);window.dispatchEvent(new Event('screenshot-provider-changed'));}
    catch(e){q('Vision').checked=false;error(e);}
  });
  scope.use(onLangChange(()=>{if(opened){applyTranslations();render();}}));
  void runtime.listen('screenshot-preferences-changed',()=>{if(opened)void load();}).then(unlisten=>scope.use(unlisten));
  scope.event(overlay,'click',e=>{if(e.target.closest('[data-screenshot-close]'))close();});
  scope.event(document,'keydown',e=>{if(opened&&e.key==='Escape'){e.preventDefault();close();}});
  function open(){if(disposed)return;opened=true;revision++;overlay.classList.add('visible');overlay.inert=false;overlay.setAttribute('aria-hidden','false');applyTranslations();refreshIcons();void load();q('Start').focus();}
  function close(){opened=false;revision++;moveFocusOutOfHiddenRegion(overlay);overlay.inert=true;overlay.setAttribute('aria-hidden','true');overlay.classList.remove('visible');}
  return {open,close,dispose(){if(disposed)return;close();disposed=true;scope.dispose();}};
}
