#!/usr/bin/env tsx
/**
 * gen-trait-schemas.ts — derive TraitSchema[] from the .holo trait tree so the
 * enum/type prop-schema enforcer ({@link ConfabulationValidator}) can see every trait
 * authors actually wrote, not just the ~63 hand-maintained schemas.
 *
 * Thin CLI wrapper: the derivation logic lives in
 * packages/core/src/compiler/identity/deriveTraitSchema.ts (unit-tested there). This
 * script globs packages/core/src/traits/**\/*.holo, derives each, DEDUPES by trait name,
 * DETECTS .holo-vs-.holo drift (same handler name, divergent schema — e.g. abtest.holo vs
 * devops/abtest.holo), and emits derived-trait-schemas.generated.ts.
 *
 * Regenerate: pnpm gen:trait-schemas
 *
 * Drift policy: a conflicting name keeps the FIRST occurrence in sorted-path order
 * (deterministic) and the conflict is reported to stderr AND recorded in the generated
 * file header so it is visible, never silently resolved.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveTraitFromHolo,
  categorizeTraitConflict,
  isUnionSafeConflict,
  mergeTraitSchemas,
  type TraitUiIssue,
} from '../packages/core/src/compiler/identity/deriveTraitSchema';
import type { TraitSchema } from '../packages/core/src/compiler/identity/ConfabulationValidator';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TRAITS_DIR = path.join(ROOT, 'packages', 'core', 'src', 'traits');
const OUT = path.join(
  ROOT,
  'packages',
  'core',
  'src',
  'compiler',
  'identity',
  'derived-trait-schemas.generated.ts'
);
/**
 * Slim companion to OUT, carrying ONLY the props that declare a `ui:` affordance.
 * Editors (Studio's inspector) import this instead of the ~590 KB full schema array:
 * an authoring affordance is useless to a bundle that cannot afford to load it, and
 * this file grows only as authors actually annotate traits.
 */
const OUT_UI = path.join(
  ROOT,
  'packages',
  'core',
  'src',
  'compiler',
  'identity',
  'derived-trait-ui.generated.ts'
);

/** True when a property carries at least one authoring affordance. */
function hasAffordance(p: TraitSchema['properties'][number]): boolean {
  return (
    p.label !== undefined ||
    p.min !== undefined ||
    p.max !== undefined ||
    p.step !== undefined ||
    p.hidden !== undefined
  );
}

function holoFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => typeof f === 'string' && f.endsWith('.holo'))
    .map((f) => path.join(dir, f))
    .sort();
}

