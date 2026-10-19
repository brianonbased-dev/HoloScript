/**
 * holoscript validate: an unknown trait is HS1006, a warning from core's one known-trait set
 * (isKnownTrait), on .holo and .hsplus alike. It never changes the verdict or the exit code.
 */
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { validateForCli } from '../consent-rules';

const repoRoot = path.resolve(__dirname, '../../../..');
const packageRoot = path.resolve(__dirname, '../..');
const cliSource = path.join(packageRoot, 'src/cli.ts');
const tsxCli = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');
const run = promisify(execFile);

const UNKNOWN = 'composition "T" {\n  object "A" {\n    @nope_xyz\n    @grabbable\n  }\n}\n';
const CLEAN = 'composition "T" {\n  object "A" {\n    @grabbable\n  }\n}\n';
const BROKEN = 'composition "T" {\n  object "A" {\n    @nope_xyz\n';

const write = (name: string, text: string) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'hs1006-'));
  const file = path.join(dir, name);
  writeFileSync(file, text);
  return file;
};
const cli = async (file: string) => {
  try {
    const { stdout } = await run(process.execPath, [tsxCli, cliSource, 'validate', file], {
      cwd: packageRoot,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { code: 0, out: stdout };
  } catch (e) {
    const err = e as { code: number; stdout: string; stderr: string };
    return { code: err.code, out: `${err.stdout}${err.stderr}` };
  }
};

describe('holoscript validate: HS1006 unknown trait', { timeout: 180_000 }, () => {
  it.each(['t.holo', 't.hsplus'])('%s: HS1006 is a warning and the file stays valid', (name) => {
    const r = validateForCli(UNKNOWN, name);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.warnings.filter((w) => w.code === 'HS1006')).toEqual([
      expect.objectContaining({ severity: 'warning', line: 3, column: 5 }),
    ]);
    expect(r.warnings.some((w) => /Unknown directive/.test(w.message))).toBe(false);
  });

  it('exit codes do not change: unknown trait 0, clean 0, broken 1 with or without it', async () => {
    const unknown = await cli(write('u.holo', UNKNOWN));
    expect(unknown.code).toBe(0);
    expect(unknown.out).toContain('Unknown trait "@nope_xyz"');
    expect((await cli(write('c.holo', CLEAN))).code).toBe(0);
    expect((await cli(write('b.holo', BROKEN))).code).toBe(1);
  });
});
