import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTerminalEventLog } from '../holoshell-terminal-event-stream.mjs';
import { runTerminalProcessLifecycle } from '../holoshell-terminal-runner.mjs';

const tempDir = mkdtempSync(join(tmpdir(), 'holoshell-terminal-runner-'));
const eventLogPath = join(tempDir, 'operator-terminal-events.jsonl');

const lifecycle = await runTerminalProcessLifecycle({
  executable: process.execPath,
  args: ['-e', "console.log('runner stdout'); console.error('runner stderr');"],
  eventLogPath,
  sessionId: 'terminal-runner-test-session',
  runId: 'terminal_runner_test_run',
  commandId: 'show_receipts',
  label: 'Show Receipts',
  sourceReceipt: '.tmp/holoshell/operator-terminal-readonly-execution-latest.json',
  timeoutMs: 10_000,
});

assert.equal(lifecycle.schemaVersion, 'hololand.holoshell.terminal-runner.v0.1.0');
assert.equal(lifecycle.adapter, 'scripts/holoshell-terminal-runner.mjs');
assert.equal(lifecycle.ok, true);
assert.equal(lifecycle.exitCode, 0);
assert.equal(lifecycle.endpointExecutesCommand, false);
assert.equal(lifecycle.endpointExecutesReadOnlyAdapter, true);
assert.equal(lifecycle.endpointExecutesRawCommand, false);
assert.equal(lifecycle.destructiveActionsTaken, false);
assert.equal(lifecycle.desktopAutomationExecuted, false);
assert.ok(lifecycle.nativeEventKinds.includes('run.started'));
assert.ok(lifecycle.nativeEventKinds.includes('stdout.chunk'));
assert.ok(lifecycle.nativeEventKinds.includes('stderr.chunk'));
assert.ok(lifecycle.nativeEventKinds.includes('run.exited'));
assert.match(lifecycle.stdoutPreview, /runner stdout/);
assert.match(lifecycle.stderrPreview, /runner stderr/);

const events = readTerminalEventLog(eventLogPath, { limit: 20 });
assert.equal(events.length, 4);
assert.deepEqual(events.map((event) => event.nativeEventKind), [
  'run.started',
  'stdout.chunk',
  'stderr.chunk',
  'run.exited',
]);
assert.equal(events.every((event) => event.schemaVersion === 'hololand.holoshell.terminal-event.v0.1.0'), true);
assert.equal(events.every((event) => event.source === 'apps/holoshell/source/holoshell-terminal-event-stream.hsplus'), true);
assert.equal(events.every((event) => event.upstreamSource === 'HoloScript:experiments/holoshell-human-os-frontier/native-terminal-event-stream.hsplus'), true);
assert.equal(events.every((event) => event.requiredCapabilityLane === 'terminal_event_read'), true);
assert.equal(events.every((event) => event.endpointExecutesCommand === false), true);
assert.equal(events.every((event) => event.endpointExecutesReadOnlyAdapter === true), true);
assert.equal(events.every((event) => event.endpointExecutesRawCommand === false), true);
assert.equal(events.every((event) => event.browserMayOwnExecution === false), true);
assert.equal(events.every((event) => event.rawCommandLineIncluded === false), true);
assert.equal(events.every((event) => event.destructiveActionsTaken === false), true);
assert.equal(events.every((event) => event.desktopAutomationExecuted === false), true);

console.log('PASS holoshell-terminal-runner');
