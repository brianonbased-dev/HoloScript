import { describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as realFs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';

import {
  BUILD_TARGETS,
  buildRecipe,
  collectBuildInputs,
  gitSource,
  inputsDigest,
  runWasmBuild,
  scanRustSource,
  wasmPackCandidates,
  withRustflags,
  workingTreeSource,
} from '../scripts/build-wasm.mjs';

const ROOT = resolve('/repo');
const CRATE = join(ROOT, 'packages', 'compiler-wasm');
const TMP = resolve('/scratch');
const HEAD = 'a'.repeat(40);
const WASM = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const WASM_SHA = sha256(WASM);
const UNIT_SEPARATOR = String.fromCharCode(0x1f);
const NUL = String.fromCharCode(0);

type SpawnResult = { status: number; stdout?: string; error?: Error };
type SpawnOptions = { cwd?: string; env?: Record<string, string | undefined> };
type WasmPackCall = { args: string[]; env: Record<string, string | undefined> };

/** The crate as the doubled git and file system hold it: repo-relative paths and contents. */
const CRATE_FILES: Record<string, string> = {
  'Cargo.toml':
    '[workspace]\nmembers = ["packages/compiler-wasm"]\n\n[profile.release]\nopt-level = "z"\n',
  'Cargo.lock': '# the workspace lock\nversion = 4\n',
  'packages/compiler-wasm/Cargo.toml': '[package]\nname = "holoscript-wasm"\n',
  'packages/compiler-wasm/Cargo.lock': '# a member lock cargo never reads\n',
  'packages/compiler-wasm/src/lib.rs':
    '#[wasm_bindgen]\npub fn parse() {}\nconst D: &str = include_str!("../../std/src/holo/absorb.hs");\n',
  'packages/compiler-wasm/src/lexer.rs': 'pub fn lex() {}\n',
  'packages/compiler-wasm/src/__tests__/api.test.ts': 'export {};\n',
  'packages/std/src/holo/absorb.hs': 'export function f(): bool {\n  return true\n}\n',
};

/** What cargo reads of CRATE_FILES: not the member lock, not the TypeScript test. */
const EXPECTED_INPUTS = [
  'Cargo.lock',
  'Cargo.toml',
  'packages/compiler-wasm/Cargo.toml',
  'packages/compiler-wasm/src/lexer.rs',
  'packages/compiler-wasm/src/lib.rs',
  'packages/std/src/holo/absorb.hs',
];

function expectedDigest(files: Record<string, string>) {
  const lines = [...EXPECTED_INPUTS]
    .sort()
    .map((path) => `${sha256(files[path])}  ${path}\n`)
    .join('');
  return sha256(lines);
}

/** An in-memory file system holding the checkout under ROOT. */
function memoryFs(files: Record<string, string | Buffer> = {}) {
  const store = new Map<string, Buffer>(
    Object.entries(files).map(([path, content]) => [path, Buffer.from(content)])
  );
  let temps = 0;
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
      for (const key of [...store.keys()]) if (key.startsWith(`${path}${sep}`)) store.delete(key);
    },
    mkdtempSync: (prefix: string) => {
      temps += 1;
      return `${prefix}${temps}`;
    },
  };
}

function checkoutFs(extra: Record<string, string | Buffer> = {}) {
  const files: Record<string, string | Buffer> = {};
  for (const [path, content] of Object.entries(CRATE_FILES)) files[join(ROOT, path)] = content;
  for (const [path, content] of Object.entries(extra)) files[path] = content;
  return memoryFs(files);
}

/**
 * A spawn double: git answers from CRATE_FILES (ls-files lists the tracked paths under each
 * pathspec), wasm-pack "builds" by writing the given WASM, a regenerated package.json, a
 * .gitignore and the README/LICENSE copies into its out dir, and records each call.
 */
interface ToolchainOptions {
  dirty?: string;
  wasmFor?: (target: string, repeat: boolean) => Buffer;
  buildStatus?: (repeat: boolean) => number;
}

