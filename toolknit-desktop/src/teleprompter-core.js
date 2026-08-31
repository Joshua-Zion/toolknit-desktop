export const TELEPROMPTER_LIMITS = Object.freeze({
  maxInputChars: 160_000,
  maxSentences: 4_000,
  minFontSize: 28,
  maxFontSize: 96,
  minSpeed: 10,
  maxSpeed: 120
});

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/g;
const WORD_RE = /[a-z0-9]+(?:['’-][a-z0-9]+)*/gi;
// A period only ends a sentence when digits do not surround it, so versions
// like "GLM-5.3" and "2.3.0" stay inside one sentence.
const TERMINAL_RE = /(?:(?<=\d)\.(?=\d)|[^。！？!?；;.\n])+(?:[。！？!?；;]+|\.|$)/g;
const SOFT_BREAK_RE = /(?<=[，,：:、])\s*/g;
const FILLER_TOKENS = new Set(['uh', 'um', 'erm', 'hmm', 'ah', 'eh']);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function trimWithOffset(value, baseOffset) {
  const leading = value.length - value.trimStart().length;
  const text = value.trim();
  return { text, start: baseOffset + leading, end: baseOffset + leading + text.length };
}

function splitLongSentence(entry) {
  const cjkCount = (entry.text.match(CJK_RE) || []).length;
  const cjkDense = cjkCount / Math.max(1, entry.text.length) >= 0.28;
  const maxChars = cjkDense ? 18 : 84;
  const hardChunkSize = cjkDense ? 12 : 68;
  const minBreakDistance = cjkDense ? 6 : 28;
  if (entry.text.length <= maxChars) return [entry];
  const pieces = [];
  let cursor = 0;
  let chunkStart = 0;
  const softBreaks = Array.from(entry.text.matchAll(SOFT_BREAK_RE), match => match.index + match[0].length);
  const wordBreaks = Array.from(entry.text.matchAll(/\s+/g), match => match.index + match[0].length);
  while (entry.text.length - chunkStart > maxChars) {
    const preferred = softBreaks.filter(index => index > chunkStart + minBreakDistance && index <= chunkStart + maxChars).at(-1);
    const wordBreak = wordBreaks.filter(index => index > chunkStart + minBreakDistance && index <= chunkStart + maxChars).at(-1);
    const end = preferred || wordBreak || Math.min(entry.text.length, chunkStart + hardChunkSize);
    const part = trimWithOffset(entry.text.slice(chunkStart, end), entry.start + chunkStart);
    if (part.text) pieces.push({ ...entry, ...part });
    cursor = end;
    chunkStart = end;
  }
  const tail = trimWithOffset(entry.text.slice(cursor), entry.start + cursor);
  if (tail.text) pieces.push({ ...entry, ...tail });
  return pieces;
}

// Whisper models sometimes emit traditional variants for spoken Mandarin.
// Matching collapses the common ones so scripts in simplified Chinese still
// track when the transcript comes back traditional.
const TRADITIONAL_TO_SIMPLIFIED = new Map(Object.entries({
  '艦': '舰', '彙': '汇', '匯': '汇', '級': '级', '創': '创', '業': '业', '務': '务',
  '實': '实', '現': '现', '點': '点', '間': '间', '時': '时', '為': '为', '會': '会',
  '後': '后', '裡': '里', '這': '这', '說': '说', '對': '对', '開': '开', '關': '关',
  '們': '们', '從': '从', '見': '见', '車': '车', '電': '电', '動': '动', '應': '应',
  '話': '话', '語': '语', '讓': '让', '體': '体', '學': '学', '將': '将', '與': '与',
  '於': '于', '來': '来', '內': '内', '無': '无', '節': '节', '當': '当', '處': '处',
  '屬': '属', '據': '据', '備': '备', '專': '专', '號': '号',
  '質': '质', '資': '资', '費': '费', '環': '环', '聲': '声', '響': '响', '顯': '显',
  '飛': '飞', '機': '机', '構': '构', '標': '标', '統': '统', '斷': '断', '邊': '边',
  '變': '变', '輸': '输', '轉': '转', '連': '连', '運': '运', '進': '进', '遠': '远',
  '適': '适', '選': '选', '錄': '录', '鍵': '键', '盤': '盘', '壓': '压', '縮': '缩',
  '織': '织', '經': '经', '濟': '济', '廣': '广', '滅': '灭', '營': '营', '藝': '艺',
  '觀': '观', '釋': '释', '鏡': '镜', '錯': '错', '長': '长', '門': '门', '問': '问',
  '單': '单', '嚴': '严', '優': '优', '壊': '坏', '廢': '废', '強': '强', '獨': '独',
  '獲': '获', '證': '证', '護': '护', '觸': '触', '覺': '觉', '覽': '览', '釐': '厘'
}));

// Raw 1:1 traditional→simplified mapping for transcript text. Shared by the
// teleprompter matcher and the transcription output post-processing.
export function simplifyChineseText(value) {
  return String(value || '').replace(/./g, character => TRADITIONAL_TO_SIMPLIFIED.get(character) || character);
}

export function normalizeSpeechText(value) {
  const normalized = simplifyChineseText(String(value || ''))
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[嗯呃额啊唔哦]+/g, '')
    .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, ' ')
    .trim();
  if (!normalized) return '';
  return normalized
    .split(/\s+/)
    .filter(token => !FILLER_TOKENS.has(token))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function segmentTeleprompterScript(input) {
  const text = String(input || '').replace(/\r\n?/g, '\n').slice(0, TELEPROMPTER_LIMITS.maxInputChars);
  const sentences = [];
  const paragraphs = [];
  let paragraphIndex = 0;
  const paragraphPattern = /[^\n]+(?:\n(?!\n)[^\n]+)*/g;

  for (const paragraphMatch of text.matchAll(paragraphPattern)) {
    const rawParagraph = paragraphMatch[0];
    const paragraphBase = paragraphMatch.index || 0;
    const trimmedParagraph = trimWithOffset(rawParagraph, paragraphBase);
    if (!trimmedParagraph.text) continue;
    const sentenceIds = [];

    for (const sentenceMatch of trimmedParagraph.text.matchAll(TERMINAL_RE)) {
      const rawSentence = sentenceMatch[0];
      const sentenceBase = trimmedParagraph.start + (sentenceMatch.index || 0);
      const trimmedSentence = trimWithOffset(rawSentence, sentenceBase);
      if (!trimmedSentence.text) continue;
      const parts = splitLongSentence({
        ...trimmedSentence,
        paragraphIndex
      });
      for (const part of parts) {
        if (sentences.length >= TELEPROMPTER_LIMITS.maxSentences) break;
        const sentence = {
          id: sentences.length,
          paragraphIndex,
          text: part.text,
          start: part.start,
          end: part.end,
          normalized: normalizeSpeechText(part.text)
        };
        sentences.push(sentence);
        sentenceIds.push(sentence.id);
      }
      if (sentences.length >= TELEPROMPTER_LIMITS.maxSentences) break;
    }

    if (sentenceIds.length) {
      paragraphs.push({
        id: paragraphIndex,
        text: trimmedParagraph.text,
        start: trimmedParagraph.start,
        end: trimmedParagraph.end,
        sentenceIds
      });
      paragraphIndex += 1;
    }
    if (sentences.length >= TELEPROMPTER_LIMITS.maxSentences) break;
  }

  return { text, paragraphs, sentences, truncated: String(input || '').length > text.length };
}

function levenshteinSimilarity(left, right) {
  if (left === right) return 1;
  if (!left || !right) return 0;
  const a = Array.from(left);
  const b = Array.from(right);
  if (Math.abs(a.length - b.length) > Math.max(a.length, b.length) * 0.72) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + cost
      );
    }
    previous = current;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

