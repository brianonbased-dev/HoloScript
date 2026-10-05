#!/usr/bin/env node
/**
 * Three pre-commit gaps that also exist on main. Release hit them on real
 * Windows while gating #357. This file forces the same conditions on Linux;
 * it does not run Git Bash or Windows.
 *
 * 1. Non-ASCII staged paths. Plain `git diff --cached --name-only` C-quotes
 *    `docs/café-∞.md` as `"docs/caf\303\251-\342\210\236.md"`. check-hardcoded-stats
 *    then drops it ("no markdown files to scan") and a real violation is
 *    committed. The old list command is run as-is so this stays visible.
 *    The hook's own STAGED_MD list must now emit the literal path, and the
 *    stats gate must fail on that file.
 *
 * 2. Git Bash timeout fallback (no `timeout` binary). The killer subshell
 *    `( sleep N; ... ) &` inherits the stdout of `$(run_with_timeout ...)`,
 *    so the capture waits out the full limit. On Linux this test forces that
 *    branch by putting a PATH with no `timeout` first — there is no hook env
 *    override. bash is resolved from PATH, then spawned by absolute path so
 *    the stripped PATH cannot hide the shell. A fast gate must return well
 *    under its limit, a forced timeout must print TIMED OUT and return 124,
 *    and `sleep N` must not be left behind.
 *
 *    On win32 that stripped PATH is not reliable: Git Bash's timeout.exe
 *    lives in /usr/bin next to sleep and mktemp. Those cases SKIP with a
 *    reason. `ps -C` also finds no MSYS sleep, so the orphan checks SKIP
 *    too. A silent pass is not a skip. Set HOLO_PRECOMMIT_TEST_PLATFORM=win32
 *    to print those SKIP lines on any OS. Only this file reads that variable.
 *
 * 3. The language-strata banner must print the seconds passed to
 *    run_with_timeout, not a hardcoded "budget 120s".
 *
 * 4. Gate 5e (Quest golden check) must run gen-quest-mr-templates.mjs --check,
 *    and the check must judge the index, which is what gets committed, not the
 *    working copy (claude3's review of #469). Its lines run in a scratch repo
 *    with real git: a staged logic change without the regenerated file fails;
 *    staged-good plus unstaged-bad passes; staged-bad plus unstaged-good fails;
 *    a bystander's unstaged edit does not block an unrelated commit. Remove the
 *    --check, or point it back at the working copy, and this section goes red.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');
const HOOK = resolve(REPO, '.githooks/pre-commit');
const STATS = resolve(REPO, 'scripts/holo-ci/check-hardcoded-stats.mjs');

const FAST_LIMIT_SECS = 5;
const FAST_LIMIT_MS = FAST_LIMIT_SECS * 1000;
const FAST_WELL_UNDER_MS = 1500;
const SLOW_LIMIT_SECS = 2;

let testsRun = 0;
let testsFailed = 0;
let testsSkipped = 0;

// Test-only. The hook does not read this. win32 prints the SKIP lines.
const PLATFORM = process.env.HOLO_PRECOMMIT_TEST_PLATFORM || process.platform;
const isWin32 = PLATFORM === 'win32';

const WIN32_BASH_SKIP =
  'win32: a PATH that hides timeout.exe is not reliable (Git Bash keeps timeout.exe in /usr/bin beside sleep and mktemp)';
const WIN32_SLEEP_SKIP =
  'win32: ps -C finds no MSYS sleep, so an empty process list would pass without checking';

function assertEq(actual, expected, name, detail = '') {
  testsRun += 1;
  if (actual === expected) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(
      `  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${detail ? ` (${detail})` : ''}`
    );
  }
}

function assertTrue(cond, name, detail = '') {
  testsRun += 1;
  if (cond) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}${detail ? `: ${detail}` : ''}`);
  }
}

function skip(name, reason) {
  testsRun += 1;
  testsSkipped += 1;
  console.log(`  SKIP ${name}: ${reason}`);
}

function withSlashes(text) {
  return String(text).replace(/\\/g, '/');
}

function git(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function pathListInvocations(hook) {
  const lines = hook.split('\n');
  const found = [];
  for (let i = 0; i < lines.length; i += 1) {
    const code = lines[i].replace(/#.*/, '');
    const isNameOnly = /\bgit\b/.test(code) && code.includes('diff') && code.includes('--name-only');
    const isLsFiles = /\bgit\b/.test(code) && /\bls-files\b/.test(code);
    const isNameStatus = /\bgit\b/.test(code) && code.includes('diff') && code.includes('--name-status');
    if (!isNameOnly && !isLsFiles && !isNameStatus) continue;
    let text = code;
    let j = i;
    while (j < lines.length && /\\\s*$/.test(lines[j].replace(/#.*/, ''))) {
      j += 1;
      text += `\n${lines[j].replace(/#.*/, '')}`;
    }
    const kind = isNameOnly ? 'name-only' : isLsFiles ? 'ls-files' : 'name-status';
    found.push({ line: i + 1, text: text.trim(), kind });
    i = j;
  }
  return found;
}

