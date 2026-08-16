import assert from 'node:assert/strict';
import {
  PptOutlineError,
  buildPptOutlineMessages,
  createPptOutlineManifest,
  createPptOutlineMarkdown,
  extractPptOutlineJson,
  normalizePptOutlineRequest,
  normalizePptOutlineResult,
  sanitizePptOutlineBaseName
} from '../src/ppt-outline-core.js';

const request = normalizePptOutlineRequest({
  prompt: '给 ToolKnit 2.0 做一份开源项目发布演示，强调本地优先、AI Agent、PPT 工具和安全清理。',
  slide_count: 5,
  deck_type: 'product-launch',
  audience: '开源用户与潜在贡献者',
  purpose: '让观众愿意下载、Star，并参与反馈',
  tone: '清晰、有一点热血',
  style: '现代黑白极简，有强烈层级',
  locale: 'zh-CN'
});

assert.equal(request.slide_count, 5);
assert.equal(request.locale, 'zh-CN');
assert.equal(sanitizePptOutlineBaseName('..\\demo:name.txt'), 'demo_name');

const messages = buildPptOutlineMessages(request);
assert.equal(messages.length, 2);
assert.match(messages[0].content, /deck_type/);
assert.match(messages[0].content, /fact_bank/);
assert.match(messages[0].content, /layout_intent/);
assert.match(messages[0].content, /subject-aware/);
assert.match(messages[0].content, /For interior\/design cases/);
assert.match(messages[0].content, /party\/government/);
assert.match(messages[0].content, /literary or biography/);
assert.match(messages[1].content, /ToolKnit 2\.0/);

const payload = {
  ready: true,
  title: 'ToolKnit 2.0 发布演示',
  subtitle: '本地文件处理 + AI Agent 工具平台',
  audience: '开源用户与潜在贡献者',
  purpose: '推动下载、Star 和反馈',
  deck_type: 'product-launch',
  fact_bank: {
    known_facts: ['ToolKnit 是本地优先工具箱'],
    evidence: ['GitHub 仓库截图'],
    assumptions: ['发布演示面向开源用户'],
    missing_facts: ['正式发布日期待确认'],
    no_invention: ['不编造未提供的统计数据']
  },
  narrative: {
    communication_job: 'By the end, 开源用户 should understand ToolKnit because it keeps files local while exposing Agent tools.',
    arc: 'Context -> stakes -> product proof -> action',
    central_takeaway: 'ToolKnit 正在从工具箱升级为本地文件处理平台。'
  },
  design: {
    style: '黑白极简',
    visual_system: '大标题、少文字、局部产品截图',
    color_hint: '黑白灰为主',
    font_hint: '清晰无衬线'
  },
  slides: [
    { page: 1, role: 'cover', type: 'title', title: '工具箱正在变成工作台', claim: 'ToolKnit 2.0 的重点是工作流而不是堆功能。', body: ['一句话定位', '核心价值'], visual_suggestion: '产品首页动效', layout_intent: { kind: 'title', density: 'low', text_blocks: 1, media_slots: 1, chart: 'none', visual_focus: '品牌标题' }, speaker_note: '先建立愿景', transition: '接下来解释为什么需要它。' },
    { page: 2, role: 'context', type: 'context', title: '本地文件仍需要更顺手的自动化', claim: '用户不想为了处理文件到处上传。', body: ['隐私焦虑', '工具分散', '重复劳动'], visual_suggestion: '文件流动路径图', layout_intent: { kind: 'text-focus', density: 'medium', text_blocks: 2, media_slots: 0, chart: 'none', visual_focus: '本地优先痛点' } },
    { page: 3, role: 'evidence', type: 'evidence', title: 'PPT 工具让创作链路补齐', claim: 'PPT 图片、文本、压缩和大纲开始形成闭环。', body: ['素材提取', 'AI 文本整理', '无损压缩'], visual_suggestion: '四个功能并列', layout_intent: { kind: 'chart', density: 'medium', text_blocks: 2, media_slots: 1, chart: 'comparison', visual_focus: 'PPT 工具闭环' } },
    { page: 4, role: 'insight', type: 'analysis', title: 'Agent 能把工具串成一句话任务', claim: 'CLI/MCP 让本地工具进入 IDE 工作流。', body: ['明确输入', '明确输出', '不覆盖源文件'], visual_suggestion: 'IDE 调用链路', layout_intent: { kind: 'process', density: 'medium', text_blocks: 2, media_slots: 1, chart: 'process', visual_focus: 'Agent 工作流' } },
    { page: 5, role: 'closing', type: 'closing', title: '下载、试用、提反馈', claim: '开源项目需要真实用户把它磨亮。', body: ['GitHub Star', '提交 issue', '共建功能'], visual_suggestion: '二维码或 GitHub 链接', layout_intent: { kind: 'closing', density: 'low', text_blocks: 1, media_slots: 1, chart: 'none', visual_focus: '行动号召' } }
  ],
  quality_check: {
    missing_info: ['正式发布日期待确认'],
    risks: ['不要承诺未验证平台'],
    next_steps: ['补充真实截图'],
    self_check: {
      score: 88,
      passed: true,
      issues: ['待确认发布日期'],
      strengths: ['结构完整', '页面角色清晰']
    }
  }
};

const parsed = extractPptOutlineJson(`\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``);
assert.equal(parsed.title, payload.title);

const outline = normalizePptOutlineResult(parsed, request);
assert.equal(outline.schema, 'toolknit.ppt-outline');
assert.equal(outline.version, 2);
assert.equal(outline.slides.length, 5);
assert.equal(outline.slides[0].page, 1);
assert.equal(outline.quality_check.missing_info[0], '正式发布日期待确认');
assert.equal(outline.deck_type, 'product-launch');
assert.equal(outline.fact_bank.known_facts[0], 'ToolKnit 是本地优先工具箱');
assert.equal(outline.slides[0].role, 'cover');
assert.equal(outline.slides[2].layout_intent.kind, 'chart');
assert.equal(outline.quality_check.self_check.score, 90);

const markdown = createPptOutlineMarkdown(outline);
assert.match(markdown, /^# ToolKnit 2\.0 发布演示/m);
assert.match(markdown, /## Fact bank|## 事实边界/);
assert.match(markdown, /## 页面大纲/);
assert.match(markdown, /第 5 页/);
assert.match(markdown, /正式发布日期待确认/);
assert.match(markdown, /质量分/);

const manifest = createPptOutlineManifest(outline);
assert.equal(manifest.schema, 'toolknit.ppt-outline');
assert.equal(manifest.slide_count, 5);
assert.equal(manifest.request.prompt_characters, request.prompt.length);

assert.throws(
  () => normalizePptOutlineRequest({ prompt: 'x', slide_count: 2 }),
  error => error instanceof PptOutlineError && error.code === 'invalid_slide_count'
);

assert.throws(
  () => normalizePptOutlineResult({ ...payload, slides: payload.slides.slice(0, 4) }, request),
  error => error instanceof PptOutlineError && error.code === 'invalid_ai_response'
);

console.log('PPT outline core regression checks passed');
