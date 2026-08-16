import assert from 'node:assert/strict';
import {
  BpmDetectError,
  BPM_DETECT_LIMITS,
  analyzeAudioKeyPcm,
  analyzeBpmPcm,
  analyzeMusicTempoPcm,
  assertBpmAudioBuffer,
  assertBpmInputSize,
  fuseBpmAnalyses,
  getBpmAnalysisSpec,
  isBpmSupportedAudioName,
  normalizeBpmCandidates
} from '../src/bpm-detect-core.js';
import MusicTempo from 'music-tempo';

assert.equal(assertBpmInputSize(1024), 1024);
assert.throws(() => assertBpmInputSize(0), (error) => error instanceof BpmDetectError && error.code === 'invalid_input');
assert.throws(
  () => assertBpmInputSize(BPM_DETECT_LIMITS.maxInputBytes + 1),
  (error) => error instanceof BpmDetectError && error.code === 'input_too_large'
);
assert.equal(
  assertBpmAudioBuffer({ duration: 180, numberOfChannels: 2, sampleRate: 48000 }).duration,
  180
);
assert.throws(
  () => assertBpmAudioBuffer({ duration: BPM_DETECT_LIMITS.maxDurationSeconds + 1, numberOfChannels: 2, sampleRate: 48000 }),
  (error) => error instanceof BpmDetectError && error.code === 'audio_too_long'
);
assert.throws(
  () => assertBpmAudioBuffer({ duration: 180, numberOfChannels: 6, sampleRate: 48000 }),
  (error) => error instanceof BpmDetectError && error.code === 'unsupported_channels'
);
assert.throws(
  () => assertBpmAudioBuffer({
    duration: 240,
    numberOfChannels: 2,
    sampleRate: 192000,
    length: 240 * 192000
  }),
  (error) => error instanceof BpmDetectError && error.code === 'decoded_audio_too_large'
);
assert.deepEqual(
  getBpmAnalysisSpec({ duration: 180, numberOfChannels: 2, sampleRate: 48000, length: 180 * 48000 }),
  { sampleRate: BPM_DETECT_LIMITS.analysisSampleRate, frameCount: BPM_DETECT_LIMITS.maxAnalysisSeconds * BPM_DETECT_LIMITS.analysisSampleRate }
);
assert.deepEqual(
  normalizeBpmCandidates([{ tempo: 128.4, count: 2 }, { tempo: Infinity, count: 99 }, { tempo: 15, count: 99 }, { tempo: 120, count: 8 }]),
  [{ tempo: 120, count: 8 }, { tempo: 128.4, count: 2 }]
);
assert.equal(isBpmSupportedAudioName('track.M4A'), true);
assert.equal(isBpmSupportedAudioName('track.txt'), false);

const clickRate = BPM_DETECT_LIMITS.analysisSampleRate;
const clickSamples = new Float32Array(clickRate * 24);
for (let beat = 0; beat < 48; beat++) {
  const start = Math.round(beat * clickRate * 0.5);
  for (let offset = 0; offset < Math.min(110, clickSamples.length - start); offset++) {
    clickSamples[start + offset] = (1 - offset / 110) * 0.9;
  }
}
const detected = analyzeBpmPcm(clickSamples, clickRate);
assert.ok(detected.bpm >= 118 && detected.bpm <= 122, `Expected 120 BPM, got ${detected.bpm}`);
assert.ok(detected.confidence > 0.1);
assert.ok(detected.candidates.length >= 1);
assert.equal(analyzeBpmPcm(new Float32Array(clickRate), clickRate).bpm, null);

const fused = fuseBpmAnalyses({
  realtimeTempos: [{ tempo: 119.8, count: 10 }, { tempo: 60, count: 3 }],
  pcmAnalysis: detected
});
assert.ok(fused.bpm >= 118 && fused.bpm <= 122, `Expected fused 120 BPM, got ${fused.bpm}`);
assert.ok(fused.confidence >= detected.confidence);

function synthClickTrack(bpm, seconds = 24) {
  const samples = new Float32Array(clickRate * seconds);
  const interval = 60 / bpm;
  for (let beat = 0; beat < seconds / interval; beat++) {
    const start = Math.round(beat * interval * clickRate);
    for (let offset = 0; offset < Math.min(110, samples.length - start); offset++) {
      samples[start + offset] += (1 - offset / 110) * 0.9;
    }
  }
  return samples;
}

for (const expectedBpm of [154, 164]) {
  const samples = synthClickTrack(expectedBpm);
  const local = analyzeBpmPcm(samples, clickRate);
  const beatroot = analyzeMusicTempoPcm(samples, clickRate, MusicTempo);
  const result = fuseBpmAnalyses({
    realtimeTempos: [{ tempo: Math.round(expectedBpm / 1.5), count: 6 }],
    pcmAnalysis: local,
    beatrootAnalysis: beatroot
  });
  assert.ok(Math.abs(result.bpm - expectedBpm) <= 2, `Expected ${expectedBpm} BPM, got ${result.bpm}`);
  assert.ok(result.candidates.some(candidate => Math.abs(candidate.bpm - expectedBpm) <= 2));
}

const keyRate = BPM_DETECT_LIMITS.analysisSampleRate;
const keySamples = new Float32Array(keyRate * 8);
const cMajorFrequencies = [261.63, 329.63, 392.0];
for (let index = 0; index < keySamples.length; index++) {
  const time = index / keyRate;
  keySamples[index] = cMajorFrequencies.reduce((sum, frequency) => sum + Math.sin(2 * Math.PI * frequency * time) * 0.18, 0);
}
const keyDetected = analyzeAudioKeyPcm(keySamples, keyRate);
assert.ok(keyDetected.candidates.length >= 1);
assert.match(keyDetected.key || keyDetected.candidates[0].key, /^C Major|A Minor/);

console.log('BPM detection core regression checks passed');
