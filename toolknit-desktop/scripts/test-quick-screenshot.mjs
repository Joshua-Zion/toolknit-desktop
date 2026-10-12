import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { rectangle, moveRect, resizeRect, resizeAnnotation, windowAt, parseTranslations, formatOcrText, fitText, isPaintStroke, errorKey } from '../src/features/quick-screenshot/core.js';
import { composeScreenshot } from '../src/features/quick-screenshot/renderer.js';
import { createSnapshotHistory } from '../src/shared/snapshot-history.js';

assert.deepEqual(rectangle({x:200,y:150},{x:-20,y:10},160,100),{x:0,y:10,width:160,height:90});
assert.deepEqual(moveRect({x:20,y:20,width:60,height:40},500,-50,160,100),{x:100,y:0,width:60,height:40});
for(let handle=0;handle<8;handle++) {
  const r=resizeRect({x:20,y:20,width:60,height:40},handle,{x:-100,y:500},160,100);
  assert.ok(r.x>=0 && r.y>=0 && r.width>=1 && r.height>=1 && r.x+r.width<=160 && r.y+r.height<=100);
}
assert.deepEqual(resizeRect({x:20,y:20,width:60,height:40},3,{x:120,y:90},160,100),{x:20,y:20,width:100,height:40});
assert.deepEqual(resizeAnnotation({x:20,y:20,width:60,height:40,points:[{x:20,y:20},{x:80,y:60}]},{x:10,y:10,width:120,height:80}).points,[{x:10,y:10},{x:130,y:90}]);
assert.deepEqual(windowAt({bounds:{x:-1920,y:-100,width:3840,height:1200},windows:[{x:-1800,y:0,width:600,height:500}]},{x:200,y:200}),{x:120,y:100,width:600,height:500});
const lines=[{id:1,text:'one'},{id:2,text:'two'}];
assert.deepEqual(parseTranslations('[{"id":2,"text":"B"},{"id":1,"text":"A"}]',lines).map(l=>l.text),['A','B']);
assert.equal(formatOcrText({text:'fallback',lines:[
  {id:2,text:'world',x:60,y:40,width:40,height:16},
  {id:1,text:'hello',x:10,y:40,width:40,height:16},
  {id:3,text:'下一行',x:10,y:80,width:50,height:16}
]}), 'hello world\n下一行');
assert.equal(formatOcrText({text:'fallback'}), 'fallback');
assert.equal(formatOcrText({lines:[
  {text:'第二段',x:10,y:100,width:60,height:16},
  {text:'中文',x:10,y:10,width:30,height:16},
  {text:'内容',x:42,y:11,width:30,height:16}
]}),'中文内容\n\n第二段');
assert.equal(formatOcrText({lines:[{text:'名称',x:10,y:10,width:30,height:16},{text:'数量',x:150,y:10,width:30,height:16}]}),'名称\t数量');
assert.equal(formatOcrText({text:'fallback',lines:[{text:'bad',x:0,y:0,width:0,height:0}]}),'fallback');
for(const [code,key]of [['aborted','cancelled'],['provider_changed','providerChanged'],['timeout','aiTimeout'],['invalid_config','aiInvalidConfig'],['network_error','aiNetwork']])assert.equal(errorKey({code,message:'localized'}),key);
assert.equal(errorKey({code:'http_error',status:507}),'aiProviderUnavailable');
for(const input of ['[]','[{"id":1,"text":"A"},{"id":1,"text":"B"}]','[{"id":1,"text":"A"},{"id":3,"text":"B"}]','[{"id":1,"text":""},{"id":2,"text":"B"}]'])assert.throws(()=>parseTranslations(input,lines));

