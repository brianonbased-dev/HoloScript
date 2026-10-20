#!/usr/bin/env node
/**
 * Fails when the committed compiler-wasm source is newer than the committed
 * pkg-node WASM artifact. This catches the drift where Rust source changes land
 * but the ready-to-run Node WASM package still exposes an older API surface.
 *
 * In the package layout it also covers the web build (pkg/, the package's
 * default export) and both rebuild receipts. pkg/ went unchecked from
 * 2026-08-04 to 2026-10-05 and stayed at a build that gave fib(10) = -80 and
 * refused 30 tracked .hs files the Node build accepted (board task y39k).
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);

function usage(message) {
  if (message) console.error(`[compiler-wasm-drift] ${message}`);
  console.error(
    [
      'Usage: node scripts/holo-ci/check-compiler-wasm-drift.mjs',
      '  [--root <repo>] [--src <path>] [--artifact <path>]',
      '  [--artifact-js <path>] [--expect-export <name> ...] [--no-export-scan]',
      '  [--web-artifact <path> | --no-web-artifact] [--check-receipts]',
      '',
      'With no --artifact/--artifact-js override (the package layout every caller uses), the gate',
      'also checks the web build packages/compiler-wasm/pkg (the package\'s default "." export) and',
      'each build\'s rebuild-receipt.json: its wasmSha256 must match its holoscript_wasm_bg.wasm, and',
      'both receipts must name the same sourceCommit.',
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

function latestCommit(root, relPath) {
  const result = runGit(root, ['log', '-1', '--format=%H%n%ct%n%s', '--', relPath]);
  const lines = String(result.stdout || '')
    .trim()
    .split(/\r?\n/);
  if (!lines[0]) {
    throw new Error(`no committed history found for ${relPath}`);
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

function scanWasmBindgenExports(root, srcRel) {
  const libPath = join(root, srcRel, 'lib.rs');
  if (!existsSync(libPath)) return [];
  const source = readFileSync(libPath, 'utf8');
  const exports = new Set();
  const matcher =
    /#\[wasm_bindgen(?:\([^\]]*\))?\]([\s\S]{0,700}?)(?:pub\s+fn\s+)([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;
  while ((match = matcher.exec(source))) {
    exports.add(match[2]);
  }
  return [...exports].sort();
}

function checkExports(root, srcRel, artifactJsRel, expectedExports, noExportScan) {
  const artifactJs = join(root, artifactJsRel);
  if (!existsSync(artifactJs)) {
    throw new Error(`artifact JS entry is missing: ${artifactJsRel}`);
  }

  const requiredExports = new Set(expectedExports);
  if (!noExportScan) {
    for (const name of scanWasmBindgenExports(root, srcRel)) {
      requiredExports.add(name);
    }
  }

  if (requiredExports.size === 0) return [];

  const requireFromRoot = createRequire(pathToFileURL(join(root, 'package.json')));
  const artifact = requireFromRoot(artifactJs);
  const missing = [...requiredExports].filter((name) => typeof artifact[name] !== 'function');
  if (missing.length) {
    throw new Error(
      `pkg-node artifact ${artifactJsRel} is missing function export(s): ${missing.join(', ')}`
    );
  }
  return [...requiredExports].sort();
}

async function main() {
  const root = resolve(argValue('--root', process.cwd()));
  const srcRel = repoRelative(root, argValue('--src', 'packages/compiler-wasm/src'), '--src');
  const artifactRel = repoRelative(
    root,
    argValue('--artifact', 'packages/compiler-wasm/pkg-node'),
    '--artifact'
  );
  const artifactJsRel = repoRelative(
    root,
    argValue('--artifact-js', 'packages/compiler-wasm/pkg-node/holoscript_wasm.js'),
    '--artifact-js'
  );
  const expectedExports = allArgValues('--expect-export');
  const noExportScan = args.includes('--no-export-scan');

  // The package layout (no artifact override) is what every caller runs; there the web build and
  // the receipts are checked too. An explicit --artifact keeps the single-artifact check.
  const packageLayout = !args.includes('--artifact') && !args.includes('--artifact-js');
  const webRel = args.includes('--no-web-artifact')
    ? null
    : args.includes('--web-artifact')
      ? repoRelative(root, argValue('--web-artifact'), '--web-artifact')
      : packageLayout
        ? repoRelative(root, 'packages/compiler-wasm/pkg', '--web-artifact')
        : null;
  const checkReceipts = packageLayout || args.includes('--check-receipts');

  const srcCommit = latestCommit(root, srcRel);
  const freshness = [artifactRel, webRel]
    .filter(Boolean)
    .map((rel) => checkFreshness(root, srcRel, srcCommit, rel));
  if (freshness.some((result) => !result.fresh)) process.exit(1);
  const exports = checkExports(root, srcRel, artifactJsRel, expectedExports, noExportScan);

  let receiptNote = '';
  if (checkReceipts) {
    const problems = [];
    const receipts = [artifactRel, webRel]
      .filter(Boolean)
      .map((rel) => readReceipt(root, rel, problems));
    const commits = new Set(receipts.filter(Boolean).map((receipt) => receipt.sourceCommit));
    if (problems.length === 0 && commits.size > 1) {
      problems.push(
        `the builds name different source commits: ${receipts
          .map((receipt) => `${receipt.rel} ${short(receipt.sourceCommit)}`)
          .join(', ')}. Rebuild both from the same source commit with the same toolchain.`
      );
    }
    if (problems.length > 0) {
      for (const problem of problems) console.error(`[compiler-wasm-drift] ERROR: ${problem}`);
      process.exit(1);
    }
    receiptNote = `; ${receipts.length} receipt${receipts.length === 1 ? '' : 's'} match ${short(
      [...commits][0]
    )}`;
  }

  console.log(
    `[compiler-wasm-drift] PASS ${srcRel}@${short(srcCommit.hash)} <= ${freshness
      .map((result) => `${result.rel}@${short(result.artifactCommit.hash)}${result.stagedArtifactRefresh ? '+staged-refresh' : ''}`)
      .join(', ')} (${exports.length} function export${exports.length === 1 ? '' : 's'} checked${receiptNote})`
  );
}

/**
 * A rebuild receipt is evidence only while it describes the WASM next to it: its wasmSha256 must
 * be the sha256 of that directory's holoscript_wasm_bg.wasm, and it must name a sourceCommit.
 */
