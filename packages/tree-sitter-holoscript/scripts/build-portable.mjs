import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

import { runNativeInstall } from './install-native-optional.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const packageRoot = join(__dirname, '..');
const isWindows = process.platform === 'win32';
const treeSitterPackageJson = require.resolve('tree-sitter-cli/package.json');
const treeSitterBin = join(
  dirname(treeSitterPackageJson),
  isWindows ? 'tree-sitter.exe' : 'tree-sitter'
);

function run(command, args, { cwd = packageRoot, spawn = spawnSync } = {}) {
  const result = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    shell: isWindows && command.endsWith('.cmd'),
  });

  if (result.error) {
    console.error(result.error.message);
    return 1;
  }

  return result.status ?? 1;
}

export function generatePortableParser({
  cwd = packageRoot,
  parserPath = join(cwd, 'src', 'parser.c'),
  command = treeSitterBin,
  spawn = spawnSync,
  exists = existsSync,
  warn = console.warn,
  error = console.error,
} = {}) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const status = run(command, ['generate'], { cwd, spawn });
    if (status === 0) return 0;
    if (attempt === 1) {
      warn(`tree-sitter generate failed with exit code ${status}; retrying once`);
      continue;
    }
    if (exists(parserPath)) {
      warn(
        `tree-sitter generate failed after retry (exit ${status}); using committed ` +
          'src/parser.c as the portable grammar artifact'
      );
      return 0;
    }
    error(
      `tree-sitter generate failed after retry with exit code ${status} and no committed ` +
        'src/parser.c is available'
    );
    return status;
  }
  return 1;
}

export function runPortableBuild({
  env = process.env,
  cwd = packageRoot,
  spawn = spawnSync,
  exists = existsSync,
  warn = console.warn,
  error = console.error,
  nativeInstall = runNativeInstall,
} = {}) {
  const parserStatus = generatePortableParser({ cwd, spawn, exists, warn, error });
  if (parserStatus !== 0) return parserStatus;

  return nativeInstall({ env, cwd, spawn, warn });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(runPortableBuild());
}
