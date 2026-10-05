import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assertScript = join(root, 'scripts', 'assert-wasm-package.mjs');

// Built from char codes so that no editor turns a typed escape into the raw character.
const NUL = String.fromCharCode(0);
const BACKSLASH = String.fromCharCode(92);
const UNIT_SEPARATOR = String.fromCharCode(0x1f);

/**
 * The two committed builds. wasm-bindgen emits one WASM module for both targets; only the
 * JavaScript glue differs. Each build carries a rebuild receipt that
 * scripts/holo-ci/check-compiler-wasm-drift.mjs verifies against the WASM, the Rust build inputs
 * and the build recipe. v2 receipts record a hash of the inputs, not just a commit: a commit id
 * stops naming anything in a branch's history after a squash or rebase merge.
 */
export const BUILD_TARGETS = [
  {
    target: 'web',
    outDir: 'pkg',
    schema: 'holoscript.compiler-wasm.pkg-web.rebuild-receipt.v2',
  },
  {
    target: 'nodejs',
    outDir: 'pkg-node',
    schema: 'holoscript.compiler-wasm.pkg-node.rebuild-receipt.v2',
  },
];

/**
 * Local directories every rebuild maps to fixed names in what rustc writes (the panic locations
 * of dependencies name files under Cargo's registry), so the WASM does not depend on where it is
 * built or how a path is spelled. Measured 2026-10-04: CARGO_HOME written with forward slashes
 * changed 42 bytes of the WASM.
 */
export const REMAPPED_ROOTS = [
  { role: 'cargo home', to: '/cargo-home' },
  { role: 'rustup home', to: '/rustup-home' },
  { role: 'workspace root', to: '/workspace' },
];

/**
 * How one target is built, as its receipt records it. The drift gate compares a receipt's recipe
 * with this, so changing how the WASM is built makes the committed builds stale until a rebuild.
 */
export function buildRecipe(target, outDir) {
  return {
    wasmPackArgs: ['build', '--target', target, '--out-dir', outDir, '--release'],
    rustflags: REMAPPED_ROOTS.map(({ role, to }) => `--remap-path-prefix=<${role}>=${to}`),
  };
}

/** How the inputs hash is computed, recorded in each receipt for a reader without this file. */
export const INPUTS_RULE =
  'sha256 over one line per file, "<sha256 of its bytes>  <path>" and a newline, in path order. ' +
  'The files are the ones cargo reads to build the crate: src/**/*.rs, the crate Cargo.toml, the ' +
  'workspace Cargo.toml and Cargo.lock, any .cargo/config(.toml) or rust-toolchain(.toml) from ' +
  'the crate up to the repository root, and every file the build code embeds with include!, ' +
  'include_str! or include_bytes! (code in #[cfg(test)] items excluded).';

/** Files cargo and rustup read from the crate's directory and each directory above it. */
const CONFIG_NAMES = [
  '.cargo/config.toml',
  '.cargo/config',
  'rust-toolchain.toml',
  'rust-toolchain',
];

function inDir(dir, name) {
  return dir === '.' || dir === '' ? name : `${dir}/${name}`;
}

/** 'packages/compiler-wasm' -> ['packages/compiler-wasm', 'packages', '.'] */
function selfAndAncestors(dir) {
  const dirs = [];
  let current = dir === '' ? '.' : dir;
  while (current !== '.' && current !== '/') {
    dirs.push(current);
    current = posix.dirname(current);
  }
  dirs.push('.');
  return dirs;
}

function toPosixPath(path) {
  return String(path || '')
    .split(sep)
    .join('/')
    .split(BACKSLASH)
    .join('/');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// ---------------------------------------------------------------------------------------------
// Reading Rust source: which files does the build code embed?

const OPEN = new Set(['(', '[', '{']);
const CLOSE = new Set([')', ']', '}']);
const INCLUDE_MACROS = new Set(['include', 'include_str', 'include_bytes']);
const ESCAPES = new Map([
  ['n', String.fromCharCode(10)],
  ['t', String.fromCharCode(9)],
  ['r', String.fromCharCode(13)],
  ['0', NUL],
  [BACKSLASH, BACKSLASH],
  ['"', '"'],
  ["'", "'"],
]);

function isIdentStart(ch) {
  return (
    ch !== undefined &&
    ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch.charCodeAt(0) > 127)
  );
}

function isIdentPart(ch) {
  return isIdentStart(ch) || (ch !== undefined && ch >= '0' && ch <= '9');
}

function isDigit(ch) {
  return ch !== undefined && ch >= '0' && ch <= '9';
}

function lexError(message, line) {
  const error = new Error(message);
  error.line = line;
  return error;
}

