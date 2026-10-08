import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  GIT_DIFF_CHUNK_BUDGET,
  addedLineSetsFor,
  chunkPathspecs,
  diffArgvLength,
  parseAddedLines,
} from '../holo-ci/check-hardcoded-stats.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECKER = join(ROOT, 'scripts', 'holo-ci', 'check-hardcoded-stats.mjs');

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'hardcoded-stats-fixture-'));
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  mkdirSync(join(root, 'docs', 'marketing'), { recursive: true });
  return root;
}

function runChecker(root) {
  return spawnSync(process.execPath, [CHECKER, '--all'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
}

describe('check-hardcoded-stats batched staged diff', () => {
  it('spawns git once per chunk, not once per file', () => {
    const rels = [];
    for (let i = 0; i < 1000; i += 1) {
      rels.push(`docs/batch/file-${String(i).padStart(4, '0')}.md`);
    }
    const chunks = chunkPathspecs(rels);
    assert.ok(chunks.length >= 1);
    assert.ok(chunks.length < 20, `expected a handful of chunks, got ${chunks.length}`);
    let calls = 0;
    addedLineSetsFor(rels, (chunk) => {
      calls += 1;
      const len = diffArgvLength(chunk);
      assert.ok(
        len <= GIT_DIFF_CHUNK_BUDGET || chunk.length === 1,
        `chunk command line is ${len} characters`
      );
      return '';
    });
    assert.equal(calls, chunks.length);
    assert.ok(calls < rels.length);
  });

  it('parses spaced, non-ASCII, and C-quoted paths from one diff', () => {
    const diff = [
      'diff --git a/docs/my notes.md b/docs/my notes.md',
      '--- a/docs/my notes.md',
      '+++ b/docs/my notes.md',
      '@@ -1,0 +2 @@ old',
      '+clean addition',
      'diff --git a/docs/café.md b/docs/café.md',
      '--- a/docs/café.md',
      '+++ b/docs/café.md',
      '@@ -3,0 +4 @@',
      '+This release ships 158 MCP tools.',
      String.raw`diff --git "a/docs/caf\303\251.md" "b/docs/caf\303\251 quoted.md"`,
      String.raw`+++ "b/docs/caf\303\251 quoted.md"`,
      '@@ -0,0 +1 @@',
      '+x',
    ].join('\n');
    const parsed = parseAddedLines(diff);
    assert.deepEqual([...parsed.get('docs/my notes.md')], [2]);
    assert.deepEqual([...parsed.get('docs/café.md')], [4]);
    assert.deepEqual([...parsed.get('docs/café quoted.md')], [1]);
  });

  it('checks 1000 staged markdown files in one batched diff, inside the 20s hook limit', () => {
    const root = mkdtempSync(join(tmpdir(), 'stats-batch-'));
    const log = join(root, 'spawns.log');
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'stats-test@example.com'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'stats-test'], { cwd: root });
    mkdirSync(join(root, 'docs'));
    const rels = [];
    for (let i = 0; i < 997; i += 1) {
      const rel = `docs/file-${String(i).padStart(4, '0')}.md`;
      rels.push(rel);
      writeFileSync(join(root, rel), 'Hello.\n');
    }
    // Committed counts must stay invisible when the staged edit does not touch them.
    rels.push('docs/my notes.md', 'docs/café.md', 'docs/added café.md');
    writeFileSync(join(root, 'docs', 'my notes.md'), 'Historical note: 158 MCP tools.\n');
    writeFileSync(join(root, 'docs', 'café.md'), 'Historical note: 44 compilers.\n');
    writeFileSync(join(root, 'docs', 'added café.md'), 'Hello.\n');
    execFileSync('git', ['add', '--', 'docs'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'base', '--quiet'], { cwd: root, stdio: 'ignore' });
    writeFileSync(
      join(root, 'docs', 'my notes.md'),
      'Historical note: 158 MCP tools.\nHello again.\n'
    );
    writeFileSync(join(root, 'docs', 'café.md'), 'Historical note: 44 compilers.\nHello again.\n');
    writeFileSync(
      join(root, 'docs', 'added café.md'),
      'Hello.\nThis release ships 158 MCP tools.\n'
    );
    execFileSync('git', ['add', '--', 'docs/my notes.md', 'docs/café.md', 'docs/added café.md'], {
      cwd: root,
      stdio: 'ignore',
    });
    const list = join(root, 'list.txt');
    writeFileSync(list, `${rels.join('\n')}\n`);
    writeFileSync(log, '');
    const started = Date.now();
    const result = spawnSync(process.execPath, [CHECKER, '--files-from', list], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, HOLO_STATS_GIT_SPAWN_LOG: log },
    });
    const ms = Date.now() - started;
    const spawnLines = readFileSync(log, 'utf8').split('\n').filter(Boolean);
    const spawns = spawnLines.length;
    const maxCmd = spawnLines.reduce((max, line) => Math.max(max, Number(line)), 0);
    console.log(
      `  info 1000 staged markdown files: ${spawns} git spawn(s), longest command ${maxCmd} chars, ${ms}ms`
    );
    assert.equal(result.status, 1);
    const out = `${result.stdout || ''}${result.stderr || ''}`.replace(/\\/g, '/');
    assert.match(out, /docs\/added café\.md/);
    assert.doesNotMatch(out, /docs\/my notes\.md/);
    assert.doesNotMatch(out, /docs\/café\.md:\d/);
    assert.ok(spawns < 20, `spawned git ${spawns} times`);
    assert.ok(spawns < rels.length);
    assert.ok(maxCmd <= GIT_DIFF_CHUNK_BUDGET);
    assert.ok(ms < 20000, `checker took ${ms}ms, hook limit is 20000ms`);
  });
});

describe('check-hardcoded-stats historical exemptions', () => {
  it('still fails active docs with mutable ecosystem counts', () => {
    const root = makeFixture();
    writeFileSync(join(root, 'docs', 'active.md'), 'HoloScript has 3,300 traits today.\n');

    const result = runChecker(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /docs[\\/]active\.md/u);
  });

  it('allows archived marketing and changelog point-in-time counts', () => {
    const root = makeFixture();
    writeFileSync(
      join(root, 'docs', 'marketing', 'SOCIAL_POSTS.md'),
      '> **ARCHIVED — Stale as of 2026-04-29.**\n\nOld copy with 3,300 traits.\n'
    );
    writeFileSync(join(root, 'CHANGELOG.md'), 'Historical release note: 18 domain plugins.\n');

    const result = runChecker(root);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /check:hardcoded-stats/u);
  });
});
