import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const packageRoot = join(__dirname, '..');

export function isStrictNativeInstall(env = process.env) {
  return (
    env.TREE_SITTER_HOLOSCRIPT_STRICT_NATIVE === '1' ||
    env.npm_config_tree_sitter_holoscript_strict_native === 'true'
  );
}

export function resolveNodeGypBin(env = process.env) {
  if (env.npm_config_node_gyp) return env.npm_config_node_gyp;
  try {
    return require.resolve('node-gyp/bin/node-gyp.js');
  } catch {
    return null;
  }
}

export function runNativeInstall({
  env = process.env,
  cwd = packageRoot,
  spawn = spawnSync,
  warn = console.warn,
} = {}) {
  const strict = isStrictNativeInstall(env);
  const nodeGypBin = resolveNodeGypBin(env);

  if (!nodeGypBin) {
    warn(
      '[tree-sitter-holoscript] node-gyp is unavailable during install; ' +
        'native binding will be skipped and WASM fallback remains available.'
    );
    return strict ? 1 : 0;
  }

  const result = spawn(process.execPath, [nodeGypBin, 'rebuild'], {
    cwd,
    stdio: 'inherit',
    env,
  });
  const status = result.status ?? (result.error ? 1 : 0);

  if (status === 0) return 0;

  warn(
    `[tree-sitter-holoscript] optional native binding build failed during install ` +
      `(exit ${status}); WASM fallback remains available. ` +
      `Run \`pnpm --filter tree-sitter-holoscript run build:native\` for a strict native build.`
  );
  return strict ? status : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(runNativeInstall());
}