globalThis.document={createElement:()=>createCanvas(1,1)};
const source=createCanvas(320,200), ctx=source.getContext('2d');
for(let x=0;x<320;x+=4){ctx.fillStyle=x%8?'#0000ff':'#ff0000';ctx.fillRect(x,0,4,200);}
const crop={x:40,y:20,width:200,height:120};
const result=composeScreenshot(source,crop,[{kind:'rectangle',x:60,y:40,width:30,height:30,color:'#00ff00',fill:true}]);
assert.equal(result.width,200);assert.equal(result.height,120);
assert.deepEqual([...result.getContext('2d').getImageData(30,30,1,1).data],[0,255,0,255]);
assert.deepEqual([...ctx.getImageData(70,50,1,1).data],[0,0,255,255]);
const pixel=(context,x,y)=>[...context.getImageData(x,y,1,1).data];
const stroke={kind:'mosaic',x:10,y:30,width:60,height:30,block:8,points:[{x:10,y:30},{x:70,y:30},{x:70,y:60}]};
const mosaic=composeScreenshot(source,{x:0,y:0,width:80,height:80},[stroke]).getContext('2d');
assert.notDeepEqual(pixel(mosaic,30,30),pixel(ctx,30,30),'the continuous painted path must pixelate');
assert.deepEqual(pixel(mosaic,30,30),pixel(mosaic,31,30),'pixels in one mosaic block match');
assert.deepEqual(pixel(mosaic,30,50),pixel(ctx,30,50),'the unpainted interior of the bounding box stays original');
assert.notDeepEqual(pixel(mosaic,70,55),pixel(ctx,70,55),'the stroke follows its turn');
const dot={kind:'brush',x:20,y:20,width:1,height:1,color:'#00ff00',stroke:8,points:[{x:20,y:20},{x:20,y:20}]};
assert.deepEqual(pixel(composeScreenshot(source,crop,[{...dot,x:60,y:40,points:[{x:60,y:40},{x:60,y:40}]}]).getContext('2d'),20,20),[0,255,0,255],'one click paints a round dot');
const edgeMosaic=composeScreenshot(source,{x:0,y:0,width:80,height:80},[{...stroke,x:0,y:0,width:1,height:1,points:[{x:0,y:0},{x:0,y:0}]}]).getContext('2d');
assert.notDeepEqual(pixel(edgeMosaic,2,2),pixel(ctx,2,2),'a mosaic click at the edge paints without going out of bounds');
assert.deepEqual(pixel(edgeMosaic,30,30),pixel(ctx,30,30));
assert.ok(isPaintStroke(stroke)&&isPaintStroke(dot)&&!isPaintStroke({kind:'rectangle'}));
const fitted=fitText(ctx,'A longer sentence that should wrap',110,90,24);
assert.ok(fitted.fits && fitted.lines.length>1);
assert.equal(fitText(ctx,'x'.repeat(4000),20,10,24).fits,false);
assert.throws(()=>composeScreenshot(source,crop,[{kind:'text',text:'x'.repeat(4000),x:40,y:20,width:20,height:10,color:'#000',font:24}]),/text-overflow/);

let value=0;
const history=createSnapshotHistory({capture:()=>value,apply:n=>{value=n;},equals:(a,b)=>a===b,measure:()=>10,maxBytes:35});
history.reset();for(value=1;value<8;value++)history.commit();
assert.equal(history.length,3);assert.ok(history.undo());assert.equal(value,6);
assert.ok(history.redo());assert.equal(value,7);
history.undo();value=20;history.commit();assert.equal(history.canRedo(),false);
history.withLock(()=>assert.equal(history.commit(),false));

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const zh=JSON.parse(read('../src/locales/zh.json')).home.quickScreenshot;
const en=JSON.parse(read('../src/locales/en.json')).home.quickScreenshot;
assert.deepEqual(Object.keys(zh).sort(),Object.keys(en).sort());
for(const key of Object.keys(zh)){assert.ok(zh[key] && en[key],key);}
assert.match(read('../index.html'),/data-tool="quick-screenshot"/);
assert.match(read('../src/features/lazy-tools.js'),/quick-screenshot/);
const caps=JSON.parse(read('../src-tauri/capabilities/screenshot.json'));
assert.ok(!caps.permissions.some(p=>/^(shell|http|fs):/.test(typeof p==='string'?p:p.identifier)));
assert.match(read('../src-tauri/src/native_runtime/quick_screenshot/mod.rs'),/devtools\(false\)/);
assert.match(read('../src/features/quick-screenshot/capture-editor.js'),/expectedProvider:provider/);
assert.match(read('../screenshot.html'),/id="toastContainer"/);
delete globalThis.document;
console.log('Quick screenshot geometry, pixels, text, history and integration passed.');
