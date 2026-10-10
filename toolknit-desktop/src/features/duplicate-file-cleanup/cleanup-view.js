import { createLifecycleScope } from '../../app/tool-lifecycle.js';
import { moveFocusOutOfHiddenRegion } from '../../shared/tool-page-shell.js';
import { formatFileSize } from '../../shared/file-size.js';
import { startScanAnimation } from './scan-animation.js';
import { cleanupOutcome } from './core.js';

export function createCleanupView({ overlay, translate: tr, onStop, onReturn }) {
  const doc = overlay.ownerDocument, win = doc.defaultView;
  const q = name => doc.getElementById(`duplicateCleanup${name}`);
  const root = q('Layer'), body = root.parentElement;
  const underlying = [...body.children].filter(child => child !== root);
  const scope = createLifecycleScope();
  let stopAnimation = null, timer = null, result = null, progress = null, started = 0, returning = false;
  const stop = () => { stopAnimation?.(); stopAnimation = null; };
  const time = milliseconds => tr('cleanupTime', { seconds: Math.floor(milliseconds / 1000) });
  function refresh() {
    if (root.hidden) return;
    if (result) {
      const outcome = cleanupOutcome(result);
      root.dataset.outcome = outcome;
      q('Title').textContent = tr(`outcome_${outcome}`);
      q('Message').textContent = tr(result.uncertain ? 'cleanupUncertain' : outcome === 'stopped' ? 'cleanupStoppedHint' : 'cleanupResultHint');
      q('Succeeded').textContent = String(result.confirmed_succeeded ?? result.items.filter(item => item.ok).length);
      q('Failed').textContent = String(result.confirmed_failed ?? result.items.filter(item => !item.ok).length);
      q('Unprocessed').textContent = result.uncertain ? tr('unknownCount') : String(result.unprocessed || 0);
      q('Bytes').textContent = formatFileSize(result.moved_bytes || 0);
      q('Time').textContent = time(result.elapsed_ms || 0);
    } else {
      q('Title').textContent = tr('cleaningTitle');
      q('Message').textContent = tr('cleanupRunningHint');
      const total = progress?.cleanup_total || 1, completed = Math.min(progress?.cleanup_completed || 0, total);
      q('Progress').max = total; q('Progress').value = completed;
      q('Percent').textContent = `${Math.floor(completed / total * 100)}%`;
      q('Stage').textContent = tr(`cleanupStage_${progress?.cleanup_stage === 'recycling' ? 'recycling' : 'validating'}`);
      q('Counts').textContent = tr('cleanupCounts', { completed, total, verified: progress?.cleanup_verified || 0, succeeded: progress?.cleanup_succeeded || 0, failed: progress?.cleanup_failed || 0 });
      q('Current').textContent = progress?.cleanup_current || '';
      q('Time').textContent = time(Math.max(progress?.cleanup_elapsed_ms || 0, Date.now() - started));
      q('Stop').textContent = tr(q('Stop').disabled ? 'stoppingCleanup' : 'stopCleanup');
    }
  }
  function show(total) {
    if (timer) { win.clearTimeout(timer); timer = null; }
    returning = false; stop(); result = null; progress = { cleanup_total: total }; started = Date.now();
    root.hidden = false; root.inert = false; root.setAttribute('aria-hidden', 'false'); root.removeAttribute('data-outcome');
    body.classList.add('is-cleanup-active');
    for (const child of underlying) { moveFocusOutOfHiddenRegion(child); child.inert = true; child.setAttribute('aria-hidden', 'true'); }
    for (const key of ['Running', 'ProgressArea', 'Quote', 'Stop']) q(key).hidden = false;
    for (const key of ['Artwork', 'Stats', 'Return', 'FailureDetails']) q(key).hidden = true;
    q('Stop').disabled = false;
    q('Stop').textContent = tr('stopCleanup');
    q('FailureList').replaceChildren(); q('FailureDetails').open = false;
    root.classList.remove('is-leaving'); root.classList.add('is-visible');
    refresh(); root.focus({ preventScroll: true });
    stopAnimation = startScanAnimation(q('Canvas'), q('Quote'), tr);
  }
  function update(value) { if (!result) { progress = value; refresh(); } }
  function finish(value) {
    result = value; stop();
    for (const key of ['Running', 'ProgressArea', 'Quote', 'Stop']) q(key).hidden = true;
    for (const key of ['Artwork', 'Stats', 'Return']) q(key).hidden = false;
    const failures = value.items.filter(item => !item.ok);
    q('FailureList').replaceChildren();
    for (const failure of failures.slice(0, 50)) {
      const entry = doc.createElement('p'); entry.textContent = `${failure.path}: ${failure.error || ''}`; q('FailureList').append(entry);
    }
    if (failures.length > 50) { const extra = doc.createElement('p'); extra.textContent = tr('moreFailures', { count: failures.length - 50 }); q('FailureList').append(extra); }
    q('FailureDetails').hidden = !failures.length;
    refresh(); q('Return').focus({ preventScroll: true });
  }
  function hide() {
    stop(); if (timer) win.clearTimeout(timer); timer = null;
    moveFocusOutOfHiddenRegion(root); root.inert = true; root.setAttribute('aria-hidden', 'true'); root.hidden = true;
    root.classList.remove('is-visible', 'is-leaving'); body.classList.remove('is-cleanup-active');
    for (const child of underlying) { child.inert = false; child.removeAttribute('aria-hidden'); }
    result = progress = null; returning = false; q('FailureList').replaceChildren();
  }
  scope.event(q('Stop'), 'click', () => {
    if (q('Stop').disabled) return;
    q('Stop').disabled = true; q('Stop').textContent = tr('stoppingCleanup'); onStop();
  });
  scope.event(q('Return'), 'click', () => {
    if (returning) return;
    returning = true; onReturn(); root.classList.add('is-leaving');
    const complete = () => { hide(); doc.getElementById('duplicateChoose').focus({ preventScroll: true }); };
    if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) complete();
    else timer = win.setTimeout(complete, 260);
  });
  scope.interval(() => { if (!root.hidden && !result && !doc.hidden) refresh(); }, 1000);
  function dispose() { hide(); scope.dispose(); }
  return { show, update, finish, refresh, hide, dispose, active: () => !root.hidden };
}
