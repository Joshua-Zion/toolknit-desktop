import { randomUUID } from 'node:crypto';
import { access, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ToolKnitError, throwIfAborted } from './errors.mjs';

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_ROOT = path.resolve(CLI_ROOT, '..');
const STAGED_CORE_ROOT = path.join(CLI_ROOT, 'lib', 'core');

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function importPptCompressCore() {
  const stagedPath = path.join(STAGED_CORE_ROOT, 'ppt-compress-core.js');
  if (await fileExists(stagedPath)) return import(pathToFileURL(stagedPath).href);
  return import(pathToFileURL(path.join(PROJECT_ROOT, 'src', 'ppt-compress-core.js')).href);
}

const pptCompressCore = await importPptCompressCore();
const {
  PPT_COMPRESS_LIMITS,
  PptCompressError,
  compressPptxBytes,
  createPptCompressManifest,
  sanitizePptCompressBaseName
} = pptCompressCore;

function report(options, progress, message) {
  options.reportProgress?.(Math.max(0, Math.min(100, progress)), message);
}

function assertObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ToolKnitError('INVALID_ARGUMENT', 'arguments must be an object.');
  }
}

function assertOnlyKeys(value, allowed) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ToolKnitError('INVALID_ARGUMENT', `Unknown argument: ${key}`);
  }
}

function mapPptCompressError(error) {
  if (error instanceof ToolKnitError) return error;
  if (error instanceof PptCompressError) {
    const message = error.userMessage || error.message;
    if (['invalid_request', 'invalid_level'].includes(error.code)) return new ToolKnitError('INVALID_ARGUMENT', message);
    if (['input_too_large', 'too_many_slides', 'too_many_media'].includes(error.code)) return new ToolKnitError('INPUT_TOO_LARGE', message);
    if (['invalid_extension', 'invalid_pptx'].includes(error.code)) return new ToolKnitError('INPUT_INVALID', message);
    return new ToolKnitError('PROCESSING_FAILED', message);
  }
  return new ToolKnitError('PROCESSING_FAILED', String(error?.message || error || 'PPT compression failed.'));
}

function assertPathValue(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    throw new ToolKnitError('INVALID_ARGUMENT', `${label} must be a non-empty path.`);
  }
  return path.resolve(value.trim());
}

async function inspectPptxInput(inputPath) {
  const requested = assertPathValue(inputPath, 'input_path');
  if (path.extname(requested).toLowerCase() !== '.pptx') {
    throw new ToolKnitError('INPUT_INVALID', 'PPT compression currently supports .pptx files only.');
  }
  let metadata;
  try {
    metadata = await lstat(requested);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new ToolKnitError('INPUT_NOT_FOUND', `PPTX input does not exist: ${requested}`);
    throw new ToolKnitError('INPUT_INVALID', `PPTX input cannot be inspected: ${requested}`);
  }
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size < 1) {
    throw new ToolKnitError('INPUT_INVALID', `PPTX input must be a non-empty regular file: ${requested}`);
  }
  if (metadata.size > PPT_COMPRESS_LIMITS.maxInputBytes) {
    throw new ToolKnitError('INPUT_TOO_LARGE', `PPTX files for compression must be ${PPT_COMPRESS_LIMITS.maxInputBytes / 1024 / 1024}MB or smaller.`);
  }
  return { path: await realpath(requested), name: path.basename(requested), size: metadata.size };
}

async function readInputBytes(input) {
  try {
    const bytes = await readFile(input.path);
    if (bytes.length !== input.size) {
      throw new ToolKnitError('INPUT_INVALID', `PPTX input changed while it was being read: ${input.path}`);
    }
    return bytes;
  } catch (error) {
    if (error instanceof ToolKnitError) throw error;
    throw new ToolKnitError('INPUT_INVALID', `PPTX input cannot be read: ${input.path}`);
  }
}

async function prepareOutputParent(value) {
  const requested = assertPathValue(value, 'output_dir');
  try {
    await mkdir(requested, { recursive: true });
  } catch {
    throw new ToolKnitError('OUTPUT_INVALID', `Cannot create output directory: ${requested}`);
  }
  const metadata = await lstat(requested);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new ToolKnitError('OUTPUT_INVALID', 'output_dir must be a real directory, not a symbolic link.');
  }
  return realpath(requested);
}

async function reserveBatchDirectory(parentDirectory, baseName) {
  const safeBaseName = sanitizePptCompressBaseName(baseName);
  for (let index = 0; index < 10_000; index++) {
    const suffix = index === 0 ? '' : `_${index}`;
    const candidate = path.join(parentDirectory, `${safeBaseName}_ppt_compress${suffix}`);
    try {
      await lstat(candidate);
      continue;
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw new ToolKnitError('OUTPUT_INVALID', `Output directory cannot be inspected: ${candidate}`);
      }
      return candidate;
    }
  }
  throw new ToolKnitError('OUTPUT_WRITE_FAILED', 'Could not reserve a unique PPT compression output directory.');
}

