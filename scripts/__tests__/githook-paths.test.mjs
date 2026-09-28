#!/usr/bin/env node
/**
 * Which paths the git hooks judge, and how they hand them to their gates.
 * (Was pre-commit-files-from.test.mjs; renamed 2026-09-28 when the pre-push
 * section at the end joined it, rather than adding a new test file.)
 *
 * PRE-COMMIT. Staged-path passing must stay under Windows' 32,767-character
 * CreateProcess limit.
 *
 * The old hook passed every staged path as one `--files` argument. A merge
 * with hundreds of paths then died with "Argument list too long" before either
 * checker ran. Linux ARG_MAX is much higher (often ~2MB), so this test does
 * not wait for the OS to reject the spawn. It measures the command line the
 * hook would pass. On the old hook that string includes `--files` plus the
 * whole path list and is over 32,767; after the fix the hook passes
 * `--files-from <tempfile>` and the measured argv stays under the limit.
 *
 * The violation fixtures below are split so this file itself does not contain
 * a legacy bridge import or the raw orchestrator host (both gates scan
 * scripts/ when those paths are staged).
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');
const HOOK = resolve(REPO, '.githooks/pre-commit');
const APEX = resolve(REPO, 'scripts/holo-ci/check-apex-poison-retired.mjs');
const ORCH = resolve(REPO, 'scripts/holo-ci/check-orchestrator-fetch-canonical.mjs');

/** CreateProcess lpCommandLine limit on Windows. */
const WINDOWS_CMDLINE_LIMIT = 32767;

const GATES = [
  {
    name: 'apex-poison',
    script: 'scripts/holo-ci/check-apex-poison-retired.mjs',
  },
  {
    name: 'orchestrator-fetch',
    script: 'scripts/holo-ci/check-orchestrator-fetch-canonical.mjs',
  },
];

