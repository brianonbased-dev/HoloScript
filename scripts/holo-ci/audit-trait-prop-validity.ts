#!/usr/bin/env tsx
/**
 * audit-trait-prop-validity.ts — REPORT-ONLY quantification of trait prop-schema
 * violations (enum/type) across composition .holo files, using the derived-schema
 * registry. Phase 0 of the trait props-schema enforcer rollout.
 *
 * WHY REPORT-ONLY (premortem, 2026-07-17): ConfabulationValidator pushes enum/type
 * violations to result.errors UNCONDITIONALLY — `strict:false` gates only warnings, not
 * these. And the shared native-validity guard (assert-really-valid) has no severity axis
 * (`ok = diagnostics.length===0`), so wiring the engine there would hard-fail the corpus
 * and eval gates. This script gates NOTHING (never process.exit(1)); it measures the real
 * violation count so the 459 .holo-vs-.holo conflict cleanup (Phase 2) can be scoped
 * before any gate wiring (Phase 3).
 *
 * CRITICAL PARTITION: the derived registry keeps the first-in-sorted-path variant for 459
 * conflicting trait names, so a violation whose trait is in that set is a FALSE-POSITIVE
 * SUSPECT (the registry may hold the wrong enum set), NOT a candidate-true violation.
 * Reporting one number without this partition would misrepresent the real gap.
 *
 * Usage:
 *   pnpm tsx scripts/holo-ci/audit-trait-prop-validity.ts            # human summary
 *   pnpm tsx scripts/holo-ci/audit-trait-prop-validity.ts --json     # machine JSON
 *   pnpm tsx scripts/holo-ci/audit-trait-prop-validity.ts --samples 20
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHolo } from '../../packages/core/src/parser/HoloCompositionParser';
import { ConfabulationValidator } from '../../packages/core/src/compiler/identity/ConfabulationValidator';
import { deriveTraitSchemaFromHolo } from '../../packages/core/src/compiler/identity/deriveTraitSchema';
import type { HoloComposition } from '../../packages/core/src/parser/HoloCompositionTypes';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SCAN_ROOTS = [path.join(ROOT, 'packages'), path.join(ROOT, 'examples')];
const TRAITS_DIR = path.join(ROOT, 'packages', 'core', 'src', 'traits');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo', 'out', 'target']);

const jsonOut = process.argv.includes('--json');
const samplesIdx = process.argv.indexOf('--samples');
const maxSamples = samplesIdx >= 0 ? Number(process.argv[samplesIdx + 1]) || 20 : 20;

function walkHolo(dir: string, acc: string[]): void {
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walkHolo(path.join(dir, e.name), acc);
    } else if (e.isFile() && e.name.endsWith('.holo')) {
      acc.push(path.join(dir, e.name));
    }
  }
}

/** Recompute the set of trait names the derived registry resolves via conflict (first-in-path wins). */
function conflictTraitNames(): Set<string> {
  const files: string[] = [];
  walkHolo(TRAITS_DIR, files);
  files.sort();
  const seen = new Map<string, string>(); // name -> JSON of first schema
  const conflicts = new Set<string>();
  for (const f of files) {
    let schema = null;
    try {
      schema = deriveTraitSchemaFromHolo(readFileSync(f, 'utf8'));
    } catch {
      schema = null;
    }
    if (!schema) continue;
    const json = JSON.stringify(schema);
    const prev = seen.get(schema.name);
    if (prev === undefined) seen.set(schema.name, json);
    else if (prev !== json) conflicts.add(schema.name);
  }
  return conflicts;
}

