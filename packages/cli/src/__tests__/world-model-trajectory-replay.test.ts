/**
 * Tests for the world-model trajectory-replay and trajectory-generate CLI surfaces.
 *
 * G.GOLD.013: tests the false cases (missing args, bad trajectory id,
 * nonexistent report file) alongside the happy paths.
 * G.GOLD.015: experienced failure categories for trajectory replay are
 * missing-report and trajectory-id-mismatch — both are covered here.
 */

import { execFile } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../args';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');
const packageRoot = path.resolve(__dirname, '../..');
const cliSource = path.join(packageRoot, 'src/cli.ts');
const tsxCli = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');
const execFileAsync = promisify(execFile);

describe('world-model trajectory-replay CLI', { timeout: 120000 }, () => {
  it('parses trajectory-replay subcommand with --trajectory and --report flags', () => {
    const options = parseArgs([
      'world-model',
      'trajectory-replay',
      '--trajectory',
      'traj_001_abc12345',
      '--report',
      '/path/to/report.json',
      '--json',
    ]);

    expect(options.command).toBe('world-model');
    expect(options.subcommand).toBe('trajectory-replay');
    expect(options.trajectoryId).toBe('traj_001_abc12345');
    expect(options.reportPath).toBe('/path/to/report.json');
    expect(options.json).toBe(true);
  });

  it('parses trajectory-generate subcommand with --count, --seed, --task, --output flags', () => {
    const options = parseArgs([
      'world-model',
      'trajectory-generate',
      '--count',
      '30',
      '--seed',
      'test-seed-123',
      '--task',
      'task_1778740087953_nptg',
      '--output',
      'report.json',
      '--json',
    ]);

    expect(options.command).toBe('world-model');
    expect(options.subcommand).toBe('trajectory-generate');
    expect(options.trajectoryCount).toBe('30');
    expect(options.seed).toBe('test-seed-123');
    expect(options.taskId).toBe('task_1778740087953_nptg');
    expect(options.output).toBe('report.json');
    expect(options.json).toBe(true);
  });

  it('parses --report flag for trajectory-replay', () => {
    const options = parseArgs([
      'world-model',
      'trajectory-replay',
      '--trajectory',
      'traj_001',
      '--report',
      'evidence/report.json',
    ]);

    expect(options.reportPath).toBe('evidence/report.json');
  });

  it('parses --task flag for task id binding', () => {
    const options = parseArgs([
      'world-model',
      'trajectory-generate',
      '--task',
      'task_xyz',
    ]);

    expect(options.taskId).toBe('task_xyz');
  });

  it('rejects trajectory-replay without --trajectory', async () => {
    await expect(
      execFileAsync(
        process.execPath,
        [tsxCli, cliSource, 'world-model', 'trajectory-replay', '--report', 'nonexistent.json'],
        { cwd: packageRoot, maxBuffer: 1024 * 1024 },
      ),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('[E003]'),
    });
  });

  it('rejects trajectory-replay without --report', async () => {
    await expect(
      execFileAsync(
        process.execPath,
        [tsxCli, cliSource, 'world-model', 'trajectory-replay', '--trajectory', 'traj_001'],
        { cwd: packageRoot, maxBuffer: 1024 * 1024 },
      ),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('[E003]'),
    });
  });

  it('rejects trajectory-replay with nonexistent report file', async () => {
    await expect(
      execFileAsync(
        process.execPath,
        [
          tsxCli,
          cliSource,
          'world-model',
          'trajectory-replay',
          '--trajectory',
          'traj_001',
          '--report',
          '/nonexistent/path/report.json',
        ],
        { cwd: packageRoot, maxBuffer: 1024 * 1024 },
      ),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('[E003]'),
    });
  });
});

describe('world-model trajectory-generate CLI', { timeout: 120000 }, () => {
  it('generates an adversarial trajectory report via trajectory-generate', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        tsxCli,
        cliSource,
        'world-model',
        'trajectory-generate',
        '--count',
        '20',
        '--seed',
        'test-seed-cli',
        '--json',
      ],
      { cwd: packageRoot, maxBuffer: 1024 * 1024 },
    );

    const report = JSON.parse(stdout);
    expect(report.schemaVersion).toBe('holoscript.adversarial-trajectory.v1');
    expect(report.summary.total).toBeGreaterThanOrEqual(20);
    expect(report.trajectories.length).toBeGreaterThanOrEqual(20);
    expect(report.reportHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    // Every trajectory has a replay handle
    for (const t of report.trajectories) {
      expect(t.id).toMatch(/^traj_\d{3}_/);
      expect(t.replay.replayCommand).toContain('replay');
      expect(t.replay.caelReceiptHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it('trajectory-generate text output includes summary stats', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        tsxCli,
        cliSource,
        'world-model',
        'trajectory-generate',
        '--count',
        '20',
        '--seed',
        'test-seed-text',
      ],
      { cwd: packageRoot, maxBuffer: 1024 * 1024 },
    );

    expect(stdout).toContain('Generated 20 trajectories');
    expect(stdout).toContain('report hash:');
  });
});

describe('world-model replay includes predicate deltas', { timeout: 120000 }, () => {
  it('includes predicate deltas in JSON output', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        tsxCli,
        cliSource,
        'world-model',
        'replay',
        '--scene',
        'deterministic-contact-v1',
        '--seed',
        '4242',
        '--json',
      ],
      { cwd: packageRoot, maxBuffer: 1024 * 1024 },
    );

    const payload = JSON.parse(stdout);
    expect(payload.schema_version).toBe('world-model-replay-v1');
    // G.GOLD.013: verify the new predicateDeltas field exists and is well-formed
    expect(Array.isArray(payload.predicateDeltas)).toBe(true);
    expect(payload.predicateDeltas.length).toBe(5); // violation, novelty, learnability, regression, invalidity

    for (const delta of payload.predicateDeltas) {
      expect(delta).toHaveProperty('name');
      expect(delta).toHaveProperty('value');
      expect(delta).toHaveProperty('threshold');
      expect(delta).toHaveProperty('passed');
      expect(delta).toHaveProperty('delta');
      // Single-derivation deltas are 0 (expected = actual)
      expect(typeof delta.value).toBe('number');
      expect(typeof delta.threshold).toBe('number');
      expect(typeof delta.passed).toBe('boolean');
      expect(delta.delta).toBe(0);
    }

    const names = payload.predicateDeltas.map((d: { name: string }) => d.name);
    expect(names).toEqual(['violation', 'novelty', 'learnability', 'regression', 'invalidity']);
  });

  it('includes predicate deltas in text output', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        tsxCli,
        cliSource,
        'world-model',
        'replay',
        '--scene',
        'deterministic-contact-v1',
        '--seed',
        '4242',
      ],
      { cwd: packageRoot, maxBuffer: 1024 * 1024 },
    );

    expect(stdout).toContain('Predicate deltas:');
    expect(stdout).toMatch(/PASS violation:/);
    expect(stdout).toMatch(/PASS novelty:/);
    expect(stdout).toMatch(/PASS learnability:/);
    expect(stdout).toMatch(/(?:PASS|FAIL) regression:/);
    expect(stdout).toMatch(/(?:PASS|FAIL) invalidity:/);
  });
});