function toolchain(
  fs: ReturnType<typeof memoryFs>,
  { dirty = '', wasmFor = () => WASM, buildStatus = () => 0 }: ToolchainOptions = {}
) {
  const calls: WasmPackCall[] = [];
  const spawn = vi.fn(
    (command: string, args: string[], options: SpawnOptions = {}): SpawnResult => {
      if (command === process.execPath) return { status: 0 };
      if (command === 'git') {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel')
          return { status: 0, stdout: `${ROOT}\n` };
        if (args[0] === 'rev-parse') return { status: 0, stdout: `${HEAD}\n` };
        if (args[0] === 'status') return { status: 0, stdout: dirty };
        if (args[0] === 'ls-files') {
          const specs = args.slice(args.indexOf('--') + 1);
          const found = Object.keys(CRATE_FILES).filter((path) =>
            specs.some((spec) => path === spec || path.startsWith(`${spec}/`))
          );
          return { status: 0, stdout: found.map((path) => `${path}${NUL}`).join('') };
        }
        return { status: 1 };
      }
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
        const out = args[args.indexOf('--out-dir') + 1];
        const repeat = isAbsolute(out);
        const outDir = repeat ? out : join(CRATE, out);
        calls.push({ args, env: { ...(options.env ?? {}) } });
        fs.writeFileSync(join(outDir, 'holoscript_wasm_bg.wasm'), wasmFor(target, repeat));
        fs.writeFileSync(join(outDir, 'package.json'), '{"regenerated":true}');
        fs.writeFileSync(join(outDir, '.gitignore'), '*');
        fs.writeFileSync(join(outDir, 'README.md'), '# copied by wasm-pack');
        fs.writeFileSync(join(outDir, 'LICENSE'), 'MIT');
        return { status: buildStatus(repeat) };
      }
      return { status: 127 };
    }
  );
  return { spawn, calls };
}