/** The "..." literal whose opening quote is at `start`: its value, and the index past it. */
function readQuoted(text, start, line) {
  let value = '';
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') return { value, end: i + 1 };
    if (ch !== BACKSLASH) {
      value += ch;
      i += 1;
      continue;
    }
    const next = text[i + 1];
    if (next === '\n' || (next === '\r' && text[i + 2] === '\n')) {
      // A line continuation: the newline and the whitespace after it are not part of the value.
      i += next === '\r' ? 3 : 2;
      while (i < text.length && /\s/.test(text[i])) i += 1;
      continue;
    }
    if (next === 'x') {
      value += String.fromCharCode(parseInt(text.slice(i + 2, i + 4), 16));
      i += 4;
      continue;
    }
    if (next === 'u' && text[i + 2] === '{') {
      const close = text.indexOf('}', i + 3);
      if (close === -1) throw lexError('unterminated unicode escape', line);
      value += String.fromCodePoint(parseInt(text.slice(i + 3, close).replace(/_/g, ''), 16));
      i = close + 1;
      continue;
    }
    if (ESCAPES.has(next)) {
      value += ESCAPES.get(next);
      i += 2;
      continue;
    }
    throw lexError(`unknown escape in a string literal: ${BACKSLASH}${next}`, line);
  }
  throw lexError('unterminated string literal', line);
}

/** The index past the character literal whose opening quote is at `start`. */
function charLiteralEnd(text, start, line) {
  let i = start + 1;
  if (text[i] === BACKSLASH) {
    i += 1;
    if (text[i] === 'u' && text[i + 1] === '{') i = text.indexOf('}', i) + 1;
    else if (text[i] === 'x') i += 3;
    else i += 1;
  } else {
    i += text.codePointAt(i) > 0xffff ? 2 : 1;
  }
  if (i <= start || text[i] !== "'") throw lexError('unterminated character literal', line);
  return i + 1;
}

function countNewlines(text) {
  let count = 0;
  for (const ch of text) if (ch === '\n') count += 1;
  return count;
}

/**
 * Rust source as tokens ({ kind: 'ident' | 'str' | 'punct' | 'lit' | 'lifetime', value, line }).
 * Comments and whitespace are dropped; a string literal carries its decoded value. Enough of the
 * language to find macro invocations and the extent of items, which is all the scanner needs.
 */
