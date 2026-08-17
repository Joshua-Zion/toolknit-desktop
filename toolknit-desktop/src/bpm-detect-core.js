export const BPM_DETECT_LIMITS = Object.freeze({
  maxInputBytes: 50 * 1024 * 1024,
  maxDurationSeconds: 5 * 60,
  maxChannels: 2,
  maxDecodedPcmBytes: 192 * 1024 * 1024,
  maxAnalysisSeconds: 120,
  analysisSampleRate: 11025
});

const BPM_DISPLAY_MIN = 30;
const BPM_DISPLAY_MAX = 300;
const BPM_SOURCE_EXTENSIONS = new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a']);
const BPM_ANALYSIS_MIN = 55;
const BPM_ANALYSIS_MAX = 210;
const BPM_ENVELOPE_WINDOW = 1024;
const BPM_ENVELOPE_HOP = 512;
const BPM_COMMON_MIN = 70;
const BPM_COMMON_MAX = 180;
const BPM_MUSIC_TEMPO_MAX_SEGMENT_SECONDS = 42;
const BPM_KEY_MAX_ANALYSIS_SECONDS = 52;
const BPM_KEY_FRAME_SIZE = 4096;
const BPM_KEY_HOP_SIZE = 4096;
const KEY_NAMES = Object.freeze(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']);
const MAJOR_KEY_PROFILE = Object.freeze([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]);
const MINOR_KEY_PROFILE = Object.freeze([6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]);

export class BpmDetectError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BpmDetectError';
    this.code = code;
  }
}

export function assertBpmInputSize(byteLength) {
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0) {
    throw new BpmDetectError('invalid_input', 'The audio file is empty or has an invalid size.');
  }
  if (byteLength > BPM_DETECT_LIMITS.maxInputBytes) {
    throw new BpmDetectError(
      'input_too_large',
      `Audio files for BPM detection must be ${Math.floor(BPM_DETECT_LIMITS.maxInputBytes / 1024 / 1024)}MB or smaller.`
    );
  }
  return byteLength;
}

export function assertBpmAudioBuffer(audioBuffer) {
  const duration = Number(audioBuffer?.duration);
  const channels = Number(audioBuffer?.numberOfChannels);
  const sampleRate = Number(audioBuffer?.sampleRate);

  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new BpmDetectError('invalid_audio', 'The selected file could not be decoded as audio.');
  }
  if (duration > BPM_DETECT_LIMITS.maxDurationSeconds) {
    throw new BpmDetectError(
      'audio_too_long',
      `BPM detection supports audio up to ${Math.floor(BPM_DETECT_LIMITS.maxDurationSeconds / 60)} minutes.`
    );
  }
  if (!Number.isInteger(channels) || channels < 1 || channels > BPM_DETECT_LIMITS.maxChannels) {
    throw new BpmDetectError('unsupported_channels', 'BPM detection supports mono or stereo audio only.');
  }
  const frameCount = Number.isSafeInteger(audioBuffer?.length) && audioBuffer.length > 0
    ? audioBuffer.length
    : Math.ceil(duration * sampleRate);
  const decodedBytes = frameCount * channels * Float32Array.BYTES_PER_ELEMENT;
  if (!Number.isSafeInteger(frameCount) || !Number.isSafeInteger(decodedBytes) || decodedBytes > BPM_DETECT_LIMITS.maxDecodedPcmBytes) {
    throw new BpmDetectError('decoded_audio_too_large', 'The decoded audio is too large for safe BPM analysis.');
  }
  return audioBuffer;
}

export function getBpmAnalysisSpec(audioBuffer) {
  assertBpmAudioBuffer(audioBuffer);
  const sampleRate = Math.min(audioBuffer.sampleRate, BPM_DETECT_LIMITS.analysisSampleRate);
  const duration = Math.min(audioBuffer.duration, BPM_DETECT_LIMITS.maxAnalysisSeconds);
  const frameCount = Math.max(1, Math.floor(duration * sampleRate));
  return { sampleRate, frameCount };
}

