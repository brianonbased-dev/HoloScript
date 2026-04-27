#!/usr/bin/env node
/**
 * Audit paper-11 trait property-write-set annotation coverage.
 *
 * Runs the same intersection logic as paper-trait-conflict-census.test.ts:
 *   schemaNames := names in BUILT_IN_TRAIT_SCHEMAS (after @-prefix normalize)
 *   vrSet       := unique names in VR_TRAITS (after @-prefix normalize)
 *   annotated   := |schemaNames ∩ vrSet|
 *
 * "Annotated coverage" is defensible only as the intersection — schema entries
 * that don't appear in VR_TRAITS are orphans (annotation without a deployed
 * trait, or stale name drift). Counting raw BUILT_IN_TRAIT_SCHEMAS.length
 * over-credits coverage.
 *
 * Discovered 2026-04-26 in task_1776980671668_qzkk SSOT verification — the
 * paper currently claims 63/2,800 (2.3%) but the defensible number is
 * 37/2,801 (~1.32%). 26 schema entries are orphans.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const validatorSrc = readFileSync(
  resolve(repoRoot, 'packages/core/src/compiler/identity/ConfabulationValidator.ts'),
  'utf8'
);
const schemaNames = new Set();
for (const m of validatorSrc.matchAll(/^ {4}name: '([^']+)'/gm)) {
  // BUILT_IN_TRAIT_SCHEMAS entries are at 4-space indent (one level inside the array).
  schemaNames.add(m[1]);
}

// Read VR_TRAITS by importing the compiled census artifact's universe count
// for the gold-standard pair count, but enumerate names via the source files
// (the harness re-imports them at test time; here we pull from the artifact
// to stay scriptless).
const censusArtifact = JSON.parse(
  readFileSync(resolve(repoRoot, '.bench-logs/paper-trait-conflict-census.json'), 'utf8')
);

// We can't easily re-enumerate VR_TRAITS without running TS. Instead, we
// trust the harness's own knownSchemaTraitCount as authoritative for the
// intersection size, and use schemaNames.size for the total schemas count.
const intersection = censusArtifact.knownSchemaTraitCount;
const universe = censusArtifact.traitUniverseCount;
const totalSchemas = schemaNames.size;
const orphans = totalSchemas - intersection;

const annotatedPct = ((intersection / universe) * 100).toFixed(2);
const claimedPct = ((totalSchemas / universe) * 100).toFixed(2);

const summary = {
  generatedAt: new Date().toISOString(),
  source: 'scripts/audit-paper-11-coverage.mjs',
  censusArtifact: '.bench-logs/paper-trait-conflict-census.json',
  censusGeneratedAt: censusArtifact.generatedAt,
  validatorPath: 'packages/core/src/compiler/identity/ConfabulationValidator.ts',
  schemaNamesInValidator: totalSchemas,
  vrTraitUniverse: universe,
  schemaNamesInVrTraits: intersection,
  schemaNamesOrphaned: orphans,
  defensibleCoverage: {
    numerator: intersection,
    denominator: universe,
    percent: Number(annotatedPct),
    description: 'BUILT_IN_TRAIT_SCHEMAS ∩ VR_TRAITS / |VR_TRAITS|',
  },
  rawSchemaCountCoverage: {
    numerator: totalSchemas,
    denominator: universe,
    percent: Number(claimedPct),
    description: '|BUILT_IN_TRAIT_SCHEMAS| / |VR_TRAITS| — overcounts; includes orphans',
  },
  paperClaim: {
    text: '63 of 2,800 traits ... carry formal property-write-set annotations (2.3%)',
    file: 'research/paper-11-hsplus-ecoop.tex',
    line: 718,
    matches: 'rawSchemaCountCoverage (overcounts — includes orphans)',
    defensibleReplacement: `${intersection} of ${universe.toLocaleString()} traits ... ${annotatedPct}\\%`,
  },
};

const outFile = resolve(repoRoot, '.bench-logs/paper-11-coverage-audit.json');
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(summary, null, 2), 'utf8');

console.log('[paper-11-coverage-audit]', JSON.stringify(summary, null, 2));
console.log(`\nWrote: ${outFile}`);
