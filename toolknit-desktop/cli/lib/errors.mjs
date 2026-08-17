export const EXIT_CODES = Object.freeze({
  OK: 0,
  USAGE: 2,
  INPUT: 3,
  OUTPUT: 4,
  ENGINE: 5,
  PROCESSING: 6,
  INTERNAL: 70
});

const EXIT_CODE_BY_ERROR = Object.freeze({
  USAGE: EXIT_CODES.USAGE,
  INVALID_ARGUMENT: EXIT_CODES.USAGE,
  INPUT_NOT_FOUND: EXIT_CODES.INPUT,
  INPUT_INVALID: EXIT_CODES.INPUT,
  INPUT_TOO_LARGE: EXIT_CODES.INPUT,
  PDF_PASSWORD_PROTECTED: EXIT_CODES.INPUT,
  OUTPUT_INVALID: EXIT_CODES.OUTPUT,
  OUTPUT_EXISTS: EXIT_CODES.OUTPUT,
  OUTPUT_WRITE_FAILED: EXIT_CODES.OUTPUT,
  OUTPUT_CONFLICT: EXIT_CODES.OUTPUT,
  ENGINE_UNAVAILABLE: EXIT_CODES.ENGINE,
  DEPENDENCY_MISSING: EXIT_CODES.ENGINE,
  DEPENDENCY_INVALID: EXIT_CODES.ENGINE,
  PERMISSION_DENIED: EXIT_CODES.OUTPUT,
  CANCELLED: 130,
  VALIDATION_FAILED: EXIT_CODES.PROCESSING,
  PROCESS_FAILED: EXIT_CODES.PROCESSING,
  PROVIDER_TIMEOUT: EXIT_CODES.PROCESSING,
  PROVIDER_ERROR: EXIT_CODES.PROCESSING,
  AI_CONTENT_UNVERIFIED: EXIT_CODES.PROCESSING,
  AI_LAYOUT_INVALID: EXIT_CODES.PROCESSING,
  PROCESSING_FAILED: EXIT_CODES.PROCESSING
});

export class ToolKnitError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'ToolKnitError';
    this.code = code;
    this.exitCode = options.exitCode ?? EXIT_CODE_BY_ERROR[code] ?? EXIT_CODES.INTERNAL;
    this.details = options.details;
    this.taskId = options.taskId;
    this.phase = options.phase;
  }
}

export function isCancellationError(error) {
  return String(error?.code || '').toUpperCase() === 'CANCELLED'
    || error?.name === 'AbortError'
    || error?.name === 'TaskCancelledError';
}

export function cancellationMessage(signal, fallback = 'Task was cancelled.') {
  const reason = signal?.reason;
  if (typeof reason === 'string' && reason.trim()) return reason.trim();
  if (typeof reason?.message === 'string' && reason.message.trim()) return reason.message.trim();
  return fallback;
}

export function cancellationError(signal, fallback = 'Task was cancelled.') {
  return new ToolKnitError('CANCELLED', cancellationMessage(signal, fallback), { exitCode: 130 });
}

export function throwIfAborted(signal, fallback = 'Task was cancelled.') {
  if (signal?.aborted) throw cancellationError(signal, fallback);
}

export function waitForAbortable(milliseconds, signal) {
  throwIfAborted(signal);
  const delay = Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = callback => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(cancellationError(signal)));
    const timer = setTimeout(() => finish(resolve), delay);
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

export function toToolKnitError(error) {
  if (error instanceof ToolKnitError) return error;

  const details = String(error?.message || error || 'Unknown error');
  if (isCancellationError(error)) {
    return new ToolKnitError('CANCELLED', details || 'Task was cancelled.', { exitCode: 130, taskId: error?.taskId, phase: error?.phase });
  }
  const normalized = details.toLowerCase();
  if (normalized.includes('password') || normalized.includes('encrypted')) {
    return new ToolKnitError('PDF_PASSWORD_PROTECTED', 'The PDF is password-protected. Decrypt it before this operation.');
  }
  return new ToolKnitError('PROCESSING_FAILED', 'ToolKnit could not process this file.');
}

export function errorPayload(error) {
  const normalized = toToolKnitError(error);
  return {
    ok: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details === undefined ? {} : { details: normalized.details }),
      ...(normalized.taskId === undefined ? {} : { task_id: normalized.taskId }),
      ...(normalized.phase === undefined ? {} : { phase: normalized.phase })
    }
  };
}
