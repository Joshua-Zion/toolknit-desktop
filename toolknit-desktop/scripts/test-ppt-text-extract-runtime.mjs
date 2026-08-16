import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { extractPptText } from '../cli/lib/ppt-text-extract-runtime.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const cliPath = path.join(projectRoot, 'cli', 'toolknit.mjs');

async function createFixturePptx(filePath) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>
</Types>`);
  zip.file('ppt/presentation.xml', `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>`);
  zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>发布计划</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Content 1"/><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>第一阶段完成文本提取。</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  zip.file('ppt/slides/_rels/slide1.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`);
  zip.file('ppt/notesSlides/notesSlide1.xml', `<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>备注：演示 CLI 和 Agent 调用。</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`);
  zip.file('ppt/slides/slide2.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>风险边界</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Content 1"/><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>不上传原始 PPTX。</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  await writeFile(filePath, await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}

function runCli(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: projectRoot,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env }
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', code => resolve({
      code,
      stdout: Buffer.concat(stdout).toString('utf8').trim(),
      stderr: Buffer.concat(stderr).toString('utf8').trim()
    }));
  });
}

const fixtureDirectory = await mkdtemp(path.join(os.tmpdir(), 'toolknit-ppt-text-'));
const inputPath = path.join(fixtureDirectory, 'demo.pptx');
const outputDirectory = path.join(fixtureDirectory, 'out');
await createFixturePptx(inputPath);

const dryRun = await extractPptText({
  input_path: inputPath,
  output_dir: outputDirectory,
  dry_run: true,
  format: 'all'
});
assert.equal(dryRun.tool, 'ppt.text');
assert.equal(dryRun.dry_run, true);
assert.equal(dryRun.slide_count, 2);
assert.equal(dryRun.selected_count, 2);
assert.equal(dryRun.selected_slides[0].title, '发布计划');
await assert.rejects(() => readdir(outputDirectory), /ENOENT/);

const exported = await extractPptText({
  input_path: inputPath,
  output_dir: outputDirectory,
  pages: [1],
  format: 'all',
  output_name: 'demo-text'
});
assert.equal(exported.dry_run, false);
assert.equal(exported.selected_count, 1);
assert.equal(exported.outputs.some(item => item.relative_path === 'slides.md'), true);
assert.equal(exported.outputs.some(item => item.relative_path === 'slides.txt'), true);
assert.equal(exported.outputs.some(item => item.relative_path === 'slides.json'), true);
assert.ok(await stat(exported.manifest_paths.json).then(file => file.size > 0));
const markdownPath = exported.outputs.find(item => item.relative_path === 'slides.md').path;
assert.match(await readFile(markdownPath, 'utf8'), /备注：演示 CLI 和 Agent 调用/);

const cliOut = path.join(fixtureDirectory, 'cli-out');
const cli = await runCli([
  'ppt', 'text',
  '--input', inputPath,
  '--output-dir', cliOut,
  '--pages', '2',
  '--format', 'json',
  '--json'
]);
assert.equal(cli.code, 0, cli.stderr);
const cliJson = JSON.parse(cli.stdout);
assert.equal(cliJson.ok, true);
assert.equal(cliJson.result.tool, 'ppt.text');
assert.equal(cliJson.result.selected_count, 1);
assert.equal(cliJson.result.selected_slides[0].title, '风险边界');

const providerServer = createServer((request, response) => {
  assert.equal(request.headers.authorization, 'Bearer toolknit-local-ppt-text-key');
  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('end', () => {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    assert.equal(body.stream, false);
    assert.match(body.messages[1].content, /发布计划/);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { content: '## AI 大纲\n- 第 1 页：发布计划' } }] }));
  });
});
await new Promise(resolve => providerServer.listen(0, '127.0.0.1', resolve));
const providerAddress = providerServer.address();
try {
  const aiOut = path.join(fixtureDirectory, 'ai-out');
  const aiResult = await extractPptText({
    input_path: inputPath,
    output_dir: aiOut,
    pages: [1],
    format: 'markdown',
    ai_mode: 'outline'
  }, {
    env: {
      TOOLKNIT_AI_API_KEY: 'toolknit-local-ppt-text-key',
      TOOLKNIT_AI_API_URL: `http://127.0.0.1:${providerAddress.port}/v1/chat/completions`,
      TOOLKNIT_AI_MODEL: 'local-mock'
    }
  });
  assert.equal(aiResult.ai_result.mode, 'outline');
  assert.match(aiResult.ai_result.content, /AI 大纲/);
  assert.equal(aiResult.outputs.some(item => item.relative_path === 'ai-outline.md'), true);
} finally {
  await new Promise((resolve, reject) => providerServer.close(error => error ? reject(error) : resolve()));
}

const invalid = await runCli(['ppt', 'text', '--input', inputPath, '--output-dir', cliOut, '--pages', '99', '--json']);
assert.equal(invalid.code, 2);
assert.equal(JSON.parse(invalid.stderr).error.code, 'INVALID_ARGUMENT');

console.log('PPT text extraction runtime regression checks passed');

