import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
const smartFarm = path.join(repoRoot, 'examples/iot/holotwin-smart-farm.holo');

async function runCli(args: string[], timeout = 60_000) {
  return execFileAsync(process.execPath, [tsxCli, cliSource, ...args], {
    cwd: packageRoot,
    maxBuffer: 1024 * 1024,
    timeout,
  });
}

describe('CLI public API drift contracts', () => {
  it('loads the renderer, headless runtime, and WoT public subpaths', async () => {
    const script = `
      Promise.all([
        import('@holoscript/engine'),
        import('@holoscript/engine/runtime'),
        import('@holoscript/core/wot')
      ]).then(([engine, runtime, wot]) => {
        console.log([
          typeof engine.PuppeteerRenderer,
          typeof runtime.createHeadlessRuntime,
          typeof runtime.getProfile,
          typeof wot.ThingDescriptionGenerator,
          typeof wot.serializeThingDescription,
          typeof wot.validateThingDescription
        ].join(' '));
      }).catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      });
    `;

    const result = await execFileAsync(process.execPath, ['-e', script], {
      cwd: packageRoot,
      maxBuffer: 1024 * 1024,
      timeout: 90_000,
    });

    expect(result.stdout.trim()).toBe('function function function function function function');
  }, 90_000);

  it('runs smart farm headless without runtime import drift', async () => {
    const result = await runCli([
      'headless',
      smartFarm,
      '--profile',
      'headless',
      '--duration',
      '50',
      '--tick-rate',
      '10',
    ]);

    expect(result.stdout).toContain('Starting headless runtime');
    expect(result.stdout).toContain('Runtime Statistics');
    expect(result.stderr).not.toContain('createHeadlessRuntime is not a function');
  }, 90_000);

  it('captures smart farm screenshot as a non-empty image', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-smart-farm-'));
    const output = path.join(tempDir, 'smart-farm.png');

    try {
      const result = await runCli([
        'screenshot',
        smartFarm,
        '-o',
        output,
        '--width',
        '640',
        '--height',
        '360',
        '--wait-for',
        '100',
      ]);

      expect(result.stdout).toContain('Screenshot saved');
      expect(statSync(output).size).toBeGreaterThan(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }, 90_000);

  it('runs smart farm WoT export as a clean no-WoT result', async () => {
    const result = await runCli(['wot-export', smartFarm, '--json']);

    expect(result.stdout).toContain('No objects with @wot_thing trait found');
    expect(result.stderr).not.toContain("Package subpath './wot'");
  }, 90_000);
});
