#!/usr/bin/env tsx
/**
 * One-time bootstrap: reverse-generate panels/<id>.holo for EVERY view in the
 * hand-TS STUDIO_VIEW_REGISTRY, so the whole 76-view registry becomes .holo-
 * sourced. compile-view-registry.ts then re-derives the registry, and
 * viewRegistry.generated.test.ts pins generated === hand-TS — proving the
 * round-trip is exact before the hand-TS maps are deleted.
 *
 * SKIPS files that already exist (preserves the hand-authored proof-slice panels
 * that already carry real @slot mounts). Panels created here are @view-only when
 * no @slot is known yet — registry metadata is fully migrated; widget-mount
 * wiring (@slot) is the follow-on step.
 *
 * Run once: pnpm tsx scripts/bootstrap-panels-from-registry.ts
 */
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { STUDIO_VIEW_REGISTRY } from '../src/lib/studio/viewRegistry';
import { GENERATED_VIEW_SLOTS } from '../src/lib/studio/viewRegistry.generated';

const PANELS_DIR = join(import.meta.dirname || __dirname, '..', 'src', 'lib', 'studio', 'panels');
mkdirSync(PANELS_DIR, { recursive: true });

/** Emit a HoloScript object literal with unquoted keys (matches the .holo dialect). */
function holoObj(o: Record<string, unknown>): string {
  const parts = Object.entries(o).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `{ ${parts.join(', ')} }`;
}

let created = 0;
let skipped = 0;
for (const v of STUDIO_VIEW_REGISTRY) {
  const file = join(PANELS_DIR, `${v.id}.holo`);
  if (existsSync(file)) {
    skipped++;
    continue;
  }
  // Reverse of compile-view-registry's toDefinition(): the @view carries the
  // resolved source fields so the derived definition is byte-identical.
  const view = {
    id: v.id,
    title: v.title,
    icon: v.icon,
    category: v.category,
    placement: v.defaultPlacement,
    scope: v.workspaceScope,
    gate: v.availabilityGate,
    surfaceClass: v.surfaceClass,
    defaultOpen: v.defaultOpen,
    exclusiveWith: v.exclusiveWith,
  };
  const slot = GENERATED_VIEW_SLOTS[v.id];
  const body = slot
    ? `  object "${slot.component}" @slot(component: "${slot.component}", import: "${slot.import}") {}\n`
    : `  // @slot widget mount pending — registry metadata migrated, render-wiring is the follow-on step\n`;
  const content = `@view(${holoObj(view)})\ncomposition "${v.id}" {\n${body}}\n`;
  writeFileSync(file, content);
  created++;
}
console.log(`bootstrap: created ${created} panel .holo file(s), skipped ${skipped} existing.`);
