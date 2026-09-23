/**
 * SessionStart hook for Claude Code on the web (cloud containers).
 *
 * A cloud session starts from a fresh clone: no node_modules, no dist/. Every
 * other SessionStart hook in settings.json points at C:/Users/Josep/... and
 * cannot run there, so the session could not run `pnpm test` — which
 * CLAUDE.md requires before every commit — until an agent noticed and
 * installed by hand.
 *
 * Remote-only: exits 0 immediately unless CLAUDE_CODE_REMOTE=true, so the
 * desktop surfaces are untouched. Also exits 0 for source "clear"/"compact",
 * which fire inside a container this hook already prepared.
 *
 * Steps (idempotent; the container is snapshotted after the hook completes):
 *   1. `pnpm install --frozen-lockfile` — a session never rewrites the lockfile.
 *      A no-op in seconds when node_modules is already current.
 *   2. Build @holoscript/core WITH its workspace dependencies, once per
 *      container. Core's package entry is ./dist/index.js, so package tests
 *      that import it need the build. `--filter @holoscript/core` alone fails
 *      on a fresh clone: core's public-types check resolves
 *      @holoscript/meaning, whose dist/ does not exist yet.
 *      `@holoscript/core...` builds the dependencies first.
 *
 * Child output goes to a log file, not stdout: SessionStart stdout is injected
 * into the session's context, so it carries only a short summary.
 */
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (process.env.CLAUDE_CODE_REMOTE !== 'true') process.exit(0);

// SessionStart also fires on /clear and on compaction, inside a container this
// hook already prepared. Only startup and resume can land in a fresh one.
if (['clear', 'compact'].includes(readHookInput().source)) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const logPath = join(tmpdir(), 'holoscript-session-start.log');
const coreBuiltMarker = join(root, 'node_modules', '.holoscript-session-start-core-built');

writeFileSync(logPath, '');
const summary = [];

run('install', ['install', '--frozen-lockfile']);

if (existsSync(coreBuiltMarker)) {
  summary.push('@holoscript/core already built in this container (skipped)');
} else {
  run('build @holoscript/core with its workspace deps', [
    '-r',
    '--workspace-concurrency=1',
    '--filter',
    '@holoscript/core...',
    'run',
    '--if-present',
    'build',
  ]);
  writeFileSync(coreBuiltMarker, `${new Date().toISOString()}\n`);
}

console.log(`[session-start] ${summary.join('; ')}. Log: ${logPath}`);

function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function run(label, args) {
  const started = Date.now();
  const fd = openSync(logPath, 'a');
  const result = spawnSync('pnpm', args, { cwd: root, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  const secs = Math.round((Date.now() - started) / 1000);

  if (result.error || result.status !== 0) {
    const why = result.error ? result.error.message : `exit ${result.status}`;
    const tail = readFileSync(logPath, 'utf8').split('\n').slice(-40).join('\n');
    process.stderr.write(`[session-start] ${label} failed (${why}) after ${secs}s. Log: ${logPath}\n${tail}\n`);
    process.exit(1);
  }
  summary.push(`${label} ok in ${secs}s`);
}
