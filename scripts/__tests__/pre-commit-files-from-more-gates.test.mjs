#!/usr/bin/env node
/**
 * Pre-commit staged-path passing for the three gates that #355 left on the
 * command line must stay under Windows' 32,767-character CreateProcess limit.
 *
 *   render-surface     one quoted --files argument
 *   hardcoded-stats    unquoted positional paths (also splits on spaces)
 *   no-third-party-qr  unquoted positional paths (also splits on spaces)
 *
 * The old hook put the staged list in that command. A merge with hundreds of
 * paths then died with "Argument list too long" before the checker ran. Linux
 * ARG_MAX is much higher (often ~2MB), so this test does not wait for the OS
 * to reject the spawn. It measures the command line the hook would pass. On
 * the old hook that string includes the path list and is over 32,767; after
 * the fix the hook passes --files-from <tempfile> and the measured argv stays
 * under the limit.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');
const HOOK = resolve(REPO, '.githooks/pre-commit');
const RENDER = resolve(REPO, 'scripts/holo-ci/check-render-surface-native.mjs');
const STATS = resolve(REPO, 'scripts/holo-ci/check-hardcoded-stats.mjs');
const QR = resolve(REPO, 'scripts/holo-ci/check-no-third-party-qr.mjs');
const RENDER_ROOTS = 'packages/r3f-renderer/src';

/** CreateProcess lpCommandLine limit on Windows. */
const WINDOWS_CMDLINE_LIMIT = 32767;

