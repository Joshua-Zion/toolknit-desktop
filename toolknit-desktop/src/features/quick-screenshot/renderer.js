import { annotationTextLayout, handlePoints, isPaintStroke } from './core.js';

export function createPaintScratch() {
  return { pixels: document.createElement('canvas'), mask: document.createElement('canvas') };
}

function strokePath(ctx, points, width) {
  ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
  if(points.every(p=>p.x===points[0].x&&p.y===points[0].y)){
    ctx.arc(points[0].x,points[0].y,width/2,0,Math.PI*2);ctx.fill();
  }else{points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();}
}

function paintMosaic(ctx, item, source, scratch) {
  const points=item.points;if(!points?.length)return;
  const block=item.block||12, diameter=block*2;
  // Align the pixel grid across strokes; mask only the painted path, including its round ends.
  const x=Math.max(0,Math.floor((item.x-diameter/2)/block)*block), y=Math.max(0,Math.floor((item.y-diameter/2)/block)*block);
  const w=Math.min((source.naturalWidth||source.width)-x,Math.ceil((item.x+item.width+diameter/2-x)/block)*block);
  const h=Math.min((source.naturalHeight||source.height)-y,Math.ceil((item.y+item.height+diameter/2-y)/block)*block);
  if(w<=0||h<=0)return;
  const {pixels,mask}=scratch;
  pixels.width=Math.max(1,Math.ceil(w/block));pixels.height=Math.max(1,Math.ceil(h/block));
  pixels.getContext('2d').drawImage(source,x,y,w,h,0,0,pixels.width,pixels.height);
  mask.width=w;mask.height=h;
  const painted=mask.getContext('2d');painted.imageSmoothingEnabled=false;painted.drawImage(pixels,0,0,w,h);
  painted.globalCompositeOperation='destination-in';painted.translate(-x,-y);painted.fillStyle=painted.strokeStyle='#000';
  strokePath(painted,points,diameter);
  ctx.drawImage(mask,x,y);
}

export function paintAnnotation(ctx, item, source, scratch) {
  ctx.save(); ctx.strokeStyle=item.color;ctx.fillStyle=item.color;ctx.lineWidth=item.stroke||3;ctx.lineCap='round';ctx.lineJoin='round';
  const {x,y,width:w,height:h}=item;
  if(item.kind==='rectangle'){if(item.fill)ctx.fillRect(x,y,w,h);else ctx.strokeRect(x,y,w,h);}
  if(item.kind==='ellipse'){ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,Math.max(.5,w/2),Math.max(.5,h/2),0,0,Math.PI*2);if(item.fill)ctx.fill();else ctx.stroke();}
  if(item.kind==='arrow'){
    const a=item.points[0],b=item.points.at(-1),angle=Math.atan2(b.y-a.y,b.x-a.x),head=Math.max(12,item.stroke*4);
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.moveTo(b.x-head*Math.cos(angle-.5),b.y-head*Math.sin(angle-.5));ctx.lineTo(b.x,b.y);ctx.lineTo(b.x-head*Math.cos(angle+.5),b.y-head*Math.sin(angle+.5));ctx.stroke();
  }
  if(item.kind==='brush')strokePath(ctx,item.points,item.stroke||3);
  if(item.kind==='mosaic')paintMosaic(ctx,item,source,scratch);
  if(item.kind==='text'){
    if(item.cover){ctx.fillStyle=item.background||'#ffffff';ctx.fillRect(x,y,w,h);ctx.fillStyle=item.color;}
    const fitted=annotationTextLayout(ctx,item);
    ctx.font=`${fitted.size}px sans-serif`;ctx.textBaseline='top';
    const lines=fitted.lines;
    ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();lines.forEach((line,i)=>ctx.fillText(line,x+fitted.offsetX,y+fitted.offsetY+i*fitted.size*1.25));
  }
  ctx.restore();
}
export function composeScreenshot(source, crop, items, scratch=createPaintScratch()) {
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(crop.width));canvas.height=Math.max(1,Math.round(crop.height));
  const ctx=canvas.getContext('2d');ctx.drawImage(source,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);
  ctx.save();ctx.translate(-crop.x,-crop.y);
  for(const item of items){
    if(item.kind==='text'&&!annotationTextLayout(ctx,item).fits)throw new Error('screenshot:text-overflow');
    paintAnnotation(ctx,item,source,scratch);
  }
  ctx.restore();return canvas;
}
export function renderEditor(canvas, state, source, scratch, scale) {
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.scale(scale.x,scale.y);
  const r=state.crop||state.candidate;
  if(r){ctx.fillStyle='rgba(0,0,0,.40)';ctx.beginPath();ctx.rect(0,0,state.width,state.height);ctx.rect(r.x,r.y,r.width,r.height);ctx.fill('evenodd');}
  if(state.crop){ctx.save();ctx.beginPath();ctx.rect(state.crop.x,state.crop.y,state.crop.width,state.crop.height);ctx.clip();if(!state.original)for(const a of state.items)paintAnnotation(ctx,a,source,scratch);ctx.restore();}
  const cssScale=scale.x/(Math.min(globalThis.devicePixelRatio||1,2));
  if(r){ctx.strokeStyle='#22c55e';ctx.lineWidth=2/cssScale;ctx.strokeRect(r.x,r.y,r.width,r.height);}
  const selected=state.items.find(a=>a.id===state.selected&&!isPaintStroke(a));
  const handles=selected||state.crop;
  if(handles&&!state.original){ctx.fillStyle='#ffffff';ctx.strokeStyle=selected?'#60a5fa':'#22c55e';ctx.lineWidth=1.5/cssScale;if(selected)ctx.strokeRect(selected.x,selected.y,selected.width,selected.height);
    for(const [x,y]of handlePoints(handles)){const w=7/cssScale;ctx.fillRect(x-w/2,y-w/2,w,w);ctx.strokeRect(x-w/2,y-w/2,w,w);}}
  ctx.restore();
}
