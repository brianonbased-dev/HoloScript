/**
 * @holoscript/runtime - Spatial voice distance attenuation
 *
 * Pure helpers that turn a source position + listener position + voice range
 * into a positional gain (distance attenuation) and a stereo pan. Models follow
 * the Web Audio PannerNode distance models so the runtime consumer behaves the
 * same as a browser PannerNode would, but works headless (server / tests).
 */

export type Vec3 = [number, number, number];
export type RolloffModel = 'linear' | 'inverse' | 'exponential';

const REF_DISTANCE = 1;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Distance attenuation gain in [0, 1]. Sources beyond `range` are fully culled
 * (gain 0); a source at the listener is at unity gain.
 *
 * @param d        distance from listener to source (world units)
 * @param range    cull radius / max distance (world units)
 * @param rolloff  attenuation model
 * @param factor   rolloff factor (steepness)
 */
export function attenuationGain(
  d: number,
  range: number,
  rolloff: RolloffModel = 'inverse',
  factor = 1
): number {
  if (!(range > 0)) return d <= 0 ? 1 : 0;
  if (d <= 0) return 1;
  if (d >= range) return 0;
  const ref = Math.min(REF_DISTANCE, range);
  const dd = Math.max(d, ref);
  let g: number;
  switch (rolloff) {
    case 'linear':
      // Web Audio linear model, then re-cull at range.
      g = 1 - factor * ((dd - ref) / (range - ref));
      break;
    case 'exponential':
      g = Math.pow(dd / ref, -factor);
      break;
    case 'inverse':
    default:
      g = ref / (ref + factor * (dd - ref));
      break;
  }
  return clamp01(g);
}

/**
 * Equal-power stereo pan in [-1, 1] from the source azimuth relative to the
 * listener. -1 = hard left, +1 = hard right (listener faces +z, right = +x).
 */
export function stereoPan(source: Vec3, listener: Vec3, range: number): number {
  const dx = source[0] - listener[0];
  const horiz = Math.hypot(dx, source[2] - listener[2]);
  if (horiz === 0) return 0;
  // Pan by the sine of the azimuth (lateral component / horizontal distance),
  // which is naturally bounded to [-1, 1].
  const pan = dx / horiz;
  return pan < -1 ? -1 : pan > 1 ? 1 : pan;
}
