import { createDuplicateFileCleanupController } from './controller.js';
import '../cleanup-tools/large-file.css';
import './duplicate-file-cleanup.css';
export function initDuplicateFileCleanupTool(context) { return createDuplicateFileCleanupController(context); }
