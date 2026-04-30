import type { AndroidXRTraitMapping, TraitImplementationLevel } from './AndroidXRComponentTypes';
import {
  PHYSICS_TRAIT_MAP,
  INTERACTION_TRAIT_MAP,
  AUDIO_TRAIT_MAP,
  AR_TRAIT_MAP,
  ACCESSIBILITY_TRAIT_MAP,
  UI_TRAIT_MAP,
  ENVIRONMENT_TRAIT_MAP,
  DP3_TRAIT_MAP,
  GLASSES_TRAIT_MAP,
  MULTIPLAYER_TRAIT_MAP,
} from './AndroidXRTraitDispatch';
import {
  VISUAL_TRAIT_MAP,
  V43_TRAIT_MAP,
  AI_TRAIT_MAP,
} from './AndroidXRCodeTemplates';

export {
  PHYSICS_TRAIT_MAP,
  INTERACTION_TRAIT_MAP,
  AUDIO_TRAIT_MAP,
  AR_TRAIT_MAP,
  ACCESSIBILITY_TRAIT_MAP,
  UI_TRAIT_MAP,
  ENVIRONMENT_TRAIT_MAP,
  DP3_TRAIT_MAP,
  GLASSES_TRAIT_MAP,
  MULTIPLAYER_TRAIT_MAP,
} from './AndroidXRTraitDispatch';
export {
  VISUAL_TRAIT_MAP,
  V43_TRAIT_MAP,
  AI_TRAIT_MAP,
} from './AndroidXRCodeTemplates';
export type { AndroidXRComponent, TraitImplementationLevel, AndroidXRTraitMapping } from './AndroidXRComponentTypes';

export const ANDROIDXR_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  ...PHYSICS_TRAIT_MAP,
  ...INTERACTION_TRAIT_MAP,
  ...AUDIO_TRAIT_MAP,
  ...AR_TRAIT_MAP,
  ...VISUAL_TRAIT_MAP,
  ...ACCESSIBILITY_TRAIT_MAP,
  ...UI_TRAIT_MAP,
  ...ENVIRONMENT_TRAIT_MAP,
  ...DP3_TRAIT_MAP,
  ...V43_TRAIT_MAP,
  ...GLASSES_TRAIT_MAP,
  ...MULTIPLAYER_TRAIT_MAP,
  ...AI_TRAIT_MAP,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getTraitMapping(traitName: string): AndroidXRTraitMapping | undefined {
  return ANDROIDXR_TRAIT_MAP[traitName];
}

export function generateTraitCode(
  traitName: string,
  varName: string,
  config: Record<string, unknown>
): string[] {
  const mapping = getTraitMapping(traitName);
  if (!mapping) {
    return [`// @${traitName} -- no Android XR mapping defined: ${JSON.stringify(config)}`];
  }
  return mapping.generate(varName, config);
}

export function getRequiredImports(traits: string[]): string[] {
  const imports = new Set<string>();
  for (const trait of traits) {
    const mapping = getTraitMapping(trait);
    if (mapping?.imports) {
      mapping.imports.forEach((i) => imports.add(i));
    }
  }
  return Array.from(imports);
}

export function getMinSdkVersion(traits: string[]): number {
  let maxSdk = 26;
  for (const trait of traits) {
    const mapping = getTraitMapping(trait);
    if (mapping?.minSdkVersion) {
      if (mapping.minSdkVersion > maxSdk) {
        maxSdk = mapping.minSdkVersion;
      }
    }
  }
  return maxSdk;
}

export function listAllTraits(): string[] {
  return Object.keys(ANDROIDXR_TRAIT_MAP);
}

export function listTraitsByLevel(level: TraitImplementationLevel): string[] {
  return Object.entries(ANDROIDXR_TRAIT_MAP)
    .filter(([_, mapping]) => mapping.level === level)
    .map(([name]) => name);
}

