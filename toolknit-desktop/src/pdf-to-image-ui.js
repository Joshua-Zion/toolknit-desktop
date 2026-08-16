import {
  PDF_TO_IMAGE_LIMITS,
  PdfToImageError,
  assertPdfToImageInput,
  assertPdfToImagePageCount,
  planPdfToImageExport
} from './pdf-to-image-core.js';

const PREVIEW_CSS_WIDTH = 232;
const PREVIEW_CSS_HEIGHT = 300;
const PREVIEW_CONCURRENCY = 2;
const PREVIEW_RELEASE_DELAY = 1800;
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

class PdfToImageCancelledError extends Error {
  constructor() {
    super('PDF to image operation cancelled');
    this.name = 'PdfToImageCancelledError';
  }
}

function asUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) return Uint8Array.from(value);
  if (value && typeof value.length === 'number') return Uint8Array.from(value);
  throw new Error('Invalid binary response');
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Image encoding failed')),
      mimeType,
      quality == null ? undefined : quality
    );
  });
}

function releaseCanvas(canvas) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
  canvas.remove();
}

function isPasswordError(error) {
  return error?.name === 'PasswordException'
    || /password|encrypted/i.test(String(error?.message || error || ''));
}

function isRenderCancellation(error) {
  return error?.name === 'RenderingCancelledException'
    || /cancelled|canceled/i.test(String(error?.message || error || ''));
}

