import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

async function runCli(args: string[]) {
  return execFileAsync(process.execPath, [tsxCli, cliSource, ...args], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
    timeout: 90_000,
  });
}

describe('CLI compile output writing', () => {
  it('creates parent directories for single-file target output', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-cli-compile-output-'));

    try {
      const sourcePath = path.join(tempDir, 'scene.holo');
      const outputPath = path.join(tempDir, 'nested', 'captures', 'scene-r3f.json');
      writeFileSync(
        sourcePath,
        `composition "Compile Output Parent Smoke" {
          object "Cube" {
            geometry: "cube"
            position: [0, 1, 0]
          }
        }`
      );

      const result = await runCli(['compile', sourcePath, '--target', 'r3f', '-o', outputPath]);

      expect(result.stdout).toContain('R3F compilation successful');
      expect(existsSync(outputPath)).toBe(true);
      const scene = JSON.parse(readFileSync(outputPath, 'utf8')) as {
        children?: Array<{ id?: string; type?: string }>;
      };
      expect(scene.children?.some((child) => child.type === 'mesh')).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
