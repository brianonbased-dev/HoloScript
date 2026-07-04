#!/usr/bin/env node
/**
 * Fails when the committed compiler-wasm source is newer than the committed
 * pkg-node WASM artifact. This catches the drift where Rust source changes land
 * but the ready-to-run Node WASM package still exposes an older API surface.
 */
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

  const srcCommit = latestCommit(root, srcRel);
  const artifactCommit = latestCommit(root, artifactRel);
  const fresh = isAncestor(root, srcCommit.hash, artifactCommit.hash);

  if (!fresh) {
    console.error('[compiler-wasm-drift] ERROR: pkg-node WASM artifact is stale.');
    console.error(
      `[compiler-wasm-drift] latest ${srcRel}: ${short(srcCommit.hash)} ${srcCommit.subject}`
    );
    console.error(
      `[compiler-wasm-drift] latest ${artifactRel}: ${short(artifactCommit.hash)} ${artifactCommit.subject}`
    );
    console.error(
      '[compiler-wasm-drift] Rebuild packages/compiler-wasm/pkg-node from current source and commit the artifact.'
    );
    process.exit(1);
  }

  const exports = checkExports(root, srcRel, artifactJsRel, expectedExports, noExportScan);

  console.log(
    `[compiler-wasm-drift] PASS ${srcRel}@${short(srcCommit.hash)} <= ${artifactRel}@${short(
      artifactCommit.hash
    )} (${exports.length} function export${exports.length === 1 ? '' : 's'} checked)`
  );
}

main().catch((error) => {
  console.error(`[compiler-wasm-drift] ${error.message}`);
  process.exit(1);
});
