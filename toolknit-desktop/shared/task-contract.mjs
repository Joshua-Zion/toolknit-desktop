/**
 * Shared task lifecycle and result contract.
 *
 * This module is intentionally free of platform APIs so the desktop UI, CLI,
 * and Agent adapters can use the same state machine and event shape.
 */

export const TASK_CONTRACT_VERSION = 1;

export const TASK_STATES = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  CANCELLING: 'cancelling',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
});

export const TERMINAL_TASK_STATES = Object.freeze(new Set([
  TASK_STATES.SUCCEEDED,
  TASK_STATES.FAILED,
  TASK_STATES.CANCELLED
]));

export const TASK_ERROR_CODES = Object.freeze({
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  INPUT_NOT_FOUND: 'INPUT_NOT_FOUND',
  INPUT_INVALID: 'INPUT_INVALID',
  DEPENDENCY_MISSING: 'DEPENDENCY_MISSING',
  DEPENDENCY_INVALID: 'DEPENDENCY_INVALID',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  OUTPUT_CONFLICT: 'OUTPUT_CONFLICT',
  OUTPUT_WRITE_FAILED: 'OUTPUT_WRITE_FAILED',
  PROCESS_FAILED: 'PROCESS_FAILED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  CANCELLED: 'CANCELLED',
  INTERNAL: 'INTERNAL'
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [TASK_STATES.QUEUED]: new Set([TASK_STATES.RUNNING, TASK_STATES.CANCELLING, TASK_STATES.CANCELLED]),
  [TASK_STATES.RUNNING]: new Set([TASK_STATES.CANCELLING, TASK_STATES.SUCCEEDED, TASK_STATES.FAILED, TASK_STATES.CANCELLED]),
  [TASK_STATES.CANCELLING]: new Set([TASK_STATES.CANCELLED, TASK_STATES.FAILED]),
  [TASK_STATES.SUCCEEDED]: new Set(),
  [TASK_STATES.FAILED]: new Set(),
  [TASK_STATES.CANCELLED]: new Set()
});

const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/;

function nowIso(now) {
  const value = now instanceof Date ? now : new Date(now);
  return Number.isNaN(value.getTime()) ? new Date().toISOString() : value.toISOString();
}

function randomSuffix() {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createTaskId(prefix = 'task') {
  const normalizedPrefix = String(prefix || 'task').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 32) || 'task';
  return `${normalizedPrefix}-${randomSuffix()}`.slice(0, 96);
}

export function assertTaskId(taskId) {
  if (typeof taskId !== 'string' || !TASK_ID_PATTERN.test(taskId)) {
    throw new TaskContractError('INVALID_ARGUMENT', 'task_id must contain only ASCII letters, numbers, hyphens, or underscores and be no longer than 96 characters.');
  }
  return taskId;
}

export function normalizePercent(value, fallback = 0) {
  const numeric = Number(value);
  const safeFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(numeric) ? numeric : safeFallback)));
}

export function normalizeProgress({ percent = 0, phase = 'work', current = null, total = null, message = '' } = {}, previousPercent = 0) {
  const normalizedPercent = normalizePercent(percent, previousPercent);
  if (normalizedPercent < previousPercent) {
    throw new TaskContractError('VALIDATION_FAILED', `Task progress cannot move backwards (${normalizedPercent} < ${previousPercent}).`);
  }
  const normalizedTotal = total === null || total === undefined ? null : Math.max(0, Number(total) || 0);
  const normalizedCurrent = current === null || current === undefined ? null : Math.max(0, Number(current) || 0);
  return {
    progress: normalizedPercent,
    phase: String(phase || 'work').slice(0, 80),
    current: normalizedCurrent,
    total: normalizedTotal,
    message: String(message || '').slice(0, 1000)
  };
}

export function normalizeTaskError(error, fallbackCode = TASK_ERROR_CODES.INTERNAL) {
  const source = error && typeof error === 'object' ? error : {};
  const rawCode = String(source.code || '').trim().toUpperCase();
  const code = Object.values(TASK_ERROR_CODES).includes(rawCode) ? rawCode : fallbackCode;
  const message = String(source.message || error || 'Task failed.').trim().slice(0, 2000) || 'Task failed.';
  const details = source.details === undefined ? undefined : source.details;
  return { code, message, ...(details === undefined ? {} : { details }) };
}

export class TaskContractError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'TaskContractError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export class TaskCancelledError extends TaskContractError {
  constructor(message = 'Task was cancelled.') {
    super(TASK_ERROR_CODES.CANCELLED, message);
    this.name = 'TaskCancelledError';
  }
}

export class TaskStateMachine {
  #snapshot;
  #now;
  #onEvent;

  constructor({ id = createTaskId(), tool = 'unknown', cancellable = true, now = () => new Date(), onEvent } = {}) {
    assertTaskId(id);
    this.#now = now;
    this.#onEvent = typeof onEvent === 'function' ? onEvent : () => {};
    const createdAt = nowIso(this.#now());
    this.#snapshot = {
      schema_version: TASK_CONTRACT_VERSION,
      task_id: id,
      tool: String(tool || 'unknown').slice(0, 120),
      state: TASK_STATES.QUEUED,
      cancellable: Boolean(cancellable),
      phase: 'queued',
      progress: 0,
      current: null,
      total: null,
      message: '',
      created_at: createdAt,
      started_at: null,
      finished_at: null,
      result: undefined,
      error: undefined,
      sequence: 0
    };
    this.#emit();
  }