export function normalizeBpmCandidates(tempos) {
  if (!Array.isArray(tempos)) return [];
  return tempos
    .map((candidate) => {
      const tempo = Number(candidate?.tempo);
      const count = Number(candidate?.count);
      return {
        tempo,
        count: Number.isFinite(count) && count >= 0 ? count : 0
      };
    })
    .filter(({ tempo }) => Number.isFinite(tempo) && tempo >= BPM_DISPLAY_MIN && tempo <= BPM_DISPLAY_MAX)
    .sort((left, right) => right.count - left.count || left.tempo - right.tempo)
    .slice(0, 5);
}

export function isBpmSupportedAudioName(name) {
  const extension = typeof name === 'string' ? /\.([^.\\/]+)$/.exec(name.trim())?.[1]?.toLowerCase() : '';
  return BPM_SOURCE_EXTENSIONS.has(extension);
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

function normalizeTempo(tempo) {
  let normalized = tempo;
  while (normalized < BPM_ANALYSIS_MIN) normalized *= 2;
  while (normalized > BPM_ANALYSIS_MAX) normalized /= 2;
  return normalized;
}

function addTempoCandidate(merged, tempo, score, source = 'local') {
  if (!Number.isFinite(tempo) || !Number.isFinite(score) || score <= 0) return;
  const normalized = normalizeTempo(tempo);
  if (!Number.isFinite(normalized) || normalized < BPM_DISPLAY_MIN || normalized > BPM_DISPLAY_MAX) return;
  const key = Math.round(normalized);
  const current = merged.get(key) || { bpm: key, score: 0, sources: new Set() };
  current.score += score;
  current.sources.add(source);
  merged.set(key, current);
}

function tempoAffinity(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) return 0;
  const direct = Math.abs(left - right);
  if (direct <= 1.5) return 1;
  const doubleDiff = Math.abs(left * 2 - right);
  const halfDiff = Math.abs(left - right * 2);
  if (doubleDiff <= 2 || halfDiff <= 2) return 0.42;
  const tripletDiff = Math.min(Math.abs(left * 1.5 - right), Math.abs(left - right * 1.5));
  if (tripletDiff <= 2) return 0.18;
  return 0;
}

function commonTempoPreference(bpm) {
  if (bpm >= 138 && bpm <= 172) return 1.11;
  if (bpm >= 84 && bpm <= 156) return 1.08;
  if (bpm >= BPM_COMMON_MIN && bpm <= BPM_COMMON_MAX) return 1;
  return 0.9;
}

function getCandidateSources(candidate) {
  return candidate?.sources instanceof Set ? candidate.sources : new Set(candidate?.sources || []);
}

function sourceQualityBonus(candidate) {
  const sources = getCandidateSources(candidate);
  let bonus = 0;
  if (sources.has('beatroot-top')) bonus += 0.38;
  if (sources.has('beatroot')) bonus += 0.26;
  if (sources.has('realtime')) bonus += 0.16;
  if (sources.has('local-top')) bonus += 0.1;
  return bonus;
}

function hasProfessionalSource(candidate) {
  const sources = getCandidateSources(candidate);
  return sources.has('beatroot-top') || sources.has('beatroot') || sources.has('realtime');
}

