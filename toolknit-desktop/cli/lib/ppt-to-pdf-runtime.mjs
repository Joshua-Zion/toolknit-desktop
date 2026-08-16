import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ToolKnitError, throwIfAborted } from './errors.mjs';
import {
  assertObject,
  assertOnlyKeys,
  assertPathValue,
  checkLibreOfficeAvailability,
  createPptToPdfFileName,
  createPptToPdfManifest,
  inspectPptxRenderInput,
  mapPptRenderError,
  prepareOutputParent,
  publishPptOutputDirectory,
  readPptxRenderInput,
  renderPptxToPdfFile,
  report,
  reservePptOutputDirectory,
  sanitizePptRenderBaseName,
  writeJsonFile
} from './ppt-render-runtime.mjs';

export { checkLibreOfficeAvailability };

export async function convertPptToPdf(args, options = {}) {
  try {
    throwIfAborted(options.signal);
    assertObject(args);
    assertOnlyKeys(args, new Set(['input_path', 'output_dir', 'dry_run', 'output_name']));
    report(options, 0, 'Validating PPTX to PDF request.');
    const input = await readPptxRenderInput(await inspectPptxRenderInput(args.input_path));
    assertPathValue(args.output_dir, 'output_dir');
    const renderer = await checkLibreOfficeAvailability();
    const baseName = sanitizePptRenderBaseName(args.output_name || input.name);
    const fileName = createPptToPdfFileName(baseName);
    const summary = {
      tool: 'ppt.to-pdf',
      source_name: input.name,
      input: { path: input.path, name: input.name, bytes: input.size },
      renderer,
      slide_count: input.manifest.slide_count,
      page_count: input.manifest.slide_count,
      output_dir: null,
      output_path: null,
      output_file: fileName,
      output_bytes: 0,
      dry_run: args.dry_run === true,
      warnings: renderer.available
        ? ['LibreOffice rendering may differ from Microsoft PowerPoint when fonts are missing.']
        : [renderer.message]
    };

    if (args.dry_run === true) {
      report(options, 100, 'PPT to PDF dry-run completed.');
      return createPptToPdfManifest(summary);
    }
    if (!renderer.available) {
      throw new ToolKnitError('DEPENDENCY_MISSING', renderer.message);
    }

    const outputParent = await prepareOutputParent(args.output_dir);
    const finalDirectory = await reservePptOutputDirectory(outputParent, baseName, 'ppt_to_pdf');
    const temporaryDirectory = await mkdtemp(path.join(outputParent, '.toolknit-ppt-to-pdf-'));
    try {
      report(options, 20, 'Rendering PPTX with LibreOffice.');
      const rendered = await renderPptxToPdfFile(input, temporaryDirectory, fileName, {
        renderer,
        signal: options.signal
      });
      throwIfAborted(options.signal);
      const result = createPptToPdfManifest({
        ...summary,
        dry_run: false,
        renderer: rendered.renderer,
        page_count: rendered.page_count,
        output_dir: finalDirectory,
        output_path: path.join(finalDirectory, fileName),
        output_file: fileName,
        output_bytes: rendered.bytes,
        warnings: [...summary.warnings, ...rendered.warnings],
        run_id: randomUUID(),
        generated_at: new Date().toISOString()
      });
      report(options, 82, 'Writing PPT to PDF manifest.');
      await writeJsonFile(path.join(temporaryDirectory, 'manifest.json'), result);
      report(options, 94, 'Publishing PPT to PDF output directory.');
      await publishPptOutputDirectory(temporaryDirectory, finalDirectory);
      report(options, 100, 'Published PPT PDF output.');
      return result;
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  } catch (error) {
    throw mapPptRenderError(error, 'PPT to PDF conversion failed.');
  }
}
