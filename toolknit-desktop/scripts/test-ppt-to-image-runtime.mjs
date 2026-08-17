import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPptDraftPptx } from '../src/ppt-draft-core.js';
import { checkLibreOfficeAvailability } from '../cli/lib/ppt-to-pdf-runtime.mjs';
import { convertPptToImages } from '../cli/lib/ppt-to-image-runtime.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const cliPath = path.join(projectRoot, 'cli', 'toolknit.mjs');

function outlinePayload(slides = 3) {
  return {
    ready: true,
    title: 'ToolKnit PPT 转图片测试',
    subtitle: '逐页图像导出',
    audience: '测试用户',
    purpose: '验证 PPTX 转图片',
    narrative: { central_takeaway: 'PPTX can be rendered to images.' },
    design: {},
    slides: Array.from({ length: slides }, (_, index) => ({
      page: index + 1,
      type: index === 0 ? 'title' : 'content',
      title: `图片测试第 ${index + 1} 页`,
      claim: `这是第 ${index + 1} 页`,
      body: [`导出一页一张图`, `支持页码选择`],
      visual_suggestion: '简洁文字页',
      speaker_note: '测试备注',
      transition: '继续'
    }))
  };
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: projectRoot,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
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

const fixtureDirectory = await mkdtemp(path.join(os.tmpdir(), 'toolknit-ppt-to-image-'));
const inputPath = path.join(fixtureDirectory, 'demo.pptx');
const outputDirectory = path.join(fixtureDirectory, 'out');
const draft = await buildPptDraftPptx(outlinePayload(3), { theme: 'tech-blue' });
await writeFile(inputPath, draft.bytes);

const dryRun = await convertPptToImages({
  input_path: inputPath,
  output_dir: outputDirectory,
  pages: [3, 1],
  format: 'jpeg',
  clarity: 'print',
  dry_run: true,
  output_name: 'deck-pages'
});
assert.equal(dryRun.tool, 'ppt.to-image');
assert.equal(dryRun.dry_run, true);
assert.deepEqual(dryRun.selected_pages, [1, 3]);
assert.equal(dryRun.format, 'jpg');
assert.equal(dryRun.output_count, 2);
await assert.rejects(() => readdir(outputDirectory), /ENOENT|no such file/i);

const cliHelp = await runCli(['ppt', 'to-image', '--help']);
assert.equal(cliHelp.code, 0, cliHelp.stderr);
assert.match(cliHelp.stdout, /PPT 转图片/);
assert.match(cliHelp.stdout, /clarity/);

const cliDryRun = await runCli([
  'ppt', 'to-image',
  '--input', inputPath,
  '--output-dir', outputDirectory,
  '--pages', '1-2',
  '--format', 'webp',
  '--clarity', 'standard',
  '--dry-run',
  '--json'
]);
assert.equal(cliDryRun.code, 0, cliDryRun.stderr);
assert.equal(JSON.parse(cliDryRun.stdout).result.tool, 'ppt.to-image');

const renderer = await checkLibreOfficeAvailability();
if (!renderer.available) {
  console.log('PPT to image runtime actual conversion skipped: LibreOffice unavailable.');
} else {
  const exported = await convertPptToImages({
    input_path: inputPath,
    output_dir: outputDirectory,
    pages: [1, 2],
    format: 'png',
    clarity: 'standard',
    output_name: 'deck-pages'
  });
  assert.equal(exported.dry_run, false);
  assert.equal(exported.output_count, 2);
  assert.equal(exported.intermediate_pdf_file, null);
  assert.equal(exported.outputs.every(output => output.format === 'png'), true);
  assert.ok(await stat(exported.outputs[0].path).then(file => file.size > 1000));
  assert.ok(await stat(path.join(exported.output_dir, 'manifest.json')).then(file => file.size > 100));

  const cliOut = path.join(fixtureDirectory, 'cli-out');
  const cli = await runCli([
    'ppt', 'to-image',
    '--input', inputPath,
    '--output-dir', cliOut,
    '--pages', '2',
    '--format', 'jpg',
    '--clarity', 'standard',
    '--output-name', 'cli-pages',
    '--json'
  ]);
  assert.equal(cli.code, 0, cli.stderr);
  const cliJson = JSON.parse(cli.stdout);
  assert.equal(cliJson.result.tool, 'ppt.to-image');
  assert.equal(cliJson.result.output_count, 1);
  assert.equal(cliJson.result.outputs[0].format, 'jpg');
  assert.equal(await stat(cliJson.result.outputs[0].path).then(file => file.size > 1000), true);
}

console.log('PPT to image runtime regression checks passed');
