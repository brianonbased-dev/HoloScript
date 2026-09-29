import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assertScript = join(root, 'scripts', 'assert-wasm-package.mjs');

/**
 * The two committed builds. wasm-bindgen emits one WASM module for both targets; only the
 * JavaScript glue differs. Each build carries a rebuild receipt that
 * scripts/holo-ci/check-compiler-wasm-drift.mjs verifies against the WASM and the source.
 */
export const BUILD_TARGETS = [
  {
    target: 'web',
    outDir: 'pkg',
    schema: 'holoscript.compiler-wasm.pkg-web.rebuild-receipt.v1',
  },
  {
    target: 'nodejs',
    outDir: 'pkg-node',
    schema: 'holoscript.compiler-wasm.pkg-node.rebuild-receipt.v1',
  },
];

/** What the WASM is built from, relative to the crate. */
export const RUST_BUILD_INPUTS = [':(glob)src/**/*.rs', 'Cargo.toml', 'Cargo.lock'];

export function wasmPackCandidates({
  env = process.env,
  home = homedir(),
  platform = process.platform,
} = {}) {
  const executable = platform === 'win32' ? 'wasm-pack.exe' : 'wasm-pack';
  const cargoHome = env.CARGO_HOME || join(home, '.cargo');
  return [
    ...new Set(
      [env.WASM_PACK_BIN, 'wasm-pack', join(cargoHome, 'bin', executable)].filter(Boolean)
    ),
  ];
}

function envWithToolDirectory(env, candidate, platform) {
  if (candidate === 'wasm-pack') return env;
  const pathKey =
    Object.keys(env).find((key) => key.toLowerCase() === 'path') ||
    (platform === 'win32' ? 'Path' : 'PATH');
  return {
    ...env,
    [pathKey]: [dirname(candidate), env[pathKey]].filter(Boolean).join(delimiter),
  };
}

function findWasmPack({ env, home, platform, spawn, cwd }) {
  const shell = platform === 'win32';
  for (const candidate of wasmPackCandidates({ env, home, platform })) {
    const candidateEnv = envWithToolDirectory(env, candidate, platform);
    const probe = spawn(candidate, ['--version'], {
      cwd,
      env: candidateEnv,
      shell,
      stdio: 'ignore',
    });
    if (probe.status === 0) return candidate;
  }
  return null;
}

function validateCommitted({ spawn, cwd, error }) {
  const assertion = spawn(process.execPath, [assertScript], {
    cwd,
    shell: false,
    stdio: 'inherit',
  });
  if (assertion.error) {
    error(assertion.error.message);
    return 1;
  }
  return assertion.status ?? 1;
}

function captured(spawn, command, args, options) {
  const result = spawn(command, args, { ...options, encoding: 'utf8', stdio: 'pipe' });
  return {
    status: result.error ? 1 : (result.status ?? 1),
    stdout: String(result.stdout ?? ''),
  };
}

/** `rustc 1.91.0 (f8297e351 2025-10-28)` -> `1.91.0`; null when the tool does not answer. */
function toolVersion(spawn, command, options) {
  const result = captured(spawn, command, ['--version'], options);
  if (result.status !== 0) return null;
  return result.stdout.match(/\d+\.\d+\.\d+\S*/)?.[0] ?? null;
}

/**
 * Rebuild both targets from the committed Rust source and write each receipt from the file it
 * describes. The receipt names HEAD as its source, so the Rust build inputs must be committed
 * first; the drift gate later checks that HEAD still holds them.
 */
