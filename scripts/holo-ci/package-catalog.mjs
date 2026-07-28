#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const OUTPUT = join(ROOT, 'docs', 'packages', 'catalog.generated.md');
const args = new Set(process.argv.slice(2));

const paths = {
  release: join(__dirname, 'npm-v1-release-manifest.json'),
  consumption: join(__dirname, 'package-consumption-manifest.json'),
  stewardship: join(__dirname, 'package-stewardship-manifest.json'),
};

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function packageManifests(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (!statSync(path).isDirectory()) continue;
    const manifest = join(path, 'package.json');
    if (existsSync(manifest)) found.push(manifest);
    found.push(...packageManifests(path));
  }
  return found;
}

function escapeCell(value) {
  return String(value ?? '—')
    .replaceAll('|', '\\|')
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ');
}

function buildCatalog() {
  const release = readJson(paths.release);
  const consumption = readJson(paths.consumption);
  const stewardship = readJson(paths.stewardship);
  const manifests = new Map();

  for (const path of packageManifests(join(ROOT, 'packages'))) {
    const manifest = readJson(path);
    if (manifest.name) manifests.set(manifest.name, { path, manifest });
  }

  const fleetReceipts = new Map(
    (consumption.npmPackages || []).map((entry) => [entry.name, entry])
  );
  const candidateReceipts = new Map(
    (consumption.candidateNpmPackages || []).map((entry) => [entry.name, entry])
  );
  const stewards = new Map(
    (stewardship.packages || [])
      .filter((entry) => entry.registry === 'npm')
      .map((entry) => [entry.packageName, entry])
  );

  const errors = [];
  const candidates = (release.candidatePackages || [])
    .map((candidate) => {
      const packageRecord = manifests.get(candidate.name);
      const receipt = fleetReceipts.get(candidate.name) || candidateReceipts.get(candidate.name);
      const receiptLane = fleetReceipts.has(candidate.name) ? 'fleet' : 'candidate';
      const steward = stewards.get(candidate.name);

      if (!packageRecord) errors.push(`${candidate.name}: package.json not found`);
      if (!receipt) errors.push(`${candidate.name}: consumption receipt row not found`);

      return {
        name: candidate.name,
        version: packageRecord?.manifest.version || 'missing',
        role: candidate.role || 'unspecified',
        receiptLane: receipt ? receiptLane : 'missing',
        consumers: receipt?.requiredBy?.join(', ') || 'none',
        stewardship: steward?.status || 'unmapped',
        packageDir:
          receipt?.packageDir ||
          (packageRecord
            ? relative(ROOT, dirname(packageRecord.path)).replaceAll('\\', '/')
            : 'missing'),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const conformance = gatherConformanceEvidence();

  const nativeLibraries = [...manifests.entries()]
    .filter(([, record]) => record.manifest.holoscript?.artifact === 'library')
    .map(([name, record]) => {
      const native = record.manifest.holoscript;
      const declaredTargets = native.compatibility?.targets || [];
      const conformanceSummary = summarizeConformance(declaredTargets, conformance);
      return {
        name,
        version: record.manifest.version || 'missing',
        supportTier: native.supportTier || 'unspecified',
        entrypoint: native.entrypoint || 'missing',
        targets: declaredTargets.join(', ') || 'unspecified',
        conformance: conformanceSummary.cell,
        runtimeBoundary: native.runtimeBoundary || 'not declared',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const row of nativeLibraries) {
    const tier = row.supportTier;
    const gatedTiers = new Set(['preview', 'stable', 'supported']);
    if (gatedTiers.has(tier)) {
      const declaredTargets = row.targets.split(', ').filter(Boolean);
      const summary = summarizeConformance(declaredTargets, conformance);
      if (!summary.allTargetsPass || !summary.crossTargetEqual) {
        errors.push(
          `${row.name}: support tier "${tier}" requires fresh passing conformance receipts for every declared target plus a cross-target EQUAL receipt (have: ${summary.cell})`
        );
      }
    }
  }

  if (new Set(candidates.map((candidate) => candidate.name)).size !== candidates.length) {
    errors.push('release candidate names are not unique');
  }

  return { candidates, nativeLibraries, errors };
}

function sha256File(path) {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

function gatherConformanceEvidence() {
  const reportsDir = join(ROOT, 'reports', 'library-coherence');
  const vectorsPin = 'packages/std/conformance/generated/std-abi-vectors.v0.jsonl';
  const vectorsPath = join(ROOT, ...vectorsPin.split('/'));
  const currentVectorsSha = existsSync(vectorsPath) ? sha256File(vectorsPath) : null;

  const perTarget = new Map();
  let crossTarget = null;
  if (!existsSync(reportsDir)) return { perTarget, crossTarget, currentVectorsSha };

  for (const entry of readdirSync(reportsDir)) {
    if (!entry.endsWith('.json')) continue;
    let receipt;
    try {
      receipt = readJson(join(reportsDir, entry));
    } catch {
      continue;
    }
    const schema = String(receipt.schema || '');
    if (schema === 'holoscript.std-abi-conformance.cross-target.v0') {
      crossTarget = receipt;
      continue;
    }
    if (!schema.startsWith('holoscript.std-abi-conformance.')) continue;
    const pinned = receipt.sources?.[vectorsPin]?.sha256;
    const fresh = Boolean(currentVectorsSha && pinned === currentVectorsSha);
    const passed = receipt.summary?.failed === 0 && (receipt.summary?.vectors ?? 0) > 0;
    perTarget.set(receipt.target, {
      fresh,
      passed,
      vectors: receipt.summary?.vectors ?? 0,
      passedCount: receipt.summary?.passed ?? 0,
    });
  }
  return { perTarget, crossTarget, currentVectorsSha };
}

function summarizeConformance(declaredTargets, conformance) {
  if (declaredTargets.length === 0) {
    return { cell: 'no declared targets', allTargetsPass: false, crossTargetEqual: false };
  }
  const parts = [];
  let allTargetsPass = true;
  for (const target of declaredTargets) {
    const evidence = conformance.perTarget.get(target);
    if (evidence && evidence.passed && evidence.fresh) {
      parts.push(`${target} ✓ ${evidence.passedCount}/${evidence.vectors}`);
    } else if (evidence && evidence.passed && !evidence.fresh) {
      parts.push(`${target} stale-pin`);
      allTargetsPass = false;
    } else {
      parts.push(`${target} —`);
      allTargetsPass = false;
    }
  }
  const crossTargetEqual = conformance.crossTarget?.verdict === 'EQUAL';
  parts.push(crossTargetEqual ? 'cross-target EQUAL' : 'cross-target —');
  return { cell: parts.join('; '), allTargetsPass, crossTargetEqual };
}

function renderMarkdown(catalog) {
  const lines = [
    '# Generated Package Catalog',
    '',
    '> Generated by `node scripts/holo-ci/package-catalog.mjs --write`. Do not edit by hand.',
    '',
    'This catalog is the deterministic view of the npm v1 release candidates and compiler-native HoloScript library artifacts. It is derived from the release, consumption, stewardship, and package manifests; the broader narrative package index remains a discovery guide.',
    '',
    `## npm v1 candidates (${catalog.candidates.length})`,
    '',
    '| Package | Version | Release role | Receipt lane | Consumers | Stewardship | Source directory |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...catalog.candidates.map(
      (row) =>
        `| \`${escapeCell(row.name)}\` | \`${escapeCell(row.version)}\` | ${escapeCell(row.role)} | ${escapeCell(row.receiptLane)} | ${escapeCell(row.consumers)} | ${escapeCell(row.stewardship)} | \`${escapeCell(row.packageDir)}\` |`
    ),
    '',
    'Receipt lane semantics:',
    '',
    '- `fleet`: package has a fleet-consumption receipt row.',
    '- `candidate`: package has a repo-less candidate consumption receipt row; this is not a fleet deployment claim.',
    '',
    `## Compiler-native library artifacts (${catalog.nativeLibraries.length})`,
    '',
    '| Package | Version | Support tier | Entrypoint | Targets | Execution conformance | Runtime boundary |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...catalog.nativeLibraries.map(
      (row) =>
        `| \`${escapeCell(row.name)}\` | \`${escapeCell(row.version)}\` | ${escapeCell(row.supportTier)} | \`${escapeCell(row.entrypoint)}\` | ${escapeCell(row.targets)} | ${escapeCell(row.conformance)} | ${escapeCell(row.runtimeBoundary)} |`
    ),
    '',
    'A compiler-native artifact declaration proves package metadata and shipped source paths. It does not by itself prove execution parity, registry deployment, authorship, or reproducible builds.',
    '',
    'Execution conformance is derived from `holoscript.std-abi-conformance.*` receipts in `reports/library-coherence/` whose pinned vector corpus matches the current generated corpus. Support tiers above `experimental` are gate-checked: every declared target needs a fresh passing receipt and the cross-target receipt must be EQUAL, otherwise catalog generation fails.',
    '',
    '## Canonical inputs',
    '',
    '- `scripts/holo-ci/npm-v1-release-manifest.json`',
    '- `scripts/holo-ci/package-consumption-manifest.json`',
    '- `scripts/holo-ci/package-stewardship-manifest.json`',
    '- `packages/**/package.json`',
    '',
  ];
  return lines.join('\n');
}

function main() {
  const catalog = buildCatalog();
  if (catalog.errors.length > 0) {
    for (const error of catalog.errors) console.error(`[package-catalog] ERROR ${error}`);
    process.exit(1);
  }

  const rendered = renderMarkdown(catalog);
  if (args.has('--self-test')) {
    if (catalog.candidates.length !== 19) {
      throw new Error(`expected 19 npm v1 candidates, found ${catalog.candidates.length}`);
    }
    if (!catalog.nativeLibraries.some((entry) => entry.name === '@holoscript/std')) {
      throw new Error('expected @holoscript/std compiler-native library artifact');
    }
    console.log('[package-catalog] self-test PASS');
    return;
  }

  if (args.has('--check')) {
    if (!existsSync(OUTPUT) || readFileSync(OUTPUT, 'utf8').replaceAll('\r\n', '\n') !== rendered) {
      console.error('[package-catalog] generated catalog is stale; run with --write');
      process.exit(1);
    }
    console.log(
      `[package-catalog] PASS candidates=${catalog.candidates.length} nativeLibraries=${catalog.nativeLibraries.length}`
    );
    return;
  }

  if (args.has('--write')) {
    writeFileSync(OUTPUT, rendered, 'utf8');
    console.log(`[package-catalog] wrote ${relative(ROOT, OUTPUT)}`);
    return;
  }

  process.stdout.write(rendered);
}

main();
