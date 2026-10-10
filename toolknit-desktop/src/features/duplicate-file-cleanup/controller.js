import { createLifecycleScope } from '../../app/tool-lifecycle.js';
import { createModalSession } from '../../app/modal-runtime.js';
import { createOutputRuntime } from '../../app/output-runtime.js';
import { moveFocusOutOfHiddenRegion } from '../../shared/tool-page-shell.js';
import { applyTranslations, getLang, onLangChange, t } from '../../i18n.js';
import { loadTauriDialog, tauriCorePromise } from '../../platform/tauri-runtime.js';
import { formatFileSize } from '../../shared/file-size.js';
import { initialKeepers, selectExtras, toggleFileSelection, summary, removalPlan, filterGroups, sortGroups, GROUP_PAGE_SIZE, FILE_PAGE_SIZE } from './core.js';
import { ALL_EXTENSIONS } from './file-types.js';
import { startScanAnimation } from './scan-animation.js';
import { createCleanupView } from './cleanup-view.js';

export function createDuplicateFileCleanupController({ overlay, isTauri = false, tauriCore = tauriCorePromise, loadDialog = loadTauriDialog, openOutputFolder, notify = () => {}, refreshIcons = () => {}, initStandardToolPlasma = () => null, disposeStandardToolPlasma = value => value?.() } = {}) {
  const documentRef = overlay.ownerDocument;
  const q = id => documentRef.getElementById(`duplicate${id}`);
  const tr = (key, values) => t(`home.duplicateFileCleanup.${key}`, values);
  const lifecycle = createLifecycleScope();
  let session = null, scanId = '', folder = '', scanMode = 'folder', groups = [], keepers = new Map(), selected = new Set(), filePages = new Map(), page = 0;
  let busy = false, cleaning = false, progress = null, scanned = false, disposed = false, polling = false, background = null;
  let stopAnimation = null;
  const expanded = new Set();
  const selectedExtensions = () => [...q('Types').querySelectorAll('[data-extension]:checked')].map(input => input.dataset.extension);
  function disposeAnimation() { stopAnimation?.(); stopAnimation = null; }
  const dialogRoot = q('CleanupDialog');
  const modal = createModalSession({ root: dialogRoot, background: overlay, initialFocus: q('DialogCancel'), onClose: () => modal.close(), canClose: () => !cleaning });
  const invoke = async (command, args) => (await tauriCore).invoke(command, args);
  const revealFile = openOutputFolder || createOutputRuntime({ isTauri, tauriCorePromise: tauriCore, storage: null }).openFolder;
  const current = owner => owner === session && owner && !owner.disposed && !disposed;
  const node = (tag, text, className) => { const el = documentRef.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
  const feedback = (key, kind = 'info', values) => notify(tr(key, values), { kind });
  function error(value) { q('Error').hidden = false; q('Error').textContent = tr('error', { reason: String(value?.message || value).slice(0, 300) }); feedback('operationFailed', 'error'); }
  function cancelScan() {
    const old = scanId; scanId = '';
    if (old && isTauri) void invoke('cancel_duplicate_file_scan', { scanId: old }).catch(() => {});
  }
  function reset() {
    cancelScan(); disposeAnimation();
    groups = []; keepers.clear(); selected.clear(); filePages.clear(); expanded.clear(); page = 0;
    folder = ''; scanMode = 'folder'; busy = cleaning = scanned = false; progress = null;
    q('Search').value = ''; q('Error').hidden = true; renderResults();
  }
  const cleanupView = createCleanupView({ overlay, translate: tr, onReturn: reset, onStop: async () => {
    const owner = session, id = scanId;
    try { await invoke('cancel_duplicate_file_scan', { scanId: id }); }
    catch (value) { if (current(owner) && id === scanId) feedback('operationFailed', 'error'); }
  } });
  function renderStatus() {
    const totals = summary(groups, selected);
    q('Folder').textContent = scanMode === 'all' ? tr('allDrives') : folder || tr('folderEmpty');
    q('Summary').textContent = tr('summary', { count: totals.groups, size: formatFileSize(totals.redundant) });
    q('Selected').textContent = tr('selected', { count: totals.selectedCount, size: formatFileSize(totals.selectedBytes) });
    const partial = !busy && progress?.stage === 'done' && progress.truncated;
    q('Status').textContent = !isTauri ? tr('desktopOnly') : progress ? tr(partial ? 'stage_partial' : `stage_${progress.stage || 'walking'}`, { count: progress.scanned_files, checked: progress.checked_files, total: progress.candidate_files, skipped: progress.skipped, filtered: progress.filtered_files || 0, size: formatFileSize(progress.read_bytes), seconds: Math.round((progress.elapsed_ms || 0) / 1000) }) : '';
    q('Warning').hidden = !partial;
    q('Warning').textContent = partial ? tr(`limit_${progress.limit_reason || 'unknown'}`) : '';
    q('Choose').disabled = busy; q('AllDrives').disabled = busy; q('Recursive').disabled = busy;
    q('Types').disabled = busy;
    const extensions = selectedExtensions();
    q('TypeCount').textContent = extensions.length ? tr('typeCount', { count: extensions.length, total: ALL_EXTENSIONS.length }) : tr('typesEmpty');
    q('Scan').disabled = busy || (!folder && scanMode !== 'all') || !isTauri || !extensions.length;
    q('AllDrives').setAttribute('aria-pressed', String(scanMode === 'all'));
    q('Cancel').hidden = !busy || cleaning; q('Cancel').disabled = !scanId;
    q('Select').disabled = busy || !groups.length; q('Clear').disabled = busy || !selected.size;
    q('Search').disabled = busy;
    const validKeepers = groups.every(group => group.files.some(file => file.path === keepers.get(group.id) && !selected.has(file.path)));
    q('Remove').disabled = busy || !totals.selectedCount || !validKeepers;
  }
  function renderResults() {
    const filtered = filterGroups(groups, q('Search').value);
    const pageCount = Math.max(1, Math.ceil(filtered.length / GROUP_PAGE_SIZE));
    page = Math.min(page, pageCount - 1);
    q('Page').textContent = `${page + 1} / ${pageCount}`;
    q('Previous').disabled = busy || !page; q('Next').disabled = busy || page + 1 >= pageCount;
    const content = q('Results'), position = content.scrollTop;
    disposeAnimation(); content.replaceChildren();
    if (!filtered.length) {
      const empty = node('div', undefined, 'duplicate-empty');
      const scanning = busy && !cleaning;
      if (scanning) {
        const canvas = node('canvas', undefined, 'duplicate-scan-canvas'); canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', tr('scanning')); empty.append(canvas);
      } else {
        const icon = node('i'); icon.dataset.lucide = 'files'; icon.setAttribute('aria-hidden', 'true'); empty.append(icon);
      }
      empty.append(node('h3', tr(scanning ? 'scanning' : scanned ? 'noResults' : 'emptyTitle')), node('p', tr(scanning ? 'scanningHint' : scanned ? 'noResultsHint' : 'empty')));
      if (scanning) empty.append(node('p', undefined, 'duplicate-scan-quote'));
      content.append(empty);
      if (scanning) stopAnimation = startScanAnimation(empty.querySelector('canvas'), empty.querySelector('.duplicate-scan-quote'), tr);
    }
    for (const group of filtered.slice(page * GROUP_PAGE_SIZE, (page + 1) * GROUP_PAGE_SIZE)) {
      const section = node('section', undefined, 'duplicate-group');
      const header = node('button', undefined, 'duplicate-group-head'); header.type = 'button'; header.dataset.toggle = group.id;
      header.setAttribute('aria-expanded', String(expanded.has(group.id))); header.setAttribute('aria-controls', `duplicateMembers-${group.id}`);
      const chevron = node('i'); chevron.dataset.lucide = 'chevron-right'; chevron.setAttribute('aria-hidden', 'true');
      const heading = node('span', undefined, 'duplicate-group-heading');
      const meta = node('span', undefined, 'duplicate-group-meta');
      meta.append(
        node('span', tr('groupCopies', { count: group.files.length }), 'duplicate-group-tag'),
        node('span', tr('groupSize', { size: formatFileSize(group.files[0].size_bytes) }), 'duplicate-group-tag'),
        node('span', tr('groupRedundant', { size: formatFileSize(group.files[0].size_bytes * (group.files.length - 1)) }), 'duplicate-group-tag')
      );
      heading.append(node('strong', group.files[0].name), meta);
      const count = node('span', tr('groupSelected', { count: group.files.filter(file => selected.has(file.path)).length }), 'duplicate-group-selected'); count.dataset.selectedGroup = group.id;
      header.append(chevron, heading, count);
      section.append(header);
      const isExpanded = expanded.has(group.id);
      const members = node('div', undefined, `duplicate-members${isExpanded ? ' is-open' : ''}`); members.id = `duplicateMembers-${group.id}`;
      members.setAttribute('aria-hidden', String(!isExpanded)); members.inert = !isExpanded;
      members.append(node('div', undefined, 'duplicate-members-inner'));
      section.append(members); content.append(section);
      if (isExpanded) renderMembers(group, members);
    }
    content.scrollTop = position;
    renderStatus(); refreshIcons();
  }
  function renderMembers(group, container) {
      const members = node('div', undefined, 'duplicate-members-body');
      container.firstElementChild.replaceChildren(members);
      members.append(node('div', tr('retainedCount', { count: group.files.filter(file => !selected.has(file.path)).length, total: group.files.length }), 'duplicate-keeper'));
      const groupActions = node('div', undefined, 'duplicate-group-actions');
      for (const [action, key] of [['all', 'retainAll'], ['extras', 'select']]) {
        const button = node('button', tr(key), 'cleanup-v2-btn'); button.type = 'button'; button.dataset.retain = action; button.dataset.group = group.id; button.disabled = busy;
        groupActions.append(button);
      }
      members.append(groupActions);
      const filePageCount = Math.ceil(group.files.length / FILE_PAGE_SIZE);
      const filePage = Math.min(filePages.get(group.id) || 0, filePageCount - 1);
      for (const file of group.files.slice(filePage * FILE_PAGE_SIZE, (filePage + 1) * FILE_PAGE_SIZE)) {
        const keep = !selected.has(file.path);
        const row = node('div', undefined, `duplicate-file${keep ? ' is-keeper' : selected.has(file.path) ? ' is-selected' : ''}`);
        const details = node('div'); details.append(node('div', file.name, 'duplicate-file-name'), node('div', file.path, 'duplicate-file-path'));
        const date = file.modified_at == null ? tr('unknownDate') : new Date(file.modified_at * 1000).toLocaleString(getLang() === 'zh' ? 'zh-CN' : 'en');
        details.append(node('div', date, 'duplicate-file-meta'));
        const keepButton = node('button', tr(keep ? 'kept' : 'pendingRemoval'), 'cleanup-v2-btn'); keepButton.type = 'button'; keepButton.disabled = busy; keepButton.dataset.keep = file.path; keepButton.dataset.group = group.id;
        keepButton.title = tr(keep ? 'markRemoval' : 'keep');
        keepButton.setAttribute('aria-label', tr(keep ? 'selectFile' : 'retainFile', { name: file.name }));
        keepButton.setAttribute('aria-pressed', String(keep));
        const actions = node('div', undefined, 'duplicate-file-actions');
        const reveal = node('button', undefined, 'cleanup-v2-btn'); reveal.type = 'button'; reveal.dataset.reveal = file.path; reveal.disabled = busy;
        reveal.title = tr('reveal'); reveal.setAttribute('aria-label', tr('reveal'));
        const icon = node('i'); icon.dataset.lucide = 'folder-open'; icon.setAttribute('aria-hidden', 'true'); reveal.append(icon);
        actions.append(reveal, keepButton);
        row.append(details, actions); members.append(row);
      }
      if (filePageCount > 1) {
        const pages = node('div', undefined, 'duplicate-file-pages');
        for (const [direction, label, iconName] of [[-1, 'previous', 'chevron-left'], [1, 'next', 'chevron-right']]) {
          const button = node('button', undefined, 'cleanup-v2-btn'); button.type = 'button'; button.dataset.filePage = String(filePage + direction); button.dataset.group = group.id;
          button.title = tr(label); button.setAttribute('aria-label', tr(label));
          const icon = node('i'); icon.dataset.lucide = iconName; icon.setAttribute('aria-hidden', 'true'); button.append(icon);
          button.disabled = busy || filePage + direction < 0 || filePage + direction >= filePageCount; pages.append(button);
          if (direction === -1) pages.append(node('span', `${filePage + 1} / ${filePageCount}`));
        }
        members.append(pages);
      }
  }
  async function scan() {
    if (busy || (!folder && scanMode !== 'all') || !isTauri || !selectedExtensions().length) return;
    cancelScan(); const owner = session;
    scanId = crypto.randomUUID(); const id = scanId;
    busy = true; scanned = false; groups = []; selected.clear(); progress = { stage: 'walking', scanned_files: 0, skipped: 0, checked_files: 0, candidate_files: 0, read_bytes: 0 };
    q('Error').hidden = true; filePages.clear(); expanded.clear(); page = 0; renderResults();
    feedback('scanStarted');
    try {
      const result = await invoke('scan_duplicate_files', { scanId: id, rootPath: scanMode === 'all' ? '' : folder, recursive: q('Recursive').checked, allDrives: scanMode === 'all', extensions: selectedExtensions() });
      if (!current(owner) || id !== scanId) return;
      groups = sortGroups(result.groups); if (groups[0]) expanded.add(groups[0].id); keepers = initialKeepers(groups); progress = result.progress; scanned = true;
      feedback(result.progress.truncated ? 'scanPartial' : groups.length ? 'scanFinished' : 'noDuplicates', result.progress.truncated ? 'warning' : 'success', { count: groups.length });
    } catch (value) {
      if (current(owner) && id === scanId) { error(value); cancelScan(); progress = null; }
    } finally {
      if (current(owner) && (scanId === id || !scanId)) { busy = false; renderResults(); }
    }
  }
  async function poll() {
    if (!busy || !scanId || polling) return;
    const id = scanId, owner = session; polling = true;
    try {
      const value = await invoke('get_duplicate_file_progress', { scanId: id });
      if (current(owner) && id === scanId && busy) {
        if (cleaning) { if (value.cleanup_stage) { progress = value; cleanupView.update(value); } }
        else { progress = value; renderStatus(); }
      }
    }
    catch { /* Scan invocation owns final errors; polling may precede native registration. */ }
    finally { polling = false; }
  }
  function showDialog(kind, text, failures = []) {
    q('DialogTitle').textContent = tr(kind === 'confirm' ? 'confirmTitle' : 'finishedTitle');
    q('DialogText').textContent = text;
    q('DialogConfirm').hidden = kind !== 'confirm'; q('DialogCancel').hidden = kind !== 'confirm'; q('DialogOk').hidden = kind === 'confirm';
    q('Failures').replaceChildren(...failures.map(item => node('div', `${item.path}: ${item.error}`)));
    modal.open();
    (kind === 'confirm' ? q('DialogCancel') : q('DialogOk')).focus();
  }
  async function remove() {
    if (busy || !scanId) return;
    const owner = session, id = scanId;
    let selections;
    try { selections = removalPlan(groups, keepers, selected); }
    catch { feedback('keepRequired', 'warning'); return; }
    if (!selections.length) return;
    modal.close({ restore: false });
    busy = cleaning = true;
    renderResults();
    cleanupView.show(summary(groups, selected).selectedCount);
    try {
      const result = await invoke('recycle_duplicate_files', { scanId: id, selections });
      if (!current(owner) || id !== scanId) return;
      const failed = result.items.filter(item => !item.ok);
      cleanupView.finish(result);
      feedback(result.cancelled ? 'outcome_stopped' : failed.length ? 'cleanupPartial' : 'cleanupFinished', result.cancelled || failed.length ? 'warning' : 'success');
    } catch (value) {
      if (current(owner) && id === scanId) {
        // Transport failure cannot prove whether the native batch moved files.
        cleanupView.finish({ uncertain: true, items: [], moved_bytes: progress?.cleanup_bytes || 0, confirmed_succeeded: progress?.cleanup_succeeded || 0, confirmed_failed: progress?.cleanup_failed || 0, elapsed_ms: progress?.cleanup_elapsed_ms || 0 });
        feedback('operationFailed', 'error');
      }
    }
    finally {
      if (current(owner) && id === scanId) {
        busy = cleaning = false;
      }
    }
  }
  lifecycle.event(q('Choose'), 'click', async () => {
    if (busy) return;
    if (!isTauri) { error(tr('desktopOnly')); return; }
    const owner = session;
    try {
      const value = await (await loadDialog()).open({ directory: true, multiple: false });
      if (!current(owner) || !value) return;
      cancelScan(); scanMode = 'folder'; folder = value; groups = []; selected.clear(); progress = null; scanned = false; renderResults();
      feedback('scopeReady');
    } catch (value) { if (current(owner)) error(value); }
  });
  lifecycle.event(q('AllDrives'), 'click', () => {
    if (busy) return;
    if (!isTauri) { error(tr('desktopOnly')); return; }
    cancelScan(); scanMode = 'all'; folder = ''; groups = []; selected.clear(); progress = null; scanned = false; renderResults();
    feedback('scopeReady');
  });
  lifecycle.event(q('Scan'), 'click', scan);
  lifecycle.event(q('Types'), 'change', () => { renderStatus(); if (!selectedExtensions().length) feedback('typesEmpty', 'warning'); });
  for (const [id, checked] of [['TypesAll', true], ['TypesNone', false]]) lifecycle.event(q(id), 'click', () => {
    if (busy) return;
    for (const input of q('Types').querySelectorAll('[data-extension]')) input.checked = checked;
    renderStatus();
    if (!checked) feedback('typesEmpty', 'warning');
  });
  lifecycle.event(q('Cancel'), 'click', () => { cancelScan(); busy = false; progress = { ...progress, stage: 'cancelled' }; renderResults(); feedback('stage_cancelled'); });
  lifecycle.event(q('Select'), 'click', () => { selected = selectExtras(groups, keepers); renderResults(); feedback('extrasSelected'); });
  lifecycle.event(q('Clear'), 'click', () => { selected.clear(); renderResults(); feedback('allRetained'); });
  lifecycle.event(q('Search'), 'input', () => { page = 0; renderResults(); });
  lifecycle.event(q('Previous'), 'click', () => { page--; renderResults(); q('Results').scrollTop = 0; });
  lifecycle.event(q('Next'), 'click', () => { page++; renderResults(); q('Results').scrollTop = 0; });
  lifecycle.event(q('Results'), 'transitionend', event => {
    const members = event.target;
    if (event.propertyName === 'grid-template-rows' && members.classList.contains('duplicate-members') && !members.classList.contains('is-open')) members.firstElementChild.replaceChildren();
  });
  lifecycle.event(q('Results'), 'click', async event => {
    const button = event.target.closest('button'); if (!button || busy) return;
    if (button.dataset.toggle) {
      const id = button.dataset.toggle, opening = !expanded.has(id);
      const members = documentRef.getElementById(`duplicateMembers-${id}`);
      if (opening) {
        expanded.add(id);
        renderMembers(groups.find(group => group.id === id), members);
        refreshIcons();
        // Establish the collapsed height before starting the grid transition.
        members.getBoundingClientRect();
      } else expanded.delete(id);
      members.inert = !opening;
      members.setAttribute('aria-hidden', String(!opening));
      members.classList.toggle('is-open', opening);
      button.setAttribute('aria-expanded', String(opening));
      if (!opening && documentRef.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches) members.firstElementChild.replaceChildren();
      return;
    }
    if (button.dataset.reveal) {
      const owner = session;
      try { const opened = await revealFile(button.dataset.reveal); if (current(owner)) { if (!opened) error(t('common.openFolderFailed')); else feedback('fileRevealed', 'success'); } }
      catch (value) { if (current(owner)) error(value); }
      return;
    }
    if (button.dataset.retain) {
      const group = groups.find(item => item.id === button.dataset.group);
      if (!group) return;
      for (const file of group.files) selected.delete(file.path);
      if (button.dataset.retain === 'extras') for (const path of selectExtras([group], keepers)) selected.add(path);
      feedback(button.dataset.retain === 'extras' ? 'extrasSelected' : 'groupRetained');
      renderResults(); return;
    }
    if (button.dataset.keep) {
      const group = groups.find(item => item.id === button.dataset.group);
      if (group) {
        const result = toggleFileSelection(group, keepers, selected, button.dataset.keep);
        if (result.blocked) { feedback('lastCopy', 'warning'); return; }
        selected = result.selected; keepers.set(group.id, result.keepPath);
        feedback(selected.has(button.dataset.keep) ? 'copySelected' : 'copyRetained');
      }
    } else if (button.dataset.filePage) filePages.set(button.dataset.group, Number(button.dataset.filePage));
    renderResults();
  });
  lifecycle.event(q('Remove'), 'click', () => {
    try { if (!removalPlan(groups, keepers, selected).length) return; }
    catch { feedback('keepRequired', 'warning'); return; }
    const totals = summary(groups, selected); showDialog('confirm', tr('confirmText', { count: totals.selectedCount, size: formatFileSize(totals.selectedBytes) }));
  });
  lifecycle.event(q('DialogConfirm'), 'click', remove);
  lifecycle.event(q('DialogCancel'), 'click', () => modal.close()); lifecycle.event(q('DialogOk'), 'click', () => modal.close());
  lifecycle.event(overlay, 'click', event => { if (event.target.closest('[data-duplicate-close]')) close(); });
  lifecycle.event(documentRef, 'keydown', event => { if (event.key === 'Escape' && session && !dialogRoot.classList.contains('visible')) close(); });
  lifecycle.event(documentRef.defaultView, 'pagehide', close);
  lifecycle.use(onLangChange(() => { if (session) { applyTranslations(overlay); applyTranslations(dialogRoot); if (cleanupView.active()) cleanupView.refresh(); else renderResults(); if (dialogRoot.classList.contains('visible')) modal.close(); } }));
  function open() {
    if (disposed || session) return;
    session = createLifecycleScope(); session.interval(poll, 600);
    cleanupView.hide(); reset();
    for (const key of ['DialogConfirm', 'DialogCancel', 'DialogOk']) q(key).disabled = false;
    applyTranslations(overlay); applyTranslations(dialogRoot);
    overlay.inert = false; overlay.setAttribute('aria-hidden', 'false'); overlay.classList.add('visible');
    background = initStandardToolPlasma(q('CleanupBackground'));
    renderResults(); q('Choose').focus();
  }
  function close() {
    if (!session) return;
    cancelScan(); disposeAnimation(); session.dispose(); session = null; modal.close({ restore: false }); cleanupView.hide(); moveFocusOutOfHiddenRegion(overlay);
    overlay.classList.remove('visible'); overlay.inert = true; overlay.setAttribute('aria-hidden', 'true');
    disposeStandardToolPlasma(background); background = null; groups = []; selected.clear(); busy = cleaning = false;
  }
  function dispose() { if (disposed) return; close(); disposed = true; cleanupView.dispose(); modal.dispose(); lifecycle.dispose(); }
  return { open, close, dispose };
}
