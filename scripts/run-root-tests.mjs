#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolvePnpm();

const workspacePackages = listWorkspacePackages();
const testPackages = workspacePackages.filter(pkg => {
  if (path.resolve(pkg.path) === repoRoot || pkg.name === 'holoscript') {
    return false;
  }

  const manifest = readManifest(pkg.path);
  pkg.manifest = manifest;
  return Boolean(manifest.scripts?.test);
});

console.log(`[root-test] Running ${testPackages.length} workspace test scripts sequentially.`);

for (const pkg of testPackages) {
  const label = pkg.manifest.name ?? pkg.name ?? path.basename(pkg.path);
  console.log(`\n[root-test] ${label}`);
  console.log(`> ${pkg.manifest.scripts.test}\n`);

  const result = spawnSync(pnpm.command, [...pnpm.args, '--dir', pkg.path, 'run', 'test'], {
    cwd: repoRoot,
    env: process.env,
    shell: false,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`[root-test] ${label} failed to start: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    const detail = result.signal ? `signal ${result.signal}` : `exit ${result.status}`;
    console.error(`[root-test] ${label} failed with ${detail}.`);
    process.exit(typeof result.status === 'number' ? result.status : 1);
  }
}

console.log(`\n[root-test] PASS ${testPackages.length} workspace test scripts.`);

function listWorkspacePackages() {
  const result = spawnSync(
    pnpm.command,
    [...pnpm.args, '-r', '--filter=!holoscript', '--depth', '-1', 'list', '--json'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: false,
    }
  );

  if (result.error) {
    console.error(`[root-test] Failed to list workspace packages: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    console.error(`[root-test] pnpm workspace listing failed with exit ${result.status}.`);
    process.exit(result.status ?? 1);
  }

  return JSON.parse(result.stdout);
}

function readManifest(packageDir) {
  return JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
}

function resolvePnpm() {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && /pnpm/i.test(path.basename(npmExecPath))) {
    return { command: process.execPath, args: [npmExecPath] };
  }

  return { command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args: [] };
}
