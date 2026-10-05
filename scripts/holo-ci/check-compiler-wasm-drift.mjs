#!/usr/bin/env node
/**
 * Fails when a committed compiler-wasm build does not describe the committed Rust source, or does
 * not work.
 *
 * Two builds are checked by default: pkg-node/ (what the MCP server, CLI and LSP load) and pkg/
 * (the web build: the package's default export and what browsers load). For each build:
 *   - it ships its JS entry, its WASM and a v2 rebuild receipt. Glue without its WASM fails;
 *   - the receipt names the WASM's sha256 and size, a repeat build that gave the same WASM, and
 *     the recipe packages/compiler-wasm/scripts/build-wasm.mjs builds with today;
 *   - the receipt's inputs hash equals the hash of the Rust build inputs this commit holds, as
 *     collectBuildInputs (build-wasm.mjs) names them: src/**\/*.rs, the crate and workspace
 *     Cargo.toml, the workspace Cargo.lock, cargo config and toolchain pins, and the files the
 *     build code embeds. The hash is recomputed from what git holds, so it survives a squash or
 *     rebase merge; the commit a receipt names is information, not checked against history;
 *   - the build loads (the web build as an ES module given its WASM bytes through initSync, the
 *     Node build through require), exports every #[wasm_bindgen] function of src/lib.rs, and gives
 *     the checker's verdicts on two small programs, one valid and one not.
 * Across builds: one WASM, one inputs hash, the same verdict text, and the same answer from every
 * function both export when each is called with the same arguments (one build's glue broken inside
 * a function the smoke programs do not call answers differently from the other's).
 *
 * During pre-commit the index is the commit being made. A receipt that hashes the index passes. One
 * that hashes HEAD passes with a warning: a Rust change is committed before its rebuild (a rebuild
 * refuses uncommitted inputs), and the gate fails after that commit until the rebuild is committed.
 *
 * What it cannot see: a stale WASM whose receipt was edited by hand to the new hash. Only a rebuild
 * can tell; `rebuild` builds twice and records that both builds matched.
 *
 * `pnpm --filter @holoscript/wasm run rebuild` rebuilds both and writes both receipts.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  BUILD_TARGETS,
  buildRecipe,
  collectBuildInputs,
  gitSource,
  inputsDigest,
} from '../../packages/compiler-wasm/scripts/build-wasm.mjs';

const args = process.argv.slice(2);

const DEFAULT_ARTIFACTS = ['packages/compiler-wasm/pkg-node', 'packages/compiler-wasm/pkg'];
const REBUILD_COMMAND = 'pnpm --filter @holoscript/wasm run rebuild';
const TAG = '[compiler-wasm-drift]';

/**
 * Two programs every build must judge as the checker does. A build that does not run (glue that
 * throws, a WASM that does not instantiate) or a stub that accepts or refuses everything cannot
 * pass both.
 */
const SMOKE_PROGRAMS = [
  {
    name: 'a valid function',
    source: 'function f(): bool {\n  return true\n}',
    expected: 'valid, with no errors',
    holds: (verdict) =>
      verdict.valid === true && Array.isArray(verdict.errors) && verdict.errors.length === 0,
  },
  {
    name: 'a function that returns an unknown name',
    source: 'function f(): i32 {\n  return missing_name\n}',
    expected: 'invalid, its first error naming missing_name',
    holds: (verdict) =>
      verdict.valid === false &&
      String(verdict.errors?.[0]?.message ?? '').includes('missing_name'),
  },
];

