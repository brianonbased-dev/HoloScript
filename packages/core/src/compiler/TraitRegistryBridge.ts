/**
 * TraitRegistryBridge — Unified trait-evaluation surface for APL WASM worlds.
 *
 * This is the first concrete Engine Core slice from the WIT / trait-evaluation
 * surface audit (2026-05-21_apl_wit_trait-evaluation_gap_report.md).
 *
 * Goal (High priority from audit):
 *   Expose the rich, battle-tested trait dispatch (AndroidXRTraitMap,
 *   VisionOSTraitMap, core traits, ShaderTrait, etc.) through a thin,
 *   platform-agnostic bridge that the lightweight `holoscript-parser` and
 *   `holoscript-platform-plugin` WASM worlds can call via the WIT
 *   `validator` + `platform-compiler` interfaces.
 *
 * This turns the documented WIT interfaces into a working reality without
 * pulling the full runtime into every lightweight world.
 *
 * v2 (2026-05-22): Wired core target path to the real VRTraitRegistry and
 * traitDocs catalog. The WIT validator can now resolve traits against the
 * full catalog instead of returning a conservative `exists: true` for
 * every unknown trait name.
 */

import type { AndroidXRTraitMapping } from './AndroidXRComponentTypes';
import {
  ANDROIDXR_TRAIT_MAP,
  getTraitMapping as getAndroidXRTrait,
  generateTraitCode as generateAndroidXRCode,
} from './AndroidXRTraitMap';

import {
  getTraitMapping as getVisionOSTrait,
  generateTraitCode as generateVisionOSCode,
  listAllTraits as listVisionOSTraits,
} from './VisionOSTraitMap';

import { vrTraitRegistry } from '../traits/VRTraitSystem';
import { getTraitDoc, getAllTraitNames as getAllTraitDocNames } from '../traitDocs/traitDocs';

export interface TraitQueryOptions {
  target?: 'android-xr' | 'visionos' | 'webgpu' | 'threejs' | 'core';
  includeCodegen?: boolean;
}

export interface TraitInfo {
  name: string;
  exists: boolean;
  level?: string;
  codegen?: string[];
  sourceMap?: string;
  /** Human-readable description from the trait docs catalog, if available. */
  description?: string;
  /** Category from the trait docs catalog, if available. */
  category?: string;
  /** The annotation (e.g. `@physics`) from the trait docs catalog. */
  annotation?: string;
}

/**
 * Normalise a trait name for lookup.
 *
 * Trait names come in various forms across the ecosystem:
 *   - `physics` (bare name)
 *   - `@physics` (annotation form)
 *   - `PhysicsTrait` (class form)
 *   - `physics-trait` (slug form)
 *
 * The registry stores handler names in bare kebab-case
 * (e.g. `grabbable`, `hand-tracking`), while traitDocs uses annotation
 * form (`@physics`). We normalise to the most permissive match by
 * stripping `@`, `Trait` suffix, and converting `_`/`-` freely.
 */
function normaliseTraitName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/trait$/i, '')
    .replace(/_/g, '-')
    .trim();
}

/**
 * Unified trait query — the surface the WIT validator will call.
 *
 * Resolution order:
 *   1. Platform-specific maps (android-xr, visionos) — concrete codegen.
 *   2. VRTraitRegistry handler — runtime dispatch exists.
 *   3. traitDocs catalog — documentation-level entry.
 *   4. Not found.
 */
export function queryTrait(name: string, opts: TraitQueryOptions = {}): TraitInfo {
  const target = opts.target || 'core';

  // Android XR / PhoneSleeveVR path (real implementation exists)
  if (target === 'android-xr') {
    const map = getAndroidXRTrait(name);
    if (map) {
      return {
        name,
        exists: true,
        level: map.level,
        codegen: opts.includeCodegen ? map.generate?.(name, {}) : undefined,
        sourceMap: 'AndroidXRTraitMap',
      };
    }
  }

  // VisionOS path (real map wired; closes CG-005 / scout TODO o17q)
  if (target === 'visionos') {
    const map = getVisionOSTrait(name);
    if (map) {
      return {
        name,
        exists: true,
        level: map.level,
        codegen: opts.includeCodegen ? map.generate?.(name, {}) : undefined,
        sourceMap: 'VisionOSTraitMap',
      };
    }
    return { name, exists: false, sourceMap: 'VisionOSTraitMap' };
  }

  // Core / generic path: check the real registries in order.
  // 1. VRTraitRegistry (runtime handler dispatch)
  const normalised = normaliseTraitName(name);
  if (vrTraitRegistry.has(normalised)) {
    const handler = vrTraitRegistry.getHandler(normalised as never);
    const doc = getTraitDoc(name);
    return {
      name,
      exists: true,
      sourceMap: 'VRTraitRegistry',
      level: (handler?.defaultConfig as Record<string, unknown> | undefined)
        ? String((handler!.defaultConfig as Record<string, unknown>).level ?? 'core')
        : 'core',
      description: doc?.description,
      category: doc?.category,
      annotation: doc?.annotation,
    };
  }

  // 2. traitDocs catalog (documentation-level entry, no runtime handler)
  const doc = getTraitDoc(name);
  if (doc) {
    return {
      name,
      exists: true,
      sourceMap: 'traitDocs',
      description: doc.description,
      category: doc.category,
      annotation: doc.annotation,
    };
  }

  // 3. Not found anywhere
  return {
    name,
    exists: false,
    sourceMap: 'core-traits (not found in any registry)',
  };
}

