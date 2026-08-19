#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const trackedGeneratedPrefixes = [
  'examples/oasis/src-tauri/target',
];

const ignoredGeneratedSamples = [
  'examples/oasis/src-tauri/target/.hololand-generated-output-guard',
];

const runGit = (args, options = {}) =>
  execFileSync('git', args, { encoding: 'utf8', ...options });

const fail = (message) => {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
};

const gitignore = readFileSync('.gitignore');
if (gitignore.includes(0)) {
  fail('.gitignore contains NUL bytes; generated-output ignore rules may not be reliable.');
}

for (const prefix of trackedGeneratedPrefixes) {
  const tracked = runGit(['ls-files', '--', prefix])
    .split(/\r?\n/)
    .filter(Boolean);

  if (tracked.length > 0) {
    fail(`${prefix} has ${tracked.length} tracked generated files. Remove them with git rm --cached.`);
    for (const file of tracked.slice(0, 10)) {
      console.error(`  - ${file}`);
    }
  }
}

for (const sample of ignoredGeneratedSamples) {
  try {
    runGit(['check-ignore', '--no-index', '-q', '--', sample], { stdio: 'ignore' });
  } catch {
    fail(`${sample} is not ignored. Ensure target/ stays covered by .gitignore.`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('Generated-output guard passed.');
