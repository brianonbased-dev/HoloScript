import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, '../..');
const repoRoot = path.resolve(packageRoot, '../..');
const cliSource = path.join(packageRoot, 'src/cli.ts');
const tsxCli = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');
const labRoot = path.join(repoRoot, 'experiments/format-realism-gauntlet');

async function runCli(args: string[], env: NodeJS.ProcessEnv = {}) {
  return execFileAsync(process.execPath, [tsxCli, cliSource, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...env,
    },
    maxBuffer: 1024 * 1024,
    timeout: 120_000,
  });
}

describe('HoloLand/HoloShell reality lab contract', () => {
  it('parses the spatial and behavior surfaces, runs failure seeding, and exports WoT devices', async () => {
    const holo = path.join(labRoot, 'hololand-holoshell-reality-lab.holo');
    const hsplus = path.join(labRoot, 'hololand-holoshell-reality-lab.hsplus');
    const pipeline = path.join(labRoot, 'hololand-holoshell-reality-lab.hs');
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'holoscript-reality-lab-'));

    try {
      const holoParse = await runCli(['parse', holo, '--json']);
      expect(holoParse.stdout).toContain('Validation successful');

      const hsplusParse = await runCli(['parse', hsplus, '--json']);
      expect(hsplusParse.stdout).toContain('Validation successful');

      const pipelineParse = await runCli(['parse', pipeline, '--json']);
      expect(pipelineParse.stdout).toContain('Validation successful');

      const run = await runCli(['run', pipeline, '--json'], {
        FORMAT_REALITY_LAB_OUT: outDir,
        HOLOMESH_BOARD_SEED_URL: '',
      });
      const payload = JSON.parse(run.stdout) as {
        success: boolean;
        result: {
          count: number;
          data: Array<{ evidenceId: string; splashZone: string; reproCommand: string }>;
        };
      };

      expect(payload.success).toBe(true);
      expect(payload.result.count).toBe(2);
      expect(payload.result.data.map((entry) => entry.evidenceId)).toEqual([
        'compile-hsplus-threejs',
        'screenshot-base',
      ]);
      expect(payload.result.data.map((entry) => entry.splashZone)).toEqual([
        'grammar-splash',
        'visual-splash',
      ]);
      expect(payload.result.data.every((entry) => entry.reproCommand.length > 0)).toBe(true);
      expect(run.stderr).toContain('skipping empty webhook/rest sink endpoint');

      const digest = await fs.readFile(path.join(outDir, 'pipeline-output.json'), 'utf8');
      expect(digest).toContain('hsplus-compile-contract');
      expect(digest).toContain('dynamic-replay-missing');

      const wotExport = await runCli(['wot-export', holo, '--json']);
      expect(wotExport.stdout).toContain('HoloShell Command Console');
      expect(wotExport.stdout).toContain('HoloMesh Task Seed Emitter');
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
    }
  }, 180_000);
});
