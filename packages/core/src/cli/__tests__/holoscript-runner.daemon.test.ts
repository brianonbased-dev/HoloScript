import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';

interface DaemonHarness {
  proc: ChildProcessWithoutNullStreams;
  lines: string[];
  json: Array<Record<string, unknown>>;
  tempDir: string;
  stderr: string[];
}

function waitFor(
  predicate: () => boolean,
  timeoutMs = 45000,
  intervalMs = 25,
  onTimeout?: () => string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
        return;
      }

      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        const details = onTimeout ? `\n${onTimeout()}` : '';
        reject(new Error(`Timed out waiting for daemon response${details}`));
      }
    }, intervalMs);
  });
}

function startDaemon(): DaemonHarness {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'holo-daemon-'));
  const sourcePath = path.join(tempDir, 'daemon-scene.hsplus');

  writeFileSync(
    sourcePath,
    `composition "DaemonScene" {\n  object "agent" { geometry: "cube" }\n}\n`,
    'utf-8'
  );

  // Prefer pre-built JS (CI path, fast startup). Fall back to tsx for local dev.
  const compiledRunnerPath = path.resolve(__dirname, '../../../dist/cli/holoscript-runner.js');
  const useCompiled = existsSync(compiledRunnerPath);

  const spawnArgs = useCompiled
    ? [compiledRunnerPath, 'run', sourcePath, '--daemon']
    : (() => {
        const tsxPkgDir = path.dirname(require.resolve('tsx/package.json'));
        const tsxCliPath = path.join(tsxPkgDir, 'dist', 'cli.mjs');
        return [
          tsxCliPath,
          path.resolve(__dirname, '../holoscript-runner.ts'),
          'run',
          sourcePath,
          '--daemon',
        ];
      })();

  const proc = spawn(process.execPath, spawnArgs, {
    cwd: path.resolve(__dirname, '../../../..'),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const lines: string[] = [];
  const json: Array<Record<string, unknown>> = [];
  const stderr: string[] = [];

  proc.stdout.setEncoding('utf-8');
  proc.stdout.on('data', (chunk: string) => {
    for (const rawLine of chunk.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      lines.push(line);
      if (line.startsWith('{') && line.endsWith('}')) {
        try {
          json.push(JSON.parse(line) as Record<string, unknown>);
        } catch {
          // Ignore non-JSON lines.
        }
      }
    }
  });

  proc.stderr.setEncoding('utf-8');
  proc.stderr.on('data', (chunk: string) => {
    stderr.push(chunk);
  });

  return { proc, lines, json, tempDir, stderr };
}

function sendCommand(proc: ChildProcessWithoutNullStreams, command: Record<string, unknown>): void {
  proc.stdin.write(`${JSON.stringify(command)}\n`);
}

afterEach(() => {
  // noop: explicit cleanup is done per test so we can await process exit.
});

describe('holoscript-runner daemon mode', () => {
  it('responds to stats/state commands and action protocol, then stops cleanly', async () => {
    const harness = startDaemon();
    const timeoutDetails = () => {
      const lastStdout = harness.lines.slice(-10).join('\n');
      const lastStderr = harness.stderr.slice(-10).join('');
      return `Last stdout lines:\n${lastStdout}\nLast stderr:\n${lastStderr}`;
    };

    try {
      // Allow up to 120s for daemon startup on slower CI runners.
      await waitFor(
        () => harness.json.some((msg) => msg.type === 'daemon:ready'),
        120000,
        25,
        timeoutDetails
      );

      sendCommand(harness.proc, { op: 'stats' });
      await waitFor(
        () => harness.json.some((msg) => msg.op === 'stats' && msg.type === 'daemon:ok'),
        45000,
        25,
        timeoutDetails
      );

      sendCommand(harness.proc, { op: 'state:set', key: 'mode', value: 'active' });
      await waitFor(
        () => harness.json.some((msg) => msg.op === 'state:set' && msg.type === 'daemon:ok'),
        45000,
        25,
        timeoutDetails
      );

      sendCommand(harness.proc, { op: 'state:get', key: 'mode' });
      await waitFor(
        () =>
          harness.json.some(
            (msg) =>
              msg.op === 'state:get' &&
              msg.type === 'daemon:ok' &&
              msg.key === 'mode' &&
              msg.value === 'active'
          ),
        45000,
        25,
        timeoutDetails
      );

      sendCommand(harness.proc, { op: 'action:register', name: 'diagnose' });
      await waitFor(
        () =>
          harness.json.some(
            (msg) =>
              msg.op === 'action:register' && msg.type === 'daemon:ok' && msg.name === 'diagnose'
          ),
        45000,
        25,
        timeoutDetails
      );

      sendCommand(harness.proc, {
        op: 'emit',
        event: 'action:diagnose',
        payload: {
          requestId: 'bt-request-1',
          params: { subsystem: 'core' },
          blackboard: { severity: 'high' },
        },
      });

      await waitFor(
        () =>
          harness.json.some(
            (msg) => msg.type === 'daemon:action_request' && msg.action === 'diagnose'
          ),
        45000,
        25,
        timeoutDetails
      );
      const actionRequest = harness.json.find(
        (msg) => msg.type === 'daemon:action_request' && msg.action === 'diagnose'
      );
      expect(actionRequest).toBeDefined();

      sendCommand(harness.proc, {
        op: 'action:resolve',
        actionRequestId: actionRequest?.actionRequestId,
        success: true,
      });

      await waitFor(
        () =>
          harness.json.some(
            (msg) =>
              msg.type === 'daemon:action_result' &&
              (msg.payload as Record<string, unknown>)?.requestId === 'bt-request-1' &&
              (msg.payload as Record<string, unknown>)?.status === 'success'
          ),
        45000,
        25,
        timeoutDetails
      );

      sendCommand(harness.proc, { op: 'stop' });
      await waitFor(
        () => harness.json.some((msg) => msg.type === 'daemon:stopped'),
        45000,
        25,
        timeoutDetails
      );

      const ready = harness.json.find((msg) => msg.type === 'daemon:ready');
      expect(ready).toBeDefined();

      const statsReply = harness.json.find((msg) => msg.op === 'stats' && msg.type === 'daemon:ok');
      expect(statsReply).toBeDefined();

      const stopped = harness.json.find((msg) => msg.type === 'daemon:stopped');
      expect(stopped).toBeDefined();
      expect(stopped?.reason).toBe('command');
    } finally {
      if (!harness.json.some((msg) => msg.type === 'daemon:ready') && harness.stderr.length > 0) {
        console.error(harness.stderr.join(''));
      }
      try {
        harness.proc.kill();
      } catch {
        // best effort
      }
      rmSync(harness.tempDir, { recursive: true, force: true });
    }
  }, 180_000); // 180s: protects against slow cold-start tsx compilation on CI
});