function main(): void {
  const conflicts = conflictTraitNames();
  const validator = new ConfabulationValidator({
    includeDerivedSchemas: true,
    // Keep the audit focused on prop-schema (enum/type) violations, not requires/conflicts
    // graph checks, whose derived data is not part of this rollout's scope.
    validatePrerequisites: false,
    validateConflicts: false,
  });

  const files: string[] = [];
  for (const r of SCAN_ROOTS) walkHolo(r, files);

  let filesScanned = 0;
  let parseFailed = 0;
  let compositionsWithObjects = 0;
  let compositionsClean = 0;
  let compositionsWithViolations = 0;
  const byCode: Record<string, number> = {};
  const byCodeFpSuspect: Record<string, number> = {};
  const suspectTraits = new Set<string>();
  const trueTraits = new Set<string>();
  const samples: Array<{ file: string; code: string; trait?: string; message: string; fpSuspect: boolean }> = [];

  for (const file of files) {
    filesScanned++;
    let ast: unknown;
    try {
      const res = parseHolo(readFileSync(file, 'utf8'));
      if (res.errors.length > 0) {
        parseFailed++;
        continue;
      }
      ast = res.ast;
    } catch {
      parseFailed++;
      continue;
    }
    const comp = ast as HoloComposition;
    if (!comp.objects || comp.objects.length === 0) continue; // trait-def / non-composition — nothing to enforce
    compositionsWithObjects++;

    const result = validator.validateComposition(comp);
    if (result.errors.length === 0) {
      compositionsClean++;
      continue;
    }
    compositionsWithViolations++;
    for (const err of result.errors) {
      const code = String(err.code);
      const trait = (err as { traitName?: string }).traitName;
      const fpSuspect = trait !== undefined && conflicts.has(trait);
      byCode[code] = (byCode[code] ?? 0) + 1;
      if (fpSuspect) {
        byCodeFpSuspect[code] = (byCodeFpSuspect[code] ?? 0) + 1;
        if (trait) suspectTraits.add(trait);
      } else if (trait) {
        trueTraits.add(trait);
      }
      if (samples.length < maxSamples) {
        samples.push({
          file: path.relative(ROOT, file).replace(/\\/g, '/'),
          code,
          trait,
          message: String((err as { message?: string }).message ?? ''),
          fpSuspect,
        });
      }
    }
  }

  const totalViolations = Object.values(byCode).reduce((a, b) => a + b, 0);
  const fpSuspectViolations = Object.values(byCodeFpSuspect).reduce((a, b) => a + b, 0);
  const report = {
    scannedFiles: filesScanned,
    parseFailed,
    compositionsWithObjects,
    compositionsClean,
    compositionsWithViolations,
    conflictTraitNameCount: conflicts.size,
    totalViolations,
    candidateTrueViolations: totalViolations - fpSuspectViolations,
    fpSuspectViolations,
    byCode,
    byCodeFpSuspect,
    candidateTrueTraitCount: trueTraits.size,
    fpSuspectTraitCount: suspectTraits.size,
    samples,
  };

  if (jsonOut) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  console.log('[audit-trait-prop-validity] REPORT-ONLY — gates nothing.');
  console.log(`  scanned .holo files:        ${report.scannedFiles} (${report.parseFailed} parse-failed, skipped)`);
  console.log(`  compositions (has objects): ${report.compositionsWithObjects}`);
  console.log(`    clean:                    ${report.compositionsClean}`);
  console.log(`    with violations:          ${report.compositionsWithViolations}`);
  console.log(`  total prop violations:      ${report.totalViolations}`);
  console.log(`    candidate-TRUE:           ${report.candidateTrueViolations}  (${report.candidateTrueTraitCount} distinct traits)`);
  console.log(`    FALSE-POSITIVE suspects:  ${report.fpSuspectViolations}  (trait in the ${report.conflictTraitNameCount}-conflict set)`);
  console.log(`  by code (all):              ${JSON.stringify(report.byCode)}`);
  console.log(`  by code (fp-suspect):       ${JSON.stringify(report.byCodeFpSuspect)}`);
  if (report.samples.length) {
    console.log('  samples:');
    for (const s of report.samples) {
      console.log(`    [${s.fpSuspect ? 'FP?' : 'TRUE'}] ${s.code} @${s.trait ?? '?'} — ${s.file}`);
    }
  }
}

main();
