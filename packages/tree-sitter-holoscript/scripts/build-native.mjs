import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const packageRoot = join(__dirname, '..');
const buildDir = join(packageRoot, 'build');
const isWindows = process.platform === 'win32';
const treeSitterPackageJson = require.resolve('tree-sitter-cli/package.json');
const treeSitterBin = join(
  dirname(treeSitterPackageJson),
  isWindows ? 'tree-sitter.exe' : 'tree-sitter'
);
const nodeGypBin = require.resolve('node-gyp/bin/node-gyp.js');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    stdio: 'inherit',
    shell: isWindows && command.endsWith('.cmd'),
  });

  if (result.error) {
    console.error(result.error.message);
    return 1;
  }

  return result.status ?? 1;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function cleanBuildDir(label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      rmSync(buildDir, { recursive: true, force: true });
      return;
    } catch (err) {
      if (attempt === 3) {
        console.error(`${label}: unable to remove ${buildDir}: ${err.message}`);
        process.exit(1);
      }
      sleep(250 * attempt);
    }
  }
}

function retryStep(label, command, args) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const status = run(command, args);
    if (status === 0) {
      return;
    }

    if (attempt === 2) {
      console.error(`${label} failed after retry with exit code ${status}`);
      process.exit(status);
    }

    console.warn(`${label} failed with exit code ${status}; retrying once`);
  }
}

function runNodeGyp() {
  cleanBuildDir('node-gyp preflight');

  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt > 1) {
      console.warn(`node-gyp failed; removing generated build cache at ${buildDir}`);
      cleanBuildDir('node-gyp retry cleanup');
    }

    const configureStatus = run(process.execPath, [nodeGypBin, 'configure']);
    if (configureStatus !== 0) {
      if (attempt === 2) {
        process.exit(configureStatus);
      }
      continue;
    }

    const buildStatus = run(process.execPath, [nodeGypBin, 'build']);
    if (buildStatus === 0) {
      return;
    }

    if (attempt === 2) {
      process.exit(buildStatus);
    }
  }
}

retryStep('ensure-tree-sitter-cli', process.execPath, ['scripts/ensure-tree-sitter-cli.mjs']);
retryStep('tree-sitter generate', treeSitterBin, ['generate']);
runNodeGyp();
