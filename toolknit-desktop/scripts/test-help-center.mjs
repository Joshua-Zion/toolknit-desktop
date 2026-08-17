import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const memoryStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => memoryStorage.get(key) ?? null,
  setItem: (key, value) => memoryStorage.set(key, String(value)),
};
globalThis.document = {
  readyState: 'loading',
  addEventListener: () => {},
  body: { classList: { toggle: () => {} } },
  documentElement: {},
};
globalThis.window = {};

const { HELP_CONTENT, HELP_CONTENT_EN } = await import('../src/help-data.js');

const root = new URL('..', import.meta.url);
const indexHtml = await readFile(new URL('index.html', root), 'utf8');
const rootReadmeZh = await readFile(new URL('../../README.md', import.meta.url), 'utf8');
const rootReadmeEn = await readFile(new URL('../../README_EN.md', import.meta.url), 'utf8');
const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const zh = JSON.parse(await readFile(new URL('src/locales/zh.json', root), 'utf8'));
const en = JSON.parse(await readFile(new URL('src/locales/en.json', root), 'utf8'));

function valuesForAttribute(html, attribute) {
  return [...html.matchAll(new RegExp(`${attribute}="([^"]+)"`, 'g'))]
    .map((match) => match[1]);
}

function getPath(object, path) {
  return path.split('.').reduce((value, key) => value && value[key], object);
}

function unique(values) {
  return [...new Set(values)];
}

const helpSections = unique(valuesForAttribute(indexHtml, 'data-help-section'));
assert.ok(helpSections.length > 0, 'Help navigation must include at least one section.');

for (const section of helpSections) {
  assert.ok(HELP_CONTENT[section], `Chinese help content is missing section: ${section}`);
  assert.ok(HELP_CONTENT_EN[section], `English help content is missing section: ${section}`);
}

const visibleHelpSectionSet = new Set(helpSections);
for (const [locale, content] of [['Chinese', HELP_CONTENT], ['English', HELP_CONTENT_EN]]) {
  const retiredSections = Object.keys(content).filter((section) => !visibleHelpSectionSet.has(section));
  assert.deepEqual(retiredSections, [], `${locale} help contains retired sections with no navigation entry: ${retiredSections.join(', ')}`);
}

