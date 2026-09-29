#!/usr/bin/env node
/**
 * Fails when a committed compiler-wasm build does not describe the committed Rust source.
 *
 * Two builds are checked by default: pkg-node/ (what the MCP server, CLI and LSP load) and pkg/
 * (the web build: the package's default export and what browsers load). Before 2026-09-28 only
 * pkg-node/ was checked, and pkg/ stayed on the 2026-08-04 checker for two months unseen.
 * For each build:
 *   - freshness: the artifact path was committed after the latest change to the Rust build
 *     inputs (src/**\/*.rs, Cargo.toml, Cargo.lock). TypeScript tests under src/ are not build
 *     inputs and do not mark the build stale;
 *   - its exports include every #[wasm_bindgen] function in src/lib.rs;
 *   - its rebuild receipt names the WASM's sha256 and size, and a full source commit in this
 *     branch's history that holds the Rust build inputs HEAD holds.
 * Across builds: all of them hold the same WASM. wasm-bindgen emits one module for both targets
 * (only the JavaScript glue differs), so two digests mean two sources or two toolchains.
 *
 * `pnpm --filter @holoscript/wasm run rebuild` rebuilds both and writes both receipts.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);

const DEFAULT_ARTIFACTS = ['packages/compiler-wasm/pkg-node', 'packages/compiler-wasm/pkg'];
const REBUILD_COMMAND = 'pnpm --filter @holoscript/wasm run rebuild';

function usage(message) {
  if (message) console.error(`[compiler-wasm-drift] ${message}`);
  console.error(
    [
      'Usage: node scripts/holo-ci/check-compiler-wasm-drift.mjs',
      '  [--root <repo>] [--src <path>] [--artifact <path> ...]',
      '  [--artifact-js <path>] [--expect-export <name> ...] [--no-export-scan]',
      'With no --artifact, checks packages/compiler-wasm/pkg-node and packages/compiler-wasm/pkg.',
      '--artifact-js names the JS entry when exactly one --artifact is given.',
    ].join('\n')
  );
  process.exit(2);
}

function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) usage(`${flag} requires a value`);
  return value;
}

function allArgValues(flag) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== flag) continue;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) usage(`${flag} requires a value`);
    values.push(value);
    index += 1;
  }
  return values;
}

function toPosixPath(path) {
  return String(path || '')
    .split(sep)
    .join('/')
    .replace(/\\/g, '/');
}

function repoRelative(root, input, label) {
  if (!input) usage(`${label} is required`);
  const abs = isAbsolute(input) ? resolve(input) : resolve(root, input);
  const rel = toPosixPath(relative(root, abs));
  if (rel.startsWith('../') || rel === '..' || rel.includes('\0')) {
    usage(`${label} must stay inside repo root: ${input}`);
  }
  return rel;
}

function runGit(root, gitArgs, { allowFailure = false } = {}) {
  const result = spawnSync('git', gitArgs, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(
      `git ${gitArgs.join(' ')} failed: ${String(result.stderr || result.stdout || '').trim()}`
    );
  }
  return result;
}

/**
 * The files the WASM is built from: the crate's Rust sources and its Cargo manifest and lock.
 * Tests written in TypeScript live under src/ too, and are not among them.
 */
function rustBuildInputs(root, srcRel) {
  const crate = posix.dirname(srcRel);
  const inCrate = (name) => (crate === '.' ? name : `${crate}/${name}`);
  return [
    `:(glob)${srcRel}/**/*.rs`,
    inCrate('Cargo.toml'),
    inCrate('Cargo.lock'),
    ...embeddedInputs(root, srcRel),
  ];
}

/**
 * Files the WASM embeds with include_str! or include_bytes! outside test code are build inputs
 * too: G21's Holo module declarations (packages/std/src/holo/*.hs) are compiled into the checker,
 * so changing one changes what `holo:` means. Code after a file's first `#[cfg(test)]` line is
 * test code in this crate (eval.rs's std sources are test-only and do not count).
 */