function grams(value) {
  const compact = value.replace(/\s+/g, '');
  if (compact.length <= 1) return compact ? [compact] : [];
  const size = compact.length < 8 ? 1 : 2;
  const result = [];
  for (let index = 0; index <= compact.length - size; index += 1) result.push(compact.slice(index, index + size));
  return result;
}

function diceSimilarity(left, right) {
  const leftGrams = grams(left);
  const rightGrams = grams(right);
  if (!leftGrams.length || !rightGrams.length) return 0;
  const counts = new Map();
  leftGrams.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  let overlap = 0;
  rightGrams.forEach(value => {
    const count = counts.get(value) || 0;
    if (!count) return;
    overlap += 1;
    counts.set(value, count - 1);
  });
  return (2 * overlap) / (leftGrams.length + rightGrams.length);
}

export function speechMatchScore(transcript, scriptText) {
  const query = normalizeSpeechText(transcript).slice(-220);
  const candidate = normalizeSpeechText(scriptText);
  if (!query || !candidate) return 0;
  const compactQuery = query.replace(/\s+/g, '');
  const compactCandidate = candidate.replace(/\s+/g, '');
  const shorter = Math.min(compactQuery.length, compactCandidate.length);
  const longer = Math.max(compactQuery.length, compactCandidate.length);
  const contained = compactQuery.includes(compactCandidate) || compactCandidate.includes(compactQuery);
  const containment = contained ? clamp(shorter / Math.max(1, longer), 0.35, 1) : 0;
  const dice = diceSimilarity(query, candidate);
  const edit = longer <= 100 ? levenshteinSimilarity(compactQuery, compactCandidate) : 0;
  return clamp(Math.max(containment * 0.92, dice * 0.72 + edit * 0.28), 0, 1);
}

