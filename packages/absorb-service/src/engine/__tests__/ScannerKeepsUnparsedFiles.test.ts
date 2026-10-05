/**
 * A file whose grammar is missing or whose parse throws stays in the scan
 * (no symbols) with the reason recorded (2026-10-05). Dropping it left graph
 * coverage permanently incomplete: on a host without the Kotlin grammar, 53
 * .kt/.kts files were missing from every HoloScript scan, so the map was never
 * "current" and every query re-triggered a refresh.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AdapterManager } from '../AdapterManager';
import { CodebaseScanner } from '../CodebaseScanner';

describe('CodebaseScanner keeps files it cannot parse', () => {
  it('keeps a no-grammar file and a parse-throw file, without symbols, and records why', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-keeps-unparsed-'));
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'ok.ts'), 'export function fine(): number { return 1; }\n');
    fs.writeFileSync(path.join(dir, 'src', 'nogrammar.py'), 'def missing():\n    return 2\n');
    fs.writeFileSync(path.join(dir, 'src', 'throws.ts'), 'export const boom = 3;\n');

    const manager = new AdapterManager();
    const realParse = manager.parse.bind(manager);
    vi.spyOn(manager, 'parse').mockImplementation(async (source, language) => {
      if (language === 'python') return null; // grammar unavailable on this host
      if (source.includes('boom')) throw new Error('parser crashed');
      return realParse(source, language);
    });

    const result = await new CodebaseScanner(manager, false).scan({ rootDir: dir });
    const byPath = new Map(result.files.map((file) => [file.path, file]));

    expect([...byPath.keys()].sort()).toEqual(['src/nogrammar.py', 'src/ok.ts', 'src/throws.ts']);
    expect(byPath.get('src/ok.ts')!.symbols.map((s) => s.name)).toContain('fine');
    expect(byPath.get('src/nogrammar.py')!.symbols).toEqual([]);
    expect(byPath.get('src/throws.ts')!.symbols).toEqual([]);
    const reasons = result.stats.errors.map((e) => e.error);
    expect(reasons.some((r) => /No parser for python .*kept without symbols/.test(r))).toBe(true);
    expect(reasons.some((r) => /parser crashed; file kept without symbols/.test(r))).toBe(true);
  });
});
