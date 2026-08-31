import JSZip from 'jszip';
import { createIcons, icons } from 'lucide';
import * as tauriCore from '@tauri-apps/api/core';
import { enhanceToolSelects } from './tool-custom-select.js';
import {
  PDF_CROP_FULL_RECT,
  PDF_CROP_LIMITS,
  PdfCropCancelledError,
  assertPdfCropFile,
  assertPdfCropPageCount,
  createPdfCropFileName,
  exportCroppedPdf,
  normalizePdfCropRect,
  pdfCropMarginsToRect,
  pdfCropRectToMargins,
  pdfCropRectsEqual,
  sanitizePdfCropBaseName,
  splitCroppedPdfPages
} from './pdf-crop-core.js';

const THUMB_WIDTH = 96;
const THUMB_HEIGHT = 68;
const THUMB_CONCURRENCY = 2;
const PREVIEW_MIN_ZOOM = 0.45;
const PREVIEW_MAX_ZOOM = 3.2;
const HISTORY_LIMIT = 60;
const POINTS_PER_MM = 72 / 25.4;

function asUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return Uint8Array.from(value);
  throw new Error('Invalid binary response');
}

function releaseCanvas(canvas) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1600);
}

function safeFocus(element) {
  try { element?.focus?.({ preventScroll: true }); } catch (_) {}
}

function isPasswordError(error) {
  return error?.name === 'PasswordException' || /password|encrypted/i.test(String(error?.message || error || ''));
}