function buildTempoResult(merged, analyzedSeconds) {
  const base = [...merged.values()];
  if (base.length === 0) {
    return { bpm: null, confidence: 0, candidates: [], analyzedSeconds };
  }

  const reinforced = base.map((candidate) => {
    let harmonicScore = 0;
    for (const other of base) {
      if (other === candidate) continue;
      harmonicScore += other.score * tempoAffinity(candidate.bpm, other.bpm) * 0.28;
    }
    const score = (candidate.score + harmonicScore + sourceQualityBonus(candidate)) * commonTempoPreference(candidate.bpm);
    return {
      ...candidate,
      score,
      confidenceScore: candidate.score + harmonicScore
    };
  }).sort((left, right) => right.score - left.score || Math.abs(left.bpm - 120) - Math.abs(right.bpm - 120));

  let first = reinforced[0];
  if (first?.bpm < BPM_COMMON_MIN) {
    const doubleCandidate = reinforced
      .filter(candidate => (
        candidate.bpm >= BPM_COMMON_MIN
        && candidate.bpm <= 156
        && Math.abs(candidate.bpm - first.bpm * 2) <= 4
        && candidate.score >= first.score * 0.34
      ))
      .sort((left, right) => Math.abs(left.bpm - first.bpm * 2) - Math.abs(right.bpm - first.bpm * 2) || right.score - left.score)[0];
    if (doubleCandidate) first = doubleCandidate;
  } else if (first?.bpm > 176) {
    const halfCandidate = reinforced
      .filter(candidate => (
        candidate.bpm >= 88
        && candidate.bpm <= BPM_COMMON_MAX
        && Math.abs(candidate.bpm * 2 - first.bpm) <= 4
        && candidate.score >= first.score * 0.42
      ))
      .sort((left, right) => Math.abs(left.bpm * 2 - first.bpm) - Math.abs(right.bpm * 2 - first.bpm) || right.score - left.score)[0];
    if (halfCandidate) first = halfCandidate;
  }
  if (first?.bpm >= 86 && first.bpm <= 118) {
    const oneAndHalfCandidate = reinforced
      .filter(candidate => (
        candidate.bpm >= 130
        && candidate.bpm <= 176
        && Math.abs(candidate.bpm - first.bpm * 1.5) <= 6
        && candidate.score >= first.score * 0.28
        && hasProfessionalSource(candidate)
      ))
      .sort((left, right) => {
        const leftDistance = Math.abs(left.bpm - first.bpm * 1.5);
        const rightDistance = Math.abs(right.bpm - first.bpm * 1.5);
        return leftDistance - rightDistance || sourceQualityBonus(right) - sourceQualityBonus(left) || right.score - left.score;
      })[0];
    if (oneAndHalfCandidate) first = oneAndHalfCandidate;
  }
  const orderedCandidates = first
    ? [first, ...reinforced.filter(candidate => candidate !== first)]
    : reinforced;
  const secondScore = orderedCandidates.find(candidate => candidate !== first)?.score ?? 0;
  if (!first || first.score < 0.08) {
    return { bpm: null, confidence: 0, candidates: [], analyzedSeconds };
  }
  const separation = 1 - Math.min(0.55, secondScore / Math.max(first.score, 1e-6) * 0.32);
  const sourceBonus = first.sources.size > 1 ? 1.12 : 1;
  const confidence = Math.round(Math.max(0, Math.min(1, first.confidenceScore * sourceBonus * separation)) * 100) / 100;
  return {
    bpm: first.bpm,
    confidence,
    candidates: orderedCandidates.slice(0, 7).map(candidate => ({
      bpm: candidate.bpm,
      confidence: Math.round(Math.max(0, Math.min(1, candidate.confidenceScore)) * 100) / 100,
      sources: candidate.sources instanceof Set ? [...candidate.sources] : []
    })),
    analyzedSeconds
  };
}

