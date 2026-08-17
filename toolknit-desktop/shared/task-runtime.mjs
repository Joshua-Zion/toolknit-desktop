import {
  TASK_ERROR_CODES,
  TaskCancelledError,
  TaskContractError,
  TaskStateMachine,
  createTaskId
} from './task-contract.mjs';

/**
 * Small cooperative task runner shared by browser and Node adapters.
 * Platform code may provide onCancel to terminate a native child process.
 */
export class TaskRunner {
  constructor({ id = createTaskId(), tool = 'unknown', cancellable = true, onEvent, onCancel } = {}) {
    this.task = new TaskStateMachine({ id, tool, cancellable, onEvent });
    this.onCancel = typeof onCancel === 'function' ? onCancel : null;
    this.controller = new AbortController();
    this.running = false;
    this.cancelPromise = null;
  }

  get id() { return this.task.id; }
  get state() { return this.task.state; }
  get snapshot() { return this.task.snapshot; }
  get signal() { return this.controller.signal; }

  async cancel(reason = 'Task cancellation requested.') {
    if (this.task.state === 'queued') this.task.cancel(reason);
    else if (this.task.state === 'running') this.task.cancel(reason);
    if (!this.controller.signal.aborted) {
      try { this.controller.abort(reason); } catch { this.controller.abort(); }
    }
    if (!this.cancelPromise && this.onCancel) {
      this.cancelPromise = Promise.resolve().then(() => this.onCancel(reason)).catch(() => {});
    }
    await this.cancelPromise;
    return this.snapshot;
  }

  async run(work, { signal } = {}) {
    if (this.running) throw new TaskContractError('VALIDATION_FAILED', 'A task runner can only execute one task.');
    if (typeof work !== 'function') throw new TaskContractError('INVALID_ARGUMENT', 'Task work must be a function.');
    this.running = true;
    let detachSignal = null;
    if (signal) {
      if (signal.aborted) await this.cancel(signal.reason?.message || 'Task was cancelled before it started.');
      else {
        const onAbort = () => { void this.cancel(signal.reason?.message || 'Task cancellation requested.'); };
        signal.addEventListener('abort', onAbort, { once: true });
        detachSignal = () => signal.removeEventListener('abort', onAbort);
      }
    }
    try {
      if (this.task.state === 'cancelled') throw new TaskCancelledError('Task was cancelled before it started.');
      this.task.start();
      const context = {
        id: this.id,
        signal: this.signal,
        report: (progress, message, details) => this.task.report(progress, message, details),
        throwIfCancelled: () => {
          if (this.signal.aborted || this.task.state === 'cancelling' || this.task.state === 'cancelled') {
            throw new TaskCancelledError();
          }
        }
      };
      const result = await work(context);
      if (this.signal.aborted || this.task.state === 'cancelling' || this.task.state === 'cancelled') {
        this.task.succeed(result);
        throw new TaskCancelledError();
      }
      this.task.succeed(result);
      return result;
    } catch (error) {
      if (error instanceof TaskCancelledError
        || String(error?.code || '').toUpperCase() === TASK_ERROR_CODES.CANCELLED
        || this.signal.aborted
        || this.task.state === 'cancelling') {
        this.task.fail(new TaskCancelledError(error?.message || 'Task was cancelled.'));
        throw new TaskCancelledError(error?.message || 'Task was cancelled.');
      }
      this.task.fail(error, TASK_ERROR_CODES.PROCESS_FAILED);
      throw error;
    } finally {
      detachSignal?.();
      this.running = false;
    }
  }
}

export function isTaskCancellation(error) {
  return error instanceof TaskCancelledError || String(error?.code || '').toUpperCase() === TASK_ERROR_CODES.CANCELLED;
}