function embeddedInputs(root, srcRel) {
  const listed = runGit(root, ['ls-files', '--', `:(glob)${srcRel}/**/*.rs`]);
  const inputs = new Set();
  for (const file of String(listed.stdout || '')
    .split(/\r?\n/)
    .filter(Boolean)) {
    const text = readFileSync(join(root, file), 'utf8');
    const cut = text.search(/^#\[cfg\(test\)\]/m);
    const code = cut === -1 ? text : text.slice(0, cut);
    for (const match of code.matchAll(/include_(?:str|bytes)!\(\s*"([^"]+)"\s*\)/g)) {
      const target = toPosixPath(relative(root, resolve(root, dirname(file), match[1])));
      if (!target.startsWith('../') && target !== '..') inputs.add(target);
    }
  }
  return [...inputs].sort();
}

function latestCommit(root, pathspecs, label) {
  const result = runGit(root, ['log', '-1', '--format=%H%n%ct%n%s', '--', ...pathspecs]);
  const lines = String(result.stdout || '')
    .trim()
    .split(/\r?\n/);
  if (!lines[0]) {
    throw new Error(`no committed history found for ${label}`);
  }
  return {
    hash: lines[0],
    timestamp: Number(lines[1]) || 0,
    subject: lines.slice(2).join('\n'),
  };
}

function isAncestor(root, ancestor, descendant) {
  const result = runGit(root, ['merge-base', '--is-ancestor', ancestor, descendant], {
    allowFailure: true,
  });
  return result.status === 0;
}

function hasStagedChanges(root, relPath) {
  const result = runGit(root, ['diff', '--cached', '--quiet', '--', relPath], {
    allowFailure: true,
  });
  if (result.status === 0) return false;
  if (result.status === 1) return true;
  throw new Error(
    `git diff --cached failed for ${relPath}: ${String(
      result.stderr || result.stdout || ''
    ).trim()}`
  );
}

function short(hash) {
  return String(hash || '').slice(0, 10);
}

/**
 * The `#[wasm_bindgen]` functions of lib.rs as `sourceCommit` holds it, the source the build came
 * from; the working tree only when no receipt names one. Reading the working tree made adding an
 * export impossible under the receipt rule: the export needed the rebuilt artifact in the same
 * commit, and that artifact's receipt had no commit yet that held the new source.
 */
function scanWasmBindgenExports(root, srcRel, sourceCommit) {
  let source;
  if (sourceCommit) {
    const shown = runGit(root, ['show', `${sourceCommit}:${srcRel}/lib.rs`], {
      allowFailure: true,
    });
    if (shown.status !== 0) return [];
    source = String(shown.stdout || '');
  } else {
    const libPath = join(root, srcRel, 'lib.rs');
    if (!existsSync(libPath)) return [];
    source = readFileSync(libPath, 'utf8');
  }
  const exports = new Set();
  const matcher =
    /#\[wasm_bindgen(?:\([^\]]*\))?\]([\s\S]{0,700}?)(?:pub\s+fn\s+)([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;
  while ((match = matcher.exec(source))) {
    exports.add(match[2]);
  }
  return [...exports].sort();
}

/**
 * The web build's glue is an ES module that locates its WASM through import.meta.url, so it is
 * read, not loaded: an exported function appears as `export function name(`.
 */
function exportedFunctionNames(root, artifactJs) {
  const source = readFileSync(artifactJs, 'utf8');
  if (/^export (?:async )?function /m.test(source) || source.includes('import.meta.url')) {
    const names = new Set();
    for (const match of source.matchAll(/^export (?:async )?function ([A-Za-z_$][\w$]*)\s*\(/gm)) {
      names.add(match[1]);
    }
    return names;
  }
  const requireFromRoot = createRequire(pathToFileURL(join(root, 'package.json')));
  const artifact = requireFromRoot(artifactJs);
  return new Set(Object.keys(artifact).filter((name) => typeof artifact[name] === 'function'));
}

function checkExports(root, srcRel, artifactJsRel, expectedExports, noExportScan, sourceCommit) {
  const artifactJs = join(root, artifactJsRel);
  if (!existsSync(artifactJs)) {
    throw new Error(`artifact JS entry is missing: ${artifactJsRel}`);
  }

  const requiredExports = new Set(expectedExports);
  if (!noExportScan) {
    for (const name of scanWasmBindgenExports(root, srcRel, sourceCommit)) {
      requiredExports.add(name);
    }
  }

  if (requiredExports.size === 0) return [];

  const exported = exportedFunctionNames(root, artifactJs);
  const missing = [...requiredExports].filter((name) => !exported.has(name));
  if (missing.length) {
    throw new Error(
      `artifact ${artifactJsRel} is missing function export(s): ${missing.join(', ')}`
    );
  }
  return [...requiredExports].sort();
}

/**
 * The rebuild receipt inside the artifact path vouches for one WASM file, and committing it
 * advances freshness (see the stale message below). So what it records must be what is on disk,
 * and the source it names must be the source this commit holds. Before 2026-09-28 only the
 * publish script compared the digest: a receipt one character short of the real digest passed
 * every gate, and nothing compared the named source with the current one. A WASM with no receipt
 * fails too. Returns the verified digest, or null when the artifact path holds no WASM.
 */
function checkReceipt(root, artifactRel, inputs) {
  const receiptRel = `${artifactRel}/rebuild-receipt.json`;
  const wasmRel = `${artifactRel}/holoscript_wasm_bg.wasm`;
  if (!existsSync(join(root, wasmRel))) return null;
  if (!existsSync(join(root, receiptRel))) {
    throw new Error(
      `${wasmRel} has no ${receiptRel}; a committed WASM needs a receipt naming its sha256 and size.`
    );
  }
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(join(root, receiptRel), 'utf8'));
  } catch (error) {
    throw new Error(`${receiptRel} is not JSON: ${error.message}`);
  }
  const wasm = readFileSync(join(root, wasmRel));
  const actual = createHash('sha256').update(wasm).digest('hex');
  const recorded = receipt?.result?.wasmSha256;
  if (recorded !== actual) {
    throw new Error(
      `${receiptRel} records wasmSha256 ${
        recorded === undefined ? '(none)' : JSON.stringify(recorded)
      }, but ${wasmRel} hashes to ${actual}. The receipt must describe the committed WASM: ` +
        'rebuild, or correct the receipt from the file.'
    );
  }
  const recordedBytes = receipt?.result?.wasmBytes;
  if (recordedBytes !== undefined && recordedBytes !== wasm.length) {
    throw new Error(
      `${receiptRel} records wasmBytes ${recordedBytes}, but ${wasmRel} is ${wasm.length} bytes.`
    );
  }
  // The build identity the MCP server reports is this commit id; it must be a full one, and
  // one this branch actually contains.
  const sourceCommit = receipt?.sourceCommit;
  if (typeof sourceCommit !== 'string' || !/^[0-9a-f]{40}$/.test(sourceCommit)) {
    throw new Error(
      `${receiptRel} sourceCommit must be a full 40-character commit id; found ${JSON.stringify(
        sourceCommit
      )}.`
    );
  }
  // A merge in progress commits MERGE_HEAD's history too, so a build from the merged branch may
  // name a commit reachable only from there.
  const reachableFrom = (tip) =>
    runGit(root, ['merge-base', '--is-ancestor', sourceCommit, tip], { allowFailure: true })
      .status === 0;
  const mergeHead = runGit(root, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], {
    allowFailure: true,
  });
  const merging = mergeHead.status === 0;
  if (!reachableFrom('HEAD') && !(merging && reachableFrom('MERGE_HEAD'))) {
    throw new Error(`${receiptRel} sourceCommit ${sourceCommit} is not in this branch's history.`);
  }
  // Built from that commit means built from its Rust inputs. They must be the ones HEAD holds,
  // or the ones being committed: during pre-commit the index is the source of the commit, and a
  // merge that brings Rust changes together with builds rebuilt from them names a commit holding
  // the index's Rust, not HEAD's. With nothing staged the index is HEAD, so this adds no leniency
  // after a commit.
  const changedFiles = (diffArgs) =>
    String(runGit(root, diffArgs).stdout || '')
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
  const changed = changedFiles(['diff', '--name-only', sourceCommit, 'HEAD', '--', ...inputs]);
  if (
    changed.length &&
    changedFiles(['diff', '--cached', '--name-only', sourceCommit, '--', ...inputs]).length
  ) {
    throw new Error(
      `${receiptRel} says the WASM was built from ${short(sourceCommit)}, but ${
        changed.length
      } Rust build input(s) changed since then (${changed.slice(0, 5).join(', ')}${
        changed.length > 5 ? ', …' : ''
      }). A receipt names a commit that holds the source it was built from: commit the Rust ` +
        `change, then run \`${REBUILD_COMMAND}\` and commit both builds.`
    );
  }
  return { digest: actual, sourceCommit };
}

