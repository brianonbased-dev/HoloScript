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
 * Status: Initial surface (query + dispatch). Compiler integration and WIT
 * host-function wiring are the immediate follow-ups.
 */

import type { AndroidXRTraitMapping } from './AndroidXRComponentTypes';
import {
  getTraitMapping as getAndroidXRTrait,
  generateTraitCode as generateAndroidXRCode,
} from './AndroidXRTraitMap';

import {
  getTraitMapping as getVisionOSTrait,
  generateTraitCode as generateVisionOSCode,
  listAllTraits as listVisionOSTraits,
} from './VisionOSTraitMap';

// Future: import from core trait registry when it is unified
// import { getCoreTrait, listCoreTraits } from '../traits/registry';

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
}

/**
 * Unified trait query — the surface the WIT validator will call.
 */
export function queryTrait(name: string, opts: TraitQueryOptions = {}): TraitInfo {
  const target = opts.target || 'core';

  // Android XR / PhoneSleeveVR path (real implementation exists)
  if (target === 'android-xr' || target === 'android') {
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

  // Core / generic path (future unified registry)
  // For now we fall back to a conservative "we know it exists in the TS trait catalog"
  // This is the exact gap the audit identified: the WIT validator needs this to be real.
  return {
    name,
    exists: true, // conservative until the core registry is lifted
    sourceMap: 'core-traits (conservative until unified registry is wired)',
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

  return [`// @${name} — no codegen path registered for target "${target}" yet`];
}

/**
 * List known traits for a target (supports the WIT `list-traits` function).
 */
export function listTraitsForTarget(target: string): string[] {
  // In a full implementation this would enumerate the composed registry.
  // For the initial bridge we return a conservative set that we know is real.
  if (target === 'android-xr') {
    return [
      'collidable', 'physics', 'static', 'kinematic', 'cloth',
      'hand_tracked', 'eye_tracked', 'portal', 'ornament',
      // ... (the full maps in AndroidXRTraitDispatch + AndroidXRCodeTemplates)
    ];
  }

  if (target === 'visionos') {
    return listVisionOSTraits ? listVisionOSTraits() : [];
  }

  return [];
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