export function findSpeechMatch(sentences, transcript, currentIndex = 0, options = {}) {
  const list = Array.isArray(sentences) ? sentences : [];
  if (!list.length) return null;
  const current = clamp(Math.trunc(Number(currentIndex) || 0), 0, list.length - 1);
  const lookBehind = clamp(Math.trunc(options.lookBehind ?? 0), 0, 2);
  const lookAhead = clamp(Math.trunc(options.lookAhead ?? 10), 1, 24);
  const start = Math.max(0, current - lookBehind);
  const end = Math.min(list.length - 1, current + lookAhead);
  let best = null;

  for (let index = start; index <= end; index += 1) {
    const singleScore = speechMatchScore(transcript, list[index]?.normalized || list[index]?.text || '');
    const pairText = index < end
      ? `${list[index]?.text || ''} ${list[index + 1]?.text || ''}`
      : '';
    const pairScore = pairText ? speechMatchScore(transcript, pairText) * 0.96 : 0;
    const score = Math.max(singleScore, pairScore);
    const distancePenalty = Math.max(0, index - current - 4) * 0.018;
    const adjusted = score - distancePenalty;
    if (!best || adjusted > best.adjusted) best = { index, score, adjusted };
  }

  const queryLength = normalizeSpeechText(transcript).replace(/\s+/g, '').length;
  const threshold = queryLength < 5 ? 0.82 : (queryLength < 10 ? 0.63 : 0.5);
  if (!best || best.score < (options.threshold ?? threshold)) return null;
  return { index: best.index, score: Number(best.score.toFixed(4)) };
}

// Fraction (0..1) of the sentence the reader has already covered, estimated
// from the latest transcript tail. Used to draw the per-sentence reading line.
// Longest exact prefix first, then a guarded fuzzy extension over the rolling
// transcript tail tolerates an occasional mis-heard word without jumping ahead.
export function speechReadingProgress(transcript, sentenceText) {
  const target = normalizeSpeechText(sentenceText).replace(/\s+/g, '');
  const query = normalizeSpeechText(transcript).replace(/\s+/g, '').slice(-200);
  if (!target || !query) return 0;
  let matched = 0;
  const maxExact = Math.min(target.length, query.length);
  for (let length = maxExact; length >= 4; length -= 1) {
    if (query.includes(target.slice(0, length))) {
      matched = length;
      break;
    }
  }
  let guard = 0;
  while (matched < target.length && guard < 24) {
    const next = target.slice(matched, matched + 4);
    if (!next) break;
    const tail = query.slice(-Math.max(next.length + 10, 18));
    const recent = target.slice(0, matched + next.length).slice(-12);
    if (tail.includes(next) || diceSimilarity(tail, recent) >= 0.62) {
      matched += next.length;
      guard += 1;
    } else {
      break;
    }
  }
  return Math.min(1, matched / target.length);
}

function appendSpeechContext(previous, next, maxChars = 440) {
  const joined = `${String(previous || '').trim()} ${String(next || '').trim()}`.trim();
  return joined.length > maxChars ? joined.slice(-maxChars) : joined;
}