function usage(message) {
  if (message) console.error(`${TAG} ${message}`);
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

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitRunner(root) {
  return (gitArgs, input) => {
    const result = spawnSync('git', gitArgs, {
      cwd: root,
      input,
      maxBuffer: 256 * 1024 * 1024,
      windowsHide: true,
    });
    return {
      status: result.error ? 1 : (result.status ?? 1),
      stdout: result.stdout ?? Buffer.alloc(0),
      stderr: String(result.stderr ?? result.error?.message ?? ''),
    };
  };
}

/** The Rust build inputs as `rev` holds them (null: the index), with their digest; once each. */
function inputsReader(root, crateDir) {
  const git = gitRunner(root);
  const cache = new Map();
  return (rev) => {
    const key = rev ?? ':index';
    if (!cache.has(key)) {
      try {
        const { inputs } = collectBuildInputs(gitSource(git, rev), crateDir);
        cache.set(key, { inputs, digest: inputsDigest(inputs) });
      } catch (error) {
        cache.set(key, { error: error.message });
      }
    }
    return cache.get(key);
  };
}

/** Which input files differ between two { path: sha256 } lists. */
function describeChange(recorded, current) {
  if (!recorded || typeof recorded !== 'object') return 'the receipt lists no input files';
  const changed = [];
  const added = [];
  const removed = [];
  for (const [path, fileSha] of Object.entries(current)) {
    if (!(path in recorded)) added.push(path);
    else if (recorded[path] !== fileSha) changed.push(path);
  }
  for (const path of Object.keys(recorded)) if (!(path in current)) removed.push(path);
  const list = (paths) =>
    `${paths.slice(0, 5).join(', ')}${paths.length > 5 ? `, and ${paths.length - 5} more` : ''}`;
  const parts = [];
  if (changed.length) parts.push(`changed: ${list(changed)}`);
  if (added.length) parts.push(`new: ${list(added)}`);
  if (removed.length) parts.push(`gone: ${list(removed)}`);
  return parts.length
    ? parts.join('; ')
    : 'the files match but the hash does not, so the receipt was edited';
}

/** The `#[wasm_bindgen]` functions a lib.rs exports. */
function scanWasmBindgenExports(source) {
  const exports = new Set();
  const matcher =
    /#\[wasm_bindgen(?:\([^\]]*\))?\]([\s\S]{0,700}?)(?:pub\s+fn\s+)([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;
  while ((match = matcher.exec(source))) exports.add(match[2]);
  return [...exports].sort();
}

/**
 * Loads a build as its users do. The web build's glue is an ES module that would fetch its WASM
 * from import.meta.url, so it is given the bytes through initSync, as a page that has them does.
 */
async function loadBuild(root, artifactJsRel, wasmRel) {
  const jsPath = join(root, artifactJsRel);
  const glue = readFileSync(jsPath, 'utf8');
  if (/^export (?:async )?function /m.test(glue) || glue.includes('import.meta.url')) {
    const module = await import(pathToFileURL(jsPath).href);
    if (typeof module.initSync !== 'function') {
      throw new Error('its ES module has no initSync to give the WASM bytes to');
    }
    module.initSync({ module: readFileSync(join(root, wasmRel)) });
    return module;
  }
  return createRequire(pathToFileURL(join(root, 'package.json')))(jsPath);
}

/** validate_detailed's answers to SMOKE_PROGRAMS; throws on a wrong verdict. */
function smoke(module) {
  return SMOKE_PROGRAMS.map((program) => {
    let raw;
    try {
      raw = module.validate_detailed(program.source);
    } catch (error) {
      throw new Error(`throws on ${program.name}: ${error.message}`);
    }
    let verdict;
    try {
      verdict = JSON.parse(raw);
    } catch {
      throw new Error(
        `answers ${program.name} with text that is not JSON: ${String(raw).slice(0, 80)}`
      );
    }
    if (!program.holds(verdict)) {
      throw new Error(
        `judges ${program.name} ${String(raw).slice(0, 160)}; the checker's verdict is ${program.expected}`
      );
    }
    return raw;
  });
}

async function checkBuild(context, artifactRel, artifactJsRel) {
  const { root, srcRel, inputsAt, atIndex, options } = context;
  const failures = [];
  const notes = [];
  const fail = (message) => failures.push(message);
  const wasmRel = `${artifactRel}/holoscript_wasm_bg.wasm`;
  const receiptRel = `${artifactRel}/rebuild-receipt.json`;
  const result = { artifactRel, failures, notes };

  if (!existsSync(join(root, artifactJsRel))) fail(`the JS entry ${artifactJsRel} is missing`);
  if (!existsSync(join(root, wasmRel))) {
    fail(`${wasmRel} is missing: a build ships its WASM, and its glue cannot run without it`);
  }
  if (!existsSync(join(root, receiptRel))) {
    fail(
      `${receiptRel} is missing: a committed build carries the receipt \`${REBUILD_COMMAND}\` writes`
    );
  }
  if (failures.length) return result;

  const wasm = readFileSync(join(root, wasmRel));
  result.digest = sha256(wasm);
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(join(root, receiptRel), 'utf8'));
  } catch (error) {
    fail(`${receiptRel} is not JSON: ${error.message}`);
    return result;
  }
  if (typeof receipt?.inputs?.sha256 !== 'string') {
    fail(
      `${receiptRel} is a ${receipt?.schema ?? 'schema-less'} receipt: it names a commit but no hash ` +
        'of the Rust build inputs, so nothing ties it to the source once a squash or rebase merge ' +
        `drops that commit. Run \`${REBUILD_COMMAND}\` and commit both builds.`
    );
    return result;
  }
  result.inputsSha = receipt.inputs.sha256;

  const target = BUILD_TARGETS.find(({ outDir }) => outDir === posix.basename(artifactRel));
  if (target && receipt.schema !== target.schema) {
    fail(
      `${receiptRel} has schema ${JSON.stringify(receipt.schema)}; ${target.outDir} receipts are ${target.schema}`
    );
  }
  if (receipt.artifactPath !== artifactRel) {
    fail(`${receiptRel} describes ${JSON.stringify(receipt.artifactPath)}, not ${artifactRel}`);
  }
  if (receipt.result?.wasmSha256 !== result.digest) {
    fail(
      `${receiptRel} records wasmSha256 ${JSON.stringify(receipt.result?.wasmSha256 ?? '(none)')}, ` +
        `but ${wasmRel} hashes to ${result.digest}. The receipt must describe the committed WASM: rebuild.`
    );
  }
  if (receipt.result?.wasmBytes !== wasm.length) {
    fail(
      `${receiptRel} records wasmBytes ${receipt.result?.wasmBytes}, but ${wasmRel} is ${wasm.length} bytes.`
    );
  }
  if (
    receipt.result?.repeatBuildSha256Matched !== true ||
    receipt.result?.repeatBuildWasmSha256 !== result.digest
  ) {
    fail(
      `${receiptRel} does not record a repeat build that gave this WASM (repeatBuildSha256Matched ` +
        `${JSON.stringify(receipt.result?.repeatBuildSha256Matched ?? null)}); \`${REBUILD_COMMAND}\` builds twice.`
    );
  }
  if (typeof receipt.sourceCommit !== 'string' || !/^[0-9a-f]{40}$/.test(receipt.sourceCommit)) {
    fail(
      `${receiptRel} sourceCommit must be a full 40-character commit id (it is information; the ` +
        `inputs hash is the check); found ${JSON.stringify(receipt.sourceCommit)}.`
    );
  }
  if (target) {
    const expected = buildRecipe(target.target, target.outDir);
    const recorded = {
      wasmPackArgs: receipt.recipe?.wasmPackArgs,
      rustflags: receipt.recipe?.rustflags,
    };
    if (JSON.stringify(recorded) !== JSON.stringify(expected)) {
      fail(
        `${receiptRel} records the recipe ${JSON.stringify(recorded)}, but build-wasm.mjs builds with ` +
          `${JSON.stringify(expected)}. Rebuild.`
      );
    }
  }

  let matched = null;
  if (!atIndex.error) {
    if (atIndex.digest.sha256 === receipt.inputs.sha256) {
      matched = { ...atIndex, where: 'this commit holds' };
    } else {
      const atHead = inputsAt('HEAD');
      if (!atHead.error && atHead.digest.sha256 === receipt.inputs.sha256) {
        matched = { ...atHead, where: 'HEAD holds' };
        notes.push(
          `WARN ${artifactRel} was built from the Rust build inputs HEAD holds, and the staged ones ` +
            `differ (${describeChange(atHead.digest.files, atIndex.digest.files)}): this commit leaves ` +
            `it stale until \`${REBUILD_COMMAND}\` runs on it and both builds are committed.`
        );
      } else {
        fail(
          `${receiptRel} was built from other Rust build inputs than this commit holds ` +
            `(${describeChange(receipt.inputs.files, atIndex.digest.files)}). Commit the Rust change, ` +
            `run \`${REBUILD_COMMAND}\`, and commit both builds.`
        );
      }
    }
  }
  result.where = matched?.where;
  result.inputCount = matched?.inputs.size;

  const required = new Set(options.expectedExports);
  if (!options.noExportScan && matched) {
    const lib = matched.inputs.get(`${srcRel}/lib.rs`);
    if (lib) for (const name of scanWasmBindgenExports(lib.toString('utf8'))) required.add(name);
  }
  result.exportCount = required.size;

  let module;
  try {
    module = await loadBuild(root, artifactJsRel, wasmRel);
  } catch (error) {
    fail(`${artifactRel} does not load: ${error.message}`);
    return result;
  }
  result.module = module;
  const functions = new Set(
    Object.keys(module).filter((name) => typeof module[name] === 'function')
  );
  const missing = [...required].filter((name) => !functions.has(name));
  if (missing.length) {
    fail(`${artifactJsRel} is missing function export(s): ${missing.join(', ')}`);
  }
  if (typeof module.validate_detailed !== 'function') {
    fail(`${artifactRel} has no validate_detailed to run the smoke programs with`);
  } else {
    try {
      result.answers = smoke(module);
    } catch (error) {
      fail(`${artifactRel} ${error.message}`);
    }
  }
  return result;
}

