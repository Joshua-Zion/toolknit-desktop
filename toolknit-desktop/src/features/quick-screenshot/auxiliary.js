import { createIcons, Scan, ScanText, ScanLine, MousePointer2, Square, Circle, MoveUpRight, Pencil, Grid2x2, Type, Sparkles, Languages, Undo2, Redo2, Eye, Download, Pin, X, Check, Copy, FolderOpen, Minus, Plus } from 'lucide';
import { t, getLang, applyTranslations, setLangWithoutFade } from '../../i18n.js';
import { tauriCorePromise, getCurrentWindow } from '../../platform/tauri-runtime.js';
import { createScreenshotRuntime } from '../../platform/screenshot-runtime.js';
import { createLifecycleScope } from '../../app/tool-lifecycle.js';
import { createOutputRuntime } from '../../app/output-runtime.js';
import { createModalSession } from '../../app/modal-runtime.js';
import { createToastManager } from '../../app/toast-manager.js';
import { errorKey } from './core.js';
import { captureMarkup, viewerMarkup, historyMarkup } from './auxiliary-template.js';
import '../../styles/tokens.css';
import '../../styles/base.css';
import '../../styles/pages/home-v2.css';
import '../../styles/pages/settings-v2.css';
import '../../styles/themes/home-light.css';
import '../../styles/themes/secondary-pages-light.css';
import '../../styles/components/tool-pages.css';
import '../../styles/components/window-surface.css';
import '../../styles/components/navigation.css';
import '../../tool-nav-unified.css';
import '../../styles/components/toasts.css';
import './quick-screenshot.css';

const icons={Scan,ScanText,ScanLine,MousePointer2,Square,Circle,MoveUpRight,Pencil,Grid2x2,Type,Sparkles,Languages,Undo2,Redo2,Eye,Download,Pin,X,Check,Copy,FolderOpen,Minus,Plus};
const root=document.getElementById('screenshotRoot'), role=new URLSearchParams(location.search).get('role')||'capture';
const isTauri=Boolean(window.__TAURI_INTERNALS__), runtime=createScreenshotRuntime({isTauri}), lifecycle=createLifecycleScope();
const tr=(key,vars)=>t(`home.quickScreenshot.${key}`,vars), q=id=>document.getElementById(`shot${id}`);
const toast=createToastManager({getLanguage:getLang}), notify=message=>{
  if(role==='history'&&q('HistoryStatus')){q('HistoryMessage').textContent=message;q('HistoryStatus').hidden=false;q('HistoryBubble').dataset.error='true';}
  else toast.show(message);
};
const output=createOutputRuntime({isTauri,tauriCorePromise,translate:t,notify});
let context={},controller,bootRevision=0,disposed=false,dialogAction,dialogPath='',bootQueue=Promise.resolve();
root.innerHTML=role==='history'?historyMarkup:role==='viewer'?viewerMarkup:captureMarkup;
document.body.classList.add(`shot-${role}-body`);
const dialogRoot=q('Dialog');
if(role==='history')lifecycle.event(root,'click',event=>{if(!controller&&event.target.closest('[data-shot-action="retry-history"],[data-shot-action="expand-history"]'))void boot();});
const modal=createModalSession({root:dialogRoot,background:role==='viewer'?q('Viewer'):q('Editor'),initialFocus:q('DialogOk'),onClose:()=>closeDialog()});
function refresh(){applyTranslations();createIcons({icons});}
function applyContext(next){context=next||{};document.documentElement.dataset.theme=context.theme==='light'?'light':'dark';setLangWithoutFade(context.lang==='en'?'en':'zh');refresh();controller?.contextChanged?.(context);}
function closeDialog(){modal.close();dialogAction=null;}
function showDialog(title,content,{onConfirm,folder='',copyText=''}={}){
  closeDialog();dialogAction=onConfirm;dialogPath=folder;q('DialogTitle').textContent=title;q('DialogContent').replaceChildren(content);
  q('DialogFolder').hidden=!folder;q('DialogCopy').hidden=!copyText;q('DialogCancel').hidden=!onConfirm;
  q('DialogCopy').onclick=()=>{void controller?.copyText?.(copyText);};modal.open();refresh();
}
if(dialogRoot){
  lifecycle.event(q('DialogCancel'),'click',closeDialog);
  lifecycle.event(q('DialogOk'),'click',()=>{const run=dialogAction;closeDialog();if(run)run();});
  lifecycle.event(q('DialogFolder'),'click',()=>void output.openFolder(dialogPath));
}
const services={root,runtime,lifecycle,tr,q,notify,refresh,showDialog,closeDialog,output,isTauri,getContext:()=>context,getCurrentWindow,async save(payload,isCurrent=()=>!disposed){
  const directory=await output.getOutputDir('Screenshots');if(!isCurrent())return;
  const path=await runtime.call('save',{...payload,directory});if(!isCurrent())return path;
  const p=document.createElement('p');p.textContent=path;showDialog(tr('saved'),p,{folder:path});return path;
}};
async function bootSession(revision){
  let data;
  try{
    if(disposed||revision!==bootRevision)return;
    data=await runtime.call('boot');if(disposed||revision!==bootRevision)return;
    applyContext(data.context);
    if(controller)controller.dispose();
    const module=await (role==='history'?import('./history-window.js'):role==='viewer'?import('./viewer-window.js'):import('./capture-editor.js'));
    if(disposed||revision!==bootRevision)return;
    const next=await module.createController(services,data);
    if(disposed||revision!==bootRevision){next.dispose();return;}
    controller=next;refresh();
    if(role==='capture')await runtime.call('ready',{session:data.session});
  }catch(e){if(!disposed&&revision===bootRevision){controller?.dispose();controller=null;q('Desktop')?.removeAttribute('src');notify(tr(errorKey(e)));if(role==='capture'&&isTauri&&data?.session)void runtime.call('cancel',{session:data.session}).catch(()=>{});}}
}
function boot(){const revision=++bootRevision;bootQueue=bootQueue.then(()=>bootSession(revision));return bootQueue;}
async function bind(){
  const handlers=[['screenshot-context-changed',async()=>{try{const data=await runtime.call('metadata');if(!disposed)applyContext(data.context);}catch{/* window is closing */}}]];
  if(role==='capture'){
    handlers.unshift(['screenshot-opened',boot],['screenshot-ended',()=>{bootRevision++;controller?.dispose();controller=null;closeDialog();}]);
  }
  for(const [name,handler]of handlers){
    const unlisten=await runtime.listen(name,handler);if(disposed)unlisten();else lifecycle.use(unlisten);
  }
  await boot();
}
lifecycle.event(window,'pagehide',()=>{disposed=true;bootRevision++;controller?.dispose();modal.dispose();toast.dispose?.();lifecycle.dispose();});
void bind().catch(()=>notify(tr('failed')));
