import assert from 'node:assert/strict';
import {
  createSpeechFollower,
  createSystemSpeechTranscriptState,
  estimateTeleprompterDuration,
  findSpeechMatch,
  formatTeleprompterTime,
  normalizeSpeechText,
  segmentTeleprompterScript,
  speechMatchScore,
  speechReadingProgress
} from '../src/teleprompter-core.js';

const chinese = segmentTeleprompterScript('大家好，欢迎来到 ToolKnit。\n\n今天我们演示提词器！最后，谢谢大家。');
assert.equal(chinese.paragraphs.length, 2);
assert.equal(chinese.sentences.length, 3);
assert.equal(chinese.sentences[0].text, '大家好，欢迎来到 ToolKnit。');
assert.equal(chinese.sentences[1].paragraphIndex, 1);

const english = segmentTeleprompterScript('Hello everyone. This is a local teleprompter!\nIt stays on your device.');
assert.equal(english.sentences.length, 3);

// Periods inside numbers are not sentence boundaries.
const versions = segmentTeleprompterScript('GLM-5.3 是最新旗舰模型。当前版本 2.3.0，请及时更新。');
assert.equal(versions.sentences.length, 2, 'versions like GLM-5.3 must stay inside one sentence');
assert.equal(versions.sentences[0].text, 'GLM-5.3 是最新旗舰模型。');
assert.ok(versions.sentences[1].text.includes('2.3.0'));

// Reading progress tracks how far into the current sentence the speaker is.
const progressSentence = '汇集最新一代旗舰模型，涵盖高性能文本与多模态模型，全面升级推理。';
const progressPartial = speechReadingProgress('汇集最新一代旗舰模型涵盖高性能', progressSentence);
assert.ok(progressPartial >= 0.4 && progressPartial <= 0.85, `partial reading should sit mid-sentence, got ${progressPartial}`);
const progressComplete = speechReadingProgress('汇集最新一代旗舰模型涵盖高性能文本与多模态模型全面升级推理', progressSentence);
assert.ok(progressComplete >= 0.9, `completed reading should be near 1, got ${progressComplete}`);
const progressUnrelated = speechReadingProgress('今天我们聊一个完全不同的话题', progressSentence);
assert.ok(progressUnrelated <= 0.15, `unrelated transcript should not progress, got ${progressUnrelated}`);

const decimals = segmentTeleprompterScript('圆周率约 3.14，很好记。');
assert.equal(decimals.sentences.length, 1);
assert.ok(decimals.sentences[0].text.includes('3.14'));

// A period after a digit followed by whitespace still ends the sentence.
const numbered = segmentTeleprompterScript('步骤 3. 开始练习');
assert.equal(numbered.sentences.length, 2);
assert.equal(numbered.sentences[0].text, '步骤 3.');
assert.equal(normalizeSpeechText('  HELLO, um... World!  '), 'hello world');
assert.ok(speechMatchScore('欢迎来到 tool knit', '欢迎来到 ToolKnit。') > 0.7);
assert.ok(speechMatchScore('completely unrelated', '欢迎来到 ToolKnit。') < 0.3);

const match = findSpeechMatch(chinese.sentences, '今天我们来演示提词器', 0);
assert.equal(match?.index, 1);

// Long unpunctuated CJK scripts must not become one impossible-to-complete
// sentence. This is the exact shape reported by the user.
const unpunctuated = segmentTeleprompterScript('我爱你'.repeat(21));
assert.ok(unpunctuated.sentences.length >= 3, 'unpunctuated Chinese should be split into followable chunks');
assert.ok(unpunctuated.sentences.every(sentence => sentence.text.length <= 18));

const repeated = segmentTeleprompterScript('我们继续。第一部分。我们继续。第二部分。').sentences;
const follower = createSpeechFollower(repeated, 2);
const repeatResult = follower.push('我们继续', { final: true });
assert.equal(follower.index, 3, 'completing a repeated current sentence advances exactly once');
assert.equal(repeatResult?.moved, true);

const repeatedOnly = segmentTeleprompterScript('我爱你。我爱你。我爱你。').sentences;
const repeatedFollower = createSpeechFollower(repeatedOnly, 0);
assert.equal(repeatedFollower.push('我爱你', { final: true })?.index, 1);
assert.equal(repeatedFollower.push('我爱你', { final: true })?.index, 2);
assert.equal(repeatedFollower.index, 2, 'repeated finals move monotonically and never jump backward');

const partialFollower = createSpeechFollower(segmentTeleprompterScript('欢迎使用本地语音跟随功能。下一句。').sentences, 0);
assert.equal(partialFollower.push('欢迎使用本地', { final: true })?.moved ?? false, false);
assert.equal(partialFollower.push('语音跟随功能', { final: true })?.moved, true, 'separate final chunks should complete one sentence together');
assert.equal(partialFollower.index, 1);

function speechResult(text, isFinal) {
  const result = [{ transcript: text }];
  result.isFinal = isFinal;
  return result;
}

const transcriptState = createSystemSpeechTranscriptState();
let recognitionState = transcriptState.push([speechResult('欢迎使用', true), speechResult('提词器', false)], 0);
assert.equal(recognitionState.transcript, '欢迎使用 提词器');
assert.equal(recognitionState.final, true);
recognitionState = transcriptState.push([speechResult('欢迎使用', true), speechResult('提词器工具', true)], 1);
assert.equal(recognitionState.latest, '提词器工具');
assert.equal(recognitionState.final, true);
transcriptState.endSession();
recognitionState = transcriptState.push([speechResult('下一句', true)], 0);
assert.equal(recognitionState.transcript, '欢迎使用 提词器工具 下一句', 'final text survives a SpeechRecognition restart');

const stable = createSpeechFollower(chinese.sentences, 0);
const first = stable.push('最后谢谢各位', { final: false });
assert.equal(first?.pending, true, 'a large interim jump waits for confirmation');
const second = stable.push('最后谢谢各位', { final: false });
assert.equal(second?.moved, true);
assert.equal(stable.index, 2);

stable.reset(1);
assert.equal(stable.index, 1);
assert.ok(estimateTeleprompterDuration('这是一段中文。This is English.') > 1);
assert.equal(formatTeleprompterTime(65), '01:05');

console.log('teleprompter core tests passed');