/** The web build's loaders, which the Node build does not have. */
const NOT_COMPARED = new Set(['default', 'initSync', '__wbg_init']);

/** What one call did: a key to compare (a digest of the whole answer) and a short preview. */
function outcomeOf(fn, callArgs) {
  try {
    const value = fn(...callArgs);
    const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
    return {
      key: `returned ${sha256(String(text))}`,
      preview: `returned ${String(text).slice(0, 80)}`,
    };
  } catch (error) {
    const message = String(error?.message ?? error);
    return { key: `threw ${message}`, preview: `threw ${message.slice(0, 80)}` };
  }
}

/**
 * Every function the loaded builds share, called in each with the same arguments (the valid
 * smoke program for every parameter). The builds hold one WASM, so they must answer alike: glue
 * broken inside a function the smoke programs never call answers differently from the other
 * build's (the review's A12, where the web glue's validate_detailed_in_context threw).
 */
function compareExports(results) {
  const loaded = results.filter((result) => result.module);
  if (loaded.length < 2) return { differences: [], count: 0 };
  const shared = Object.keys(loaded[0].module)
    .filter(
      (name) =>
        !NOT_COMPARED.has(name) &&
        loaded.every((result) => typeof result.module[name] === 'function')
    )
    .sort();
  const differences = [];
  for (const name of shared) {
    const callArgs = Array.from(
      { length: loaded[0].module[name].length },
      () => SMOKE_PROGRAMS[0].source
    );
    const outcomes = loaded.map((result) => outcomeOf(result.module[name], callArgs));
    if (new Set(outcomes.map((outcome) => outcome.key)).size > 1) {
      differences.push(
        `${name}: ${loaded
          .map((result, index) => `${result.artifactRel} ${outcomes[index].preview}`)
          .join(' | ')}`
      );
    }
  }
  return { differences, count: shared.length };
}

