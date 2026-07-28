#!/usr/bin/env tsx
/**
 * audit-trait-schema-conflicts.ts — REPORT-ONLY categorization of the .holo-vs-.holo trait
 * schema conflicts (Phase 2 triage of the trait props-schema enforcer).
 *
 * The generator resolves ~439 conflicting trait names by first-in-sorted-path, which is a coin
 * flip, not a resolution (premortem 2026-07-17). This script categorizes each conflict so the
 * cleanup is data-driven, not 439 blind judgments:
 *
 *   - enum-divergent : same prop names + types across variants, only enumValues differ.
 *                      SAFE to resolve by UNION (accept any value valid in any variant — never
 *                      false-rejects; only misses cross-variant confusion, the safe direction).
 *   - prop-superset  : one variant's props are a superset of another's, no contradictions.
 *                      SAFE to resolve by UNION.
 *   - type-conflict  : some shared prop has different TYPES across variants. NOT union-safe
 *                      (which type wins is a real judgment) — keep suppressed / needs rename.
 *   - disjoint       : variants share <50% of prop names — likely GENUINELY DIFFERENT traits
 *                      colliding on one handler name. Needs a rename, not a merge.
 *
 * Gates nothing. Run: pnpm tsx scripts/holo-ci/audit-trait-schema-conflicts.ts [--json] [--list <cat>]
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveTraitSchemaFromHolo,
  categorizeTraitConflict,
  type TraitConflictCategory,
} from '../../packages/core/src/compiler/identity/deriveTraitSchema';
import type { TraitSchema } from '../../packages/core/src/compiler/identity/ConfabulationValidator';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const TRAITS_DIR = path.join(ROOT, 'packages', 'core', 'src', 'traits');

const jsonOut = process.argv.includes('--json');
const listIdx = process.argv.indexOf('--list');
const listCat = listIdx >= 0 ? process.argv[listIdx + 1] : null;

function holoFiles(dir: string, acc: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) holoFiles(path.join(dir, e.name), acc);
    else if (e.isFile() && e.name.endsWith('.holo')) acc.push(path.join(dir, e.name));
  }
}

// Categorization is the shared core logic (categorizeTraitConflict) so the generator's merge
// decision and this triage report can never drift apart.
type Category = TraitConflictCategory;

function main(): void {
  const files: string[] = [];
  holoFiles(TRAITS_DIR, files);
  files.sort();

  const byName = new Map<string, Array<{ rel: string; schema: TraitSchema }>>();
  for (const f of files) {
    let schema: TraitSchema | null = null;
    try {
      schema = deriveTraitSchemaFromHolo(readFileSync(f, 'utf8'));
    } catch {
      schema = null;
    }
    if (!schema) continue;
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const arr = byName.get(schema.name) ?? [];
    arr.push({ rel, schema });
    byName.set(schema.name, arr);
  }

  const conflicts: Array<{ name: string; category: Category; files: string[] }> = [];
  for (const [name, variants] of byName) {
    if (variants.length < 2) continue;
    const distinct = new Set(variants.map((v) => JSON.stringify(v.schema)));
    if (distinct.size < 2) continue; // identical duplicates — not a schema conflict
    const category = categorizeTraitConflict(variants.map((v) => v.schema));
    conflicts.push({ name, category, files: variants.map((v) => v.rel) });
  }
  conflicts.sort((a, b) => a.name.localeCompare(b.name));

  const counts: Record<Category, number> = {
    'enum-divergent': 0,
    'prop-superset': 0,
    'type-conflict': 0,
    disjoint: 0,
  };
  for (const c of conflicts) counts[c.category]++;
  const unionSafe = counts['enum-divergent'] + counts['prop-superset'];
  const needsJudgment = counts['type-conflict'] + counts.disjoint;

  if (jsonOut) {
    process.stdout.write(
      `${JSON.stringify({ total: conflicts.length, counts, unionSafe, needsJudgment, conflicts }, null, 2)}\n`
    );
    return;
  }
  if (listCat) {
    for (const c of conflicts.filter((c) => c.category === listCat)) {
      console.log(`  ${c.name} [${c.category}]`);
      for (const f of c.files) console.log(`      ${f}`);
    }
    return;
  }

  console.log('[audit-trait-schema-conflicts] REPORT-ONLY — gates nothing.');
  console.log(`  total conflicting trait names: ${conflicts.length}`);
  console.log(`  UNION-SAFE (auto-resolvable by merge): ${unionSafe}`);
  console.log(`    enum-divergent: ${counts['enum-divergent']}`);
  console.log(`    prop-superset:  ${counts['prop-superset']}`);
  console.log(`  NEEDS JUDGMENT (rename/pick-a-type): ${needsJudgment}`);
  console.log(`    type-conflict:  ${counts['type-conflict']}`);
  console.log(`    disjoint:       ${counts.disjoint}`);
  console.log(
    `  (list a category: --list enum-divergent | prop-superset | type-conflict | disjoint)`
  );
}

main();
