import assert from 'node:assert/strict';
import { waitForAbortable } from '../cli/lib/errors.mjs';
import {
  TASK_STATES,
  TaskContractError,
  TaskStateMachine,
  createOutputManifest,
  createTaskId
} from '../shared/task-contract.mjs';
import { TaskRunner, isTaskCancellation } from '../shared/task-runtime.mjs';
import { runFfmpeg } from '../cli/lib/ffmpeg-runtime.mjs';

const taskId = createTaskId('test');
assert.match(taskId, /^test-/);

const events = [];
const task = new TaskStateMachine({ id: taskId, tool: 'test.contract', onEvent: event => events.push(event) });
assert.equal(task.state, TASK_STATES.QUEUED);
assert.throws(() => task.succeed(), TaskContractError);
task.start('Preparing fixture.');
task.report(25, 'Reading fixture.', { phase: 'read', current: 1, total: 4 });
assert.equal(task.snapshot.progress, 25);
assert.throws(() => task.report(24, 'Regression.'), /move backwards/);
task.report(100, 'Finished validation.', { phase: 'validate' });
task.succeed({ output_count: 1 });
assert.equal(task.state, TASK_STATES.SUCCEEDED);
assert.equal(task.snapshot.progress, 100);
assert.equal(task.snapshot.result.output_count, 1);
assert.equal(task.cancel().state, TASK_STATES.SUCCEEDED);
assert.ok(events.length >= 4);
assert.ok(events.every(event => event.schema_version === 1 && event.task_id === taskId));
assert.equal(events.at(-1).state, TASK_STATES.SUCCEEDED);

let release;
let cancelCalled = false;
const waitForRelease = new Promise(resolve => { release = resolve; });
const runner = new TaskRunner({
  tool: 'test.cancel',
  onCancel() {
    cancelCalled = true;
    release();
  }
});
const running = runner.run(async ({ report, throwIfCancelled }) => {
  report(10, 'Started.', { phase: 'work' });
  await waitForRelease;
  throwIfCancelled();
  return { unexpected: true };
});
await new Promise(resolve => setTimeout(resolve, 0));
await runner.cancel('User cancelled the test.');
await assert.rejects(running, error => isTaskCancellation(error) && error.code === 'CANCELLED');
assert.equal(cancelCalled, true);
assert.equal(runner.state, TASK_STATES.CANCELLED);

const externalController = new AbortController();
const externalRunner = new TaskRunner({ tool: 'test.external-cancel' });
const externalRun = externalRunner.run(async ({ signal }) => {
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(signal.aborted, true);
  return 'late';
}, { signal: externalController.signal });
externalController.abort('stop');
await assert.rejects(externalRun, error => isTaskCancellation(error));
assert.equal(externalRunner.state, TASK_STATES.CANCELLED);

const retryController = new AbortController();
const retryStartedAt = Date.now();
const retryWait = waitForAbortable(2_000, retryController.signal);
setTimeout(() => retryController.abort('Cancel retry delay.'), 20);
await assert.rejects(retryWait, error => error?.code === 'CANCELLED');
assert.ok(Date.now() - retryStartedAt < 500, 'A cancelled retry delay must not wait for its full timeout.');

const abortedBeforeSpawn = new AbortController();
abortedBeforeSpawn.abort('cancel before spawn');
await assert.rejects(
  runFfmpeg(process.execPath, ['-e', 'process.exit(0)'], { signal: abortedBeforeSpawn.signal }),
  error => String(error?.code).toUpperCase() === 'CANCELLED'
);

const childAbort = new AbortController();
let childProducedOutput = false;
const cancellableChild = runFfmpeg(process.execPath, [
  '-e',
  "setInterval(() => process.stdout.write('out_time_us=1000000\\n'), 10)"
], {
  signal: childAbort.signal,
  onStdout() {
    childProducedOutput = true;
    childAbort.abort('cancel running child');
  }
});
await assert.rejects(cancellableChild, error => String(error?.code).toUpperCase() === 'CANCELLED');
assert.equal(childProducedOutput, true);

const manifest = createOutputManifest({
  tool: 'test.manifest',
  taskId: createTaskId('manifest'),
  inputs: [{ path: 'C:/input.txt', bytes: 12 }],
  outputs: [{ path: 'C:/out.txt', bytes: 4, sha256: 'ABC123', kind: 'text' }, null],
  warnings: ['kept source']
});
assert.equal(manifest.outputs.length, 1);
assert.equal(manifest.outputs[0].sha256, 'abc123');
assert.deepEqual(manifest.warnings, ['kept source']);

console.log('Task contract and cancellation runtime tests passed');
