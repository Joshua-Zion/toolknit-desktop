export const MAX_ANNOTATIONS = 300;
export const MAX_POINTS = 6000;
export const MAX_TOTAL_POINTS = 20000;
export const TOOLS = Object.freeze(['select', 'rectangle', 'ellipse', 'arrow', 'brush', 'mosaic', 'text']);
export const isPaintStroke = item => item?.kind === 'brush' || item?.kind === 'mosaic';
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function rectangle(a, b, width, height) {
  const x = clamp(Math.min(a.x, b.x), 0, width), y = clamp(Math.min(a.y, b.y), 0, height);
  return { x, y, width: Math.max(1, clamp(Math.max(a.x, b.x), 0, width)-x), height: Math.max(1, clamp(Math.max(a.y, b.y), 0, height)-y) };
}
export function contains(r, p, tolerance = 0) { return p.x >= r.x-tolerance && p.y >= r.y-tolerance && p.x <= r.x+r.width+tolerance && p.y <= r.y+r.height+tolerance; }
export function moveRect(r, dx, dy, width, height) { return { ...r, x:clamp(r.x+dx,0,Math.max(0,width-r.width)), y:clamp(r.y+dy,0,Math.max(0,height-r.height)) }; }
export function handlePoints(r) { return [[r.x,r.y],[r.x+r.width/2,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.height/2],[r.x+r.width,r.y+r.height],[r.x+r.width/2,r.y+r.height],[r.x,r.y+r.height],[r.x,r.y+r.height/2]]; }
export function resizeRect(r, handle, p, width, height) {
  let left=r.x, top=r.y, right=r.x+r.width, bottom=r.y+r.height;
  if ([0,6,7].includes(handle)) left=clamp(p.x,0,right-1);
  if ([2,3,4].includes(handle)) right=clamp(p.x,left+1,width);
  if ([0,1,2].includes(handle)) top=clamp(p.y,0,bottom-1);
  if ([4,5,6].includes(handle)) bottom=clamp(p.y,top+1,height);
  return {x:left,y:top,width:right-left,height:bottom-top};
}
export function resizeAnnotation(original, r) {
  const next={...original,...r};
  if (original.points) next.points=original.points.map(p=>({x:r.x+(p.x-original.x)*r.width/Math.max(1,original.width),y:r.y+(p.y-original.y)*r.height/Math.max(1,original.height)}));
  return next;
}
export function windowAt(desktop, point) {
  const global={x:point.x+desktop.bounds.x,y:point.y+desktop.bounds.y};
  const r=desktop.windows.find(r=>contains(r,global));
  if (!r) return {x:0,y:0,width:desktop.bounds.width,height:desktop.bounds.height};
  return rectangle({x:r.x-desktop.bounds.x,y:r.y-desktop.bounds.y},{x:r.x+r.width-desktop.bounds.x,y:r.y+r.height-desktop.bounds.y},desktop.bounds.width,desktop.bounds.height);
}
export function parseTranslations(raw, lines) {
  const value = JSON.parse(String(raw).trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
  if (!Array.isArray(value) || value.length !== lines.length) throw new Error('screenshot:invalid-translation');
  const mapped=new Map();
  for (const item of value) {
    if (!Number.isInteger(item.id) || mapped.has(item.id) || !lines.some(l=>l.id===item.id) || typeof item.text!=='string' || !item.text.trim() || item.text.length>4000) throw new Error('screenshot:invalid-translation');
    mapped.set(item.id,item.text.trim());
  }
  return lines.map(line=>({...line,text:mapped.get(line.id)}));
}
export function textLines(ctx, text, maxWidth) {
  const result=[];
  for (const paragraph of String(text).split('\n')) {
    let current='';
    for (const char of paragraph) { if (current && ctx.measureText(current+char).width>maxWidth) { result.push(current); current=''; } current+=char; }
    result.push(current);
  }
  return result;
}
export function fitText(ctx, text, width, height, preferred=28) {
  let size=clamp(preferred,8,120), lines;
  do { ctx.font=`${size}px sans-serif`; lines=textLines(ctx,text,Math.max(1,width-4)); if (lines.length*size*1.25<=height-4 || size<=8) break; size--; } while (true);
  return {size,lines,fits:lines.length*size*1.25<=height-4 && lines.every(line=>ctx.measureText(line).width<=width-4)};
}
function hasCjk(value) { return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7a3]/u.test(value); }
function joinOcrLine(lines) {
  return lines.reduce((result, line, index) => {
    const text = String(line.text || '').trim();
    if (!text) return result;
    if (!result) return text;
    const previous = lines[index - 1];
    const gap = Number(line.x) - (Number(previous.x) + Number(previous.width));
    const height = Math.max(1, Math.min(Number(previous.height) || 16, Number(line.height) || 16));
    const needsSpace = gap > Math.max(3, height * 0.18)
      && !hasCjk(result.slice(-1)) && !hasCjk(text.slice(0, 1))
      && !/^[,.;:!?%)\]}]/.test(text) && !/[([{]$/.test(result);
    const columnGap = gap > height * 2;
    return result + (columnGap ? '\t' : needsSpace ? ' ' : '') + text;
  }, '');
}
export function formatOcrText(result) {
  const fallback = String(result?.text || '').trim();
  const lines = Array.isArray(result?.lines)
    ? result.lines.filter(line => typeof line?.text === 'string' && line.text.trim())
      .map((line, index) => ({
        ...line,
        id: Number.isInteger(line.id) ? line.id : index,
        x: Number(line.x), y: Number(line.y), width: Number(line.width), height: Number(line.height)
      }))
    : [];
  if (!lines.length || lines.some(line => ![line.x, line.y, line.width, line.height].every(Number.isFinite) || line.width <= 0 || line.height <= 0)) return fallback;
  lines.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const line of lines) {
    const lineCenter = line.y + line.height / 2;
    const row = rows.find(candidate => Math.abs(lineCenter - candidate.center) <= Math.max(line.height, candidate.height) * 0.6);
    if (row) {
      row.lines.push(line);
      row.center = row.lines.reduce((sum, item) => sum + item.y + item.height / 2, 0) / row.lines.length;
      row.height = Math.max(row.height, line.height);
    } else rows.push({ lines: [line], center: lineCenter, height: line.height });
  }
  rows.sort((a, b) => a.center - b.center);
  return rows.map((row, index) => {
    row.lines.sort((a, b) => a.x - b.x);
    const text = joinOcrLine(row.lines);
    if (index === 0) return text;
    const previous = rows[index - 1];
    const previousBottom = Math.max(...previous.lines.map(item => item.y + item.height));
    const currentTop = Math.min(...row.lines.map(item => item.y));
    const paragraphGap = currentTop - previousBottom > Math.max(previous.height, row.height) * 1.5;
    return `${paragraphGap ? '\n\n' : '\n'}${text}`;
  }).join('').trim() || fallback;
}
export function errorKey(error) {
  const code=String(error?.code || error?.message || error).replace(/^screenshot:/,'');
  if (code==='text-overflow') return 'textOverflow';
  if (code==='annotation-limit') return 'annotationLimit';
  if (code==='aborted') return 'cancelled';
  if (code === 'http_error') {
    const status = Number(error?.status);
    return ({401:'aiUnauthorized',403:'aiForbidden',404:'aiNotFound',429:'aiRateLimited'})[status] || (status >= 500 && status <= 599 ? 'aiProviderUnavailable' : 'aiHttp');
  }
  return ({'windows-only':'desktopOnly','shortcut-conflict':'shortcutConflict','shortcut-invalid':'shortcutInvalid','shortcut-failed':'shortcutConflict','image-too-large':'tooLarge','ocr-too-large':'ocrTooLarge','ocr-language-missing':'ocrUnavailable','ocr-unavailable':'ocrUnavailable','ocr-failed':'ocrFailed','busy':'busy','expired':'expired','viewer-limit':'viewerLimit','invalid-translation':'invalidTranslation','timeout':'aiTimeout','response_truncated':'aiTruncated','empty_response':'aiEmpty','invalid_request':'aiInvalidRequest','invalid_response':'aiInvalidResponse','response_too_large':'aiTooLarge','invalid_config':'aiInvalidConfig','network_error':'aiNetwork','native_transport_unavailable':'aiNativeUnavailable','private_http_requires_opt_in':'aiPrivateHttp','insecure_http_not_allowed':'aiInsecureHttp','provider_changed':'providerChanged'})[code] || 'failed';
}