function extractPeakIntervalCandidates(envelope, envelopeRate) {
  const minLag = Math.max(1, Math.floor((60 * envelopeRate) / BPM_ANALYSIS_MAX));
  const maxLag = Math.max(minLag + 1, Math.ceil((60 * envelopeRate) / BPM_ANALYSIS_MIN));
  const activeValues = Array.from(envelope).filter(value => value > 0);
  if (activeValues.length < 4) return [];
  const threshold = Math.max(0.08, percentile(activeValues, 0.7) * 0.78);
  const rawPeaks = [];
  for (let index = 1; index < envelope.length - 1; index++) {
    const value = envelope[index];
    if (value < threshold || value < envelope[index - 1] || value <= envelope[index + 1]) continue;
    rawPeaks.push({ index, value });
  }
  if (rawPeaks.length < 3) return [];

  const minDistance = Math.max(1, Math.floor(minLag * 0.62));
  const selected = [];
  for (const peak of rawPeaks.sort((left, right) => right.value - left.value)) {
    if (selected.some(current => Math.abs(current.index - peak.index) < minDistance)) continue;
    selected.push(peak);
    if (selected.length >= 260) break;
  }
  selected.sort((left, right) => left.index - right.index);
  if (selected.length < 3) return [];

  const histogram = new Map();
  for (let left = 0; left < selected.length - 1; left++) {
    for (let right = left + 1; right < selected.length; right++) {
      const distance = selected[right].index - selected[left].index;
      if (distance > maxLag * 4) break;
      const pairWeight = Math.sqrt(selected[left].value * selected[right].value);
      for (let divisor = 1; divisor <= 4; divisor++) {
        const lag = distance / divisor;
        if (lag < minLag || lag > maxLag) continue;
        const tempo = normalizeTempo(60 * envelopeRate / lag);
        const key = Math.round(tempo);
        const score = pairWeight / Math.pow(divisor, 0.82);
        histogram.set(key, (histogram.get(key) || 0) + score);
      }
    }
  }
  const maxScore = Math.max(0, ...histogram.values());
  if (maxScore <= 0) return [];
  return [...histogram.entries()]
    .map(([bpm, score]) => ({ bpm, score: score / maxScore }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);
}

// This is intentionally dependency-free so browser and headless callers analyze the same PCM data.
export function analyzeBpmPcm(samples, sampleRate) {
  if (!(samples instanceof Float32Array) || samples.length < BPM_ENVELOPE_WINDOW * 8) {
    throw new BpmDetectError('invalid_audio', 'The decoded audio is too short for BPM analysis.');
  }
  if (!Number.isFinite(sampleRate) || sampleRate < 1000 || sampleRate > 192000) {
    throw new BpmDetectError('invalid_audio', 'The decoded audio has an invalid sample rate.');
  }

  const energies = [];
  for (let start = 0; start + BPM_ENVELOPE_WINDOW <= samples.length; start += BPM_ENVELOPE_HOP) {
    let sum = 0;
    let peakAbs = 0;
    for (let index = start; index < start + BPM_ENVELOPE_WINDOW; index++) sum += samples[index] * samples[index];
    for (let index = start; index < start + BPM_ENVELOPE_WINDOW; index++) {
      const abs = Math.abs(samples[index]);
      if (abs > peakAbs) peakAbs = abs;
    }
    energies.push(Math.sqrt(sum / BPM_ENVELOPE_WINDOW) * 0.78 + peakAbs * 0.22);
  }
  const floor = median(energies);
  const deviations = energies.map(value => Math.max(0, value - floor));
  const envelope = new Float64Array(deviations.length);
  let peak = 0;
  let onsetTotal = 0;
  for (let index = 0; index < deviations.length; index++) {
    const start = Math.max(0, index - 8);
    let localAverage = 0;
    for (let cursor = start; cursor < index; cursor++) localAverage += deviations[cursor];
    localAverage /= Math.max(1, index - start);
    const risingEdge = Math.max(0, deviations[index] - (deviations[index - 1] || 0));
    const onset = Math.max(0, deviations[index] - localAverage * 0.62) + risingEdge * 0.42;
    envelope[index] = onset;
    peak = Math.max(peak, onset);
    onsetTotal += onset;
  }
  if (peak < 1e-5 || onsetTotal < 1e-4) {
    return { bpm: null, confidence: 0, candidates: [], analyzedSeconds: samples.length / sampleRate };
  }
  for (let index = 0; index < envelope.length; index++) envelope[index] /= peak;

  const envelopeRate = sampleRate / BPM_ENVELOPE_HOP;
  const minLag = Math.max(1, Math.floor((60 * envelopeRate) / BPM_ANALYSIS_MAX));
  const maxLag = Math.min(envelope.length - 2, Math.ceil((60 * envelopeRate) / BPM_ANALYSIS_MIN));
  const rawCandidates = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let index = lag; index < envelope.length; index++) {
      const left = envelope[index];
      const right = envelope[index - lag];
      sum += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const score = sum / Math.sqrt(leftEnergy * rightEnergy || 1);
    if (Number.isFinite(score)) rawCandidates.push({ lag, tempo: 60 * envelopeRate / lag, score });
  }

  const peaks = rawCandidates.map((candidate, index, values) => {
    const before = values[index - 1]?.score ?? -Infinity;
    const after = values[index + 1]?.score ?? -Infinity;
    if (candidate.score < before || candidate.score <= after) return null;
    const curvature = before - 2 * candidate.score + after;
    const offset = Number.isFinite(curvature) && curvature < -1e-9
      ? Math.max(-0.5, Math.min(0.5, 0.5 * (before - after) / curvature))
      : 0;
    return { ...candidate, tempo: 60 * envelopeRate / (candidate.lag + offset) };
  }).filter(Boolean);
  const merged = new Map();
  for (const candidate of peaks) {
    const tempo = normalizeTempo(candidate.tempo);
    const proximity = 1 - Math.min(0.08, Math.abs(tempo - 120) / 1500);
    addTempoCandidate(merged, tempo, candidate.score * proximity * 0.82, 'autocorrelation');
  }

  for (const candidate of extractPeakIntervalCandidates(envelope, envelopeRate)) {
    addTempoCandidate(merged, candidate.bpm, candidate.score * 0.95, 'beat-peaks');
  }

  return buildTempoResult(merged, samples.length / sampleRate);
}

