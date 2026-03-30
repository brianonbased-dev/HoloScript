#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const skipTests = args.has('--skip-tests');
const summaryOnly = args.has('--summary-only');

function run(label, command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });
  return {
    label,
    ok: (result.status ?? 1) === 0,
    code: result.status ?? 1,
    out: `${result.stdout || ''}${result.stderr || ''}`.trim(),
  };
}

const checks = [
  () => run('Version policy', 'node', ['scripts/check-version-policy.js', '--strict']),
  () => run('Workspace protocol deps', 'node', ['scripts/check-workspace-deps.js']),
];

if (!skipTests && !summaryOnly) {
  checks.push(() =>
    run('Daemon integration tests', 'pnpm', [
      '--filter',
      '@holoscript/core',
      'exec',
      'vitest',
      'run',
      '--no-color',
      'src/cli/__tests__/holoscript-runner.daemon.test.ts',
      'src/cli/__tests__/holoscript-daemon-integration.test.ts',
    ])
  );
}

const results = checks.map((fn) => fn());
const failed = results.filter((r) => !r.ok);

console.log('Repository Health Summary');
for (const r of results) {
  console.log(`- ${r.label}: ${r.ok ? 'PASS' : 'FAIL'} (exit ${r.code})`);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [];
  lines.push('## Repository Health');
  lines.push('');
  lines.push('| Check | Status | Exit |');
  lines.push('|---|---|---|');
  for (const r of results) {
    lines.push(`| ${r.label} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.code} |`);
  }
  lines.push('');
  if (failed.length > 0) {
    lines.push(`Failed checks: ${failed.map((f) => f.label).join(', ')}`);
  }
  require('fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

if (failed.length > 0) {
  if (!summaryOnly) {
    for (const f of failed) {
      console.error(`\n--- ${f.label} output ---\n${f.out}\n`);
    }
  }
  process.exit(1);
}

process.exit(0);
