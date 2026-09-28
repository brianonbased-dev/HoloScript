#!/usr/bin/env node
/**
 * Legal npm ship entrypoint. `corepack pnpm release:publish` runs this file.
 *
 * The gate chain below is the same sequence the root script used to inline,
 * plus the allowlist hold immediately before `changeset publish`. There is no
 * flag that skips a gate. Raw `pnpm publish`, `npm publish`, and
 * `pnpm changeset:publish` stay blocked in package.json.
 *
 * Allowlist (optional):
 *   RELEASE_PUBLISH_ALLOWLIST=@holoscript/llm-provider corepack pnpm release:publish
 *   corepack pnpm release:publish --packages=@holoscript/llm-provider
 *
 * Unset allowlist: full-fleet `changeset publish` after the gates.
 * Empty allowlist: fail closed, before the gates.
 */

import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  combineAllowlist,
  prepareFilteredPublish,
  restoreSnapshots,
  splitPackageList,
} from './release-publish-allowlist.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const PRE_PUBLISH_ARGS = [
  ['scripts/holo-ci/check-package-stewardship.mjs'],
  ['scripts/holo-ci/build-package-release-closure.mjs'],
  ['scripts/holo-ci/check-npm-v1-release-readiness.mjs', '--require-built'],
  ['scripts/release-guard.js'],
  ['scripts/cold-repro-onramp.mjs', '--local', 'packages/core'],
  ['scripts/audit-published-install-tree.mjs', '@holoscript/cli@latest', '--multi-major=warn'],
];

export const POST_PUBLISH_ARGS = [
  [
    'scripts/holo-ci/check-registry-cold-start.mjs',
    '--package',
    '@holoscript/core@latest',
    '--probe',
    'core-holo-webgpu',
    '--json',
  ],
  [
    'scripts/holo-ci/check-registry-cold-start.mjs',
    '--package',
    '@holoscript/mcp-server@latest',
    '--probe',
    'mcp-server-sizing',
    '--json',
  ],
  ['scripts/audit-published-install-tree.mjs', '@holoscript/cli@latest'],
  ['scripts/cold-repro-onramp.mjs', '--published'],
];

export function changesetBin(rootDir) {
  const name = process.platform === 'win32' ? 'changeset.cmd' : 'changeset';
  return resolve(rootDir, 'node_modules', '.bin', name);
}

export function parseReleasePublishArgs(argv) {
  const args = argv.slice(2);
  const packageParts = [];
  let sawPackages = false;
  const changesetArgs = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--packages' || arg.startsWith('--packages=')) {
      sawPackages = true;
      const value = arg.startsWith('--packages=') ? arg.slice('--packages='.length) : args[(i += 1)];
      if (value == null || value.startsWith('--')) {
        return { error: '--packages requires a comma-separated package list' };
      }
      packageParts.push(...splitPackageList(value));
      continue;
    }
    if (arg === '--otp' || arg.startsWith('--otp=')) {
      const value = arg.startsWith('--otp=') ? arg.slice('--otp='.length) : args[(i += 1)];
      if (!value || value.startsWith('--')) return { error: '--otp requires a value' };
      changesetArgs.push('--otp', value);
      continue;
    }
    if (arg === '--tag' || arg.startsWith('--tag=')) {
      const value = arg.startsWith('--tag=') ? arg.slice('--tag='.length) : args[(i += 1)];
      if (!value || value.startsWith('--')) return { error: '--tag requires a value' };
      changesetArgs.push('--tag', value);
      continue;
    }
    return {
      error: `Unknown argument ${arg}. release:publish cannot skip gates. Set RELEASE_PUBLISH_ALLOWLIST or pass --packages.`,
    };
  }
  return {
    packageFlag: sawPackages ? packageParts : null,
    changesetArgs,
  };
}

function printHelp() {
  console.log(`Legal npm publish for this repo.

  corepack pnpm release:publish
  RELEASE_PUBLISH_ALLOWLIST=@holoscript/llm-provider corepack pnpm release:publish
  corepack pnpm release:publish --packages=@holoscript/llm-provider

No allowlist: full-fleet changeset publish after the release gates.
With an allowlist: the same gates, then changeset publish of only those
packages. Other unpublished tips are version-snapshotted to the copy already
on npm for the duration of publish, then restored.
Empty allowlist fails closed.
`);
}

function defaultRunStep(rootDir, cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32' && cmd.endsWith('.cmd'),
  });
  if (result.error) {
    console.error(`[release-publish] failed to start ${cmd}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

export async function runReleasePublish({
  argv = process.argv,
  env = process.env,
  rootDir = ROOT,
  runStep = (cmd, args) => defaultRunStep(rootDir, cmd, args),
  prepare = prepareFilteredPublish,
  restore = restoreSnapshots,
} = {}) {
  const parsed = parseReleasePublishArgs(argv);
  if (parsed.help) {
    printHelp();
    return 0;
  }
  if (parsed.error) {
    console.error(`[release-publish] ${parsed.error}`);
    return 1;
  }
  const combined = combineAllowlist(env, parsed.packageFlag);
  if (combined.error) {
    console.error(`[release-publish] ${combined.error}`);
    return 1;
  }

  if (combined.allowlist == null) {
    console.log('[release-publish] mode=full-fleet (RELEASE_PUBLISH_ALLOWLIST unset)');
  } else {
    console.log(`[release-publish] mode=allowlist ${combined.allowlist.join(',')}`);
  }

  for (const args of PRE_PUBLISH_ARGS) {
    const code = runStep(process.execPath, args);
    if (code !== 0) return code ?? 1;
  }

  let snapshots = [];
  let receiptPath = null;
  let publishCode = 0;
  try {
    const prepared = await prepare({
      rootDir,
      allowlist: combined.allowlist,
    });
    if (!prepared.ok) {
      console.error(`[release-publish] ${prepared.message || prepared.code || 'allowlist gate failed'}`);
      publishCode = 1;
    } else {
      snapshots = prepared.snapshots || [];
      receiptPath = prepared.receiptPath || null;
      if (prepared.publishSet) {
        console.log(`[release-publish] publish set: ${prepared.publishSet.join(', ')}`);
      }
      publishCode = runStep(changesetBin(rootDir), ['publish', ...(parsed.changesetArgs || [])]);
    }
  } finally {
    try {
      restore(snapshots);
      if (receiptPath) rmSync(receiptPath, { force: true });
      if (snapshots.length > 0) {
        console.log('[release-publish] restored held package.json versions');
      }
    } catch (error) {
      console.error(
        `[release-publish] FAILED to restore held package.json versions${receiptPath ? ` (receipt ${receiptPath})` : ''}: ${error instanceof Error ? error.message : error}`
      );
      publishCode = publishCode || 1;
    }
  }

  if (publishCode !== 0) return publishCode ?? 1;

  for (const args of POST_PUBLISH_ARGS) {
    const code = runStep(process.execPath, args);
    if (code !== 0) return code ?? 1;
  }
  return 0;
}

function invokedAsMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (invokedAsMain()) {
  runReleasePublish()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`[release-publish] ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    });
}
