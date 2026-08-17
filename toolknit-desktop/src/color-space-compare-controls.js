import {
  COLOR_SPACE_SLIDER_CONFIG,
  fmtColorNumber,
  normalizeSliderValue,
} from './color-space-compare-core.js';

function getSpaceConfig(space) {
  const config = COLOR_SPACE_SLIDER_CONFIG[space];
  if (!config) throw new RangeError(`Unsupported color space: ${space}`);
  return config;
}

/**
 * Keep converted channel values intact, even when they sit outside the range
 * covered by the visual slider. Invalid values fall back channel-by-channel.
 */
export function preserveColorSpaceValues(space, values, fallbackValues = {}) {
  const preserved = {};
  for (const channel of getSpaceConfig(space).channels) {
    const value = Number(values?.[channel.key]);
    const fallback = Number(fallbackValues?.[channel.key]);
    preserved[channel.key] = Number.isFinite(value)
      ? value
      : Number.isFinite(fallback)
        ? fallback
        : channel.min;
  }
  return preserved;
}

/**
 * Replace only the channel the user touched. Untouched converted channels are
 * deliberately not normalized so changing one control cannot silently alter
 * the represented color.
 */
export function replaceColorSpaceChannel(space, values, channelKey, rawValue, { normalize = true } = {}) {
  const config = getSpaceConfig(space);
  const channel = config.channels.find(entry => entry.key === channelKey);
  if (!channel) throw new RangeError(`Unsupported ${space} channel: ${channelKey}`);

  const numericValue = Number(rawValue);
  const value = normalize
    ? normalizeSliderValue(numericValue, channel)
    : Number.isFinite(numericValue)
      ? numericValue
      : null;
  if (value === null) return null;

  return {
    ...preserveColorSpaceValues(space, values),
    [channelKey]: value,
  };
}

export function parseColorNumberDraft(rawText) {
  const text = String(rawText ?? '').trim();
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * Present the exact converted value while constraining only the visual slider
 * position to its editable track.
 */
export function getColorSliderPresentation(rawValue, config) {
  const numericValue = Number(rawValue);
  const value = Number.isFinite(numericValue) ? numericValue : config.min;
  const sliderValue = Math.max(config.min, Math.min(config.max, value));
  return {
    value,
    sliderValue,
    ratio: (sliderValue - config.min) / (config.max - config.min),
    isOutsideRange: value < config.min || value > config.max,
  };
}

/**
 * Bind an exact-value input without rewriting its draft on every keystroke.
 * Valid drafts update the color live; normalization and formatting happen only
 * when the user commits with change, blur, or Enter.
 */
export function bindColorNumberInput(input, {
  config,
  getCurrentValue,
  applyTransientValue,
  applyCommittedValue,
  stepValue,
}) {
  let editing = false;
  let dirty = false;
  let valueBeforeEditing = null;
  let suppressNextBlur = false;

  function beginEditing() {
    if (editing) return;
    editing = true;
    valueBeforeEditing = Number(getCurrentValue());
  }

  function writeFormatted(value) {
    input.value = fmtColorNumber(value, config.decimals);
  }

  function commit() {
    if (!dirty) {
      editing = false;
      const current = Number(getCurrentValue());
      if (Number.isFinite(current)) writeFormatted(current);
      return false;
    }

    const draft = parseColorNumberDraft(input.value);
    const fallback = Number(getCurrentValue());
    const value = normalizeSliderValue(draft ?? fallback, config);
    editing = false;
    dirty = false;
    if (value === null) return false;
    applyCommittedValue(value);
    writeFormatted(value);
    return true;
  }

  input.addEventListener('focus', beginEditing);
  input.addEventListener('input', () => {
    beginEditing();
    dirty = true;
    const value = parseColorNumberDraft(input.value);
    if (value !== null) applyTransientValue(value);
  });
  input.addEventListener('change', commit);
  input.addEventListener('blur', () => {
    if (suppressNextBlur) {
      suppressNextBlur = false;
      return;
    }
    commit();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      editing = false;
      dirty = false;
      stepValue(event.key === 'ArrowUp' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      suppressNextBlur = true;
      input.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      const restoreValue = Number.isFinite(valueBeforeEditing)
        ? valueBeforeEditing
        : Number(getCurrentValue());
      editing = false;
      dirty = false;
      if (Number.isFinite(restoreValue)) {
        applyTransientValue(restoreValue);
        writeFormatted(restoreValue);
      }
      suppressNextBlur = true;
      input.blur();
    }
  });

  return {
    isEditing: () => editing,
    commit,
  };
}