function main(): void {
  const files = holoFiles(TRAITS_DIR); // pre-sorted, so variants[0] is first-in-sorted-path
  const variantsByName = new Map<string, Array<{ schema: TraitSchema; rel: string }>>();
  const uiIssues: Array<{ issue: TraitUiIssue; rel: string }> = [];
  let derived = 0;
  let skipped = 0;

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    let result: ReturnType<typeof deriveTraitFromHolo> = null;
    try {
      result = deriveTraitFromHolo(readFileSync(file, 'utf8'));
    } catch {
      result = null;
    }
    if (!result) {
      skipped++;
      continue;
    }
    derived++;
    for (const issue of result.uiIssues) uiIssues.push({ issue, rel });
    const arr = variantsByName.get(result.schema.name) ?? [];
    arr.push({ schema: result.schema, rel });
    variantsByName.set(result.schema.name, arr);
  }

  // A `ui:` block that does not cohere with its own props is a build failure, not a warning.
  // Unlike a name conflict (two authors, one name — resolvable by policy) this is a single
  // author contradicting themselves, and the affordance silently would not appear. Failing
  // here is what makes the block trustworthy: an editor can render what it reads.
  if (uiIssues.length > 0) {
    process.stderr.write(
      `[gen-trait-schemas] ${uiIssues.length} incoherent ui: entr(ies) — nothing written:\n` +
        uiIssues
          .map(({ issue, rel }) => `  ${rel} @${issue.trait}.${issue.prop}: ${issue.problem}`)
          .join('\n') +
        `\n`
    );
    process.exitCode = 1;
    return;
  }

  // Resolve each name. UNION-SAFE conflicts (enum-divergent / prop-superset) are merged so the
  // registry never false-rejects a value valid in any variant — these leave the conflict set.
  // Judgment conflicts (type-conflict / disjoint = genuinely different traits on one name) keep
  // the first-in-sorted-path variant AND stay in DERIVED_TRAIT_CONFLICTS (advisory suppresses
  // them) until they are renamed/triaged (Phase 2 structural cleanup).
  const resolved: TraitSchema[] = [];
  const conflicts: string[] = [];
  const conflictNames = new Set<string>();
  let mergedCount = 0;
  for (const [name, variants] of variantsByName) {
    if (variants.length === 1) {
      resolved.push(variants[0].schema);
      continue;
    }
    const distinct = new Set(variants.map((v) => JSON.stringify(v.schema)));
    if (distinct.size === 1) {
      resolved.push(variants[0].schema); // identical duplicates — not a conflict
      continue;
    }
    const category = categorizeTraitConflict(variants.map((v) => v.schema));
    if (isUnionSafeConflict(category)) {
      resolved.push(mergeTraitSchemas(variants.map((v) => v.schema)));
      mergedCount++;
      continue;
    }
    resolved.push(variants[0].schema); // first-in-sorted-path
    conflictNames.add(name);
    conflicts.push(
      `  ${name} [${category}]: kept ${variants[0].rel}, suppressed ${variants.length - 1} divergent`
    );
  }
  const sortedConflictNames = [...conflictNames].sort((a, b) => a.localeCompare(b));

  const schemas = resolved.sort((a, b) => a.name.localeCompare(b.name));

  const conflictBlock = conflicts.length
    ? `//\n// ⚠ ${conflicts.length} unresolved name conflict(s) — type-conflict/disjoint, kept first-in-sorted-path\n` +
      `// and listed in DERIVED_TRAIT_CONFLICTS (advisory suppresses them until renamed/triaged):\n${conflicts
        .map((c) => `//${c}`)
        .join('\n')}\n`
    : '//\n// No unresolved name conflicts.\n';

  const header =
    `// @generated by scripts/gen-trait-schemas.ts — DO NOT EDIT.\n` +
    `// Regenerate: pnpm gen:trait-schemas\n` +
    `// Source of truth: packages/core/src/traits/**/*.holo\n` +
    `// ${derived} trait(s) derived, ${schemas.length} unique; ${mergedCount} union-safe conflict(s) merged, ` +
    `${conflicts.length} unresolved (suppressed); ${skipped} file(s) skipped (no clean @trait).\n` +
    conflictBlock;

  const body =
    `import type { TraitSchema } from './ConfabulationValidator';\n\n` +
    `export const DERIVED_TRAIT_SCHEMAS: TraitSchema[] = ${JSON.stringify(schemas, null, 2)};\n\n` +
    `/**\n` +
    ` * Trait names whose derived schema was resolved via a .holo-vs-.holo conflict\n` +
    ` * (same handler name, divergent props across files; first-in-sorted-path kept).\n` +
    ` * The registry may hold the WRONG variant for these, so enforcement/advisory\n` +
    ` * surfaces should suppress or flag them until the conflicts are triaged (Phase 2).\n` +
    ` */\n` +
    `export const DERIVED_TRAIT_CONFLICTS: string[] = ${JSON.stringify(sortedConflictNames, null, 2)};\n`;

  writeFileSync(OUT, `${header}\n${body}`, 'utf8');

  // ── Slim editor artifact: only props that declare an affordance ──────────────
  // A trait name in DERIVED_TRAIT_CONFLICTS is claimed by two or more genuinely different
  // traits (e.g. `transform` = the spatial position/rotation/scale trait AND a data-transform
  // pipeline). The registry keeps ONE variant, first-in-sorted-path — a tie-break, not a
  // judgment. An editor looks affordances up BY NAME, so shipping them for an ambiguous name
  // would silently paint one trait's labels and ranges onto a different trait. Refuse instead
  // of guessing: the editor falls back to its own defaults, which is what it did before.
  const uiByTrait: Record<string, TraitSchema['properties']> = {};
  const suppressedAmbiguous: string[] = [];
  for (const schema of schemas) {
    const annotated = schema.properties.filter(hasAffordance);
    if (annotated.length === 0) continue;
    if (conflictNames.has(schema.name)) {
      suppressedAmbiguous.push(schema.name);
      continue;
    }
    uiByTrait[schema.name] = annotated;
  }
  // Never a silent cap: say what was dropped and why.
  if (suppressedAmbiguous.length > 0) {
    process.stderr.write(
      `[gen-trait-schemas] ${suppressedAmbiguous.length} annotated trait(s) withheld from the ` +
        `editor artifact — name claimed by more than one trait, so which one an author meant ` +
        `is unknowable: ${suppressedAmbiguous.sort().join(', ')}\n`
    );
  }
  const uiTraitCount = Object.keys(uiByTrait).length;
  const uiPropCount = Object.values(uiByTrait).reduce((n, ps) => n + ps.length, 0);

  const uiBody =
    `// @generated by scripts/gen-trait-schemas.ts — DO NOT EDIT.\n` +
    `// Regenerate: pnpm gen:trait-schemas\n` +
    `// Source of truth: the \`ui:\` blocks in packages/core/src/traits/**/*.holo\n` +
    `//\n` +
    `// Slim companion to derived-trait-schemas.generated.ts: ONLY the properties that declare\n` +
    `// an authoring affordance (label / range / step / hidden), so an editor can import it\n` +
    `// without pulling the full ~590 KB schema array into a client bundle.\n` +
    `// ${uiTraitCount} trait(s), ${uiPropCount} annotated prop(s).\n\n` +
    `import type { TraitPropertySchema } from './ConfabulationValidator';\n\n` +
    `/**\n` +
    ` * Per-trait authoring affordances, keyed by trait name (\`@\`-stripped).\n` +
    ` * A trait absent here declares no affordances — editors fall back to their own defaults.\n` +
    ` */\n` +
    `export const TRAIT_UI_AFFORDANCES: Readonly<Record<string, readonly TraitPropertySchema[]>> = ${JSON.stringify(uiByTrait, null, 2)};\n`;

  writeFileSync(OUT_UI, uiBody, 'utf8');

  process.stdout.write(
    `[gen-trait-schemas] ${schemas.length} unique schema(s) from ${derived} trait(s); ` +
      `${mergedCount} union-safe merged, ${conflicts.length} unresolved (suppressed), ${skipped} skipped -> ` +
      `${path.relative(ROOT, OUT).replace(/\\/g, '/')}\n` +
      `[gen-trait-schemas] ${uiTraitCount} trait(s) / ${uiPropCount} prop(s) with ui affordances -> ` +
      `${path.relative(ROOT, OUT_UI).replace(/\\/g, '/')}\n`
  );
  if (conflicts.length) {
    process.stderr.write(
      `[gen-trait-schemas] unresolved conflicts (type-conflict/disjoint):\n${conflicts.join('\n')}\n`
    );
  }
}

main();
