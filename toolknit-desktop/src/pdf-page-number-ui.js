import JSZip from 'jszip';
import { createIcons, icons } from 'lucide';
import * as tauriCore from '@tauri-apps/api/core';
import { enhanceToolSelects } from './tool-custom-select.js';
import {
  PDF_PAGE_NUMBER_DEFAULTS,
  PDF_PAGE_NUMBER_LIMITS,
  PdfPageNumberCancelledError,
  assertPdfPageNumberPageCount,
  assertPdfPageNumberSelection,
  buildPdfPageNumberPlan,
  calculatePdfPageNumberLayout,
  createPdfPageNumberFileName,
  exportPdfWithPageNumbers,
  normalizePdfPageNumberSettings,
  sanitizePdfPageNumberBaseName,
  splitNumberedPdfPages
} from './pdf-page-number-core.js';

const THUMB_WIDTH = 116;
const THUMB_HEIGHT = 150;
const THUMB_CONCURRENCY = 2;
const PREVIEW_MIN_ZOOM = 0.45;
const PREVIEW_MAX_ZOOM = 3.2;

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

function isPasswordError(error) {
  return error?.name === 'PasswordException' || /password|encrypted/i.test(String(error?.message || error || ''));
}

function isCancellation(error) {
  return error instanceof PdfPageNumberCancelledError
    || error?.name === 'RenderingCancelledException'
    || /cancelled|canceled/i.test(String(error?.message || error || ''));
}

function safeFocus(element) {
  try { element?.focus?.({ preventScroll: true }); } catch (_) {}
}

