import { spawnSync } from 'node:child_process';

const spawnOptions = {
  shell: process.platform === 'win32',
  stdio: 'inherit',
};

const probe = spawnSync('wasm-pack', ['--version'], {
  shell: process.platform === 'win32',
  stdio: 'ignore',
});

if (probe.status !== 0) {
  console.log('wasm-pack not installed, skipping WASM build');
  process.exit(0);
}

const result = spawnSync(
  'wasm-pack',
  ['build', '--target', 'web', '--out-dir', 'pkg'],
  spawnOptions
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
