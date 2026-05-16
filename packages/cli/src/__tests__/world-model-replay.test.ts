/**
 * Tests for the world-model replay CLI surface.
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

describe('world-model replay CLI', { timeout: 120000 }, () => {
  it('parses world-model replay scene and seed flags', () => {
    const options = parseArgs([
      'world-model',
      'replay',
      '--scene',
      'deterministic-contact-v1',
      '--trajectory',
      'fnv1a-test',
      '--seed',
      '4242',
      '--json',
    ]);

    expect(options.command).toBe('world-model');
    expect(options.subcommand).toBe('replay');
    expect(options.sceneId).toBe('deterministic-contact-v1');
    expect(options.trajectoryId).toBe('fnv1a-test');
    expect(options.seed).toBe('4242');
    expect(options.json).toBe(true);
  });

  it('emits replayable JSON evidence for deterministic-contact-v1', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        tsxCli,
        cliSource,
        'world-model',
        'replay',
        '--scene',
        'deterministic-contact-v1',
        '--trajectory',
        'fnv1a-37e561ed',
        '--seed',
        '4242',
        '--json',
      ],
      {
        cwd: packageRoot,
        maxBuffer: 1024 * 1024,
      }
    );

    const payload = JSON.parse(stdout);
    expect(payload.schema_version).toBe('world-model-replay-v1');
    expect(payload.requestedTrajectoryId).toBe('fnv1a-37e561ed');
    expect(payload.scene.id).toBe('deterministic-contact-v1');
    expect(payload.scene.seed).toBe(4242);
    expect(payload.result.eventLogHash).toBe(payload.trajectory.caelReceiptHash);
    expect(payload.result.events.length).toBeGreaterThan(0);
    expect(payload.result.contactCount).toBe(2);
    expect(payload.result.predicateViolationCount).toBe(1);
    expect(payload.trajectory.status).toBe('unresolved');
    expect(payload.trajectory.id).toBe('fnv1a-37e561ed');
    expect(payload.score.priority.priority).toBeGreaterThan(0);
  });

  it('emits replayable JSON evidence for humanoid-rock-throw-v1', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        tsxCli,
        cliSource,
        'world-model',
        'replay',
        '--scene',
        'humanoid-rock-throw-v1',
        '--seed',
        '4242',
        '--json',
      ],
      {
        cwd: packageRoot,
        maxBuffer: 1024 * 1024,
      }
    );

    const payload = JSON.parse(stdout);
    const eventTypes = payload.result.events.map((event: { type: string }) => event.type);
    expect(payload.schema_version).toBe('world-model-replay-v1');
    expect(payload.scene.id).toBe('humanoid-rock-throw-v1');
    expect(payload.scene.seed).toBe(4242);
    expect(payload.result.eventLogHash).toBe(payload.trajectory.caelReceiptHash);
    expect(eventTypes).toContain('grab_constraint_attached');
    expect(eventTypes).toContain('release');
    expect(eventTypes).toContain('target_contact');
    expect(payload.result.contactCount).toBe(1);
    expect(payload.result.predicateViolationCount).toBe(0);
    expect(payload.trajectory.status).toBe('open');
  });

  it('emits replayable JSON evidence for two-agent-handoff-catch-v1', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        tsxCli,
        cliSource,
        'world-model',
        'replay',
        '--scene',
        'two-agent-handoff-catch-v1',
        '--seed',
        '5151',
        '--json',
      ],
      {
        cwd: packageRoot,
        maxBuffer: 1024 * 1024,
      }
    );

    const payload = JSON.parse(stdout);
    const eventTypes = payload.result.events.map((event: { type: string }) => event.type);
    expect(payload.schema_version).toBe('world-model-replay-v1');
    expect(payload.scene.id).toBe('two-agent-handoff-catch-v1');
    expect(payload.scene.seed).toBe(5151);
    expect(payload.result.eventLogHash).toBe(payload.trajectory.caelReceiptHash);
    expect(eventTypes).toContain('release_constraint_detached');
    expect(eventTypes).toContain('catch_constraint_attached');
    expect(eventTypes).toContain('ownership_transferred');
    expect(eventTypes).toContain('receipt_emitted');
    expect(payload.result.contactCount).toBe(1);
    expect(payload.result.predicateViolationCount).toBe(0);
    expect(payload.trajectory.status).toBe('open');
  });

  it('prints a concise text replay receipt', async () => {
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
      {
        cwd: packageRoot,
        maxBuffer: 1024 * 1024,
      }
    );

    expect(stdout).toContain('World-model replay: deterministic-contact-v1');
    expect(stdout).toContain('Seed: 4242');
    expect(stdout).toContain('Events: 6');
    expect(stdout).toContain('Contacts: 2');
    expect(stdout).toContain('Predicate violations: 1');
    expect(stdout).toContain('status=unresolved');
    expect(stdout).toContain('Replay command: holoscript world-model replay --scene deterministic-contact-v1');
  });

  it('rejects unknown world-model scenes', async () => {
    await expect(
      execFileAsync(
        process.execPath,
        [tsxCli, cliSource, 'world-model', 'replay', '--scene', 'unknown-scene', '--json'],
        {
          cwd: packageRoot,
          maxBuffer: 1024 * 1024,
        }
      )
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('[E003] Unsupported world-model scene: unknown-scene'),
    });
  });

  it('rejects trajectory handles that do not match the deterministic replay', async () => {
    await expect(
      execFileAsync(
        process.execPath,
        [
          tsxCli,
          cliSource,
          'world-model',
          'replay',
          '--scene',
          'deterministic-contact-v1',
          '--trajectory',
          'fnv1a-wrong',
          '--seed',
          '4242',
          '--json',
        ],
        {
          cwd: packageRoot,
          maxBuffer: 1024 * 1024,
        }
      )
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        'Trajectory handle mismatch: requested fnv1a-wrong, replay produced fnv1a-37e561ed'
      ),
    });
  });
});
