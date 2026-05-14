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
      '--seed',
      '4242',
      '--json',
    ]);

    expect(options.command).toBe('world-model');
    expect(options.subcommand).toBe('replay');
    expect(options.sceneId).toBe('deterministic-contact-v1');
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
    expect(payload.scene.id).toBe('deterministic-contact-v1');
    expect(payload.scene.seed).toBe(4242);
    expect(payload.result.eventLogHash).toBe(payload.trajectory.caelReceiptHash);
    expect(payload.result.events.length).toBeGreaterThan(0);
    expect(payload.result.contactCount).toBe(2);
    expect(payload.result.predicateViolationCount).toBe(1);
    expect(payload.trajectory.status).toBe('unresolved');
    expect(payload.score.priority.priority).toBeGreaterThan(0);
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
});
