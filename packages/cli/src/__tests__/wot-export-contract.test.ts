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

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'holoscript-cli-wot-'));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function runCli(args: string[]) {
  return execFileAsync(process.execPath, [tsxCli, cliSource, ...args], {
    cwd: packageRoot,
    maxBuffer: 1024 * 1024,
  });
}

describe('wot-export public API contract', () => {
  it('exits cleanly when a composition has no @wot_thing objects', async () => {
    await withTempDir(async (dir) => {
      const file = path.join(dir, 'no-wot.holo');
      await fs.writeFile(
        file,
        `composition "NoWoT" {
  object "Cube" {
    geometry: "cube"
  }
}
`
      );

      const result = await runCli(['wot-export', file, '--json']);

      expect(result.stdout).toContain('No objects with @wot_thing trait found.');
      expect(result.stderr).not.toContain('@holoscript/core/wot');
    });
  }, 120_000);

  it('generates a Thing Description through the platform-owned WoT API', async () => {
    await withTempDir(async (dir) => {
      const file = path.join(dir, 'lamp.holo');
      await fs.writeFile(
        file,
        `composition "WoTExport" {
  object "Lamp" {
    @wot_thing {
      title: "Lamp"
      security: "nosec"
    }
    geometry: "sphere"
  }
}
`
      );

      const result = await runCli(['wot-export', file, '--json']);

      expect(result.stdout).toContain('"@context": "https://www.w3.org/2022/wot/td/v1.1"');
      expect(result.stdout).toContain('"title": "Lamp"');
      expect(result.stderr).not.toContain('@holoscript/core/wot');
    });
  }, 120_000);
});
