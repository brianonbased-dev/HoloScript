#!/usr/bin/env node
import { execSync } from 'node:child_process';

function run(cmd, { tolerateFailure = false, label } = {}) {
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (err) {
    if (tolerateFailure) {
      console.log(`[engine build] ${label ?? cmd} exited non-zero — tolerated.`);
      return;
    }
    process.exit(err.status || 1);
  }
}

run('tsup');
run('tsc -p tsconfig.dts.json', {
  label: 'tsc dts emit',
});