function rebuildWith(
  fs: ReturnType<typeof memoryFs>,
  spawn: ReturnType<typeof toolchain>['spawn'],
  env: Record<string, string> = {}
) {
  const log = vi.fn();
  const error = vi.fn();
  const status = runWasmBuild({
    env: { WASM_PACK_BIN: '/tools/wasm-pack', ...env },
    home: resolve('/operator'),
    platform: 'linux',
    spawn,
    cwd: CRATE,
    log,
    error,
    fs,
    tmp: TMP,
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
});

describe('rebuild (git and the file system doubled)', () => {
  it('builds both targets twice and writes each v2 receipt from the files it describes', () => {
    const fs = checkoutFs({
      [join(CRATE, 'pkg', 'package.json')]: '{"name":"committed-web"}\n',
      [join(CRATE, 'pkg', 'README.md')]: '# was here before the build',
      [join(CRATE, 'pkg-node', 'rebuild-receipt.json')]: JSON.stringify({
        result: { wasmSha256: 'f'.repeat(64) },
      }),
    });
    const { spawn, calls } = toolchain(fs);
    const { status, error } = rebuildWith(fs, spawn);

    expect(error).not.toHaveBeenCalled();
    expect(status).toBe(0);
    // Two builds per target: the committed out dirs, then a fresh target dir outside the crate.
    expect(calls.map((call) => call.args.slice(0, 5).join(' '))).toEqual([
      'build --target web --out-dir pkg',
      'build --target nodejs --out-dir pkg-node',
      `build --target web --out-dir ${join(TMP, 'holoscript-wasm-repeat-1', 'pkg')}`,
      `build --target nodejs --out-dir ${join(TMP, 'holoscript-wasm-repeat-1', 'pkg-node')}`,
    ]);
    expect(calls[0].env.CARGO_TARGET_DIR).toBeUndefined();
    expect(calls[2].env.CARGO_TARGET_DIR).toBe(join(TMP, 'holoscript-wasm-repeat-1', 'target'));
    expect(calls[3].env.CARGO_TARGET_DIR).toBe(join(TMP, 'holoscript-wasm-repeat-1', 'target'));
    // The repeat build's directory is removed.
    expect([...fs.store.keys()].some((path) => path.startsWith(TMP))).toBe(false);

    for (const { outDir, target, schema } of BUILD_TARGETS) {
      expect(fs.existsSync(join(CRATE, outDir, '.gitignore'))).toBe(false);
      const written = receipt(fs, outDir);
      expect(written.schema).toBe(schema);
      expect(written.sourceCommit).toBe(HEAD);
      expect(written.artifactPath).toBe(`packages/compiler-wasm/${outDir}`);
      expect(written.generatedAt).toBe('2026-09-29T01:02:03Z');
      expect(written.toolchain).toEqual({ rustc: '1.91.0', cargo: '1.91.0', wasmPack: '0.14.0' });
      expect(written.inputs.sha256).toBe(expectedDigest(CRATE_FILES));
      expect(Object.keys(written.inputs.files)).toEqual(EXPECTED_INPUTS);
      expect(written.recipe).toEqual({ ...buildRecipe(target, outDir), extraRustflags: [] });
      expect(written.result.wasmSha256).toBe(WASM_SHA);
      expect(written.result.wasmBytes).toBe(WASM.length);
      expect(written.result.repeatBuildSha256Matched).toBe(true);
      expect(written.result.repeatBuildWasmSha256).toBe(WASM_SHA);
    }
    expect(receipt(fs, 'pkg').schema).toBe('holoscript.compiler-wasm.pkg-web.rebuild-receipt.v2');
    expect(receipt(fs, 'pkg-node').result.previousWasmSha256).toBe('f'.repeat(64));
    expect(receipt(fs, 'pkg-node').result.artifactBytesChanged).toBe(true);
    // The committed package metadata survives; a build without one keeps what wasm-pack wrote.
    expect(fs.readFileSync(join(CRATE, 'pkg', 'package.json'), 'utf8')).toBe(
      '{"name":"committed-web"}\n'
    );
    expect(fs.readFileSync(join(CRATE, 'pkg-node', 'package.json'), 'utf8')).toBe(
      '{"regenerated":true}'
    );
    // wasm-pack's README/LICENSE copies are removed unless the file was there before the build.
    expect(fs.readFileSync(join(CRATE, 'pkg', 'README.md'), 'utf8')).toBe('# copied by wasm-pack');
    expect(fs.existsSync(join(CRATE, 'pkg', 'LICENSE'))).toBe(false);
    expect(fs.existsSync(join(CRATE, 'pkg-node', 'README.md'))).toBe(false);
  });

  it('maps the cargo home, the rustup home and the workspace root to fixed names, after any flags already set', () => {
    const fs = checkoutFs();
    const { spawn, calls } = toolchain(fs);
    const { status } = rebuildWith(fs, spawn, {
      CARGO_HOME: 'C:/Users/someone/.cargo',
      RUSTFLAGS: '--cfg  from_env -Cdebuginfo=0',
    });

    expect(status).toBe(0);
    for (const call of calls) {
      expect(call.env.RUSTFLAGS).toBeUndefined();
      expect(String(call.env.CARGO_ENCODED_RUSTFLAGS).split(UNIT_SEPARATOR)).toEqual([
        '--cfg',
        'from_env',
        '-Cdebuginfo=0',
        '--remap-path-prefix=C:/Users/someone/.cargo=/cargo-home',
        `--remap-path-prefix=${join(resolve('/operator'), '.rustup')}=/rustup-home`,
        `--remap-path-prefix=${ROOT}=/workspace`,
      ]);
    }
    expect(receipt(fs, 'pkg').recipe.extraRustflags).toEqual([
      '--cfg',
      'from_env',
      '-Cdebuginfo=0',
    ]);
    // An encoded value wins over RUSTFLAGS, as it does for cargo.
    expect(
      withRustflags({ CARGO_ENCODED_RUSTFLAGS: `-a b${UNIT_SEPARATOR}-c`, RUSTFLAGS: '-x' }, ['-z'])
        .env.CARGO_ENCODED_RUSTFLAGS
    ).toBe(['-a b', '-c', '-z'].join(UNIT_SEPARATOR));
  });

  it('writes no receipt when the repeat build gives different WASM', () => {
    const fs = checkoutFs();
    const { spawn, calls } = toolchain(fs, {
      wasmFor: (_target, repeat) => (repeat ? Buffer.from([0, 97, 115, 109, 9]) : WASM),
    });
    const { status, error } = rebuildWith(fs, spawn);

    expect(status).toBe(1);
    expect(calls).toHaveLength(4);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('the build is not reproducible here')
    );
    expect(fs.existsSync(join(CRATE, 'pkg', 'rebuild-receipt.json'))).toBe(false);
    expect(fs.existsSync(join(CRATE, 'pkg-node', 'rebuild-receipt.json'))).toBe(false);
  });

  it('stops at a failed repeat build and writes no receipt', () => {
    const fs = checkoutFs();
    const { spawn } = toolchain(fs, { buildStatus: (repeat) => (repeat ? 7 : 0) });
    const { status } = rebuildWith(fs, spawn);

    expect(status).toBe(7);
    expect(fs.existsSync(join(CRATE, 'pkg', 'rebuild-receipt.json'))).toBe(false);
    expect([...fs.store.keys()].some((path) => path.startsWith(TMP))).toBe(false);
  });

  it('writes no receipt when the two targets produce different WASM', () => {
    const fs = checkoutFs();
    const { spawn } = toolchain(fs, {
      wasmFor: (target) => (target === 'web' ? Buffer.from([0, 97, 115, 109, 2]) : WASM),
    });
    const { status, error } = rebuildWith(fs, spawn);

    expect(status).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('different WASM'));
    expect(fs.existsSync(join(CRATE, 'pkg', 'rebuild-receipt.json'))).toBe(false);
    expect(fs.existsSync(join(CRATE, 'pkg-node', 'rebuild-receipt.json'))).toBe(false);
  });

  it('stops at a failed wasm-pack build and writes no receipt', () => {
    const fs = checkoutFs();
    const { spawn } = toolchain(fs, { buildStatus: () => 9 });
    const { status } = rebuildWith(fs, spawn);

    expect(status).toBe(9);
    expect(fs.existsSync(join(CRATE, 'pkg', 'rebuild-receipt.json'))).toBe(false);
  });

  it('refuses to rebuild while a Rust build input has uncommitted changes', () => {
    const fs = checkoutFs();
    const { spawn, calls } = toolchain(fs, { dirty: ' M packages/compiler-wasm/src/lib.rs\n' });
    const { status, error } = rebuildWith(fs, spawn);

    expect(status).toBe(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('M packages/compiler-wasm/src/lib.rs')
    );
    expect(calls).toHaveLength(0);
  });
});

