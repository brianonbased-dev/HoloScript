import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJsonPath = require.resolve('tree-sitter-cli/package.json');
const packageDir = dirname(packageJsonPath);
const executableName = process.platform === 'win32' ? 'tree-sitter.exe' : 'tree-sitter';
const executablePath = join(packageDir, executableName);

if (existsSync(executablePath)) {
  process.exit(0);
}

console.log(`tree-sitter-cli binary missing at ${executablePath}; running package installer`);

const installResult = spawnSync(process.execPath, [join(packageDir, 'install.js')], {
  cwd: packageDir,
  stdio: 'inherit',
});

if (installResult.error) {
  console.error(installResult.error.message);
  process.exit(1);
}

if (installResult.status !== 0 || !existsSync(executablePath)) {
  console.error(`tree-sitter-cli installer did not create ${executablePath}`);
  process.exit(installResult.status ?? 1);
}
