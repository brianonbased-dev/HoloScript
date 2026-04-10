/**
 * resolvePreset() — Converts an AnimationPreset into a complete
 * `@animated` trait annotation for HoloScript composition output.
 *
 * Produces three forms:
 *   1. `annotation`      — The `@animated` trait line (e.g. `@animated`)
 *   2. `animationBlock`  — The `animation "name" { ... }` block
 *   3. `fullOutput`      — Both combined, ready to paste into a composition
 *
 * Supports partial overrides for runtime customization.
 *
 * Pattern P.012: Behavior Presets Over Keyframing
 */

import type {
  AnimationPreset,
  CustomAnimationPreset,
  PresetName,
  PresetOverrides,
  ResolvedAnimatedTrait,
} from './types.js';
import { PresetRegistry } from './registry.js';

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Maps a LoopMode to its HoloScript animation block keyword.
 */
function loopModeToHolo(mode: string): string {
  switch (mode) {
    case 'loop':
      return 'true';
    case 'once':
      return 'false';
    case 'pingpong':
      return '"pingpong"';
    case 'clamp':
      return '"clamp"';
    default:
      return 'false';
  }
}

/**
 * Formats a number to a clean string (no trailing zeros).
 */
function num(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

/**
 * Indents each line of a multiline string by the given number of spaces.
 */
function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : pad + line))
    .join('\n');
}

// ---------------------------------------------------------------------------
// resolvePreset()
// ---------------------------------------------------------------------------

/**
 * Resolves a preset name (or AnimationPreset object) into a complete
 * `@animated` trait annotation ready for insertion into a HoloScript composition.
 *
 * @param presetOrName - A PresetName string or an AnimationPreset object.
 * @param overrides    - Optional partial overrides for timing, speed, blend weight, etc.
 * @param registry     - Optional PresetRegistry instance. Uses a default if not provided.
 *
 * @returns A ResolvedAnimatedTrait containing the annotation, animation block,
 *          and full combined output.
 *
 * @throws Error if the preset name is not found in the registry.
 *
 * @example
 * ```ts
 * import { resolvePreset } from '@holoscript/animation-presets';
 *
 * const resolved = resolvePreset('walk');
 * console.log(resolved.fullOutput);
 * // @animated
 * // auto_play: "walk"
 * // speed: 1.0
 * // blend_time: 0.2
 * //
 * // animation "walk" {
 * //   loop: true
 * //   duration: 1.0
 * //   speed: 1.0
 * //   blend_weight: 1.0
 * //   easing: "linear"
 * //   // Mixamo clip: Walking (Locomotion)
 * // }
 * ```
 */
export function resolvePreset(
  presetOrName: PresetName | string | AnimationPreset,
  overrides?: PresetOverrides,
  registry?: PresetRegistry
): ResolvedAnimatedTrait {
  // Resolve the preset object
  let preset: AnimationPreset | CustomAnimationPreset;

  if (typeof presetOrName === 'string') {
    const reg = registry ?? getDefaultRegistry();
    const found = reg.get(presetOrName);
    if (!found) {
      throw new Error(
        `Animation preset "${presetOrName}" not found in registry. ` +
          `Available presets: ${reg.getNames().join(', ')}`
      );
    }
    preset = found;
  } else {
    preset = presetOrName;
  }

  // Apply overrides
  const timing = {
    duration: overrides?.timing?.duration ?? preset.timing.duration,
    delay: overrides?.timing?.delay ?? preset.timing.delay,
    easing: overrides?.timing?.easing ?? preset.timing.easing,
  };
  const loopMode = overrides?.loopMode ?? preset.loopMode;
  const blendWeight = overrides?.blendWeight ?? preset.blendWeight;
  const speedMultiplier = overrides?.speedMultiplier ?? preset.speedMultiplier;

  // Build the @animated annotation
  const annotationLine = '@animated';

  // Build the auto_play and speed properties (placed on the object level)
  const traitProps = [
    `auto_play: "${preset.name}"`,
    `speed: ${num(speedMultiplier)}`,
    `blend_time: 0.2`,
  ];

  // Build the animation block
  const animBlockLines = [
    `animation "${preset.name}" {`,
    `  loop: ${loopModeToHolo(loopMode)}`,
    `  duration: ${num(timing.duration)}`,
    `  speed: ${num(speedMultiplier)}`,
    `  blend_weight: ${num(blendWeight)}`,
    `  easing: "${timing.easing}"`,
  ];

  // Add delay if non-zero
  if (timing.delay > 0) {
    animBlockLines.push(`  delay: ${num(timing.delay)}`);
  }

  // Add Mixamo clip reference as a comment and metadata
  animBlockLines.push(
    `  // Mixamo clip: ${preset.mixamoClip.clipName} (${preset.mixamoClip.pack})`
  );

  // Add clip mapping as a metadata property
  animBlockLines.push(`  clip: "${preset.mixamoClip.clipName}"`);

  // Close the animation block
  animBlockLines.push('}');

  const annotation = annotationLine;
  const animationBlock = animBlockLines.join('\n');

  // Full combined output
  const fullOutputLines = [annotation, ...traitProps, '', animationBlock];
  const fullOutput = fullOutputLines.join('\n');

  // Build the resolved preset with overrides applied
  const resolvedPreset: AnimationPreset | CustomAnimationPreset = {
    ...preset,
    timing,
    loopMode,
    blendWeight,
    speedMultiplier,
  };

  return {
    annotation,
    animationBlock,
    fullOutput,
    preset: resolvedPreset,
  };
}

// ---------------------------------------------------------------------------
// resolveMultiple()
// ---------------------------------------------------------------------------

/**
 * Resolves multiple presets and combines their output into a single
 * HoloScript fragment with one `@animated` annotation and multiple
 * animation blocks.
 *
 * @param presetNames - Array of preset names to resolve.
 * @param overridesMap - Optional map of preset name to overrides.
 * @param registry - Optional PresetRegistry instance.
 *
 * @returns Combined output string with all animation blocks.
 *
 * @example
 * ```ts
 * const output = resolveMultiple(['idle', 'walk', 'run']);
 * // @animated
 * // auto_play: "idle"
 * // speed: 1.0
 * // blend_time: 0.2
 * //
 * // animation "idle" { ... }
 * //
 * // animation "walk" { ... }
 * //
 * // animation "run" { ... }
 * ```
 */
export function resolveMultiple(
  presetNames: (PresetName | string)[],
  overridesMap?: Record<string, PresetOverrides>,
  registry?: PresetRegistry
): string {
  if (presetNames.length === 0) {
    return '';
  }

  const reg = registry ?? getDefaultRegistry();
  const resolvedList = presetNames.map((name) => resolvePreset(name, overridesMap?.[name], reg));

  // Use the first preset as the auto_play default
  const firstPreset = resolvedList[0];
  const speed = firstPreset.preset.speedMultiplier;

  const lines = [
    '@animated',
    `auto_play: "${firstPreset.preset.name}"`,
    `speed: ${num(speed)}`,
    'blend_time: 0.2',
  ];

  for (const resolved of resolvedList) {
    lines.push('');
    lines.push(resolved.animationBlock);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Default singleton registry
// ---------------------------------------------------------------------------

let defaultRegistry: PresetRegistry | undefined;

/**
 * Get the default PresetRegistry singleton (lazy-initialized).
 */
export function getDefaultRegistry(): PresetRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new PresetRegistry();
  }
  return defaultRegistry;
}

// Initialize the default registry immediately
defaultRegistry = new PresetRegistry();
