import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatGenerated,
  GeneratedOutputUnformattableError,
} from '../../../scripts/lib/format-generated';

// The generators' shared formatting step, and the fault the independent review of
// #309 fed it in the reading: prettier throws on a generated file. Before this
// helper, two of the three generators swallowed that and wrote the raw bytes; the
// drift check in those same files then read the raw bytes as formatted.
const SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../scripts');
const GENERATORS = ['compile-view-registry.ts', 'compile-holo-pages.ts', 'compile-vector-pages.mts'];

describe('formatGenerated: a generator formats what it writes, or refuses loudly', () => {
  it('returns prettier\'s output for the target path', async () => {
    const calls: Array<{ code: string; filepath: unknown }> = [];
    const pretty = await formatGenerated('/gen/a.generated.ts', 'const  x=1', {
      resolveConfig: async () => ({ semi: false }),
      format: async (code, options) => {
        calls.push({ code, filepath: options?.filepath });
        return 'const x = 1\n';
      },
    });
    expect(pretty).toBe('const x = 1\n');
    expect(calls).toEqual([{ code: 'const  x=1', filepath: '/gen/a.generated.ts' }]);
  });

  it('refuses when prettier throws, naming the file and prettier\'s reason, instead of handing back the raw bytes', async () => {
    const boom = new SyntaxError('Unexpected token (3:14)');
    const attempt = formatGenerated('/gen/broken.generated.ts', 'const = ;', {
      resolveConfig: async () => ({}),
      format: async () => { throw boom; },
    });
    await expect(attempt).rejects.toBeInstanceOf(GeneratedOutputUnformattableError);
    await expect(attempt).rejects.toThrow(/generated output for \/gen\/broken\.generated\.ts could not be formatted: Unexpected token \(3:14\)/u);
    await expect(attempt).rejects.toMatchObject({ target: '/gen/broken.generated.ts', cause: boom });
  });

  it('is the only formatting path in all three generators: no generator calls prettier itself any more', () => {
    for (const name of GENERATORS) {
      const source = readFileSync(resolve(SCRIPTS, name), 'utf8');
      expect(source, name).toContain("from './lib/format-generated'");
      expect(source, name).not.toMatch(/from 'prettier'/u);
      expect(source, name).not.toMatch(/\bformat\(/u);
      expect(source, name).not.toMatch(/catch\s*\{\s*(\/\/[^\n]*\n\s*)*pretty = /u);
    }
  });
});
