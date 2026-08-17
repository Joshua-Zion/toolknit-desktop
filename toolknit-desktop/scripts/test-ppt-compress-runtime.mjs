import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { compressPpt } from '../cli/lib/ppt-compress-runtime.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const cliPath = path.join(projectRoot, 'cli', 'toolknit.mjs');

function pseudoImageBytes(size) {
  const bytes = Buffer.alloc(size);
  for (let index = 0; index < bytes.length; index++) bytes[index] = (index * 41 + 7) & 0xFF;
  return bytes;
}

async function createFixturePptx(filePath) {
  const zip = new JSZip();
  const imageBytes = pseudoImageBytes(64 * 1024);
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);
  zip.file('ppt/presentation.xml', `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);
  zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree><p:pic><a:blip r:embed="rId1"/></p:pic><p:pic><a:blip r:embed="rId2"/></p:pic></p:spTree></p:cSld></p:sld>`);
  zip.file('ppt/slides/_rels/slide1.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.png"/></Relationships>`);
  zip.file('ppt/media/image1.png', imageBytes);
  zip.file('ppt/media/image2.png', imageBytes);
  await writeFile(filePath, await zip.generateAsync({ type: 'uint8array', compression: 'STORE' }));
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

const fixtureDirectory = await mkdtemp(path.join(os.tmpdir(), 'toolknit-ppt-compress-'));
const inputPath = path.join(fixtureDirectory, 'demo.pptx');
const outputDirectory = path.join(fixtureDirectory, 'out');
await createFixturePptx(inputPath);

const dryRun = await compressPpt({
  input_path: inputPath,
  output_dir: outputDirectory,
  level: 'medium',
  dry_run: true
});
assert.equal(dryRun.tool, 'ppt.compress');
assert.equal(dryRun.dry_run, true);
assert.equal(dryRun.slide_count, 1);
assert.equal(dryRun.operations.deduplicated_media, 1);
await assert.rejects(() => readdir(outputDirectory), /ENOENT/);

const exported = await compressPpt({
  input_path: inputPath,
  output_dir: outputDirectory,
  level: 'medium',
  output_name: 'compressed-demo'
});
assert.equal(exported.dry_run, false);
assert.equal(exported.output_file, 'compressed-demo_compressed.pptx');
assert.ok(exported.saved_bytes > 0);
assert.ok(await stat(exported.output_path).then(file => file.size > 0));
assert.ok(await stat(exported.manifest_path).then(file => file.size > 0));
const manifest = JSON.parse(await readFile(exported.manifest_path, 'utf8'));
assert.equal(manifest.bytes, undefined);
assert.equal(manifest.output_file, 'compressed-demo_compressed.pptx');

const cliOut = path.join(fixtureDirectory, 'cli-out');
const cli = await runCli([
  'ppt', 'compress',
  '--input', inputPath,
  '--output-dir', cliOut,
  '--level', 'high',
  '--json'
]);
assert.equal(cli.code, 0, cli.stderr);
const cliJson = JSON.parse(cli.stdout);
assert.equal(cliJson.ok, true);
assert.equal(cliJson.result.tool, 'ppt.compress');
assert.equal(cliJson.result.level, 'high');
assert.ok(cliJson.result.saved_bytes > 0);

const invalid = await runCli(['ppt', 'compress', '--input', inputPath, '--output-dir', cliOut, '--level', 'tiny', '--json']);
assert.equal(invalid.code, 2);
assert.equal(JSON.parse(invalid.stderr).error.code, 'USAGE');

console.log('PPT compression runtime regression checks passed');