async function main() {
  const root = resolve(argValue('--root', process.cwd()));
  const srcRel = repoRelative(root, argValue('--src', 'packages/compiler-wasm/src'), '--src');
  const crateDir = posix.dirname(srcRel);
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

  const inputsAt = inputsReader(root, crateDir);
  const atIndex = inputsAt(null);
  let failed = false;
  if (atIndex.error) {
    failed = true;
    console.error(`${TAG} FAIL the Rust build inputs of ${crateDir}: ${atIndex.error}`);
  }

  const context = { root, srcRel, inputsAt, atIndex, options };
  const results = [];
  for (const artifactRel of artifacts) {
    const artifactJsRel = artifactJsOverride
      ? repoRelative(root, artifactJsOverride, '--artifact-js')
      : `${artifactRel}/holoscript_wasm.js`;
    results.push(await checkBuild(context, artifactRel, artifactJsRel));
  }

  for (const result of results) {
    for (const note of result.notes) console.log(`${TAG} ${note}`);
    if (result.failures.length) {
      failed = true;
      for (const failure of result.failures)
        console.error(`${TAG} FAIL ${result.artifactRel}: ${failure}`);
      continue;
    }
    if (atIndex.error) continue;
    console.log(
      `${TAG} PASS ${result.artifactRel}: receipt matches wasm sha256 ${result.digest.slice(0, 12)}; ` +
        `built from the Rust build inputs ${result.where} (inputs sha256 ${result.inputsSha.slice(0, 12)}, ` +
        `${result.inputCount} files) and repeated with the same WASM; loads, exports ${result.exportCount} ` +
        `checked function${result.exportCount === 1 ? '' : 's'}, and gives the checker's verdicts`
    );
  }

  const differ = (key) => {
    const present = results.filter((result) => result[key] !== undefined);
    return present.length > 1 &&
      new Set(present.map((result) => JSON.stringify(result[key]))).size > 1
      ? present
      : null;
  };
  const wasmDiffer = differ('digest');
  if (wasmDiffer) {
    failed = true;
    console.error(
      `${TAG} FAIL the builds hold different WASM (${wasmDiffer
        .map((result) => `${result.artifactRel} ${result.digest.slice(0, 12)}`)
        .join(', ')}). wasm-bindgen emits one module for every target, so different digests mean ` +
        `different sources or toolchains. Rebuild both from one commit: ${REBUILD_COMMAND}`
    );
  }
  const inputsDiffer = differ('inputsSha');
  if (inputsDiffer) {
    failed = true;
    console.error(
      `${TAG} FAIL the receipts name different Rust build inputs (${inputsDiffer
        .map((result) => `${result.artifactRel} ${result.inputsSha.slice(0, 12)}`)
        .join(', ')}). Rebuild both from one commit: ${REBUILD_COMMAND}`
    );
  }
  const answersDiffer = differ('answers');
  if (answersDiffer) {
    failed = true;
    console.error(
      `${TAG} FAIL the builds give different verdicts on the smoke programs (${answersDiffer
        .map((result) => `${result.artifactRel}: ${result.answers.join(' | ').slice(0, 120)}`)
        .join('; ')})`
    );
  }
  const compared = compareExports(results);
  if (compared.differences.length) {
    failed = true;
    for (const difference of compared.differences) {
      console.error(
        `${TAG} FAIL the builds answer the same call differently, so one build's glue is not ` +
          `what wasm-bindgen wrote for this WASM: ${difference}`
      );
    }
  }
  if (!failed && results.length > 1) {
    console.log(
      `${TAG} PASS ${results.length} builds hold the same WASM (sha256 ${results[0].digest.slice(0, 12)}), ` +
        `were built from the same inputs, give the same verdicts, and answer all ${compared.count} ` +
        'shared functions alike'
    );
  }
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(`${TAG} ${error.stack || error.message}`);
  process.exit(1);
});