function rebuild({ env, home, platform, spawn, cwd, log, error, fs, now, note }) {
  const shell = platform === 'win32';
  const wasmPack = findWasmPack({ env, home, platform, spawn, cwd });
  if (!wasmPack) {
    error(
      'wasm-pack is needed to rebuild: install it (cargo install wasm-pack) or set WASM_PACK_BIN.'
    );
    return 1;
  }
  const buildEnv = envWithToolDirectory(env, wasmPack, platform);
  const gitOptions = { cwd, env: buildEnv, shell: false };

  const status = captured(
    spawn,
    'git',
    ['status', '--porcelain', '--untracked-files=all', '--', ...RUST_BUILD_INPUTS],
    gitOptions
  );
  if (status.status !== 0) {
    error('git status failed; a rebuild needs a git checkout to name its source commit.');
    return 1;
  }
  const dirty = status.stdout.split(/\r?\n/).filter(Boolean);
  if (dirty.length) {
    error(
      [
        'The Rust build inputs have uncommitted changes, and a receipt names the commit its build',
        'came from. Commit them first, then rebuild:',
        ...dirty.map((line) => `  ${line}`),
      ].join('\n')
    );
    return 1;
  }
  const head = captured(spawn, 'git', ['rev-parse', 'HEAD'], gitOptions);
  const sourceCommit = head.stdout.trim();
  if (head.status !== 0 || !/^[0-9a-f]{40}$/.test(sourceCommit)) {
    error('git rev-parse HEAD did not name a commit.');
    return 1;
  }

  const toolOptions = { cwd, env: buildEnv, shell };
  const toolchain = {
    rustc: toolVersion(spawn, 'rustc', toolOptions),
    cargo: toolVersion(spawn, 'cargo', toolOptions),
    wasmPack: toolVersion(spawn, wasmPack, toolOptions),
  };

  const built = [];
  for (const { target, outDir, schema } of BUILD_TARGETS) {
    const outPath = join(cwd, outDir);
    const receiptPath = join(outPath, 'rebuild-receipt.json');
    const packagePath = join(outPath, 'package.json');
    let previousWasmSha256 = null;
    if (fs.existsSync(receiptPath)) {
      try {
        previousWasmSha256 =
          JSON.parse(fs.readFileSync(receiptPath, 'utf8'))?.result?.wasmSha256 ?? null;
      } catch {
        previousWasmSha256 = null;
      }
    }
    // The committed package metadata is kept; wasm-pack regenerates it from Cargo.toml.
    const committedPackage = fs.existsSync(packagePath) ? fs.readFileSync(packagePath) : null;

    const args = ['build', '--target', target, '--out-dir', outDir, '--release'];
    log(`compiler-wasm: wasm-pack ${args.join(' ')}`);
    const result = spawn(wasmPack, args, { cwd, env: buildEnv, shell, stdio: 'inherit' });
    if (result.error) {
      error(result.error.message);
      return 1;
    }
    if ((result.status ?? 1) !== 0) return result.status ?? 1;

    fs.rmSync(join(outPath, '.gitignore'), { force: true });
    if (committedPackage) fs.writeFileSync(packagePath, committedPackage);

    const wasm = fs.readFileSync(join(outPath, 'holoscript_wasm_bg.wasm'));
    built.push({
      target,
      outDir,
      schema,
      receiptPath,
      previousWasmSha256,
      wasmBytes: wasm.length,
      wasmSha256: createHash('sha256').update(wasm).digest('hex'),
    });
  }

  const digests = new Set(built.map((build) => build.wasmSha256));
  if (digests.size !== 1) {
    error(
      `The targets produced different WASM (${built
        .map((build) => `${build.outDir} ${build.wasmSha256}`)
        .join(', ')}); no receipt was written.`
    );
    return 1;
  }

  const generatedAt = now()
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');
  for (const build of built) {
    const receipt = {
      schema: build.schema,
      generatedAt,
      sourcePath: 'packages/compiler-wasm/src',
      sourceCommit,
      artifactPath: `packages/compiler-wasm/${build.outDir}`,
      commands: [
        `node scripts/build-wasm.mjs --rebuild (wasm-pack build --target ${build.target} --out-dir ${build.outDir} --release)`,
      ],
      toolchain,
      result: {
        rebuilt: true,
        artifactBytesChanged: build.previousWasmSha256 !== build.wasmSha256,
        wasmBytes: build.wasmBytes,
        wasmSha256: build.wasmSha256,
        previousWasmSha256: build.previousWasmSha256,
        repeatBuildSha256Matched: null,
        note: [
          `Written by build-wasm.mjs --rebuild from commit ${sourceCommit}, with no uncommitted Rust build inputs; ${
            built.length
          } targets (${built.map((b) => b.outDir).join(', ')}) hold this WASM.`,
          note,
        ]
          .filter(Boolean)
          .join(' '),
      },
    };
    fs.writeFileSync(build.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  }

  log(
    [
      `compiler-wasm: rebuilt ${built.map((b) => b.outDir).join(' and ')} from ${sourceCommit}`,
      `  wasm sha256 ${built[0].wasmSha256} (${built[0].wasmBytes} bytes)${
        built.every((b) => b.previousWasmSha256 === b.wasmSha256)
          ? ', byte-identical to the last build'
          : ''
      }`,
      '  Commit both builds (the files under pkg/ and pkg-node/, receipts included); the drift gate',
      '  checks each receipt against its WASM and against the Rust source HEAD holds.',
    ].join('\n')
  );
  return 0;
}

/**
 * `node scripts/build-wasm.mjs` (the workspace build) validates the committed builds and never
 * rewrites them: before 2026-09-28 it rebuilt pkg/ whenever wasm-pack was installed, leaving the
 * tracked browser build and its receipt out of step after every workspace build.
 * `node scripts/build-wasm.mjs --rebuild` rebuilds both builds and writes their receipts.
 */
export function runWasmBuild({
  env = process.env,
  home = homedir(),
  platform = process.platform,
  spawn = spawnSync,
  cwd = root,
  log = console.log,
  error = console.error,
  fs = { existsSync, readFileSync, rmSync, writeFileSync },
  now = () => new Date(),
  rebuild: rebuildRequested = false,
  note = null,
} = {}) {
  if (rebuildRequested) {
    return rebuild({ env, home, platform, spawn, cwd, log, error, fs, now, note });
  }
  log(
    'compiler-wasm: validating the committed builds in pkg/ and pkg-node/ (a workspace build does not rewrite them); to rebuild both from this commit: pnpm --filter @holoscript/wasm run rebuild'
  );
  return validateCommitted({ spawn, cwd, error });
}

function parseArgs(argv) {
  const options = { rebuild: false, note: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--rebuild') options.rebuild = true;
    else if (arg === '--note') {
      options.note = argv[index + 1] ?? null;
      index += 1;
    } else {
      throw new Error(`unknown argument ${arg}; use --rebuild [--note "<text>"]`);
    }
  }
  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (parseError) {
    console.error(parseError.message);
    process.exit(2);
  }
  process.exit(runWasmBuild(options));
}
