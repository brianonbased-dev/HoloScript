#!/usr/bin/env node
const { existsSync } = require('node:fs');
const { execSync } = require('node:child_process');
const { join } = require('node:path');

const packageRoot = join(__dirname, '..');
const target = join(packageRoot, 'dist', 'index.js');

if (!existsSync(target)) {
  process.stderr.write('[holoscript-mcp] dist not found; building...\n');
  try {
    execSync('pnpm build', { cwd: packageRoot, stdio: 'inherit' });
  } catch {
    execSync('pnpm exec tsup', { cwd: packageRoot, stdio: 'inherit' });
  }
  process.stderr.write('[holoscript-mcp] build complete\n');
}

require(target);
