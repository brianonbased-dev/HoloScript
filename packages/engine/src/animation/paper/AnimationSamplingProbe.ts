/**
 * AnimationSamplingProbe — P2-0 substrate probe.
 *
 * Scope honesty: P2-0's submission claim is hash-verified
 * ANIMATION RETARGETING across backends (source rig -> target rig
 * transform produces bit-identical motion curves). HoloScript does
 * not yet ship a retargeter. What it DOES ship is `AnimClip.sample(t)`,
 * and retargeting determinism would build on sampling determinism
 * as its substrate. This probe validates the substrate only.
 *
 * Read this as: "before we can claim retargeting determinism, we
 * must confirm clip-sampling determinism." A retargeter that calls
 * `sample()` N times and combines results cannot be deterministic
 * if `sample()` itself is not. Benchmarks that exercise the full
 * retargeting pipeline belong in a later probe once the retargeter
 * ships (CAEL paper-forces-code pattern).
 *
 * Reusable: paper test suite calls `runAnimationSamplingProbe(spec)`
 * and returns `Uint8Array` of concatenated sample outputs. The
 * DeterminismHarness hashes those bytes.
 *
 * @see NORTH_STAR DT-14. @see Program 2 scoping memo P2-0 entry.
 */

import { AnimClip, type ClipTrack } from '../AnimationClip';

export interface AnimationSamplingProbeOptions {
  /**
   * Fixed spec for the animation clip being sampled. Each track is
   * a sequence of keyframes the probe should sample from. Paper
   * canonical spec (see PAPER_P2_0_CANONICAL_SPEC) freezes one such
   * configuration for replication.
   */
  clipSpec: {
    id: string;
    name: string;
    duration: number;
    interpolation: 'step' | 'linear' | 'cubic' | 'slerp';
    tracks: Array<{
      id: string;
      targetPath: string;
      property: string;
      component?: string;
      keyframes: Array<{
        time: number;
        value: number;
        inTangent?: number;
        outTangent?: number;
      }>;
    }>;
  };
  /**
   * Sample times at which the clip is evaluated. Output bytes are
   * concatenated in track-order × sample-time order, deterministic
   * regardless of Map iteration quirks.
   */
  sampleTimes: readonly number[];
}

/**
 * Run the probe. Returns a `Uint8Array` view over IEEE-754 f32
 * samples, concatenated in a fixed order:
 *
 *   for sample_time in sampleTimes:
 *     for track in clipSpec.tracks: (preserved order)
 *       emit sampled_value_at(track, sample_time) as f32
 *
 * The fixed emission order is critical — `AnimClip.sample()` returns
 * a `Map` whose iteration order is insertion-order in JS but the
 * harness's hash must not depend on that; iterating tracks in the
 * spec-supplied order keeps the hash stable across any AnimClip
 * internal refactor.
 */
export function runAnimationSamplingProbe(
  options: AnimationSamplingProbeOptions
): Uint8Array {
  const { clipSpec, sampleTimes } = options;

  const clip = new AnimClip(clipSpec.id, clipSpec.name, clipSpec.duration);
  for (const trackSpec of clipSpec.tracks) {
    const track: ClipTrack = {
      id: trackSpec.id,
      targetPath: trackSpec.targetPath,
      property: trackSpec.property,
      component: trackSpec.component,
      interpolation: clipSpec.interpolation,
      keyframes: trackSpec.keyframes.map((kf) => ({
        time: kf.time,
        value: kf.value,
        inTangent: kf.inTangent,
        outTangent: kf.outTangent,
      })),
    };
    clip.addTrack(track);
  }

  // Emit samples in a fixed, deterministic order. N samples × M
  // tracks → N*M f32 values → 4*N*M bytes.
  const totalValues = sampleTimes.length * clipSpec.tracks.length;
  const buffer = new Float32Array(totalValues);
  let idx = 0;

  for (const t of sampleTimes) {
    const sampled = clip.sample(t);
    for (const trackSpec of clipSpec.tracks) {
      const key = trackSpec.component
        ? `${trackSpec.targetPath}.${trackSpec.property}.${trackSpec.component}`
        : `${trackSpec.targetPath}.${trackSpec.property}`;
      const value = sampled.get(key);
      buffer[idx++] = value === undefined ? 0 : value;
    }
  }

  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/**
 * P2-0 canonical probe spec.
 *
 * Freezes the exact clip + sample schedule that any paper
 * benchmark or replication attempt uses. Changing this constant
 * invalidates every hash reference to it — keep frozen in lockstep
 * with the paper's reported numbers.
 *
 * Contents: a 4-track clip (position.x, position.y, rotation.z,
 * scale.y) sampled at 100 times uniformly over 2.0 seconds with
 * linear interpolation. 400 f32 samples total → 1600 output bytes
 * hashed by the harness.
 */
export const PAPER_P2_0_CANONICAL_SPEC: Readonly<AnimationSamplingProbeOptions> =
  Object.freeze({
    clipSpec: {
      id: 'paper-p2-0-canonical',
      name: 'paper-p2-0-canonical',
      duration: 2.0,
      interpolation: 'linear' as const,
      tracks: [
        {
          id: 'track-pos-x',
          targetPath: 'root',
          property: 'position',
          component: 'x',
          keyframes: [
            { time: 0.0, value: 0.0 },
            { time: 0.5, value: 1.5 },
            { time: 1.0, value: -0.5 },
            { time: 1.5, value: 2.0 },
            { time: 2.0, value: 0.0 },
          ],
        },
        {
          id: 'track-pos-y',
          targetPath: 'root',
          property: 'position',
          component: 'y',
          keyframes: [
            { time: 0.0, value: 1.0 },
            { time: 1.0, value: 2.5 },
            { time: 2.0, value: 1.0 },
          ],
        },
        {
          id: 'track-rot-z',
          targetPath: 'root',
          property: 'rotation',
          component: 'z',
          keyframes: [
            { time: 0.0, value: 0.0 },
            { time: 0.5, value: Math.PI / 4 },
            { time: 1.0, value: Math.PI / 2 },
            { time: 1.5, value: Math.PI },
            { time: 2.0, value: 2 * Math.PI },
          ],
        },
        {
          id: 'track-scale-y',
          targetPath: 'root',
          property: 'scale',
          component: 'y',
          keyframes: [
            { time: 0.0, value: 1.0 },
            { time: 1.0, value: 1.25 },
            { time: 2.0, value: 1.0 },
          ],
        },
      ],
    },
    sampleTimes: Object.freeze(
      Array.from({ length: 100 }, (_, i) => (i / 99) * 2.0)
    ) as readonly number[],
  });
