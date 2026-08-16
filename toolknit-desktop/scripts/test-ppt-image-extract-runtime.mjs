import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { extractPptImages } from '../cli/lib/ppt-image-extract-runtime.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const cliPath = path.join(projectRoot, 'cli', 'toolknit.mjs');
const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);
const svg20x10 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#111"/></svg>');

async function createFixturePptx(filePath) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="svg" ContentType="image/svg+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);
  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst>
</p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
</Relationships>`);
  zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree><p:pic><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:embed="rId1"/></p:pic></p:spTree></p:cSld></p:sld>`);
  zip.file('ppt/slides/_rels/slide1.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`);
  zip.file('ppt/slides/slide2.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree><p:pic><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:embed="rId1"/></p:pic><p:pic><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:embed="rId2"/></p:pic></p:spTree></p:cSld></p:sld>`);
  zip.file('ppt/slides/_rels/slide2.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.svg"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`);
  zip.file('ppt/media/image1.png', png1x1);
  zip.file('ppt/media/image2.svg', svg20x10);
  zip.file('ppt/media/unreferenced.svg', svg20x10);
  await writeFile(filePath, await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
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

const fixtureDirectory = await mkdtemp(path.join(os.tmpdir(), 'toolknit-ppt-images-'));
const inputPath = path.join(fixtureDirectory, 'demo.pptx');
const outputDirectory = path.join(fixtureDirectory, 'out');
await createFixturePptx(inputPath);

const dryRun = await extractPptImages({
  input_path: inputPath,
  output_dir: outputDirectory,
  dry_run: true
});
assert.equal(dryRun.tool, 'ppt.images');
assert.equal(dryRun.dry_run, true);
assert.equal(dryRun.image_count, 4);
assert.equal(dryRun.selected_count, 4);
await assert.rejects(() => readdir(outputDirectory), /ENOENT/);

const exported = await extractPptImages({
  input_path: inputPath,
  output_dir: outputDirectory,
  pages: [2],
  skip_duplicates: true,
  output_name: 'demo-assets'
});
assert.equal(exported.dry_run, false);
assert.equal(exported.output_count, 1);
assert.equal(exported.outputs[0].slide_number, 2);
assert.equal(path.basename(exported.outputs[0].path), 'slide_02_image_002.svg');
assert.ok(await stat(exported.outputs[0].path).then(file => file.size > 0));
assert.ok(await stat(exported.manifest_paths.json).then(file => file.size > 0));
assert.ok(await stat(exported.manifest_paths.markdown).then(file => file.size > 0));
const manifestJson = JSON.parse(await readFile(exported.manifest_paths.json, 'utf8'));
assert.equal(manifestJson.output_count, 1);
assert.equal(manifestJson.outputs[0].relative_path, 'slide_02_image_002.svg');

const cliOut = path.join(fixtureDirectory, 'cli-out');
const cli = await runCli([
  'ppt', 'images',
  '--input', inputPath,
  '--output-dir', cliOut,
  '--images', '1,3',
  '--skip-duplicates',
  '--dry-run',
  '--json'
]);
assert.equal(cli.code, 0, cli.stderr);
const cliJson = JSON.parse(cli.stdout);
assert.equal(cliJson.ok, true);
assert.equal(cliJson.result.tool, 'ppt.images');
assert.equal(cliJson.result.selected_count, 1);
assert.equal(cliJson.result.images[0].suggested_file_name, 'slide_01_image_001.png');
await assert.rejects(() => readdir(cliOut), /ENOENT/);

const invalid = await runCli(['ppt', 'images', '--input', inputPath, '--output-dir', cliOut, '--images', '99', '--json']);
assert.equal(invalid.code, 2);
assert.equal(JSON.parse(invalid.stderr).error.code, 'INVALID_ARGUMENT');

console.log('PPT image extraction runtime regression checks passed');

