#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const checks = [
  {
    label: 'access contract: desktop source',
    args: ['scripts/check-brittney-desktop-source-contract.mjs'],
  },
  {
    label: 'access contract: Brittney access',
    args: ['scripts/check-brittney-access-contract.mjs'],
  },
  {
    label: 'message route: browser terminal coupling',
    args: ['scripts/__tests__/holoshell-browser-terminal-coupling.test.mjs'],
  },
  {
    label: 'first-run doctor: readiness evidence',
    args: ['scripts/holoshell-readiness-evidence.mjs', '--json'],
  },
  {
    label: 'first-run doctor: operator terminal receipt',
    args: ['scripts/holoshell-operator-terminal.mjs', '--agent', '--json'],
  },
];

for (const check of checks) {
  console.log(`\n[holoshell-contract-checks] ${check.label}`);
  const result = spawnSync(process.execPath, check.args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    console.error(`[holoshell-contract-checks] failed to start ${check.label}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[holoshell-contract-checks] ${check.label} failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
}

console.log('\n[holoshell-contract-checks] all serial checks passed');