function errorCode(error) {
  if (error instanceof PdfToImageError) return error.code;
  const text = String(error?.message || error || '');
  const match = text.match(/pdf-to-image:([a-z0-9-]+)/i);
  return match ? match[1].replaceAll('-', '_') : '';
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function initPdfToImageTool({
  isTauri,
  t,
  onLangChange,
  pdfWorkerUrl,
  getOutputDir,
  displayFilesystemPath,
  initStandardToolPlasma,
  disposeStandardToolPlasma
}) {
  const overlay = document.getElementById('pdfToImageOverlay');
  const body = document.getElementById('pdfToImageBody');
  const plasmaBg = document.getElementById('pdfToImagePlasmaBg');
  const back = document.getElementById('pdfToImageBack');
  const cta = document.getElementById('pdfToImageCta');
  const fileInput = document.getElementById('pdfToImageFileInput');
  const dropZone = document.getElementById('pdfToImageDropZone');
  const workspace = document.getElementById('pdfToImageWorkspace');
  const workspaceClose = document.getElementById('pdfToImageWorkspaceClose');
  const workspaceStatus = document.getElementById('pdfToImageWorkspaceStatus');
  const workspaceHint = document.getElementById('pdfToImageWorkspaceHint');
  const pageStage = document.getElementById('pdfToImagePageStage');
  const pageStrip = document.getElementById('pdfToImagePageStrip');
  const selectedCount = document.getElementById('pdfToImageSelectedCount');
  const selectionMeta = document.getElementById('pdfToImageSelectionMeta');
  const selectAllBtn = document.getElementById('pdfToImageSelectAllBtn');
  const exportImagesBtn = document.getElementById('pdfToImageExportImagesBtn');
  const exportLongBtn = document.getElementById('pdfToImageExportLongBtn');
  const longImageLimitNote = workspace?.querySelector('.pdf-to-image-limit-note');
  const formatOptions = document.getElementById('pdfToImageFormatOptions');
  const clarityOptions = document.getElementById('pdfToImageClarityOptions');
  const processMask = document.getElementById('pdfToImageProcessMask');
  const processBarFill = document.getElementById('pdfToImageProcessBarFill');
  const processValue = document.getElementById('pdfToImageProcessValue');
  const processText = document.getElementById('pdfToImageProcessText');
  const processCancel = document.getElementById('pdfToImageCancel');
  const processProgress = processMask?.querySelector('[role="progressbar"]');
  const successOverlay = document.getElementById('pdfToImageSuccessOverlay');
  const successMeta = document.getElementById('pdfToImageSuccessMeta');
  const successType = document.getElementById('pdfToImageSuccessType');
  const successCount = document.getElementById('pdfToImageSuccessCount');
  const successPath = document.getElementById('pdfToImageSuccessPath');
  const successOpenFolder = document.getElementById('pdfToImageSuccessOpenFolder');
  const successOk = document.getElementById('pdfToImageSuccessOk');

  if (!overlay || !workspace || !pageStrip) return { dispose() {} };

  const listenerController = new AbortController();
  const listenerOptions = { signal: listenerController.signal };
  let plasmaInstance = null;
  let currentFile = null;
  let pdfDocument = null;
  let pdfLoadingTask = null;
  let pageStates = [];
  let previewObserver = null;
  let previewQueue = [];
  let previewActive = 0;
  let previewEpoch = 0;
  let activeOperation = null;
  let operationSequence = 0;
  let lastOutputFolder = '';
  let lastSuccess = null;
  let nativeDragUnlisten = null;
  let longExportAllowed = true;
  let disposed = false;
  let overlayReturnFocus = null;
  let successReturnFocus = null;
  let unsubscribeLangChange = () => {};

  const showToast = (message, duration = 7000) => {
    if (!disposed) window.showToast?.(message, { duration, dismissible: true });
  };

  const getInvoke = async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke;
  };

  function focusedElement() {
    return document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  function canReceiveFocus(target) {
    return Boolean(target?.isConnected
      && !target.disabled
      && !target.closest('[inert], [aria-hidden="true"]'));
  }

  function restoreFocus(target) {
    if (disposed || !canReceiveFocus(target)) return;
    requestAnimationFrame(() => {
      if (disposed || !canReceiveFocus(target)) return;
      try { target.focus({ preventScroll: true }); } catch (_) {}
    });
  }

  function focusableElements(roots) {
    const elements = [];
    const seen = new Set();
    for (const root of roots.filter(Boolean)) {
      for (const element of root.querySelectorAll(FOCUSABLE_SELECTOR)) {
        if (!(element instanceof HTMLElement) || seen.has(element)) continue;
        if (element.hidden || element.closest('[inert], [aria-hidden="true"]')) continue;
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        seen.add(element);
        elements.push(element);
      }
    }
    return elements;
  }

  function trapFocus(event, roots) {
    if (event.key !== 'Tab') return;
    const elements = focusableElements(roots);
    if (!elements.length) {
      event.preventDefault();
      return;
    }
    const first = elements[0];
    const last = elements[elements.length - 1];
    const active = focusedElement();
    if (!elements.includes(active)) {
      event.preventDefault();
      restoreFocus(event.shiftKey ? last : first);
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      restoreFocus(last);
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      restoreFocus(first);
    }
  }

  function syncInteractiveLayers() {
    const overlayVisible = overlay.classList.contains('visible');
    const workspaceVisible = workspace.classList.contains('visible');
    const processVisible = processMask?.classList.contains('visible') || false;
    const successVisible = successOverlay?.classList.contains('visible') || false;
    const modalVisible = processVisible || successVisible;
    const processInteractive = processVisible && !successVisible;

    overlay.inert = !overlayVisible || workspaceVisible || modalVisible;
    overlay.setAttribute('aria-hidden', String(!overlayVisible || workspaceVisible || modalVisible));
    if (body) body.inert = workspaceVisible;
    workspace.inert = !workspaceVisible || modalVisible;
    workspace.setAttribute('aria-hidden', String(!workspaceVisible || modalVisible));
    if (processMask) {
      processMask.inert = !processInteractive;
      processMask.setAttribute('aria-hidden', String(!processInteractive));
    }
    if (successOverlay) {
      successOverlay.inert = !successVisible;
      successOverlay.setAttribute('aria-hidden', String(!successVisible));
    }
  }

  function syncProgressLabel() {
    if (!processProgress) return;
    const key = activeOperation?.type === 'load'
      ? 'home.pdfToImageTool.loadProgressLabel'
      : 'home.pdfToImageTool.exportProgressLabel';
    processProgress.setAttribute('aria-label', t(key));
  }

  function activeFocusRoots() {
    if (successOverlay?.classList.contains('visible')) return [successOverlay];
    if (processMask?.classList.contains('visible')) return [processMask];
    if (workspace.classList.contains('visible')) return [workspace];
    if (overlay.classList.contains('visible')) return [overlay];
    return [];
  }

  function handleDocumentKeydown(event) {
    if (disposed) return;
    const roots = activeFocusRoots();
    if (!roots.length) return;
    if (event.key === 'Tab') {
      trapFocus(event, roots);
      return;
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (successOverlay?.classList.contains('visible')) {
      closeSuccess();
    } else if (processMask?.classList.contains('visible')) {
      if (!processCancel?.disabled) void cancelActiveOperation();
    } else if (workspace.classList.contains('visible')) {
      closeWorkspace();
    } else {
      closeOverlay();
    }
  }

  function selectedOption(group, fallback) {
    return group?.querySelector('button.active[data-value]')?.dataset.value || fallback;
  }

  function setOption(group, button) {
    if (!group || !button) return;
    group.querySelectorAll('button[data-value]').forEach(option => {
      const active = option === button;
      option.classList.toggle('active', active);
      option.setAttribute('aria-pressed', String(active));
    });
  }

  function assertOperation(operation) {
    if (!operation || operation.cancelled || activeOperation !== operation) {
      throw new PdfToImageCancelledError();
    }
  }

  function beginOperation(type) {
    if (activeOperation) throw new Error('pdf-to-image:busy');
    const id = ++operationSequence;
    const operation = {
      id,
      type,
      cancelled: false,
      renderTask: null,
      sessionId: '',
      jobId: `pdf-to-image-${Date.now()}-${id}`,
      nativeExportStarted: false,
      progressKey: '',
      progressParams: {},
      returnFocus: focusedElement()
    };
    activeOperation = operation;
    return operation;
  }

  function setProgress(percent, message) {
    const safePercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    if (processBarFill) processBarFill.style.width = safePercent + '%';
    if (processValue) processValue.textContent = safePercent + '%';
    if (processText && message) processText.textContent = message;
    if (processProgress) processProgress.setAttribute('aria-valuenow', String(safePercent));
  }

  function setLocalizedProgress(percent, key, params = {}) {
    if (activeOperation) {
      activeOperation.progressKey = key;
      activeOperation.progressParams = params;
    }
    setProgress(percent, t(`home.pdfToImageTool.${key}`, params));
  }

  function showProcess(key, percent = 0, params = {}) {
    setLocalizedProgress(percent, key, params);
    processMask?.classList.add('visible');
    if (processCancel) {
      processCancel.disabled = false;
      processCancel.style.display = '';
    }
    syncProgressLabel();
    syncInteractiveLayers();
    restoreFocus(processCancel);
  }

  function hideProcess() {
    processMask?.classList.remove('visible');
    if (processCancel) processCancel.disabled = false;
    setProgress(0, t('home.pdfToImageTool.preparing'));
    syncInteractiveLayers();
  }

  function endOperation(operation) {
    if (activeOperation !== operation) return;
    activeOperation = null;
    hideProcess();
    updateControls();
    syncProgressLabel();
    if (!successOverlay?.classList.contains('visible')) {
      const fallback = workspace.classList.contains('visible')
        ? pageStates.find(pageState => pageState.selected)?.selectButton || workspaceClose
        : overlay.classList.contains('visible')
          ? cta || back
          : overlayReturnFocus;
      restoreFocus(canReceiveFocus(operation.returnFocus) ? operation.returnFocus : fallback);
    }
  }

  async function cancelActiveOperation() {
    const operation = activeOperation;
    if (!operation || operation.cancelled) return;
    operation.cancelled = true;
    if (processCancel) processCancel.disabled = true;
    setLocalizedProgress(
      Number(processProgress?.getAttribute('aria-valuenow') || 0),
      'cancelling'
    );
    try { operation.renderTask?.cancel(); } catch (_) {}
    if (operation.type === 'load') {
      try { await pdfLoadingTask?.destroy(); } catch (_) {}
    }
    if (isTauri && operation.type === 'export') {
      try {
        const invoke = await getInvoke();
        await invoke('cancel_pdf_to_image', { jobId: operation.jobId });
      } catch (_) {}
    }
  }

  function openOverlay() {
    if (disposed) return;
    if (!overlay.classList.contains('visible')) overlayReturnFocus = focusedElement();
    overlay.classList.add('visible');
    if (plasmaBg && !plasmaInstance) {
      plasmaInstance = initStandardToolPlasma(plasmaBg);
    }
    syncInteractiveLayers();
    restoreFocus(cta || back);
  }

  function showDropZone() {
    if (activeOperation || workspace.classList.contains('visible')) return;
    overlay.classList.add('drag-over');
    dropZone?.classList.add('visible');
  }

  function hideDropZone() {
    overlay.classList.remove('drag-over');
    dropZone?.classList.remove('visible');
  }

  function releasePreview(pageState, markReleased = true) {
    if (!pageState) return;
    clearTimeout(pageState.releaseTimer);
    pageState.releaseTimer = null;
    if (pageState.renderTask) {
      try { pageState.renderTask.cancel(); } catch (_) {}
    }
    if (pageState.canvas) {
      releaseCanvas(pageState.canvas);
      pageState.canvas = null;
    }
    pageState.queued = false;
    pageState.frame?.classList.remove('is-ready');
    pageState.frame?.classList.toggle('is-released', markReleased);
  }

  function stopPreviewObserver(releaseAll = false) {
    previewObserver?.disconnect();
    previewObserver = null;
    previewQueue = [];
    previewEpoch++;
    for (const pageState of pageStates) {
      clearTimeout(pageState.releaseTimer);
      pageState.releaseTimer = null;
      pageState.nearby = false;
      if (pageState.renderTask) {
        try { pageState.renderTask.cancel(); } catch (_) {}
      }
      if (releaseAll) releasePreview(pageState, false);
    }
  }

  function queuePreview(pageState) {
    if (!pageState || pageState.error || pageState.canvas || pageState.renderTask || pageState.queued) return;
    pageState.queued = true;
    pageState.frame?.classList.remove('is-released');
    previewQueue.push(pageState);
    drainPreviewQueue();
  }

  async function renderPreview(pageState, epoch) {
    let page = null;
    let canvas = null;
    try {
      if (!pdfDocument || epoch !== previewEpoch || !pageState.nearby) return;
      page = await pdfDocument.getPage(pageState.pageNumber);
      if (!pdfDocument || epoch !== previewEpoch || !pageState.nearby) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const cssScale = Math.min(
        PREVIEW_CSS_WIDTH / baseViewport.width,
        PREVIEW_CSS_HEIGHT / baseViewport.height
      );
      const outputScale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      const viewport = page.getViewport({ scale: cssScale * outputScale });
      canvas = document.createElement('canvas');
      canvas.className = 'pdf-to-image-preview-canvas';
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      canvas.style.width = Math.max(1, Math.round(viewport.width / outputScale)) + 'px';
      canvas.style.height = Math.max(1, Math.round(viewport.height / outputScale)) + 'px';
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Cannot create PDF preview canvas');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const renderTask = page.render({
        canvasContext: context,
        viewport,
        background: '#ffffff'
      });
      pageState.renderTask = renderTask;
      await renderTask.promise;
      pageState.renderTask = null;
      if (!pdfDocument || epoch !== previewEpoch || !pageState.nearby) {
        releaseCanvas(canvas);
        canvas = null;
        return;
      }
      pageState.canvas = canvas;
      pageState.frame?.prepend(canvas);
      pageState.frame?.classList.remove('is-released', 'has-error');
      pageState.frame?.classList.add('is-ready');
      canvas = null;
    } catch (error) {
      pageState.renderTask = null;
      if (!isRenderCancellation(error) && epoch === previewEpoch) {
        pageState.error = true;
        pageState.frame?.classList.add('has-error');
        pageState.errorEl.textContent = t('home.pdfToImageTool.thumbnailError');
      }
    } finally {
      pageState.renderTask = null;
      if (canvas) releaseCanvas(canvas);
      try { page?.cleanup(); } catch (_) {}
      if (pdfDocument
        && epoch === previewEpoch
        && pageState.nearby
        && !pageState.canvas
        && !pageState.error) {
        queueMicrotask(() => {
          if (!disposed && pdfDocument && epoch === previewEpoch && pageState.nearby) {
            queuePreview(pageState);
          }
        });
      }
    }
  }

  function drainPreviewQueue() {
    while (previewActive < PREVIEW_CONCURRENCY && previewQueue.length) {
      const pageState = previewQueue.shift();
      if (!pageState) continue;
      pageState.queued = false;
      if (!pageState.nearby || pageState.canvas || pageState.renderTask || pageState.error) continue;
      const epoch = previewEpoch;
      previewActive++;
      renderPreview(pageState, epoch).finally(() => {
        previewActive = Math.max(0, previewActive - 1);
        drainPreviewQueue();
      });
    }
  }

  function startPreviewObserver() {
    if (!pdfDocument || !pageStates.length || !workspace.classList.contains('visible')) return;
    stopPreviewObserver(false);
    const epoch = previewEpoch;
    if (typeof IntersectionObserver !== 'function') {
      pageStates.slice(0, 12).forEach(pageState => {
        pageState.nearby = true;
        queuePreview(pageState);
      });
      return;
    }
    previewObserver = new IntersectionObserver(entries => {
      if (epoch !== previewEpoch) return;
      for (const entry of entries) {
        const pageState = pageStates[Number(entry.target.dataset.index)];
        if (!pageState) continue;
        if (entry.isIntersecting) {
          clearTimeout(pageState.releaseTimer);
          pageState.releaseTimer = null;
          pageState.nearby = true;
          queuePreview(pageState);
        } else {
          pageState.nearby = false;
          clearTimeout(pageState.releaseTimer);
          pageState.releaseTimer = setTimeout(() => {
            if (!pageState.nearby) releasePreview(pageState);
          }, PREVIEW_RELEASE_DELAY);
        }
      }
    }, {
      root: pageStage,
      rootMargin: '120px 600px',
      threshold: 0.01
    });
    pageStates.forEach(pageState => previewObserver.observe(pageState.tile));
  }

  async function releaseDocument() {
    stopPreviewObserver(true);
    const documentToDestroy = pdfDocument;
    const loadingToDestroy = pdfLoadingTask;
    pdfDocument = null;
    pdfLoadingTask = null;
    pageStates = [];
    currentFile = null;
    pageStrip.replaceChildren();
    try { await documentToDestroy?.destroy(); } catch (_) {}
    if (!documentToDestroy) {
      try { await loadingToDestroy?.destroy(); } catch (_) {}
    }
  }

  function closeWorkspace() {
    if (activeOperation) {
      showToast(t('home.pdfToImageTool.busy'));
      return;
    }
    workspace.classList.remove('visible');
    overlay.classList.remove('is-selection-flow');
    setLongExportAllowed(true);
    void releaseDocument();
    updateControls();
    syncInteractiveLayers();
    restoreFocus(cta || back);
  }

  function closeOverlay() {
    if (activeOperation) {
      showToast(t('home.pdfToImageTool.busy'));
      return;
    }
    closeSuccess(false);
    workspace.classList.remove('visible');
    overlay.classList.remove('visible', 'drag-over', 'is-selection-flow');
    setLongExportAllowed(true);
    dropZone?.classList.remove('visible');
    plasmaInstance = disposeStandardToolPlasma(plasmaInstance);
    if (fileInput) fileInput.value = '';
    void releaseDocument();
    syncInteractiveLayers();
    const returnFocus = overlayReturnFocus;
    overlayReturnFocus = null;
    restoreFocus(returnFocus);
  }

  function updatePageSelection(pageState, selected) {
    pageState.selected = selected;
    pageState.tile.classList.toggle('is-selected', selected);
    pageState.selectButton.setAttribute('aria-pressed', String(selected));
    updateControls();
  }

  function buildPageTiles(pageCount) {
    const fragment = document.createDocumentFragment();
    pageStates = Array.from({ length: pageCount }, (_, index) => {
      const pageNumber = index + 1;
      const tile = document.createElement('article');
      tile.className = 'pdf-page-workspace-tile pdf-split-workspace-tile is-selected';
      tile.dataset.index = String(index);

      const selectButton = document.createElement('button');
      selectButton.type = 'button';
      selectButton.className = 'pdf-page-workspace-page-select';
      selectButton.setAttribute('aria-pressed', 'true');
      selectButton.setAttribute('aria-label', t('home.pdfToImageTool.pageLabel', { page: pageNumber }));

      const frame = document.createElement('span');
      frame.className = 'pdf-page-workspace-frame pdf-to-image-preview-frame';

      const skeleton = document.createElement('span');
      skeleton.className = 'pdf-to-image-preview-skeleton';
      skeleton.setAttribute('aria-hidden', 'true');
      skeleton.innerHTML = '<span></span><span></span><span></span><span></span><span></span>';

      const errorEl = document.createElement('span');
      errorEl.className = 'pdf-to-image-preview-error';
      errorEl.textContent = t('home.pdfToImageTool.thumbnailError');

      const pageIndex = document.createElement('span');
      pageIndex.className = 'pdf-page-workspace-index';
      pageIndex.textContent = String(pageNumber);

      const check = document.createElement('span');
      check.className = 'pdf-page-workspace-check';
      check.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.2 4.2L19 6.8"></path></svg>';

      frame.append(skeleton, errorEl, pageIndex);
      selectButton.append(frame, check);
      tile.appendChild(selectButton);
      fragment.appendChild(tile);

      const pageState = {
        pageNumber,
        selected: true,
        tile,
        selectButton,
        frame,
        errorEl,
        canvas: null,
        renderTask: null,
        releaseTimer: null,
        nearby: false,
        queued: false,
        error: false
      };
      selectButton.addEventListener('click', () => {
        if (!activeOperation) updatePageSelection(pageState, !pageState.selected);
      }, listenerOptions);
      return pageState;
    });
    pageStrip.replaceChildren(fragment);
    updateControls();
  }

  function applyClarityHints() {
    const hintKeys = {
      standard: 'home.pdfToImageTool.clarityStandardHint',
      high: 'home.pdfToImageTool.clarityHighHint',
      print: 'home.pdfToImageTool.clarityPrintHint'
    };
    clarityOptions?.querySelectorAll('button[data-value]').forEach(button => {
      const key = hintKeys[button.dataset.value];
      if (key) button.title = t(key);
    });
  }

  function setLongExportAllowed(allowed = true) {
    longExportAllowed = allowed !== false;
    if (exportLongBtn) {
      exportLongBtn.hidden = !longExportAllowed;
      exportLongBtn.setAttribute('aria-hidden', String(!longExportAllowed));
    }
    if (longImageLimitNote) longImageLimitNote.hidden = !longExportAllowed;
    updateControls();
  }

  function updateControls() {
    const total = pageStates.length;
    const selected = pageStates.filter(pageState => pageState.selected).length;
    const allSelected = total > 0 && selected === total;
    const longImages = longExportAllowed && selected > 0
      ? Math.ceil(selected / PDF_TO_IMAGE_LIMITS.maxPagesPerLongImage)
      : 0;
    const exceedsLongLimit = longExportAllowed && selected > PDF_TO_IMAGE_LIMITS.maxLongPages;
    const busy = Boolean(activeOperation);

    if (workspaceStatus) workspaceStatus.textContent = t('home.pdfToImageTool.readyStatus');
    if (workspaceHint) {
      workspaceHint.textContent = t('home.pdfToImageTool.workspaceHint', {
        name: currentFile?.name || ''
      });
    }
    if (selectedCount) {
      selectedCount.textContent = t('home.pdfToImageTool.selectedCount', { count: selected });
    }
    if (selectionMeta) {
      const statusKey = !longExportAllowed
        ? 'home.pdfToImageTool.selectionStatusIndividual'
        : exceedsLongLimit
          ? 'home.pdfToImageTool.selectionStatusLongLimit'
          : 'home.pdfToImageTool.selectionStatus';
      selectionMeta.textContent = t(statusKey, {
        selected,
        total,
        longImages,
        limit: PDF_TO_IMAGE_LIMITS.maxLongPages
      });
    }
    if (selectAllBtn) {
      selectAllBtn.textContent = t(
        allSelected ? 'home.pdfToImageTool.clearSelection' : 'home.pdfToImageTool.selectAll'
      );
      selectAllBtn.disabled = busy || total === 0;
    }
    if (exportImagesBtn) exportImagesBtn.disabled = busy || selected === 0;
    if (exportLongBtn) {
      exportLongBtn.disabled = !longExportAllowed || busy || selected === 0 || exceedsLongLimit;
      exportLongBtn.title = exceedsLongLimit
        ? t('home.pdfToImageTool.longImageSelectionLimit')
        : '';
    }
    formatOptions?.querySelectorAll('button').forEach(button => { button.disabled = busy; });
    clarityOptions?.querySelectorAll('button').forEach(button => { button.disabled = busy; });
    pageStates.forEach(pageState => {
      pageState.selectButton.disabled = busy;
      pageState.selectButton.setAttribute(
        'aria-label',
        t('home.pdfToImageTool.pageLabel', { page: pageState.pageNumber })
      );
      pageState.errorEl.textContent = t('home.pdfToImageTool.thumbnailError');
    });
    applyClarityHints();
  }

  function messageForError(error, phase) {
    if (error instanceof PdfToImageCancelledError || errorCode(error) === 'cancelled') {
      return t(`home.pdfToImageTool.${phase === 'load' ? 'loadCancelled' : 'cancelled'}`);
    }
    if (isPasswordError(error)) return t('home.pdfToImageTool.passwordProtected');
    const code = errorCode(error);
    const mapped = {
      single_file_required: 'singlePdfOnly',
      invalid_pdf: 'invalidPdf',
      pdf_too_large: 'fileTooLarge',
      input_too_large: 'fileTooLarge',
      too_many_pages: 'tooManyPages',
      empty_pdf: 'emptyPdf',
      invalid_selection: 'noSelection',
      too_many_long_pages: 'longImageSelectionLimit',
      page_too_large: 'pageTooLarge',
      output_too_large: 'pageTooLarge',
      output_too_large_for_memory: 'pageTooLarge',
      session_too_large: 'writeFailed',
      page_write_failed: 'writeFailed',
      output_path: 'writeFailed',
      publish_failed: 'writeFailed',
      encode_failed: 'writeFailed',
      busy: 'busy'
    };
    if (mapped[code]) return t('home.pdfToImageTool.' + mapped[code]);
    const detail = String(error?.message || error || '');
    if (/another file conversion is already in progress/i.test(detail)) {
      return t('home.pdfToImageTool.busy');
    }
    return t(
      phase === 'load' ? 'home.pdfToImageTool.loadFailed' : 'home.pdfToImageTool.exportFailed',
      { error: detail }
    );
  }

  async function fileSizeFor(file) {
    if (isTauri && file.path) {
      const invoke = await getInvoke();
      return Number(await invoke('get_file_size', { path: file.path }));
    }
    return Number(file.size || 0);
  }

  async function readPdfBytes(file) {
    if (isTauri && file.path) {
      const invoke = await getInvoke();
      return asUint8Array(await invoke('read_pdf_to_image_source', { path: file.path }));
    }
    return new Uint8Array(await file.arrayBuffer());
  }

  async function acceptFile(file) {
    if (disposed || !file || activeOperation) {
      if (activeOperation) showToast(t('home.pdfToImageTool.busy'));
      return;
    }
    const name = String(file.name || '');
    if (!/\.pdf$/i.test(name)) {
      showToast(t('home.pdfToImageTool.pdfOnly'));
      return;
    }

    const operation = beginOperation('load');
    showProcess('loadingDocument', 2);
    try {
      await releaseDocument();
      assertOperation(operation);
      const size = await fileSizeFor(file);
      assertOperation(operation);
      assertPdfToImageInput([{ name }], size);
      setLocalizedProgress(10, 'loadingDocument');
      const bytes = await readPdfBytes(file);
      assertOperation(operation);
      const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
      assertOperation(operation);
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const wasmUrl = new URL('assets/', document.baseURI).href;
      pdfLoadingTask = pdfjsLib.getDocument({
        data: bytes,
        wasmUrl,
        useWasm: true
      });
      const loadedDocument = await pdfLoadingTask.promise;
      pdfDocument = loadedDocument;
      pdfLoadingTask = null;
      assertOperation(operation);
      assertPdfToImagePageCount(loadedDocument.numPages);
      currentFile = { ...file, name, size };
      setLocalizedProgress(
        82,
        'loadingPages',
        { count: loadedDocument.numPages }
      );
      buildPageTiles(loadedDocument.numPages);
      overlay.classList.add('is-selection-flow');
      workspace.classList.add('visible');
      syncInteractiveLayers();
      setLocalizedProgress(100, 'loadingPages', { count: loadedDocument.numPages });
      startPreviewObserver();
    } catch (error) {
      const cancelled = operation.cancelled || error instanceof PdfToImageCancelledError;
      await releaseDocument();
      if (!disposed) {
        showToast(
          cancelled ? t('home.pdfToImageTool.loadCancelled') : messageForError(error, 'load'),
          cancelled ? 4500 : 9000
        );
      }
    } finally {
      endOperation(operation);
    }
  }

  async function collectPageMetrics(operation, selectedPages) {
    const metrics = [];
    for (let index = 0; index < selectedPages.length; index++) {
      assertOperation(operation);
      const pageState = selectedPages[index];
      const page = await pdfDocument.getPage(pageState.pageNumber);
      assertOperation(operation);
      try {
        const viewport = page.getViewport({ scale: 1 });
        metrics.push({
          pageNumber: pageState.pageNumber,
          width: viewport.width,
          height: viewport.height
        });
      } finally {
        try { page.cleanup(); } catch (_) {}
      }
      setLocalizedProgress(
        3 + Math.round(((index + 1) / selectedPages.length) * 7),
        'preparing'
      );
    }
    return metrics;
  }

  async function renderPageCanvas(operation, pagePlan) {
    assertOperation(operation);
    const page = await pdfDocument.getPage(pagePlan.pageNumber);
    assertOperation(operation);
    let canvas = null;
    try {
      const viewport = page.getViewport({ scale: pagePlan.renderScale });
      const targetWidth = Number(pagePlan.width);
      const targetHeight = Number(pagePlan.height);
      if (!Number.isSafeInteger(targetWidth) || targetWidth < 1
        || !Number.isSafeInteger(targetHeight) || targetHeight < 1) {
        throw new Error('Invalid planned PDF page dimensions');
      }
      canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Cannot create export canvas');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: [targetWidth / viewport.width, 0, 0, targetHeight / viewport.height, 0, 0],
        background: '#ffffff'
      });
      operation.renderTask = renderTask;
      await renderTask.promise;
      operation.renderTask = null;
      assertOperation(operation);
      return canvas;
    } catch (error) {
      operation.renderTask = null;
      if (canvas) releaseCanvas(canvas);
      throw error;
    } finally {
      try { page.cleanup(); } catch (_) {}
    }
  }

  async function exportWithTauri(operation, plan, mode) {
    const invoke = await getInvoke();
    assertOperation(operation);
    let progressUnlisten = null;
    try {
      const session = await invoke('create_pdf_to_image_session');
      operation.sessionId = session.sessionId;
      assertOperation(operation);
      for (let index = 0; index < plan.pagePlans.length; index++) {
        assertOperation(operation);
        const pagePlan = plan.pagePlans[index];
        setLocalizedProgress(
          10 + Math.round((index / plan.pagePlans.length) * 68),
          'renderingPage',
          {
            current: index + 1,
            total: plan.pagePlans.length
          }
        );
        const canvas = await renderPageCanvas(operation, pagePlan);
        let blob;
        try {
          blob = await canvasToBlob(canvas, 'image/png');
        } finally {
          releaseCanvas(canvas);
        }
        assertOperation(operation);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        assertOperation(operation);
        await invoke('write_pdf_to_image_page_json', {
          sessionId: operation.sessionId,
          fileName: 'page_' + String(pagePlan.pageNumber).padStart(5, '0') + '.png',
          bytes: Array.from(bytes)
        });
        assertOperation(operation);
        setLocalizedProgress(
          10 + Math.round(((index + 1) / plan.pagePlans.length) * 68),
          'renderingPage',
          {
            current: index + 1,
            total: plan.pagePlans.length
          }
        );
      }

      assertOperation(operation);
      const { listen } = await import('@tauri-apps/api/event');
      assertOperation(operation);
      const jobId = operation.jobId;
      progressUnlisten = await listen('pdf-to-image-progress', event => {
        const payload = event.payload || {};
        if (payload.jobId !== jobId || activeOperation !== operation) return;
        const nativePercent = Math.max(0, Math.min(100, Number(payload.percent) || 0));
        const progressKey = payload.phase === 'compose'
          ? 'buildingLongImage'
          : payload.phase === 'publish'
            ? 'writingOutput'
            : mode === 'long'
              ? 'exportingLongImages'
              : 'exportingImages';
        const progressParams = payload.phase === 'compose'
          ? {
            current: Math.min(Number(payload.current || 0) + 1, Number(payload.total || 1)),
            total: Number(payload.total || 1)
          }
          : {};
        setLocalizedProgress(78 + Math.round(nativePercent * 0.22), progressKey, progressParams);
      });
      assertOperation(operation);
      const outputDir = await getOutputDir(currentFile?.outputCategory || 'PDF_To_Image');
      assertOperation(operation);
      operation.nativeExportStarted = true;
      const result = await invoke('export_pdf_to_images', {
        request: {
          sessionId: operation.sessionId,
          pages: plan.pages,
          pageCount: plan.pageCount,
          outputDir,
          outputName: plan.sourceName,
          format: plan.format,
          mode: mode === 'long' ? 'long' : 'images',
          pagesPerLongImage: PDF_TO_IMAGE_LIMITS.maxPagesPerLongImage,
          jpegQuality: plan.formatConfig.quality == null
            ? 94
            : Math.round(plan.formatConfig.quality * 100),
          backgroundRgba: '#FFFFFFFF',
          jobId
        }
      });
      assertOperation(operation);
      operation.sessionId = '';
      return result;
    } finally {
      operation.nativeExportStarted = false;
      if (progressUnlisten) {
        try { progressUnlisten(); } catch (_) {}
      }
      if (operation.sessionId) {
        try {
          await invoke('discard_pdf_to_image_session', { sessionId: operation.sessionId });
        } catch (_) {}
        operation.sessionId = '';
      }
    }
  }

  async function exportInBrowser(operation, plan, mode) {
    const outputs = [];
    if (mode === 'images') {
      for (let index = 0; index < plan.outputs.length; index++) {
        assertOperation(operation);
        const output = plan.outputs[index];
        const pagePlan = output.items[0];
        setLocalizedProgress(
          10 + Math.round((index / plan.outputs.length) * 85),
          'renderingPage',
          {
            current: index + 1,
            total: plan.outputs.length
          }
        );
        const canvas = await renderPageCanvas(operation, pagePlan);
        let blob;
        try {
          blob = await canvasToBlob(
            canvas,
            plan.formatConfig.mimeType,
            plan.formatConfig.quality
          );
        } finally {
          releaseCanvas(canvas);
        }
        assertOperation(operation);
        downloadBlob(blob, output.fileName);
        outputs.push({
          outputPath: output.fileName,
          width: output.width,
          height: output.height,
          pageNumbers: output.pageNumbers
        });
      }
    } else {
      for (let groupIndex = 0; groupIndex < plan.outputs.length; groupIndex++) {
        assertOperation(operation);
        const output = plan.outputs[groupIndex];
        const longCanvas = document.createElement('canvas');
        longCanvas.width = output.width;
        longCanvas.height = output.height;
        const context = longCanvas.getContext('2d', { alpha: false });
        if (!context) {
          releaseCanvas(longCanvas);
          throw new Error('Cannot create long image canvas');
        }
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, output.width, output.height);
        try {
          for (let itemIndex = 0; itemIndex < output.items.length; itemIndex++) {
            assertOperation(operation);
            const item = output.items[itemIndex];
            const pageCanvas = await renderPageCanvas(operation, item);
            context.drawImage(pageCanvas, item.x, item.y);
            releaseCanvas(pageCanvas);
          }
          setLocalizedProgress(
            10 + Math.round(((groupIndex + 1) / plan.outputs.length) * 80),
            'buildingLongImage',
            {
              current: groupIndex + 1,
              total: plan.outputs.length
            }
          );
          const blob = await canvasToBlob(
            longCanvas,
            plan.formatConfig.mimeType,
            plan.formatConfig.quality
          );
          assertOperation(operation);
          downloadBlob(blob, output.fileName);
          outputs.push({
            outputPath: output.fileName,
            width: output.width,
            height: output.height,
            pageNumbers: output.pageNumbers
          });
        } finally {
          releaseCanvas(longCanvas);
        }
      }
    }
    return {
      outputDir: '~/Downloads',
      outputs,
      outputCount: outputs.length,
      pageCount: plan.pages.length,
      format: plan.format.toUpperCase(),
      exportMode: mode === 'long' ? 'long' : 'pages'
    };
  }

  function closeSuccess(restore = true) {
    if (!successOverlay?.classList.contains('visible')) return;
    successOverlay?.classList.remove('visible');
    syncInteractiveLayers();
    const returnFocus = successReturnFocus;
    successReturnFocus = null;
    if (restore) restoreFocus(returnFocus);
  }

  function renderSuccess() {
    if (!lastSuccess) return;
    const { result, mode, limitedCount } = lastSuccess;
    if (successMeta) {
      const base = t(
        mode === 'long'
          ? 'home.pdfToImageTool.successLongImagesMeta'
          : 'home.pdfToImageTool.successImagesMeta'
      );
      successMeta.textContent = limitedCount > 0
        ? base + ' ' + t('home.pdfToImageTool.safeLimitApplied', { count: limitedCount })
        : base;
    }
    if (successType) {
      successType.textContent = t(
        mode === 'long'
          ? 'home.pdfToImageTool.successTypeLongImages'
          : 'home.pdfToImageTool.successTypeImages'
      );
    }
    if (successCount) successCount.textContent = String(result.outputCount || result.outputs?.length || 0);
    if (successPath) successPath.textContent = displayFilesystemPath(result.outputDir || '~/Downloads');
    if (successOpenFolder) successOpenFolder.style.display = isTauri ? '' : 'none';
  }

  function showSuccess(result, mode, limitedCount, returnFocus) {
    lastOutputFolder = result.outputDir || '';
    lastSuccess = { result, mode, limitedCount };
    successReturnFocus = returnFocus || focusedElement();
    renderSuccess();
    successOverlay?.classList.add('visible');
    syncInteractiveLayers();
    restoreFocus(successOk || successOpenFolder);
  }

  async function exportSelection(mode) {
    if (disposed || !pdfDocument || activeOperation) {
      if (activeOperation) showToast(t('home.pdfToImageTool.busy'));
      return;
    }
    const selectedPages = pageStates.filter(pageState => pageState.selected);
    if (!selectedPages.length) {
      showToast(t('home.pdfToImageTool.noSelection'));
      return;
    }
    if (mode === 'long' && !longExportAllowed) {
      showToast(t('home.pdfToImageTool.longImageNotAvailable'));
      return;
    }
    if (mode === 'long' && selectedPages.length > PDF_TO_IMAGE_LIMITS.maxLongPages) {
      showToast(t('home.pdfToImageTool.longImageSelectionLimit'), 8500);
      return;
    }

    const operation = beginOperation('export');
    stopPreviewObserver(false);
    updateControls();
    showProcess('preparing', 2);
    try {
      const pageMetrics = await collectPageMetrics(operation, selectedPages);
      assertOperation(operation);
      const plan = planPdfToImageExport({
        sourceName: currentFile.name,
        pageCount: pdfDocument.numPages,
        pages: selectedPages.map(pageState => pageState.pageNumber),
        pageMetrics,
        mode,
        format: selectedOption(formatOptions, 'png'),
        clarity: selectedOption(clarityOptions, 'high')
      });
      setLocalizedProgress(
        10,
        mode === 'long'
          ? 'exportingLongImages'
          : 'exportingImages'
      );
      const result = isTauri
        ? await exportWithTauri(operation, plan, mode)
        : await exportInBrowser(operation, plan, mode);
      assertOperation(operation);
      setLocalizedProgress(100, 'writingOutput');
      showSuccess(
        result,
        mode,
        plan.pagePlans.filter(page => page.wasLimited).length,
        operation.returnFocus
      );
    } catch (error) {
      const cancelled = operation.cancelled
        || error instanceof PdfToImageCancelledError
        || isRenderCancellation(error)
        || errorCode(error) === 'cancelled';
      showToast(
        cancelled ? t('home.pdfToImageTool.cancelled') : messageForError(error, 'export'),
        cancelled ? 4500 : 9000
      );
    } finally {
      endOperation(operation);
      if (pdfDocument && workspace.classList.contains('visible')) startPreviewObserver();
    }
  }

  back?.addEventListener('click', closeOverlay, listenerOptions);
  workspaceClose?.addEventListener('click', closeWorkspace, listenerOptions);
  processCancel?.addEventListener('click', () => { void cancelActiveOperation(); }, listenerOptions);
  successOk?.addEventListener('click', () => closeSuccess(), listenerOptions);
  successOpenFolder?.addEventListener('click', async () => {
    if (!isTauri || !lastOutputFolder) return;
    try {
      const invoke = await getInvoke();
      await invoke('open_path', { path: lastOutputFolder });
      closeSuccess();
    } catch (_) {
      showToast(t('home.pdfToImageTool.openFolderFailed'));
    }
  }, listenerOptions);

  cta?.addEventListener('click', async () => {
    if (activeOperation) {
      showToast(t('home.pdfToImageTool.busy'));
      return;
    }
    setLongExportAllowed(true);
    if (isTauri) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({
          multiple: false,
          filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });
        if (!disposed && typeof selected === 'string') {
          await acceptFile({
            name: selected.split(/[\\/]/).pop() || selected,
            path: selected,
            size: 0
          });
        }
      } catch (error) {
        showToast(messageForError(error, 'load'));
      }
      return;
    }
    if (fileInput) {
      fileInput.value = '';
      fileInput.click();
    }
  }, listenerOptions);

  fileInput?.addEventListener('change', () => {
    const files = Array.from(fileInput.files || []);
    if (files.length > 1) {
      showToast(t('home.pdfToImageTool.singlePdfOnly'));
      return;
    }
    void acceptFile(files[0]);
  }, listenerOptions);

  overlay.addEventListener('dragover', event => {
    if (!overlay.classList.contains('visible') || isTauri) return;
    event.preventDefault();
    showDropZone();
  }, listenerOptions);
  overlay.addEventListener('dragleave', event => {
    if (event.relatedTarget && overlay.contains(event.relatedTarget)) return;
    hideDropZone();
  }, listenerOptions);
  overlay.addEventListener('drop', event => {
    if (isTauri) return;
    event.preventDefault();
    hideDropZone();
    setLongExportAllowed(true);
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length !== 1) {
      showToast(t('home.pdfToImageTool.singlePdfOnly'));
      return;
    }
    void acceptFile(files[0]);
  }, listenerOptions);

  if (isTauri) {
    void (async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview');
        const unlisten = await getCurrentWebview().onDragDropEvent(event => {
          if (disposed
            || !overlay.classList.contains('visible')
            || workspace.classList.contains('visible')
            || activeOperation) return;
          const payload = event.payload || {};
          if (payload.type === 'enter' || payload.type === 'over') {
            showDropZone();
          } else if (payload.type === 'leave') {
            hideDropZone();
          } else if (payload.type === 'drop') {
            hideDropZone();
            setLongExportAllowed(true);
            const paths = Array.from(payload.paths || []);
            if (paths.length !== 1) {
              showToast(t('home.pdfToImageTool.singlePdfOnly'));
              return;
            }
            const path = paths[0];
            void acceptFile({
              name: path.split(/[\\/]/).pop() || path,
              path,
              size: 0
            });
          }
        });
        if (disposed) {
          try { unlisten(); } catch (_) {}
          return;
        }
        nativeDragUnlisten = unlisten;
      } catch (error) {
        if (!disposed) console.error('[PDF To Image] Native drag-drop setup failed:', error);
      }
    })();
  }

  document.querySelectorAll('.audio-list-item[data-tool="pdf-to-image"]').forEach(item => {
    item.addEventListener('click', () => {
      setLongExportAllowed(true);
      openOverlay();
    }, listenerOptions);
    item.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      setLongExportAllowed(true);
      openOverlay();
    }, listenerOptions);
  });

  [formatOptions, clarityOptions].forEach(group => {
    group?.addEventListener('click', event => {
      if (activeOperation) return;
      const button = event.target.closest('button[data-value]');
      if (!button || !group.contains(button)) return;
      setOption(group, button);
    }, listenerOptions);
  });

  selectAllBtn?.addEventListener('click', () => {
    if (activeOperation || !pageStates.length) return;
    const shouldSelect = pageStates.some(pageState => !pageState.selected);
    pageStates.forEach(pageState => {
      pageState.selected = shouldSelect;
      pageState.tile.classList.toggle('is-selected', shouldSelect);
      pageState.selectButton.setAttribute('aria-pressed', String(shouldSelect));
    });
    updateControls();
  }, listenerOptions);
  exportImagesBtn?.addEventListener('click', () => { void exportSelection('images'); }, listenerOptions);
  exportLongBtn?.addEventListener('click', () => { void exportSelection('long'); }, listenerOptions);
  document.addEventListener('keydown', handleDocumentKeydown, listenerOptions);

  unsubscribeLangChange = onLangChange(() => {
    updateControls();
    syncProgressLabel();
    if (activeOperation?.progressKey && processMask?.classList.contains('visible')) {
      setProgress(
        Number(processProgress?.getAttribute('aria-valuenow') || 0),
        t(`home.pdfToImageTool.${activeOperation.progressKey}`, activeOperation.progressParams)
      );
    }
    if (lastSuccess && successOverlay?.classList.contains('visible')) renderSuccess();
  }) || (() => {});

  processMask?.setAttribute('role', 'dialog');
  processMask?.setAttribute('aria-modal', 'true');
  processMask?.setAttribute('aria-labelledby', 'pdfToImageProcessText');
  updateControls();
  syncProgressLabel();
  syncInteractiveLayers();

  return {
    async openWithFile(file, { allowLongExport = true } = {}) {
      if (disposed) return;
      setLongExportAllowed(allowLongExport);
      openOverlay();
      await acceptFile(file);
    },
    dispose() {
      if (disposed) return;
      const operation = activeOperation;
      if (operation && !operation.cancelled) void cancelActiveOperation();
      activeOperation = null;
      disposed = true;
      listenerController.abort();
      try { unsubscribeLangChange(); } catch (_) {}
      unsubscribeLangChange = () => {};
      try { nativeDragUnlisten?.(); } catch (_) {}
      nativeDragUnlisten = null;
      plasmaInstance = disposeStandardToolPlasma(plasmaInstance);
      successOverlay?.classList.remove('visible');
      processMask?.classList.remove('visible');
      workspace.classList.remove('visible');
      overlay.classList.remove('visible', 'drag-over', 'is-selection-flow');
      dropZone?.classList.remove('visible');
      if (fileInput) fileInput.value = '';
      successReturnFocus = null;
      overlayReturnFocus = null;
      lastSuccess = null;
      lastOutputFolder = '';
      syncInteractiveLayers();
      stopPreviewObserver(true);
      void releaseDocument();
    }
  };
}
