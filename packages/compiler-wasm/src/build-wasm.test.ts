import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { runWasmBuild, wasmPackCandidates } from '../scripts/build-wasm.mjs';

const CRATE = '/repo/packages/compiler-wasm';
const HEAD = 'a'.repeat(40);
const WASM = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
const WASM_SHA = createHash('sha256').update(WASM).digest('hex');

/** An in-memory file system holding the committed builds under CRATE. */
function memoryFs(files: Record<string, string | Buffer> = {}) {
  const store = new Map<string, Buffer>(
    Object.entries(files).map(([path, content]) => [path, Buffer.from(content)])
  );
  return {
    store,
    existsSync: (path: string) => store.has(path),
    readFileSync: (path: string, encoding?: string) => {
      const content = store.get(path);
      if (!content) throw new Error(`ENOENT ${path}`);
      return encoding ? content.toString(encoding as BufferEncoding) : content;
    },
    writeFileSync: (path: string, content: string | Buffer) => {
      store.set(path, Buffer.from(content));
    },
    rmSync: (path: string) => {
      store.delete(path);
    },
  };
}

/**
 * A spawn double: wasm-pack answers --version and "builds" by writing the given WASM, a
 * regenerated package.json and a .gitignore into the out dir; git and the Rust tools answer
 * from the options.
 */
function toolchain(
  fs: ReturnType<typeof memoryFs>,
  { dirty = '', wasmByTarget = {} as Record<string, Buffer>, buildStatus = 0 } = {}
) {
  return vi.fn((command: string, args: string[]) => {
    if (command === process.execPath) return { status: 0 };
    if (command === 'git' && args[0] === 'status') return { status: 0, stdout: dirty };
    if (command === 'git' && args[0] === 'rev-parse') return { status: 0, stdout: `${HEAD}\n` };
    if (args[0] === '--version') {
      if (command === 'rustc')
        return { status: 0, stdout: 'rustc 1.91.0 (f8297e351 2025-10-28)\n' };
      if (command === 'cargo')
        return { status: 0, stdout: 'cargo 1.91.0 (ea2d97820 2025-10-10)\n' };
      if (command === '/tools/wasm-pack') return { status: 0, stdout: 'wasm-pack 0.14.0\n' };
      return { status: 127 };
    }
    if (command === '/tools/wasm-pack' && args[0] === 'build') {
      const target = args[args.indexOf('--target') + 1];
      const outDir = join(CRATE, args[args.indexOf('--out-dir') + 1]);
      fs.writeFileSync(join(outDir, 'holoscript_wasm_bg.wasm'), wasmByTarget[target] ?? WASM);
      fs.writeFileSync(join(outDir, 'package.json'), '{"regenerated":true}');
      fs.writeFileSync(join(outDir, '.gitignore'), '*');
      return { status: buildStatus };
    }
    return { status: 127 };
  });
}

function rebuildWith(fs: ReturnType<typeof memoryFs>, spawn: ReturnType<typeof toolchain>) {
  const log = vi.fn();
  const error = vi.fn();
  const status = runWasmBuild({
    env: { WASM_PACK_BIN: '/tools/wasm-pack' },
    home: '/operator',
    platform: 'linux',
    spawn,
    cwd: CRATE,
    log,
    error,
    fs,
    now: () => new Date('2026-09-29T01:02:03.456Z'),
    rebuild: true,
  });
  return { status, log, error };
}

