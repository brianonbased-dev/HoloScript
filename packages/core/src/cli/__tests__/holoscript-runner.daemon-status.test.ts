import { describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readJson } from '../../errors/safeJsonParse';

function resolveRunnerCommand(): { args: string[] } {
  // Always use tsx to run from source — the compiled dist bundle has ESM/CJS
  // compat issues (dotenv uses require('fs') which fails in ESM bundles).
  const tsxPkgDir = path.dirname(require.resolve('tsx/package.json'));
  const tsxCliPath = path.join(tsxPkgDir, 'dist', 'cli.mjs');
  return {
    args: [
      tsxCliPath,
      path.resolve(__dirname, '../holoscript-runner.ts'),
      'daemon',
      'status',
      '--json',
    ],
  };
}

function runStatusJson(cwd: string): Record<string, unknown> {
  const { args } = resolveRunnerCommand();
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf-8',
  });

  expect(result.status).toBe(0);

  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  expect(lines.length).toBeGreaterThan(0);
  return readJson(lines[lines.length - 1]) as Record<string, unknown>;
}

describe('holoscript daemon status --json', () => {
  it('returns missing_state_dir payload when no .holoscript state exists', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'holo-daemon-status-missing-'));
    try {
      mkdirSync(path.join(tempDir, '.git'));
      const payload = runStatusJson(tempDir);

      expect(payload.status).toBe('missing_state_dir');
      expect(payload.running).toBe(false);
      expect(typeof payload.stateDir).toBe('string');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('reports telemetry counters and last entry from daemon-telemetry.jsonl', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'holo-daemon-status-telemetry-'));
    try {
      mkdirSync(path.join(tempDir, '.git'));
      const stateDir = path.join(tempDir, '.holoscript');
      mkdirSync(stateDir, { recursive: true });

      writeFileSync(
        path.join(stateDir, 'daemon-state.json'),
        JSON.stringify(
          {
            totalCycles: 2,
            bestQuality: 0.7,
            lastQuality: 0.6,
            totalCostUSD: 0.0123,
            totalInputTokens: 1234,
            totalOutputTokens: 456,
            typeErrorBaseline: 10,
            lastFocus: 'typefix',
            lastCycleTimeISO: '2026-03-20T10:00:00.000Z',
          },
          null,
          2
        ),
        'utf-8'
      );

      writeFileSync(
        path.join(stateDir, 'daemon-file-state.json'),
        JSON.stringify({ committed: ['a.ts'], failures: { 'b.ts': 3 } }, null, 2),
        'utf-8'
      );

      writeFileSync(
        path.join(stateDir, 'accumulated-wisdom.json'),
        JSON.stringify([{ focus: 'typefix' }]),
        'utf-8'
      );

      writeFileSync(
        path.join(stateDir, 'daemon-telemetry.jsonl'),
        [
          JSON.stringify({ cycleNumber: 1, focus: 'lint', qualityAfter: 0.5 }),
          JSON.stringify({ cycleNumber: 2, focus: 'typefix', qualityAfter: 0.6 }),
        ].join('\n') + '\n',
        'utf-8'
      );

      const payload = runStatusJson(tempDir);

      expect(payload.status).toBe('ok');
      expect((payload.session as Record<string, unknown>).totalCycles).toBe(2);
      expect((payload.files as Record<string, unknown>).committed).toBe(1);
      expect((payload.files as Record<string, unknown>).quarantined).toBe(1);

      const telemetry = payload.telemetry as Record<string, unknown>;
      expect(telemetry.count).toBe(2);
      expect((telemetry.last as Record<string, unknown>).cycleNumber).toBe(2);
      expect((telemetry.last as Record<string, unknown>).focus).toBe('typefix');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
