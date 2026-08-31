import { createIcons, icons } from 'lucide';
import { onLangChange, t } from './i18n.js';
import './excel-to-pdf.css';

const MAX_FILES = 20;
const SUPPORTED_WORKBOOK = /\.(?:xlsx|xls|ods)$/i;

function copy(key, values) {
  return t(`home.excelToPdfPage.${key}`, values);
}

function fileNameFromPath(path) {
  return String(path || '').split(/[\\/]/).pop() || '';
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return copy('unknownSize');
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function template() {
  return `
    <div class="plasma-bg pdf-merge-v2-bg excel-pdf-bg" data-excel-bg></div>
    <div class="audio-convert-drop-zone pdf-merge-v2-drop-zone" data-excel-drop-zone>
      <span class="drop-hint" data-excel-text="dropHint">松手即可添加 Excel 工作簿</span>
    </div>
    <header class="pdf-merge-v2-topbar excel-pdf-topbar" data-tauri-drag-region>
      <div class="pdf-merge-v2-topbar-left">
        <button class="settings-v2-back settings-back pdf-merge-v2-back" type="button" data-excel-action="back" data-excel-title="back">
          <i data-lucide="arrow-left"></i><span data-excel-text="back">返回首页</span>
        </button>
        <span class="pdf-merge-v2-top-tag">SPREADSHEET · TOOL PAGE 2.3</span>
      </div>
      <div class="home-v2-top-actions pdf-merge-v2-top-actions">
        <button class="home-v2-nav-link" type="button" data-excel-action="website" data-excel-title="website">
          <i data-lucide="globe-2"></i><span data-excel-text="website">网页版本</span>
        </button>
        <button class="home-v2-support-top" type="button" data-excel-action="support">
          <i data-lucide="heart"></i><span data-excel-text="support">支持作者</span>
        </button>
        <div class="home-v2-window-cluster" aria-label="窗口与设置">
          <button class="home-v2-icon-button" type="button" data-excel-action="settings" data-excel-title="settings"><i data-lucide="settings"></i></button>
          <div class="home-v2-window-controls" aria-label="窗口控制">
            <button class="home-v2-window-button" type="button" data-window-action="minimize" data-excel-title="minimize"><i data-lucide="minus"></i></button>
            <button class="home-v2-window-button" type="button" data-window-action="maximize" data-excel-title="maximize"><i data-lucide="square"></i></button>
            <button class="home-v2-window-button" type="button" data-window-action="close" data-excel-title="close"><i data-lucide="x"></i></button>
          </div>
        </div>
      </div>
    </header>

    <div class="pdf-merge-v2-body excel-pdf-body">
      <aside class="pdf-merge-v2-poster excel-pdf-poster" data-excel-title="title">
        <div class="pdf-merge-v2-poster-kicker" data-excel-text="heroLabel">Workbook Renderer</div>
        <h1 class="pdf-merge-v2-title" data-excel-text="title">Excel 转 PDF</h1>
        <p class="pdf-merge-v2-subtitle" data-excel-text="subtitle">把 Excel 工作簿转换为适合分享、打印和归档的 PDF。</p>
        <div class="pdf-merge-v2-poster-note">
          <span data-excel-text="localLabel">LOCAL RENDER</span>
          <strong data-excel-text="localNote">使用 ToolKnit 的本地 LibreOffice 运行时，文件不会上传服务器。</strong>
        </div>
        <div class="pdf-merge-v2-steps">
          ${[1, 2, 3, 4].map(number => `
            <div class="pdf-merge-v2-step${number === 1 ? ' is-active' : ''}">
              <span>0${number}</span>
              <div><strong data-excel-text="step${number}Title"></strong><p data-excel-text="step${number}Desc"></p></div>
            </div>`).join('')}
        </div>
      </aside>

      <main class="pdf-merge-v2-workspace excel-pdf-workspace">
        <section class="pdf-merge-v2-upload excel-pdf-upload">
          <div class="pdf-merge-v2-upload-copy">
            <span class="pdf-merge-v2-upload-eyebrow" data-excel-text="uploadEyebrow">DROP OR SELECT</span>
            <h2 data-excel-text="uploadTitle">把需要转换的 Excel 放到这里</h2>
            <p data-excel-text="uploadDesc">支持 XLSX、XLS 和 ODS；当前版本用于确认界面与操作流程。</p>
          </div>
          <button class="audio-convert-cta pdf-merge-v2-cta" type="button" data-excel-action="upload">
            <i data-lucide="upload"></i><span data-excel-text="uploadButton">上传 Excel 文件</span>
          </button>
          <input type="file" accept=".xlsx,.xls,.ods" multiple data-excel-input hidden>
        </section>

        <section class="excel-pdf-settings" aria-labelledby="excelPdfSettingsTitle">
          <div class="excel-pdf-settings-head">
            <span class="pdf-merge-v2-section-kicker" data-excel-text="settingsEyebrow">PAGE SETUP</span>
            <h2 id="excelPdfSettingsTitle" data-excel-text="settingsTitle">转换设置</h2>
          </div>
          <div class="excel-pdf-settings-grid">
            <fieldset class="excel-pdf-setting" data-setting-group="sheets">
              <legend data-excel-text="sheetRange">工作表范围</legend>
              <div class="excel-pdf-segment">
                <button class="is-active" type="button" data-setting-value="all" data-excel-text="sheetAll" aria-pressed="true">全部</button>
                <button type="button" data-setting-value="visible" data-excel-text="sheetVisible" aria-pressed="false">仅可见</button>
              </div>
            </fieldset>
            <fieldset class="excel-pdf-setting" data-setting-group="orientation">
              <legend data-excel-text="orientation">页面方向</legend>
              <div class="excel-pdf-segment excel-pdf-segment-three">
                <button class="is-active" type="button" data-setting-value="source" data-excel-text="orientationSource" aria-pressed="true">跟随源文件</button>
                <button type="button" data-setting-value="portrait" data-excel-text="orientationPortrait" aria-pressed="false">纵向</button>
                <button type="button" data-setting-value="landscape" data-excel-text="orientationLandscape" aria-pressed="false">横向</button>
              </div>
            </fieldset>
            <fieldset class="excel-pdf-setting" data-setting-group="paper">
              <legend data-excel-text="paper">纸张</legend>
              <div class="excel-pdf-segment excel-pdf-segment-three">
                <button class="is-active" type="button" data-setting-value="auto" data-excel-text="paperAuto" aria-pressed="true">自动</button>
                <button type="button" data-setting-value="a4" data-excel-text="paperA4" aria-pressed="false">A4</button>
                <button type="button" data-setting-value="letter" data-excel-text="paperLetter" aria-pressed="false">Letter</button>
              </div>
            </fieldset>
            <fieldset class="excel-pdf-setting" data-setting-group="scale">
              <legend data-excel-text="scale">缩放</legend>
              <div class="excel-pdf-segment">
                <button class="is-active" type="button" data-setting-value="fit" data-excel-text="scaleFit" aria-pressed="true">适合页面</button>
                <button type="button" data-setting-value="original" data-excel-text="scaleOriginal" aria-pressed="false">原始比例</button>
              </div>
            </fieldset>
          </div>
        </section>

        <section class="pdf-merge-v2-queue excel-pdf-queue">
          <div class="pdf-merge-v2-section-head">
            <div>
              <span class="pdf-merge-v2-section-kicker" data-excel-text="queueEyebrow">CONVERT QUEUE</span>
              <h2 data-excel-text="queueTitle">待转换工作簿</h2>
            </div>
            <div class="excel-pdf-queue-actions">
              <p data-excel-text="queueDesc">每个工作簿输出一个独立 PDF。</p>
              <button class="excel-pdf-icon-button" type="button" data-excel-action="clear" data-excel-title="clearQueue" hidden><i data-lucide="trash-2"></i></button>
            </div>
          </div>
          <div class="excel-pdf-queue-surface">
            <button class="excel-pdf-empty" type="button" data-excel-action="upload">
              <i data-lucide="file-spreadsheet"></i>
              <strong data-excel-text="queueEmptyTitle">还没有 Excel 文件</strong>
              <span data-excel-text="queueEmptyDesc">点击上传按钮或把工作簿拖到页面中。</span>
            </button>
            <div class="excel-pdf-files" data-excel-files hidden></div>
          </div>
        </section>

        <section class="pdf-merge-v2-info excel-pdf-info">
          <h3 class="audio-convert-formats-title" data-excel-text="formatsTitle">输出说明</h3>
          <div class="pdf-merge-info-grid">
            <div class="pdf-merge-info-item"><i data-lucide="sheet"></i><span data-excel-text="formatTypes">XLSX / XLS / ODS</span></div>
            <div class="pdf-merge-info-item"><i data-lucide="files"></i><span data-excel-text="onePdf">每个工作簿生成一个 PDF</span></div>
            <div class="pdf-merge-info-item"><i data-lucide="type"></i><span data-excel-text="fontNote">字体缺失时版式可能略有变化</span></div>
            <div class="pdf-merge-info-item"><i data-lucide="shield-check"></i><span data-excel-text="privacy">纯本地处理，不上传文件</span></div>
          </div>
        </section>

        <footer class="pdf-merge-v2-actions excel-pdf-actions">
          <span data-excel-status data-excel-text="footerEmpty">添加工作簿并确认页面设置后，即可进入转换流程。</span>
          <button class="audio-convert-process-btn pdf-merge-v2-process" type="button" data-excel-action="convert" hidden disabled>
            <i data-lucide="file-output"></i><span data-excel-text="startButton">开始转换</span>
          </button>
        </footer>
      </main>
    </div>

    <div class="audio-convert-process-mask" data-excel-process>
      <div class="tk-mascot-lg" aria-hidden="true"></div>
      <div class="audio-convert-process-bar">
        <div class="audio-convert-process-bar-fill" data-excel-progress></div>
      </div>
      <div class="audio-convert-process-text" data-excel-process-text></div>
      <button class="audio-convert-cancel-btn" type="button" data-excel-action="cancel" data-excel-text="cancelButton">取消转换</button>
    </div>

    <div class="audio-clip-success-overlay" data-excel-success aria-hidden="true">
      <div class="audio-clip-success-dialog">
        <div class="audio-clip-success-icon"><i data-lucide="check"></i></div>
        <h3 class="audio-clip-success-title" data-excel-text="successTitle">Excel 转 PDF 完成</h3>
        <div class="audio-clip-success-meta" data-excel-success-meta></div>
        <div class="audio-convert-success-detail">
          <div class="audio-convert-success-row">
            <span class="audio-convert-success-key" data-excel-text="successFiles">转换文件</span>
            <span class="audio-convert-success-value" data-excel-success-files></span>
          </div>
          <div class="audio-convert-success-row">
            <span class="audio-convert-success-key" data-excel-text="successPages">PDF 页数</span>
            <span class="audio-convert-success-value" data-excel-success-pages></span>
          </div>
          <div class="audio-convert-success-row">
            <span class="audio-convert-success-key" data-excel-text="successPath">保存位置</span>
            <span class="audio-convert-success-value" data-excel-success-path></span>
          </div>
        </div>
        <div class="audio-clip-success-actions">
          <button class="audio-clip-success-btn audio-clip-success-btn-secondary" type="button" data-excel-action="open-output" data-excel-text="openFolder">打开文件夹</button>
          <button class="audio-clip-success-btn audio-clip-success-btn-primary" type="button" data-excel-action="success-ok" data-excel-text="ok">确定</button>
        </div>
      </div>
    </div>
  `;
}

export function initExcelToPdfTool({
  overlay,
  notify = () => {},
  isTauri = false,
  initStandardToolPlasma,
  disposeStandardToolPlasma,
  openSettings,
  openSupport,
  openExternalUrl,
  handleWindowAction,
  getOutputDir,
  ensureLibreOfficeAvailable
} = {}) {
  if (!overlay) return { open() {}, close() {}, dispose() {} };

  overlay.innerHTML = template();
  const query = selector => overlay.querySelector(selector);
  const listeners = new AbortController();
  const listenerOptions = { signal: listeners.signal };
  const fileInput = query('[data-excel-input]');
  const filesContainer = query('[data-excel-files]');
  const emptyState = query('.excel-pdf-empty');
  const clearButton = query('[data-excel-action="clear"]');
  const status = query('[data-excel-status]');
  const processButton = query('[data-excel-action="convert"]');
  const processMask = query('[data-excel-process]');
  const progressBar = query('[data-excel-progress]');
  const processText = query('[data-excel-process-text]');
  const successOverlay = query('[data-excel-success]');
  const successMeta = query('[data-excel-success-meta]');
  const successFiles = query('[data-excel-success-files]');
  const successPages = query('[data-excel-success-pages]');
  const successPath = query('[data-excel-success-path]');
  const dropZone = query('[data-excel-drop-zone]');
  const bg = query('[data-excel-bg]');
  const settings = { sheets: 'all', orientation: 'source', paper: 'auto', scale: 'fit' };
  let files = [];
  let nextId = 1;
  let plasmaInstance = null;
  let nativeDragUnlisten = null;
  let progressUnlisten = null;
  let processing = false;
  let cancelling = false;
  let lastOutputDir = '';

  function workbookKey(file) {
    return `${String(file.path || file.name).toLowerCase()}::${Number(file.size) || 0}`;
  }

  function renderFiles() {
    emptyState.hidden = files.length > 0;
    filesContainer.hidden = files.length === 0;
    clearButton.hidden = files.length === 0;
    filesContainer.innerHTML = files.map((file, index) => `
      <article class="excel-pdf-file" data-file-id="${file.id}">
        <span class="excel-pdf-file-index">${String(index + 1).padStart(2, '0')}</span>
        <span class="excel-pdf-file-icon"><i data-lucide="file-spreadsheet"></i></span>
        <span class="excel-pdf-file-copy">
          <strong title="${file.name.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}">${file.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</strong>
          <small>${file.extension.toUpperCase()} · ${formatBytes(file.size)}</small>
        </span>
        <button class="excel-pdf-icon-button" type="button" data-remove-file="${file.id}" title="${copy('removeFile')}" aria-label="${copy('removeFile')}"><i data-lucide="x"></i></button>
      </article>`).join('');
    status.textContent = files.length
      ? copy('footerReady', { count: files.length })
      : copy('footerEmpty');
    processButton.hidden = files.length === 0;
    processButton.disabled = files.length === 0 || processing;
    processButton.classList.toggle('visible', files.length > 0);
    createIcons({ icons, attrs: { 'aria-hidden': 'true' } });
  }

  function addRecords(records) {
    const accepted = [];
    let unsupported = false;
    let duplicate = false;
    const known = new Set(files.map(workbookKey));
    for (const record of records) {
      const name = record.name || fileNameFromPath(record.path);
      if (!SUPPORTED_WORKBOOK.test(name)) {
        unsupported = true;
        continue;
      }
      if (files.length + accepted.length >= MAX_FILES) {
        notify(copy('tooMany'));
        break;
      }
      const extension = name.split('.').pop() || '';
      const normalized = { id: nextId++, name, extension, size: record.size, path: record.path || '' };
      const key = workbookKey(normalized);
      if (known.has(key)) {
        duplicate = true;
        continue;
      }
      known.add(key);
      accepted.push(normalized);
    }
    files.push(...accepted);
    if (unsupported) notify(copy('unsupported'));
    else if (duplicate) notify(copy('duplicate'));
    renderFiles();
  }

  function addBrowserFiles(fileList) {
    addRecords(Array.from(fileList || []).map(file => ({ name: file.name, size: file.size })));
  }

  function renderLocale() {
    overlay.querySelectorAll('[data-excel-text]').forEach(node => {
      const key = node.dataset.excelText;
      if (key) node.textContent = copy(key);
    });
    overlay.querySelectorAll('[data-excel-title]').forEach(node => {
      const key = node.dataset.excelTitle;
      if (!key) return;
      const value = copy(key);
      node.title = value;
      if (!node.getAttribute('aria-label')) node.setAttribute('aria-label', value);
    });
    renderFiles();
  }

  async function chooseFiles() {
    if (processing) return;
    if (!isTauri) {
      fileInput.value = '';
      fileInput.click();
      return;
    }
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: true,
        filters: [{ name: 'Excel', extensions: ['xlsx', 'xls', 'ods'] }]
      });
      const paths = Array.isArray(selected) ? selected : (typeof selected === 'string' ? [selected] : []);
      addRecords(paths.map(path => ({ path, name: fileNameFromPath(path) })));
    } catch (error) {
      console.error('[ExcelToPdf] file picker failed:', error);
      notify(copy('chooseFailed'));
    }
  }

  function setProgress(percent, message, visible = true) {
    progressBar.style.width = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
    processText.textContent = message || copy('processing');
    processMask.classList.toggle('visible', Boolean(visible));
  }

  function conversionErrorMessage(error) {
    const message = String(error?.message || error || '');
    if (/runtime-missing|python-missing/i.test(message)) return copy('runtimeMissing');
    if (/invalid-extension|invalid-workbook|invalid-input|input-not-found|read-failed/i.test(message)) return copy('invalidWorkbook');
    if (/input-too-large/i.test(message)) return copy('fileTooLarge');
    if (/invalid-file-count/i.test(message)) return copy('tooMany');
    if (/invalid-options/i.test(message)) return copy('invalidOptions');
    if (/busy|another file conversion/i.test(message)) return copy('busy');
    if (/cancelled|canceled/i.test(message)) return copy('cancelled');
    if (/timeout/i.test(message)) return copy('timeout');
    if (/render-failed|all-failed/i.test(message)) return copy('renderFailed');
    return copy('conversionFailed', { error: message || copy('unknownError') });
  }

  function showSuccess(result) {
    lastOutputDir = String(result?.outputDir || '');
    const outputs = Array.isArray(result?.outputs) ? result.outputs : [];
    const pageCount = outputs.reduce((sum, item) => sum + (Number(item?.pageCount) || 0), 0);
    const successCount = Number(result?.successCount) || outputs.length;
    const failCount = Number(result?.failCount) || 0;
    successMeta.textContent = failCount
      ? copy('successPartial', { success: successCount, failed: failCount })
      : copy('successMeta', { count: successCount });
    successFiles.textContent = copy('successFileCount', { count: successCount });
    successPages.textContent = pageCount > 0 ? copy('successPageCount', { count: pageCount }) : copy('pageCountUnavailable');
    successPath.textContent = lastOutputDir;
    successOverlay.classList.add('visible');
    successOverlay.setAttribute('aria-hidden', 'false');
  }

  async function stopProgressListener() {
    try { progressUnlisten?.(); } catch {}
    progressUnlisten = null;
  }

  async function startConversion() {
    if (processing || files.length === 0) return;
    if (!isTauri) {
      notify(copy('desktopOnly'));
      return;
    }
    const inputPaths = files.map(file => file.path).filter(Boolean);
    if (inputPaths.length !== files.length) {
      notify(copy('reselectDesktopFiles'));
      return;
    }
    try {
      if (ensureLibreOfficeAvailable && !await ensureLibreOfficeAvailable()) return;
    } catch (error) {
      if (!/runtime-missing/i.test(String(error?.message || error))) notify(conversionErrorMessage(error));
      return;
    }
    processing = true;
    cancelling = false;
    renderFiles();
    overlay.querySelectorAll('[data-setting-value], [data-excel-action="upload"], [data-excel-action="clear"], [data-remove-file]')
      .forEach(node => { node.disabled = true; });
    setProgress(4, copy('preparing'));
    try {
      const [{ invoke }, { listen }] = await Promise.all([
        import('@tauri-apps/api/core'),
        import('@tauri-apps/api/event')
      ]);
      progressUnlisten = await listen('excel-to-pdf-progress', event => {
        const payload = event.payload || {};
        const phase = String(payload.phase || 'converting');
        const key = phase === 'publishing' ? 'publishing' : (phase === 'complete' ? 'complete' : 'converting');
        const message = phase === 'complete'
          ? copy('complete')
          : copy(key, {
              current: Number(payload.current) || 1,
              total: Number(payload.total) || files.length,
              file: String(payload.fileName || '')
            });
        setProgress(payload.percent, message);
      });
      const outputDir = await getOutputDir?.('Excel_To_PDF');
      const result = await invoke('convert_excel_to_pdf', {
        inputPaths,
        outputDir,
        options: {
          sheetRange: settings.sheets,
          orientation: settings.orientation,
          paper: settings.paper,
          scale: settings.scale
        }
      });
      setProgress(100, copy('complete'));
      showSuccess(result);
    } catch (error) {
      console.error('[ExcelToPdf] conversion failed:', error);
      notify(conversionErrorMessage(error));
    } finally {
      await stopProgressListener();
      window.setTimeout(() => setProgress(0, copy('processing'), false), 220);
      processing = false;
      cancelling = false;
      overlay.querySelectorAll('[data-setting-value], [data-excel-action="upload"], [data-excel-action="clear"], [data-remove-file]')
        .forEach(node => { node.disabled = false; });
      renderFiles();
    }
  }

  async function startNativeDragListener() {
    if (!isTauri || nativeDragUnlisten) return;
    try {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');
      nativeDragUnlisten = await getCurrentWebview().onDragDropEvent(event => {
        if (!overlay.classList.contains('visible')) return;
        const payload = event.payload || {};
        if (payload.type === 'enter' || payload.type === 'over') {
          overlay.classList.add('drag-over');
          dropZone.classList.add('visible');
        } else if (payload.type === 'leave') {
          overlay.classList.remove('drag-over');
          dropZone.classList.remove('visible');
        } else if (payload.type === 'drop') {
          overlay.classList.remove('drag-over');
          dropZone.classList.remove('visible');
          addRecords((payload.paths || []).map(path => ({ path, name: fileNameFromPath(path) })));
        }
      });
    } catch (error) {
      console.error('[ExcelToPdf] native drag listener failed:', error);
    }
  }

  function stopNativeDragListener() {
    try { nativeDragUnlisten?.(); } catch {}
    nativeDragUnlisten = null;
    overlay.classList.remove('drag-over');
    dropZone.classList.remove('visible');
  }

  function open() {
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
    plasmaInstance = initStandardToolPlasma?.(bg) || plasmaInstance;
    renderLocale();
    void startNativeDragListener();
  }

  function close() {
    if (!overlay.classList.contains('visible')) return;
    if (processing) {
      notify(copy('busy'));
      return;
    }
    overlay.classList.remove('visible', 'drag-over');
    overlay.setAttribute('aria-hidden', 'true');
    stopNativeDragListener();
    successOverlay.classList.remove('visible');
    successOverlay.setAttribute('aria-hidden', 'true');
    plasmaInstance = disposeStandardToolPlasma?.(plasmaInstance) || null;
  }

  function dispose() {
    close();
    listeners.abort();
    void stopProgressListener();
    try { unsubscribeLanguage(); } catch {}
    overlay.replaceChildren();
  }

  overlay.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-file]');
    if (remove) {
      files = files.filter(file => file.id !== Number(remove.dataset.removeFile));
      renderFiles();
      return;
    }
    const settingButton = event.target.closest('[data-setting-value]');
    if (settingButton) {
      const group = settingButton.closest('[data-setting-group]');
      if (!group) return;
      settings[group.dataset.settingGroup] = settingButton.dataset.settingValue;
      group.querySelectorAll('[data-setting-value]').forEach(button => {
        const active = button === settingButton;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      return;
    }
    const action = event.target.closest('[data-excel-action]')?.dataset.excelAction;
    if (action === 'back') close();
    else if (action === 'upload') void chooseFiles();
    else if (action === 'clear') { files = []; renderFiles(); }
    else if (action === 'convert') void startConversion();
    else if (action === 'cancel' && processing && !cancelling) {
      cancelling = true;
      setProgress(Number.parseFloat(progressBar.style.width) || 0, copy('cancelling'));
      void import('@tauri-apps/api/core').then(({ invoke }) => invoke('cancel_convert')).catch(() => {});
    }
    else if (action === 'success-ok') {
      successOverlay.classList.remove('visible');
      successOverlay.setAttribute('aria-hidden', 'true');
    }
    else if (action === 'open-output' && lastOutputDir) {
      void import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke('open_path', { path: lastOutputDir }))
        .catch(error => { console.error('[ExcelToPdf] open output failed:', error); notify(copy('openFolderFailed')); });
    }
    else if (action === 'website') openExternalUrl?.('https://toolknit.com');
    else if (action === 'support') openSupport?.();
    else if (action === 'settings') openSettings?.();
    const windowAction = event.target.closest('[data-window-action]')?.dataset.windowAction;
    if (windowAction) void handleWindowAction?.(windowAction);
  }, listenerOptions);

  fileInput.addEventListener('change', () => addBrowserFiles(fileInput.files), listenerOptions);
  overlay.addEventListener('dragover', event => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    overlay.classList.add('drag-over');
    dropZone.classList.add('visible');
  }, listenerOptions);
  overlay.addEventListener('dragleave', event => {
    if (event.relatedTarget && overlay.contains(event.relatedTarget)) return;
    overlay.classList.remove('drag-over');
    dropZone.classList.remove('visible');
  }, listenerOptions);
  overlay.addEventListener('drop', event => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    overlay.classList.remove('drag-over');
    dropZone.classList.remove('visible');
    addBrowserFiles(event.dataTransfer.files);
  }, listenerOptions);

  const unsubscribeLanguage = onLangChange(renderLocale) || (() => {});
  renderLocale();
  return { open, close, dispose };
}