function receipt(fs: ReturnType<typeof memoryFs>, outDir: string) {
  return JSON.parse(fs.readFileSync(join(CRATE, outDir, 'rebuild-receipt.json'), 'utf8') as string);
}

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

  it('validates the committed builds and never runs wasm-pack, even when it is installed', () => {
    const spawn = vi.fn(() => ({ status: 0 }));

    expect(
      runWasmBuild({
        env: { WASM_PACK_BIN: '/tools/wasm-pack' },
        home: '/operator',
        platform: 'linux',
        spawn,
        log: vi.fn(),
        error: vi.fn(),
      })
    ).toBe(0);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenLastCalledWith(
      process.execPath,
      [expect.stringContaining('assert-wasm-package.mjs')],
      expect.objectContaining({ shell: false })
    );
  });

  it('fails closed when the committed builds are missing', () => {
    const spawn = vi.fn(() => ({ status: 1 }));

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

  it('refuses to rebuild without wasm-pack', () => {
    const fs = memoryFs();
    const spawn = vi.fn(() => ({ status: 127 }));
    const error = vi.fn();

    expect(
      runWasmBuild({
        env: {},
        home: '/operator',
        platform: 'linux',
        spawn,
        cwd: CRATE,
        log: vi.fn(),
        error,
        fs,
        rebuild: true,
      })
    ).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('wasm-pack is needed to rebuild'));
  });

  it('refuses to rebuild while a Rust build input has uncommitted changes', () => {
    const fs = memoryFs();
    const spawn = toolchain(fs, { dirty: ' M src/lib.rs\n' });
    const { status, error } = rebuildWith(fs, spawn);

    expect(status).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('M src/lib.rs'));
    expect(spawn).not.toHaveBeenCalledWith(
      '/tools/wasm-pack',
      expect.arrayContaining(['build']),
      expect.anything()
    );
  });

  it('refuses to rebuild while a file the WASM embeds has uncommitted changes', () => {
    const fs = memoryFs({
      [join(CRATE, 'src', 'lib.rs')]: [
        'pub fn parse() {}',
        'const DECLARATIONS: &str = include_str!("../../std/src/holo/absorb.hs");',
        '#[cfg(test)]',
        'mod tests {',
        '    const FIXTURE: &str = include_str!("../../std/src/math.hsplus");',
        '}',
      ].join('\n'),
    });
    const statusArgs: string[][] = [];
    const spawn = vi.fn((command: string, args: string[]) => {
      if (args[0] === '--version') return { status: 0, stdout: `${command} 1.0.0\n` };
      if (command === 'git' && args[0] === 'ls-files') return { status: 0, stdout: 'src/lib.rs\n' };
      if (command === 'git' && args[0] === 'status') {
        statusArgs.push(args);
        return {
          status: 0,
          stdout: args.includes('../std/src/holo/absorb.hs')
            ? ' M ../std/src/holo/absorb.hs\n'
            : '',
        };
      }
      return { status: 127 };
    });
    const { status, error } = rebuildWith(fs, spawn as unknown as ReturnType<typeof toolchain>);

    expect(status).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('../std/src/holo/absorb.hs'));
    // A file only test code includes is not a build input.
    expect(statusArgs[0]).not.toContain('../std/src/math.hsplus');
  });

  it('rebuilds both targets and writes each receipt from the file it describes', () => {
    const fs = memoryFs({
      [join(CRATE, 'pkg', 'package.json')]: '{"name":"committed-web"}\n',
      [join(CRATE, 'pkg-node', 'rebuild-receipt.json')]: JSON.stringify({
        result: { wasmSha256: 'f'.repeat(64) },
      }),
    });
    const spawn = toolchain(fs);
    const { status, error } = rebuildWith(fs, spawn);

    expect(error).not.toHaveBeenCalled();
    expect(status).toBe(0);
    expect(spawn).toHaveBeenCalledWith(
      '/tools/wasm-pack',
      ['build', '--target', 'web', '--out-dir', 'pkg', '--release'],
      expect.objectContaining({ stdio: 'inherit' })
    );
    expect(spawn).toHaveBeenCalledWith(
      '/tools/wasm-pack',
      ['build', '--target', 'nodejs', '--out-dir', 'pkg-node', '--release'],
      expect.objectContaining({ stdio: 'inherit' })
    );

    for (const outDir of ['pkg', 'pkg-node']) {
      expect(fs.existsSync(join(CRATE, outDir, '.gitignore'))).toBe(false);
      const written = receipt(fs, outDir);
      expect(written.sourceCommit).toBe(HEAD);
      expect(written.generatedAt).toBe('2026-09-29T01:02:03Z');
      expect(written.toolchain).toEqual({ rustc: '1.91.0', cargo: '1.91.0', wasmPack: '0.14.0' });
      expect(written.result.wasmSha256).toBe(WASM_SHA);
      expect(written.result.wasmBytes).toBe(WASM.length);
    }
    expect(receipt(fs, 'pkg').schema).toBe('holoscript.compiler-wasm.pkg-web.rebuild-receipt.v1');
    expect(receipt(fs, 'pkg-node').result.previousWasmSha256).toBe('f'.repeat(64));
    expect(receipt(fs, 'pkg-node').result.artifactBytesChanged).toBe(true);
    // The committed package metadata survives; a build without one keeps what wasm-pack wrote.
    expect(fs.readFileSync(join(CRATE, 'pkg', 'package.json'), 'utf8')).toBe(
      '{"name":"committed-web"}\n'
    );
    expect(fs.readFileSync(join(CRATE, 'pkg-node', 'package.json'), 'utf8')).toBe(
      '{"regenerated":true}'
    );
  });

  it('writes no receipt when the two targets produce different WASM', () => {
    const fs = memoryFs();
    const spawn = toolchain(fs, { wasmByTarget: { web: Buffer.from([0, 97, 115, 109, 2]) } });
    const { status, error } = rebuildWith(fs, spawn);

    expect(status).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('different WASM'));
    expect(fs.existsSync(join(CRATE, 'pkg', 'rebuild-receipt.json'))).toBe(false);
    expect(fs.existsSync(join(CRATE, 'pkg-node', 'rebuild-receipt.json'))).toBe(false);
  });

  it('stops at a failed wasm-pack build and writes no receipt', () => {
    const fs = memoryFs();
    const spawn = toolchain(fs, { buildStatus: 9 });
    const { status } = rebuildWith(fs, spawn);

    expect(status).toBe(9);
    expect(fs.existsSync(join(CRATE, 'pkg', 'rebuild-receipt.json'))).toBe(false);
  });
});