function sliceFloat32(samples, start, length) {
  const output = new Float32Array(Math.max(0, Math.min(length, samples.length - start)));
  output.set(samples.subarray(start, start + output.length));
  return output;
}

function musicTempoBeatConfidence(beatTimes, beatInterval, duration) {
  if (!Array.isArray(beatTimes) || beatTimes.length < 4 || !Number.isFinite(beatInterval) || beatInterval <= 0) return 0.2;
  const intervals = [];
  for (let index = 1; index < beatTimes.length; index++) {
    const interval = beatTimes[index] - beatTimes[index - 1];
    if (Number.isFinite(interval) && interval > 0) intervals.push(interval);
  }
  const center = median(intervals);
  const deviations = intervals.map(value => Math.abs(value - center));
  const spread = center > 0 ? median(deviations) / center : 1;
  const consistency = 1 - Math.min(1, spread * 5.5);
  const coverage = Math.min(1, beatTimes.length * beatInterval / Math.max(1, duration) * 1.08);
  return Math.max(0.08, Math.min(1, consistency * 0.68 + coverage * 0.32));
}

function makeMusicTempoSegments(samples, sampleRate) {
  const duration = samples.length / sampleRate;
  const segmentSeconds = Math.min(BPM_MUSIC_TEMPO_MAX_SEGMENT_SECONDS, Math.max(18, duration));
  const segmentLength = Math.min(samples.length, Math.floor(segmentSeconds * sampleRate));
  if (segmentLength <= 0) return [];
  if (samples.length <= segmentLength + sampleRate * 4) return [{ label: 'full', start: 0, samples: sliceFloat32(samples, 0, segmentLength) }];
  const starts = [
    0,
    Math.max(0, Math.floor((samples.length - segmentLength) / 2)),
    Math.max(0, samples.length - segmentLength)
  ];
  const uniqueStarts = [];
  for (const start of starts) {
    if (!uniqueStarts.some(current => Math.abs(current - start) < sampleRate * 5)) uniqueStarts.push(start);
  }
  return uniqueStarts.map((start, index) => ({
    label: index === 0 ? 'intro' : index === 1 ? 'middle' : 'late',
    start,
    samples: sliceFloat32(samples, start, segmentLength)
  }));
}

export function analyzeMusicTempoPcm(samples, sampleRate, MusicTempoCtor) {
  if (typeof MusicTempoCtor !== 'function') {
    return { bpm: null, confidence: 0, candidates: [], analyzedSeconds: 0 };
  }
  if (!(samples instanceof Float32Array) || samples.length < BPM_ENVELOPE_WINDOW * 8) {
    throw new BpmDetectError('invalid_audio', 'The decoded audio is too short for BPM analysis.');
  }
  if (!Number.isFinite(sampleRate) || sampleRate < 1000 || sampleRate > 192000) {
    throw new BpmDetectError('invalid_audio', 'The decoded audio has an invalid sample rate.');
  }

  const merged = new Map();
  let analyzedSeconds = 0;
  const hopSize = Math.max(64, Math.round(sampleRate * 0.01));
  const params = {
    bufferSize: sampleRate <= 16000 ? 1024 : 2048,
    hopSize,
    timeStep: hopSize / sampleRate,
    minBeatInterval: 60 / BPM_ANALYSIS_MAX,
    maxBeatInterval: 60 / BPM_ANALYSIS_MIN,
    maxTempos: 12,
    expiryTime: 16,
    peakThreshold: 0.32,
    toleranceWndPre: 0.18,
    toleranceWndPost: 0.28
  };

  for (const segment of makeMusicTempoSegments(samples, sampleRate)) {
    try {
      const mt = new MusicTempoCtor(segment.samples, params);
      const duration = segment.samples.length / sampleRate;
      analyzedSeconds += duration;
      const tempo = Number(mt.tempo);
      const beatInterval = Number(mt.beatInterval);
      const segmentConfidence = musicTempoBeatConfidence(mt.beats, beatInterval, duration);
      addTempoCandidate(merged, tempo, 0.55 + segmentConfidence * 0.75, 'beatroot-top');
      if (Number.isFinite(beatInterval) && beatInterval > 0) {
        addTempoCandidate(merged, 60 / beatInterval, 0.48 + segmentConfidence * 0.68, 'beatroot');
      }
      if (Array.isArray(mt.tempoList)) {
        mt.tempoList.slice(0, 8).forEach((interval, index) => {
          const candidate = 60 / Number(interval);
          if (Number.isFinite(candidate)) {
            addTempoCandidate(merged, candidate, Math.max(0.08, (0.42 - index * 0.035) * (0.58 + segmentConfidence * 0.42)), 'beatroot');
          }
        });
      }
    } catch {
      // Sparse/silent material can make Beatroot-style tracking fail. Keep the other engines alive.
    }
  }
  return buildTempoResult(merged, analyzedSeconds || samples.length / sampleRate);
}