  get id() { return this.#snapshot.task_id; }
  get state() { return this.#snapshot.state; }
  get signalState() { return this.#snapshot.state; }
  get snapshot() { return { ...this.#snapshot }; }

  #emit() {
    this.#snapshot.sequence += 1;
    const event = { ...this.#snapshot };
    try { this.#onEvent(event); } catch {}
  }

  #transition(nextState, patch = {}) {
    if (nextState !== this.#snapshot.state && !ALLOWED_TRANSITIONS[this.#snapshot.state]?.has(nextState)) {
      throw new TaskContractError('VALIDATION_FAILED', `Invalid task state transition: ${this.#snapshot.state} -> ${nextState}.`);
    }
    Object.assign(this.#snapshot, patch, { state: nextState });
    this.#emit();
    return this.snapshot;
  }

  start(message = 'Task started.') {
    if (this.state === TASK_STATES.RUNNING) return this.snapshot;
    if (this.state !== TASK_STATES.QUEUED) {
      throw new TaskContractError('VALIDATION_FAILED', 'Only a queued task can start.');
    }
    return this.#transition(TASK_STATES.RUNNING, {
      phase: 'prepare',
      message: String(message || '').slice(0, 1000),
      started_at: nowIso(this.#now())
    });
  }

  report(progress = 0, message = '', details = {}) {
    if (TERMINAL_TASK_STATES.has(this.state)) return this.snapshot;
    if (this.state === TASK_STATES.QUEUED) this.start();
    const normalized = normalizeProgress({
      percent: progress,
      phase: details.phase || this.#snapshot.phase,
      current: details.current ?? this.#snapshot.current,
      total: details.total ?? this.#snapshot.total,
      message
    }, this.#snapshot.progress);
    Object.assign(this.#snapshot, normalized);
    this.#emit();
    return this.snapshot;
  }

  cancel(message = 'Task cancellation requested.') {
    if (TERMINAL_TASK_STATES.has(this.state)) return this.snapshot;
    if (this.state === TASK_STATES.QUEUED) {
      return this.#transition(TASK_STATES.CANCELLED, {
        phase: 'cancelled',
        message: String(message || '').slice(0, 1000),
        finished_at: nowIso(this.#now()),
        error: { code: TASK_ERROR_CODES.CANCELLED, message: String(message || 'Task was cancelled.') }
      });
    }
    if (this.state === TASK_STATES.RUNNING) {
      return this.#transition(TASK_STATES.CANCELLING, {
        phase: 'cancelling',
        message: String(message || '').slice(0, 1000)
      });
    }
    return this.snapshot;
  }

  succeed(result, message = 'Task completed.') {
    if (this.state === TASK_STATES.CANCELLING) {
      return this.#transition(TASK_STATES.CANCELLED, {
        phase: 'cancelled',
        message: 'Task was cancelled before publication.',
        progress: Math.min(99, this.#snapshot.progress),
        finished_at: nowIso(this.#now()),
        error: { code: TASK_ERROR_CODES.CANCELLED, message: 'Task was cancelled before publication.' }
      });
    }
    if (this.state !== TASK_STATES.RUNNING) {
      throw new TaskContractError('VALIDATION_FAILED', 'Only a running task can succeed.');
    }
    return this.#transition(TASK_STATES.SUCCEEDED, {
      phase: 'complete',
      progress: 100,
      message: String(message || '').slice(0, 1000),
      finished_at: nowIso(this.#now()),
      result,
      error: undefined
    });
  }

  fail(error, fallbackCode = TASK_ERROR_CODES.INTERNAL) {
    if (this.state === TASK_STATES.CANCELLING) {
      return this.#transition(TASK_STATES.CANCELLED, {
        phase: 'cancelled',
        message: 'Task was cancelled.',
        finished_at: nowIso(this.#now()),
        error: { code: TASK_ERROR_CODES.CANCELLED, message: 'Task was cancelled.' }
      });
    }
    if (TERMINAL_TASK_STATES.has(this.state)) return this.snapshot;
    const normalized = normalizeTaskError(error, fallbackCode);
    return this.#transition(TASK_STATES.FAILED, {
      phase: 'failed',
      message: normalized.message,
      finished_at: nowIso(this.#now()),
      error: normalized
    });
  }
}

export function createOutputManifest({ tool, taskId, inputs = [], outputs = [], warnings = [], startedAt = null, finishedAt = null } = {}) {
  assertTaskId(taskId);
  const normalizeFile = file => {
    if (!file || typeof file !== 'object') return null;
    const path = String(file.path || '').trim();
    if (!path) return null;
    const bytes = Number(file.bytes);
    return {
      path,
      ...(Number.isSafeInteger(bytes) && bytes >= 0 ? { bytes } : {}),
      ...(file.sha256 ? { sha256: String(file.sha256).toLowerCase() } : {}),
      ...(file.kind ? { kind: String(file.kind).slice(0, 40) } : {})
    };
  };
  return {
    schema_version: TASK_CONTRACT_VERSION,
    task_id: taskId,
    tool: String(tool || 'unknown').slice(0, 120),
    inputs: Array.isArray(inputs) ? inputs.map(normalizeFile).filter(Boolean) : [],
    outputs: Array.isArray(outputs) ? outputs.map(normalizeFile).filter(Boolean) : [],
    warnings: Array.isArray(warnings) ? warnings.map(value => String(value).slice(0, 1000)).filter(Boolean) : [],
    started_at: startedAt,
    finished_at: finishedAt
  };
}
