import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { readJson } from '../../errors/safeJsonParse';

function runFromSource(cwd: string, args: string[]) {
  const tsxPkgDir = path.dirname(require.resolve('tsx/package.json'));
  const tsxCliPath = path.join(tsxPkgDir, 'dist', 'cli.mjs');
  return spawnSync(
    process.execPath,
    [tsxCliPath, path.resolve(__dirname, '../holoscript-runner.ts'), ...args],
    {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    }
  );
}

function lastJsonLine(stdout: string): Record<string, unknown> {
  const line = stdout
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .at(-1);
  expect(line).toBeDefined();
  return readJson(line ?? '{}') as Record<string, unknown>;
}

describe('holoscript run receipts', () => {
  it('writes a path-redacted JSON receipt with actual runtime and scene counters', () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'holoscript-run-receipt-'));
    try {
      writeFileSync(
        path.join(cwd, 'system.holo'),
        'composition "System" {\n  object "capability" { status: "ready" }\n}\n',
        'utf-8'
      );

      const result = runFromSource(cwd, [
        'run',
        'system.holo',
        '--ticks',
        '3',
        '--json',
        '--output',
        'runtime/receipts/system-run.json',
      ]);

      expect(
        result.status,
        `run exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      ).toBe(0);
      const receipt = lastJsonLine(result.stdout);
      const source = receipt.source as Record<string, unknown>;
      const execution = receipt.execution as Record<string, unknown>;
      const counters = execution.counters as Record<string, unknown>;
      const scene = execution.scene as Record<string, unknown>;

      expect(receipt.schema).toBe('holoscript.cli.run-receipt.v1');
      expect(receipt.ok).toBe(true);
      expect(source.file).toBe('system.holo');
      expect(source.extension).toBe('.holo');
      expect(source.parsePassed).toBe(true);
      expect(source.digest).toMatch(/^sha256:[a-f0-9]{64}$/u);
      expect(execution.requestedTicks).toBe(3);
      expect(counters.tickCount).toBe(3);
      expect(scene.objectCount).toBe(1);
      expect(receipt.receiptHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
      expect(result.stdout).not.toContain(cwd);

      const written = readJson(
        readFileSync(path.join(cwd, 'runtime/receipts/system-run.json'), 'utf-8')
      );
      expect(written).toEqual(receipt);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('fails closed with a JSON receipt when the source is not valid HoloScript', () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'holoscript-run-invalid-'));
    try {
      writeFileSync(path.join(cwd, 'disguised.hs'), 'export const status = "foreign";\n', 'utf-8');

      const result = runFromSource(cwd, ['run', 'disguised.hs', '--json']);
      expect(result.status).toBe(2);
      const receipt = lastJsonLine(result.stdout);
      const source = receipt.source as Record<string, unknown>;

      expect(receipt.schema).toBe('holoscript.cli.run-receipt.v1');
      expect(receipt.ok).toBe(false);
      expect(source.file).toBe('disguised.hs');
      expect(source.parsePassed).toBe(false);
      expect(Array.isArray(source.errors)).toBe(true);
      expect(result.stdout).not.toContain(cwd);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('rejects HoloScript content stored under a foreign source extension', () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'holoscript-run-extension-'));
    try {
      writeFileSync(
        path.join(cwd, 'system.mjs'),
        'composition "System" {\n  object "capability" { status: "ready" }\n}\n',
        'utf-8'
      );

      const result = runFromSource(cwd, ['run', 'system.mjs', '--json']);
      expect(result.status).toBe(2);
      const receipt = lastJsonLine(result.stdout);
      const source = receipt.source as Record<string, unknown>;
      const errors = source.errors as Array<Record<string, unknown>>;

      expect(receipt.ok).toBe(false);
      expect(source.extension).toBe('.mjs');
      expect(source.parsePassed).toBe(false);
      expect(errors[0]?.code).toBe('CLI001');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
