#!/usr/bin/env node
/**
 * The executable spec (I2, spec-as-corpus): every case in
 * packages/compiler-wasm/spec-corpus/hsplus-spec-corpus.v0.jsonl is a NORMATIVE claim about the
 * language — source text plus the verdict the grammar authority must reach (and, for invalid
 * cases, a substring the diagnostic must contain). This runner replays all of them against the
 * REAL pkg-node WASM artifact and fails on any drift.
 *
 * Why a corpus and not prose: prose specs exist because humans read them; agents need runnable
 * truth. The corpus is machine-verifiable (this runner), diffable (a grammar change that moves a
 * verdict shows up as a reviewable corpus diff, not a silent reinterpretation), provenance-pinned
 * (the manifest records the authority build that verified it), and trainable (rows are
 * source+verdict pairs). The format papers cite THIS artifact, not paragraphs.
 *
 * DELIBERATELY DISTINCT from the ecosystem "conformance" subsystem
 * (packages/mcp-server/src/conformance/ — an ARTIFACT admission gate over worlds/shards/NPCs
 * JSON, no parsing): this corpus governs the LANGUAGE and executes against the grammar authority.
 * It also deliberately binds to the WASM artifact, never the TS parsers — the TS fallback drops
 * field annotations, and a spec verified against a non-authority parser would be a second
 * authority (the exact dual-grammar failure the language-strata work retired).
 *
 * Usage:
 *   node scripts/holo-ci/check-spec-corpus.mjs                  # report
 *   node scripts/holo-ci/check-spec-corpus.mjs --strict         # exit 1 on any drift/mismatch
 *   node scripts/holo-ci/check-spec-corpus.mjs --update-manifest # re-pin after a verified run
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const corpusDir = path.join(repoRoot, 'packages', 'compiler-wasm', 'spec-corpus');
const corpusPath = path.join(corpusDir, 'hsplus-spec-corpus.v0.jsonl');
const manifestPath = path.join(corpusDir, 'hsplus-spec-corpus.v0.manifest.json');
const artifactJs = path.join(repoRoot, 'packages', 'compiler-wasm', 'pkg-node', 'holoscript_wasm.js');
const artifactWasm = path.join(repoRoot, 'packages', 'compiler-wasm', 'pkg-node', 'holoscript_wasm_bg.wasm');

const strict = process.argv.includes('--strict');
const updateManifest = process.argv.includes('--update-manifest');
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function fail(message) {
  console.error(`[spec-corpus] FAIL — ${message}`);
  process.exit(1);
}

if (!fs.existsSync(corpusPath)) fail(`corpus missing: ${corpusPath}`);
if (!fs.existsSync(artifactJs) || !fs.existsSync(artifactWasm)) {
  fail('grammar-authority artifact (pkg-node) is missing — build it before running the executable spec');
}

const requireCjs = createRequire(import.meta.url);
const wasm = requireCjs(artifactJs);
const corpusBytes = fs.readFileSync(corpusPath);
const corpusSha = sha256(corpusBytes);
const artifactSha = sha256(fs.readFileSync(artifactWasm));

const cases = corpusBytes
  .toString('utf8')
  .trim()
  .split('\n')
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      fail(`corpus line ${index + 1} is not valid JSON: ${error.message}`);
      return null;
    }
  });

const seen = new Set();
const drifts = [];
const sectionCounts = {};
for (const testCase of cases) {
  if (seen.has(testCase.id)) fail(`duplicate case id: ${testCase.id}`);
  seen.add(testCase.id);
  sectionCounts[testCase.section] = (sectionCounts[testCase.section] ?? 0) + 1;

  const result = JSON.parse(wasm.validate_detailed(testCase.source));
  const verdictOk = result.valid === testCase.expect.valid;
  const diagnosticOk =
    !testCase.expect.diagnostic_includes ||
    (result.errors ?? []).some((error) => String(error.message).includes(testCase.expect.diagnostic_includes));

  if (!verdictOk || !diagnosticOk) {
    drifts.push({
      id: testCase.id,
      title: testCase.title,
      expected: testCase.expect,
      got: { valid: result.valid, errors: (result.errors ?? []).map((e) => String(e.message).slice(0, 120)) },
    });
  }
}

console.log(
  `[spec-corpus] ${cases.length - drifts.length}/${cases.length} normative cases hold against authority wasm ${artifactSha.slice(0, 12)}…`
);

if (drifts.length > 0) {
  console.error(`[spec-corpus] ${drifts.length} case(s) DRIFTED — the language no longer means what the spec says:`);
  for (const drift of drifts) {
    console.error(`  ✗ ${drift.id} — ${drift.title}`);
    console.error(`    expected ${JSON.stringify(drift.expected)} got ${JSON.stringify(drift.got)}`);
  }
  console.error('[spec-corpus] Either the grammar change is wrong, or the SPEC changed — if intended, update the');
  console.error('[spec-corpus] corpus case in the same commit so the meaning change is reviewable, then re-pin');
  console.error('[spec-corpus] with --update-manifest. Never let verdict drift ride along silently.');
  process.exit(1);
}

if (updateManifest) {
  const manifest = {
    schema: 'holoscript.hsplus-spec-corpus.manifest.v0',
    corpus: path.relative(repoRoot, corpusPath).split(path.sep).join('/'),
    corpus_sha256: `sha256:${corpusSha}`,
    cases: cases.length,
    sections: sectionCounts,
    authority: {
      artifact: 'packages/compiler-wasm/pkg-node/holoscript_wasm_bg.wasm',
      wasmSha256: `sha256:${artifactSha}`,
      note: 'The authority build every verdict in this corpus release was verified against. If the artifact hash no longer matches, rerun this script: all-verdicts-hold means the spec is stable under the new build (re-pin with --update-manifest); any drift means the language moved.',
    },
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[spec-corpus] manifest pinned: ${cases.length} cases, corpus sha256:${corpusSha.slice(0, 12)}…`);
  process.exit(0);
}

if (!fs.existsSync(manifestPath)) {
  const message = 'manifest missing — run with --update-manifest after a verified run to pin the release';
  if (strict) fail(message);
  console.warn(`[spec-corpus] WARN — ${message}`);
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const corpusPinOk = manifest.corpus_sha256 === `sha256:${corpusSha}`;
const authorityPinOk = manifest.authority?.wasmSha256 === `sha256:${artifactSha}`;
if (!corpusPinOk) {
  const message = 'corpus bytes do not match the manifest pin — corpus edited without re-pinning (--update-manifest)';
  if (strict) fail(message);
  console.warn(`[spec-corpus] WARN — ${message}`);
}
if (!authorityPinOk) {
  const message =
    'authority artifact differs from the manifest pin; verdicts all hold, so the spec is stable under this build — re-pin with --update-manifest to record it';
  if (strict) fail(message);
  console.warn(`[spec-corpus] WARN — ${message}`);
}
if (corpusPinOk && authorityPinOk) {
  console.log('[spec-corpus] OK — corpus and authority pins verified. The spec is executable, and it passed. (I2)');
}