export function fuseBpmAnalyses({ realtimeTempos = [], pcmAnalysis = null, beatrootAnalysis = null } = {}) {
  const merged = new Map();
  const realtimeCandidates = normalizeBpmCandidates(realtimeTempos);
  const maxCount = Math.max(0, ...realtimeCandidates.map(candidate => candidate.count));
  for (const candidate of realtimeCandidates) {
    const strength = maxCount > 0 ? candidate.count / maxCount : 0.5;
    addTempoCandidate(merged, candidate.tempo, (0.18 + strength * 0.82) * 0.78, 'realtime');
  }
  if (pcmAnalysis?.bpm !== null && Number.isFinite(pcmAnalysis?.bpm)) {
    addTempoCandidate(merged, pcmAnalysis.bpm, 0.34 + (Number(pcmAnalysis.confidence) || 0) * 0.82, 'local-top');
  }
  if (Array.isArray(pcmAnalysis?.candidates)) {
    for (const candidate of pcmAnalysis.candidates) {
      addTempoCandidate(merged, candidate.bpm, (Number(candidate.confidence) || 0.18) * 0.7, 'local');
    }
  }
  if (beatrootAnalysis?.bpm !== null && Number.isFinite(beatrootAnalysis?.bpm)) {
    addTempoCandidate(merged, beatrootAnalysis.bpm, 0.62 + (Number(beatrootAnalysis.confidence) || 0) * 0.92, 'beatroot-top');
  }
  if (Array.isArray(beatrootAnalysis?.candidates)) {
    for (const candidate of beatrootAnalysis.candidates) {
      addTempoCandidate(merged, candidate.bpm, (Number(candidate.confidence) || 0.2) * 0.84, 'beatroot');
    }
  }
  const analyzedSeconds = Math.max(
    Number.isFinite(pcmAnalysis?.analyzedSeconds) ? pcmAnalysis.analyzedSeconds : 0,
    Number.isFinite(beatrootAnalysis?.analyzedSeconds) ? beatrootAnalysis.analyzedSeconds : 0
  );
  return buildTempoResult(merged, analyzedSeconds);
}

function pearsonCorrelation(left, right) {
  let leftAverage = 0;
  let rightAverage = 0;
  for (let index = 0; index < left.length; index++) {
    leftAverage += left[index];
    rightAverage += right[index];
  }
  leftAverage /= left.length;
  rightAverage /= right.length;
  let numerator = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;
  for (let index = 0; index < left.length; index++) {
    const leftDelta = left[index] - leftAverage;
    const rightDelta = right[index] - rightAverage;
    numerator += leftDelta * rightDelta;
    leftEnergy += leftDelta * leftDelta;
    rightEnergy += rightDelta * rightDelta;
  }
  return numerator / Math.sqrt(leftEnergy * rightEnergy || 1);
}

function profileForKey(profile, tonicIndex) {
  return KEY_NAMES.map((_, pitchClass) => profile[(pitchClass - tonicIndex + 12) % 12]);
}