function outputFileName(inputName) {
  return `${sanitizePptCompressBaseName(inputName)}_compressed.pptx`;
}

function publicResult(result) {
  return createPptCompressManifest(result);
}

let canvasModulePromise = null;

async function loadCanvasModule() {
  if (!canvasModulePromise) {
    canvasModulePromise = import('@napi-rs/canvas');
  }
  return canvasModulePromise;
}

function pptImageMimeType(extension) {
  const normalized = String(extension || '').toLowerCase().replace(/^\./, '');
  if (normalized === 'jpg' || normalized === 'jpeg') return 'image/jpeg';
  if (normalized === 'png') return 'image/png';
  return '';
}

function canvasHasAlpha(canvas, createCanvas) {
  const width = canvas.width;
  const height = canvas.height;
  if (!width || !height) return false;
  const sampleSize = 160;
  const targetCanvas = createCanvas(Math.min(sampleSize, width), Math.min(sampleSize, height));
  const context = targetCanvas.getContext('2d');
  if (!context) return true;
  context.drawImage(canvas, 0, 0, targetCanvas.width, targetCanvas.height);
  const data = context.getImageData(0, 0, targetCanvas.width, targetCanvas.height).data;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 250) return true;
  }
  return false;
}

async function compressPptImageInNode(task) {
  const extension = String(task?.extension || '').toLowerCase();
  const sourceMime = pptImageMimeType(extension);
  if (!sourceMime) return null;
  const { createCanvas, loadImage } = await loadCanvasModule();
  const image = await loadImage(Buffer.from(task.bytes));
  const sourceWidth = Math.max(1, image.width || 1);
  const sourceHeight = Math.max(1, image.height || 1);
  const maxDimension = Math.max(600, Number(task.maxDimension) || 2200);
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0, width, height);

  let outputExtension = extension === 'jpeg' ? 'jpg' : extension;
  let outputMime = sourceMime;
  if (extension === 'png') {
    if (!task.allowPngToJpeg || canvasHasAlpha(canvas, createCanvas)) return null;
    outputExtension = 'jpg';
    outputMime = 'image/jpeg';
  }
  if (outputMime === 'image/jpeg') {
    context.globalCompositeOperation = 'destination-over';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'source-over';
  }
  const quality = Math.round(Math.max(45, Math.min(95, (Number(task.quality) || 0.82) * 100)));
  return {
    bytes: canvas.toBuffer(outputMime, outputMime === 'image/jpeg' ? { quality } : undefined),
    extension: outputExtension,
    width,
    height
  };
}

export async function compressPpt(args, options = {}) {
  try {
    throwIfAborted(options.signal);
    assertObject(args);
    assertOnlyKeys(args, new Set(['input_path', 'output_dir', 'level', 'dry_run', 'output_name']));
    report(options, 0, 'Validating PPTX compression request.');
    const input = await inspectPptxInput(args.input_path);
    const inputBytes = await readInputBytes(input);
    throwIfAborted(options.signal);
    report(options, 28, 'Optimizing PPTX package structure.');
    const compressed = await compressPptxBytes(inputBytes, {
      sourceName: input.name,
      level: args.level || 'medium',
      imageCompressor: compressPptImageInNode
    });
    const summary = {
      ...publicResult(compressed),
      input: { path: input.path, name: input.name, bytes: input.size },
      dry_run: args.dry_run === true
    };

    if (args.dry_run === true) {
      report(options, 100, 'PPT compression scan completed.');
      return summary;
    }

    const outputParent = await prepareOutputParent(args.output_dir);
    const finalDirectory = await reserveBatchDirectory(outputParent, args.output_name || input.name);
    const temporaryDirectory = await mkdtemp(path.join(outputParent, '.toolknit-ppt-compress-'));
    try {
      const fileName = outputFileName(args.output_name || input.name);
      const temporaryOutputPath = path.join(temporaryDirectory, fileName);
      const finalOutputPath = path.join(finalDirectory, fileName);
      const result = {
        ...summary,
        dry_run: false,
        output_dir: finalDirectory,
        output_path: finalOutputPath,
        output_file: fileName,
        run_id: randomUUID(),
        generated_at: new Date().toISOString(),
        manifest_path: path.join(finalDirectory, 'manifest.json')
      };
      report(options, 72, 'Writing compressed PPTX.');
      await writeFile(temporaryOutputPath, compressed.bytes, { flag: 'wx', mode: 0o600 });
      const metadata = await stat(temporaryOutputPath);
      if (!metadata.isFile() || metadata.size !== compressed.bytes.byteLength) {
        throw new ToolKnitError('OUTPUT_WRITE_FAILED', 'Compressed PPTX output is incomplete.');
      }
      await writeFile(path.join(temporaryDirectory, 'manifest.json'), `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      report(options, 94, 'Publishing PPT compression output directory.');
      await rename(temporaryDirectory, finalDirectory);
      report(options, 100, 'Published compressed PPTX.');
      return result;
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  } catch (error) {
    throw mapPptCompressError(error);
  }
}
