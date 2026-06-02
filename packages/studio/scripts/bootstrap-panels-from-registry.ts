#!/usr/bin/env tsx
/**
 * One-time bootstrap: (re)generate panels/<id>.holo for EVERY view in the hand-TS
 * STUDIO_VIEW_REGISTRY, so the whole registry is .holo-sourced. Each @view carries
 * `order` = the view's index in the curated hand-TS registry, so the generated
 * registry (and the command palette built from it) keeps its exact curated order
 * after the flip to generated-as-source — no silent UI reorder.
 *
 * Overwrites all panels (idempotent): @slot mounts are sourced from the previously
 * generated GENERATED_VIEW_SLOTS so the 8 hand-authored mounts are preserved; the
 * rest get a `// @slot pending` body (registry metadata migrated, mount is follow-on).
 *
 * Run once after a registry/order change: pnpm tsx scripts/bootstrap-panels-from-registry.ts
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { STUDIO_VIEW_REGISTRY } from '../src/lib/studio/viewRegistry';
import { GENERATED_VIEW_SLOTS } from '../src/lib/studio/viewRegistry.generated';

const PANELS_DIR = join(import.meta.dirname || __dirname, '..', 'src', 'lib', 'studio', 'panels');
mkdirSync(PANELS_DIR, { recursive: true });

/** HoloScript object literal with unquoted keys (matches the .holo dialect). */
function holoObj(o: Record<string, unknown>): string {
  return `{ ${Object.entries(o).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')} }`;
}

let written = 0;
STUDIO_VIEW_REGISTRY.forEach((v, index) => {
  // Reverse of compile-view-registry's toDefinition(); `order` = curated index.
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
    order: index,
  };
  const slot = GENERATED_VIEW_SLOTS[v.id];
  const body = slot
    ? `  object "${slot.component}" @slot(component: "${slot.component}", import: "${slot.import}") {}\n`
    : `  // @slot widget mount pending — registry metadata migrated, render-wiring is the follow-on step\n`;
  writeFileSync(
    join(PANELS_DIR, `${v.id}.holo`),
    `@view(${holoObj(view)})\ncomposition "${v.id}" {\n${body}}\n`
  );
  written++;
});
console.log(`bootstrap: wrote ${written} panel .holo file(s) with curated order.`);
