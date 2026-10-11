import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(path.join(projectRoot, relative), 'utf8');

const [limits, pdfEditor, pdfToImage, pdfEnhance, imageBatch, colorExtractor, imageStitch, pdfScan, pdfText, pdfAi, markdownController, stitchController, cliStitch, cliLimits] = await Promise.all([
  import('../src/core/limits/index.js'),
  import('../src/pdf-editor-core.js'),
  import('../src/pdf-to-image-core.js'),
  import('../src/pdf-enhance-core.js'),
  import('../src/image-batch-core.js'),
  import('../src/color-extractor-core.js'),
  import('../src/image-stitch-core.js'),
  import('../src/features/pdf-to-scan/core.js'),
  import('../src/features/pdf-text-extract/core.js'),
  import('../src/features/pdf-ai-markdown/core.js'),
  read('src/features/markdown-editor/controller.js'),
  read('src/features/image-stitch/controller.js'),
  import('../cli/lib/image-stitch-runtime.mjs'),
  import('../cli/lib/core/image-stitch-core.js')
]);

assert.strictEqual(pdfEditor.PDF_EDITOR_LIMITS, limits.PDF_EDITOR_LIMITS);
assert.strictEqual(pdfToImage.PDF_TO_IMAGE_LIMITS, limits.PDF_TO_IMAGE_LIMITS);
assert.strictEqual(pdfEnhance.PDF_ENHANCE_LIMITS, limits.PDF_ENHANCE_LIMITS);
assert.strictEqual(imageBatch.IMAGE_BATCH_LIMITS, limits.IMAGE_BATCH_LIMITS);
assert.strictEqual(colorExtractor.COLOR_EXTRACTOR_LIMITS, limits.COLOR_EXTRACTOR_LIMITS);
assert.strictEqual(imageStitch.IMAGE_STITCH_LIMITS, limits.IMAGE_STITCH_LIMITS);
assert.strictEqual(pdfScan.SCAN_LIMITS, limits.PDF_SCAN_LIMITS);
assert.strictEqual(pdfText.PDF_TEXT_LIMITS, limits.PDF_TEXT_LIMITS);
assert.strictEqual(pdfAi.PDF_AI_MARKDOWN_LIMITS, limits.PDF_AI_MARKDOWN_LIMITS);
assert.match(markdownController, /MAX_MARKDOWN_ASSETS/);
assert.match(markdownController, /MAX_MARKDOWN_ASSET_BYTES/);
assert.match(markdownController, /MAX_MARKDOWN_ASSET_TOTAL_BYTES/);

assert.equal(cliLimits.IMAGE_STITCH_LIMITS.maxBytesPerFile, limits.IMAGE_STITCH_LIMITS.maxBytesPerFile);
assert.equal(cliLimits.IMAGE_STITCH_LIMITS.maxFiles, limits.IMAGE_STITCH_LIMITS.maxFiles);
assert.doesNotMatch(stitchController, /250\s*\*\s*1024\s*\*\s*1024/);
assert.match(stitchController, /PDF_EDITOR_LIMITS\.maxInputBytes/);

const stageScript = await read('scripts/stage-cli-resources.cjs');
for (const file of ['core/limits/bytes.js', 'core/limits/pdf.js', 'core/limits/ai.js', 'core/limits/image.js', 'core/limits/markdown.js']) {
  assert.match(stageScript, new RegExp(`['"]${file.replaceAll('/', '\\/')}['"]`), `CLI staging must include ${file}`);
}

const rustLimits = await read('src-tauri/src/native_runtime/limits.rs');
const rustIo = await read('src-tauri/src/native_runtime/media/io.rs');
assert.match(rustIo, /MARKDOWN_MAX_DOCUMENT_BYTES/);
assert.match(rustIo, /MARKDOWN_MAX_ASSETS/);
assert.match(rustIo, /MARKDOWN_MAX_ASSET_BYTES/);
assert.match(rustIo, /MARKDOWN_MAX_TOTAL_ASSET_BYTES/);
assert.match(rustLimits, /MARKDOWN_MAX_ASSETS: usize = 20/);
assert.match(rustLimits, /MARKDOWN_MAX_ASSET_BYTES: usize = 15 \* 1024 \* 1024/);
assert.match(rustLimits, /MARKDOWN_MAX_TOTAL_ASSET_BYTES: usize = 40 \* 1024 \* 1024/);

console.log('Limits contract passed: shared PDF/image/Markdown limits, CLI staging, and Rust Markdown guards are aligned.');
