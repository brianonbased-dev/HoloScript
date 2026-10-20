/**
 * run-vitest.mjs build preflight (board task_1786984409320_7d3l).
 *
 * On a fresh install the full core suite reported ~588 failures that were not real:
 * core's tests load several workspace packages from their BUILT output, and none was
 * built. The baseline gate turned that into a RED receipt that blocked every push
 * touching packages/core. Now run-vitest.mjs refuses a full-suite run (exit 2) on such a
 * workspace, naming exactly what to build, and the baseline gate passes that reason on
 * without writing a receipt.
 *
 * Every case runs byte-identical COPIES of run-vitest.mjs and the baseline gate, staged
 * in a temp packages/core with no vitest beside them. If the check ever stops refusing,
 * a copy fails at once. Run in place, it would start the real suite instead: that suite
 * contains this file, so the gate case would recurse, and it would overwrite the real
 * receipt.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';

const CORE_DIR = path.resolve(__dirname, '..', '..');

// Keep in sync with REQUIRED_BUILDS in packages/core/run-vitest.mjs: [name, dir, files].
// Case (a) goes red if the runner requires a file this list lacks.
const REQUIRED_BUILDS: Array<[string, string, string[]]> = [
  [
    '@holoscript/core-types',
    'packages/core-types',
    ['dist/index.js', 'dist/ans.js', 'dist/utility.js'],
  ],
  ['@holoscript/llm-provider', 'packages/llm-provider', ['dist/index.js']],
  ['@holoscript/meaning', 'packages/meaning', ['dist/index.js']],
  ['@holoscript/assimp-plugin', 'packages/plugins/assimp-plugin', ['dist/index.mjs']],
  ['@holoscript/mesh', 'packages/mesh', ['dist/index.js']],
  ['@holoscript/engine', 'packages/engine', ['dist/index.js']],
  ['@holoscript/framework', 'packages/framework', ['dist/index.js']],
  ['@holoscript/auth', 'packages/auth', ['dist/index.js']],
  ['@holoscript/openusd-plugin', 'packages/plugins/openusd-plugin', ['dist/index.js']],
];

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** A fake repo root holding every required build output except the packages in `omit`. */
function fakeRepo(omit: string[] = []): string {
  const root = tempDir('core-preflight-repo-');
  for (const [name, dir, files] of REQUIRED_BUILDS) {
    if (omit.includes(name)) continue;
    for (const file of files) {
      const target = path.join(root, dir, file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, '// stand-in for build output\n');
    }
  }
  return root;
}

/** Copies of the runner, the baseline gate and its manifest, in a temp packages/core. */
function stagedCore(): string {
  const core = path.join(tempDir('core-preflight-stage-'), 'packages', 'core');
  mkdirSync(path.join(core, 'scripts'), { recursive: true });
  for (const rel of [
    'run-vitest.mjs',
    'test-baseline.json',
    'scripts/check-core-test-baseline.mjs',
  ]) {
    copyFileSync(path.join(CORE_DIR, rel), path.join(core, rel));
  }
  return core;
}

function run(script: string, args: string[], preflightRoot: string) {
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOLOSCRIPT_PREFLIGHT_ROOT: preflightRoot },
    timeout: 20_000,
  });
  const stderr = r.stderr ?? '';
  return { status: r.status, stderr, output: `${r.stdout ?? ''}\n${stderr}` };
}

/** Package names the refusal line reports. */
function namedAsUnbuilt(stderr: string): string[] {
  const m = stderr.match(/\[run-vitest\] workspace not built: (.+?) (?:has|have) no built output/);
  return m ? m[1].split(', ').sort() : [];
}

/** Package names the suggested build command filters on. */
function filteredInBuildCommand(stderr: string): string[] {
  return [...stderr.matchAll(/--filter "(@holoscript\/[^"]+)\.\.\."/g)].map((m) => m[1]).sort();
}

describe('run-vitest.mjs build preflight (task_1786984409320_7d3l)', () => {
  it('(a) passes a workspace where every required build is present', () => {
    const runner = path.join(stagedCore(), 'run-vitest.mjs');
    const r = run(runner, ['--preflight-only'], fakeRepo());
    expect(r.output).not.toContain('workspace not built');
    expect(r.output).toContain('[run-vitest] workspace built');
    expect(r.status).toBe(0);
  });

  it('(b) refuses when mesh is unbuilt, naming only mesh and the command that builds it', () => {
    const runner = path.join(stagedCore(), 'run-vitest.mjs');
    const r = run(runner, ['--preflight-only'], fakeRepo(['@holoscript/mesh']));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('workspace not built');
    expect(namedAsUnbuilt(r.stderr)).toEqual(['@holoscript/mesh']);
    expect(r.stderr).toContain('--filter "@holoscript/mesh..."');
    expect(filteredInBuildCommand(r.stderr)).toEqual(['@holoscript/mesh']);
  });

  it('(c) names every unbuilt package when several are missing', () => {
    const runner = path.join(stagedCore(), 'run-vitest.mjs');
    const r = run(runner, ['--preflight-only'], fakeRepo(['@holoscript/mesh', '@holoscript/auth']));
    expect(r.status).toBe(2);
    expect(namedAsUnbuilt(r.stderr)).toEqual(['@holoscript/auth', '@holoscript/mesh']);
    expect(filteredInBuildCommand(r.stderr)).toEqual(['@holoscript/auth', '@holoscript/mesh']);
  });

  it('(d) makes the baseline gate stop with that reason and write no receipt', () => {
    const core = stagedCore();
    const gate = path.join(core, 'scripts', 'check-core-test-baseline.mjs');
    const r = run(gate, [], tempDir('core-preflight-empty-'));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('[run-vitest] workspace not built');
    expect(r.stderr).toContain(
      '[baseline-gate] setup error: no suite ran, so no receipt was written.'
    );
    expect(existsSync(path.join(core, '.test-baseline-receipt.json'))).toBe(false);
  });

  it('(e) leaves runs that name a test file alone', () => {
    const runner = path.join(stagedCore(), 'run-vitest.mjs');
    const r = run(runner, ['src/__tests__/any.test.ts'], tempDir('core-preflight-empty-'));
    expect(r.output).not.toContain('workspace not built');
    expect(r.status).not.toBe(2);
  });
});
