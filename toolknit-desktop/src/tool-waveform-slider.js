// Reusable waveform drag slider: a row of ascending bars (short on the left,
// tall on the right, like a volume waveform) where the value lights the bars
// up to the current position. Pointer drag and keyboard both set the value.
const DEFAULT_BARS = 50;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createWaveformSlider({
  bars = DEFAULT_BARS,
  min = 0,
  max = 1,
  step = (max - min) / 100,
  value = (min + max) / 2,
  ariaLabel = '',
  badge = true,
  onInput = () => {},
  onChange = () => {}
} = {}) {
  const listeners = new AbortController();
  const listenerOptions = { signal: listeners.signal };

  const root = document.createElement('div');
  root.className = 'wave-slider';
  root.tabIndex = 0;
  root.setAttribute('role', 'slider');
  root.setAttribute('aria-orientation', 'horizontal');

  const track = document.createElement('div');
  track.className = 'wave-slider-track';
  const barNodes = [];
  for (let index = 0; index < bars; index += 1) {
    const bar = document.createElement('span');
    bar.className = 'wave-slider-bar';
    const phase = bars === 1 ? 1 : index / (bars - 1);
    // 22% -> 100% of the track height keeps even the shortest bars visible.
    bar.style.height = `${(22 + phase * 78).toFixed(2)}%`;
    track.append(bar);
    barNodes.push(bar);
  }
  root.append(track);

  let badgeNode = null;
  if (badge) {
    badgeNode = document.createElement('span');
    badgeNode.className = 'wave-slider-badge';
    badgeNode.setAttribute('aria-hidden', 'true');
    root.append(badgeNode);
  }

  let current = clamp(Number(value) || min, min, max);
  let formatBadge = value_ => String(value_);

  function quantize(next) {
    const clamped = clamp(Number(next) || min, min, max);
    const snapped = Math.round((clamped - min) / step) * step + min;
    return +clamp(snapped, min, max).toFixed(4);
  }

  function render() {
    const fraction = max === min ? 1 : (current - min) / (max - min);
    const threshold = fraction * bars;
    barNodes.forEach((bar, index) => {
      bar.classList.toggle('is-lit', index + 0.5 <= threshold);
    });
    root.setAttribute('aria-valuemin', String(min));
    root.setAttribute('aria-valuemax', String(max));
    root.setAttribute('aria-valuenow', String(current));
    if (badgeNode) badgeNode.textContent = formatBadge(current);
  }

  function setValue(next, { emitInput = true, emitChange = false } = {}) {
    current = quantize(next);
    render();
    if (emitInput) onInput(current);
    if (emitChange) onChange(current);
  }

  function valueFromPointer(event) {
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return current;
    const fraction = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    return min + fraction * (max - min);
  }

  root.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    try { root.setPointerCapture(event.pointerId); } catch {}
    root.classList.add('is-dragging');
    setValue(valueFromPointer(event));
  }, listenerOptions);

  root.addEventListener('pointermove', event => {
    if (!root.classList.contains('is-dragging')) return;
    setValue(valueFromPointer(event));
  }, listenerOptions);

  const endDrag = event => {
    if (!root.classList.contains('is-dragging')) return;
    try { root.releasePointerCapture(event.pointerId); } catch {}
    root.classList.remove('is-dragging');
    onChange(current);
  };
  root.addEventListener('pointerup', endDrag, listenerOptions);
  root.addEventListener('pointercancel', endDrag, listenerOptions);

  root.addEventListener('keydown', event => {
    let next = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = current + step;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = current - step;
    else if (event.key === 'PageUp') next = current + step * 10;
    else if (event.key === 'PageDown') next = current - step * 10;
    else if (event.key === 'Home') next = min;
    else if (event.key === 'End') next = max;
    if (next === null) return;
    // Keep tool-level arrow/speed shortcuts from also firing on this focus.
    event.preventDefault();
    event.stopPropagation();
    setValue(next, { emitChange: true });
  }, listenerOptions);

  root.addEventListener('pointerenter', () => root.classList.add('is-active'), listenerOptions);
  root.addEventListener('pointerleave', () => root.classList.remove('is-active'), listenerOptions);
  root.addEventListener('focus', () => root.classList.add('is-active'), listenerOptions);
  root.addEventListener('blur', () => root.classList.remove('is-active'), listenerOptions);

  render();

  return {
    element: root,
    getValue: () => current,
    setValue(next) {
      setValue(next, { emitInput: false, emitChange: false });
    },
    setBadgeFormatter(formatter) {
      if (typeof formatter === 'function') formatBadge = formatter;
      render();
    },
    setAriaLabel(label) {
      root.setAttribute('aria-label', label || '');
    },
    dispose() {
      listeners.abort();
      root.replaceChildren();
      root.remove();
    }
  };
}
