/**
 * Trait Mappings
 *
 * Maps TrainingMonkey trait names to canonical @holoscript/core trait IDs.
 * Provides validation utilities to check trait coverage.
 *
 * @version 1.0.0
 */

import type { TrainingCategory } from './constants';

/**
 * Training metadata that extends a trait definition
 */
export interface TrainingMetadata {
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'production';
  categories: TrainingCategory[];
  exampleCount: number;
  qualityScore: number;
}

/**
 * Mapping entry from TM trait to HS canonical trait
 */
export interface TraitMapping {
  /** TrainingMonkey trait name */
  tmName: string;
  /** Canonical HoloScript trait name (null if unmapped) */
  hsName: string | null;
  /** Status of the mapping */
  status: 'matched' | 'unmatched' | 'deprecated' | 'promoted';
  /** Training metadata (populated from TM datasets) */
  training?: TrainingMetadata;
}

/**
 * Result of a trait validation run
 */
export interface TraitValidationReport {
  matched: number;
  unmatched: number;
  deprecated: number;
  total: number;
  details: TraitMapping[];
}

/**
 * Known TM traits from holoscript-trait-registry.ts (46 = 41 traits + 5 physics patterns)
 * These are the traits explicitly registered in TrainingMonkey.
 */
export const TM_REGISTERED_TRAITS = [
  // V43 Tier 1 Core AI
  'llm_agent',
  'behavior_tree',
  'goal_oriented',
  'neural_link',
  'neural_forge',
  'spatial_awareness',
  'shared_world',
  'eye_tracked',
  'hand_tracking',
  'vision',
  // V43 Tier 2 visionOS
  'spatial_persona',
  'shareplay',
  'object_tracking',
  'scene_reconstruction',
  'realitykit_mesh',
  'room_mesh',
  'volumetric_window',
  'spatial_navigation',
  // V43 Tier 2 AI Generative
  'stable_diffusion',
  'controlnet',
  'ai_texture_gen',
  'diffusion_realtime',
  'ai_inpainting',
  'ai_upscaling',
  // V5.1 Hololand Exclusive
  'networked',
  'render_network',
  'openxr_hal',
  'hitl',
  'zora_coins',
  'neural_upscaling',
  'grabbable',
  'throwable',
  'pointable',
  'drawable',
  'attachable',
  'socket',
  'billboard',
  'ui_panel',
  'hud',
  'glowing',
  'physics',
  'persistent',
  'tool',
  // Physics Patterns
  'conversion_tracking',
  'impact_physics',
  'fragment_conversion',
  'damage_falloff',
  'cross_system_integration',
] as const;

/**
 * Validate a trait name against a set of valid traits.
 * Returns the canonical name if found, null otherwise.
 */
export function validateTraitName(
  traitName: string,
  validTraits: ReadonlySet<string> | readonly string[]
): string | null {
  const normalized = traitName.toLowerCase().replace(/@/g, '').trim();
  const traitSet = validTraits instanceof Set ? validTraits : new Set(validTraits);

  if (traitSet.has(normalized)) return normalized;
  if (traitSet.has(traitName)) return traitName;
  return null;
}

/**
 * Generate a validation report comparing TM traits against HS registry.
 * @param tmTraits - Trait names from TrainingMonkey
 * @param hsTraits - Valid trait names from HoloScript core
 * @param deprecatedTraits - Set of deprecated trait names
 */
export function generateValidationReport(
  tmTraits: readonly string[],
  hsTraits: ReadonlySet<string> | readonly string[],
  deprecatedTraits?: ReadonlySet<string>
): TraitValidationReport {
  const hsSet = hsTraits instanceof Set ? hsTraits : new Set(hsTraits);
  const depSet = deprecatedTraits ?? new Set<string>();
  const details: TraitMapping[] = [];

  for (const tm of tmTraits) {
    const normalized = tm.toLowerCase().replace(/@/g, '').trim();

    if (depSet.has(normalized)) {
      details.push({ tmName: tm, hsName: normalized, status: 'deprecated' });
    } else if (hsSet.has(normalized)) {
      details.push({ tmName: tm, hsName: normalized, status: 'matched' });
    } else {
      details.push({ tmName: tm, hsName: null, status: 'unmatched' });
    }
  }

  return {
    matched: details.filter((d) => d.status === 'matched').length,
    unmatched: details.filter((d) => d.status === 'unmatched').length,
    deprecated: details.filter((d) => d.status === 'deprecated').length,
    total: details.length,
    details,
  };
}