function isCancellation(error) {
  return error instanceof PdfCropCancelledError
    || error?.name === 'RenderingCancelledException'
    || /cancelled|canceled/i.test(String(error?.message || error || ''));
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function stateSnapshot(pages) {
  return pages.map(page => ({ rect: { ...page.rect }, explicit: Boolean(page.explicit) }));
}

function snapshotsEqual(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((entry, index) => (
    Boolean(entry.explicit) === Boolean(right[index]?.explicit)
    && pdfCropRectsEqual(entry.rect, right[index]?.rect)
  ));
}

export function initPdfCropTool({
  isTauri,
  t,
  onLangChange,
  pdfWorkerUrl,
  getOutputDir,
  displayFilesystemPath,
  initStandardToolPlasma,
  disposeStandardToolPlasma
}) {
  const byId = id => document.getElementById(id);
  const overlay = byId('pdfCropOverlay');
  const plasmaBg = byId('pdfCropPlasmaBg');
  const back = byId('pdfCropBack');
  const dropZone = byId('pdfCropDropZone');
  const fileInput = byId('pdfCropFileInput');
  const emptyAdd = byId('pdfCropEmptyAdd');
  const replaceButton = byId('pdfCropReplace');
  const prevButton = byId('pdfCropPrev');
  const nextButton = byId('pdfCropNext');
  const pageIndicator = byId('pdfCropPageIndicator');
  const zoomOutButton = byId('pdfCropZoomOut');
  const zoomInButton = byId('pdfCropZoomIn');
  const fitButton = byId('pdfCropFit');
  const zoomValue = byId('pdfCropZoomValue');
  const canvasScroll = byId('pdfCropCanvasScroll');
  const canvasWrap = byId('pdfCropCanvasWrap');
  const previewCanvas = byId('pdfCropPreviewCanvas');
  const emptyState = byId('pdfCropEmpty');
  const interactionLayer = byId('pdfCropInteractionLayer');
  const selection = byId('pdfCropSelection');
  const sizeBadge = byId('pdfCropSizeBadge');
  const previewStatus = byId('pdfCropPreviewStatus');
  const resetPageButton = byId('pdfCropResetPage');
  const filmstrip = byId('pdfCropFilmstrip');
  const pageCount = byId('pdfCropPageCount');
  const fileName = byId('pdfCropFileName');
  const fileMeta = byId('pdfCropFileMeta');
  const scopeNote = byId('pdfCropScopeNote');
  const unitSelect = byId('pdfCropUnit');
  const linkMarginsButton = byId('pdfCropLinkMargins');
  const marginInputs = Array.from(overlay?.querySelectorAll('[data-margin-side]') || []);
  const dimension = byId('pdfCropDimension');
  const undoButton = byId('pdfCropUndo');
  const redoButton = byId('pdfCropRedo');
  const reframeButton = byId('pdfCropReframe');
  const resetAllButton = byId('pdfCropResetAll');
  const outputNameInput = byId('pdfCropOutputName');
  const exportButton = byId('pdfCropExport');
  const processMask = byId('pdfCropProcessMask');
  const processText = byId('pdfCropProcessText');
  const processValue = byId('pdfCropProcessValue');
  const processFill = byId('pdfCropProcessFill');
  const processCancel = byId('pdfCropProcessCancel');
  const successOverlay = byId('pdfCropSuccessOverlay');
  const successMeta = byId('pdfCropSuccessMeta');
  const successCount = byId('pdfCropSuccessCount');
  const successPath = byId('pdfCropSuccessPath');
  const successOpenFolder = byId('pdfCropSuccessOpenFolder');
  const successOk = byId('pdfCropSuccessOk');

  if (!overlay || !filmstrip || !previewCanvas || !interactionLayer || !selection || !exportButton) return { dispose() {} };

  const customSelectControls = enhanceToolSelects([unitSelect]);
  createIcons({ icons });
  const listeners = new AbortController();
  const listenerOptions = { signal: listeners.signal };
  let disposed = false;
  let plasmaInstance = null;
  let nativeDragUnlisten = null;
  let resizeObserver = null;
  let langUnsubscribe = () => {};
  let source = null;
  let pages = [];
  let currentIndex = 0;
  let scope = 'all';
  let marginsLinked = false;
  let reframeMode = false;
  let history = [];
  let future = [];
  let marginEditBefore = null;
  let pointerState = null;
  let previewTask = null;
  let previewRequest = 0;
  let previewZoom = 1;
  let previewScale = 1;
  let thumbObserver = null;
  let thumbQueue = [];
  let thumbActive = 0;
  let thumbEpoch = 0;
  const thumbTasks = new Set();
  let operation = null;
  let operationSeed = 0;
  let lastOutputFolder = '';
  let lastOutputCount = 0;
  let lastOutputMode = 'single';
  let overlayReturnFocus = null;

  const getInvoke = async () => (await Promise.resolve(tauriCore)).invoke;
  const showToast = message => window.showToast?.(message);
  const hasDocument = () => Boolean(source && pages.length);
  const currentPage = () => pages[currentIndex] || null;

  function setOverlayState(visible) {
    overlay.classList.toggle('visible', visible);
    overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (visible) overlay.removeAttribute('inert');
    else overlay.setAttribute('inert', '');
  }

  function setProcessState(visible) {
    processMask?.classList.toggle('visible', visible);
    processMask?.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (visible) processMask?.removeAttribute('inert');
    else processMask?.setAttribute('inert', '');
  }

  function setSuccessState(visible) {
    successOverlay?.classList.toggle('visible', visible);
    successOverlay?.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (visible) successOverlay?.removeAttribute('inert');
    else successOverlay?.setAttribute('inert', '');
  }

  function beginOperation(type) {
    if (operation) throw new Error('Another operation is already in progress');
    operation = { id: ++operationSeed, type, cancelled: false, loadingTasks: new Set() };
    if (processCancel) processCancel.disabled = false;
    updateControls();
    return operation;
  }

  function assertOperation(active) {
    if (!active || active !== operation || active.cancelled || disposed) throw new PdfCropCancelledError();
  }

  function finishOperation(active) {
    if (operation !== active) return;
    operation = null;
    setProcessState(false);
    updateControls();
  }

  function cancelOperation() {
    if (!operation || operation.cancelled) return;
    operation.cancelled = true;
    if (processCancel) processCancel.disabled = true;
    setProgress(0, t('home.pdfCrop.cancelling'));
    operation.loadingTasks.forEach(task => { try { task.destroy(); } catch (_) {} });
  }

  function setProgress(percent, label) {
    const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    if (processFill) processFill.style.width = `${value}%`;
    if (processValue) processValue.textContent = `${value}%`;
    if (processText && label) processText.textContent = label;
    processMask?.querySelector('[role="progressbar"]')?.setAttribute('aria-valuenow', String(value));
  }

  async function fileSizeFor(file) {
    if (isTauri && file.path) return Number(await (await getInvoke())('get_file_size', { path: file.path }));
    return Number(file.size || 0);
  }

  async function readFileBytes(file) {
    if (isTauri && file.path) return asUint8Array(await (await getInvoke())('read_file_bytes', { path: file.path }));
    return new Uint8Array(await file.arrayBuffer());
  }

  function sourceName(file) {
    return String(file?.name || file?.fileName || file?.path?.split(/[\\/]/).pop() || 'document.pdf');
  }

  function loadErrorMessage(error) {
    if (isCancellation(error)) return t('home.pdfCrop.loadCancelled');
    if (isPasswordError(error)) return t('home.pdfCrop.passwordProtected');
    const detail = String(error?.message || error || '');
    if (/pdf file is required/i.test(detail)) return t('home.pdfCrop.pdfOnly');
    if (/mb limit|file size/i.test(detail)) return t('home.pdfCrop.fileTooLarge');
    if (/page limit/i.test(detail)) return t('home.pdfCrop.tooManyPages', { count: PDF_CROP_LIMITS.maxPages });
    return t('home.pdfCrop.loadFailed', { error: detail });
  }

  function exportErrorMessage(error) {
    if (isCancellation(error)) return t('home.pdfCrop.cancelled');
    const detail = String(error?.message || error || '');
    return t('home.pdfCrop.exportFailed', { error: detail });
  }

  function cancelPreview() {
    previewRequest += 1;
    try { previewTask?.cancel(); } catch (_) {}
    previewTask = null;
    releaseCanvas(previewCanvas);
    canvasWrap.hidden = true;
  }

  function releaseThumbs() {
    thumbEpoch += 1;
    thumbQueue = [];
    thumbTasks.forEach(task => { try { task.cancel(); } catch (_) {} });
    thumbTasks.clear();
    thumbObserver?.disconnect();
    thumbObserver = null;
    filmstrip.querySelectorAll('canvas').forEach(releaseCanvas);
  }

  async function releaseSource(value) {
    if (!value) return;
    try { await value.pdfDoc?.destroy?.(); } catch (_) {}
    try { value.loadingTask?.destroy?.(); } catch (_) {}
  }

  async function resetDocument() {
    pointerState = null;
    marginEditBefore = null;
    cancelPreview();
    releaseThumbs();
    const previous = source;
    source = null;
    pages = [];
    currentIndex = 0;
    scope = 'all';
    marginsLinked = false;
    reframeMode = false;
    history = [];
    future = [];
    filmstrip.replaceChildren();
    renderFilmstrip();
    updateControls();
    renderCropOverlay();
    await releaseSource(previous);
  }

  function openOverlay() {
    if (disposed) return;
    if (!overlay.classList.contains('visible')) overlayReturnFocus = document.activeElement;
    setOverlayState(true);
    if (plasmaBg && !plasmaInstance) plasmaInstance = initStandardToolPlasma(plasmaBg);
    customSelectControls.forEach(control => control.refresh());
    updateControls();
    requestAnimationFrame(() => safeFocus(hasDocument() ? exportButton : emptyAdd || back));
  }

  function closeOverlay() {
    if (disposed) return;
    if (operation) cancelOperation();
    setSuccessState(false);
    setProcessState(false);
    setOverlayState(false);
    overlay.classList.remove('drag-over');
    dropZone?.classList.remove('visible');
    customSelectControls.forEach(control => control.close());
    plasmaInstance = disposeStandardToolPlasma(plasmaInstance);
    if (fileInput) fileInput.value = '';
    void resetDocument();
    const returnFocus = overlayReturnFocus;
    overlayReturnFocus = null;
    safeFocus(returnFocus);
  }

  async function loadFile(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length || operation) return;
    if (files.length !== 1) {
      showToast(t('home.pdfCrop.singleFileOnly'));
      if (fileInput) fileInput.value = '';
      return;
    }
    const active = beginOperation('load');
    setProcessState(true);
    setProgress(3, t('home.pdfCrop.readingFile'));
    let staged = null;
    try {
      const file = files[0];
      const name = sourceName(file);
      const size = await fileSizeFor(file);
      assertPdfCropFile(name, size);
      assertOperation(active);
      const bytes = await readFileBytes(file);
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const loadingTask = pdfjs.getDocument({ data: bytes.slice(), wasmUrl: new URL('assets/', document.baseURI).href, useWasm: true });
      active.loadingTasks.add(loadingTask);
      let pdfDoc;
      try { pdfDoc = await loadingTask.promise; }
      finally { active.loadingTasks.delete(loadingTask); }
      assertOperation(active);
      assertPdfCropPageCount(pdfDoc.numPages);
      const stagedPages = [];
      for (let index = 0; index < pdfDoc.numPages; index += 1) {
        assertOperation(active);
        const proxy = await pdfDoc.getPage(index + 1);
        const viewport = proxy.getViewport({ scale: 1 });
        stagedPages.push({
          id: `pdf-crop-page-${index + 1}`,
          index,
          rotation: proxy.rotate || 0,
          displayWidth: viewport.width,
          displayHeight: viewport.height,
          rect: { ...PDF_CROP_FULL_RECT },
          explicit: false
        });
        proxy.cleanup?.();
        setProgress(18 + Math.round(((index + 1) / pdfDoc.numPages) * 48), t('home.pdfCrop.preparingPage', { current: index + 1, total: pdfDoc.numPages }));
      }
      staged = { name, size, bytes, pdfDoc, loadingTask };
      const previous = source;
      source = staged;
      staged = null;
      pages = stagedPages;
      currentIndex = 0;
      history = [];
      future = [];
      reframeMode = false;
      if (outputNameInput) outputNameInput.value = sanitizePdfCropBaseName(name);
      renderFilmstrip();
      updateControls();
      setProgress(76, t('home.pdfCrop.renderingPreview'));
      await renderPreview();
      assertOperation(active);
      setProgress(100, t('home.pdfCrop.ready'));
      await releaseSource(previous);
    } catch (error) {
      await releaseSource(staged);
      if (!active.cancelled && !isCancellation(error)) showToast(loadErrorMessage(error));
    } finally {
      finishOperation(active);
      if (fileInput) fileInput.value = '';
    }
  }

  function createPageThumb(page) {
    const button = document.createElement('button');
    button.className = 'pdf-crop-page-thumb';
    button.type = 'button';
    button.dataset.pageIndex = String(page.index);
    button.innerHTML = `
      <span class="pdf-crop-page-thumb-visual"><canvas aria-hidden="true"></canvas><i class="pdf-crop-page-thumb-box"></i></span>
      <span class="pdf-crop-page-thumb-copy"><b>${t('home.pdfCrop.pageLabel', { page: page.index + 1 })}</b><small></small></span>`;
    button.addEventListener('click', () => selectPage(page.index), listenerOptions);
    return button;
  }

  function renderFilmstrip() {
    releaseThumbs();
    const fragment = document.createDocumentFragment();
    pages.forEach(page => fragment.appendChild(createPageThumb(page)));
    filmstrip.replaceChildren(fragment);
    filmstrip.classList.toggle('is-empty', !pages.length);
    updateThumbStates();
    if (pages.length) startThumbObserver();
    createIcons({ icons });
  }

  function startThumbObserver() {
    thumbObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        thumbObserver?.unobserve(entry.target);
        enqueueThumbnail(Number(entry.target.dataset.pageIndex));
      });
    }, { root: filmstrip, rootMargin: '0px 260px' });
    filmstrip.querySelectorAll('[data-page-index]').forEach(item => thumbObserver.observe(item));
  }

  function enqueueThumbnail(pageIndex) {
    const item = filmstrip.querySelector(`[data-page-index="${pageIndex}"]`);
    if (!item || item.dataset.thumbState) return;
    item.dataset.thumbState = 'queued';
    thumbQueue.push({ pageIndex, epoch: thumbEpoch });
    pumpThumbnails();
  }

  function pumpThumbnails() {
    while (thumbActive < THUMB_CONCURRENCY && thumbQueue.length) {
      const job = thumbQueue.shift();
      thumbActive += 1;
      void renderThumbnail(job).finally(() => { thumbActive -= 1; pumpThumbnails(); });
    }
  }

  async function renderThumbnail({ pageIndex, epoch }) {
    const item = filmstrip.querySelector(`[data-page-index="${pageIndex}"]`);
    const canvas = item?.querySelector('canvas');
    if (!source?.pdfDoc || !item || !canvas || epoch !== thumbEpoch) return;
    let proxy = null;
    let renderTask = null;
    try {
      proxy = await source.pdfDoc.getPage(pageIndex + 1);
      const base = proxy.getViewport({ scale: 1 });
      const scale = Math.min(THUMB_WIDTH / base.width, THUMB_HEIGHT / base.height);
      const viewport = proxy.getViewport({ scale });
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(viewport.width * dpr));
      canvas.height = Math.max(1, Math.round(viewport.height * dpr));
      canvas.style.width = `${Math.round(viewport.width)}px`;
      canvas.style.height = `${Math.round(viewport.height)}px`;
      renderTask = proxy.render({ canvasContext: canvas.getContext('2d'), viewport, transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0] });
      thumbTasks.add(renderTask);
      await renderTask.promise;
      if (epoch !== thumbEpoch) return;
      item.dataset.thumbState = 'ready';
      updateThumbState(pages[pageIndex]);
    } catch (error) {
      if (!isCancellation(error)) item.dataset.thumbState = 'error';
    } finally {
      if (renderTask) thumbTasks.delete(renderTask);
      proxy?.cleanup?.();
    }
  }

  function updateThumbState(page) {
    if (!page) return;
    const item = filmstrip.querySelector(`[data-page-index="${page.index}"]`);
    if (!item) return;
    item.classList.toggle('is-current', page.index === currentIndex);
    item.classList.toggle('has-crop', page.explicit);
    const status = item.querySelector('small');
    if (status) status.textContent = t(page.explicit ? 'home.pdfCrop.cropped' : 'home.pdfCrop.uncropped');
    const box = item.querySelector('.pdf-crop-page-thumb-box');
    const canvas = item.querySelector('canvas');
    const visual = item.querySelector('.pdf-crop-page-thumb-visual');
    if (!box || !canvas || !visual || !canvas.style.width) return;
    const width = parseFloat(canvas.style.width) || 0;
    const height = parseFloat(canvas.style.height) || 0;
    const offsetX = (visual.clientWidth - width) / 2;
    const offsetY = (visual.clientHeight - height) / 2;
    box.style.left = `${offsetX + page.rect.x * width}px`;
    box.style.top = `${offsetY + page.rect.y * height}px`;
    box.style.width = `${page.rect.width * width}px`;
    box.style.height = `${page.rect.height * height}px`;
  }

  function updateThumbStates() {
    pages.forEach(updateThumbState);
  }

  function selectPage(index) {
    if (!Number.isInteger(index) || index < 0 || index >= pages.length || index === currentIndex) return;
    currentIndex = index;
    reframeMode = false;
    updateControls();
    updateThumbStates();
    filmstrip.querySelector(`[data-page-index="${index}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    void renderPreview();
  }

  async function renderPreview() {
    const request = ++previewRequest;
    try { previewTask?.cancel(); } catch (_) {}
    previewTask = null;
    const page = currentPage();
    if (!page || !source?.pdfDoc) {
      cancelPreview();
      renderCropOverlay();
      return;
    }
    let proxy = null;
    try {
      proxy = await source.pdfDoc.getPage(page.index + 1);
      if (request !== previewRequest || disposed) return;
      const base = proxy.getViewport({ scale: 1 });
      page.displayWidth = base.width;
      page.displayHeight = base.height;
      page.rotation = proxy.rotate || 0;
      const availableWidth = Math.max(260, canvasScroll.clientWidth - 64);
      const availableHeight = Math.max(230, canvasScroll.clientHeight - 64);
      const fitScale = Math.min(availableWidth / base.width, availableHeight / base.height, 1.6);
      previewScale = Math.max(0.08, fitScale * previewZoom);
      const cssViewport = proxy.getViewport({ scale: previewScale });
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const renderViewport = proxy.getViewport({ scale: previewScale * dpr });
      previewCanvas.width = Math.max(1, Math.round(renderViewport.width));
      previewCanvas.height = Math.max(1, Math.round(renderViewport.height));
      previewCanvas.style.width = `${Math.round(cssViewport.width)}px`;
      previewCanvas.style.height = `${Math.round(cssViewport.height)}px`;
      canvasWrap.style.width = `${Math.round(cssViewport.width)}px`;
      canvasWrap.style.height = `${Math.round(cssViewport.height)}px`;
      canvasWrap.hidden = false;
      previewTask = proxy.render({ canvasContext: previewCanvas.getContext('2d'), viewport: renderViewport });
      await previewTask.promise;
      if (request !== previewRequest || disposed) return;
      previewTask = null;
      renderCropOverlay();
      if (previewStatus) previewStatus.textContent = t('home.pdfCrop.previewReady', { page: page.index + 1 });
    } catch (error) {
      if (request !== previewRequest || isCancellation(error)) return;
      console.error('[PDF Crop] preview failed:', error);
      if (previewStatus) previewStatus.textContent = t('home.pdfCrop.previewFailed');
    } finally {
      proxy?.cleanup?.();
    }
  }

  function unitFactor() {
    return unitSelect?.value === 'pt' ? 1 : POINTS_PER_MM;
  }

  function formatUnitValue(points) {
    const converted = points / unitFactor();
    return Math.abs(converted) >= 100 ? converted.toFixed(0) : converted.toFixed(1).replace(/\.0$/, '');
  }

  function renderCropOverlay() {
    const page = currentPage();
    if (!page || canvasWrap.hidden) {
      interactionLayer.hidden = true;
      return;
    }
    interactionLayer.hidden = false;
    const rect = normalizePdfCropRect(page.rect);
    selection.style.left = `${rect.x * 100}%`;
    selection.style.top = `${rect.y * 100}%`;
    selection.style.width = `${rect.width * 100}%`;
    selection.style.height = `${rect.height * 100}%`;
    interactionLayer.classList.toggle('is-unset', !page.explicit);
    interactionLayer.classList.toggle('is-reframing', reframeMode);
    if (sizeBadge) {
      const width = rect.width * page.displayWidth;
      const height = rect.height * page.displayHeight;
      sizeBadge.textContent = unitSelect?.value === 'pt'
        ? `${Math.round(width)} × ${Math.round(height)} pt`
        : `${(width / POINTS_PER_MM).toFixed(1)} × ${(height / POINTS_PER_MM).toFixed(1)} mm`;
    }
    updateMarginFields();
    updateDimension();
  }

  function updateMarginFields() {
    const page = currentPage();
    if (!page) {
      marginInputs.forEach(input => { input.value = '0'; });
      return;
    }
    const margins = pdfCropRectToMargins(page.rect, { width: page.displayWidth, height: page.displayHeight });
    marginInputs.forEach(input => {
      if (document.activeElement === input && marginEditBefore) return;
      input.value = formatUnitValue(margins[input.dataset.marginSide]);
    });
  }

  function updateDimension() {
    const page = currentPage();
    if (!page || !dimension) {
      if (dimension) dimension.textContent = '-';
      return;
    }
    const width = page.rect.width * page.displayWidth;
    const height = page.rect.height * page.displayHeight;
    dimension.textContent = unitSelect?.value === 'pt'
      ? `${width.toFixed(1)} × ${height.toFixed(1)} pt`
      : `${(width / POINTS_PER_MM).toFixed(1)} × ${(height / POINTS_PER_MM).toFixed(1)} mm`;
  }

  function applySnapshot(snapshot) {
    if (!Array.isArray(snapshot) || snapshot.length !== pages.length) return;
    pages.forEach((page, index) => {
      page.rect = normalizePdfCropRect(snapshot[index].rect);
      page.explicit = Boolean(snapshot[index].explicit);
    });
    refreshCropState();
  }

  function commitHistory(before) {
    const after = stateSnapshot(pages);
    if (!before || snapshotsEqual(before, after)) return false;
    history.push(before);
    if (history.length > HISTORY_LIMIT) history.shift();
    future = [];
    updateControls();
    return true;
  }

  function undo() {
    if (!history.length || operation) return;
    future.push(stateSnapshot(pages));
    applySnapshot(history.pop());
  }

  function redo() {
    if (!future.length || operation) return;
    history.push(stateSnapshot(pages));
    applySnapshot(future.pop());
  }

  function applyRectToScope(rect, explicit = true, selectedScope = scope) {
    const normalized = normalizePdfCropRect(rect);
    if (selectedScope === 'all') {
      pages.forEach(page => { page.rect = { ...normalized }; page.explicit = explicit; });
    } else {
      const page = currentPage();
      if (page) { page.rect = { ...normalized }; page.explicit = explicit; }
    }
    refreshCropState();
  }

  function marginsFromFields() {
    const factor = unitFactor();
    return Object.fromEntries(marginInputs.map(input => [input.dataset.marginSide, Math.max(0, Number(input.value) || 0) * factor]));
  }

  function applyMarginsToScope() {
    const margins = marginsFromFields();
    const targets = scope === 'all' ? pages : [currentPage()].filter(Boolean);
    targets.forEach(page => {
      page.rect = pdfCropMarginsToRect(margins, { width: page.displayWidth, height: page.displayHeight });
      page.explicit = true;
    });
    refreshCropState(false);
  }

  function refreshCropState(syncInputs = true) {
    updateThumbStates();
    renderCropOverlay();
    if (syncInputs) updateMarginFields();
    updateControls();
  }

  function resetCurrentPage() {
    const page = currentPage();
    if (!page?.explicit) return;
    const before = stateSnapshot(pages);
    page.rect = { ...PDF_CROP_FULL_RECT };
    page.explicit = false;
    commitHistory(before);
    refreshCropState();
  }

  function resetAllPages() {
    if (!pages.some(page => page.explicit)) return;
    const before = stateSnapshot(pages);
    pages.forEach(page => { page.rect = { ...PDF_CROP_FULL_RECT }; page.explicit = false; });
    commitHistory(before);
    reframeMode = false;
    refreshCropState();
  }

  function normalizedPointer(event) {
    const rect = interactionLayer.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)))
    };
  }

  function beginCropPointer(event) {
    if (!hasDocument() || operation || event.button !== 0) return;
    const page = currentPage();
    const handle = event.target.closest('[data-handle]')?.dataset.handle || '';
    const insideSelection = Boolean(event.target.closest('#pdfCropSelection'));
    let mode = '';
    if (handle && page.explicit && !reframeMode) mode = 'resize';
    else if (insideSelection && page.explicit && !reframeMode) mode = 'move';
    else if (!page.explicit || reframeMode) mode = 'draw';
    if (!mode) return;
    event.preventDefault();
    const point = normalizedPointer(event);
    pointerState = {
      pointerId: event.pointerId,
      mode,
      handle,
      start: point,
      startClientX: event.clientX,
      startClientY: event.clientY,
      rect: { ...page.rect },
      before: stateSnapshot(pages),
      moved: false
    };
    interactionLayer.classList.add('is-drawing');
    try { interactionLayer.setPointerCapture(event.pointerId); } catch (_) {}
    if (mode === 'draw') applyRectToScope({ x: point.x, y: point.y, width: 0.002, height: 0.002 }, true);
  }

  function handleCropPointerMove(event) {
    const state = pointerState;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = normalizedPointer(event);
    const dx = point.x - state.start.x;
    const dy = point.y - state.start.y;
    state.moved ||= Math.hypot(event.clientX - state.startClientX, event.clientY - state.startClientY) >= 4;
    let rect = { ...state.rect };
    const minWidth = Math.min(0.5, PDF_CROP_LIMITS.minCropPoints / Math.max(1, currentPage()?.displayWidth || 1));
    const minHeight = Math.min(0.5, PDF_CROP_LIMITS.minCropPoints / Math.max(1, currentPage()?.displayHeight || 1));

    if (state.mode === 'draw') {
      rect = {
        x: Math.min(state.start.x, point.x),
        y: Math.min(state.start.y, point.y),
        width: Math.max(minWidth, Math.abs(point.x - state.start.x)),
        height: Math.max(minHeight, Math.abs(point.y - state.start.y))
      };
    } else if (state.mode === 'move') {
      rect.x = Math.max(0, Math.min(1 - rect.width, rect.x + dx));
      rect.y = Math.max(0, Math.min(1 - rect.height, rect.y + dy));
    } else {
      let left = rect.x;
      let right = rect.x + rect.width;
      let top = rect.y;
      let bottom = rect.y + rect.height;
      if (state.handle.includes('w')) left = Math.max(0, Math.min(right - minWidth, state.start.x + dx));
      if (state.handle.includes('e')) right = Math.min(1, Math.max(left + minWidth, state.start.x + dx));
      if (state.handle.includes('n')) top = Math.max(0, Math.min(bottom - minHeight, state.start.y + dy));
      if (state.handle.includes('s')) bottom = Math.min(1, Math.max(top + minHeight, state.start.y + dy));
      rect = { x: left, y: top, width: right - left, height: bottom - top };
    }
    applyRectToScope(rect, true);
  }

  function endCropPointer(event) {
    const state = pointerState;
    if (!state || state.pointerId !== event.pointerId) return;
    pointerState = null;
    interactionLayer.classList.remove('is-drawing');
    try { interactionLayer.releasePointerCapture(event.pointerId); } catch (_) {}
    if (state.mode === 'draw' && !state.moved) applySnapshot(state.before);
    else commitHistory(state.before);
    reframeMode = false;
    updateControls();
    renderCropOverlay();
  }

  function updateControls() {
    const busy = Boolean(operation);
    const page = currentPage();
    const hasCrop = pages.some(item => item.explicit);
    const scopedCount = scope === 'all' ? pages.length : (page ? 1 : 0);
    if (pageIndicator) pageIndicator.textContent = page
      ? t('home.pdfCrop.pageIndicator', { current: currentIndex + 1, total: pages.length })
      : t('home.pdfCrop.noDocument');
    if (pageCount) pageCount.textContent = t('home.pdfCrop.totalPages', { count: pages.length });
    if (fileName) fileName.textContent = source?.name || t('home.pdfCrop.noFile');
    if (fileMeta) fileMeta.textContent = source
      ? t('home.pdfCrop.fileMeta', { pages: pages.length, size: formatBytes(source.size) })
      : t('home.pdfCrop.localOnly');
    if (scopeNote) scopeNote.textContent = hasDocument()
      ? t(scope === 'all' ? 'home.pdfCrop.scopeAllStatus' : 'home.pdfCrop.scopeCurrentStatus', { count: scopedCount, page: currentIndex + 1 })
      : t('home.pdfCrop.scopeEmpty');
    overlay.querySelectorAll('[data-crop-scope]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.cropScope === scope);
      button.disabled = busy || !hasDocument();
    });
    if (prevButton) prevButton.disabled = busy || currentIndex <= 0;
    if (nextButton) nextButton.disabled = busy || currentIndex >= pages.length - 1;
    if (zoomOutButton) zoomOutButton.disabled = !hasDocument() || previewZoom <= PREVIEW_MIN_ZOOM;
    if (zoomInButton) zoomInButton.disabled = !hasDocument() || previewZoom >= PREVIEW_MAX_ZOOM;
    if (fitButton) fitButton.disabled = !hasDocument();
    if (zoomValue) zoomValue.textContent = `${Math.round(previewZoom * 100)}%`;
    if (resetPageButton) resetPageButton.disabled = busy || !page?.explicit;
    if (resetAllButton) resetAllButton.disabled = busy || !hasCrop;
    if (undoButton) undoButton.disabled = busy || !history.length;
    if (redoButton) redoButton.disabled = busy || !future.length;
    if (reframeButton) {
      reframeButton.disabled = busy || !hasDocument();
      reframeButton.setAttribute('aria-pressed', String(reframeMode));
    }
    if (replaceButton) replaceButton.disabled = busy;
    if (emptyAdd) emptyAdd.disabled = busy;
    if (linkMarginsButton) linkMarginsButton.disabled = busy || !hasDocument();
    if (unitSelect) unitSelect.disabled = busy || !hasDocument();
    customSelectControls.forEach(control => control.refresh());
    marginInputs.forEach(input => { input.disabled = busy || !hasDocument(); });
    overlay.querySelectorAll('input[name="pdfCropOutputMode"], #pdfCropOutputName').forEach(input => { input.disabled = busy || !hasDocument(); });
    exportButton.disabled = busy || !hasDocument() || !hasCrop;
    if (emptyState) emptyState.hidden = hasDocument();
    if (!hasDocument()) canvasWrap.hidden = true;
    if (previewStatus && !hasDocument()) previewStatus.textContent = t('home.pdfCrop.previewEmpty');
    linkMarginsButton?.setAttribute('aria-pressed', String(marginsLinked));
    renderCropOverlay();
  }

  function changeZoom(factor) {
    previewZoom = Math.min(PREVIEW_MAX_ZOOM, Math.max(PREVIEW_MIN_ZOOM, previewZoom * factor));
    updateControls();
    void renderPreview();
  }

  function outputMode() {
    return overlay.querySelector('input[name="pdfCropOutputMode"]:checked')?.value === 'zip' ? 'zip' : 'single';
  }

  async function writeOutput(bytes, directory, fileNameValue, mimeType) {
    if (isTauri) return await (await getInvoke())('write_unique_file_bytes', { directory, fileName: fileNameValue, bytes: Array.from(bytes) });
    downloadBlob(new Blob([bytes], { type: mimeType }), fileNameValue);
    return `${directory}/${fileNameValue}`;
  }

  async function exportDocument() {
    if (!hasDocument() || operation || !pages.some(page => page.explicit)) return;
    const active = beginOperation('export');
    setProcessState(true);
    if (processCancel) processCancel.disabled = false;
    setProgress(3, t('home.pdfCrop.preparingExport'));
    try {
      const crops = pages.map(page => ({ rect: page.rect, explicit: page.explicit, rotation: page.rotation }));
      const baseName = sanitizePdfCropBaseName(outputNameInput?.value || source.name);
      const mode = outputMode();
      const outputDir = await getOutputDir('PDF_Crop');
      assertOperation(active);
      let outputBytes;
      let outputFileName;
      let mimeType;
      if (mode === 'zip') {
        const split = await splitCroppedPdfPages({
          bytes: source.bytes,
          crops,
          baseName,
          shouldCancel: () => active.cancelled || operation !== active || disposed,
          onProgress: update => setProgress(8 + Math.round((update.completed / update.total) * 62), t('home.pdfCrop.croppingPage', update))
        });
        assertOperation(active);
        const zip = new JSZip();
        split.forEach(file => zip.file(file.fileName, file.bytes));
        outputBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } }, metadata => {
          assertOperation(active);
          setProgress(72 + Math.round(metadata.percent * 0.2), t('home.pdfCrop.packaging'));
        });
        outputFileName = createPdfCropFileName(baseName, 'zip');
        mimeType = 'application/zip';
        lastOutputCount = pages.length;
      } else {
        outputBytes = await exportCroppedPdf({
          bytes: source.bytes,
          crops,
          shouldCancel: () => active.cancelled || operation !== active || disposed,
          onProgress: update => setProgress(8 + Math.round((update.completed / update.total) * 78), t('home.pdfCrop.croppingPage', update))
        });
        outputFileName = createPdfCropFileName(baseName);
        mimeType = 'application/pdf';
        lastOutputCount = 1;
      }
      assertOperation(active);
      setProgress(94, t('home.pdfCrop.writingFile'));
      await writeOutput(outputBytes, outputDir, outputFileName, mimeType);
      assertOperation(active);
      lastOutputFolder = outputDir;
      lastOutputMode = mode;
      setProgress(100, t('home.pdfCrop.complete'));
      renderSuccess();
      setSuccessState(true);
    } catch (error) {
      if (!active.cancelled && !isCancellation(error)) showToast(exportErrorMessage(error));
    } finally {
      finishOperation(active);
    }
  }

  function renderSuccess() {
    if (successMeta) successMeta.textContent = t(lastOutputMode === 'zip' ? 'home.pdfCrop.successZip' : 'home.pdfCrop.successSingle', { count: pages.length });
    if (successCount) successCount.textContent = t('home.pdfCrop.outputCountValue', { count: lastOutputCount });
    if (successPath) successPath.textContent = displayFilesystemPath(lastOutputFolder || '~/Downloads');
    if (successOpenFolder) successOpenFolder.style.display = isTauri ? '' : 'none';
  }

  async function openOutputFolder() {
    if (!isTauri || !lastOutputFolder) return;
    try { await (await getInvoke())('open_path', { path: lastOutputFolder }); }
    catch (error) { console.error('[PDF Crop] open output folder failed:', error); showToast(t('home.pdfCrop.openFolderFailed')); }
  }

  function showDropZone() {
    if (operation) return;
    overlay.classList.add('drag-over');
    dropZone?.classList.add('visible');
  }

  function hideDropZone() {
    overlay.classList.remove('drag-over');
    dropZone?.classList.remove('visible');
  }

  function handleKeydown(event) {
    if (!overlay.classList.contains('visible')) return;
    if (event.key === 'Escape') {
      if (successOverlay?.classList.contains('visible')) setSuccessState(false);
      else if (operation) cancelOperation();
      else if (reframeMode) { reframeMode = false; updateControls(); }
      else closeOverlay();
      return;
    }
    const tag = event.target?.tagName?.toLowerCase();
    if (['input', 'select', 'textarea'].includes(tag)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
    if (event.key === 'ArrowLeft') { event.preventDefault(); selectPage(currentIndex - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); selectPage(currentIndex + 1); }
  }

  back?.addEventListener('click', closeOverlay, listenerOptions);
  emptyAdd?.addEventListener('click', () => fileInput?.click(), listenerOptions);
  replaceButton?.addEventListener('click', () => fileInput?.click(), listenerOptions);
  fileInput?.addEventListener('change', event => void loadFile(event.target.files), listenerOptions);
  prevButton?.addEventListener('click', () => selectPage(currentIndex - 1), listenerOptions);
  nextButton?.addEventListener('click', () => selectPage(currentIndex + 1), listenerOptions);
  zoomOutButton?.addEventListener('click', () => changeZoom(0.86), listenerOptions);
  zoomInButton?.addEventListener('click', () => changeZoom(1.16), listenerOptions);
  fitButton?.addEventListener('click', () => { previewZoom = 1; updateControls(); void renderPreview(); }, listenerOptions);
  resetPageButton?.addEventListener('click', resetCurrentPage, listenerOptions);
  undoButton?.addEventListener('click', undo, listenerOptions);
  redoButton?.addEventListener('click', redo, listenerOptions);
  resetAllButton?.addEventListener('click', resetAllPages, listenerOptions);
  reframeButton?.addEventListener('click', () => { reframeMode = !reframeMode; updateControls(); }, listenerOptions);
  exportButton?.addEventListener('click', () => void exportDocument(), listenerOptions);
  processCancel?.addEventListener('click', cancelOperation, listenerOptions);
  successOk?.addEventListener('click', () => { setSuccessState(false); safeFocus(exportButton); }, listenerOptions);
  successOpenFolder?.addEventListener('click', () => void openOutputFolder(), listenerOptions);
  interactionLayer.addEventListener('pointerdown', beginCropPointer, listenerOptions);
  document.addEventListener('pointermove', handleCropPointerMove, { ...listenerOptions, passive: false });
  document.addEventListener('pointerup', endCropPointer, listenerOptions);
  document.addEventListener('pointercancel', endCropPointer, listenerOptions);
  document.addEventListener('keydown', handleKeydown, listenerOptions);

  overlay.querySelectorAll('[data-crop-scope]').forEach(button => button.addEventListener('click', () => {
    scope = button.dataset.cropScope === 'current' ? 'current' : 'all';
    updateControls();
  }, listenerOptions));

  linkMarginsButton?.addEventListener('click', () => {
    marginsLinked = !marginsLinked;
    linkMarginsButton.innerHTML = marginsLinked
      ? `<i data-lucide="link-2"></i><span>${t('home.pdfCrop.linkedMargins')}</span>`
      : `<i data-lucide="unlink"></i><span>${t('home.pdfCrop.linkMargins')}</span>`;
    createIcons({ icons });
    updateControls();
  }, listenerOptions);

  unitSelect?.addEventListener('change', () => { updateMarginFields(); updateDimension(); renderCropOverlay(); }, listenerOptions);
  marginInputs.forEach(input => {
    input.addEventListener('focus', () => { marginEditBefore ||= stateSnapshot(pages); }, listenerOptions);
    input.addEventListener('input', () => {
      if (marginsLinked) marginInputs.forEach(candidate => { if (candidate !== input) candidate.value = input.value; });
      applyMarginsToScope();
    }, listenerOptions);
    input.addEventListener('change', () => {
      commitHistory(marginEditBefore);
      marginEditBefore = null;
      refreshCropState();
    }, listenerOptions);
    input.addEventListener('blur', () => {
      if (!marginEditBefore) return;
      commitHistory(marginEditBefore);
      marginEditBefore = null;
    }, listenerOptions);
  });

  overlay.addEventListener('dragover', event => { if (!isTauri) { event.preventDefault(); showDropZone(); } }, listenerOptions);
  overlay.addEventListener('dragleave', event => { if (!overlay.contains(event.relatedTarget)) hideDropZone(); }, listenerOptions);
  overlay.addEventListener('drop', event => {
    if (isTauri) return;
    event.preventDefault();
    hideDropZone();
    void loadFile(event.dataTransfer?.files);
  }, listenerOptions);

  resizeObserver = new ResizeObserver(() => {
    if (!overlay.classList.contains('visible') || !hasDocument() || operation?.type === 'load') return;
    window.clearTimeout(resizeObserver.renderTimer);
    resizeObserver.renderTimer = window.setTimeout(() => void renderPreview(), 120);
  });
  resizeObserver.observe(canvasScroll);

  if (isTauri) {
    void (async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview');
        const unlisten = await getCurrentWebview().onDragDropEvent(event => {
          if (disposed || !overlay.classList.contains('visible') || operation) return;
          const payload = event.payload || {};
          if (payload.type === 'enter' || payload.type === 'over') showDropZone();
          else if (payload.type === 'leave') hideDropZone();
          else if (payload.type === 'drop') {
            hideDropZone();
            const files = Array.from(payload.paths || []).map(path => ({ name: path.split(/[\\/]/).pop() || path, path, size: 0 }));
            void loadFile(files);
          }
        });
        if (disposed) unlisten();
        else nativeDragUnlisten = unlisten;
      } catch (error) {
        if (!disposed) console.error('[PDF Crop] native drag-drop setup failed:', error);
      }
    })();
  }

  langUnsubscribe = onLangChange(() => {
    renderFilmstrip();
    updateControls();
    customSelectControls.forEach(control => control.refresh());
    if (successOverlay?.classList.contains('visible')) renderSuccess();
  }) || (() => {});

  updateControls();
  setOverlayState(false);
  setProcessState(false);
  setSuccessState(false);

  const dispose = () => {
    if (disposed) return;
    if (operation) cancelOperation();
    disposed = true;
    listeners.abort();
    customSelectControls.forEach(control => control.dispose());
    try { langUnsubscribe(); } catch (_) {}
    try { nativeDragUnlisten?.(); } catch (_) {}
    nativeDragUnlisten = null;
    resizeObserver?.disconnect();
    if (resizeObserver?.renderTimer) window.clearTimeout(resizeObserver.renderTimer);
    resizeObserver = null;
    plasmaInstance = disposeStandardToolPlasma(plasmaInstance);
    setOverlayState(false);
    setProcessState(false);
    setSuccessState(false);
    void resetDocument();
  };
  window.addEventListener('beforeunload', dispose, { ...listenerOptions, once: true });

  return { open: openOverlay, dispose };
}
