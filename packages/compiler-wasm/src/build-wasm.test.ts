import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

import { runWasmBuild, wasmPackCandidates } from '../scripts/build-wasm.mjs';

describe('portable compiler-wasm build', () => {
  it('probes PATH and the Cargo bin directory', () => {
    expect(
      wasmPackCandidates({
        env: {},
        home: '/operator',
        platform: 'linux',
      })
    ).toEqual(['wasm-pack', join('/operator', '.cargo', 'bin', 'wasm-pack')]);
  });

  it('validates committed artifacts when wasm-pack is unavailable', () => {
    const spawn = vi.fn((command, args) => {
      if (command === process.execPath && args[0].endsWith('assert-wasm-package.mjs')) {
        return { status: 0 };
      }
      return { status: 127 };
    });

    expect(
      runWasmBuild({
        env: {},
        home: '/operator',
        platform: 'linux',
        spawn,
        log: vi.fn(),
        error: vi.fn(),
      })
    ).toBe(0);
    expect(spawn).toHaveBeenLastCalledWith(
      process.execPath,
      [expect.stringContaining('assert-wasm-package.mjs')],
      expect.objectContaining({ shell: false })
    );
  });

  it('fails closed when neither the tool nor committed artifacts are available', () => {
    const spawn = vi.fn((command) =>
      command === process.execPath ? { status: 1 } : { status: 127 }
    );

    expect(
      runWasmBuild({
        env: {},
        home: '/operator',
        platform: 'linux',
        spawn,
        log: vi.fn(),
        error: vi.fn(),
      })
    ).toBe(1);
  });

  it('uses an explicit wasm-pack binary and propagates the build result', () => {
    const spawn = vi
      .fn()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 9 });
    const remove = vi.fn();

    expect(
      runWasmBuild({
        env: { WASM_PACK_BIN: '/tools/wasm-pack' },
        home: '/operator',
        platform: 'linux',
        spawn,
        log: vi.fn(),
        error: vi.fn(),
        remove,
      })
    ).toBe(9);
    expect(remove).not.toHaveBeenCalled();
    expect(spawn).toHaveBeenLastCalledWith(
      '/tools/wasm-pack',
      ['build', '--target', 'web', '--out-dir', 'pkg', '--release'],
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  it('removes wasm-pack generated ignore metadata after a successful build', () => {
    const spawn = vi.fn().mockReturnValueOnce({ status: 0 }).mockReturnValueOnce({ status: 0 });
    const remove = vi.fn();

    expect(
      runWasmBuild({
        env: { WASM_PACK_BIN: '/tools/wasm-pack' },
        home: '/operator',
        platform: 'linux',
        spawn,
        remove,
        log: vi.fn(),
        error: vi.fn(),
        cwd: '/repo/packages/compiler-wasm',
      })
    ).toBe(0);
    expect(remove).toHaveBeenCalledWith(
      join('/repo/packages/compiler-wasm', 'pkg', '.gitignore'),
      { force: true }
    );
  });
});