let testsRun = 0;
let testsFailed = 0;

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(
      `  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
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

function legacyBridgeViolation() {
  return ['import { R3F', "Compiler } from '@holoscript/core';\n"].join('');
}

function orchestratorViolation() {
  const host = ['mcp-orchestrator-production-', '45f9'].join('');
  return `export const url = 'https://${host}.example';\n`;
}

/** ~1000 long paths, including spaces, whose joined form exceeds the Windows limit. */
function syntheticStagedPaths(count = 1000) {
  const paths = [];
  for (let i = 0; i < count; i += 1) {
    const n = String(i).padStart(4, '0');
    paths.push(`packages/app/src/merge batch/${'segment-'.repeat(6)}file-${n}.ts`);
  }
  return paths;
}

function legacyFilesCommandLine(script, paths) {
  // Lower bound on what CreateProcess would see. The shell passes the path
  // list as one argument; quoting and the node.exe path only make it longer.
  return `node ${script} --files ${paths.join('\n')}`;
}

function invocationLine(hookSource, script) {
  // The help text also names the orchestrator script (`node <script> --update`).
  // Only the line that passes the staged list counts as the command the hook runs.
  const hits = hookSource.split('\n').filter((line) => {
    const code = line.replace(/#.*/, '');
    if (!code.includes(script)) return false;
    return (
      code.includes('run_node_with_files_from') ||
      code.includes('--files-from') ||
      /--files(?!-from)/.test(code)
    );
  });
  if (hits.length !== 1) {
    throw new Error(`expected 1 hook invocation of ${script}, found ${hits.length}`);
  }
  return hits[0];
}

function commandLineLength(argv) {
  return argv.join(' ').length;
}

/**
 * Run the real helper the hook sources. A recorder script copies the
 * --files-from list (the helper deletes it afterwards) and writes process.argv.
 */
function measureHelper(paths, { exitCode = 0, abruptExit = false, env = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'files-from-helper-'));
  const listCopy = join(dir, 'list-copy.txt');
  const argvOut = join(dir, 'argv.json');
  const pathsFile = join(dir, 'input-paths.txt');
  const recorder = join(dir, 'record-argv.mjs');
  writeFileSync(pathsFile, paths.join('\n'));
  writeFileSync(
    recorder,
    [
      "import { readFileSync, writeFileSync } from 'node:fs';",
      'const argv = process.argv.slice(1);',
      "const idx = argv.indexOf('--files-from');",
      'const listPath = idx >= 0 ? argv[idx + 1] : "";',
      'const list = listPath ? readFileSync(listPath, "utf8") : "";',
      'writeFileSync(process.env.LIST_COPY, list);',
      'writeFileSync(process.env.ARGV_OUT, JSON.stringify(process.argv));',
      'process.exit(Number(process.env.EXIT_CODE || 0));',
      '',
    ].join('\n')
  );
  const stub = abruptExit
    ? 'run_with_timeout() { shift; exit 9; }'
    : 'run_with_timeout() { shift; "$@"; }';
  const result = spawnSync(
    'sh',
    [
      '-c',
      `${stub}
. ./scripts/holo-ci/with-files-from.sh
staged=$(cat "$PATHS_FILE")
run_node_with_files_from 30 "$RECORD_SCRIPT" "$staged"
`,
    ],
    {
      cwd: REPO,
      encoding: 'utf8',
      env: {
        ...process.env,
        TMPDIR: dir,
        RECORD_SCRIPT: recorder,
        PATHS_FILE: pathsFile,
        LIST_COPY: listCopy,
        ARGV_OUT: argvOut,
        EXIT_CODE: String(exitCode),
        ...env,
      },
    }
  );
  let argv = null;
  let list = null;
  try {
    argv = JSON.parse(readFileSync(argvOut, 'utf8'));
  } catch {
    argv = null;
  }
  try {
    list = readFileSync(listCopy, 'utf8');
  } catch {
    list = null;
  }
  const leftovers = readdirSync(dir).filter(
    (name) => name.startsWith('tmp.') || name.startsWith('holo-staged')
  );
  return { dir, result, argv, list, leftovers };
}

function hookCommand(hookSource, script, paths) {
  const line = invocationLine(hookSource, script);
  const code = line.replace(/#.*/, '');
  const legacy = /--files(?!-from)/.test(code);
  const viaFile = code.includes('run_node_with_files_from') || code.includes('--files-from');
  if (legacy && !viaFile) {
    const commandLine = legacyFilesCommandLine(script, paths);
    return {
      mode: 'legacy --files argument',
      length: commandLine.length,
      commandLine,
      line: line.trim(),
    };
  }
  if (viaFile && !legacy) {
    const measured = measureHelper(paths, { exitCode: 0 });
    if (!measured.argv) {
      return {
        mode: '--files-from temp file',
        length: WINDOWS_CMDLINE_LIMIT + 1,
        error: `helper did not record argv (status ${measured.result.status}): ${measured.result.stderr || measured.result.stdout}`,
        line: line.trim(),
        measured,
      };
    }
    // The helper invoked a recorder so the test can read the temp file before
    // it is deleted. Swap that recorder path for the gate script the hook
    // actually passes; node and --files-from <temp> stay as spawned.
    const argv = measured.argv.slice();
    argv[1] = script;
    return {
      mode: '--files-from temp file',
      length: commandLineLength(argv),
      argv,
      list: measured.list,
      leftovers: measured.leftovers,
      line: line.trim(),
      measured,
    };
  }
  throw new Error(`unrecognized hook invocation of ${script}: ${line}`);
}

function runNode(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return { code: result.status, out: `${result.stdout || ''}${result.stderr || ''}` };
}

function writeTree(root, files) {
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, ...rel.split('/'));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
}

function setupApex(files) {
  const root = mkdtempSync(join(tmpdir(), 'apex-files-from-'));
  writeTree(root, files);
  return root;
}

function setupOrch(files, baselineFiles = []) {
  const root = mkdtempSync(join(tmpdir(), 'orch-files-from-'));
  mkdirSync(join(root, 'packages'), { recursive: true });
  writeTree(root, {
    'scripts/holo-ci/orchestrator-fetch-canonical-baseline.json': `${JSON.stringify(
      {
        _comment: 'fixture',
        literal: ['mcp-orchestrator-production-', '45f9'].join(''),
        count: baselineFiles.length,
        files: baselineFiles,
      },
      null,
      2
    )}\n`,
    ...files,
  });
  return root;
}

function writeList(dir, name, paths) {
  const listPath = join(dir, name);
  writeFileSync(listPath, `${paths.join('\n')}\n`);
  return listPath;
}

console.log('githook-paths.test.mjs — pre-commit');

const paths = syntheticStagedPaths(1000);
const legacyLens = GATES.map((gate) => ({
  ...gate,
  legacyLength: legacyFilesCommandLine(gate.script, paths).length,
}));

console.log(
  `  info synthetic staged list: ${paths.length} paths, ` +
    `joined payload ${paths.join('\n').length} chars (Windows limit ${WINDOWS_CMDLINE_LIMIT})`
);
for (const gate of legacyLens) {
  console.log(
    `  info legacy --files command for ${gate.name}: ${gate.legacyLength} chars ` +
      `(${gate.legacyLength > WINDOWS_CMDLINE_LIMIT ? 'OVER' : 'under'} ${WINDOWS_CMDLINE_LIMIT})`
  );
}

{
  const payload = paths.join('\n');
  assertTrue(paths.length >= 1000, 'synthetic list has at least 1000 paths');
  assertTrue(
    payload.length > WINDOWS_CMDLINE_LIMIT,
    'joined staged paths exceed 32767 characters',
    `payload length ${payload.length}`
  );
  assertTrue(
    paths.some((p) => p.includes(' ')),
    'synthetic list includes a path with spaces'
  );
  for (const gate of legacyLens) {
    assertTrue(
      gate.legacyLength > WINDOWS_CMDLINE_LIMIT,
      `${gate.name}: old --files command line is over the Windows limit`,
      `length ${gate.legacyLength}. This is the command .githooks/pre-commit used to pass ` +
        'as one argument. Linux will still spawn it (ARG_MAX is higher); Windows CreateProcess rejects it.'
    );
  }
}

{
  const hookSource = readFileSync(HOOK, 'utf8');
  for (const gate of GATES) {
    let measured;
    try {
      measured = hookCommand(hookSource, gate.script, paths);
    } catch (err) {
      assertTrue(false, `${gate.name}: hook command measured`, err instanceof Error ? err.message : String(err));
      continue;
    }
    console.log(
      `  info hook command for ${gate.name}: mode=${measured.mode}, length=${measured.length}`
    );
    assertTrue(
      measured.length < WINDOWS_CMDLINE_LIMIT,
      `${gate.name}: command line the hook would pass stays under 32767`,
      `mode=${measured.mode}, length=${measured.length}, invocation=${measured.line}. ` +
        'On the old hook this length is the --files argument list and is over the limit; ' +
        'that failure is deterministic here and does not depend on Linux raising E2BIG.'
    );
    if (measured.mode === '--files-from temp file' && measured.argv) {
      assertTrue(
        measured.argv.includes('--files-from'),
        `${gate.name}: helper argv uses --files-from`
      );
      assertTrue(
        !measured.argv.some((arg) => arg.includes('\n')),
        `${gate.name}: path list is not an argv element`
      );
      assertEq(measured.list, `${paths.join('\n')}\n`, `${gate.name}: temp file contains every staged path`);
      rmSync(measured.measured.dir, { recursive: true, force: true });
    }
  }
}

{
  const spaced = ['packages/app/src/my file.ts', 'packages/app/src/a,b.ts'];
  const measured = measureHelper(spaced, { exitCode: 1 });
  try {
    assertEq(measured.result.status, 1, 'helper returns the checker status on failure');
    assertEq(
      measured.list,
      `${spaced.join('\n')}\n`,
      'temp file keeps spaces and commas inside a path'
    );
    assertEq(measured.leftovers.length, 0, 'temp list file is removed after a failing checker');
  } finally {
    rmSync(measured.dir, { recursive: true, force: true });
  }
}

{
  const measured = measureHelper(['packages/app/src/ok.ts'], { abruptExit: true });
  try {
    assertEq(measured.result.status, 9, 'helper surfaces an abrupt exit from the checker');
    assertEq(measured.leftovers.length, 0, 'temp list file is removed when the checker exits the shell');
  } finally {
    rmSync(measured.dir, { recursive: true, force: true });
  }
}

{
  const root = setupApex({
    'packages/app/src/mine.ts': 'export const ok = true;\n',
    'packages/app/src/peer.ts': legacyBridgeViolation(),
    'packages/app/src/my file.ts': legacyBridgeViolation(),
    'packages/app/src/a,b.ts': legacyBridgeViolation(),
  });
  const listDir = mkdtempSync(join(tmpdir(), 'apex-list-'));
  try {
    const cleanList = writeList(listDir, 'clean.txt', ['packages/app/src/mine.ts']);
    const clean = runNode(APEX, ['--root', root, '--files-from', cleanList]);
    assertEq(clean.code, 0, 'apex --files-from ignores an unlisted peer violation');

    const badList = writeList(listDir, 'spaced.txt', ['packages/app/src/my file.ts']);
    const bad = runNode(APEX, ['--root', root, '--files-from', badList]);
    assertEq(bad.code, 1, 'apex --files-from detects a violation in a path that contains spaces');

    const commaList = writeList(listDir, 'comma.txt', ['packages/app/src/a,b.ts']);
    const comma = runNode(APEX, ['--root', root, '--files-from', commaList]);
    assertEq(comma.code, 1, 'apex --files-from does not split a path on commas');

    const longList = writeList(listDir, 'long.txt', [...paths, 'packages/app/src/peer.ts']);
    const longBad = runNode(APEX, ['--root', root, '--files-from', longList]);
    assertEq(longBad.code, 1, 'apex --files-from still detects a violation inside a 1000-path list');

    const longClean = runNode(APEX, ['--root', root, '--files-from', cleanList]);
    assertEq(longClean.code, 0, 'apex --files-from still passes a clean file when peers are dirty');

    const legacy = runNode(APEX, ['--root', root, '--files', 'packages/app/src/peer.ts']);
    assertEq(legacy.code, 1, 'apex --files still detects a listed violation');
    const legacyClean = runNode(APEX, ['--root', root, '--files', 'packages/app/src/mine.ts']);
    assertEq(legacyClean.code, 0, 'apex --files still ignores an unlisted peer');

    const missing = runNode(APEX, ['--root', root, '--files-from', join(listDir, 'no-such-list.txt')]);
    assertEq(missing.code, 2, 'apex --files-from rejects an unreadable list');
    const noValue = runNode(APEX, ['--root', root, '--files-from']);
    assertEq(noValue.code, 2, 'apex --files-from requires a path');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(listDir, { recursive: true, force: true });
  }
}

{
  const root = setupOrch({
    'packages/app/src/mine.ts': 'export const ok = true;\n',
    'packages/app/src/peer.ts': orchestratorViolation(),
    'packages/app/src/my file.ts': orchestratorViolation(),
    'packages/app/src/a,b.ts': orchestratorViolation(),
  });
  const listDir = mkdtempSync(join(tmpdir(), 'orch-list-'));
  try {
    const cleanList = writeList(listDir, 'clean.txt', ['packages/app/src/mine.ts']);
    const clean = runNode(ORCH, ['--root', root, '--files-from', cleanList]);
    assertEq(clean.code, 0, 'orchestrator --files-from ignores an unlisted peer violation');

    const badList = writeList(listDir, 'spaced.txt', ['packages/app/src/my file.ts']);
    const bad = runNode(ORCH, ['--root', root, '--files-from', badList]);
    assertEq(bad.code, 1, 'orchestrator --files-from detects a violation in a path that contains spaces');

    const commaList = writeList(listDir, 'comma.txt', ['packages/app/src/a,b.ts']);
    const comma = runNode(ORCH, ['--root', root, '--files-from', commaList]);
    assertEq(comma.code, 1, 'orchestrator --files-from does not split a path on commas');

    const longList = writeList(listDir, 'long.txt', [...paths, 'packages/app/src/peer.ts']);
    const longBad = runNode(ORCH, ['--root', root, '--files-from', longList]);
    assertEq(longBad.code, 1, 'orchestrator --files-from still detects a violation inside a 1000-path list');

    const legacy = runNode(ORCH, ['--root', root, '--files', 'packages/app/src/peer.ts']);
    assertEq(legacy.code, 1, 'orchestrator --files still detects a listed violation');
    const legacyClean = runNode(ORCH, ['--root', root, '--files', 'packages/app/src/mine.ts']);
    assertEq(legacyClean.code, 0, 'orchestrator --files still ignores an unlisted peer');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(listDir, { recursive: true, force: true });
  }
}

{
  // 2026-09-28: with MSYS_NO_PATHCONV=1 exported, Git Bash passed node the MSYS form of the
  // temp list path. node could not open it, and every gate using this helper exited 2. The
  // hook then printed each gate's violation headline ("Third-party QR-service literal in
  // staged source") for a violation that did not exist. The list must reach node either way.
  const small = ['packages/a/src/one.ts', 'packages/b/src/with space.ts'];
  const run = measureHelper(small, { env: { MSYS_NO_PATHCONV: '1' } });
  assertEq(run.result.status, 0, 'helper: node reads the list with MSYS_NO_PATHCONV=1 set');
  assertEq(
    run.list,
    `${small.join('\n')}\n`,
    'helper: the list node read with MSYS_NO_PATHCONV=1 set is complete'
  );
  rmSync(run.dir, { recursive: true, force: true });
}

{
  // Each --files-from gate exits 2 when it never judged a file (read-scoped-files could not
  // read the list, or the gate could not see the tree) and 1 for a finding. The hook used to
  // print the finding headline for both. This runs each gate's real block from the hook
  // against a stubbed helper and checks which headline comes out.
  const hookSource = readFileSync(HOOK, 'utf8');
  const blockGates = ['LEGACY_BRIDGE', 'RENDER', 'CHOKE', 'STATS', 'QR'];
  for (const v of blockGates) {
    const start = hookSource.indexOf(`    ${v}_OUT=$(run_node_with_files_from `);
    const end = start >= 0 ? hookSource.indexOf('\n    fi\n', start) : -1;
    assertTrue(start >= 0 && end > start, `${v}: gate block found in the hook`);
    if (start < 0 || end < 0) continue;
    const block = hookSource.slice(start, end + '\n    fi\n'.length);
    for (const stubStatus of [2, 1]) {
      const run = spawnSync(
        'sh',
        [
          '-c',
          `RED=''; GREEN=''; NC=''; FAILED=0
STAGED_COMPILER_SURFACE=x; STAGED_RENDER_TSX=x; STAGED_ALL=x; STAGED_MD=x; STAGED_SRC=x
run_node_with_files_from() { echo '[stub] gate output'; return ${stubStatus}; }
${block}
echo "FAILED=$FAILED"
`,
        ],
        { cwd: REPO, encoding: 'utf8' }
      );
      const out = run.stdout || '';
      const saysCouldNotRun = out.includes('could not run, so no file was judged');
      assertEq(
        saysCouldNotRun,
        stubStatus === 2,
        `${v}: exit ${stubStatus} ${stubStatus === 2 ? 'says could not run' : 'reports a finding'}`
      );
      assertTrue(out.includes('FAILED=1'), `${v}: exit ${stubStatus} still fails the commit`, out);
    }
  }
}

// ── PRE-PUSH: a push is judged by what its branch changes, not by main's news ──
//
// The pre-push gates (core baseline receipt, studio generator drift, lockfile
// drift) run on the files the push changes. On 2026-09-28 a studio-only branch
// was refused the ~15-minute core receipt because main had moved 17 commits
// and `git diff main..branch` (a tree comparison) listed main's 5 core files.
// These cases run the hook's OWN range block, the way git runs the hook: the
// remote's name and URL as $1 and $2, the ref lines on stdin, in a scratch repo.
console.log('githook-paths.test.mjs — pre-push');
{
  const ZERO = '0000000000000000000000000000000000000000';
  const hookSource = readFileSync(resolve(REPO, '.githooks/pre-push'), 'utf8');
  const start = hookSource.indexOf('trunk=$(git ls-remote');
  const loop = hookSource.indexOf('while read -r local_ref local_sha remote_ref remote_sha; do', start);
  const end = loop >= 0 ? hookSource.indexOf('\ndone\n', loop) : -1;
  assertTrue(start >= 0 && loop > start && end > loop, 'pre-push: the range block is found in the hook');
  const block = hookSource.slice(start, end + '\ndone\n'.length);

  const git = (cwd, ...args) => {
    // Fixture commits in a throwaway repo: no signing, a fixed identity.
    const r = spawnSync(
      'git',
      ['-c', 'commit.gpgsign=false', '-c', 'user.name=hook-test', '-c', 'user.email=hook-test@example.invalid', ...args],
      { cwd, encoding: 'utf8' }
    );
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const commitFile = (cwd, path, text, msg) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), text);
    git(cwd, 'add', path);
    git(cwd, 'commit', '-q', '-m', msg);
    return git(cwd, 'rev-parse', 'HEAD');
  };
  const judged = (cwd, remoteName, remoteUrl, lines) => {
    const run = spawnSync(
      'sh',
      ['-c', `ZERO=${ZERO}\n${block}\nprintf 'force=%s\\n' "$force_check"\nprintf '%s\\n' "$changed"`, 'pre-push', remoteName, remoteUrl],
      { cwd, input: `${lines.join('\n')}\n`, encoding: 'utf8' }
    );
    const out = run.stdout || '';
    return {
      force: /force=(\d)/.exec(out)?.[1],
      files: out.split(/\r?\n/).filter((l) => l && !l.startsWith('force=')),
    };
  };

  const root = mkdtempSync(join(tmpdir(), 'prepush-paths-'));
  try {
    const bare = join(root, 'remote.git');
    const work = join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'main', bare);
    git(root, 'init', '-q', '-b', 'main', work);
    git(work, 'remote', 'add', 'origin', bare);
    commitFile(work, 'packages/core/a.ts', 'a0\n', 'm0');
    commitFile(work, 'packages/studio/b.ts', 'b0\n', 'm0b');
    git(work, 'push', '-q', 'origin', 'main');
    // A branch that changes studio only...
    git(work, 'checkout', '-q', '-b', 'feat');
    const f1 = commitFile(work, 'packages/studio/b.ts', 'b1\n', 'f1');
    // ...while a peer's core change lands on main.
    git(work, 'checkout', '-q', 'main');
    commitFile(work, 'packages/core/a.ts', 'a1\n', 'm1');
    git(work, 'push', '-q', 'origin', 'main');
    git(work, 'checkout', '-q', 'feat');

    let r = judged(work, 'origin', bare, [`refs/heads/feat ${f1} refs/heads/feat ${ZERO}`]);
    assertEq(r.force, '0', 'pre-push: a new branch behind main is not force-checked');
    assertEq(r.files.join(','), 'packages/studio/b.ts', "pre-push: a new branch behind main is judged by its own files, not main's core change");

    const f2 = commitFile(work, 'packages/core/c.ts', 'c\n', 'f2');
    r = judged(work, 'origin', bare, [`refs/heads/feat ${f2} refs/heads/feat ${ZERO}`]);
    assertTrue(r.files.includes('packages/core/c.ts'), 'pre-push: a branch that changes core is still judged for it', r.files.join(','));

    git(work, 'push', '-q', 'origin', 'feat');
    git(work, 'merge', '-q', '--no-ff', '-m', 'merge main', 'main');
    const merged = git(work, 'rev-parse', 'HEAD');
    r = judged(work, 'origin', bare, [`refs/heads/feat ${merged} refs/heads/feat ${f2}`]);
    assertTrue(!r.files.includes('packages/core/a.ts'), "pre-push: merging main into an existing branch does not charge main's changes", r.files.join(','));
    assertTrue(r.files.includes('packages/core/c.ts'), "pre-push: ...while the branch's own core change is still judged", r.files.join(','));

    git(work, 'checkout', '-q', 'main');
    const onMain = git(work, 'rev-parse', 'HEAD');
    const m2 = commitFile(work, 'packages/core/d.ts', 'd\n', 'm2');
    r = judged(work, 'origin', bare, [`refs/heads/main ${m2} refs/heads/main ${onMain}`]);
    assertEq(r.files.join(','), 'packages/core/d.ts', 'pre-push: a push to main is judged by exactly what it adds');

    const lone = join(root, 'lone');
    git(root, 'init', '-q', '-b', 'main', lone);
    const x = commitFile(lone, 'packages/core/x.ts', 'x\n', 'x');
    r = judged(lone, 'nowhere', join(root, 'no-such-remote.git'), [`refs/heads/x ${x} refs/heads/x ${ZERO}`]);
    assertEq(r.force, '1', 'pre-push: with no trunk to compare against, a new branch is judged in full');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
