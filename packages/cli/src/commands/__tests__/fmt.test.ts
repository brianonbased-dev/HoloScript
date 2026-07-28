import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CLIOptions } from '../../args';
import { collectHoloScriptFormatFiles, fmtCommand } from '../fmt';

function fmtOptions(overrides: Partial<CLIOptions> = {}): CLIOptions {
  return {
    command: 'fmt',
    verbose: false,
    json: false,
    maxDepth: 10,
    timeout: 5000,
    showAST: false,
    packages: [],
    dev: false,
    watch: false,
    split: false,
    ...overrides,
  };
}

describe('fmt command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'holoscript-fmt-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('collects .hs, .holo, and .hsplus files while skipping generated folders', () => {
    mkdirSync(join(tempDir, 'src'));
    mkdirSync(join(tempDir, 'node_modules'));
    writeFileSync(join(tempDir, 'src', 'world.hs'), 'object World {}');
    writeFileSync(join(tempDir, 'src', 'scene.holo'), 'composition "Scene" {}');
    writeFileSync(join(tempDir, 'src', 'brain.hsplus'), 'logic Brain {}');
    writeFileSync(join(tempDir, 'node_modules', 'ignored.hs'), 'object Ignored {}');
    writeFileSync(join(tempDir, 'README.md'), '# docs');

    const { files, missing } = collectHoloScriptFormatFiles([tempDir]);

    expect(missing).toEqual([]);
    expect(files.map((file) => file.replaceAll('\\', '/'))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/src/brain.hsplus'),
        expect.stringContaining('/src/scene.holo'),
        expect.stringContaining('/src/world.hs'),
      ])
    );
    expect(files.some((file) => file.includes('node_modules'))).toBe(false);
  });

  it('checks and writes canonical .hs whitespace', async () => {
    const sourcePath = join(tempDir, 'world.hs');
    writeFileSync(sourcePath, 'object World {\r\nvalue: 1   \r\n}');

    const beforeWrite = await fmtCommand(
      fmtOptions({ args: [sourcePath], check: true, quiet: true })
    );
    expect(beforeWrite).toBe(1);

    const writeResult = await fmtCommand(
      fmtOptions({ args: [sourcePath], write: true, quiet: true })
    );
    expect(writeResult).toBe(0);

    const formatted = readFileSync(sourcePath, 'utf-8');
    expect(formatted).toBe('object World {\n  value: 1\n}\n');

    const afterWrite = await fmtCommand(
      fmtOptions({ args: [sourcePath], check: true, quiet: true })
    );
    expect(afterWrite).toBe(0);
  });

  it('returns nonzero when no HoloScript files are found', async () => {
    const readme = join(tempDir, 'README.md');
    writeFileSync(readme, '# no source here');

    const result = await fmtCommand(fmtOptions({ args: [tempDir], quiet: true }));

    expect(existsSync(readme)).toBe(true);
    expect(result).toBe(1);
  });
});
