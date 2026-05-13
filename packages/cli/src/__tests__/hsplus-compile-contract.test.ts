import { execFile } from 'node:child_process';
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
    cwd: packageRoot,
    maxBuffer: 1024 * 1024,
  });
}

describe('.hsplus parse/compile grammar contract', () => {
  it('parses and compiles smart-gallery.hsplus with the same parser contract', async () => {
    const source = path.join(repoRoot, 'examples/three-format-showcase/smart-gallery.hsplus');

    const parseResult = await runCli(['parse', source, '--json']);
    expect(parseResult.stdout).toContain('Validation passed');
    expect(parseResult.stderr).not.toContain('Error parsing');

    const compileResult = await runCli(['compile', source, '--target', 'threejs']);
    expect(compileResult.stdout).toContain('Compilation successful');
    expect(compileResult.stdout).toContain('function selectArtwork');
    expect(compileResult.stderr).not.toContain('Expected identifier');
  }, 120_000);
});