function resolveBash() {
  const found = spawnSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' });
  const resolved = (found.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || '';
  if (found.status !== 0 || !resolved.startsWith('/')) {
    throw new Error(
      `bash was not resolved from PATH (status ${found.status}): ${resolved || found.stderr || found.error || ''}`
    );
  }
  return resolved;
}

function shellVariable(arg) {
  const match =
    arg.match(/^"\$\{([A-Za-z_][A-Za-z0-9_]*)\}"$/) ||
    arg.match(/^"\$([A-Za-z_][A-Za-z0-9_]*)"$/) ||
    arg.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/) ||
    arg.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
  return match ? match[1] : null;
}

function linkTool(bin, name) {
  const candidates = ['/bin', '/usr/bin', '/usr/local/bin'].map((dir) => join(dir, name));
  for (const candidate of candidates) {
    try {
      symlinkSync(candidate, join(bin, name));
      return candidate;
    } catch {
      // try the next directory
    }
  }
  throw new Error(`could not find ${name} to link into the fallback PATH`);
}

function sleepArgs() {
  const listed = spawnSync('ps', ['-C', 'sleep', '-o', 'args='], { encoding: 'utf8' });
  if (listed.error || listed.status === null) return null;
  return (listed.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

console.log('pre-commit-quotepath-timeout.test.mjs');
console.log(
  `  info platform=${PLATFORM}${process.env.HOLO_PRECOMMIT_TEST_PLATFORM ? ' (HOLO_PRECOMMIT_TEST_PLATFORM)' : ''}`
);

const hook = readFileSync(HOOK, 'utf8');

{
  const invocations = pathListInvocations(hook);
  console.log(`  info path list commands in .githooks/pre-commit: ${invocations.length}`);
  for (const invocation of invocations) {
    const oneLine = invocation.text.replace(/\s*\\\n\s*/g, ' ').replace(/\s+/g, ' ');
    console.log(`  info   L${invocation.line} ${invocation.kind}: ${oneLine}`);
  }
  assertTrue(
    invocations.length >= 17,
    'hook lists every name-only diff plus tracked-shadow ls-files and deletion name-status',
    String(invocations.length)
  );
  assertTrue(
    invocations.some((invocation) => invocation.kind === 'ls-files' && invocation.text.includes('ls-files')),
    'tracked-shadow git ls-files is in the quotepath list'
  );
  assertTrue(
    invocations.some((invocation) => invocation.kind === 'name-status' && invocation.text.includes('--name-status')),
    'deletion git diff --name-status is in the quotepath list'
  );
  for (const invocation of invocations) {
    const marker =
      invocation.kind === 'name-only'
        ? '--name-only'
        : invocation.kind === 'ls-files'
          ? 'ls-files'
          : '--name-status';
    assertTrue(
      invocation.text.includes('-c core.quotepath=off') && invocation.text.includes(marker),
      `L${invocation.line} ${invocation.kind} list passes -c core.quotepath=off`,
      invocation.text.replace(/\s+/g, ' ')
    );
  }
}

{
  const rel = 'docs/café-∞.md';
  const root = mkdtempSync(join(tmpdir(), 'quotepath-stats-'));
  const listDir = mkdtempSync(join(tmpdir(), 'quotepath-lists-'));
  try {
    git(root, ['init']);
    git(root, ['config', 'core.quotepath', 'true']);
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, rel), 'This release ships 158 MCP tools.\n');
    git(root, ['add', '--', rel]);

    const old = spawnSync(
      'git',
      ['diff', '--cached', '--name-only', '--diff-filter=ACM', '--', '*.md'],
      { cwd: root, encoding: 'utf8' }
    );
    const oldList = old.stdout || '';
    console.log(`  info old name-only list: ${JSON.stringify(oldList)}`);
    assertEq(old.status, 0, 'old name-only list command exits 0');
    assertTrue(!oldList.split(/\r?\n/).includes(rel), 'old hook list does not emit the literal non-ASCII path', oldList);
    assertTrue(
      oldList.includes('\\') || oldList.includes('"'),
      'old hook list C-quotes the non-ASCII path',
      oldList
    );
    const oldFile = join(listDir, 'old.txt');
    writeFileSync(oldFile, oldList.endsWith('\n') ? oldList : `${oldList}\n`);
    const oldGate = spawnSync(process.execPath, [STATS, '--files-from', oldFile], {
      cwd: root,
      encoding: 'utf8',
    });
    assertEq(oldGate.status, 0, 'old hook list: stats gate does not fail (violation is skipped)');
    assertTrue(
      `${oldGate.stdout || ''}${oldGate.stderr || ''}`.includes('no markdown files to scan'),
      'old hook list: stats gate reports no markdown files',
      `${oldGate.stdout || ''}${oldGate.stderr || ''}`
    );

    const assignment = hook.match(/^STAGED_MD=\$\((.*)\)\s*$/m);
    assertTrue(Boolean(assignment), 'hook assigns STAGED_MD from a list command');
    const listed = assignment
      ? spawnSync('bash', ['-c', assignment[1]], { cwd: root, encoding: 'utf8' })
      : { status: 1, stdout: '', stderr: 'missing' };
    const newList = listed.stdout || '';
    console.log(`  info hook STAGED_MD list: ${JSON.stringify(newList)}`);
    assertEq(listed.status, 0, 'hook STAGED_MD list command exits 0');
    assertTrue(
      withSlashes(newList)
        .split(/\r?\n/)
        .includes(rel),
      'hook list builder emits the literal non-ASCII path',
      newList
    );
    const newFile = join(listDir, 'new.txt');
    writeFileSync(newFile, newList.endsWith('\n') ? newList : `${newList}\n`);
    const seen = spawnSync(process.execPath, [STATS, '--files-from', newFile], {
      cwd: root,
      encoding: 'utf8',
    });
    const seenOut = `${seen.stdout || ''}${seen.stderr || ''}`;
    assertEq(seen.status, 1, 'stats gate fails when the literal non-ASCII path is listed');
    assertTrue(
      withSlashes(seenOut).includes(rel),
      'stats gate names the non-ASCII file',
      seenOut
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(listDir, { recursive: true, force: true });
  }
}

{
  const start = hook.indexOf('run_with_timeout() {');
  const end = hook.indexOf('\n# Large merges');
  assertTrue(start >= 0 && end > start, 'pre-commit defines run_with_timeout before the files-from helper');
  if (isWin32) {
    skip('fallback PATH probe runs', WIN32_BASH_SKIP);
    skip('fallback PATH has no timeout binary', WIN32_BASH_SKIP);
    skip('fallback fast gate returns 0', WIN32_BASH_SKIP);
    skip('fallback fast gate prints its output', WIN32_BASH_SKIP);
    skip('fallback fast gate is not reported as a timeout', WIN32_BASH_SKIP);
    skip(`fallback fast gate returns well under its ${FAST_LIMIT_SECS}s limit`, WIN32_BASH_SKIP);
    skip('fallback fast gate does not leave its sleep running', WIN32_SLEEP_SKIP);
    skip('fallback forced timeout returns 124', WIN32_BASH_SKIP);
    skip('fallback forced timeout prints TIMED OUT with the limit', WIN32_BASH_SKIP);
    skip('fallback forced timeout does not leave its sleep running', WIN32_SLEEP_SKIP);
  } else {
    const fn = start >= 0 && end > start ? hook.slice(start, end) : '';
    const bash = resolveBash();
    console.log(`  info bash resolved from PATH: ${bash}`);
    const bin = mkdtempSync(join(tmpdir(), 'timeout-fallback-path-'));
    const work = mkdtempSync(join(tmpdir(), 'timeout-fallback-work-'));
    try {
      linkTool(bin, 'mktemp');
      linkTool(bin, 'sleep');
      linkTool(bin, 'cat');
      linkTool(bin, 'rm');
      symlinkSync(process.execPath, join(bin, 'node'));
      const probe = spawnSync(bash, ['-c', 'command -v timeout || true'], {
        encoding: 'utf8',
        env: { ...process.env, PATH: bin },
      });
      assertEq(probe.status, 0, 'fallback PATH probe runs');
      assertEq((probe.stdout || '').trim(), '', 'fallback PATH has no timeout binary');

      writeFileSync(join(work, 'check-fast-gate.mjs'), 'console.log("fast-ok");\n');
      writeFileSync(join(work, 'check-slow-gate.mjs'), 'setTimeout(() => {}, 60000);\n');

      const run = (script, limit) => {
        const started = Date.now();
        const result = spawnSync(
          bash,
          [
            '-c',
            `${fn}
run_with_timeout ${limit} node ${script}
`,
          ],
          {
            cwd: work,
            encoding: 'utf8',
            env: { ...process.env, PATH: bin },
          }
        );
        return { ...result, elapsed: Date.now() - started };
      };

      const beforeSleep = sleepArgs();
      const fast = run('check-fast-gate.mjs', FAST_LIMIT_SECS);
      const afterSleep = sleepArgs();
      console.log(
        `  info fallback fast gate: status=${fast.status} elapsed_ms=${fast.elapsed} limit_ms=${FAST_LIMIT_MS}`
      );
      if (fast.stderr) console.log(`  info fallback fast stderr: ${fast.stderr}`);
      if (fast.error) console.log(`  info fallback fast error: ${fast.error.message}`);
      if ((fast.stdout || '').trim()) {
        for (const line of fast.stdout.split('\n')) {
          if (line.trim()) console.log(`  info   ${line}`);
        }
      }
      assertEq(fast.status, 0, 'fallback fast gate returns 0');
      assertTrue((fast.stdout || '').includes('fast-ok'), 'fallback fast gate prints its output', fast.stdout);
      assertTrue(!(fast.stdout || '').includes('TIMED OUT:'), 'fallback fast gate is not reported as a timeout', fast.stdout);
      assertTrue(
        fast.status === 0 && fast.elapsed < FAST_WELL_UNDER_MS,
        `fallback fast gate returns well under its ${FAST_LIMIT_SECS}s limit`,
        `status ${fast.status}, elapsed ${fast.elapsed}ms (limit ${FAST_LIMIT_MS}ms). The old killer held the capture pipe open until sleep finished.`
      );
      assertTrue(beforeSleep !== null && afterSleep !== null, 'ps -C sleep ran', 'ps -C returned nothing usable');
      const leftover =
        afterSleep === null ? ['ps-unavailable'] : afterSleep.filter((args) => args === `sleep ${FAST_LIMIT_SECS}`);
      assertEq(leftover.length, 0, 'fallback fast gate does not leave its sleep running', leftover.join(' | '));

      const slow = run('check-slow-gate.mjs', SLOW_LIMIT_SECS);
      console.log(`  info fallback forced timeout: status=${slow.status} elapsed_ms=${slow.elapsed}`);
      for (const line of (slow.stdout || '').split('\n')) {
        if (line.trim()) console.log(`  info   ${line}`);
      }
      assertEq(slow.status, 124, 'fallback forced timeout returns 124');
      assertTrue(
        (slow.stdout || '').includes(`TIMED OUT: check-slow-gate timed out after ${SLOW_LIMIT_SECS}s.`),
        'fallback forced timeout prints TIMED OUT with the limit',
        slow.stdout
      );
      const slowListed = sleepArgs();
      assertTrue(slowListed !== null, 'ps -C sleep ran after the forced timeout');
      const slowLeft = slowListed === null ? ['ps-unavailable'] : slowListed.filter((args) => args === `sleep ${SLOW_LIMIT_SECS}`);
      assertEq(slowLeft.length, 0, 'fallback forced timeout does not leave its sleep running');
    } finally {
      rmSync(bin, { recursive: true, force: true });
      rmSync(work, { recursive: true, force: true });
    }
  }
}

{
  const call = hook.match(
    /run_with_timeout\s+(\S+)\s+node\s+scripts\/holo-ci\/check-language-strata\.mjs/
  );
  assertTrue(Boolean(call), 'language-strata gate calls run_with_timeout');
  const arg = call ? call[1] : '';
  const name = shellVariable(arg);
  assertTrue(
    Boolean(name),
    'language-strata passes a shell variable to run_with_timeout',
    `argument was ${arg}`
  );
  const banner = hook.split('\n').find((line) => line.includes('Language-strata gate timed out'));
  assertTrue(Boolean(banner), 'language-strata timeout banner exists');
  if (name && banner) {
    const assignment = hook.match(new RegExp(`^${name}=([0-9]+)\\s*$`, 'm'));
    assertTrue(Boolean(assignment), `${name} is assigned a number of seconds`);
    assertEq(assignment ? assignment[1] : '', '120', 'language-strata budget stays 120 seconds');
    assertTrue(
      banner.includes(`\${${name}}`),
      'language-strata banner interpolates the same variable the wrapper receives',
      banner.trim()
    );
    const rendered = spawnSync(
      'bash',
      [
        '-c',
        `RED=''; NC='';
${name}=7
${banner}
`,
      ],
      { encoding: 'utf8' }
    );
    const text = rendered.stdout || '';
    console.log(`  info strata banner with ${name}=7: ${text.trim()}`);
    assertTrue(text.includes('budget 7s'), 'language-strata banner prints the configured seconds', text);
    assertTrue(!text.includes('budget 120s'), 'language-strata banner does not keep a hardcoded 120', text);
  }
}

{
  // 4. Gate 5e runs gen-quest-mr-templates.mjs --check, and the check judges the INDEX, which is
  //    what gets committed, not the working copy (claude3's review of #469). The gate's own lines
  //    run in a scratch repo that holds the generator and its real inputs. Only the golden-diff
  //    that follows the check is stubbed: it needs the whole core source tree.
  const GEN = 'packages/core/scripts/gen-quest-mr-templates.mjs';
  const TEMPLATES = 'packages/core/src/compiler/quest-mr-templates';
  const LOGIC_DIR = 'packages/core/src/compiler/quest-mr-logic';
  const LOGIC = `${LOGIC_DIR}/Locomotion.logic.hs`;
  const OUT = 'packages/core/src/compiler/quest-mr-templates.generated.ts';
  const LIFECYCLE = 'apps/quest-universal-qr-scanner/scanner-lifecycle.hsplus';
  const PKG_NODE = 'packages/compiler-wasm/pkg-node';
  const GOLDEN =
    'QUEST_MR_OUT=$(run_with_timeout 60 npx tsx scripts/holo-ci/check-quest-mr-emit-matches-reference.mts 2>&1)';

  const gateStart = hook.indexOf('# Gate 5e: Quest MR emit golden-diff');
  const gateEnd = hook.indexOf('# Gate 5e-axr:');
  const fnStart = hook.indexOf('run_with_timeout() {');
  const fnEnd = hook.indexOf('\n# Large merges');
  assertTrue(gateStart >= 0 && gateEnd > gateStart, 'pre-commit has Gate 5e before Gate 5e-axr');
  const gate = gateStart >= 0 && gateEnd > gateStart ? hook.slice(gateStart, gateEnd) : '';
  assertTrue(
    /run_with_timeout\s+\d+\s+node\s+"?[^\s"]*gen-quest-mr-templates\.mjs"?\s+--check/.test(gate),
    'Gate 5e runs gen-quest-mr-templates.mjs --check under run_with_timeout'
  );
  assertEq(
    gate.split(GOLDEN).length - 1,
    1,
    'Gate 5e golden-diff command is where this test stubs it'
  );
  const stubbed = gate.replace(GOLDEN, "QUEST_MR_OUT='golden-diff stub'");
  const fn = fnStart >= 0 && fnEnd > fnStart ? hook.slice(fnStart, fnEnd) : '';

  const root = mkdtempSync(join(tmpdir(), 'quest-gate-index-'));
  const noHooks = mkdtempSync(join(tmpdir(), 'quest-gate-nohooks-'));
  const read = (rel) => readFileSync(join(root, rel), 'utf8');
  const write = (rel, text) => writeFileSync(join(root, rel), text);
  const swap = (rel, from, to) => {
    const text = read(rel);
    if (!text.includes(from)) throw new Error(`${rel} no longer contains ${from}`);
    write(rel, text.replace(from, to));
  };
  // Two independent edits that change the compiled Kotlin (a comment or whitespace edit would not).
  const editA = () =>
    swap(LOGIC, 'return yaw + turn * turnSpeed * dt', 'return yaw - turn * turnSpeed * dt');
  const editB = () => swap(LOGIC, 'return component / len', 'return component * len');
  const regenerate = () => {
    const made = spawnSync(process.execPath, [join(root, GEN)], { cwd: root, encoding: 'utf8' });
    if (made.status !== 0) throw new Error(`regenerate failed: ${made.stdout}${made.stderr}`);
  };
  const runGate = () => {
    const ran = spawnSync(
      'bash',
      ['-c', `RED=''; GREEN=''; NC=''; FAILED=0\n${fn}\n${stubbed}\necho "GATE-FAILED=$FAILED"\n`],
      { cwd: root, encoding: 'utf8' }
    );
    const out = `${ran.stdout || ''}${ran.stderr || ''}`;
    const verdict = (out.match(/GATE-FAILED=(\d)/) || [])[1];
    return { failed: verdict === '1', ran: verdict !== undefined, out };
  };
  try {
    const copied = [GEN, TEMPLATES, LOGIC_DIR, OUT, LIFECYCLE, PKG_NODE, '.gitattributes'];
    for (const rel of copied) {
      cpSync(join(REPO, rel), join(root, rel), { recursive: true });
    }
    git(root, ['init', '-q']);
    git(root, ['config', 'core.autocrlf', 'false']);
    git(root, ['config', 'core.hooksPath', noHooks]);
    git(root, ['config', 'commit.gpgsign', 'false']);
    git(root, ['config', 'user.name', 'quest gate test']);
    git(root, ['config', 'user.email', 'quest-gate-test@example.invalid']);
    git(root, ['add', '--', ...copied]);
    git(root, ['commit', '-q', '-m', 'base']);
    const reset = () => git(root, ['reset', '-q', '--hard', 'HEAD']);

    // Control: the committed inputs agree; staging a comment in the generator runs the gate.
    write(GEN, `${read(GEN)}// test-only comment\n`);
    git(root, ['add', '--', GEN]);
    let gateRun = runGate();
    assertTrue(gateRun.ran, 'Gate 5e ran in the scratch repo', gateRun.out);
    assertEq(gateRun.failed, false, 'clean staged state passes Gate 5e', gateRun.out);
    reset();

    // #469: a staged logic change without the regenerated file fails.
    editA();
    git(root, ['add', '--', LOGIC]);
    gateRun = runGate();
    assertEq(
      gateRun.failed,
      true,
      'staged .logic.hs change without the regenerated file fails',
      gateRun.out
    );
    assertTrue(
      gateRun.out.includes('compiled logic Locomotion'),
      'the failure names the stale logic block',
      gateRun.out
    );
    reset();

    // A staged logic change with its regenerated file passes.
    editA();
    regenerate();
    git(root, ['add', '--', LOGIC, OUT]);
    gateRun = runGate();
    assertEq(
      gateRun.failed,
      false,
      'staged .logic.hs change with its regenerated file passes',
      gateRun.out
    );
    reset();

    // Staged-good, unstaged-bad: the commit is consistent; a later edit is left unstaged and not
    // regenerated. Reading the working copy blocked this commit.
    editA();
    regenerate();
    git(root, ['add', '--', LOGIC, OUT]);
    editB();
    gateRun = runGate();
    assertEq(
      gateRun.failed,
      false,
      'staged-good plus unstaged-bad passes (the index is judged)',
      gateRun.out
    );
    reset();

    // Staged-bad, unstaged-good (claude3's case): the regenerated file is staged but the logic edit
    // it came from is not, so the commit pairs new compiled logic with old source. Reading the
    // working copy passed this commit.
    editA();
    regenerate();
    git(root, ['add', '--', OUT]);
    gateRun = runGate();
    assertEq(
      gateRun.failed,
      true,
      'staged-bad plus unstaged-good fails (the index is judged)',
      gateRun.out
    );
    assertTrue(
      gateRun.out.includes(LOGIC),
      'the failure lists the input with unstaged changes',
      gateRun.out
    );
    reset();

    // A bystander's unstaged logic edit does not block an unrelated staged change.
    editA();
    write(GEN, `${read(GEN)}// test-only comment\n`);
    git(root, ['add', '--', GEN]);
    gateRun = runGate();
    assertEq(
      gateRun.failed,
      false,
      "a bystander's unstaged .logic.hs edit does not block an unrelated commit",
      gateRun.out
    );
    reset();
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(noHooks, { recursive: true, force: true });
  }
}
const testsPassed = testsRun - testsFailed - testsSkipped;
if (testsFailed > 0) {
  console.error(`\n${testsPassed} passed, ${testsSkipped} skipped, ${testsFailed} failed (${testsRun} run)`);
  process.exit(1);
}

if (testsSkipped > 0) {
  console.log(`\n${testsPassed} passed, ${testsSkipped} skipped, 0 failed (${testsRun} run)`);
} else {
  console.log(`\n${testsRun}/${testsRun} tests passed`);
}