/**
 * Generate code for a trait on a specific target.
 * This is the surface the WIT platform-compiler will call for lazy plugins.
 */
export function generateTraitForTarget(
  name: string,
  target: string,
  config: Record<string, unknown> = {}
): string[] {
  if (target === 'android-xr' || target === 'android') {
    return getAndroidXRTrait(name)?.generate?.(name, config) ?? [
      `// @${name} not yet mapped for android-xr (see AndroidXRTraitMap)`,
    ];
  }

  if (target === 'visionos') {
    // real implementation wired (closes scout TODO 8zl5)
    return generateVisionOSCode(name, name, config) ?? [
      `// @${name} not yet mapped for visionos (see VisionOSTraitMap)`,
    ];
  }

  // Core target: no platform-specific codegen, but we can return a
  // descriptive stub that the WIT world can use for validation.
  const info = queryTrait(name, { target: 'core' });
  if (info.exists) {
    return [
      `// @${name} — core trait (registered in ${info.sourceMap}), no platform-specific codegen for "${target}"`,
      `// trait level: ${info.level ?? 'unknown'}, category: ${info.category ?? 'unknown'}`,
    ];
  }

  return [`// @${name} — no codegen path registered for target "${target}" yet`];
}

/**
 * List known traits for a target (supports the WIT `list-traits` function).
 *
 * Resolution order:
 *   - android-xr: enumerates the AndroidXRTraitDispatch composed maps.
 *   - visionos: delegates to VisionOSTraitMap.listAllTraits.
 *   - core: merges VRTraitRegistry handler names + traitDocs annotations.
 *   - webgpu / threejs: currently empty (future compiler targets).
 */
export function listTraitsForTarget(target: string): string[] {
  if (target === 'android-xr') {
    // Use the real composed ANDROIDXR_TRAIT_MAP keys instead of a hardcoded
    // incomplete list. This ensures the WIT list-traits surface returns
    // every trait actually available on the android-xr target.
    return Object.keys(ANDROIDXR_TRAIT_MAP);
  }

  if (target === 'visionos') {
    return listVisionOSTraits ? listVisionOSTraits() : [];
  }

  if (target === 'core') {
    // Merge VRTraitRegistry handler names with traitDocs annotations,
    // deduplicating by normalised name.
    const seen = new Set<string>();
    const result: string[] = [];

    // VRTraitRegistry handler names (runtime dispatch)
    for (const name of vrTraitRegistry.getRegisteredTraits()) {
      const norm = normaliseTraitName(name);
      if (!seen.has(norm)) {
        seen.add(norm);
        result.push(name);
      }
    }

    // traitDocs annotations (documentation catalog)
    for (const annotation of getAllTraitDocNames()) {
      const norm = normaliseTraitName(annotation);
      if (!seen.has(norm)) {
        seen.add(norm);
        result.push(annotation);
      }
    }

    return result;
  }

  // Future targets (webgpu, threejs) — return empty until compilers ship
  return [];
}

/**
 * Check whether a trait exists in any registry (WIT `trait-exists` function).
 *
 * This is the lightweight validation entry point that the `holoscript-parser`
 * WASM world calls to validate trait references without pulling the full
 * runtime. It checks VRTraitRegistry + traitDocs + platform maps.
 */
export function traitExists(name: string): boolean {
  const normalised = normaliseTraitName(name);

  // 1. VRTraitRegistry (fast path — handler already loaded)
  if (vrTraitRegistry.has(normalised)) {
    return true;
  }

  // 2. traitDocs (documentation catalog — slower but exhaustive)
  const doc = getTraitDoc(name);
  if (doc) {
    return true;
  }

  // 3. Android XR map
  if (getAndroidXRTrait(name)) {
    return true;
  }

  // 4. VisionOS map
  if (getVisionOSTrait(name)) {
    return true;
  }

  return false;
}

/**
 * Get a trait's documentation, category, and annotation (WIT `get-trait` function).
 *
 * Returns `undefined` if the trait is not found in any catalog.
 */
export function getTraitInfo(name: string): TraitInfo | undefined {
  const info = queryTrait(name, { target: 'core' });
  if (!info.exists) return undefined;
  return info;
}

// Re-export the raw maps for consumers that need deeper access
// (the WIT surface will eventually hide this behind host functions).
export {
  getAndroidXRTrait,
  generateAndroidXRCode,
  getVisionOSTrait,
  generateVisionOSCode,
  listVisionOSTraits,
};