import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { generatePortableParser, runPortableBuild } from '../scripts/build-portable.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, '..');

describe('portable tree-sitter build', () => {
  it('keeps the workspace build on the portable entrypoint and strict native as explicit', () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

    expect(packageJson.scripts.build).toBe('node scripts/build-portable.mjs');
    expect(packageJson.scripts['build:native']).toBe('node scripts/build-native.mjs');
    expect(packageJson.scripts['build:all']).toContain('build:native');
  });

  it('generates the parser before attempting the optional native binding', () => {
    const spawn = vi.fn(() => ({ status: 0 }));
    const nativeInstall = vi.fn(() => 0);

    expect(
      runPortableBuild({
        cwd: '/repo/tree-sitter-holoscript',
        spawn,
        exists: vi.fn(() => true),
        nativeInstall,
      })
    ).toBe(0);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(nativeInstall).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/repo/tree-sitter-holoscript', spawn })
    );
  });

  it('uses committed parser.c when the generator is unavailable', () => {
    const spawn = vi.fn(() => ({ status: 7 }));
    const warn = vi.fn();

    expect(
      generatePortableParser({
        cwd: '/repo/tree-sitter-holoscript',
        spawn,
        exists: vi.fn(() => true),
        warn,
        error: vi.fn(),
      })
    ).toBe(0);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenLastCalledWith(expect.stringContaining('committed src/parser.c'));
  });

  it('fails when neither generation nor a committed parser is available', () => {
    const error = vi.fn();

    expect(
      generatePortableParser({
        cwd: '/repo/tree-sitter-holoscript',
        spawn: vi.fn(() => ({ status: 9 })),
        exists: vi.fn(() => false),
        warn: vi.fn(),
        error,
      })
    ).toBe(9);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('no committed src/parser.c'));
  });

  it('preserves explicit strict-native failures', () => {
    expect(
      runPortableBuild({
        cwd: '/repo/tree-sitter-holoscript',
        spawn: vi.fn(() => ({ status: 0 })),
        exists: vi.fn(() => true),
        nativeInstall: vi.fn(() => 11),
      })
    ).toBe(11);
  });
});
