import { createLifecycleScope } from '../../app/tool-lifecycle.js';

export async function createController({runtime,tr,q,refresh,getCurrentWindow},data){
  const scope=createLifecycleScope(),root=q('History'),panel=q('HistoryPanel'),bubble=q('HistoryBubble');
  let disposed=false,revision=0,state='collapsed',animation,drag,suppressClick=false;
  const cards=new Map();
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  function setState(next){state=next;root.dataset.state=next;}
  function origin(point={x:48,y:48}){
    root.style.setProperty('--shot-origin-x',`${point.x}px`);
    root.style.setProperty('--shot-origin-y',`${point.y}px`);
  }
  function showError(key='failed'){
    q('HistoryMessage').textContent=tr(key);q('HistoryStatus').hidden=false;bubble.dataset.error='true';
  }
  async function animate(open){
    if(reduced())return;
    const small='circle(32px at calc(var(--shot-origin-x) - 16px) calc(var(--shot-origin-y) - 16px))';
    const x=parseFloat(root.style.getPropertyValue('--shot-origin-x'))-16,y=parseFloat(root.style.getPropertyValue('--shot-origin-y'))-16;
    const radius=Math.ceil(Math.hypot(Math.max(x,panel.clientWidth-x),Math.max(y,panel.clientHeight-y)));
    const large=`circle(${radius}px at calc(var(--shot-origin-x) - 16px) calc(var(--shot-origin-y) - 16px))`;
    animation=panel.animate(open?[
      {clipPath:small,transform:'scale(.96)',opacity:.35},
      {clipPath:large,transform:'scale(1)',opacity:1}
    ]:[{clipPath:large,transform:'scale(1)',opacity:1},{clipPath:small,transform:'scale(.96)',opacity:.35}],{
      duration:open?380:260,easing:open?'cubic-bezier(.2,.8,.2,1)':'cubic-bezier(.4,0,.8,.2)',fill:'both'
    });
    try{await animation.finished;}catch{/* disposal cancels the reveal */}
  }
  async function expand(){
    if(disposed||state!=='collapsed')return;
    setState('opening');bubble.disabled=true;
    try{
      const layout=await runtime.call('expand',{expanded:true});if(disposed)return;
      origin(layout.origin);panel.inert=false;panel.setAttribute('aria-hidden','false');bubble.setAttribute('aria-expanded','true');
      root.classList.add('shot-history-ready');await animate(true);if(disposed)return;
      animation?.cancel();setState('expanded');panel.querySelector('[data-shot-action="collapse-history"]').focus({preventScroll:true});
    }catch{
      root.classList.remove('shot-history-ready');panel.inert=true;panel.setAttribute('aria-hidden','true');bubble.setAttribute('aria-expanded','false');
      setState('collapsed');showError();
    }finally{if(!disposed)bubble.disabled=false;}
  }
  async function collapse(){
    if(disposed||state!=='expanded')return;
    setState('closing');if(panel.contains(document.activeElement))document.activeElement.blur();panel.inert=true;
    await animate(false);if(disposed)return;
    try{
      // Keep the clipped panel until the native window returns to the bubble anchor.
      await runtime.call('expand',{expanded:false});if(disposed)return;
      root.classList.remove('shot-history-ready');animation?.cancel();panel.setAttribute('aria-hidden','true');
      origin();setState('collapsed');bubble.setAttribute('aria-expanded','false');bubble.focus({preventScroll:true});
    }catch{animation?.cancel();panel.inert=false;setState('expanded');showError();}
  }
  async function update(){
    const current=++revision;
    try{
      const list=await runtime.call('history');if(disposed||current!==revision)return;
      const items=await Promise.all(list.map(async shot=>{
        const cached=cards.get(String(shot.id));
        if(cached&&cached.image===shot.image)return {shot,button:cached.button,image:shot.image};
        const b=document.createElement('button');b.type='button';b.className='shot-history-item';b.dataset.shotId=String(shot.id);b.setAttribute('aria-label',tr('viewScreenshot'));
        const image=document.createElement('img');image.src=shot.image;image.alt='';image.draggable=false;
        const info=document.createElement('span');info.className='shot-history-info';info.textContent=`${new Date(shot.time).toLocaleTimeString(data.context?.lang==='en'?'en':'zh-CN')}  ·  ${shot.width} × ${shot.height}`;
        b.append(image,info);await image.decode();return {shot,button:b,image:shot.image};
      }));
      if(disposed||current!==revision)return;
      const ids=new Set(list.map(shot=>String(shot.id)));
      for(const id of cards.keys())if(!ids.has(id))cards.delete(id);
      const container=q('HistoryList'),scroll=container.scrollTop;
      items.forEach(({shot,button,image},index)=>{
        cards.set(String(shot.id),{button,image});
        button.setAttribute('aria-label',tr('viewScreenshot'));
        button.querySelector('.shot-history-info').textContent=`${new Date(shot.time).toLocaleTimeString(data.context?.lang==='en'?'en':'zh-CN')}  ·  ${shot.width} × ${shot.height}`;
        if(container.children[index]!==button)container.insertBefore(button,container.children[index]||null);
      });
      for(const child of [...container.children])if(!ids.has(child.dataset.shotId))child.remove();
      container.scrollTop=scroll;
      q('HistoryEmpty').hidden=list.length>0;q('HistoryStatus').hidden=true;delete bubble.dataset.error;
      q('HistoryCount').textContent=String(list.length);q('HistoryCount').hidden=!list.length;refresh();
    }catch{if(!disposed&&current===revision)showError();}
  }
  function bindDrag(handle,expectedState){
    scope.event(handle,'pointerdown',e=>{
      if(e.button!==0||state!==expectedState||(handle!==bubble&&e.target.closest('button')))return;
      suppressClick=false;drag={x:e.screenX,y:e.screenY};handle.setPointerCapture(e.pointerId);
    });
    scope.event(handle,'pointermove',e=>{
      if(!drag||Math.hypot(e.screenX-drag.x,e.screenY-drag.y)<6)return;
      drag=null;suppressClick=handle===bubble;
      handle.releasePointerCapture(e.pointerId);
      void Promise.resolve().then(()=>getCurrentWindow().startDragging()).catch(()=>{if(!disposed)showError();});
    });
    scope.event(handle,'pointerup',()=>{drag=null;});scope.event(handle,'pointercancel',()=>{drag=null;});
  }
  bindDrag(bubble,'collapsed');bindDrag(panel.querySelector('header'),'expanded');
  scope.event(root,'click',e=>{
    if(e.target.closest('[data-shot-action="expand-history"]')){if(suppressClick){suppressClick=false;return;}void expand();}
    if(e.target.closest('[data-shot-action="collapse-history"]'))void collapse();
    if(e.target.closest('[data-shot-action="retry-history"]'))void update();
    const item=e.target.closest('.shot-history-item');
    if(item&&state==='expanded')void runtime.call('viewer',{id:Number(item.dataset.shotId)}).catch(error=>{if(!disposed)showError(String(error).includes('viewer-limit')?'viewerLimit':'failed');});
  });
  scope.event(window,'keydown',e=>{if(e.key==='Escape'){e.preventDefault();void collapse();}});
  function dispose(){disposed=true;revision++;animation?.cancel();scope.dispose();cards.clear();q('HistoryList').replaceChildren();}
  try{
    const unlisten=await runtime.listen('screenshot-history-changed',()=>void update());
    if(disposed)unlisten();else scope.use(unlisten);
    await runtime.call('expand',{expanded:false});origin();await update();
  }catch(error){dispose();throw error;}
  return {contextChanged:next=>{data.context=next;void update();},dispose};
}