// Web Speech results are cumulative only inside one recognition session. The
// browser regularly ends and restarts that session, so preserve committed
// finals across restarts and expose only the newly changed result as evidence.
export function createSystemSpeechTranscriptState(maxChars = 700) {
  let committed = '';
  let sessionFinal = '';
  let finalCount = 0;

  return {
    push(results, resultIndex = 0) {
      const list = Array.from(results || []);
      const finals = [];
      const interim = [];
      const latest = [];
      list.forEach((result, index) => {
        const text = String(result?.[0]?.transcript || '').trim();
        if (!text) return;
        if (result.isFinal) finals.push(text);
        else interim.push(text);
        if (index >= Math.max(0, Number(resultIndex) || 0)) latest.push(text);
      });
      const nextSessionFinal = finals.join(' ').trim();
      const nextFinalCount = finals.length;
      const hasNewFinal = nextFinalCount > finalCount
        || (nextFinalCount === finalCount && nextSessionFinal !== sessionFinal && nextFinalCount > 0);
      sessionFinal = nextSessionFinal;
      finalCount = nextFinalCount;
      return {
        transcript: appendSpeechContext(appendSpeechContext(committed, sessionFinal, maxChars), interim.join(' '), maxChars),
        latest: latest.join(' ').trim(),
        final: hasNewFinal
      };
    },
    endSession() {
      committed = appendSpeechContext(committed, sessionFinal, maxChars);
      sessionFinal = '';
      finalCount = 0;
      return committed;
    },
    reset() {
      committed = '';
      sessionFinal = '';
      finalCount = 0;
    }
  };
}

export function createSpeechFollower(sentences, startIndex = 0) {
  const list = Array.isArray(sentences) ? sentences : [];
  let currentIndex = clamp(Math.trunc(startIndex || 0), 0, Math.max(0, list.length - 1));
  let pendingIndex = -1;
  let pendingCount = 0;
  let finalEvidence = '';

  return {
    get index() { return currentIndex; },
    reset(index = 0) {
      currentIndex = clamp(Math.trunc(index || 0), 0, Math.max(0, list.length - 1));
      pendingIndex = -1;
      pendingCount = 0;
      finalEvidence = '';
      return currentIndex;
    },
    push(transcript, { final = false, context = transcript, cumulative = false } = {}) {
      if (!list.length) return null;
      const latest = String(transcript || '').trim();
      if (final) finalEvidence = cumulative ? latest : appendSpeechContext(finalEvidence, latest);
      const evidence = final ? finalEvidence : latest;
      const evidenceMatch = findSpeechMatch(list, evidence, currentIndex, { lookBehind: 0, lookAhead: 12 });
      const match = evidenceMatch || findSpeechMatch(list, context, currentIndex, { lookBehind: 0, lookAhead: 12 });
      if (!match || match.index < currentIndex) {
        pendingIndex = -1;
        pendingCount = 0;
        return null;
      }
      if (match.index === currentIndex) {
        pendingIndex = -1;
        pendingCount = 0;
        const sentence = list[currentIndex]?.normalized || list[currentIndex]?.text || '';
        const progress = speechReadingProgress(evidence, sentence);
        const completed = final && Boolean(evidenceMatch) && (progress >= 0.72 || match.score >= 0.9);
        if (completed && currentIndex < list.length - 1) {
          currentIndex += 1;
          finalEvidence = '';
          return { ...match, index: currentIndex, moved: true, completed: true, progress };
        }
        if (completed) finalEvidence = '';
        return { ...match, moved: false, completed, progress };
      }
      if (pendingIndex === match.index) pendingCount += 1;
      else {
        pendingIndex = match.index;
        pendingCount = 1;
      }
      const isLargeJump = match.index - currentIndex > 3;
      const confirmed = match.score >= 0.82 || (final && !isLargeJump && match.score >= 0.6) || pendingCount >= 2;
      if (!confirmed) return { ...match, moved: false, pending: true };
      currentIndex = match.index;
      pendingIndex = -1;
      pendingCount = 0;
      finalEvidence = '';
      return { ...match, moved: true };
    }
  };
}

export function estimateTeleprompterDuration(text, speedMultiplier = 1) {
  const value = String(text || '');
  const chineseCharacters = (value.match(CJK_RE) || []).length;
  const latinWords = (value.match(WORD_RE) || []).length;
  const punctuationPauses = (value.match(/[。！？!?；;，,：:\n]/g) || []).length;
  const baseSeconds = chineseCharacters / 4.1 + latinWords / 2.45 + punctuationPauses * 0.22;
  return Math.max(0, baseSeconds / clamp(Number(speedMultiplier) || 1, 0.25, 4));
}

export function formatTeleprompterTime(seconds) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}