function checkArtifact(root, srcRel, inputs, srcCommit, artifactRel, artifactJsRel, options) {
  const artifactCommit = latestCommit(root, [artifactRel], artifactRel);
  const committedFresh = isAncestor(root, srcCommit.hash, artifactCommit.hash);
  // During pre-commit the pending artifact refresh does not have a commit hash
  // yet. Treat an explicitly staged artifact-path update as the post-commit
  // freshness edge, while still checking the staged JS artifact's exports.
  const stagedArtifactRefresh = hasStagedChanges(root, artifactRel);
  const fresh = committedFresh || stagedArtifactRefresh;

  if (!fresh) {
    const lines = [
      `ERROR: ${artifactRel} WASM artifact is stale.`,
      `latest Rust build input: ${short(srcCommit.hash)} ${srcCommit.subject}`,
      `latest ${artifactRel}: ${short(artifactCommit.hash)} ${artifactCommit.subject}`,
      `Rebuild both builds from current source and commit them: ${REBUILD_COMMAND}`,
      'If that rebuild is BYTE-IDENTICAL there is nothing to commit under the artifact path, and',
      'repeating the rebuild can never clear this check (freshness is git ancestry, not content).',
      'Parse-side source changes are often byte-identical; the rebuild still rewrites each',
      'rebuild-receipt.json with the new source commit, and committing the receipts records the',
      're-verification. A receipt lives inside its artifact path, so committing it advances',
      'freshness, on evidence the receipt check verifies.',
    ];
    const error = new Error(lines.map((line) => `[compiler-wasm-drift] ${line}`).join('\n'));
    error.preformatted = true;
    throw error;
  }

  const receipt = checkReceipt(root, artifactRel, inputs);
  const receiptDigest = receipt?.digest ?? null;
  const exports = checkExports(
    root,
    srcRel,
    artifactJsRel,
    options.expectedExports,
    options.noExportScan,
    receipt?.sourceCommit
  );

  console.log(
    `[compiler-wasm-drift] PASS ${srcRel}@${short(srcCommit.hash)} <= ${artifactRel}@${short(
      artifactCommit.hash
    )}${stagedArtifactRefresh ? '+staged-refresh' : ''} (${exports.length} function export${
      exports.length === 1 ? '' : 's'
    } checked; ${
      receiptDigest
        ? `receipt matches wasm sha256 ${receiptDigest.slice(0, 12)}`
        : 'no wasm in artifact path'
    })`
  );
  return receiptDigest;
}

