import { randomUUID } from 'node:crypto';
import { access, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSZip from 'jszip';
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

async function importPptImageExtractCore() {
  const stagedPath = path.join(STAGED_CORE_ROOT, 'ppt-image-extract-core.js');
  if (await fileExists(stagedPath)) return import(pathToFileURL(stagedPath).href);
  return import(pathToFileURL(path.join(PROJECT_ROOT, 'src', 'ppt-image-extract-core.js')).href);
}

const pptImageCore = await importPptImageExtractCore();
const {
  PPT_IMAGE_EXTRACT_LIMITS,
  PptImageExtractError,
  analyzePptxImages,
  createPptImageManifestMarkdown,
  planPptImageExport,
  sanitizePptImageBaseName
} = pptImageCore;

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

function mapPptImageError(error) {
  if (error instanceof ToolKnitError) return error;
  if (error instanceof PptImageExtractError) {
    const message = error.userMessage || error.message;
    if (['invalid_request', 'invalid_selection'].includes(error.code)) return new ToolKnitError('INVALID_ARGUMENT', message);
    if (['input_too_large', 'too_many_slides', 'too_many_media', 'too_many_images'].includes(error.code)) return new ToolKnitError('INPUT_TOO_LARGE', message);
    if (['invalid_extension', 'invalid_pptx', 'no_images'].includes(error.code)) return new ToolKnitError('INPUT_INVALID', message);
    return new ToolKnitError('PROCESSING_FAILED', message);
  }
  return new ToolKnitError('PROCESSING_FAILED', String(error?.message || error || 'PPT image extraction failed.'));
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
    throw new ToolKnitError('INPUT_INVALID', 'PPT image extraction currently supports .pptx files only.');
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
  if (metadata.size > PPT_IMAGE_EXTRACT_LIMITS.maxInputBytes) {
    throw new ToolKnitError('INPUT_TOO_LARGE', `PPTX files for image extraction must be ${PPT_IMAGE_EXTRACT_LIMITS.maxInputBytes / 1024 / 1024}MB or smaller.`);
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
  const safeBaseName = sanitizePptImageBaseName(baseName);
  for (let index = 0; index < 10_000; index++) {
    const suffix = index === 0 ? '' : `_${index}`;
    const candidate = path.join(parentDirectory, `${safeBaseName}_ppt_images${suffix}`);
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
  throw new ToolKnitError('OUTPUT_WRITE_FAILED', 'Could not reserve a unique PPT image output directory.');
}

function publicImageItem(item) {
  return {
    index: item.index,
    id: item.id,
    slide_number: item.slide_number,
    source: item.source,
    media_path: item.media_path,
    original_name: item.original_name,
    extension: item.extension,
    mime_type: item.mime_type,
    width: item.width,
    height: item.height,
    bytes: item.bytes,
    sha256: item.sha256,
    duplicate_of: item.duplicate_of,
    is_duplicate: item.is_duplicate,
    is_small_icon: item.is_small_icon,
    suggested_file_name: item.suggested_file_name
  };
}

export async function extractPptImages(args, options = {}) {
  try {
    throwIfAborted(options.signal);
    assertObject(args);
    assertOnlyKeys(args, new Set(['input_path', 'output_dir', 'pages', 'images', 'skip_duplicates', 'dry_run', 'output_name']));
    report(options, 0, 'Validating PPTX image extraction request.');
    const input = await inspectPptxInput(args.input_path);
    const inputBytes = await readInputBytes(input);
    throwIfAborted(options.signal);
    report(options, 15, 'Scanning PPTX package and slide relationships.');
    const manifest = await analyzePptxImages(inputBytes, { sourceName: input.name });
    if (manifest.image_count < 1) {
      throw new PptImageExtractError('no_images', 'No extractable image assets were found in this PPTX.');
    }
    const plan = planPptImageExport(manifest, {
      pages: args.pages,
      images: args.images,
      skip_duplicates: args.skip_duplicates === true
    });
    report(options, 35, `Prepared ${plan.selected_count} PPT image asset(s).`);

    const baseName = sanitizePptImageBaseName(args.output_name || input.name);
    const inputResult = { path: input.path, name: input.name, bytes: input.size };
    const summary = {
      tool: 'ppt.images',
      input: inputResult,
      slide_count: manifest.slide_count,
      media_count: manifest.media_count,
      image_count: manifest.image_count,
      duplicate_count: manifest.duplicate_count,
      missing_count: manifest.missing_count,
      selected_count: plan.selected_count,
      selected_bytes: plan.selected_bytes,
      skip_duplicates: plan.skip_duplicates,
      dry_run: args.dry_run === true,
      images: manifest.images.map(publicImageItem),
      missing: manifest.missing
    };

    if (args.dry_run === true) {
      report(options, 100, 'PPT image scan completed.');
      return summary;
    }

    const outputParent = await prepareOutputParent(args.output_dir);
    const finalDirectory = await reserveBatchDirectory(outputParent, baseName);
    const temporaryDirectory = await mkdtemp(path.join(outputParent, '.toolknit-ppt-images-'));
    const zip = await JSZip.loadAsync(inputBytes);
    const outputs = [];
    try {
      for (const [index, item] of plan.selected_images.entries()) {
        throwIfAborted(options.signal);
        const file = zip.file(item.media_path);
        if (!file) throw new ToolKnitError('INPUT_INVALID', `PPT image asset disappeared while exporting: ${item.media_path}`);
        const bytes = await file.async('uint8array');
        const fileName = item.suggested_file_name;
        const temporaryPath = path.join(temporaryDirectory, fileName);
        await writeFile(temporaryPath, bytes, { flag: 'wx', mode: 0o600 });
        const metadata = await stat(temporaryPath);
        if (!metadata.isFile() || metadata.size !== item.bytes) {
          throw new ToolKnitError('OUTPUT_WRITE_FAILED', `Temporary PPT image output is incomplete: ${fileName}`);
        }
        outputs.push({
          path: path.join(finalDirectory, fileName),
          relative_path: fileName,
          item: publicImageItem(item),
          id: item.id,
          slide_number: item.slide_number,
          media_path: item.media_path,
          extension: item.extension,
          width: item.width,
          height: item.height,
          bytes: item.bytes,
          duplicate_of: item.duplicate_of
        });
        report(options, 35 + ((index + 1) / plan.selected_images.length) * 50, `Prepared PPT image ${index + 1}/${plan.selected_images.length}.`);
      }

      const result = {
        ...summary,
        dry_run: false,
        output_dir: finalDirectory,
        outputs,
        output_count: outputs.length,
        manifest_paths: {
          json: path.join(finalDirectory, 'manifest.json'),
          markdown: path.join(finalDirectory, 'manifest.md')
        }
      };
      await writeFile(path.join(temporaryDirectory, 'manifest.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      await writeFile(path.join(temporaryDirectory, 'manifest.md'), createPptImageManifestMarkdown(result), { flag: 'wx', mode: 0o600 });
      report(options, 92, 'Publishing PPT image output directory.');
      await rename(temporaryDirectory, finalDirectory);
      report(options, 100, 'Published PPT image assets.');
      return result;
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  } catch (error) {
    throw mapPptImageError(error);
  }
}