export function lexRust(text) {
  const tokens = [];
  const n = text.length;
  let line = 1;
  let i = 0;
  const push = (kind, value, start, end) => {
    tokens.push({ kind, value, line });
    line += countNewlines(text.slice(start, end));
  };
  while (i < n) {
    const ch = text[i];
    if (ch === '\n') {
      line += 1;
      i += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const startLine = line;
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (text[i] === '\n') line += 1;
        if (text[i] === '/' && text[i + 1] === '*') {
          depth += 1;
          i += 2;
        } else if (text[i] === '*' && text[i + 1] === '/') {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      if (depth > 0) throw lexError('unterminated block comment', startLine);
      continue;
    }
    if (isIdentStart(ch)) {
      let j = i + 1;
      while (isIdentPart(text[j])) j += 1;
      const word = text.slice(i, j);
      if (
        (word === 'r' || word === 'br' || word === 'cr') &&
        (text[j] === '"' || text[j] === '#')
      ) {
        let k = j;
        while (text[k] === '#') k += 1;
        const hashes = k - j;
        if (text[k] === '"') {
          const close = `"${'#'.repeat(hashes)}`;
          const end = text.indexOf(close, k + 1);
          if (end === -1) throw lexError('unterminated raw string literal', line);
          push('str', text.slice(k + 1, end), i, end + close.length);
          i = end + close.length;
          continue;
        }
        if (word === 'r' && hashes === 1 && isIdentStart(text[k])) {
          let m = k + 1;
          while (isIdentPart(text[m])) m += 1;
          push('ident', text.slice(k, m), i, m);
          i = m;
          continue;
        }
      }
      if ((word === 'b' || word === 'c') && text[j] === '"') {
        const { value, end } = readQuoted(text, j, line);
        push('str', value, i, end);
        i = end;
        continue;
      }
      if (word === 'b' && text[j] === "'") {
        const end = charLiteralEnd(text, j, line);
        push('lit', text.slice(i, end), i, end);
        i = end;
        continue;
      }
      push('ident', word, i, j);
      i = j;
      continue;
    }
    if (ch === '"') {
      const { value, end } = readQuoted(text, i, line);
      push('str', value, i, end);
      i = end;
      continue;
    }
    if (ch === "'") {
      const width = text[i + 1] === undefined ? 1 : text.codePointAt(i + 1) > 0xffff ? 2 : 1;
      if (text[i + 1] === BACKSLASH || text[i + 1 + width] === "'") {
        const end = charLiteralEnd(text, i, line);
        push('lit', text.slice(i, end), i, end);
        i = end;
        continue;
      }
      let j = i + 1;
      while (isIdentPart(text[j])) j += 1;
      push('lifetime', text.slice(i, j), i, j);
      i = j;
      continue;
    }
    if (isDigit(ch)) {
      let j = i + 1;
      while (isIdentPart(text[j])) j += 1;
      if (text[j] === '.' && isDigit(text[j + 1])) {
        j += 1;
        while (isIdentPart(text[j])) j += 1;
      }
      push('lit', text.slice(i, j), i, j);
      i = j;
      continue;
    }
    push('punct', ch, i, i + 1);
    i += 1;
  }
  return tokens;
}

function isPunct(token, value) {
  return token !== undefined && token.kind === 'punct' && token.value === value;
}

/** Splits tokens at the commas outside any bracket; a trailing comma adds no empty part. */
function splitArgs(tokens) {
  const parts = [[]];
  let depth = 0;
  for (const token of tokens) {
    if (token.kind === 'punct' && OPEN.has(token.value)) depth += 1;
    if (token.kind === 'punct' && CLOSE.has(token.value)) depth -= 1;
    if (depth === 0 && isPunct(token, ',')) {
      parts.push([]);
      continue;
    }
    parts[parts.length - 1].push(token);
  }
  if (parts.length > 1 && parts[parts.length - 1].length === 0) parts.pop();
  return parts;
}

function isManifestDir(tokens) {
  return (
    tokens.length === 5 &&
    tokens[0].kind === 'ident' &&
    tokens[0].value === 'env' &&
    isPunct(tokens[1], '!') &&
    isPunct(tokens[2], '(') &&
    tokens[3].kind === 'str' &&
    tokens[3].value === 'CARGO_MANIFEST_DIR' &&
    isPunct(tokens[4], ')')
  );
}

/**
 * The file an include macro's arguments name: a string literal (relative to the file holding the
 * macro), or concat! of string literals that may start with env!("CARGO_MANIFEST_DIR") (relative
 * to the crate). null for any other form: the caller refuses it rather than guess.
 */
function includeTarget(args) {
  const parts = splitArgs(args);
  if (parts.length !== 1) return null;
  const [arg] = parts;
  if (arg.length === 1 && arg[0].kind === 'str') return { path: arg[0].value, base: 'file' };
  if (
    arg.length >= 4 &&
    arg[0].kind === 'ident' &&
    arg[0].value === 'concat' &&
    isPunct(arg[1], '!') &&
    isPunct(arg[2], '(') &&
    isPunct(arg[arg.length - 1], ')')
  ) {
    let base = 'file';
    let path = '';
    for (const [index, piece] of splitArgs(arg.slice(3, -1)).entries()) {
      if (piece.length === 1 && piece[0].kind === 'str') path += piece[0].value;
      else if (index === 0 && isManifestDir(piece)) base = 'crate';
      else return null;
    }
    if (base === 'crate') path = path.replace(/^[\\/]+/, '');
    return { path, base };
  }
  return null;
}

/**
 * The files a Rust source embeds outside test code. An outer #[cfg(test)] removes the one item
 * (or statement, field or arm) after it, and an inner #![cfg(test)] the rest of its block; every
 * other cfg counts as build code. Include macros whose argument is not a literal path, and
 * #[path] module attributes, are refused (`refusals`), never skipped: a file the scanner cannot
 * name would leave a build input unchecked.
 */
export function scanRustSource(text) {
  let tokens;
  try {
    tokens = lexRust(text);
  } catch (error) {
    return {
      includes: [],
      refusals: [
        { line: error.line ?? 0, form: `the file did not read as Rust (${error.message})` },
      ],
    };
  }
  const n = tokens.length;
  const includes = [];
  const refusals = [];
  // The index past the bracket group whose opener is tokens[k].
  const groupEnd = (k) => {
    let depth = 0;
    for (let m = k; m < n; m += 1) {
      const token = tokens[m];
      if (token.kind !== 'punct') continue;
      if (OPEN.has(token.value)) depth += 1;
      else if (CLOSE.has(token.value)) {
        depth -= 1;
        if (depth === 0) return m + 1;
      }
    }
    return n;
  };
  const isCfgTest = (from, to) =>
    to - from === 4 &&
    tokens[from].kind === 'ident' &&
    tokens[from].value === 'cfg' &&
    isPunct(tokens[from + 1], '(') &&
    tokens[from + 2].kind === 'ident' &&
    tokens[from + 2].value === 'test' &&
    isPunct(tokens[from + 3], ')');
  // Past the item that starts at k: its `;` or `,`, or its first top-level block.
  const skipItem = (start) => {
    let k = start;
    while (isPunct(tokens[k], '#') && isPunct(tokens[k + 1], '[')) k = groupEnd(k + 1);
    let depth = 0;
    while (k < n) {
      const token = tokens[k];
      if (token.kind === 'punct') {
        if (OPEN.has(token.value)) {
          if (token.value === '{' && depth === 0) return groupEnd(k);
          depth += 1;
        } else if (CLOSE.has(token.value)) {
          if (depth === 0) return k;
          depth -= 1;
        } else if ((token.value === ';' || token.value === ',') && depth === 0) {
          return k + 1;
        }
      }
      k += 1;
    }
    return n;
  };
  // Past the rest of the enclosing block (the closer itself is left for the caller).
  const skipBlock = (start) => {
    let depth = 0;
    for (let k = start; k < n; k += 1) {
      const token = tokens[k];
      if (token.kind !== 'punct') continue;
      if (OPEN.has(token.value)) depth += 1;
      else if (CLOSE.has(token.value)) {
        if (depth === 0) return k;
        depth -= 1;
      }
    }
    return n;
  };
  const show = (token) => (token.kind === 'str' ? JSON.stringify(token.value) : token.value);

  let k = 0;
  while (k < n) {
    const token = tokens[k];
    if (isPunct(token, '#') && isPunct(tokens[k + 1], '!') && isPunct(tokens[k + 2], '[')) {
      const end = groupEnd(k + 2);
      if (isCfgTest(k + 3, end - 1)) {
        k = skipBlock(end);
        continue;
      }
      k += 3;
      continue;
    }
    if (isPunct(token, '#') && isPunct(tokens[k + 1], '[')) {
      const end = groupEnd(k + 1);
      if (isCfgTest(k + 2, end - 1)) {
        k = skipItem(end);
        continue;
      }
      if (
        tokens[k + 2]?.kind === 'ident' &&
        tokens[k + 2].value === 'path' &&
        isPunct(tokens[k + 3], '=')
      ) {
        refusals.push({
          line: token.line,
          form: '#[path = ...] on a module (its file is not followed)',
        });
      }
      k += 2;
      continue;
    }
    if (
      token.kind === 'ident' &&
      INCLUDE_MACROS.has(token.value) &&
      isPunct(tokens[k + 1], '!') &&
      tokens[k + 2]?.kind === 'punct' &&
      OPEN.has(tokens[k + 2].value)
    ) {
      const end = groupEnd(k + 2);
      const args = tokens.slice(k + 3, end - 1);
      const target = includeTarget(args);
      if (target) includes.push({ macro: `${token.value}!`, ...target, line: token.line });
      else
        refusals.push({ line: token.line, form: `${token.value}!(${args.map(show).join(' ')})` });
      k = end;
      continue;
    }
    k += 1;
  }
  return { includes, refusals };
}

// ---------------------------------------------------------------------------------------------
// The build inputs: which files, from which source, and their hash.

/**
 * The files cargo reads to build the crate in `crateDir` (repo-relative, '/'-separated; '.' for
 * the repository root), with the bytes `source` holds for each:
 *   - every tracked .rs file under <crate>/src;
 *   - <crate>/Cargo.toml; the workspace root's Cargo.toml and Cargo.lock (the nearest directory,
 *     from the crate up, whose Cargo.toml has a [workspace] table; the crate's own when none
 *     does). A member crate's own Cargo.lock is not read by cargo and is not an input;
 *   - any .cargo/config(.toml) or rust-toolchain(.toml) from the crate up to the repository root;
 *   - every file the build code embeds (scanRustSource), following include! into the files it
 *     pulls in.
 * `source.list(paths)` gives the tracked paths at or under each path; `source.read(path)` the
 * bytes, or null. Throws, naming every problem, when an input cannot be named or read.
 */
export function collectBuildInputs(source, crateDir) {
  const crate = crateDir === '' ? '.' : crateDir;
  const dirs = selfAndAncestors(crate);
  const manifestCandidates = dirs.map((dir) => inDir(dir, 'Cargo.toml'));
  const lockCandidates = dirs.map((dir) => inDir(dir, 'Cargo.lock'));
  const configCandidates = dirs.flatMap((dir) => CONFIG_NAMES.map((name) => inDir(dir, name)));
  const srcDir = inDir(crate, 'src');
  const listed = new Set(
    source.list([srcDir, ...manifestCandidates, ...lockCandidates, ...configCandidates])
  );
  const inputs = new Map();
  const problems = [];
  const add = (path) => {
    if (inputs.has(path)) return true;
    const bytes = source.read(path);
    if (bytes === null || bytes === undefined) {
      problems.push(`${path} could not be read`);
      return false;
    }
    inputs.set(path, Buffer.from(bytes));
    return true;
  };

  const manifest = inDir(crate, 'Cargo.toml');
  if (listed.has(manifest)) add(manifest);
  else problems.push(`${manifest} is not tracked`);

  let workspace = crate;
  for (const dir of dirs) {
    const candidate = inDir(dir, 'Cargo.toml');
    if (!listed.has(candidate)) continue;
    const text = String(source.read(candidate) ?? '');
    if (/^\s*\[workspace\]/m.test(text)) {
      workspace = dir;
      break;
    }
  }
  if (workspace !== crate) add(inDir(workspace, 'Cargo.toml'));
  // Only the workspace root's lock: cargo never reads a member crate's own Cargo.lock.
  const lock = inDir(workspace, 'Cargo.lock');
  if (listed.has(lock)) add(lock);
  else problems.push(`${lock} is not tracked: without it cargo resolves the dependencies afresh`);

  for (const path of configCandidates) if (listed.has(path)) add(path);

  const rust = [...listed]
    .filter((path) => path.startsWith(`${srcDir}/`) && path.endsWith('.rs'))
    .sort();
  for (const path of rust) add(path);

  const queue = [...rust];
  const scanned = new Set();
  while (queue.length) {
    const file = queue.shift();
    if (scanned.has(file) || !inputs.has(file)) continue;
    scanned.add(file);
    const { includes, refusals } = scanRustSource(inputs.get(file).toString('utf8'));
    for (const refusal of refusals) {
      problems.push(
        `${file}:${refusal.line}: ${refusal.form} cannot be read by the build-input scanner; write ` +
          'the path as a string literal or concat!(env!("CARGO_MANIFEST_DIR"), "/<path>"), or ' +
          'teach scanRustSource in packages/compiler-wasm/scripts/build-wasm.mjs the form'
      );
    }
    for (const include of includes) {
      const relativePath = include.path.split(BACKSLASH).join('/');
      if (posix.isAbsolute(relativePath) || /^[A-Za-z]:/.test(relativePath)) {
        problems.push(
          `${file}:${include.line}: ${include.macro} names an absolute path, ${include.path}`
        );
        continue;
      }
      const target = posix.normalize(
        posix.join(include.base === 'crate' ? crate : posix.dirname(file), relativePath)
      );
      if (target === '..' || target.startsWith('../')) {
        problems.push(
          `${file}:${include.line}: ${include.macro} embeds ${include.path}, outside the repository`
        );
        continue;
      }
      if (!inputs.has(target)) {
        const found = source.list([target]);
        const match =
          found.find((path) => path === target) ??
          found.find((path) => path.toLowerCase() === target.toLowerCase());
        if (!match) {
          problems.push(
            `${file}:${include.line}: ${include.macro} embeds ${target}, which is not tracked`
          );
          continue;
        }
        add(match);
        if (include.macro === 'include!') queue.push(match);
      } else if (include.macro === 'include!') {
        queue.push(target);
      }
    }
  }

  if (problems.length) {
    const error = new Error(
      ['The Rust build inputs could not all be named:', ...problems.map((p) => `  ${p}`)].join('\n')
    );
    error.problems = problems;
    throw error;
  }
  const sorted = new Map([...inputs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { inputs: sorted, workspace };
}

/** { sha256, files }: the hash of the inputs (INPUTS_RULE) and the sha256 of each file. */
export function inputsDigest(inputs) {
  const paths = [...inputs.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const files = {};
  let lines = '';
  for (const path of paths) {
    const fileSha = sha256(inputs.get(path));
    files[path] = fileSha;
    lines += `${fileSha}  ${path}\n`;
  }
  return { sha256: sha256(lines), files };
}

/**
 * A source over the working tree: the tracked files git lists, with the bytes on disk (what cargo
 * compiles). `git(args)` runs git at the repository root and returns { status, stdout } as text.
 */
export function workingTreeSource({ git, rootDir, fs }) {
  const tracked = new Set();
  return {
    list(paths) {
      const result = git(['ls-files', '-z', '--', ...paths]);
      if (result.status !== 0) throw new Error(`git ls-files failed for ${paths.join(', ')}`);
      const found = result.stdout.split(NUL).filter(Boolean);
      for (const path of found) tracked.add(path);
      return found;
    },
    read(path) {
      if (!tracked.has(path)) return null;
      try {
        return Buffer.from(fs.readFileSync(join(rootDir, path)));
      } catch {
        return null;
      }
    },
  };
}

/**
 * A source over what git holds: the index (rev null; during pre-commit, the commit being made)
 * or a commit. `git(args, input)` runs git at the repository root and returns
 * { status, stdout: Buffer, stderr }. Throws on an unresolved merge conflict in a listed path.
 */
export function gitSource(git, rev = null) {
  const blobs = new Map();
  const content = new Map();
  return {
    list(paths) {
      const args = rev
        ? ['ls-tree', '-r', '-z', rev, '--', ...paths]
        : ['ls-files', '-s', '-z', '--', ...paths];
      const result = git(args);
      if (result.status !== 0) {
        throw new Error(
          `git ${args.slice(0, 3).join(' ')} failed: ${String(result.stderr).trim()}`
        );
      }
      const found = [];
      for (const entry of result.stdout.toString('utf8').split(NUL).filter(Boolean)) {
        const tab = entry.indexOf('\t');
        const path = entry.slice(tab + 1);
        const fields = entry.slice(0, tab).split(' ');
        if (rev) {
          if (fields[1] !== 'blob') continue;
          blobs.set(path, fields[2]);
        } else {
          if (fields[2] !== '0') {
            throw new Error(
              `${path} has an unresolved merge conflict; resolve it before the gate can hash it`
            );
          }
          blobs.set(path, fields[1]);
        }
        found.push(path);
      }
      return found;
    },
    read(path) {
      if (content.has(path)) return content.get(path);
      if (!blobs.has(path)) return null;
      const pending = [...blobs].filter(([listed]) => !content.has(listed));
      const result = git(['cat-file', '--batch'], `${pending.map(([, id]) => id).join('\n')}\n`);
      if (result.status !== 0)
        throw new Error(`git cat-file --batch failed: ${String(result.stderr).trim()}`);
      const out = result.stdout;
      const byId = new Map();
      let offset = 0;
      while (offset < out.length) {
        const headerEnd = out.indexOf(10, offset);
        const [id, type, size] = out.subarray(offset, headerEnd).toString('utf8').split(' ');
        if (type === 'missing' || size === undefined) {
          offset = headerEnd + 1;
          continue;
        }
        const start = headerEnd + 1;
        byId.set(id, out.subarray(start, start + Number(size)));
        offset = start + Number(size) + 1;
      }
      for (const [listed, id] of pending) if (byId.has(id)) content.set(listed, byId.get(id));
      return content.get(path) ?? null;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// wasm-pack

export function wasmPackCandidates({
  env = process.env,
  home = homedir(),
  platform = process.platform,
} = {}) {
  const executable = platform === 'win32' ? 'wasm-pack.exe' : 'wasm-pack';
  const cargoHome = env.CARGO_HOME || join(home, '.cargo');
  return [
    ...new Set(
      [env.WASM_PACK_BIN, 'wasm-pack', join(cargoHome, 'bin', executable)].filter(Boolean)
    ),
  ];
}

function envWithToolDirectory(env, candidate, platform) {
  if (candidate === 'wasm-pack') return env;
  const pathKey =
    Object.keys(env).find((key) => key.toLowerCase() === 'path') ||
    (platform === 'win32' ? 'Path' : 'PATH');
  return {
    ...env,
    [pathKey]: [dirname(candidate), env[pathKey]].filter(Boolean).join(delimiter),
  };
}

function findWasmPack({ env, home, platform, spawn, cwd }) {
  const shell = platform === 'win32';
  for (const candidate of wasmPackCandidates({ env, home, platform })) {
    const candidateEnv = envWithToolDirectory(env, candidate, platform);
    const probe = spawn(candidate, ['--version'], {
      cwd,
      env: candidateEnv,
      shell,
      stdio: 'ignore',
    });
    if (probe.status === 0) return candidate;
  }
  return null;
}

function validateCommitted({ spawn, cwd, error }) {
  const assertion = spawn(process.execPath, [assertScript], {
    cwd,
    shell: false,
    stdio: 'inherit',
  });
  if (assertion.error) {
    error(assertion.error.message);
    return 1;
  }
  return assertion.status ?? 1;
}

function captured(spawn, command, args, options) {
  const result = spawn(command, args, { ...options, encoding: 'utf8', stdio: 'pipe' });
  return {
    status: result.error ? 1 : (result.status ?? 1),
    stdout: String(result.stdout ?? ''),
  };
}

/** `rustc 1.91.0 (f8297e351 2025-10-28)` -> `1.91.0`; null when the tool does not answer. */
function toolVersion(spawn, command, options) {
  const result = captured(spawn, command, ['--version'], options);
  if (result.status !== 0) return null;
  return result.stdout.match(/\d+\.\d+\.\d+\S*/)?.[0] ?? null;
}

/**
 * The environment a build runs in: CARGO_ENCODED_RUSTFLAGS holding the flags already set
 * (CARGO_ENCODED_RUSTFLAGS, else RUSTFLAGS) followed by `flags`. RUSTFLAGS is removed, since
 * cargo reads the encoded form first and it keeps a path with a space in one flag.
 */
export function withRustflags(env, flags) {
  const encoded = env.CARGO_ENCODED_RUSTFLAGS;
  const existing = encoded
    ? encoded.split(UNIT_SEPARATOR).filter(Boolean)
    : String(env.RUSTFLAGS ?? '')
        .split(/\s+/)
        .filter(Boolean);
  const next = { ...env, CARGO_ENCODED_RUSTFLAGS: [...existing, ...flags].join(UNIT_SEPARATOR) };
  delete next.RUSTFLAGS;
  return { existing, env: next };
}

/** A command-line argument for a Windows shell spawn: quoted when it holds a space. */
function shellArg(arg, shell) {
  return shell && /\s/.test(arg) ? `"${arg}"` : arg;
}

/** Files wasm-pack copies into an out dir that the committed builds do not keep. */
const WASM_PACK_EXTRAS = ['README.md', 'LICENSE'];

/**
 * Rebuild both targets from the committed Rust source, twice, and write each receipt from the
 * files it describes. The Rust build inputs must be committed first: the receipt hashes them as
 * HEAD holds them and names HEAD as the commit that holds them. The second build runs in a fresh
 * target directory; a receipt is written only when it gives the same WASM.
 */
function rebuild({ env, home, platform, spawn, cwd, log, error, fs, now, note, tmp }) {
  const shell = platform === 'win32';
  const wasmPack = findWasmPack({ env, home, platform, spawn, cwd });
  if (!wasmPack) {
    error(
      'wasm-pack is needed to rebuild: install it (cargo install wasm-pack) or set WASM_PACK_BIN.'
    );
    return 1;
  }
  const toolEnv = envWithToolDirectory(env, wasmPack, platform);

  const top = captured(spawn, 'git', ['rev-parse', '--show-toplevel'], {
    cwd,
    env: toolEnv,
    shell: false,
  });
  const topLevel = top.stdout.trim();
  if (top.status !== 0 || !topLevel) {
    error(
      'git rev-parse --show-toplevel failed; a rebuild needs a git checkout to hash its inputs.'
    );
    return 1;
  }
  const rootDir = resolve(topLevel);
  const crateDir = toPosixPath(relative(rootDir, resolve(cwd))) || '.';
  if (crateDir === '..' || crateDir.startsWith('../')) {
    error(`the crate ${cwd} is not inside the git checkout ${rootDir}.`);
    return 1;
  }
  const gitOptions = { cwd: rootDir, env: toolEnv, shell: false };
  const git = (args) => captured(spawn, 'git', args, gitOptions);

  let collected;
  try {
    collected = collectBuildInputs(workingTreeSource({ git, rootDir, fs }), crateDir);
  } catch (inputError) {
    error(inputError.message);
    return 1;
  }
  const { inputs, workspace } = collected;

  const status = git([
    'status',
    '--porcelain',
    '--untracked-files=all',
    '--',
    // Untracked .rs files count too: a new module is an input as soon as a tracked file names it.
    `:(glob)${inDir(crateDir, 'src')}/**/*.rs`,
    ...[...inputs.keys()].map((path) => `:(literal)${path}`),
    ...selfAndAncestors(crateDir).flatMap((dir) =>
      CONFIG_NAMES.map((name) => `:(literal)${inDir(dir, name)}`)
    ),
  ]);
  if (status.status !== 0) {
    error('git status failed; a rebuild needs a git checkout to name its source commit.');
    return 1;
  }
  const dirty = status.stdout.split(/\r?\n/).filter(Boolean);
  if (dirty.length) {
    error(
      [
        'The Rust build inputs have uncommitted changes, and a receipt hashes the inputs HEAD holds',
        'and names HEAD. Commit them first, then rebuild:',
        ...dirty.map((line) => `  ${line}`),
      ].join('\n')
    );
    return 1;
  }
  const head = git(['rev-parse', 'HEAD']);
  const sourceCommit = head.stdout.trim();
  if (head.status !== 0 || !/^[0-9a-f]{40}$/.test(sourceCommit)) {
    error('git rev-parse HEAD did not name a commit.');
    return 1;
  }
  const digest = inputsDigest(inputs);

  const toolOptions = { cwd, env: toolEnv, shell };
  const toolchain = {
    rustc: toolVersion(spawn, 'rustc', toolOptions),
    cargo: toolVersion(spawn, 'cargo', toolOptions),
    wasmPack: toolVersion(spawn, wasmPack, toolOptions),
  };

  const localRoots = {
    'cargo home': env.CARGO_HOME || join(home, '.cargo'),
    'rustup home': env.RUSTUP_HOME || join(home, '.rustup'),
    'workspace root': workspace === '.' ? rootDir : join(rootDir, workspace),
  };
  const { existing: extraRustflags, env: buildEnv } = withRustflags(
    toolEnv,
    REMAPPED_ROOTS.map(({ role, to }) => `--remap-path-prefix=${localRoots[role]}=${to}`)
  );

  const runWasmPack = (args, runEnv) => {
    log(`compiler-wasm: wasm-pack ${args.join(' ')}`);
    const result = spawn(
      wasmPack,
      args.map((arg) => shellArg(arg, shell)),
      { cwd, env: runEnv, shell, stdio: 'inherit' }
    );
    if (result.error) {
      error(result.error.message);
      return 1;
    }
    return result.status ?? 1;
  };

  const built = [];
  for (const { target, outDir, schema } of BUILD_TARGETS) {
    const outPath = join(cwd, outDir);
    const receiptPath = join(outPath, 'rebuild-receipt.json');
    const packagePath = join(outPath, 'package.json');
    let previousWasmSha256 = null;
    if (fs.existsSync(receiptPath)) {
      try {
        previousWasmSha256 =
          JSON.parse(fs.readFileSync(receiptPath, 'utf8'))?.result?.wasmSha256 ?? null;
      } catch {
        previousWasmSha256 = null;
      }
    }
    // The committed package metadata is kept; wasm-pack regenerates it from Cargo.toml.
    const committedPackage = fs.existsSync(packagePath) ? fs.readFileSync(packagePath) : null;
    const extrasBefore = new Set(
      WASM_PACK_EXTRAS.filter((name) => fs.existsSync(join(outPath, name)))
    );

    const { wasmPackArgs } = buildRecipe(target, outDir);
    const status = runWasmPack(wasmPackArgs, buildEnv);
    if (status !== 0) return status;

    fs.rmSync(join(outPath, '.gitignore'), { force: true });
    for (const name of WASM_PACK_EXTRAS) {
      if (!extrasBefore.has(name)) fs.rmSync(join(outPath, name), { force: true });
    }
    if (committedPackage) fs.writeFileSync(packagePath, committedPackage);

    const wasm = fs.readFileSync(join(outPath, 'holoscript_wasm_bg.wasm'));
    built.push({
      target,
      outDir,
      schema,
      receiptPath,
      previousWasmSha256,
      wasmBytes: wasm.length,
      wasmSha256: sha256(wasm),
    });
  }

  const digests = new Set(built.map((build) => build.wasmSha256));
  if (digests.size !== 1) {
    error(
      `The targets produced different WASM (${built
        .map((build) => `${build.outDir} ${build.wasmSha256}`)
        .join(', ')}); no receipt was written.`
    );
    return 1;
  }

  // The repeat build: a fresh target directory, so nothing is reused from the first build.
  const repeatRoot = fs.mkdtempSync(join(tmp, 'holoscript-wasm-repeat-'));
  try {
    const repeatEnv = { ...buildEnv, CARGO_TARGET_DIR: join(repeatRoot, 'target') };
    for (const build of built) {
      const repeatOut = join(repeatRoot, build.outDir);
      const args = [...buildRecipe(build.target, build.outDir).wasmPackArgs];
      args[args.indexOf('--out-dir') + 1] = repeatOut;
      log('compiler-wasm: the repeat build, in a fresh target directory');
      const status = runWasmPack(args, repeatEnv);
      if (status !== 0) return status;
      build.repeatWasmSha256 = sha256(fs.readFileSync(join(repeatOut, 'holoscript_wasm_bg.wasm')));
    }
  } finally {
    fs.rmSync(repeatRoot, { recursive: true, force: true });
  }
  const unrepeated = built.filter((build) => build.repeatWasmSha256 !== build.wasmSha256);
  if (unrepeated.length) {
    error(
      `The repeat build gave different WASM (${unrepeated
        .map((build) => `${build.outDir}: ${build.wasmSha256} then ${build.repeatWasmSha256}`)
        .join('; ')}): the build is not reproducible here, and no receipt was written.`
    );
    return 1;
  }

  const generatedAt = now()
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');
  for (const build of built) {
    const recipe = buildRecipe(build.target, build.outDir);
    const receipt = {
      schema: build.schema,
      generatedAt,
      sourcePath: inDir(crateDir, 'src'),
      sourceCommit,
      artifactPath: inDir(crateDir, build.outDir),
      inputs: {
        sha256: digest.sha256,
        rule: INPUTS_RULE,
        files: digest.files,
      },
      recipe: { ...recipe, extraRustflags },
      commands: [
        `node scripts/build-wasm.mjs --rebuild (wasm-pack ${recipe.wasmPackArgs.join(
          ' '
        )}, then again in a fresh target directory)`,
      ],
      toolchain,
      result: {
        rebuilt: true,
        artifactBytesChanged: build.previousWasmSha256 !== build.wasmSha256,
        wasmBytes: build.wasmBytes,
        wasmSha256: build.wasmSha256,
        previousWasmSha256: build.previousWasmSha256,
        repeatBuildSha256Matched: true,
        repeatBuildWasmSha256: build.repeatWasmSha256,
        note: [
          `Written by build-wasm.mjs --rebuild at commit ${sourceCommit}, which holds the ${
            inputs.size
          } Rust build inputs it hashes; built twice, the second time in a fresh target directory, with the same WASM; ${
            built.length
          } targets (${built.map((b) => b.outDir).join(', ')}) hold this WASM.`,
          note,
        ]
          .filter(Boolean)
          .join(' '),
      },
    };
    fs.writeFileSync(build.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  }

  log(
    [
      `compiler-wasm: rebuilt ${built.map((b) => b.outDir).join(' and ')} at ${sourceCommit}`,
      `  inputs sha256 ${digest.sha256} (${inputs.size} files)`,
      `  wasm sha256 ${built[0].wasmSha256} (${built[0].wasmBytes} bytes), the same in the repeat build${
        built.every((b) => b.previousWasmSha256 === b.wasmSha256)
          ? ', byte-identical to the last build'
          : ''
      }`,
      '  Commit both builds (the files under pkg/ and pkg-node/, receipts included); the drift gate',
      '  checks each receipt against its WASM, the Rust build inputs and the build recipe.',
    ].join('\n')
  );
  return 0;
}

/**
 * `node scripts/build-wasm.mjs` (the workspace build) validates the committed builds and never
 * rewrites them: before 2026-09-28 it rebuilt pkg/ whenever wasm-pack was installed, leaving the
 * tracked browser build and its receipt out of step after every workspace build.
 * `node scripts/build-wasm.mjs --rebuild` rebuilds both builds and writes their receipts.
 */
export function runWasmBuild({
  env = process.env,
  home = homedir(),
  platform = process.platform,
  spawn = spawnSync,
  cwd = root,
  log = console.log,
  error = console.error,
  fs = { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync },
  now = () => new Date(),
  tmp = tmpdir(),
  rebuild: rebuildRequested = false,
  note = null,
} = {}) {
  if (rebuildRequested) {
    return rebuild({ env, home, platform, spawn, cwd, log, error, fs, now, note, tmp });
  }
  log(
    'compiler-wasm: validating the committed builds in pkg/ and pkg-node/ (a workspace build does not rewrite them); to rebuild both from this commit: pnpm --filter @holoscript/wasm run rebuild'
  );
  return validateCommitted({ spawn, cwd, error });
}

function parseArgs(argv) {
  const options = { rebuild: false, note: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--rebuild') options.rebuild = true;
    else if (arg === '--note') {
      options.note = argv[index + 1] ?? null;
      index += 1;
    } else {
      throw new Error(`unknown argument ${arg}; use --rebuild [--note "<text>"]`);
    }
  }
  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (parseError) {
    console.error(parseError.message);
    process.exit(2);
  }
  process.exit(runWasmBuild(options));
}
