import type { HologramSourceKind, HologramTarget } from '@holoscript/engine/hologram';

export type DeviceHint = 'looking-glass' | 'vision-pro' | 'quest' | 'visionpro' | 'auto';

export interface TargetSelectorInput {
  /** Kind of media being ingested. */
  mediaType: HologramSourceKind;
  /** Optional device hint to steer the default target selection. */
  deviceHint?: DeviceHint;
  /** Explicit targets supplied by the caller; when present they override auto-selection. */
  explicitTargets?: HologramTarget[];
}

const VALID_DEVICE_HINTS = new Set<DeviceHint>([
  'looking-glass',
  'vision-pro',
  'quest',
  'visionpro',
  'auto',
]);

const STILL_KINDS = new Set<HologramSourceKind>(['image']);
const VIDEO_KINDS = new Set<HologramSourceKind>(['video', 'gif']);

/**
 * Return the canonical target list for a given media + device hint.
 *
 * Rules:
 * - Explicit targets always win.
 * - looking-glass  -> quilt   (lenticular displays need quilt PNG)
 * - vision-pro/quest/visionpro -> mvhevc (headsets need stereo video)
 * - auto:
 *   - still image  -> quilt
 *   - gif / video  -> mvhevc
 */
export function selectTargets(input: TargetSelectorInput): HologramTarget[] {
  if (input.explicitTargets && input.explicitTargets.length > 0) {
    return input.explicitTargets;
  }

  const hint = input.deviceHint ?? 'auto';
  if (!VALID_DEVICE_HINTS.has(hint)) {
    throw new Error(`Unknown deviceHint: ${hint}. Valid: ${[...VALID_DEVICE_HINTS].join(', ')}`);
  }

  if (hint === 'looking-glass') {
    return ['quilt'];
  }

  if (hint === 'vision-pro' || hint === 'quest' || hint === 'visionpro') {
    return ['mvhevc'];
  }

  // auto
  if (STILL_KINDS.has(input.mediaType)) {
    return ['quilt'];
  }

  if (VIDEO_KINDS.has(input.mediaType)) {
    return ['mvhevc'];
  }

  // Exhaustive fallback — should never hit because HologramSourceKind is closed.
  return ['quilt'];
}
