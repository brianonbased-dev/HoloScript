import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assertScript = join(root, 'scripts', 'assert-wasm-package.mjs');

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

export function runWasmBuild({
  env = process.env,
  home = homedir(),
  platform = process.platform,
  spawn = spawnSync,
  cwd = root,
  log = console.log,
  error = console.error,
  remove = rmSync,
} = {}) {
  const shell = platform === 'win32';
  let wasmPack = null;

  for (const candidate of wasmPackCandidates({ env, home, platform })) {
    const candidateEnv = envWithToolDirectory(env, candidate, platform);
    const probe = spawn(candidate, ['--version'], {
      cwd,
      env: candidateEnv,
      shell,
      stdio: 'ignore',
    });
    if (probe.status === 0) {
      wasmPack = candidate;
      break;
    }
  }

  if (!wasmPack) {
    log('wasm-pack unavailable; validating the committed browser-WASM package artifacts');
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

  const buildEnv = envWithToolDirectory(env, wasmPack, platform);
  const result = spawn(
    wasmPack,
    ['build', '--target', 'web', '--out-dir', 'pkg', '--release'],
    {
      cwd,
      env: buildEnv,
      shell,
      stdio: 'inherit',
    }
  );

  if (result.error) {
    error(result.error.message);
    return 1;
  }

  const status = result.status ?? 1;
  if (status === 0) {
    remove(join(cwd, 'pkg', '.gitignore'), { force: true });
  }
  return status;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(runWasmBuild());
}
