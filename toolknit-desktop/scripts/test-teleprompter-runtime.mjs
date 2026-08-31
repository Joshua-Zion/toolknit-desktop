import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/teleprompter-ui.js', import.meta.url), 'utf8');
const start = source.indexOf('function startSystemRecognition');
const end = source.indexOf('async function stopOfflineRecognition');
assert.ok(start >= 0 && end > start, 'system recognition implementation must exist');
const system = source.slice(start, end);

assert.match(source, /toolknit\.teleprompter\.preferences\.v2/);
assert.match(source, /LEGACY_PREF_KEY\s*=\s*'toolknit\.teleprompter\.preferences\.v1'/);
assert.match(source, /engine:\s*isTauri\s*\?\s*'offline'\s*:\s*'auto'/,
  'desktop preferences must default to local recognition');
assert.match(system, /recognition\.onstart\s*=\s*\(\)\s*=>[\s\S]*setEngineStatus\('listening', 'engineListening'\)/,
  'listening is shown only after SpeechRecognition confirms onstart');
assert.doesNotMatch(system, /recognition\.start\(\);\s*setEngineStatus\('listening'/,
  'calling start alone must not claim that recognition is listening');
assert.match(system, /SYSTEM_START_TIMEOUT_MS/);
assert.match(system, /SYSTEM_FIRST_RESULT_TIMEOUT_MS/);
assert.match(system, /createSystemSpeechTranscriptState\(\)/,
  'system finals must survive events and automatic recognition restarts');
assert.match(source, /const shouldUseSystem = preferences\.engine === 'system' \|\| \(!isTauri && preferences\.engine === 'auto'\)/,
  'desktop automatic mode must use offline recognition first');
assert.match(source, /function usesAutomaticScroll\(\)[\s\S]*recognitionRuntime === 'fallback'/,
  'failed recognition must fall back to normal scrolling');
assert.match(source, /if \(usesAutomaticScroll\(\)\)[\s\S]*setVirtualScrollTop/,
  'the animation loop must continue during recognition fallback');
assert.match(source, /async function chooseEngine[\s\S]*await stopRecognition\(\{ updateStatus: false \}\)/,
  'switching engines during playback must release the previous microphone session first');

console.log('teleprompter runtime contract passed');