function readReceipt(root, rel, problems) {
  const receiptPath = join(root, rel, 'rebuild-receipt.json');
  const wasmPath = join(root, rel, 'holoscript_wasm_bg.wasm');
  if (!existsSync(receiptPath)) {
    problems.push(`${rel}/rebuild-receipt.json is missing; a build with no receipt cannot be checked`);
    return null;
  }
  if (!existsSync(wasmPath)) {
    problems.push(`${rel}/holoscript_wasm_bg.wasm is missing`);
    return null;
  }
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  } catch (error) {
    problems.push(`${rel}/rebuild-receipt.json does not parse: ${error.message}`);
    return null;
  }
  const claimed = receipt?.result?.wasmSha256;
  const sourceCommit = receipt?.sourceCommit;
  const actual = createHash('sha256').update(readFileSync(wasmPath)).digest('hex');
  if (typeof sourceCommit !== 'string' || !/^[0-9a-f]{7,40}$/.test(sourceCommit)) {
    problems.push(`${rel}/rebuild-receipt.json names no sourceCommit`);
    return null;
  }
  if (claimed !== actual) {
    problems.push(
      `${rel}/rebuild-receipt.json says wasmSha256 ${String(claimed).slice(0, 12)} but ${rel}/holoscript_wasm_bg.wasm is ${actual.slice(0, 12)}; the receipt does not describe this build`
    );
    return null;
  }
  return { rel, sourceCommit, wasmSha256: actual };
}

function checkFreshness(root, srcRel, srcCommit, artifactRel) {
  const artifactCommit = latestCommit(root, artifactRel);
  const committedFresh = isAncestor(root, srcCommit.hash, artifactCommit.hash);
  // During pre-commit the pending artifact refresh does not have a commit hash
  // yet. Treat an explicitly staged artifact-path update as the post-commit
  // freshness edge, while still checking the staged JS artifact's exports.
  const stagedArtifactRefresh = hasStagedChanges(root, artifactRel);
  const fresh = committedFresh || stagedArtifactRefresh;
  const name = artifactRel.split('/').pop();

  if (!fresh) {
    console.error(`[compiler-wasm-drift] ERROR: ${name} WASM artifact is stale.`);
    console.error(
      `[compiler-wasm-drift] latest ${srcRel}: ${short(srcCommit.hash)} ${srcCommit.subject}`
    );
    console.error(
      `[compiler-wasm-drift] latest ${artifactRel}: ${short(artifactCommit.hash)} ${artifactCommit.subject}`
    );
    console.error(
      `[compiler-wasm-drift] Rebuild ${artifactRel} from current source and commit the artifact.`
    );
    console.error(
      '[compiler-wasm-drift] If that rebuild is BYTE-IDENTICAL there is nothing to commit under the artifact path, and'
    );
    console.error(
      '[compiler-wasm-drift] repeating the rebuild can never clear this check (freshness is git ancestry, not content).'
    );
    console.error(
      '[compiler-wasm-drift] Parse-side source changes are often byte-identical. In that case record the re-verification:'
    );
    console.error(
      '[compiler-wasm-drift] update pkg-node/rebuild-receipt.json (sourceCommit + verified wasmSha256) and commit it. The'
    );
    console.error(
      '[compiler-wasm-drift] receipt lives inside the artifact path, so committing it advances freshness on evidence.'
    );
  }
  return { rel: artifactRel, fresh, artifactCommit, stagedArtifactRefresh };
}

main().catch((error) => {
  console.error(`[compiler-wasm-drift] ${error.message}`);
  process.exit(1);
});
