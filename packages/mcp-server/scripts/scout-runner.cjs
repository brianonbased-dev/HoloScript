#!/usr/bin/env node

/**
 * PM2-safe Scout launcher.
 *
 * Why this exists:
 * - Avoids fragile `pm2 start "npx tsx ..."` shell parsing on Windows.
 * - Resolves the local `tsx` CLI directly and launches Scout via Node.
 */

const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SCOUT_ENTRY = path.join(ROOT, 'packages', 'mcp-server', 'scripts', 'local-worker.ts');

function resolveTsxCli() {
  try {
    return require.resolve('tsx/dist/cli.mjs', { paths: [ROOT, __dirname] });
  } catch {
    return null;
  }
}

const tsxCli = resolveTsxCli();
if (!tsxCli) {
  console.error('[scout-runner] Unable to resolve tsx CLI. Run `pnpm install` first.');
  process.exit(1);
}

const child = spawn(process.execPath, [tsxCli, SCOUT_ENTRY], {
  cwd: ROOT,
  env: process.env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[scout-runner] Scout exited via signal: ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  console.error('[scout-runner] Failed to start Scout:', err);
  process.exit(1);
});

function forwardSignal(sig) {
  if (child && !child.killed) {
    child.kill(sig);
  }
}

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));
