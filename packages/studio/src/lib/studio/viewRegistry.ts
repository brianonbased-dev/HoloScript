'use client';

import type { StudioSurfaceClass } from './surfaceClassification';
import { GENERATED_VIEW_IDS, GENERATED_VIEW_REGISTRY } from './viewRegistry.generated';

/**
 * Studio view registry — NATIVE-SOURCED.
 *
 * The registry data is derived at build time from per-panel `.holo` composition
 * files (src/lib/studio/panels/*.holo) by scripts/compile-view-registry.ts, which
 * emits viewRegistry.generated.ts. This module owns only the TYPE vocabulary and
 * the public accessors; the 7 hand-maintained parallel `Record<>` maps that used
 * to live here were deleted once viewRegistry.generated.test.ts proved the
 * generated output deep-equals (and preserves the curated order of) the old maps
 * across all 76 views. To add/change a view, edit its `.holo` and run
 * `pnpm viewreg:build` (CI gate: `pnpm viewreg:check`).
 */

// ─── Type vocabulary (the allowed value sets) ────────────────────────────────
export type StudioViewCategory =
  | 'authoring'
  | 'assistant'
  | 'assets'
  | 'collaboration'
  | 'debug'
  | 'governance'
  | 'integration'
  | 'learning'
  | 'publishing'
  | 'simulation'
  | 'workspace';

export type StudioViewPlacement =
  | 'bottom-panel'
  | 'floating-overlay'
  | 'left-panel'
  | 'modal'
  | 'right-rail'
  | 'top-overlay';

export type StudioWorkspaceScope = 'global' | 'workspace' | 'project' | 'scene';
export type StudioViewAvailabilityGate =
  | 'always'
  | 'expert'
  | 'experimental'
  | 'project'
  | 'workspace';

/** Canonical view id literal union — sourced from the .holo id tuple. */
export type StudioViewId = (typeof GENERATED_VIEW_IDS)[number];
export type StudioViewCommandId = `studio.view.${StudioViewId}.toggle`;

export interface StudioViewDefinition {
  id: StudioViewId;
  title: string;
  icon: string;
  category: StudioViewCategory;
  defaultPlacement: StudioViewPlacement;
  activationCommand: StudioViewCommandId;
  workspaceScope: StudioWorkspaceScope;
  availabilityGate: StudioViewAvailabilityGate;
  surfaceClass: StudioSurfaceClass;
  defaultOpen: boolean;
  exclusiveWith: StudioViewId[];
}

// ─── Public registry (derived from panel .holo compositions) ─────────────────
export const STUDIO_VIEW_REGISTRY: StudioViewDefinition[] = GENERATED_VIEW_REGISTRY;

export const STUDIO_VIEW_IDS: StudioViewId[] = [...GENERATED_VIEW_IDS];

/** Views whose @view declares defaultOpen: true (currently chat + minimap). */
export const DEFAULT_OPEN_STUDIO_VIEW_IDS: StudioViewId[] = STUDIO_VIEW_REGISTRY.filter(
  (view) => view.defaultOpen
).map((view) => view.id);

export const STUDIO_VIEW_REGISTRY_BY_ID = Object.fromEntries(
  STUDIO_VIEW_REGISTRY.map((view) => [view.id, view])
) as Record<StudioViewId, StudioViewDefinition>;

export function getStudioView(id: StudioViewId): StudioViewDefinition {
  return STUDIO_VIEW_REGISTRY_BY_ID[id];
}