export function analyzeAudioKeyPcm(samples, sampleRate) {
  if (!(samples instanceof Float32Array) || samples.length < BPM_KEY_FRAME_SIZE * 2) {
    return { key: null, confidence: 0, candidates: [], chroma: [] };
  }
  if (!Number.isFinite(sampleRate) || sampleRate < 1000 || sampleRate > 192000) {
    throw new BpmDetectError('invalid_audio', 'The decoded audio has an invalid sample rate.');
  }

  const duration = samples.length / sampleRate;
  const analysisSeconds = Math.min(duration, BPM_KEY_MAX_ANALYSIS_SECONDS);
  const startSeconds = duration > analysisSeconds ? Math.min(duration - analysisSeconds, Math.max(0, duration * 0.12)) : 0;
  const startSample = Math.floor(startSeconds * sampleRate);
  const endSample = Math.min(samples.length, startSample + Math.floor(analysisSeconds * sampleRate));
  const chroma = new Float64Array(12);
  const notes = [];
  for (let midi = 36; midi <= 83; midi++) {
    const frequency = 440 * Math.pow(2, (midi - 69) / 12);
    if (frequency >= sampleRate * 0.45) continue;
    const distanceFromMiddle = Math.abs(midi - 60);
    notes.push({
      pitchClass: ((midi % 12) + 12) % 12,
      coefficient: 2 * Math.cos((2 * Math.PI * frequency) / sampleRate),
      weight: 1 / (1 + distanceFromMiddle * 0.018)
    });
  }

  let frameCount = 0;
  let rmsTotal = 0;
  for (let frameStart = startSample; frameStart + BPM_KEY_FRAME_SIZE <= endSample; frameStart += BPM_KEY_HOP_SIZE) {
    let rms = 0;
    for (let index = 0; index < BPM_KEY_FRAME_SIZE; index++) {
      const sample = samples[frameStart + index];
      rms += sample * sample;
    }
    rms = Math.sqrt(rms / BPM_KEY_FRAME_SIZE);
    if (rms < 0.004) continue;
    rmsTotal += rms;
    frameCount++;
    for (const note of notes) {
      let q1 = 0;
      let q2 = 0;
      for (let index = 0; index < BPM_KEY_FRAME_SIZE; index++) {
        const phase = index / (BPM_KEY_FRAME_SIZE - 1);
        const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
        const q0 = samples[frameStart + index] * window + note.coefficient * q1 - q2;
        q2 = q1;
        q1 = q0;
      }
      const power = q1 * q1 + q2 * q2 - note.coefficient * q1 * q2;
      chroma[note.pitchClass] += Math.log1p(Math.max(0, power)) * note.weight;
    }
  }

  if (frameCount < 3 || rmsTotal <= 0) {
    return { key: null, confidence: 0, candidates: [], chroma: [] };
  }
  const chromaPeak = Math.max(...chroma);
  if (chromaPeak <= 0) return { key: null, confidence: 0, candidates: [], chroma: [] };
  const normalizedChroma = Array.from(chroma, value => value / chromaPeak);
  const scored = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    scored.push({
      tonic: KEY_NAMES[tonic],
      mode: 'major',
      key: `${KEY_NAMES[tonic]} Major`,
      score: pearsonCorrelation(normalizedChroma, profileForKey(MAJOR_KEY_PROFILE, tonic))
    });
    scored.push({
      tonic: KEY_NAMES[tonic],
      mode: 'minor',
      key: `${KEY_NAMES[tonic]} Minor`,
      score: pearsonCorrelation(normalizedChroma, profileForKey(MINOR_KEY_PROFILE, tonic))
    });
  }
  scored.sort((left, right) => right.score - left.score);
  const best = scored[0];
  const second = scored[1];
  const confidence = Math.round(Math.max(0, Math.min(1, ((best?.score ?? 0) - (second?.score ?? 0)) * 1.85 + Math.max(0, (best?.score ?? 0) - 0.42) * 0.42)) * 100) / 100;
  if (!best || best.score < 0.22 || confidence < 0.05) {
    return {
      key: null,
      confidence: 0,
      candidates: scored.slice(0, 5).map(candidate => ({ ...candidate, score: Math.round(candidate.score * 100) / 100 })),
      chroma: normalizedChroma.map(value => Math.round(value * 1000) / 1000)
    };
  }
  return {
    key: best.key,
    tonic: best.tonic,
    mode: best.mode,
    confidence,
    candidates: scored.slice(0, 5).map(candidate => ({ ...candidate, score: Math.round(candidate.score * 100) / 100 })),
    chroma: normalizedChroma.map(value => Math.round(value * 1000) / 1000)
  };
}