const GATES = [
  {
    name: 'render-surface',
    script: 'scripts/holo-ci/check-render-surface-native.mjs',
    timeout: 30,
    legacy: 'files-arg',
  },
  {
    name: 'hardcoded-stats',
    script: 'scripts/holo-ci/check-hardcoded-stats.mjs',
    timeout: 20,
    legacy: 'positional',
  },
  {
    name: 'no-third-party-qr',
    script: 'scripts/holo-ci/check-no-third-party-qr.mjs',
    timeout: 20,
    legacy: 'positional',
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

/** ~1000 long paths, including spaces, whose joined form exceeds the Windows limit. */
function syntheticStagedPaths(count = 1000) {
  const paths = [];
  for (let i = 0; i < count; i += 1) {
    const n = String(i).padStart(4, '0');
    paths.push(`packages/app/src/merge batch/${'segment-'.repeat(6)}file-${n}.ts`);
  }
  return paths;
}

function legacyCommandLine(gate, paths) {
  // Lower bound on what CreateProcess would see. Quoting and the node.exe
  // path only make it longer.
  if (gate.legacy === 'files-arg') {
    // One quoted argument. Newlines stay inside that argument and still count.
    return `node ${gate.script} --files ${paths.join('\n')}`;
  }
  // Unquoted positional: the shell splits the staged list into argv. Spaces
  // inside a path split it further, but every character is still on the
  // command line. Newlines become separators and still count as one each.
  return `node ${gate.script} ${paths.join(' ')}`;
}

function invocationLine(hookSource, script) {
  const hits = hookSource.split('\n').filter((line) => {
    const code = line.replace(/#.*/, '');
    if (!code.includes(script)) return false;
    return (
      code.includes('run_node_with_files_from') ||
      code.includes('--files-from') ||
      /--files(?!-from)/.test(code) ||
      /\$STAGED_[A-Z0-9_]+/.test(code)
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
function measureHelper(paths, { exitCode = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'files-from-more-'));
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
  const result = spawnSync(
    'sh',
    [
      '-c',
      `run_with_timeout() { shift; "$@"; }
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

function hookCommand(hookSource, gate, paths) {
  const line = invocationLine(hookSource, gate.script);
  const code = line.replace(/#.*/, '');
  const viaFile = code.includes('run_node_with_files_from') || code.includes('--files-from');
  const legacyFiles = /--files(?!-from)/.test(code);
  const legacyPositional = /\$STAGED_[A-Z0-9_]+/.test(code);
  if (!viaFile && legacyFiles) {
    const commandLine = legacyCommandLine({ legacy: 'files-arg', script: gate.script }, paths);
    return {
      mode: 'legacy --files argument',
      length: commandLine.length,
      commandLine,
      line: line.trim(),
    };
  }
  if (!viaFile && legacyPositional) {
    const commandLine = legacyCommandLine({ legacy: 'positional', script: gate.script }, paths);
    return {
      mode: 'legacy positional arguments',
      length: commandLine.length,
      commandLine,
      line: line.trim(),
    };
  }
  if (viaFile && !legacyFiles) {
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
    const argv = measured.argv.slice();
    argv[1] = gate.script;
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
  throw new Error(`unrecognized hook invocation of ${gate.script}: ${line}`);
}

function runNode(script, args, cwd = REPO) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
  return { code: result.status, out: `${result.stdout || ''}${result.stderr || ''}` };
}

function writeTree(root, files) {
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, ...rel.split('/'));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
}

function writeList(dir, name, paths, { crlf = false } = {}) {
  const listPath = join(dir, name);
  const sep = crlf ? '\r\n' : '\n';
  writeFileSync(listPath, `${paths.join(sep)}${sep}`);
  return listPath;
}

function git(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

console.log('pre-commit-files-from-more-gates.test.mjs');

const paths = syntheticStagedPaths(1000);
const legacyLens = GATES.map((gate) => ({
  ...gate,
  legacyLength: legacyCommandLine(gate, paths).length,
}));

console.log(
  `  info synthetic staged list: ${paths.length} paths, ` +
    `joined payload ${paths.join('\n').length} chars (Windows limit ${WINDOWS_CMDLINE_LIMIT})`
);
for (const gate of legacyLens) {
  console.log(
    `  info legacy ${gate.legacy} command for ${gate.name}: ${gate.legacyLength} chars ` +
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
  assertTrue(paths.some((p) => p.includes(' ')), 'synthetic list includes a path with spaces');
  for (const gate of legacyLens) {
    assertTrue(
      gate.legacyLength > WINDOWS_CMDLINE_LIMIT,
      `${gate.name}: old hook command line is over the Windows limit`,
      `length ${gate.legacyLength}. This is the command .githooks/pre-commit used to pass. ` +
        'Linux will still spawn it (ARG_MAX is higher); Windows CreateProcess rejects it.'
    );
  }
}

{
  const hookSource = readFileSync(HOOK, 'utf8');
  for (const gate of legacyLens) {
    let measured;
    try {
      measured = hookCommand(hookSource, gate, paths);
    } catch (err) {
      assertTrue(false, `${gate.name}: hook command measured`, err instanceof Error ? err.message : String(err));
      continue;
    }
    console.log(
      `  info hook command for ${gate.name}: mode=${measured.mode}, length=${measured.length}`
    );
    if (measured.mode.startsWith('legacy')) {
      assertEq(
        measured.length,
        gate.legacyLength,
        `${gate.name}: measured old hook matches the reconstructed command line`
      );
    }
    assertTrue(
      measured.length < WINDOWS_CMDLINE_LIMIT,
      `${gate.name}: command line the hook would pass stays under 32767`,
      `mode=${measured.mode}, length=${measured.length}, invocation=${measured.line}. ` +
        'On the old hook this length includes the staged path list and is over the limit; ' +
        'that failure is deterministic here and does not depend on Linux raising E2BIG.'
    );
    if (measured.mode === '--files-from temp file' && measured.argv) {
      assertTrue(
        measured.line.includes(`run_node_with_files_from ${gate.timeout} `),
        `${gate.name}: hook keeps timeout ${gate.timeout}`
      );
      assertTrue(measured.argv.includes('--files-from'), `${gate.name}: helper argv uses --files-from`);
      assertTrue(
        !measured.argv.some((arg) => arg.includes('\n') || arg.includes('merge batch')),
        `${gate.name}: path list is not an argv element`
      );
      assertEq(measured.list, `${paths.join('\n')}\n`, `${gate.name}: temp file contains every staged path`);
      assertEq(measured.leftovers.length, 0, `${gate.name}: temp list file is removed after the helper`);
      rmSync(measured.measured.dir, { recursive: true, force: true });
    }
  }
}

{
  const root = mkdtempSync(join(tmpdir(), 'render-files-from-'));
  mkdirSync(join(root, 'scripts', 'holo-ci'), { recursive: true });
  writeTree(root, {
    'packages/r3f-renderer/src/Legacy.tsx': 'export const Legacy = () => null;\n',
  });
  const listDir = mkdtempSync(join(tmpdir(), 'render-list-'));
  const renderArgs = ['--root', root, '--roots', RENDER_ROOTS];
  try {
    const seed = runNode(RENDER, [...renderArgs, '--update']);
    assertEq(seed.code, 0, 'render --update still seeds the full tree');
    writeTree(root, {
      'packages/r3f-renderer/src/my file.tsx': 'export const Spaced = () => null;\n',
      'packages/r3f-renderer/src/a,b.tsx': 'export const Comma = () => null;\n',
      'packages/r3f-renderer/src/Peer.tsx': 'export const Peer = () => null;\n',
    });

    const cleanList = writeList(listDir, 'clean.txt', ['packages/r3f-renderer/src/Legacy.tsx']);
    const clean = runNode(RENDER, [...renderArgs, '--files-from', cleanList]);
    assertEq(clean.code, 0, 'render --files-from ignores an unlisted peer violation');

    const spacedList = writeList(listDir, 'spaced.txt', ['packages/r3f-renderer/src/my file.tsx'], {
      crlf: true,
    });
    const spaced = runNode(RENDER, [...renderArgs, '--files-from', spacedList]);
    assertEq(spaced.code, 1, 'render --files-from detects a violation in a CRLF path that contains spaces');
    assertTrue(
      spaced.out.includes('packages/r3f-renderer/src/my file.tsx'),
      'render --files-from keeps the spaced path as one path',
      spaced.out
    );

    const commaList = writeList(listDir, 'comma.txt', ['packages/r3f-renderer/src/a,b.tsx']);
    const comma = runNode(RENDER, [...renderArgs, '--files-from', commaList]);
    assertEq(comma.code, 1, 'render --files-from does not split a path on commas');

    const buried = paths.slice();
    buried.splice(500, 0, 'packages/r3f-renderer/src/my file.tsx');
    const longList = writeList(listDir, 'long.txt', buried);
    const longBad = runNode(RENDER, [...renderArgs, '--files-from', longList]);
    assertEq(longBad.code, 1, 'render --files-from still detects a violation inside a 1000-path list');
    assertTrue(
      longBad.out.includes('packages/r3f-renderer/src/my file.tsx'),
      'render buried violation is the spaced path',
      longBad.out
    );

    const emptyList = writeList(listDir, 'empty.txt', []);
    const empty = runNode(RENDER, [...renderArgs, '--files-from', emptyList]);
    assertEq(empty.code, 0, 'render --files-from empty list stays scoped and does not fail the tree');

    const full = runNode(RENDER, renderArgs);
    assertEq(full.code, 1, 'render full-tree mode still flags a violation when no file list is passed');

    const legacy = runNode(RENDER, [...renderArgs, '--files', 'packages/r3f-renderer/src/Legacy.tsx']);
    assertEq(legacy.code, 0, 'render --files still ignores an unlisted peer');
    const legacyBad = runNode(RENDER, [...renderArgs, '--files', 'packages/r3f-renderer/src/Peer.tsx']);
    assertEq(legacyBad.code, 1, 'render --files still detects a listed violation');

    const missing = runNode(RENDER, [...renderArgs, '--files-from', join(listDir, 'no-such-list.txt')]);
    assertEq(missing.code, 2, 'render --files-from rejects an unreadable list');
    const noValue = runNode(RENDER, [...renderArgs, '--files-from']);
    assertEq(noValue.code, 2, 'render --files-from requires a path');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(listDir, { recursive: true, force: true });
  }
}

{
  const root = mkdtempSync(join(tmpdir(), 'stats-files-from-'));
  const listDir = mkdtempSync(join(tmpdir(), 'stats-list-'));
  try {
    git(root, ['init']);
    writeTree(root, {
      'docs/clean.md': 'Hello from the docs.\n',
      'docs/my notes.md': 'This release ships 158 MCP tools.\n',
      'docs/a,b.md': 'The catalog lists 44 compilers.\n',
    });
    git(root, ['add', '--', 'docs/clean.md', 'docs/my notes.md', 'docs/a,b.md']);

    const cleanList = writeList(listDir, 'clean.txt', ['docs/clean.md']);
    const clean = runNode(STATS, ['--files-from', cleanList], root);
    assertEq(clean.code, 0, 'stats --files-from passes a clean list while a peer doc is dirty');

    const spacedList = writeList(listDir, 'spaced.txt', ['docs/my notes.md'], { crlf: true });
    const spaced = runNode(STATS, ['--files-from', spacedList], root);
    assertEq(spaced.code, 1, 'stats --files-from detects a violation in a CRLF path that contains spaces');
    assertTrue(spaced.out.includes('docs/my notes.md'), 'stats --files-from keeps the spaced path as one path', spaced.out);

    const commaList = writeList(listDir, 'comma.txt', ['docs/a,b.md']);
    const comma = runNode(STATS, ['--files-from', commaList], root);
    assertEq(comma.code, 1, 'stats --files-from does not split a path on commas');

    const buried = paths.slice();
    buried.splice(500, 0, 'docs/my notes.md');
    const longList = writeList(listDir, 'long.txt', buried);
    const longBad = runNode(STATS, ['--files-from', longList], root);
    assertEq(longBad.code, 1, 'stats --files-from still detects a violation inside a 1000-path list');

    const emptyList = writeList(listDir, 'empty.txt', []);
    const empty = runNode(STATS, ['--files-from', emptyList], root);
    assertEq(empty.code, 0, 'stats --files-from empty list scans nothing');
    assertTrue(
      empty.out.includes('no markdown files to scan'),
      'stats empty --files-from keeps the empty-list message',
      empty.out
    );

    const positional = runNode(STATS, ['docs/my notes.md'], root);
    assertEq(positional.code, 1, 'stats positional arguments still detect a path that contains spaces');
    const positionalClean = runNode(STATS, ['docs/clean.md'], root);
    assertEq(positionalClean.code, 0, 'stats positional arguments still pass a clean file');

    const noArgs = runNode(STATS, [], root);
    assertEq(noArgs.code, 0, 'stats with no args still scans nothing');

    const allWins = runNode(STATS, ['--all', '--files-from', cleanList], root);
    assertEq(allWins.code, 1, 'stats --all still scans the tree when --files-from is also present');

    const stagedOnly = mkdtempSync(join(tmpdir(), 'stats-staged-'));
    try {
      git(stagedOnly, ['init']);
      writeTree(stagedOnly, {
        'docs/clean.md': 'Hello from the docs.\n',
        'docs/dirty.md': 'This release ships 158 MCP tools.\n',
      });
      git(stagedOnly, ['add', '--', 'docs/clean.md']);
      const stagedClean = runNode(STATS, ['--staged'], stagedOnly);
      assertEq(stagedClean.code, 0, 'stats --staged ignores an unstaged violation');
      git(stagedOnly, ['add', '--', 'docs/dirty.md']);
      const stagedBad = runNode(STATS, ['--staged'], stagedOnly);
      assertEq(stagedBad.code, 1, 'stats --staged still flags a staged violation');
    } finally {
      rmSync(stagedOnly, { recursive: true, force: true });
    }

    const missing = runNode(STATS, ['--files-from', join(listDir, 'no-such-list.txt')], root);
    assertEq(missing.code, 2, 'stats --files-from rejects an unreadable list');
    const noValue = runNode(STATS, ['--files-from'], root);
    assertEq(noValue.code, 2, 'stats --files-from requires a path');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(listDir, { recursive: true, force: true });
  }
}

{
  const root = mkdtempSync(join(tmpdir(), 'qr-files-from-'));
  const listDir = mkdtempSync(join(tmpdir(), 'qr-list-'));
  const qrHost = ['api.', 'qrserver.com'].join('');
  try {
    git(root, ['init']);
    writeTree(root, {
      'packages/widget/src/clean.ts': 'export const ok = 1;\n',
      'packages/widget/src/my file.ts': `export const url = 'https://${qrHost}/v1/create-qr-code';\n`,
      'packages/widget/src/a,b.ts': `export const url = 'https://${qrHost}/v1/create-qr-code';\n`,
    });

    const cleanList = writeList(listDir, 'clean.txt', ['packages/widget/src/clean.ts']);
    const clean = runNode(QR, ['--files-from', cleanList], root);
    assertEq(clean.code, 0, 'qr --files-from passes a clean list while a peer file is dirty');

    const spacedList = writeList(listDir, 'spaced.txt', ['packages/widget/src/my file.ts'], {
      crlf: true,
    });
    const spaced = runNode(QR, ['--files-from', spacedList], root);
    assertEq(spaced.code, 1, 'qr --files-from detects a violation in a CRLF path that contains spaces');
    assertTrue(
      spaced.out.includes('packages/widget/src/my file.ts'),
      'qr --files-from keeps the spaced path as one path',
      spaced.out
    );

    const commaList = writeList(listDir, 'comma.txt', ['packages/widget/src/a,b.ts']);
    const comma = runNode(QR, ['--files-from', commaList], root);
    assertEq(comma.code, 1, 'qr --files-from does not split a path on commas');

    const buried = paths.slice();
    buried.splice(500, 0, 'packages/widget/src/my file.ts');
    const longList = writeList(listDir, 'long.txt', buried);
    const longBad = runNode(QR, ['--files-from', longList], root);
    assertEq(longBad.code, 1, 'qr --files-from still detects a violation inside a 1000-path list');

    const emptyList = writeList(listDir, 'empty.txt', []);
    const empty = runNode(QR, ['--files-from', emptyList], root);
    assertEq(empty.code, 0, 'qr --files-from empty list scans nothing');
    assertTrue(
      empty.out.includes('no source files to scan'),
      'qr empty --files-from keeps the empty-list message',
      empty.out
    );

    const positional = runNode(QR, ['packages/widget/src/my file.ts'], root);
    assertEq(positional.code, 1, 'qr positional arguments still detect a path that contains spaces');
    const positionalClean = runNode(QR, ['packages/widget/src/clean.ts'], root);
    assertEq(positionalClean.code, 0, 'qr positional arguments still pass a clean file');

    const noArgs = runNode(QR, [], root);
    assertEq(noArgs.code, 0, 'qr with no args still scans nothing');

    const allWins = runNode(QR, ['--all', '--files-from', cleanList], root);
    assertEq(allWins.code, 1, 'qr --all still scans the tree when --files-from is also present');

    const stagedClean = runNode(QR, ['--staged'], root);
    assertEq(stagedClean.code, 0, 'qr --staged ignores an unstaged violation');
    git(root, ['add', '--', 'packages/widget/src/my file.ts']);
    const stagedBad = runNode(QR, ['--staged'], root);
    assertEq(stagedBad.code, 1, 'qr --staged still flags a staged violation');

    const missing = runNode(QR, ['--files-from', join(listDir, 'no-such-list.txt')], root);
    assertEq(missing.code, 2, 'qr --files-from rejects an unreadable list');
    const noValue = runNode(QR, ['--files-from'], root);
    assertEq(noValue.code, 2, 'qr --files-from requires a path');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(listDir, { recursive: true, force: true });
  }
}

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