export function initPdfPageNumberTool({
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
  const overlay = byId('pdfPageNumberOverlay');
  const plasmaBg = byId('pdfPageNumberPlasmaBg');
  const back = byId('pdfPageNumberBack');
  const dropZone = byId('pdfPageNumberDropZone');
  const fileInput = byId('pdfPageNumberFileInput');
  const addButton = byId('pdfPageNumberAdd');
  const emptyAddButton = byId('pdfPageNumberEmptyAdd');
  const pageList = byId('pdfPageNumberPageList');
  const pageCount = byId('pdfPageNumberPageCount');
  const selectedCount = byId('pdfPageNumberSelectedCount');
  const selectAllButton = byId('pdfPageNumberSelectAll');
  const deleteSelectedButton = byId('pdfPageNumberDeleteSelected');
  const undoDeleteButton = byId('pdfPageNumberUndoDelete');
  const prevButton = byId('pdfPageNumberPrev');
  const nextButton = byId('pdfPageNumberNext');
  const pageIndicator = byId('pdfPageNumberIndicator');
  const zoomOutButton = byId('pdfPageNumberZoomOut');
  const zoomInButton = byId('pdfPageNumberZoomIn');
  const fitButton = byId('pdfPageNumberFit');
  const zoomValue = byId('pdfPageNumberZoomValue');
  const canvasScroll = byId('pdfPageNumberCanvasScroll');
  const canvasStage = byId('pdfPageNumberCanvasStage');
  const canvasWrap = byId('pdfPageNumberCanvasWrap');
  const previewCanvas = byId('pdfPageNumberPreviewCanvas');
  const liveLayer = byId('pdfPageNumberLiveLayer');
  const liveBackground = byId('pdfPageNumberLiveBackground');
  const liveText = byId('pdfPageNumberLiveText');
  const emptyState = byId('pdfPageNumberEmpty');
  const previewStatus = byId('pdfPageNumberPreviewStatus');
  const rangeField = byId('pdfPageNumberRangeField');
  const rangeInput = byId('pdfPageNumberCustomRange');
  const templatePreset = byId('pdfPageNumberTemplatePreset');
  const templateField = byId('pdfPageNumberTemplateField');
  const templateInput = byId('pdfPageNumberTemplate');
  const scopeSelect = byId('pdfPageNumberScope');
  const numberingModeSelect = byId('pdfPageNumberMode');
  const startInput = byId('pdfPageNumberStart');
  const stepInput = byId('pdfPageNumberStep');
  const skipInput = byId('pdfPageNumberSkip');
  const numberFormatSelect = byId('pdfPageNumberFormat');
  const marginInput = byId('pdfPageNumberMargin');
  const offsetXInput = byId('pdfPageNumberOffsetX');
  const offsetYInput = byId('pdfPageNumberOffsetY');
  const fontSizeInput = byId('pdfPageNumberFontSize');
  const textColorInput = byId('pdfPageNumberTextColor');
  const textOpacityInput = byId('pdfPageNumberTextOpacity');
  const backgroundColorInput = byId('pdfPageNumberBackgroundColor');
  const backgroundOpacityInput = byId('pdfPageNumberBackgroundOpacity');
  const paddingInput = byId('pdfPageNumberPadding');
  const borderColorInput = byId('pdfPageNumberBorderColor');
  const borderWidthInput = byId('pdfPageNumberBorderWidth');
  const settingStatus = byId('pdfPageNumberSettingStatus');
  const outputNameInput = byId('pdfPageNumberOutputName');
  const exportButton = byId('pdfPageNumberExport');
  const processMask = byId('pdfPageNumberProcessMask');
  const processText = byId('pdfPageNumberProcessText');
  const processValue = byId('pdfPageNumberProcessValue');
  const processFill = byId('pdfPageNumberProcessFill');
  const processCancel = byId('pdfPageNumberProcessCancel');
  const successOverlay = byId('pdfPageNumberSuccessOverlay');
  const successMeta = byId('pdfPageNumberSuccessMeta');
  const successCount = byId('pdfPageNumberSuccessCount');
  const successPath = byId('pdfPageNumberSuccessPath');
  const successOpenFolder = byId('pdfPageNumberSuccessOpenFolder');
  const successOk = byId('pdfPageNumberSuccessOk');

  if (!overlay || !pageList || !canvasStage || !previewCanvas || !exportButton) return { dispose() {} };

  const customSelectControls = enhanceToolSelects([
    scopeSelect,
    numberingModeSelect,
    numberFormatSelect,
    templatePreset
  ]);
  createIcons({ icons });
  const listeners = new AbortController();
  const listenerOptions = { signal: listeners.signal };
  let disposed = false;
  let plasmaInstance = null;
  let nativeDragUnlisten = null;
  let resizeObserver = null;
  let langUnsubscribe = () => {};
  let sources = [];
  let pages = [];
  let selectedIds = new Set();
  let currentId = null;
  let selectionAnchorId = null;
  let lastDeletedSnapshot = null;
  let sourceIdSeed = 0;
  let pageIdSeed = 0;
  let thumbObserver = null;
  let thumbQueue = [];
  let thumbActive = 0;
  let thumbEpoch = 0;
  let previewTask = null;
  let previewRequest = 0;
  let previewZoom = 1;
  let previewScale = 1;
  let previewPageWidth = 1;
  let previewPageHeight = 1;
  let dragState = null;
  let suppressClickUntil = 0;
  let operation = null;
  let operationSeed = 0;
  let lastOutputFolder = '';
  let lastOutputCount = 0;
  let lastOutputMode = 'single';
  let fontBytesPromise = null;
  let overlayReturnFocus = null;

  const getInvoke = async () => (await Promise.resolve(tauriCore)).invoke;
  const showToast = message => window.showToast?.(message);
  const hasPages = () => pages.length > 0;
  const currentPageIndex = () => pages.findIndex(page => page.id === currentId);
  const currentPage = () => pages.find(page => page.id === currentId) || null;

  function setOverlayState(visible) {
    overlay.classList.toggle('visible', visible);
    overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (visible) overlay.removeAttribute('inert');
    else overlay.setAttribute('inert', '');
  }

  function setSuccessState(visible) {
    successOverlay?.classList.toggle('visible', visible);
    successOverlay?.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (visible) successOverlay?.removeAttribute('inert');
    else successOverlay?.setAttribute('inert', '');
  }

  function setProcessState(visible) {
    processMask?.classList.toggle('visible', visible);
    processMask?.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (visible) processMask?.removeAttribute('inert');
    else processMask?.setAttribute('inert', '');
  }

  function beginOperation(type) {
    if (operation) throw new Error('Another operation is already in progress');
    operation = { id: ++operationSeed, type, cancelled: false, loadingTasks: new Set() };
    updateControls();
    return operation;
  }

  function assertOperation(active) {
    if (!active || active !== operation || active.cancelled || disposed) throw new PdfPageNumberCancelledError();
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
    processCancel && (processCancel.disabled = true);
    setProgress(0, t('home.pdfPageNumber.cancelling'));
    for (const task of operation.loadingTasks) {
      try { task.destroy(); } catch (_) {}
    }
  }

  function setProgress(percent, label) {
    const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    if (processFill) processFill.style.width = `${value}%`;
    if (processValue) processValue.textContent = `${value}%`;
    if (processText && label) processText.textContent = label;
    processMask?.querySelector('[role="progressbar"]')?.setAttribute('aria-valuenow', String(value));
  }

  async function fileSizeFor(file) {
    if (isTauri && file.path) {
      const invoke = await getInvoke();
      return Number(await invoke('get_file_size', { path: file.path }));
    }
    return Number(file.size || 0);
  }

  async function readFileBytes(file) {
    if (isTauri && file.path) {
      const invoke = await getInvoke();
      return asUint8Array(await invoke('read_file_bytes', { path: file.path }));
    }
    return new Uint8Array(await file.arrayBuffer());
  }

  function sourceName(file) {
    return String(file?.name || file?.fileName || file?.path?.split(/[\\/]/).pop() || 'document.pdf');
  }

  function loadErrorMessage(error) {
    if (isCancellation(error)) return t('home.pdfPageNumber.loadCancelled');
    if (isPasswordError(error)) return t('home.pdfPageNumber.passwordProtected');
    const detail = String(error?.message || error || '');
    if (/only pdf|pdf file is required/i.test(detail)) return t('home.pdfPageNumber.pdfOnly');
    if (/at most/i.test(detail)) return t('home.pdfPageNumber.tooManyFiles', { count: PDF_PAGE_NUMBER_LIMITS.maxFiles });
    if (/mb limit|input size/i.test(detail)) return t('home.pdfPageNumber.fileTooLarge');
    if (/page limit/i.test(detail)) return t('home.pdfPageNumber.tooManyPages', { count: PDF_PAGE_NUMBER_LIMITS.maxPages });
    return t('home.pdfPageNumber.loadFailed', { error: detail });
  }

  function exportErrorMessage(error) {
    if (isCancellation(error)) return t('home.pdfPageNumber.cancelled');
    if (isPasswordError(error)) return t('home.pdfPageNumber.passwordProtected');
    const detail = String(error?.message || error || '');
    return t('home.pdfPageNumber.exportFailed', { error: detail });
  }

  function releaseThumbs() {
    thumbEpoch += 1;
    thumbQueue = [];
    thumbObserver?.disconnect();
    thumbObserver = null;
    pageList.querySelectorAll('canvas').forEach(releaseCanvas);
  }

  function cancelPreview() {
    previewRequest += 1;
    try { previewTask?.cancel(); } catch (_) {}
    previewTask = null;
    releaseCanvas(previewCanvas);
    if (canvasWrap) canvasWrap.hidden = true;
  }

  function stopPointerDrag(commit = false) {
    if (!dragState) return;
    const state = dragState;
    dragState = null;
    state.tile?.classList.remove('is-dragging');
    overlay.classList.remove('is-page-sorting');
    try { state.handle?.releasePointerCapture?.(state.pointerId); } catch (_) {}
    if (commit && state.active) {
      const byPageId = new Map(pages.map(page => [page.id, page]));
      const ordered = Array.from(pageList.querySelectorAll('[data-page-id]'))
        .map(item => byPageId.get(item.dataset.pageId))
        .filter(Boolean);
      if (ordered.length === pages.length) pages = ordered;
      suppressClickUntil = performance.now() + 250;
      updatePageOrderLabels();
      updateControls();
      renderLivePageNumber();
    }
  }

  async function resetDocument() {
    stopPointerDrag(false);
    releaseThumbs();
    cancelPreview();
    for (const source of sources) {
      try { await source.pdfDoc?.destroy?.(); } catch (_) {}
      try { source.loadingTask?.destroy?.(); } catch (_) {}
    }
    sources = [];
    pages = [];
    selectedIds = new Set();
    currentId = null;
    selectionAnchorId = null;
    lastDeletedSnapshot = null;
    previewZoom = 1;
    pageList.replaceChildren();
    renderPageList();
    updateControls();
    renderLivePageNumber();
  }

  function openOverlay() {
    if (disposed) return;
    if (!overlay.classList.contains('visible')) overlayReturnFocus = document.activeElement;
    setOverlayState(true);
    if (plasmaBg && !plasmaInstance) plasmaInstance = initStandardToolPlasma(plasmaBg);
    customSelectControls.forEach(control => control.refresh());
    updateControls();
    requestAnimationFrame(() => {
      if (hasPages()) void renderPreview();
      safeFocus(hasPages() ? exportButton : emptyAddButton || addButton || back);
    });
  }

  function closeOverlay() {
    if (disposed) return;
    if (operation) cancelOperation();
    setSuccessState(false);
    setProcessState(false);
    setOverlayState(false);
    overlay.classList.remove('drag-over', 'is-page-sorting');
    dropZone?.classList.remove('visible');
    customSelectControls.forEach(control => control.close());
    plasmaInstance = disposeStandardToolPlasma(plasmaInstance);
    if (fileInput) fileInput.value = '';
    void resetDocument();
    const returnFocus = overlayReturnFocus;
    overlayReturnFocus = null;
    safeFocus(returnFocus);
  }

  async function loadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length || operation) return;
    const active = beginOperation('load');
    const previousState = {
      sourceCount: sources.length,
      pages: [...pages],
      selectedIds: new Set(selectedIds),
      currentId,
      selectionAnchorId,
      outputName: outputNameInput?.value || ''
    };
    setProcessState(true);
    if (processCancel) processCancel.disabled = false;
    setProgress(2, t('home.pdfPageNumber.readingFiles'));
    const staged = [];
    try {
      const sizes = [];
      for (const file of files) {
        assertOperation(active);
        sizes.push(await fileSizeFor(file));
      }
      const selection = [
        ...sources.map(source => ({ name: source.name })),
        ...files.map(file => ({ name: sourceName(file) }))
      ];
      const totalBytes = sources.reduce((sum, source) => sum + source.size, 0) + sizes.reduce((sum, size) => sum + size, 0);
      assertPdfPageNumberSelection(selection, totalBytes);
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const wasmUrl = new URL('assets/', document.baseURI).href;
      let stagedPages = 0;
      for (let index = 0; index < files.length; index += 1) {
        assertOperation(active);
        setProgress(5 + Math.round((index / files.length) * 52), t('home.pdfPageNumber.readingFile', {
          current: index + 1,
          total: files.length
        }));
        const bytes = await readFileBytes(files[index]);
        if (!bytes.length) throw new Error('Invalid PDF input size');
        const loadingTask = pdfjs.getDocument({ data: bytes.slice(), wasmUrl, useWasm: true });
        active.loadingTasks.add(loadingTask);
        let pdfDoc;
        try {
          pdfDoc = await loadingTask.promise;
        } finally {
          active.loadingTasks.delete(loadingTask);
        }
        assertOperation(active);
        stagedPages += pdfDoc.numPages;
        assertPdfPageNumberPageCount(pages.length + stagedPages);
        staged.push({
          id: `pdf-page-number-source-${++sourceIdSeed}`,
          name: sourceName(files[index]),
          size: sizes[index],
          bytes,
          pdfDoc,
          loadingTask
        });
      }
      const newPages = staged.flatMap(source => Array.from({ length: source.pdfDoc.numPages }, (_, sourcePageIndex) => ({
        id: `pdf-page-number-page-${++pageIdSeed}`,
        sourceId: source.id,
        sourceName: source.name,
        sourcePageIndex,
        sourcePageCount: source.pdfDoc.numPages
      })));
      sources.push(...staged);
      pages.push(...newPages);
      if (!currentId) currentId = newPages[0]?.id || pages[0]?.id || null;
      selectedIds = new Set(currentId ? [currentId] : []);
      selectionAnchorId = currentId;
      lastDeletedSnapshot = null;
      if (outputNameInput && !outputNameInput.value.trim()) {
        outputNameInput.value = sources.length === 1
          ? sanitizePdfPageNumberBaseName(sources[0].name)
          : t('home.pdfPageNumber.defaultMergedName');
      }
      setProgress(76, t('home.pdfPageNumber.preparingPages', { count: pages.length }));
      renderPageList();
      updateControls();
      setProgress(92, t('home.pdfPageNumber.renderingPreview'));
      await renderPreview();
      assertOperation(active);
      setProgress(100, t('home.pdfPageNumber.ready'));
    } catch (error) {
      if (sources.length > previousState.sourceCount) {
        const addedSources = sources.splice(previousState.sourceCount);
        for (const source of addedSources) {
          try { await source.pdfDoc?.destroy?.(); } catch (_) {}
          try { source.loadingTask?.destroy?.(); } catch (_) {}
          source.pdfDoc = null;
          source.loadingTask = null;
        }
        pages = previousState.pages;
        selectedIds = previousState.selectedIds;
        currentId = previousState.currentId;
        selectionAnchorId = previousState.selectionAnchorId;
        if (outputNameInput) outputNameInput.value = previousState.outputName;
        renderPageList();
        updateControls();
        if (hasPages()) void renderPreview();
      }
      for (const source of staged) {
        if (sources.includes(source)) continue;
        try { await source.pdfDoc?.destroy?.(); } catch (_) {}
        try { source.loadingTask?.destroy?.(); } catch (_) {}
      }
      if (!isCancellation(error)) showToast(loadErrorMessage(error));
    } finally {
      finishOperation(active);
      if (fileInput) fileInput.value = '';
    }
  }

  function pageSource(page) {
    return sources.find(source => source.id === page?.sourceId) || null;
  }

  function createPageItem(page, index) {
    const item = document.createElement('article');
    item.className = 'pdf-page-number-page-item';
    item.dataset.pageId = page.id;
    item.tabIndex = 0;
    item.setAttribute('aria-label', t('home.pdfPageNumber.pageAria', { page: index + 1, name: page.sourceName }));
    item.classList.toggle('is-current', page.id === currentId);
    item.classList.toggle('is-selected', selectedIds.has(page.id));
    item.innerHTML = `
      <button class="pdf-page-number-check" type="button" aria-label="${t('home.pdfPageNumber.toggleSelection')}">
        <i data-lucide="check"></i>
      </button>
      <div class="pdf-page-number-thumb-frame">
        <canvas class="pdf-page-number-thumb" aria-hidden="true"></canvas>
        <span class="pdf-page-number-thumb-skeleton"></span>
        <span class="pdf-page-number-thumb-error">${t('home.pdfPageNumber.thumbnailError')}</span>
      </div>
      <div class="pdf-page-number-page-copy">
        <strong data-order-label>${t('home.pdfPageNumber.pageLabel', { page: index + 1 })}</strong>
        <span title="${page.sourceName}">${page.sourceName}</span>
        <small>${t('home.pdfPageNumber.sourcePageLabel', { page: page.sourcePageIndex + 1 })}</small>
      </div>
      <div class="pdf-page-number-page-actions">
        <button class="pdf-page-number-drag" type="button" aria-label="${t('home.pdfPageNumber.dragPage')}"><i data-lucide="grip-vertical"></i></button>
        <button class="pdf-page-number-delete" type="button" aria-label="${t('home.pdfPageNumber.deletePage')}"><i data-lucide="trash-2"></i></button>
      </div>`;
    item.addEventListener('click', event => {
      if (performance.now() < suppressClickUntil || event.target.closest('button')) return;
      selectPageFromEvent(page.id, event);
    }, listenerOptions);
    item.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      selectPageFromEvent(page.id, event);
    }, listenerOptions);
    item.querySelector('.pdf-page-number-check')?.addEventListener('click', event => {
      event.stopPropagation();
      togglePageSelection(page.id);
    }, listenerOptions);
    item.querySelector('.pdf-page-number-delete')?.addEventListener('click', event => {
      event.stopPropagation();
      deletePages(new Set([page.id]));
    }, listenerOptions);
    item.querySelector('.pdf-page-number-drag')?.addEventListener('pointerdown', event => beginPointerDrag(event, page.id), listenerOptions);
    return item;
  }

  function renderPageList() {
    releaseThumbs();
    const fragment = document.createDocumentFragment();
    pages.forEach((page, index) => fragment.appendChild(createPageItem(page, index)));
    pageList.replaceChildren(fragment);
    startThumbObserver();
    createIcons({ icons });
  }

  function updatePageItems() {
    pageList.querySelectorAll('[data-page-id]').forEach(item => {
      item.classList.toggle('is-current', item.dataset.pageId === currentId);
      item.classList.toggle('is-selected', selectedIds.has(item.dataset.pageId));
    });
  }

  function updatePageOrderLabels() {
    pages.forEach((page, index) => {
      const item = pageList.querySelector(`[data-page-id="${CSS.escape(page.id)}"]`);
      const label = item?.querySelector('[data-order-label]');
      if (label) label.textContent = t('home.pdfPageNumber.pageLabel', { page: index + 1 });
    });
    updatePageItems();
  }

  function startThumbObserver() {
    if (!pages.length) return;
    thumbObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        thumbObserver?.unobserve(entry.target);
        enqueueThumbnail(entry.target.dataset.pageId);
      });
    }, { root: pageList, rootMargin: '220px 0px' });
    pageList.querySelectorAll('[data-page-id]').forEach(item => thumbObserver.observe(item));
  }

  function enqueueThumbnail(pageId) {
    const item = pageList.querySelector(`[data-page-id="${CSS.escape(pageId)}"]`);
    if (!item || item.dataset.thumbState) return;
    item.dataset.thumbState = 'queued';
    thumbQueue.push({ pageId, epoch: thumbEpoch });
    pumpThumbnails();
  }

  function pumpThumbnails() {
    while (thumbActive < THUMB_CONCURRENCY && thumbQueue.length) {
      const job = thumbQueue.shift();
      thumbActive += 1;
      void renderThumbnail(job).finally(() => {
        thumbActive -= 1;
        pumpThumbnails();
      });
    }
  }

  async function renderThumbnail({ pageId, epoch }) {
    const page = pages.find(candidate => candidate.id === pageId);
    const item = pageList.querySelector(`[data-page-id="${CSS.escape(pageId)}"]`);
    const canvas = item?.querySelector('canvas');
    if (!page || !item || !canvas || epoch !== thumbEpoch) return;
    try {
      const proxy = await pageSource(page)?.pdfDoc?.getPage(page.sourcePageIndex + 1);
      if (!proxy || epoch !== thumbEpoch) return;
      const base = proxy.getViewport({ scale: 1 });
      const scale = Math.min(THUMB_WIDTH / base.width, THUMB_HEIGHT / base.height);
      const viewport = proxy.getViewport({ scale });
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(viewport.width * dpr));
      canvas.height = Math.max(1, Math.round(viewport.height * dpr));
      canvas.style.width = `${Math.round(viewport.width)}px`;
      canvas.style.height = `${Math.round(viewport.height)}px`;
      await proxy.render({ canvasContext: canvas.getContext('2d'), viewport, transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0] }).promise;
      if (epoch !== thumbEpoch) return;
      item.dataset.thumbState = 'ready';
      item.classList.add('is-thumb-ready');
      proxy.cleanup?.();
    } catch (error) {
      if (epoch !== thumbEpoch || isCancellation(error)) return;
      item.dataset.thumbState = 'error';
      item.classList.add('has-thumb-error');
    }
  }

  function selectPageFromEvent(pageId, event) {
    const index = pages.findIndex(page => page.id === pageId);
    if (index < 0) return;
    currentId = pageId;
    if (event.shiftKey && selectionAnchorId) {
      const anchor = pages.findIndex(page => page.id === selectionAnchorId);
      if (anchor >= 0) {
        const next = new Set(event.ctrlKey || event.metaKey ? selectedIds : []);
        for (let i = Math.min(anchor, index); i <= Math.max(anchor, index); i += 1) next.add(pages[i].id);
        selectedIds = next;
      }
    } else if (event.ctrlKey || event.metaKey) {
      if (selectedIds.has(pageId)) selectedIds.delete(pageId);
      else selectedIds.add(pageId);
      selectionAnchorId = pageId;
    } else {
      selectedIds = new Set([pageId]);
      selectionAnchorId = pageId;
    }
    updatePageItems();
    updateControls();
    void renderPreview();
  }

  function togglePageSelection(pageId) {
    if (selectedIds.has(pageId)) selectedIds.delete(pageId);
    else selectedIds.add(pageId);
    currentId = pageId;
    selectionAnchorId = pageId;
    updatePageItems();
    updateControls();
    void renderPreview();
  }

  function deletePages(ids) {
    const removing = new Set([...ids].filter(id => pages.some(page => page.id === id)));
    if (!removing.size || operation) return;
    if (pages.length - removing.size < 1) {
      showToast(t('home.pdfPageNumber.cannotDeleteAll'));
      return;
    }
    const previousIndex = Math.max(0, currentPageIndex());
    lastDeletedSnapshot = {
      pages: [...pages],
      selectedIds: new Set(selectedIds),
      currentId,
      selectionAnchorId
    };
    pages = pages.filter(page => !removing.has(page.id));
    selectedIds = new Set([...selectedIds].filter(id => !removing.has(id)));
    if (!pages.some(page => page.id === currentId)) currentId = pages[Math.min(previousIndex, pages.length - 1)]?.id || pages[0].id;
    if (!selectedIds.size && currentId) selectedIds.add(currentId);
    selectionAnchorId = currentId;
    renderPageList();
    updateControls();
    void renderPreview();
  }

  function undoDelete() {
    if (!lastDeletedSnapshot || operation) return;
    pages = lastDeletedSnapshot.pages;
    selectedIds = lastDeletedSnapshot.selectedIds;
    currentId = lastDeletedSnapshot.currentId;
    selectionAnchorId = lastDeletedSnapshot.selectionAnchorId;
    lastDeletedSnapshot = null;
    renderPageList();
    updateControls();
    void renderPreview();
  }

  function beginPointerDrag(event, pageId) {
    if (event.button !== 0 || operation) return;
    const item = event.currentTarget.closest('[data-page-id]');
    if (!item) return;
    event.preventDefault();
    event.stopPropagation();
    stopPointerDrag(false);
    dragState = {
      pageId,
      tile: item,
      handle: event.currentTarget,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false
    };
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch (_) {}
  }

  function handlePointerMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
    if (!dragState.active && distance < 5) return;
    if (!dragState.active) {
      dragState.active = true;
      dragState.tile.classList.add('is-dragging');
      overlay.classList.add('is-page-sorting');
    }
    event.preventDefault();
    const rect = pageList.getBoundingClientRect();
    if (event.clientY < rect.top + 42) pageList.scrollTop -= 12;
    else if (event.clientY > rect.bottom - 42) pageList.scrollTop += 12;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-page-id]');
    if (!target || target === dragState.tile || !pageList.contains(target)) return;
    const targetRect = target.getBoundingClientRect();
    const after = event.clientY > targetRect.top + targetRect.height / 2;
    if (after) pageList.insertBefore(dragState.tile, target.nextSibling);
    else pageList.insertBefore(dragState.tile, target);
  }

  function handlePointerUp(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    stopPointerDrag(true);
  }

  async function renderPreview() {
    const page = currentPage();
    cancelPreview();
    const request = previewRequest;
    updateControls();
    if (!page) {
      renderLivePageNumber();
      return;
    }
    const source = pageSource(page);
    if (!source?.pdfDoc) return;
    try {
      const proxy = await source.pdfDoc.getPage(page.sourcePageIndex + 1);
      if (request !== previewRequest || disposed) return;
      const base = proxy.getViewport({ scale: 1 });
      const availableWidth = Math.max(240, canvasScroll.clientWidth - 72);
      const availableHeight = Math.max(260, canvasScroll.clientHeight - 72);
      const fitScale = Math.min(availableWidth / base.width, availableHeight / base.height, 1.55);
      previewScale = Math.max(0.08, fitScale * previewZoom);
      previewPageWidth = base.width;
      previewPageHeight = base.height;
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
      renderLivePageNumber();
      if (previewStatus) previewStatus.textContent = t('home.pdfPageNumber.previewReady', { name: page.sourceName, page: page.sourcePageIndex + 1 });
    } catch (error) {
      if (request !== previewRequest || isCancellation(error)) return;
      console.error('[PDF Page Number] preview failed:', error);
      if (previewStatus) previewStatus.textContent = t('home.pdfPageNumber.previewFailed');
    }
  }

  function settingsFromControls() {
    const position = overlay.querySelector('.pdf-page-number-position.is-active')?.dataset.position || PDF_PAGE_NUMBER_DEFAULTS.position;
    const backgroundStyle = overlay.querySelector('.pdf-page-number-style.is-active')?.dataset.style || PDF_PAGE_NUMBER_DEFAULTS.backgroundStyle;
    return normalizePdfPageNumberSettings({
      scope: scopeSelect?.value,
      customRange: rangeInput?.value,
      numberingMode: numberingModeSelect?.value,
      start: startInput?.value,
      step: stepInput?.value,
      skipFirst: skipInput?.value,
      template: templateInput?.value,
      numberFormat: numberFormatSelect?.value,
      position,
      margin: marginInput?.value,
      offsetX: offsetXInput?.value,
      offsetY: offsetYInput?.value,
      fontSize: fontSizeInput?.value,
      textColor: textColorInput?.value,
      textOpacity: textOpacityInput?.value,
      backgroundStyle,
      backgroundColor: backgroundColorInput?.value,
      backgroundOpacity: backgroundOpacityInput?.value,
      padding: paddingInput?.value,
      borderColor: borderColorInput?.value,
      borderWidth: borderWidthInput?.value
    });
  }

  function planFromControls() {
    return buildPdfPageNumberPlan(pages, { ...settingsFromControls(), selectedIds });
  }

  function renderLivePageNumber() {
    if (!hasPages() || canvasWrap?.hidden) {
      liveLayer && (liveLayer.hidden = true);
      return;
    }
    let plan;
    try {
      plan = planFromControls();
      settingStatus?.classList.remove('is-error');
    } catch (error) {
      if (settingStatus) {
        settingStatus.textContent = t('home.pdfPageNumber.rangeInvalid');
        settingStatus.classList.add('is-error');
      }
      liveLayer && (liveLayer.hidden = true);
      return;
    }
    const index = currentPageIndex();
    const entry = plan[index];
    const appliedCount = plan.filter(item => item.applied).length;
    if (settingStatus) settingStatus.textContent = t('home.pdfPageNumber.applySummary', { applied: appliedCount, total: pages.length });
    if (!entry?.applied) {
      liveLayer && (liveLayer.hidden = true);
      return;
    }
    const settings = settingsFromControls();
    const measureCanvas = document.createElement('canvas');
    const context = measureCanvas.getContext('2d');
    context.font = `500 ${settings.fontSize}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
    const textWidth = Math.max(1, context.measureText(entry.text).width);
    const textHeight = settings.fontSize * 1.15;
    const layout = calculatePdfPageNumberLayout({
      pageWidth: previewPageWidth,
      pageHeight: previewPageHeight,
      textWidth,
      textHeight,
      settings
    });
    const scale = previewScale;
    liveLayer.hidden = false;
    liveLayer.style.width = `${previewPageWidth * scale}px`;
    liveLayer.style.height = `${previewPageHeight * scale}px`;
    liveText.textContent = entry.text;
    liveText.style.left = `${layout.text.x * scale}px`;
    liveText.style.top = `${(previewPageHeight - layout.text.y - layout.text.height) * scale}px`;
    liveText.style.width = `${layout.text.width * scale + 2}px`;
    liveText.style.height = `${layout.text.height * scale + 2}px`;
    liveText.style.fontSize = `${settings.fontSize * scale}px`;
    liveText.style.lineHeight = `${layout.text.height * scale}px`;
    liveText.style.color = settings.textColor;
    liveText.style.opacity = String(settings.textOpacity);
    if (layout.background) {
      liveBackground.hidden = false;
      liveBackground.style.left = `${layout.background.x * scale}px`;
      liveBackground.style.top = `${(previewPageHeight - layout.background.y - layout.background.height) * scale}px`;
      liveBackground.style.width = `${layout.background.width * scale}px`;
      liveBackground.style.height = `${layout.background.height * scale}px`;
      liveBackground.style.background = settings.backgroundColor;
      liveBackground.style.opacity = String(settings.backgroundOpacity);
      liveBackground.style.border = settings.borderWidth > 0 ? `${settings.borderWidth * scale}px solid ${settings.borderColor}` : '0';
      liveBackground.style.borderRadius = layout.background.style === 'circle'
        ? '50%'
        : layout.background.style === 'pill'
          ? '999px'
          : layout.background.style === 'label'
            ? `${Math.min(5, settings.padding * 0.55) * scale}px`
            : '0';
    } else {
      liveBackground.hidden = true;
    }
  }

  function syncRangeOutputs() {
    overlay.querySelectorAll('input[type="range"][data-output]').forEach(input => {
      const output = byId(input.dataset.output);
      if (!output) return;
      const suffix = input.dataset.suffix || '';
      const value = Number(input.value);
      output.textContent = input.dataset.percent === 'true' ? `${Math.round(value * 100)}%` : `${input.value}${suffix}`;
    });
  }

  function updateControls() {
    const busy = Boolean(operation);
    const index = currentPageIndex();
    const allSelected = pages.length > 0 && selectedIds.size === pages.length;
    if (pageCount) pageCount.textContent = t('home.pdfPageNumber.totalPages', { count: pages.length });
    if (selectedCount) selectedCount.textContent = t('home.pdfPageNumber.selectedPages', { count: selectedIds.size });
    if (pageIndicator) pageIndicator.textContent = hasPages()
      ? t('home.pdfPageNumber.pageIndicator', { current: index + 1, total: pages.length })
      : t('home.pdfPageNumber.noDocument');
    if (selectAllButton) {
      selectAllButton.disabled = busy || !hasPages();
      selectAllButton.title = t(allSelected ? 'home.pdfPageNumber.clearSelection' : 'home.pdfPageNumber.selectAll');
      selectAllButton.setAttribute('aria-label', selectAllButton.title);
    }
    if (deleteSelectedButton) deleteSelectedButton.disabled = busy || selectedIds.size === 0;
    if (undoDeleteButton) undoDeleteButton.disabled = busy || !lastDeletedSnapshot;
    if (prevButton) prevButton.disabled = busy || index <= 0;
    if (nextButton) nextButton.disabled = busy || index < 0 || index >= pages.length - 1;
    if (zoomOutButton) zoomOutButton.disabled = !hasPages() || previewZoom <= PREVIEW_MIN_ZOOM;
    if (zoomInButton) zoomInButton.disabled = !hasPages() || previewZoom >= PREVIEW_MAX_ZOOM;
    if (fitButton) fitButton.disabled = !hasPages();
    if (zoomValue) zoomValue.textContent = `${Math.round(previewZoom * 100)}%`;
    if (addButton) addButton.disabled = busy || sources.length >= PDF_PAGE_NUMBER_LIMITS.maxFiles;
    if (emptyAddButton) emptyAddButton.disabled = busy;
    exportButton.disabled = busy || !hasPages();
    overlay.querySelectorAll('.pdf-page-number-settings input, .pdf-page-number-settings select, .pdf-page-number-settings button').forEach(control => {
      if (control === exportButton) return;
      control.disabled = busy || !hasPages();
    });
    if (rangeField) rangeField.hidden = scopeSelect?.value !== 'custom';
    if (templateField) templateField.hidden = templatePreset?.value !== 'custom';
    if (emptyState) emptyState.hidden = hasPages();
    if (canvasWrap) canvasWrap.hidden = !hasPages() || previewCanvas.width < 1;
    pageList.classList.toggle('is-empty', !hasPages());
    syncRangeOutputs();
    if (hasPages()) renderLivePageNumber();
    else if (settingStatus) settingStatus.textContent = t('home.pdfPageNumber.settingEmpty');
    customSelectControls.forEach(control => control.refresh());
  }

  function selectAdjacent(delta) {
    const index = currentPageIndex();
    const target = pages[index + delta];
    if (!target) return;
    currentId = target.id;
    selectionAnchorId = target.id;
    updatePageItems();
    updateControls();
    pageList.querySelector(`[data-page-id="${CSS.escape(target.id)}"]`)?.scrollIntoView({ block: 'nearest' });
    void renderPreview();
  }

  function changeZoom(factor) {
    previewZoom = Math.min(PREVIEW_MAX_ZOOM, Math.max(PREVIEW_MIN_ZOOM, previewZoom * factor));
    updateControls();
    void renderPreview();
  }

  function handleSettingsChange(event) {
    const target = event.target;
    if (target === scopeSelect) rangeField.hidden = scopeSelect.value !== 'custom';
    if (target === templatePreset) {
      const templates = {
        page: '{page}',
        total: '{page} / {total}',
        chinese: '第 {page} 页',
        dash: '— {page} —'
      };
      if (templates[templatePreset.value]) templateInput.value = templates[templatePreset.value];
      templateField.hidden = templatePreset.value !== 'custom';
    }
    syncRangeOutputs();
    updateControls();
    renderLivePageNumber();
  }

  function outputMode() {
    return overlay.querySelector('input[name="pdfPageNumberOutputMode"]:checked')?.value === 'zip' ? 'zip' : 'single';
  }

  async function ensureFontBytes() {
    if (!fontBytesPromise) {
      fontBytesPromise = fetch('/assets/fonts/NotoSansSC-Regular.ttf')
        .then(response => {
          if (!response.ok) throw new Error('font fetch failed');
          return response.arrayBuffer();
        })
        .then(buffer => new Uint8Array(buffer))
        .catch(error => {
          fontBytesPromise = null;
          throw error;
        });
    }
    return await fontBytesPromise;
  }

  async function writeOutput(bytes, directory, fileName, mimeType) {
    if (isTauri) {
      const invoke = await getInvoke();
      return await invoke('write_unique_file_bytes', {
        directory,
        fileName,
        bytes: Array.from(bytes)
      });
    }
    downloadBlob(new Blob([bytes], { type: mimeType }), fileName);
    return `${directory}/${fileName}`;
  }

  async function exportDocument() {
    if (!hasPages() || operation) return;
    let plan;
    try {
      plan = planFromControls();
    } catch (_) {
      showToast(t('home.pdfPageNumber.rangeInvalid'));
      rangeInput?.focus();
      return;
    }
    if (!plan.some(item => item.applied)) {
      showToast(t('home.pdfPageNumber.noAppliedPages'));
      return;
    }
    const active = beginOperation('export');
    setProcessState(true);
    if (processCancel) processCancel.disabled = false;
    setProgress(2, t('home.pdfPageNumber.preparingExport'));
    try {
      const settings = { ...settingsFromControls(), selectedIds };
      const fontBytes = await ensureFontBytes();
      assertOperation(active);
      const numberedBytes = await exportPdfWithPageNumbers({
        sources: sources.map(source => ({ id: source.id, bytes: source.bytes })),
        pages,
        settings,
        fontBytes,
        shouldCancel: () => active.cancelled || operation !== active || disposed,
        onProgress: update => setProgress(6 + Math.round(update.percent * 0.6), t('home.pdfPageNumber.numberingPage', {
          current: update.completed,
          total: update.total
        }))
      });
      assertOperation(active);
      const baseName = sanitizePdfPageNumberBaseName(outputNameInput?.value || sources[0]?.name || 'document');
      const mode = outputMode();
      const outputDir = await getOutputDir('PDF_Page_Number');
      assertOperation(active);
      let outputBytes = numberedBytes;
      let fileName = createPdfPageNumberFileName(baseName, 'pdf');
      let mimeType = 'application/pdf';
      if (mode === 'zip') {
        setProgress(68, t('home.pdfPageNumber.splittingPages'));
        const split = await splitNumberedPdfPages({
          bytes: numberedBytes,
          baseName,
          shouldCancel: () => active.cancelled || operation !== active || disposed,
          onProgress: update => setProgress(68 + Math.round((update.completed / update.total) * 18), t('home.pdfPageNumber.splittingProgress', update))
        });
        assertOperation(active);
        const zip = new JSZip();
        split.forEach(file => zip.file(file.fileName, file.bytes));
        outputBytes = await zip.generateAsync({
          type: 'uint8array',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 }
        }, metadata => {
          assertOperation(active);
          setProgress(86 + Math.round(metadata.percent * 0.1), t('home.pdfPageNumber.packingZip'));
        });
        fileName = createPdfPageNumberFileName(baseName, 'zip');
        mimeType = 'application/zip';
      }
      assertOperation(active);
      setProgress(97, t('home.pdfPageNumber.writingOutput'));
      await writeOutput(outputBytes, outputDir, fileName, mimeType);
      assertOperation(active);
      setProgress(100, t('home.pdfPageNumber.exportComplete'));
      lastOutputFolder = outputDir;
      lastOutputCount = mode === 'zip' ? pages.length : 1;
      lastOutputMode = mode;
      renderSuccess();
      setSuccessState(true);
      safeFocus(successOk || successOpenFolder);
    } catch (error) {
      if (!isCancellation(error)) {
        console.error('[PDF Page Number] export failed:', error);
        showToast(exportErrorMessage(error));
      }
    } finally {
      finishOperation(active);
    }
  }

  function renderSuccess() {
    if (successMeta) successMeta.textContent = t(lastOutputMode === 'zip'
      ? 'home.pdfPageNumber.successZipMeta'
      : 'home.pdfPageNumber.successPdfMeta');
    if (successCount) successCount.textContent = t('home.pdfPageNumber.outputCountValue', { count: lastOutputCount });
    if (successPath) successPath.textContent = displayFilesystemPath(lastOutputFolder || '~/Downloads');
    if (successOpenFolder) successOpenFolder.style.display = isTauri ? '' : 'none';
  }

  async function openOutputFolder() {
    if (!isTauri || !lastOutputFolder) return;
    try {
      const invoke = await getInvoke();
      await invoke('open_path', { path: lastOutputFolder });
    } catch (error) {
      console.error('[PDF Page Number] open output folder failed:', error);
      showToast(t('home.pdfPageNumber.openFolderFailed'));
    }
  }

  function showDropZone() {
    if (operation || dragState?.active) return;
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
      else closeOverlay();
      return;
    }
    const tag = event.target?.tagName?.toLowerCase();
    if (['input', 'select', 'textarea'].includes(tag)) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); selectAdjacent(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); selectAdjacent(1); }
    if (event.key === 'Delete' && selectedIds.size) { event.preventDefault(); deletePages(selectedIds); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      selectedIds = new Set(pages.map(page => page.id));
      updatePageItems();
      updateControls();
    }
  }

  back?.addEventListener('click', closeOverlay, listenerOptions);
  addButton?.addEventListener('click', () => fileInput?.click(), listenerOptions);
  emptyAddButton?.addEventListener('click', () => fileInput?.click(), listenerOptions);
  fileInput?.addEventListener('change', event => void loadFiles(event.target.files), listenerOptions);
  selectAllButton?.addEventListener('click', () => {
    selectedIds = selectedIds.size === pages.length ? new Set() : new Set(pages.map(page => page.id));
    updatePageItems();
    updateControls();
  }, listenerOptions);
  deleteSelectedButton?.addEventListener('click', () => deletePages(selectedIds), listenerOptions);
  undoDeleteButton?.addEventListener('click', undoDelete, listenerOptions);
  prevButton?.addEventListener('click', () => selectAdjacent(-1), listenerOptions);
  nextButton?.addEventListener('click', () => selectAdjacent(1), listenerOptions);
  zoomOutButton?.addEventListener('click', () => changeZoom(0.86), listenerOptions);
  zoomInButton?.addEventListener('click', () => changeZoom(1.16), listenerOptions);
  fitButton?.addEventListener('click', () => { previewZoom = 1; updateControls(); void renderPreview(); }, listenerOptions);
  exportButton?.addEventListener('click', () => void exportDocument(), listenerOptions);
  processCancel?.addEventListener('click', cancelOperation, listenerOptions);
  successOk?.addEventListener('click', () => { setSuccessState(false); safeFocus(exportButton); }, listenerOptions);
  successOpenFolder?.addEventListener('click', () => void openOutputFolder(), listenerOptions);
  document.addEventListener('pointermove', handlePointerMove, { ...listenerOptions, passive: false });
  document.addEventListener('pointerup', handlePointerUp, listenerOptions);
  document.addEventListener('pointercancel', handlePointerUp, listenerOptions);
  document.addEventListener('keydown', handleKeydown, listenerOptions);
  overlay.querySelectorAll('.pdf-page-number-settings input, .pdf-page-number-settings select').forEach(control => {
    control.addEventListener('input', handleSettingsChange, listenerOptions);
    control.addEventListener('change', handleSettingsChange, listenerOptions);
  });
  overlay.querySelectorAll('.pdf-page-number-position').forEach(button => {
    button.addEventListener('click', () => {
      overlay.querySelectorAll('.pdf-page-number-position').forEach(candidate => candidate.classList.toggle('is-active', candidate === button));
      renderLivePageNumber();
    }, listenerOptions);
  });
  overlay.querySelectorAll('.pdf-page-number-style').forEach(button => {
    button.addEventListener('click', () => {
      overlay.querySelectorAll('.pdf-page-number-style').forEach(candidate => candidate.classList.toggle('is-active', candidate === button));
      renderLivePageNumber();
    }, listenerOptions);
  });

  overlay.addEventListener('dragover', event => {
    if (!isTauri && !dragState?.active) {
      event.preventDefault();
      showDropZone();
    }
  }, listenerOptions);
  overlay.addEventListener('dragleave', event => {
    if (!overlay.contains(event.relatedTarget)) hideDropZone();
  }, listenerOptions);
  overlay.addEventListener('drop', event => {
    if (isTauri || dragState?.active) return;
    event.preventDefault();
    hideDropZone();
    void loadFiles(event.dataTransfer?.files);
  }, listenerOptions);

  resizeObserver = new ResizeObserver(() => {
    if (!overlay.classList.contains('visible') || !hasPages() || operation?.type === 'load') return;
    window.clearTimeout(resizeObserver.renderTimer);
    resizeObserver.renderTimer = window.setTimeout(() => void renderPreview(), 120);
  });
  resizeObserver.observe(canvasScroll);

  if (isTauri) {
    void (async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview');
        const unlisten = await getCurrentWebview().onDragDropEvent(event => {
          if (disposed || !overlay.classList.contains('visible') || operation || dragState?.active) return;
          const payload = event.payload || {};
          if (payload.type === 'enter' || payload.type === 'over') showDropZone();
          else if (payload.type === 'leave') hideDropZone();
          else if (payload.type === 'drop') {
            hideDropZone();
            const files = Array.from(payload.paths || []).map(path => ({
              name: path.split(/[\\/]/).pop() || path,
              path,
              size: 0
            }));
            void loadFiles(files);
          }
        });
        if (disposed) unlisten();
        else nativeDragUnlisten = unlisten;
      } catch (error) {
        if (!disposed) console.error('[PDF Page Number] native drag-drop setup failed:', error);
      }
    })();
  }

  langUnsubscribe = onLangChange(() => {
    renderPageList();
    updateControls();
    customSelectControls.forEach(control => control.refresh());
    renderLivePageNumber();
    if (successOverlay?.classList.contains('visible')) renderSuccess();
  }) || (() => {});

  updateControls();
  setOverlayState(false);
  setSuccessState(false);
  setProcessState(false);

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
    setSuccessState(false);
    setProcessState(false);
    void resetDocument();
  };
  window.addEventListener('beforeunload', dispose, { ...listenerOptions, once: true });

  return { open: openOverlay, dispose };
}
