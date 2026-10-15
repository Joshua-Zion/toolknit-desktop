import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { preview } from 'vite';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';

const locales={};
for(const lang of ['zh','en'])locales[lang]=JSON.parse(await readFile(new URL(`../src/locales/${lang}.json`,import.meta.url),'utf8')).home.quickScreenshot;

const require=createRequire(process.env.TOOLKNIT_TEST_MODULES?path.join(process.env.TOOLKNIT_TEST_MODULES,'package.json'):import.meta.url);
const {chromium}=require('playwright');
const fixture=createCanvas(1400,900),ctx=fixture.getContext('2d');
ctx.fillStyle='#edf2f5';ctx.fillRect(0,0,1400,900);ctx.fillStyle='#fff';ctx.fillRect(100,80,800,440);
ctx.fillStyle='#111';ctx.font='32px sans-serif';ctx.fillText('SCREENSHOT TEST',160,160);
ctx.fillStyle='#14965c';ctx.fillRect(160,210,180,120);
for(let x=332;x<340;x+=2){ctx.fillStyle=x%4?'#14965c':'#ffffff';ctx.fillRect(x,210,2,120);}
const image=fixture.toDataURL('image/png'),out=path.resolve('tmp/quick-screenshot-browser');
await mkdir(out,{recursive:true});
const server=await preview({configFile:false,preview:{host:'127.0.0.1',port:0,open:false}});
const browser=await chromium.launch({headless:true,...(process.env.TOOLKNIT_TEST_BROWSER?{executablePath:process.env.TOOLKNIT_TEST_BROWSER}:{})});
const errors=[],results=[],url=server.resolvedUrls.local[0];
async function open(role,theme,width=1400,height=900,dpr=1){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  await page.exposeFunction('__shotResize',async expanded=>page.setViewportSize(expanded?{width:376,height:760}:{width:96,height:96}));
  page.on('pageerror',e=>errors.push(`${role}/${theme}: ${e.message}`));
  await page.addInitScript(({role,theme,image})=>{
    const strokeRect=CanvasRenderingContext2D.prototype.strokeRect;
    CanvasRenderingContext2D.prototype.strokeRect=function(x,y,width,height){
      if(this.strokeStyle==='#60a5fa'&&width>20&&height>10)window.__textSelection={x,y,width,height};
      return strokeRect.call(this,x,y,width,height);
    };
    let id=0;const callbacks=new Map(),listeners=new Map();
    const label=role==='viewer'?'screenshot-viewer-2':`screenshot-${role}`;
    const shared={theme,lang:theme==='light'?'zh':'en',provider:{url:'https://api.example.com/v1/chat/completions',model:'vision-test'}};
    window.__shotContext=shared;window.__shotAiFailure='';window.__shotAiDeferred=false;window.__shotKeyMissing=false;
    window.__localReady=true;window.__localTarget='zh-Hans';window.__localFailure='';
    const shot={id:2,width:1400,height:900,time:Date.now(),image};
    window.__shotHistory=role==='history'?Array.from({length:6},(_,i)=>({...shot,id:i+2})):[shot,{...shot,id:3}];window.__shotHistoryFailure=false;
    window.__shotCalls=[];
    window.__shotEmit=(event,payload)=>{for(const [eid,l]of listeners)if(l.event===event)callbacks.get(l.handler)?.({event,id:eid,payload});};
    window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:(_,eid)=>listeners.delete(eid)};
    window.__TAURI_INTERNALS__={metadata:{currentWindow:{label},currentWebview:{label}},transformCallback:f=>{callbacks.set(++id,f);return id;},unregisterCallback:i=>callbacks.delete(i),
      invoke:async(command,args={})=>{
        window.__shotCalls.push({command,args});
        if(command==='plugin:event|listen'){listeners.set(++id,args);return id;}
        if(command==='plugin:event|unlisten')return;
        if(command.startsWith('plugin:window|'))return;
        if(command==='get_output_root')return 'C:/TestOutput';
        if(command==='get_default_output_root')return 'C:/TestOutput';
        if(command==='open_path')return;
        if(command==='load_ai_api_key')return window.__shotKeyMissing?'':'local-test-key';
        if(command==='local_translation'){
          const r=args.request;
          if(r.action==='status')return {ready:window.__localReady,targetLanguage:window.__localTarget};
          if(r.action==='target'){window.__localTarget=r.target;return {ready:true,targetLanguage:r.target};}
          if(r.action==='cancel')return null;
          if(r.action==='translate'){
            if(window.__localFailure)throw window.__localFailure;
            if(window.__localDeferred)return new Promise(resolve=>{window.__localFinish=()=>resolve({results:r.texts.map(()=> 'Late translation')});});
            return {results:r.texts.map((_,i)=>window.__shotLongTranslation&&i===0?'A very long translation\n'.repeat(140):i===0?'Translated':'Second line')};
          }
        }
        if(command==='request_private_ai_completion'){
          if(window.__shotAiFailure)throw window.__shotAiFailure;
          if(window.__shotAiDeferred)return new Promise(resolve=>{window.__shotFinishAi=()=>resolve({content:'Late result must be ignored'});});
          const structured=args.request.messages.some(m=>m.role==='system');
          if(!structured)return {content:'Extracted sample text'};
          const user=args.request.messages.find(m=>m.role==='user'),vision=Array.isArray(user.content);
          const input=JSON.parse(vision?user.content[0].text:user.content),batch=input.blocks||input.lines;
          if(vision&&window.__shotRejectVision)throw 'ai-provider:http_error:400';
          if(vision&&window.__shotTruncateRemaining>0){window.__shotTruncateRemaining--;throw 'ai-provider:response_truncated';}
          if(vision&&window.__shotTruncateMulti&&batch.length>1)throw 'ai-provider:response_truncated';
          if(!vision&&window.__shotMalformedPart&&batch.some(line=>line.id===1))return {content:'[]'};
          return {content:JSON.stringify(batch.map(line=>({id:line.id,text:vision?`Corrected text ${line.id}`:
            window.__shotLongTranslation&&line.id===0?'A very long translation\n'.repeat(140):line.id===0?'Translated':'Second line'})))};
        }
        if(command==='cancel_private_ai_completion')return;
        if(command==='quick_screenshot'){
          const r=args.request;
          if(r.action==='boot')return {context:structuredClone(shared),session:1,shot,desktop:{bounds:{x:-1400,y:-100,width:1400,height:900},windows:[{x:-1300,y:-20,width:800,height:440}],monitors:[{x:-1400,y:-100,width:1400,height:900}]},image};
          if(r.action==='metadata')return {context:structuredClone(shared)};
          if(r.action==='history'){if(window.__shotHistoryFailure)throw new Error('History temporarily unavailable');return window.__shotHistory;}
          if(r.action==='expand'){
            if(window.__shotExpandFailure)throw new Error('Window temporarily unavailable');
            await window.__shotResize(r.expanded);
            return {origin:r.expanded?{x:188,y:48}:{x:48,y:48},width:r.expanded?376:96,height:r.expanded?760:96};
          }
          if(r.action==='save')return 'C:/TestOutput/Screenshots/test.png';
          if(r.action==='ocr')return {text:'Scrambled fallback',lines:[{id:1,text:'Second line',x:50,y:110,width:240,height:24},{id:0,text:'Sample text',x:50,y:50,width:240,height:44}]};
          if(r.action==='confirm'||r.action==='cancel'||r.action==='pin')window.__shotEmit('screenshot-ended');
          return null;
        }
        throw new Error(`Unexpected command: ${command}`);
      }};
  },{role,theme,image});
  await page.goto(`${url}screenshot.html?role=${role}`);
  return {page,context};
}
try{
  for(const [theme,width,height,dpr]of [['light',1400,900,1],['dark',1400,900,1],['light',740,480,2],['dark',740,480,2]]){
    const {page,context}=await open('capture',theme,width,height,dpr);
    await page.waitForFunction(()=>window.__shotCalls.some(c=>c.args?.request?.action==='ready'));
    await page.mouse.move(width*.2,height*.2);await page.mouse.click(width*.2,height*.2);
    await page.locator('#shotToolbar').waitFor({state:'visible'});
    await page.waitForFunction(()=>{const r=document.getElementById('shotToolbar').getBoundingClientRect();return r.right<=innerWidth+1&&r.bottom<=innerHeight+1;});
    const box=await page.locator('#shotToolbar').boundingBox();
    assert.ok(box.x>=8&&box.y>=8&&box.x+box.width<=width-7&&box.y+box.height<=height-7,JSON.stringify(box));
    if(width===1400)assert.ok(box.width<1000,'toolbar must fit its contents instead of stretching to the screen edge');
    assert.ok(await page.locator('#shotToolbar').evaluate(el=>{
      const bounds=el.getBoundingClientRect();return [...el.querySelectorAll('button,input')].every(control=>{
        const r=control.getBoundingClientRect();return r.left>=bounds.left&&r.right<=bounds.right&&r.bottom<=bounds.bottom;
      });
    }),'toolbar controls wrap within the available width');
    const drawStroke=async(points)=>{
      await page.locator('.app-toast-close').evaluateAll(buttons=>buttons.forEach(button=>button.click()));
      await page.waitForFunction(()=>document.querySelectorAll('.app-toast').length===0);
      await page.mouse.move(points[0][0]*width/1400,points[0][1]*height/900);await page.mouse.down();
      for(const [x,y]of points.slice(1))await page.mouse.move(x*width/1400,y*height/900,{steps:8});
      await page.mouse.up();
    };
    const exportShot=async()=>{
      const count=await page.evaluate(()=>window.__shotCalls.filter(c=>c.args?.request?.action==='copy').length);
      await page.locator('#shotCanvas').focus();await page.keyboard.press('Control+c');
      await page.waitForFunction(n=>window.__shotCalls.filter(c=>c.args?.request?.action==='copy').length>n,count);
      await page.waitForFunction(()=>document.getElementById('shotBusy').hidden);
      const request=await page.evaluate(()=>window.__shotCalls.filter(c=>c.args?.request?.action==='copy').at(-1).args.request);
      const img=await loadImage(request.image),buffer=createCanvas(img.width,img.height),c=buffer.getContext('2d');c.drawImage(img,0,0);
      return (x,y)=>[...c.getImageData(x-request.origin[0],y-request.origin[1],1,1).data];
    };
    const editorPixel=async(x,y)=>page.locator('#shotCanvas').evaluate((c,[x,y])=>[...c.getContext('2d').getImageData(Math.round(x*c.width/1400),Math.round(y*c.height/900),1,1).data],[x,y]);
    await page.locator('[data-shot-action="rectangle"]').click();
    await page.mouse.move(width*.3,height*.25);await page.mouse.down();await page.mouse.move(width*.4,height*.33,{steps:8});await page.mouse.up();
    assert.equal(await page.locator('[data-shot-action="select"]').getAttribute('aria-pressed'),'true','drawing a shape immediately selects it');
    const nonblank=await page.locator('#shotCanvas').evaluate(c=>[...c.getContext('2d').getImageData(0,0,1,1).data]);assert.ok(nonblank[3]>0);
    await drawStroke([[470,250],[500,270]]);
    const moved=await exportShot();assert.deepEqual(moved(450,270),[239,68,68,255],'new shape moves without reselecting a tool');assert.deepEqual(moved(420,255),[255,255,255,255]);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');assert.equal(await page.locator('[data-shot-action="redo"]').isEnabled(),true);
    await page.keyboard.press('Control+y');await page.keyboard.press('Control+y');
    await page.mouse.click(500*width/1400,270*height/900);await page.keyboard.press('Delete');
    for(const kind of ['ellipse','arrow']){
      await page.locator(`[data-shot-action="${kind}"]`).click();await drawStroke([[420,225],[560,297]]);
      assert.equal(await page.locator('[data-shot-action="select"]').getAttribute('aria-pressed'),'true');await page.keyboard.press('Delete');
    }
    await page.locator('[data-shot-action="brush"]').click();await drawStroke([[400,360],[520,370]]);
    assert.equal(await page.locator('[data-shot-action="brush"]').getAttribute('aria-pressed'),'true','brush remains active for continuous painting');
    const brush=(await exportShot())(460,365);assert.deepEqual(brush,[239,68,68,255]);
    await page.locator('[data-shot-action="select"]').click();await drawStroke([[460,365],[468,370]]);await page.keyboard.press('Delete');
    assert.deepEqual((await exportShot())(460,365),brush,'painted brush strokes cannot be selected, moved or deleted as layers');
    await page.keyboard.press('Control+z');
    await page.locator('[data-shot-action="mosaic"]').click();await drawStroke([[300,250],[360,250],[360,310]]);
    const originalMosaicPixel=[...ctx.getImageData(332,250,1,1).data];
    const painted=await exportShot();assert.deepEqual(painted(332,250),painted(334,250),'pixels in a painted mosaic block match across the textured fixture');
    assert.deepEqual(painted(320,290),[20,150,92,255],'unpainted area within the path bounds stays intact');
    await page.locator('[data-shot-action="select"]').click();await drawStroke([[320,250],[328,255]]);await page.keyboard.press('Delete');
    assert.deepEqual((await exportShot())(332,250),painted(332,250),'mosaic strokes stay fixed after selection and dragging');
    await page.keyboard.press('Control+z');await page.keyboard.press('Control+z');
    const undone=await exportShot();assert.deepEqual(undone(332,250),originalMosaicPixel,'undo removes the mosaic stroke');
    assert.notDeepEqual(undone(332,250),undone(334,250),'undo restores texture inside the previously pixelated block');
    await page.keyboard.press('Control+y');assert.deepEqual((await exportShot())(332,250),painted(332,250),'redo restores the painted mosaic');
    const original=page.locator('[data-shot-action="original"]'),originalBox=await original.boundingBox();
    await page.mouse.move(originalBox.x+18,originalBox.y+18);await page.mouse.down();
    assert.equal(await original.getAttribute('aria-pressed'),'true');assert.equal((await editorPixel(460,365))[3],0,'holding compare hides annotations');
    await page.mouse.move(width-2,height-2);await page.mouse.up();
    assert.equal(await original.getAttribute('aria-pressed'),'false');assert.ok((await editorPixel(460,365))[3]>0,'release outside the button restores edits');
    await original.click();assert.equal(await original.getAttribute('aria-pressed'),'false','clicking compare does not toggle it on');
    await original.hover();await page.mouse.down();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    assert.equal(await original.getAttribute('aria-pressed'),'false','losing focus restores edits');await page.mouse.up();
    await original.hover();await page.mouse.down();await original.dispatchEvent('pointercancel');
    assert.equal(await original.getAttribute('aria-pressed'),'false','pointer cancellation restores edits');await page.mouse.up();
    for(const key of ['Space','Enter']){
      await original.focus();await page.keyboard.down(key);assert.equal(await original.getAttribute('aria-pressed'),'true');
      await page.keyboard.up(key);assert.equal(await original.getAttribute('aria-pressed'),'false');
    }
    assert.ok(await page.evaluate(()=>!window.__shotCalls.some(c=>c.args?.request?.action==='confirm')),'keyboard compare must not confirm the screenshot');
    await page.screenshot({path:path.join(out,`capture-toolbar-${theme}-${width}.png`)});
    await page.locator('[data-shot-action="text"]').click();await page.mouse.click(width*.25,height*.4);
    await page.locator('#shotDialog textarea').fill('A sample annotation with multiple words');
    await page.locator('#shotDialogCopy').click();
    assert.equal(await page.locator('#shotDialog').isVisible(),true,'copy keeps editing open');
    assert.ok(await page.locator('#shotDialogCopy').evaluate(el=>{const r=el.getBoundingClientRect();return r.width===r.height&&getComputedStyle(el).borderRadius==='50%';}));
    assert.equal(await page.evaluate(()=>window.__shotCalls.filter(c=>c.args?.request?.action==='copy-text').at(-1).args.request.text),'A sample annotation with multiple words');
    await page.locator('#shotDialog textarea').fill('Edited text copied live');await page.locator('#shotDialogCopy').click();
    assert.equal(await page.evaluate(()=>window.__shotCalls.filter(c=>c.args?.request?.action==='copy-text').at(-1).args.request.text),'Edited text copied live');
    await page.locator('#shotDialogOk').click();
    const longSelection=await page.evaluate(()=>window.__textSelection);
    assert.ok(longSelection.width<600,'ordinary text no longer keeps the remaining crop width');
    await page.locator('.app-toast-close').evaluateAll(buttons=>buttons.forEach(button=>button.click()));
    await page.waitForFunction(()=>document.querySelectorAll('.app-toast').length===0);
    await page.mouse.dblclick((longSelection.x+longSelection.width*.3)*width/1400,(longSelection.y+longSelection.height/2)*height/900);
    await page.locator('#shotDialog textarea').fill('中文\n测试');await page.locator('#shotDialogOk').click();
    const shortSelection=await page.evaluate(()=>window.__textSelection);
    assert.ok(shortSelection.width<longSelection.width/2,'editing shorter CJK text tightens its eight handles');
    const expectedWidth=await page.evaluate(()=>{
      const c=document.createElement('canvas').getContext('2d');c.font='28px sans-serif';
      return Math.max(c.measureText('中文').width,c.measureText('测试').width);
    });
    assert.ok(Math.abs(shortSelection.width-expectedWidth)<8,'CJK selection hugs measured text width');
    await page.locator('#shotFont').fill('40');await page.locator('#shotFont').dispatchEvent('change');
    const largeSelection=await page.evaluate(()=>window.__textSelection);
    assert.ok(largeSelection.width>shortSelection.width&&largeSelection.height>shortSelection.height,'font changes resize both handle axes');
    await page.locator('[data-shot-action="ocr"]').click();
    await page.locator('#shotDialog textarea').waitFor();assert.equal(await page.locator('#shotDialog textarea').inputValue(),'Sample text\nSecond line');
    await page.locator('#shotDialogOk').click();
    await page.locator('[data-shot-action="ai-extract"]').click();await page.locator('#shotDialog textarea').waitFor();
    assert.equal(await page.locator('#shotDialog textarea').inputValue(),'Extracted sample text');await page.locator('#shotDialogOk').click();
    assert.ok(await page.evaluate(()=>window.__shotCalls.some(c=>c.command==='request_private_ai_completion'&&c.args.request.temperature===0&&c.args.request.messages[0].content[1].image_url.url.startsWith('data:image/png;')&&c.args.request.messages[0].content[1].image_url.detail==='high')),'AI extraction uses a lossless detailed image without a declaration checkbox');
    const language=theme==='light'?'zh':'en',texts=locales[language];
    const clearToasts=async()=>{
      await page.locator('.app-toast-close').evaluateAll(buttons=>buttons.forEach(button=>button.click()));
      await page.waitForFunction(()=>document.querySelectorAll('.app-toast').length===0);
    };
    const expectToast=async key=>{
      const message=page.locator('.app-toast-message').filter({hasText:texts[key]}).last();
      try { await message.waitFor({state:'visible'}); }
      catch(error) {
        console.error(await page.evaluate(()=>({toasts:[...document.querySelectorAll('.app-toast-message')].map(el=>el.textContent),dialog:document.querySelector('#shotDialog textarea')?.value,requests:window.__shotCalls.filter(c=>c.command==='request_private_ai_completion').slice(-4).map(c=>({tokens:c.args.request.maxTokens,vision:Array.isArray(c.args.request.messages.at(-1).content)}))})));
        throw error;
      }
      await message.evaluate(el=>Promise.all(el.parentElement.getAnimations().map(animation=>animation.finished)));
      await page.waitForFunction(()=>document.getElementById('shotBusy').hidden);
      const colors=await message.evaluate(el=>{const style=getComputedStyle(el.parentElement);return {background:style.backgroundColor,color:style.color};});
      assert.notEqual(colors.background,colors.color,'feedback remains readable in either theme');
      if(theme==='dark')assert.equal(colors.background,'rgb(25, 25, 25)');
      assert.ok(await page.locator('[data-shot-action="ai-extract"]').isEnabled(),'failure must restore the toolbar');
    };
    for(const [failure,key]of [
      ['ai-provider:http_error:401','aiUnauthorized'],['ai-provider:http_error:404','aiNotFound'],
      ['ai-provider:http_error:429','aiRateLimited'],['ai-provider:http_error:503','aiProviderUnavailable'],
      ['ai-provider:network_error','aiNetwork'],['ai-provider:timeout','aiTimeout'],
      ['ai-provider:empty_response','aiEmpty'],['ai-provider:invalid_response','aiInvalidResponse'],
      ['ai-provider:response_truncated','aiTruncated'],['ai-provider:response_too_large','aiTooLarge']
    ]){
      await clearToasts();await page.evaluate(value=>{window.__shotAiFailure=value;},failure);
      await page.locator('[data-shot-action="ai-extract"]').click();await expectToast(key);
      if(key==='aiUnauthorized')await page.screenshot({path:path.join(out,`ai-error-${theme}-${width}.png`)});
    }
    await clearToasts();await page.evaluate(()=>{window.__shotAiFailure='';window.__shotKeyMissing=true;});
    await page.locator('[data-shot-action="ai-extract"]').click();await expectToast('aiInvalidConfig');
    await page.evaluate(()=>{window.__shotKeyMissing=false;window.__shotContext.provider.url='https://api.example.com/v1';window.__shotEmit('screenshot-context-changed');});
    await clearToasts();await page.evaluate(()=>{delete window.__shotFinishAi;window.__shotAiDeferred=true;});
    await page.locator('[data-shot-action="ai-extract"]').click();await page.locator('#shotBusy').waitFor({state:'visible'});
    await page.waitForFunction(()=>typeof window.__shotFinishAi==='function');
    await page.locator('#shotAbort').click();await expectToast('cancelled');
    await page.evaluate(()=>{window.__shotFinishAi();window.__shotAiDeferred=false;});
    await page.locator('[data-shot-action="ai-extract"]').click();await page.locator('#shotDialog textarea').waitFor();
    assert.equal(await page.locator('#shotDialog textarea').inputValue(),'Extracted sample text','cancelled response cannot overwrite a new action');
    assert.ok(await page.evaluate(()=>window.__shotCalls.some(c=>c.command==='request_private_ai_completion'&&c.args.request.url==='https://api.example.com/v1/chat/completions')));
    await page.locator('#shotDialogOk').click();
    await clearToasts();await page.evaluate(()=>{delete window.__shotFinishAi;window.__shotAiDeferred=true;});
    await page.locator('[data-shot-action="ai-extract"]').click();await page.locator('#shotBusy').waitFor({state:'visible'});
    await page.waitForFunction(()=>typeof window.__shotFinishAi==='function');
    await page.evaluate(()=>{window.__shotContext.provider.model='changed-vision';window.__shotEmit('screenshot-context-changed');});
    await expectToast('providerChanged');
    await page.evaluate(()=>{window.__shotFinishAi();window.__shotAiDeferred=false;});
    await page.locator('[data-shot-action="ai-translate"]').click();await page.waitForFunction(()=>document.getElementById('shotBusy').hidden);
    await expectToast('translated');
    const translationCalls=await page.evaluate(()=>window.__shotCalls.filter(c=>c.command==='request_private_ai_completion'&&c.args.request.messages.some(m=>m.role==='system')));
    assert.ok(translationCalls.length);
    assert.ok(translationCalls.some(c=>Array.isArray(c.args.request.messages[1].content)),'translation first corrects OCR against the image');
    const textCalls=translationCalls.filter(c=>typeof c.args.request.messages[1].content==='string');
    assert.equal(textCalls.length,0,'translation never sends text to the external AI');
    assert.ok(await page.evaluate(()=>window.__shotCalls.filter(c=>c.command==='local_translation'&&c.args.request.action==='translate').at(-1).args.request.texts.every(t=>t.startsWith('Corrected text'))),'corrected extraction feeds the local engine');
    for(const call of translationCalls){assert.equal(call.args.request.temperature,0);assert.ok(call.args.request.maxTokens>=4096&&call.args.request.maxTokens<=16384);}
    const ocrCount=await page.evaluate(()=>window.__shotCalls.filter(c=>c.args?.request?.action==='ocr').length);
    const visionCount=await page.evaluate(()=>window.__shotCalls.filter(c=>c.command==='request_private_ai_completion'&&c.args.request.messages.some(m=>m.role==='system')&&Array.isArray(c.args.request.messages[1].content)).length);
    await clearToasts();await page.locator('[data-shot-action="ai-translate"]').click();await expectToast('translated');
    assert.equal(await page.evaluate(()=>window.__shotCalls.filter(c=>c.args?.request?.action==='ocr').length),ocrCount,'repeat translation reuses OCR of the unchanged source');
    assert.equal(await page.evaluate(()=>window.__shotCalls.filter(c=>c.command==='request_private_ai_completion'&&c.args.request.messages.some(m=>m.role==='system')&&Array.isArray(c.args.request.messages[1].content)).length),visionCount,'repeat translation reuses image correction');
    await clearToasts();await page.evaluate(()=>{window.__shotContext.lang=window.__shotContext.lang==='zh'?'en':'zh';window.__shotEmit('screenshot-context-changed');});
    await page.locator('[data-shot-action="ai-translate"]').click();
    await page.waitForFunction(()=>document.getElementById('shotBusy').hidden);
    assert.equal(await page.evaluate(()=>window.__shotCalls.filter(c=>c.args?.request?.action==='ocr').length),ocrCount+1,'a language change invalidates OCR anchors');
    assert.equal(await page.evaluate(()=>window.__shotCalls.filter(c=>c.command==='request_private_ai_completion'&&c.args.request.messages.some(m=>m.role==='system')&&Array.isArray(c.args.request.messages[1].content)).length),visionCount+1,'image correction must use the current language anchors');
    await clearToasts();await page.evaluate(value=>{window.__shotContext.lang=value;window.__shotEmit('screenshot-context-changed');},language);
    await clearToasts();await page.evaluate(()=>{window.__shotTruncateRemaining=1;window.__shotContext.provider.model='retry-vision';window.__shotEmit('screenshot-context-changed');});
    await page.locator('[data-shot-action="ai-translate"]').click();await expectToast('translated');
    assert.ok(await page.evaluate(()=>window.__shotCalls.some(c=>c.command==='request_private_ai_completion'&&c.args.request.maxTokens===16384)),'a truncated response retries with a larger budget');
    await clearToasts();await page.evaluate(()=>{window.__shotTruncateMulti=true;window.__shotContext.provider.model='split-vision';window.__shotEmit('screenshot-context-changed');});
    await page.locator('[data-shot-action="ai-translate"]').click();await expectToast('translated');
    assert.ok(await page.evaluate(()=>window.__shotCalls.some(c=>c.command==='request_private_ai_completion'&&Array.isArray(c.args.request.messages[1]?.content)&&JSON.parse(c.args.request.messages[1].content[0].text).blocks?.length===1)),'persistent recognition truncation splits the failing batch');
    await clearToasts();await page.evaluate(()=>{window.__shotTruncateMulti=false;window.__shotRejectVision=true;window.__shotContext.provider.model='text-only';window.__shotEmit('screenshot-context-changed');});
    const localCalls=()=>page.evaluate(()=>window.__shotCalls.filter(c=>c.command==='local_translation'&&c.args.request.action==='translate').length);
    const beforeFallback=await localCalls();
    await page.locator('[data-shot-action="ai-translate"]').click();await page.locator('#shotDialogCancel').waitFor({state:'visible'});
    assert.ok((await page.locator('#shotDialogContent').textContent()).includes(texts.fallbackPrompt));
    assert.equal(await localCalls(),beforeFallback,'no silent fallback');
    await page.locator('#shotDialogCancel').click();await page.waitForFunction(()=>document.getElementById('shotBusy').hidden);
    assert.equal(await localCalls(),beforeFallback,'declining leaves the screenshot unchanged');
    await page.locator('[data-shot-action="ai-translate"]').click();await page.locator('#shotDialogOk').click();await expectToast('translated');
    assert.deepEqual(await page.evaluate(()=>window.__shotCalls.filter(c=>c.command==='local_translation'&&c.args.request.action==='translate').at(-1).args.request.texts),['Sample text','Second line']);
    await clearToasts();await page.evaluate(()=>{window.__shotRejectVision=false;window.__shotKeyMissing=true;});
    const beforeNoKey=await page.evaluate(()=>window.__shotCalls.filter(c=>c.command==='request_private_ai_completion').length);
    await page.locator('[data-shot-action="ai-translate"]').click();await expectToast('translated');
    assert.equal(await page.evaluate(()=>window.__shotCalls.filter(c=>c.command==='request_private_ai_completion').length),beforeNoKey,'no AI key uses OCR directly');
    await clearToasts();await page.evaluate(()=>{window.__localReady=false;});
    const beforeMissing=await page.evaluate(()=>window.__shotCalls.filter(c=>c.command==='request_private_ai_completion'||c.args.request?.action==='ocr'||c.args.request?.action==='translate').length);
    await page.locator('[data-shot-action="ai-translate"]').click();await expectToast('localMissing');
    assert.equal(await page.evaluate(()=>window.__shotCalls.filter(c=>c.command==='request_private_ai_completion'||c.args.request?.action==='ocr'||c.args.request?.action==='translate').length),beforeMissing,'readiness gate precedes extraction');
    await clearToasts();await page.evaluate(()=>{window.__localReady=true;window.__localFailure='translation:timeout';});
    await page.locator('[data-shot-action="ai-translate"]').click();await expectToast('localTimeout');
    await clearToasts();await page.evaluate(()=>{window.__localFailure='';window.__localDeferred=true;});
    await page.locator('[data-shot-action="ai-translate"]').click();await page.waitForFunction(()=>typeof window.__localFinish==='function');
    await page.locator('#shotAbort').click();await expectToast('cancelled');
    await page.evaluate(()=>{window.__localFinish();window.__localDeferred=false;});
    await page.locator('[data-shot-action="ai-translate"]').click();await expectToast('translated');
    assert.ok(await page.evaluate(()=>window.__shotCalls.some(c=>c.command==='local_translation'&&c.args.request.action==='cancel')));
    const languageTrigger=page.locator('#shotLanguage + .tool-custom-select button');
    await languageTrigger.click();
    assert.equal(await page.locator('.tool-custom-select-menu:not([hidden]) [role="option"]').count(),2);
    await page.locator('.tool-custom-select-menu:not([hidden]) [data-tool-select-value="en"]').click();
    assert.equal(await languageTrigger.getAttribute('aria-expanded'),'false');
    await page.waitForFunction(()=>window.__localTarget==='en');
    assert.equal(await page.locator('#shotLanguage option').count(),2);
    await page.locator('[data-shot-action="ai-translate"]').click();await expectToast('translated');
    assert.equal(await page.evaluate(()=>window.__shotCalls.filter(c=>c.command==='local_translation'&&c.args.request.action==='translate').at(-1).args.request.target),'en');
    await page.evaluate(()=>{window.__shotKeyMissing=false;});
    await clearToasts();await page.evaluate(()=>{window.__shotRejectVision=false;window.__shotContext.provider.model='vision-restored';window.__shotEmit('screenshot-context-changed');});
    await clearToasts();await page.evaluate(()=>{window.__shotLongTranslation=true;});
    await page.locator('[data-shot-action="ai-translate"]').click();await page.locator('#shotDialog textarea').waitFor();
    assert.match(await page.locator('#shotDialog textarea').inputValue(),/A very long translation/,'overflow retains complete translation text');
    assert.ok(await page.locator('#shotDialogContent p').filter({hasText:texts.translationPartial.split('{count}')[0]}).count());
    assert.equal(await page.locator('.app-toast').count(),0,'partial translation explains its count inside the result dialog without covering it');
    await page.screenshot({path:path.join(out,`translation-partial-${theme}-${width}.png`)});
    await page.locator('#shotDialogOk').click();await page.evaluate(()=>{window.__shotLongTranslation=false;});await clearToasts();
    await page.locator('[data-shot-action="ai-translate"]').click();await expectToast('translated');
    await page.locator('[data-shot-action="save"]').click();await page.locator('#shotDialogFolder').waitFor({state:'visible'});
    await page.screenshot({path:path.join(out,`capture-${theme}-${width}.png`)});
    const beforeReveal=await page.evaluate(()=>window.__shotCalls.length);
    await page.locator('#shotDialogFolder').click();
    await page.waitForFunction(()=>window.__shotCalls.some(c=>c.command==='open_path'&&c.args.path==='C:/TestOutput/Screenshots/test.png'));
    const revealCalls=await page.evaluate(start=>window.__shotCalls.slice(start),beforeReveal);
    assert.ok(revealCalls.findIndex(c=>c.args?.request?.action==='cancel')<revealCalls.findIndex(c=>c.command==='open_path'),'capture ends before revealing the saved file');
    assert.ok(revealCalls.some(c=>c.args?.request?.action==='cancel'),'Open folder exits capture');
    assert.equal(await page.locator('#shotToolbar').isVisible(),false);
    assert.equal(await page.locator('#shotDialog').isVisible(),false);
    await page.evaluate(()=>window.__shotEmit('screenshot-opened',2));
    await page.waitForFunction(()=>window.__shotCalls.filter(c=>c.args?.request?.action==='ready').length===2);
    await page.mouse.click(width*.3,height*.25);
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>window.__shotCalls.some(c=>c.args?.request?.action==='confirm'));
    assert.equal(await page.locator('#shotToolbar').isVisible(),false);
    await page.evaluate(()=>window.__shotEmit('screenshot-opened',2));
    await page.waitForFunction(()=>window.__shotCalls.filter(c=>c.args?.request?.action==='ready').length===3);
    await page.keyboard.press('Escape');
    results.push(`capture ${theme} ${width}x${height} DPR${dpr}: compact toolbar, auto-select/drag shapes, fixed brush/mosaic, stroke pixels, undo/redo, hold compare, ordered OCR, AI success/error Toast, missing key, cancel/late result, provider change, output, reopen`);await context.close();
  }
  for(const theme of ['light','dark']){
    const {page,context}=await open('viewer',theme,1000,720);
    await page.locator('#shotZoomValue').waitFor();await page.locator('[data-shot-action="actual"]').click();
    assert.equal(await page.locator('.tool-page-v2-title').count(),0,'viewer must not render the duplicate right-side title');
    assert.match(await page.locator('.tool-page-v2-tag').textContent(),/SCREENSHOT VIEWER/);
    assert.equal(await page.locator('#shotZoomValue').textContent(),'100%');
    await page.locator('[data-shot-action="zoom-in"]').click();assert.equal(await page.locator('#shotZoomValue').textContent(),'125%');
    await page.locator('#shotPin').uncheck();
    await page.evaluate(()=>{window.__shotEmit('screenshot-ended');window.__shotEmit('screenshot-opened',2);});
    assert.ok(await page.locator('#shotViewImage').evaluate(img=>img.complete&&img.naturalWidth>0),'another capture must not clear the viewer');
    await page.locator('[data-shot-action="zoom-in"]').click();assert.equal(await page.locator('#shotZoomValue').textContent(),'156%');
    await page.locator('[data-shot-action="save"]').click();await page.locator('#shotDialogFolder').waitFor({state:'visible'});
    await page.screenshot({path:path.join(out,`viewer-${theme}.png`)});
    await page.locator('#shotDialogFolder').click();
    await page.waitForFunction(()=>window.__shotCalls.some(c=>c.command==='open_path'&&c.args.path==='C:/TestOutput/Screenshots/test.png'));
    assert.ok(await page.locator('#shotViewImage').isVisible(),'revealing a file keeps the viewer open');
    assert.ok(await page.evaluate(()=>!window.__shotCalls.some(c=>c.args?.request?.action==='cancel')),'viewer reveal must not cancel another capture');
    results.push(`viewer ${theme}: shared chrome, zoom, pin, save`);await context.close();
    const shelf=await open('history',theme,96,96);
    await shelf.page.waitForFunction(()=>document.querySelectorAll('.shot-history-item').length===6);
    assert.ok(await shelf.page.locator('#shotHistoryBubble img').evaluate(img=>img.complete&&img.naturalWidth>0),'reuse the real logo asset');
    assert.equal(await shelf.page.locator('#shotHistoryPanel').isVisible(),false);
    assert.equal(await shelf.page.locator('#shotHistoryBubble').getAttribute('aria-expanded'),'false');
    assert.equal(await shelf.page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    await shelf.page.mouse.move(48,48);
    assert.equal(await shelf.page.locator('#shotHistory').getAttribute('data-state'),'collapsed','hover must not resize the window');
    await shelf.page.screenshot({path:path.join(out,`history-${theme}-collapsed.png`)});
    await shelf.page.locator('#shotHistoryBubble').click();
    await shelf.page.waitForFunction(()=>document.getElementById('shotHistory').dataset.state==='expanded');
    const visibleCards=await shelf.page.locator('#shotHistoryList').evaluate(el=>[...el.children].filter(c=>{const r=c.getBoundingClientRect(),p=el.getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom+1;}).length);
    assert.equal(visibleCards,4,'four cards fit without scrolling');
    assert.ok(await shelf.page.locator('#shotHistoryList').evaluate(el=>el.scrollHeight>el.clientHeight),'older images scroll');
    await shelf.page.evaluate(()=>{
      window.__existingCards=[...document.querySelectorAll('.shot-history-item')];
      window.__imageDecodes=0;
      const decode=HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode=function(){window.__imageDecodes++;return decode.call(this);};
      window.__shotEmit('screenshot-history-changed');
    });
    await shelf.page.waitForTimeout(100);
    assert.equal(await shelf.page.evaluate(()=>window.__imageDecodes),0,'unchanged history reuses decoded thumbnails');
    assert.ok(await shelf.page.evaluate(()=>window.__existingCards.every((card,i)=>card===document.querySelectorAll('.shot-history-item')[i])));
    assert.equal(await shelf.page.locator('#shotHistoryPanel').getAttribute('aria-hidden'),'false');
    assert.equal(await shelf.page.locator('#shotHistoryBubble').getAttribute('aria-expanded'),'true');
    await shelf.page.evaluate(()=>window.__shotEmit('screenshot-ended'));
    assert.equal(await shelf.page.locator('.shot-history-item').count(),6,'finishing a capture must not dispose the history window');
    await shelf.page.evaluate(()=>{window.__shotHistory.unshift({...window.__shotHistory[0],id:9});window.__shotEmit('screenshot-history-changed');});
    await shelf.page.waitForFunction(()=>document.querySelector('.shot-history-item')?.dataset.shotId==='9');
    assert.equal(await shelf.page.evaluate(()=>window.__imageDecodes),1,'only the newly inserted thumbnail is decoded');
    assert.ok(await shelf.page.evaluate(()=>window.__existingCards.every(card=>card.isConnected)),'adding a capture preserves existing card nodes');
    assert.equal(await shelf.page.locator('#shotHistory').getAttribute('data-state'),'expanded','new captures must preserve the open panel');
    assert.equal(await shelf.page.locator('.shot-history-item').count(),7);
    await shelf.page.evaluate(()=>{window.__shotHistoryFailure=true;window.__shotEmit('screenshot-history-changed');});
    await shelf.page.locator('#shotHistoryStatus').waitFor({state:'visible'});
    assert.equal(await shelf.page.locator('.shot-history-item').count(),7,'failed refresh must keep the previous images');
    await shelf.page.evaluate(()=>{window.__shotHistoryFailure=false;});
    await shelf.page.locator('[data-shot-action="retry-history"]').click();
    await shelf.page.locator('#shotHistoryStatus').waitFor({state:'hidden'});
    for(let i=0;i<3;i++){
      await shelf.page.locator('[data-shot-action="collapse-history"]').click();
      await shelf.page.waitForFunction(()=>document.getElementById('shotHistory').dataset.state==='collapsed');
      assert.equal(await shelf.page.locator('#shotHistoryBubble').getAttribute('aria-expanded'),'false');
      assert.equal(await shelf.page.locator('#shotHistoryCount').textContent(),'7');
      await shelf.page.locator('#shotHistoryBubble').click();
      await shelf.page.evaluate(()=>{document.getElementById('shotHistoryBubble').click();document.getElementById('shotHistoryBubble').click();});
      await shelf.page.waitForFunction(()=>document.getElementById('shotHistory').dataset.state==='expanded');
      const expandCalls=await shelf.page.evaluate(()=>window.__shotCalls.filter(c=>c.args?.request?.action==='expand').length);
      await shelf.page.evaluate(()=>{document.body.dispatchEvent(new PointerEvent('pointerenter'));document.body.dispatchEvent(new PointerEvent('pointerenter'));});
      assert.equal(await shelf.page.evaluate(()=>window.__shotCalls.filter(c=>c.args?.request?.action==='expand').length),expandCalls,'hover must not change click-controlled state');
    }
    const dragCount=()=>shelf.page.evaluate(()=>window.__shotCalls.filter(c=>c.command==='plugin:window|start_dragging').length);
    const beforeHeaderDrag=await dragCount();
    const title=await shelf.page.locator('.shot-history-panel header>span').boundingBox();
    await shelf.page.mouse.move(title.x+10,title.y+10);await shelf.page.mouse.down();await shelf.page.mouse.move(title.x+36,title.y+26,{steps:4});await shelf.page.mouse.up();
    await shelf.page.waitForFunction(n=>window.__shotCalls.filter(c=>c.command==='plugin:window|start_dragging').length===n,beforeHeaderDrag+1);
    assert.equal(await shelf.page.locator('#shotHistory').getAttribute('data-state'),'expanded','header drag must keep the panel expanded');
    const closeButton=await shelf.page.locator('[data-shot-action="collapse-history"]').boundingBox();
    await shelf.page.mouse.move(closeButton.x+10,closeButton.y+16);await shelf.page.mouse.down();await shelf.page.mouse.move(closeButton.x+19,closeButton.y+16,{steps:3});await shelf.page.mouse.up();
    await shelf.page.waitForFunction(()=>document.getElementById('shotHistory').dataset.state==='collapsed');
    assert.equal(await dragCount(),beforeHeaderDrag+1,'close button must not start a header drag');
    await shelf.page.locator('#shotHistoryBubble').click();
    await shelf.page.waitForFunction(()=>document.getElementById('shotHistory').dataset.state==='expanded');
    await shelf.page.locator('.shot-history-item').first().click();
    assert.ok(await shelf.page.evaluate(()=>window.__shotCalls.some(c=>c.args?.request?.action==='viewer')));
    await shelf.page.screenshot({path:path.join(out,`history-${theme}.png`)});
    const pixels=await loadImage(path.join(out,`history-${theme}.png`));
    const raster=createCanvas(pixels.width,pixels.height),rasterCtx=raster.getContext('2d');rasterCtx.drawImage(pixels,0,0);
    assert.ok([...rasterCtx.getImageData(0,0,pixels.width,pixels.height).data].some((value,i,a)=>i%4===1&&value>a[i-1]+35&&value>a[i+1]+35),'shelf screenshot must contain the fixture green image');
    await shelf.page.keyboard.press('Escape');
    await shelf.page.waitForFunction(()=>document.getElementById('shotHistory').dataset.state==='collapsed');
    assert.ok(await shelf.page.evaluate(()=>!window.__shotCalls.some(c=>c.args?.request?.action==='hide-history')),'collapse must not disable the user preference');
    const beforeBubbleDrag=await dragCount();
    await shelf.page.mouse.move(48,48);await shelf.page.mouse.down();await shelf.page.mouse.move(65,60,{steps:4});await shelf.page.mouse.up();
    await shelf.page.waitForFunction(n=>window.__shotCalls.filter(c=>c.command==='plugin:window|start_dragging').length===n,beforeBubbleDrag+1);
    assert.equal(await shelf.page.locator('#shotHistory').getAttribute('data-state'),'collapsed','drag must not open the panel');
    await shelf.page.evaluate(()=>{window.__shotExpandFailure=true;});
    await shelf.page.locator('#shotHistoryBubble').click();
    await shelf.page.waitForFunction(()=>document.getElementById('shotHistoryBubble').dataset.error==='true');
    assert.equal(await shelf.page.locator('#shotHistory').getAttribute('data-state'),'collapsed');
    await shelf.page.evaluate(()=>{window.__shotExpandFailure=false;});
    await shelf.page.emulateMedia({reducedMotion:'reduce'});
    await shelf.page.locator('#shotHistoryBubble').focus();await shelf.page.keyboard.press('Enter');
    await shelf.page.waitForFunction(()=>document.getElementById('shotHistory').dataset.state==='expanded');
    await shelf.page.setViewportSize({width:320,height:440});
    const bounds=await shelf.page.locator('[data-shot-action="collapse-history"]').boundingBox();
    assert.ok(bounds.x+bounds.width<=320&&bounds.y+bounds.height<=440,'low-height panel controls stay visible');
    await shelf.page.evaluate(()=>{window.__shotHistory=[];window.__shotEmit('screenshot-history-changed');});
    await shelf.page.locator('#shotHistoryEmpty').waitFor({state:'visible'});
    results.push(`history ${theme}: logo bubble, four visible cards, scrolling, repeated click/collapse, drag isolation, Escape, reduced motion, window failure recovery, retry, viewer, empty state, rendered pixels`);await shelf.context.close();
  }
  assert.deepEqual(errors,[]);console.log(results.join('\n'));
}finally{
  await writeFile(path.join(out,'report.json'),JSON.stringify({results,errors},null,2));
  await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));
}