// ------------------------------------------------------------------------------------------
// On a real git checkout: the guard and the input rule as git answers them.

function git(cwd: string, args: string[]) {
  const result = spawnSync(
    'git',
    [
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@example.invalid',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd, encoding: 'utf8', windowsHide: true }
  );
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

function write(root: string, path: string, content: string) {
  realFs.mkdirSync(dirname(join(root, path)), { recursive: true });
  realFs.writeFileSync(join(root, path), content);
}

function withCheckout(test: (root: string) => void) {
  const root = realFs.mkdtempSync(join(tmpdir(), 'build-wasm-guard-'));
  try {
    for (const [path, content] of Object.entries(CRATE_FILES)) write(root, path, content);
    git(root, ['init', '-q', '-b', 'main']);
    git(root, ['add', '.']);
    git(root, ['commit', '-q', '-m', 'the crate']);
    test(root);
  } finally {
    realFs.rmSync(root, { recursive: true, force: true });
  }
}

/** Real git; a fake wasm-pack that writes a fixed WASM wherever it is told. */
function realGit(calls: string[][]) {
  return (command: string, args: string[], options: Record<string, unknown> = {}) => {
    if (command === 'git')
      return spawnSync('git', args, options as Parameters<typeof spawnSync>[2]);
    if (args[0] === '--version') return { status: 0, stdout: `${command} 1.0.0\n` };
    if (command === '/tools/wasm-pack' && args[0] === 'build') {
      calls.push(args);
      const out = args[args.indexOf('--out-dir') + 1];
      const outDir = isAbsolute(out) ? out : join(String(options.cwd), out);
      realFs.mkdirSync(outDir, { recursive: true });
      realFs.writeFileSync(join(outDir, 'holoscript_wasm_bg.wasm'), WASM);
      return { status: 0 };
    }
    return { status: 127 };
  };
}

function rebuildReal(root: string) {
  const calls: string[][] = [];
  const error = vi.fn();
  const scratch = realFs.mkdtempSync(join(tmpdir(), 'build-wasm-repeat-'));
  try {
    const status = runWasmBuild({
      env: { ...process.env, WASM_PACK_BIN: '/tools/wasm-pack' },
      platform: 'linux',
      spawn: realGit(calls),
      cwd: join(root, 'packages', 'compiler-wasm'),
      log: vi.fn(),
      error,
      tmp: scratch,
      rebuild: true,
    });
    return { status, error, calls };
  } finally {
    realFs.rmSync(scratch, { recursive: true, force: true });
  }
}

describe('rebuild guard (a real git checkout)', () => {
  it('refuses while a new Rust file under src is untracked, and names it', () => {
    withCheckout((root) => {
      write(root, 'packages/compiler-wasm/src/new_pass.rs', 'pub fn pass() {}\n');
      const { status, error, calls } = rebuildReal(root);
      expect(status).toBe(1);
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('?? packages/compiler-wasm/src/new_pass.rs')
      );
      expect(calls).toHaveLength(0);
    });
  });

  for (const [label, path, content] of [
    ['the workspace Cargo.lock', 'Cargo.lock', '# the workspace lock\nversion = 4\n# bumped\n'],
    [
      'the workspace Cargo.toml (its release profile)',
      'Cargo.toml',
      CRATE_FILES['Cargo.toml'].replace('"z"', '"s"'),
    ],
    ['the crate Cargo.toml', 'packages/compiler-wasm/Cargo.toml', '[package]\nname = "renamed"\n'],
    [
      'a file the build code embeds',
      'packages/std/src/holo/absorb.hs',
      'export function g(): bool {\n  return false\n}\n',
    ],
    [
      'a tracked Rust file',
      'packages/compiler-wasm/src/lexer.rs',
      'pub fn lex() { /* edited */ }\n',
    ],
  ]) {
    it(`refuses while ${label} has uncommitted changes`, () => {
      withCheckout((root) => {
        write(root, path, content);
        const { status, error, calls } = rebuildReal(root);
        expect(status).toBe(1);
        expect(error).toHaveBeenCalledWith(expect.stringContaining(` M ${path}`));
        expect(calls).toHaveLength(0);
      });
    });
  }

  it('builds, and its receipt hashes what git holds at HEAD, when only non-inputs changed', () => {
    withCheckout((root) => {
      // Neither is read by cargo: the member lock (the workspace lock is used) and a TS test.
      write(root, 'packages/compiler-wasm/Cargo.lock', '# edited, and still unread\n');
      write(root, 'packages/compiler-wasm/src/__tests__/api.test.ts', 'export const x = 1;\n');
      write(root, 'packages/compiler-wasm/src/__tests__/new.test.ts', 'export {};\n');
      const { status, error, calls } = rebuildReal(root);
      expect(error).not.toHaveBeenCalled();
      expect(status).toBe(0);
      expect(calls).toHaveLength(4);
      const written = JSON.parse(
        realFs.readFileSync(join(root, 'packages/compiler-wasm/pkg/rebuild-receipt.json'), 'utf8')
      );
      const headGit = (args: string[], input?: string) => {
        const result = spawnSync('git', args, { cwd: root, input, maxBuffer: 1 << 26 });
        return { status: result.status ?? 1, stdout: result.stdout, stderr: String(result.stderr) };
      };
      const atHead = inputsDigest(
        collectBuildInputs(gitSource(headGit, 'HEAD'), 'packages/compiler-wasm').inputs
      );
      expect(written.inputs.sha256).toBe(atHead.sha256);
      expect(written.inputs.sha256).toBe(expectedDigest(CRATE_FILES));
      expect(written.sourceCommit).toBe(git(root, ['rev-parse', 'HEAD']).trim());
    });
  });
});

// ------------------------------------------------------------------------------------------
// The input rule and the scanner.

/** A source over a plain map of repo-relative paths. */
function mapSource(files: Record<string, string>) {
  return {
    list: (paths: string[]) =>
      Object.keys(files).filter((path) =>
        paths.some((spec) => path === spec || path.startsWith(`${spec}/`))
      ),
    read: (path: string) => (path in files ? Buffer.from(files[path]) : null),
  };
}

describe('build inputs', () => {
  it('are the files cargo reads: not the member lock, not TypeScript under src', () => {
    const { inputs, workspace } = collectBuildInputs(
      mapSource(CRATE_FILES),
      'packages/compiler-wasm'
    );
    expect(workspace).toBe('.');
    expect([...inputs.keys()]).toEqual(EXPECTED_INPUTS);
  });

  it('hash to sha256 over "<sha256>  <path>" lines in path order', () => {
    const { inputs } = collectBuildInputs(mapSource(CRATE_FILES), 'packages/compiler-wasm');
    const digest = inputsDigest(inputs);
    expect(digest.sha256).toBe(expectedDigest(CRATE_FILES));
    expect(digest.files['Cargo.lock']).toBe(sha256(CRATE_FILES['Cargo.lock']));
  });

  it('use the crate lock when the crate is its own workspace', () => {
    const { inputs, workspace } = collectBuildInputs(
      mapSource({
        'Cargo.toml': '[package]\nname = "solo"\n',
        'Cargo.lock': '#',
        'src/lib.rs': 'fn f() {}\n',
      }),
      '.'
    );
    expect(workspace).toBe('.');
    expect([...inputs.keys()]).toEqual(['Cargo.lock', 'Cargo.toml', 'src/lib.rs']);
  });

  it('count cargo configuration and toolchain pins from the crate up to the repository root', () => {
    const { inputs } = collectBuildInputs(
      mapSource({
        ...CRATE_FILES,
        '.cargo/config.toml': '[build]\n',
        'packages/compiler-wasm/rust-toolchain.toml': '[toolchain]\nchannel = "1.91.0"\n',
        'packages/other/.cargo/config.toml': '# not an ancestor of the crate\n',
      }),
      'packages/compiler-wasm'
    );
    expect([...inputs.keys()]).toEqual(
      [
        ...EXPECTED_INPUTS,
        '.cargo/config.toml',
        'packages/compiler-wasm/rust-toolchain.toml',
      ].sort()
    );
  });

  it('follow include! into the file it pulls in', () => {
    const { inputs } = collectBuildInputs(
      mapSource({
        ...CRATE_FILES,
        'packages/compiler-wasm/src/lib.rs': 'include!("../generated/table.rs");\n',
        'packages/compiler-wasm/generated/table.rs':
          'const T: &[u8] = include_bytes!("table.bin");\n',
        'packages/compiler-wasm/generated/table.bin': 'bytes',
      }),
      'packages/compiler-wasm'
    );
    expect([...inputs.keys()]).toContain('packages/compiler-wasm/generated/table.rs');
    expect([...inputs.keys()]).toContain('packages/compiler-wasm/generated/table.bin');
  });

  it('refuse, naming file and line, an include they cannot read, one outside the repository, and an untracked one', () => {
    let thrown: Error | undefined;
    try {
      collectBuildInputs(
        mapSource({
          ...CRATE_FILES,
          'packages/compiler-wasm/src/lib.rs': [
            'const A: &str = include_str!(SOME_PATH);',
            'const B: &str = include_str!("../../../../outside.hs");',
            'const C: &str = include_str!("not_tracked.hs");',
          ].join('\n'),
        }),
        'packages/compiler-wasm'
      );
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown?.message).toContain(
      'packages/compiler-wasm/src/lib.rs:1: include_str!(SOME_PATH) cannot be read'
    );
    expect(thrown?.message).toContain(
      'packages/compiler-wasm/src/lib.rs:2: include_str! embeds ../../../../outside.hs, outside the repository'
    );
    expect(thrown?.message).toContain(
      'packages/compiler-wasm/src/lib.rs:3: include_str! embeds packages/compiler-wasm/src/not_tracked.hs, which is not tracked'
    );
  });

  it('refuse a checkout without the workspace lock', () => {
    const files: Record<string, string> = { ...CRATE_FILES };
    delete files['Cargo.lock'];
    expect(() => collectBuildInputs(mapSource(files), 'packages/compiler-wasm')).toThrow(
      /Cargo\.lock is not tracked: without it cargo resolves the dependencies afresh/
    );
  });

  it('read a working tree through git ls-files and the disk', () => {
    const fs = checkoutFs();
    const { spawn } = toolchain(fs);
    const gitText = (args: string[]) => {
      const result = spawn('git', args, {});
      return { status: result.status, stdout: String(result.stdout ?? '') };
    };
    const { inputs } = collectBuildInputs(
      workingTreeSource({ git: gitText, rootDir: ROOT, fs }),
      'packages/compiler-wasm'
    );
    expect([...inputs.keys()]).toEqual(EXPECTED_INPUTS);
  });
});

const paths = (text: string) =>
  scanRustSource(text).includes.map((include) => `${include.base}:${include.path}`);

describe('scanRustSource', () => {
  it('names the files include_str!, include_bytes! and include! embed', () => {
    expect(
      paths(
        [
          'const A: &str = include_str!("a.hs");',
          'static B: &[u8] = include_bytes!("b.bin");',
          'include!("c.rs");',
          'const D: &str = std::include_str!["d.hs"];',
          'const E: &str = include_str!(',
          '    "../../examples/e.hs",',
          ');',
        ].join('\n')
      )
    ).toEqual(['file:a.hs', 'file:b.bin', 'file:c.rs', 'file:d.hs', 'file:../../examples/e.hs']);
    expect(scanRustSource('\n\nconst E: &str = include_str!(\n  "e.hs"\n);').includes[0].line).toBe(
      3
    );
  });

  it('reads concat!(env!("CARGO_MANIFEST_DIR"), ...) as a path in the crate', () => {
    expect(
      paths(
        'const D: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/decl/", "absorb.hs"));'
      )
    ).toEqual(['crate:decl/absorb.hs']);
    expect(paths('const D: &str = include_str!(concat!("../", "x.hs"));')).toEqual([
      'file:../x.hs',
    ]);
  });

  it('skips only the item an early #[cfg(test)] marks, so a later include still counts', () => {
    expect(
      paths(
        [
          '#[cfg(test)]',
          'use std::fmt::Write;',
          '#[cfg(test)]',
          'const FIXTURE: &[(&str, &str)] = &[("x", "@host { function: \\"f\\" } include_str!(\\"no.hs\\")")];',
          'fn modules() {',
          '    let sources = MODULES.iter();',
          '    #[cfg(test)]',
          '    let sources = sources.chain(include_str!("test_only.hs").lines());',
          '    let _ = sources;',
          '}',
          'const DECLARATIONS: &str = include_str!("../../std/src/holo/absorb.hs");',
        ].join('\n')
      )
    ).toEqual(['file:../../std/src/holo/absorb.hs']);
  });

  it('skips #[cfg(test)] modules and the rest of a block marked #![cfg(test)]', () => {
    expect(
      paths(
        [
          'const A: &str = include_str!("a.hs");',
          '#[cfg(test)]',
          '#[allow(dead_code)]',
          'mod tests {',
          '    const F: &str = include_str!("fixture.hs");',
          '    fn t() { let _ = include_bytes!("fixture.bin"); }',
          '}',
          'mod inner {',
          '    #![cfg(test)]',
          '    const G: &str = include_str!("inner_fixture.hs");',
          '}',
          'const B: &str = include_str!("b.hs");',
        ].join('\n')
      )
    ).toEqual(['file:a.hs', 'file:b.hs']);
    expect(paths('#![cfg(test)]\nconst F: &str = include_str!("whole_file.hs");\n')).toEqual([]);
    // Any cfg other than exactly `test` is build code.
    expect(paths('#[cfg(not(test))]\nconst F: &str = include_str!("shipped.hs");\n')).toEqual([
      'file:shipped.hs',
    ]);
  });

  it('ignores includes written in comments and strings, and is not thrown by literals and lifetimes', () => {
    expect(
      paths(
        [
          '// include_str!("line_comment.hs")',
          '/// include_str!("doc_comment.hs")',
          '/* include_str!("block.hs") /* nested */ include_str!("still_block.hs") */',
          'const S: &str = "include_str!(\\"in_a_string.hs\\")";',
          'const R: &str = r#"include_str!("in_a_raw_string.hs") { "#;',
          "const C: char = '{';",
          "const Q: char = '\\'';",
          "fn f<'a>(x: &'a str) -> &'a str { x }",
          'const A: &str = include_str!("real.hs");',
        ].join('\n')
      )
    ).toEqual(['file:real.hs']);
  });

  it('refuses the forms it cannot name instead of skipping them', () => {
    const refused = (text: string) => scanRustSource(text).refusals.map((refusal) => refusal.form);
    expect(refused('const A: &str = include_str!(PATH);')).toEqual(['include_str!(PATH)']);
    expect(refused('const A: &str = include_str!(concat!(env!("OUT_DIR"), "/x"));')).toHaveLength(
      1
    );
    expect(refused('#[path = "elsewhere/x.rs"]\nmod x;')).toEqual([
      '#[path = ...] on a module (its file is not followed)',
    ]);
    expect(refused('const A: &str = "unterminated;')[0]).toContain('did not read as Rust');
  });
});

describe('package scripts', () => {
  it('rewrite the committed builds only through build-wasm.mjs --rebuild', () => {
    const pkg = JSON.parse(realFs.readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const writers = Object.entries(pkg.scripts).filter(([, command]) =>
      /wasm-pack build[^&|;]*--out-dir (pkg|pkg-node)(\s|$)/.test(command)
    );
    expect(writers).toEqual([]);
    expect(pkg.scripts.rebuild).toBe('node scripts/build-wasm.mjs --rebuild');
  });

  it('send a missing build to rebuild, not to build', () => {
    const crate = realFs.mkdtempSync(join(tmpdir(), 'assert-wasm-package-'));
    try {
      realFs.mkdirSync(join(crate, 'scripts'));
      realFs.writeFileSync(
        join(crate, 'scripts', 'assert-wasm-package.mjs'),
        realFs.readFileSync(join(__dirname, '..', 'scripts', 'assert-wasm-package.mjs'))
      );
      const result = spawnSync(
        process.execPath,
        [join(crate, 'scripts', 'assert-wasm-package.mjs')],
        {
          encoding: 'utf8',
        }
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('pnpm --filter @holoscript/wasm run rebuild');
    } finally {
      realFs.rmSync(crate, { recursive: true, force: true });
    }
  });
});
