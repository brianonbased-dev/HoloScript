#!/usr/bin/env node
/**
 * Builds the package closure required by the npm/PyPI consumption gates.
 *
 * This is intentionally separate from publishing. It turns a fresh checkout into
 * a release-gate-ready checkout by building the foundation packages before the
 * public candidate packages that import their generated dist artifacts.
 */

import { spawnSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const SELF_TEST = args.has('--self-test');

const PHASES = [
  {
    id: 'type-provider-foundation',
    filters: [
      '@holoscript/core-types',
      '@holoscript/llm-provider',
      '@holoscript/agent-protocol',
      '@holoscript/uaal',
    ],
  },
  {
    id: 'engine-foundation',
    filters: ['@holoscript/holoembed', '@holoscript/snn-webgpu'],
  },
  {
    id: 'engine',
    filters: ['@holoscript/engine'],
  },
  {
    id: 'release-candidates',
    filters: [
      '@holoscript/core',
      '@holoscript/cli',
      '@holoscript/mcp-server',
      '@holoscript/memory',
      '@holoscript/agent-runtime',
      '@holoscript/holollama',
      '@holoscript/platform',
      '@holoscript/domain-plugin-template',
      '@holoscript/holoscript-agent',
      '@holoscript/xr-embodiment',
    ],
  },
];

function pnpmArgsForPhase(phase) {
  const out = [];
  for (const filter of phase.filters) {
    out.push('--filter', filter);
  }
  out.push('run', 'build');
  return out;
}

function commandForPhase(phase) {
  return ['corepack', 'pnpm', ...pnpmArgsForPhase(phase)].join(' ');
}

function runPnpm(args) {
  const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'corepack';
  const commandArgs =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', ['corepack', 'pnpm', ...args].join(' ')]
      : ['pnpm', ...args];

  return spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });
}

function assertPlan() {
  const seen = new Set();
  for (const phase of PHASES) {
    if (!phase.id) throw new Error('Every phase needs an id.');
    if (!Array.isArray(phase.filters) || phase.filters.length === 0) {
      throw new Error(`Phase ${phase.id} has no filters.`);
    }
    for (const filter of phase.filters) {
      if (!filter.startsWith('@holoscript/')) {
        throw new Error(`Unexpected release-closure filter: ${filter}`);
      }
      if (seen.has(filter)) {
        throw new Error(`Duplicate release-closure filter: ${filter}`);
      }
      seen.add(filter);
    }
  }

  for (const required of [
    '@holoscript/core-types',
    '@holoscript/holoembed',
    '@holoscript/snn-webgpu',
    '@holoscript/engine',
    '@holoscript/core',
    '@holoscript/cli',
    '@holoscript/mcp-server',
    '@holoscript/memory',
    '@holoscript/agent-runtime',
    '@holoscript/holollama',
    '@holoscript/platform',
    '@holoscript/domain-plugin-template',
    '@holoscript/holoscript-agent',
    '@holoscript/xr-embodiment',
  ]) {
    if (!seen.has(required)) {
      throw new Error(`Release closure omitted ${required}`);
    }
  }
}

function main() {
  assertPlan();

  console.log('[package-release-closure] Build plan:');
  for (const [index, phase] of PHASES.entries()) {
    console.log(`  ${index + 1}. ${phase.id}: ${phase.filters.join(', ')}`);
    if (DRY_RUN || SELF_TEST) {
      console.log(`     ${commandForPhase(phase)}`);
    }
  }

  if (DRY_RUN || SELF_TEST) {
    console.log('[package-release-closure] PASS: plan is valid.');
    return;
  }

  for (const phase of PHASES) {
    console.log(`[package-release-closure] Building ${phase.id}...`);
    const result = runPnpm(pnpmArgsForPhase(phase));
    if (result.status !== 0) {
      const code = result.status ?? 1;
      console.error(`[package-release-closure] FAIL: ${phase.id} exited with ${code}`);
      process.exit(code);
    }
  }

  console.log('[package-release-closure] PASS: package release closure built.');
}

main();