async function main() {
  const root = resolve(argValue('--root', process.cwd()));
  const srcRel = repoRelative(root, argValue('--src', 'packages/compiler-wasm/src'), '--src');
  const requested = allArgValues('--artifact');
  const artifacts = (requested.length ? requested : DEFAULT_ARTIFACTS).map((artifact) =>
    repoRelative(root, artifact, '--artifact')
  );
  const artifactJsOverride = argValue('--artifact-js', null);
  if (artifactJsOverride && artifacts.length !== 1) {
    usage('--artifact-js needs exactly one --artifact');
  }
  const options = {
    expectedExports: allArgValues('--expect-export'),
    noExportScan: args.includes('--no-export-scan'),
  };

  const inputs = rustBuildInputs(root, srcRel);
  const srcCommit = latestCommit(root, inputs, `the Rust build inputs under ${srcRel}`);

  const digests = new Map();
  for (const artifactRel of artifacts) {
    const artifactJsRel = artifactJsOverride
      ? repoRelative(root, artifactJsOverride, '--artifact-js')
      : `${artifactRel}/holoscript_wasm.js`;
    const digest = checkArtifact(
      root,
      srcRel,
      inputs,
      srcCommit,
      artifactRel,
      artifactJsRel,
      options
    );
    if (digest) digests.set(artifactRel, digest);
  }

  if (new Set(digests.values()).size > 1) {
    throw new Error(
      `the builds hold different WASM (${[...digests]
        .map(([artifactRel, digest]) => `${artifactRel} ${digest.slice(0, 12)}`)
        .join(', ')}). wasm-bindgen emits one module for every target, so different digests ` +
        `mean different sources or toolchains. Rebuild both from one commit: ${REBUILD_COMMAND}`
    );
  }
  if (digests.size > 1) {
    console.log(
      `[compiler-wasm-drift] PASS ${digests.size} builds hold the same WASM (sha256 ${[
        ...digests.values(),
      ][0].slice(0, 12)})`
    );
  }
}

main().catch((error) => {
  console.error(error.preformatted ? error.message : `[compiler-wasm-drift] ${error.message}`);
  process.exit(1);
});