const helpNavI18n = [...indexHtml.matchAll(/data-help-section="[^"]+"[^>]*data-i18n="([^"]+)"/g)]
  .map((match) => match[1]);
for (const key of helpNavI18n) {
  assert.equal(typeof getPath(zh, key), 'string', `Chinese translation is missing: ${key}`);
  assert.equal(typeof getPath(en, key), 'string', `English translation is missing: ${key}`);
}

const toolToHelp = new Map([
  ['pdf-merge', 'pdf-merge'],
  ['pdf-split', 'pdf-split'],
  ['pdf-to-image', 'pdf-to-image'],
  ['pdf-rotate', 'pdf-rotate'],
  ['pdf-encrypt', 'pdf-encrypt'],
  ['pdf-decrypt', 'pdf-decrypt'],
  ['pdf-compress', 'pdf-compress'],
  ['pdf-enhance', 'pdf-enhance'],
  ['pdf-editor', 'pdf-editor'],
  ['ppt-to-pdf', 'ppt-tools'],
  ['ppt-to-image', 'ppt-tools'],
  ['ppt-images', 'ppt-tools'],
  ['ppt-text', 'ppt-tools'],
  ['ppt-compress', 'ppt-tools'],
  ['ppt-outline', 'ppt-tools'],
  ['ppt-draft', 'ppt-tools'],
  ['image-convert', 'img-convert'],
  ['image-compress', 'img-compress'],
  ['image-stitch', 'image-stitch'],
  ['icon-gen', 'icon-gen'],
  ['convert', 'audio-convert'],
  ['bpm-detect', 'bpm-detect'],
  ['audio-clip', 'audio-clip'],
  ['audio-extract', 'audio-extract'],
  ['video-convert', 'video-convert'],
  ['video-frame', 'video-frame'],
  ['video-gif', 'video-gif'],
  ['transcription', 'transcription'],
  ['text-stats', 'text-stats'],
  ['text-format', 'text-format'],
  ['bmi-calc', 'bmi-calc'],
  ['timestamp-calc', 'timestamp-calc'],
  ['mortgage-calc', 'mortgage-calc'],
  ['interest-calc', 'interest-calc'],
  ['password-gen', 'password-gen'],
  ['color-extractor', 'color-extractor'],
  ['color-space-compare', 'color-space-compare'],
  ['typing-test', 'typing-test'],
  ['large-file-cleanup', 'large-file-cleanup'],
  ['c-drive-cleanup', 'c-drive-cleanup'],
  ['hardware-overview', 'hardware-tools'],
  ['hardware-cpu-memory', 'hardware-tools'],
  ['hardware-gpu-display', 'hardware-tools'],
  ['hardware-mainboard', 'hardware-tools'],
  ['hardware-storage', 'hardware-tools'],
  ['hardware-network-devices', 'hardware-tools'],
  ['hardware-power-sensors', 'hardware-tools'],
  ['ai-polish', 'ai-polish'],
  ['ai-translate', 'ai-translate'],
  ['ai-doc', 'ai-doc'],
  ['ai-table', 'ai-table'],
]);

const desktopTools = unique(valuesForAttribute(indexHtml, 'data-tool'));
assert.equal(desktopTools.length, 51, 'The desktop catalog must contain the published 51 tool entries.');
for (const tool of desktopTools) {
  const section = toolToHelp.get(tool);
  assert.ok(section, `Desktop tool has no help mapping: ${tool}`);
  assert.ok(HELP_CONTENT[section], `Chinese help is missing for desktop tool: ${tool}`);
  assert.ok(HELP_CONTENT_EN[section], `English help is missing for desktop tool: ${tool}`);
}

assert.match(HELP_CONTENT.overview.html, /51 个桌面工具/, 'Chinese overview must state the current 51-tool count.');
assert.match(HELP_CONTENT_EN.overview.html, /51 desktop tools/, 'English overview must state the current 51-tool count.');
assert.match(HELP_CONTENT.overview.html, /配色提取、颜色空间对比、打字测试/, 'Chinese creative overview must list all three creative tools.');
assert.match(HELP_CONTENT_EN.overview.html, /Color extraction, color-space comparison, typing test/, 'English creative overview must list all three creative tools.');

const creativeHelpStart = indexHtml.indexOf('data-i18n="help.group.creativeTools"');
const cleanupHelpStart = indexHtml.indexOf('data-i18n="help.group.cleanupTools"');
assert.ok(creativeHelpStart >= 0 && cleanupHelpStart > creativeHelpStart, 'Creative and cleanup help groups must be ordered and present.');
const creativeHelpNav = indexHtml.slice(creativeHelpStart, cleanupHelpStart);
for (const section of ['color-extractor', 'color-space-compare', 'typing-test']) {
  assert.match(creativeHelpNav, new RegExp(`data-help-section="${section}"`), `Creative help navigation is missing ${section}.`);
}

assert.match(rootReadmeZh, /全部 51 项工具/, 'Chinese README must state the current 51-tool count.');
assert.match(rootReadmeZh, /图像工具 · 4 项/, 'Chinese README must state four image tools.');
assert.match(rootReadmeZh, /创意工具 · 3 项/, 'Chinese README must state three creative tools.');
assert.match(rootReadmeZh, /清理工具 · 2 项/, 'Chinese README must state two cleanup tools.');
assert.match(rootReadmeZh, /`配色提取器` · `颜色空间对比` · `打字测试器`/, 'Chinese README creative list must match the app.');
assert.match(rootReadmeZh, /`AI 大文件清理` · `C盘清理`/, 'Chinese README cleanup list must match the app.');
assert.match(rootReadmeEn, /all 51 tools/, 'English README must state the current 51-tool count.');
assert.match(rootReadmeEn, /Image tools · 4/, 'English README must state four image tools.');
assert.match(rootReadmeEn, /Creative tools · 3/, 'English README must state three creative tools.');
assert.match(rootReadmeEn, /Cleanup tools · 2/, 'English README must state two cleanup tools.');
assert.match(rootReadmeEn, /`Color Extractor` · `Color Space Compare` · `Typing Test`/, 'English README creative list must match the app.');
assert.match(rootReadmeEn, /`AI Large File Cleanup` · `C Drive Cleanup`/, 'English README cleanup list must match the app.');

assert.match(indexHtml, /<dt>51<\/dt><dd[^>]+home\.supportPage\.statTools/, 'Support page must state 51 desktop tools.');
assert.match(zh.home.supportPage.storyBody2, /51 个桌面工具/, 'Chinese support story must state 51 desktop tools.');
assert.match(en.home.supportPage.storyBody2, /51 desktop tools/, 'English support story must state 51 desktop tools.');

const unreleasedStart = changelog.indexOf('## Unreleased');
const releasedStart = changelog.indexOf('## v2.0.0');
assert.ok(unreleasedStart >= 0 && releasedStart > unreleasedStart, 'CHANGELOG must keep unreleased changes before v2.0.0 history.');
assert.match(changelog.slice(unreleasedStart, releasedStart), /颜色空间对比/, 'Color Space Compare must be listed under Unreleased.');
assert.doesNotMatch(changelog.slice(releasedStart), /颜色空间对比/, 'Published release history must not claim Color Space Compare shipped in v2.0.0.');

for (const content of [HELP_CONTENT, HELP_CONTENT_EN]) {
  const visibleHelp = helpSections.map((section) => `${content[section].title}\n${content[section].html}`).join('\n');
  assert.match(visibleHelp, /CLI/i, 'Visible help must explain CLI.');
  assert.match(visibleHelp, /MCP/i, 'Visible help must explain IDE Agent / MCP.');
  assert.match(visibleHelp, /46/, 'Visible help must state the current 46 MCP capabilities.');
  assert.doesNotMatch(visibleHelp, /16\s*(项能力|capabilities)/i, 'Visible help must not advertise the retired 16-capability count.');
  assert.doesNotMatch(visibleHelp, /(自动检查更新|automatically checks.*update|forced update)/i, 'Visible help must not promise unsupported auto or forced updates.');
}

for (const [locale, section] of [
  ['Chinese', HELP_CONTENT['pdf-to-image']],
  ['English', HELP_CONTENT_EN['pdf-to-image']],
]) {
  const text = `${section.title}\n${section.html}`;
  assert.match(text, /150\s*MB/i, `${locale} PDF-to-image help must state the 150 MB input limit.`);
  assert.match(text, /200\s*(?:页|pages?)/i, `${locale} PDF-to-image help must state the 200-page limit.`);
  for (const dpi of [144, 200, 300]) {
    assert.match(text, new RegExp(`${dpi}\\s*DPI`, 'i'), `${locale} PDF-to-image help must explain the ${dpi} DPI preset.`);
  }
  assert.match(text, /20\s*(?:页|selected pages?)/i, `${locale} PDF-to-image help must state the 20-page long-image limit.`);
  assert.match(text, /(?:每\s*5\s*页|groups? of five)/i, `${locale} PDF-to-image help must explain five-page grouping.`);
  assert.match(text, /(?:打开文件夹|Open Folder)/i, `${locale} PDF-to-image help must explain how to open the output folder.`);
  assert.match(text, /(?:本机|本地|locally)/i, `${locale} PDF-to-image help must explain local processing.`);
  assert.doesNotMatch(text, /(?:界面原型|UI prototype|does not write files yet)/i, `${locale} PDF-to-image help must not describe the retired prototype.`);
}

for (const [locale, content, localeData] of [
  ['Chinese', HELP_CONTENT['ppt-tools'], zh],
  ['English', HELP_CONTENT_EN['ppt-tools'], en],
]) {
  const text = `${content.title}\n${content.html}`;
  assert.match(text, /PNG\s*\/\s*JPG\s*\/\s*WebP/i, `${locale} PPT help must document the supported image formats.`);
  assert.match(
    text,
    locale === 'Chinese'
      ? /PPT 页面不会在此工具中拼成长图/
      : /PPT slides are not stitched into long images in this tool/,
    `${locale} PPT help must state that slides are not stitched into long images.`
  );
  assert.doesNotMatch(localeData.home.pptToImagePage.subtitle, /(?:长图|long[- ]image)/i, `${locale} PPT-to-image subtitle must not advertise long-image export.`);
  assert.doesNotMatch(localeData.home.toolNames.pptToImageDesc, /(?:长图|long[- ]image)/i, `${locale} PPT-to-image list description must not advertise long-image export.`);
  assert.doesNotMatch(localeData.home.toolNames.pptToImageMeta, /(?:长图|long[- ]image)/i, `${locale} PPT-to-image list metadata must not advertise long-image export.`);
}

console.log(`Help center contract passed: ${helpSections.length} visible sections, ${desktopTools.length} desktop tools.`);
