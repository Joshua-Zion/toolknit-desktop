import assert from 'node:assert/strict';
import {
  COLOR_SPACE_SLIDER_CONFIG,
  getSpaceValues,
  spaceToXyz,
  xyzToAllSpaces,
  xyzToDisplayRgb,
} from '../src/color-space-compare-core.js';
import {
  bindColorNumberInput,
  getColorSliderPresentation,
  preserveColorSpaceValues,
  replaceColorSpaceChannel,
} from '../src/color-space-compare-controls.js';

function approx(actual, expected, epsilon, message) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: expected ${expected}, got ${actual}`);
}

function getConvertedValues(sourceSpace, sourceValues, targetSpace) {
  const xyz = spaceToXyz(sourceSpace, sourceValues);
  const displayRgb = xyzToDisplayRgb(xyz.x, xyz.y, xyz.z);
  return getSpaceValues(targetSpace, xyzToAllSpaces(xyz, displayRgb), displayRgb);
}

// Converted values are allowed to exceed another space's visual slider range.
// Editing one channel in that target space must retain every untouched value.
const convertedOklch = preserveColorSpaceValues(
  'oklch',
  getConvertedValues('oklab', { L: 0.5, a: 0.4, b: 0.4 }, 'oklch')
);
approx(convertedOklch.C, Math.hypot(0.4, 0.4), 1e-12, 'OKLab to OKLCH chroma');
assert.ok(
  convertedOklch.C > COLOR_SPACE_SLIDER_CONFIG.oklch.channels[1].max,
  'The true linked OKLCH chroma must remain above the editable slider range.'
);
const oklchChromaPresentation = getColorSliderPresentation(
  convertedOklch.C,
  COLOR_SPACE_SLIDER_CONFIG.oklch.channels[1]
);
approx(oklchChromaPresentation.value, convertedOklch.C, 1e-15, 'Displayed OKLCH C');
assert.equal(oklchChromaPresentation.sliderValue, 0.4, 'Only the OKLCH C handle is clamped.');
assert.equal(oklchChromaPresentation.ratio, 1);
assert.equal(oklchChromaPresentation.isOutsideRange, true);
const editedOklch = replaceColorSpaceChannel('oklch', convertedOklch, 'L', 0.6);
approx(editedOklch.C, convertedOklch.C, 1e-15, 'Editing OKLCH L must retain linked C');
assert.deepEqual(
  spaceToXyz('oklch', editedOklch),
  spaceToXyz('oklch', { ...convertedOklch, L: 0.6 }),
  'Continuing to edit OKLCH must not jump to a slider-clamped color.'
);

const convertedLab = preserveColorSpaceValues(
  'lab',
  getConvertedValues('lch', { L: 50, C: 200, H: 0 }, 'lab')
);
approx(convertedLab.a, 200, 1e-9, 'LCh D65 to Lab a');
assert.ok(
  convertedLab.a > COLOR_SPACE_SLIDER_CONFIG.lab.channels[1].max,
  'The true linked Lab a value must remain above the editable slider range.'
);
const labAPresentation = getColorSliderPresentation(
  convertedLab.a,
  COLOR_SPACE_SLIDER_CONFIG.lab.channels[1]
);
approx(labAPresentation.value, convertedLab.a, 1e-15, 'Displayed Lab a');
assert.equal(labAPresentation.sliderValue, 128, 'Only the Lab a handle is clamped.');
assert.equal(labAPresentation.ratio, 1);
assert.equal(labAPresentation.isOutsideRange, true);
const editedLab = replaceColorSpaceChannel('lab', convertedLab, 'L', 60);
approx(editedLab.a, convertedLab.a, 1e-15, 'Editing Lab L must retain linked a');
assert.deepEqual(
  spaceToXyz('lab', editedLab),
  spaceToXyz('lab', { ...convertedLab, L: 60 }),
  'Continuing to edit Lab must not jump to a slider-clamped color.'
);

class FakeInput {
  constructor(value = '') {
    this.value = value;
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  emit(type, event = {}) {
    const normalizedEvent = {
      key: '',
      preventDefault() {},
      stopPropagation() {},
      ...event,
    };
    for (const handler of this.listeners.get(type) ?? []) handler(normalizedEvent);
  }

  focus() {
    this.emit('focus');
  }

  blur() {
    this.emit('change');
    this.emit('blur');
  }
}

function createInputHarness(initialValue, config) {
  const input = new FakeInput(String(initialValue));
  let modelValue = Number(initialValue);
  const transientValues = [];
  const committedValues = [];
  const controller = bindColorNumberInput(input, {
    config,
    getCurrentValue: () => modelValue,
    applyTransientValue: value => {
      modelValue = value;
      transientValues.push(value);
    },
    applyCommittedValue: value => {
      modelValue = value;
      committedValues.push(value);
    },
    stepValue: () => {},
  });
  return { input, controller, transientValues, committedValues, getValue: () => modelValue };
}

function typeDraft(harness, draft, expectedValue) {
  harness.input.value = draft;
  harness.input.emit('input');
  assert.equal(harness.input.value, draft, `Input draft ${JSON.stringify(draft)} must not be rewritten.`);
  if (expectedValue !== undefined) assert.equal(harness.getValue(), expectedValue);
}

const labAConfig = COLOR_SPACE_SLIDER_CONFIG.lab.channels[1];

const multiDigit = createInputHarness(0, labAConfig);
multiDigit.input.focus();
typeDraft(multiDigit, '1', 1);
assert.equal(multiDigit.controller.isEditing(), true);
typeDraft(multiDigit, '12', 12);
assert.equal(multiDigit.committedValues.length, 0, 'Typing digits must not commit or format early.');
multiDigit.input.emit('change');
assert.equal(multiDigit.input.value, '12.0');
assert.equal(multiDigit.committedValues.at(-1), 12);

const negative = createInputHarness(0, labAConfig);
negative.input.focus();
typeDraft(negative, '-', 0);
typeDraft(negative, '-2', -2);
typeDraft(negative, '-20.5', -20.5);
negative.input.emit('keydown', { key: 'Enter' });
assert.equal(negative.input.value, '-20.5');
assert.equal(negative.committedValues.at(-1), -20.5);

const decimal = createInputHarness(0, COLOR_SPACE_SLIDER_CONFIG.oklab.channels[0]);
decimal.input.focus();
typeDraft(decimal, '0', 0);
typeDraft(decimal, '0.', 0);
typeDraft(decimal, '0.4', 0.4);
decimal.input.emit('blur');
assert.equal(decimal.input.value, '0.400');
assert.equal(decimal.committedValues.at(-1), 0.4);

// Merely focusing and leaving a linked out-of-range value must not clamp it.
const linkedValue = createInputHarness(convertedOklch.C, COLOR_SPACE_SLIDER_CONFIG.oklch.channels[1]);
linkedValue.input.focus();
linkedValue.input.emit('blur');
approx(linkedValue.getValue(), convertedOklch.C, 1e-15, 'Untouched linked value');
assert.equal(linkedValue.committedValues.length, 0);

console.log('Color space compare runtime regression checks passed');