// =============================================================================
// COVERAGE TRACKING
// =============================================================================

export interface TraitCoverageReport {
  /** Total number of traits mapped */
  total: number;
  /** Traits with full implementation */
  full: string[];
  /** Traits with partial implementation */
  partial: string[];
  /** Traits with comment-only stubs */
  comment: string[];
  /** Traits marked as unsupported */
  unsupported: string[];
  /** Coverage percentage (full + partial / total) */
  coveragePercent: number;
  /** Full implementation percentage (full only / total) */
  fullCoveragePercent: number;
  /** Traits present in VisionOS map but missing from Android XR map */
  missingFromAndroidXR: string[];
  /** Platform comparison summary */
  platformComparison: {
    visionOSOnly: string[];
    androidXROnly: string[];
    bothPlatforms: string[];
  };
}

/**
 * Generates a comprehensive coverage report comparing Android XR trait
 * coverage against the VisionOS trait map.
 *
 * @param visionOSTraits - Array of trait names from VisionOS trait map
 * @returns TraitCoverageReport with detailed coverage analysis
 */
export function generateCoverageReport(visionOSTraits: string[]): TraitCoverageReport {
  const androidXRTraits = Object.keys(ANDROIDXR_TRAIT_MAP);

  const full = listTraitsByLevel('full');
  const partial = listTraitsByLevel('partial');
  const comment = listTraitsByLevel('comment');
  const unsupported = listTraitsByLevel('unsupported');

  const total = androidXRTraits.length;
  const coveragePercent =
    total > 0 ? Math.round(((full.length + partial.length) / total) * 100 * 10) / 10 : 0;
  const fullCoveragePercent = total > 0 ? Math.round((full.length / total) * 100 * 10) / 10 : 0;

  const androidXRSet = new Set(androidXRTraits);
  const visionOSSet = new Set(visionOSTraits);

  const missingFromAndroidXR = visionOSTraits.filter((t) => !androidXRSet.has(t));
  const visionOSOnly = visionOSTraits.filter((t) => !androidXRSet.has(t));
  const androidXROnly = androidXRTraits.filter((t) => !visionOSSet.has(t));
  const bothPlatforms = androidXRTraits.filter((t) => visionOSSet.has(t));

  return {
    total,
    full,
    partial,
    comment,
    unsupported,
    coveragePercent,
    fullCoveragePercent,
    missingFromAndroidXR,
    platformComparison: {
      visionOSOnly,
      androidXROnly,
      bothPlatforms,
    },
  };
}

/**
 * Returns a human-readable coverage summary string.
 */
export function getCoverageSummary(visionOSTraits: string[]): string {
  const report = generateCoverageReport(visionOSTraits);
  const lines = [
    `=== Android XR Trait Coverage Report ===`,
    `Total traits mapped: ${report.total}`,
    `  Full:        ${report.full.length} (${report.fullCoveragePercent}%)`,
    `  Partial:     ${report.partial.length}`,
    `  Comment:     ${report.comment.length}`,
    `  Unsupported: ${report.unsupported.length}`,
    ``,
    `Implementation coverage: ${report.coveragePercent}% (full + partial)`,
    `Full coverage:           ${report.fullCoveragePercent}%`,
    ``,
  ];

  if (report.missingFromAndroidXR.length > 0) {
    lines.push(`Missing from Android XR (present in VisionOS):`);
    for (const t of report.missingFromAndroidXR) {
      lines.push(`  - ${t}`);
    }
  } else {
    lines.push(`All VisionOS traits are covered in Android XR map.`);
  }

  lines.push(``);
  lines.push(`Platform comparison:`);
  lines.push(`  Both platforms: ${report.platformComparison.bothPlatforms.length}`);
  lines.push(`  VisionOS only:  ${report.platformComparison.visionOSOnly.length}`);
  lines.push(`  Android XR only: ${report.platformComparison.androidXROnly.length}`);

  return lines.join('\n');
}
