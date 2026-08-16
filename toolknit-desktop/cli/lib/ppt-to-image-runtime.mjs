import { mkdtemp, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { convertPdfToImages } from './pdf-to-image-runtime.mjs';
import { ToolKnitError, throwIfAborted } from './errors.mjs';
import {
  assertObject,
  assertOnlyKeys,
  assertPathValue,
  checkLibreOfficeAvailability,
  createPptToImageManifest,
  inspectPptxRenderInput,
  mapPptRenderError,
  normalizePptToImageClarity,
  normalizePptToImageFormat,
  normalizePptToImagePages,
  prepareOutputParent,
  publishPptOutputDirectory,
  readPptxRenderInput,
  renderPptxToPdfFile,
  report,
  reservePptOutputDirectory,
  sanitizePptRenderBaseName,
  writeJsonFile
} from './ppt-render-runtime.mjs';

function rebaseOutputPath(outputPath, temporaryDirectory, finalDirectory) {
  const relative = path.relative(temporaryDirectory, outputPath);
  return path.join(finalDirectory, relative);
}

export async function convertPptToImages(args, options = {}) {
  try {
    throwIfAborted(options.signal);
    assertObject(args);
    assertOnlyKeys(args, new Set(['input_path', 'output_dir', 'pages', 'format', 'clarity', 'dry_run', 'output_name']));
    report(options, 0, 'Validating PPTX to image request.');
    const input = await readPptxRenderInput(await inspectPptxRenderInput(args.input_path));
    assertPathValue(args.output_dir, 'output_dir');
    const renderer = await checkLibreOfficeAvailability();
    const format = normalizePptToImageFormat(args.format || 'png');
    const clarity = normalizePptToImageClarity(args.clarity || 'high');
    const selectedPages = normalizePptToImagePages(args.pages, input.manifest.slide_count);
    const baseName = sanitizePptRenderBaseName(args.output_name || input.name);
    const summary = {
      tool: 'ppt.to-image',
      source_name: input.name,
      input: { path: input.path, name: input.name, bytes: input.size },
      renderer,
      slide_count: input.manifest.slide_count,
      page_count: input.manifest.slide_count,
      selected_pages: selectedPages,
      format,
      clarity,
      output_dir: null,
      output_count: selectedPages.length,
      outputs: [],
      intermediate_pdf_file: null,
      dry_run: args.dry_run === true,
      warnings: renderer.available
        ? ['LibreOffice rendering may differ from Microsoft PowerPoint when fonts are missing.']
        : [renderer.message]
    };

    if (args.dry_run === true) {
      report(options, 100, 'PPT to image dry-run completed.');
      return createPptToImageManifest(summary);
    }
    if (!renderer.available) {
      throw new ToolKnitError('DEPENDENCY_MISSING', renderer.message);
    }

    const outputParent = await prepareOutputParent(args.output_dir);
    const finalDirectory = await reservePptOutputDirectory(outputParent, baseName, 'ppt_to_images');
    const temporaryDirectory = await mkdtemp(path.join(outputParent, '.toolknit-ppt-to-images-'));
    const intermediatePdfName = `${baseName}_source.pdf`;
    try {
      report(options, 16, 'Rendering PPTX to an intermediate PDF.');
      const renderedPdf = await renderPptxToPdfFile(input, temporaryDirectory, intermediatePdfName, {
        renderer,
        signal: options.signal
      });
      throwIfAborted(options.signal);
      report(options, 42, 'Rendering PDF pages to images.');
      const imageResult = await convertPdfToImages({
        input_path: renderedPdf.path,
        output_dir: temporaryDirectory,
        pages: selectedPages,
        mode: 'images',
        format,
        clarity,
        output_name: baseName
      }, {
        ...options,
        reportProgress(progress, message) {
          report(options, 42 + (Math.max(0, Math.min(100, progress)) * 0.42), message || 'Rendering PPT images.');
        }
      });
      await unlink(renderedPdf.path).catch(() => {});
      const outputs = imageResult.outputs.map(output => ({
        ...output,
        path: rebaseOutputPath(output.path, temporaryDirectory, finalDirectory)
      }));
      const result = createPptToImageManifest({
        ...summary,
        dry_run: false,
        renderer: renderedPdf.renderer,
        page_count: renderedPdf.page_count,
        output_dir: finalDirectory,
        output_count: outputs.length,
        outputs,
        intermediate_pdf_file: null,
        warnings: [...summary.warnings, ...renderedPdf.warnings],
        run_id: randomUUID(),
        generated_at: new Date().toISOString()
      });
      report(options, 88, 'Writing PPT image manifest.');
      await writeJsonFile(path.join(temporaryDirectory, 'manifest.json'), result);
      report(options, 94, 'Publishing PPT image output directory.');
      await publishPptOutputDirectory(temporaryDirectory, finalDirectory);
      report(options, 100, 'Published PPT image outputs.');
      return result;
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  } catch (error) {
    throw mapPptRenderError(error, 'PPT to image conversion failed.');
  }
}
