/**
 * Paper 6 foot-Y preprocessing and playback-sampling publication runner.
 *
 * Produces the D.011 ablation artifact cited by
 * research/paper-6-animation-sca.tex. The harness uses the
 * shipped MixamoRetargeter and applies a deterministic foot-Y normalization
 * post-pass, then compares aligned position channels against retarget-only and
 * raw-position variants. Timings cover playback sampling only; preprocessing
 * is intentionally outside the timed region.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { AnimClip, type ClipTrack, type ScalarClipKeyframe } from '../../AnimationClip';
import {
  MixamoRetargeter,
  retargetToVRM,
  vrmRetargetConfig,
  type MixamoAnimationSource,
} from '../../MixamoRetargeter';

export interface Paper6AblationRow {
  readonly variant: 'foot-y-normalized' | 'retarget-only' | 'raw-position-only';
  readonly sample_only_per_frame_us_median: number;
  readonly sample_only_per_frame_us_min: number;
  readonly sample_only_per_frame_us_max: number;
  readonly sampled_tracks: number;
  readonly comparison_hash: string;
  readonly reference_hash_equal: boolean;
  readonly max_position_l1_vs_reference: number;
}

export interface Paper6AblationArtifact {
  readonly schema_version: 'paper-6-ablation-v2';
  readonly benchmark: 'paper-6-ablation-publication';
  readonly paper_ref: 'research/paper-6-animation-sca.tex';
  readonly harness: 'packages/engine/src/animation/paper/benchmarks/p6-ablation-publication.ts';
  readonly source_clip_id: string;
  readonly frames: number;
  readonly iterations_per_round: number;
  readonly warmup_iterations: number;
  readonly timing_rounds: number;
  readonly sampling_contract: 'full-clip-playback+quaternion-nlerp[x,y,z,w]';
  readonly comparison_contract: 'aligned-position[x,y,z]-in-source-bone-order';
  readonly timing_contract: string;
  readonly comparability_note: string;
  readonly environment: {
    readonly execution: 'single-process-cpu-javascript';
    readonly os: string;
    readonly arch: string;
    readonly cpu_model: string;
    readonly logical_cores: number;
    readonly node: string;
  };
  readonly rows: readonly Paper6AblationRow[];
  readonly measured_at: string;
}

const SAMPLE_TIMES = Array.from({ length: 60 }, (_, i) => i / 60);
const ITERATIONS = 1500;
const TIMING_ROUNDS = 5;
const WARMUP_ITERATIONS = 100;
const SOURCE_BONES = [
  'mixamorig:Hips',
  'mixamorig:LeftUpLeg',
  'mixamorig:LeftLeg',
  'mixamorig:LeftFoot',
  'mixamorig:RightUpLeg',
  'mixamorig:RightLeg',
  'mixamorig:RightFoot',
] as const;
const TARGET_BONES = [
  'hips',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
] as const;
const POSITION_COMPONENTS = ['x', 'y', 'z'] as const;

function keyframe(
  time: number,
  position: [number, number, number],
  rotation: [number, number, number, number] = [0, 0, 0, 1]
): ScalarClipKeyframe & {
  position: [number, number, number];
  rotation: [number, number, number, number];
} {
  return { time, value: 0, position, rotation };
}

function makeSource(): MixamoAnimationSource {
  const kfs = [
    keyframe(0.0, [0, 0.02, 0]),
    keyframe(0.25, [0.04, -0.018, 0.08], [0.02, 0, 0, 0.9998]),
    keyframe(0.5, [0.08, 0.025, 0.16], [0.04, 0, 0, 0.9992]),
    keyframe(0.75, [0.04, -0.012, 0.24], [0.02, 0, 0, 0.9998]),
    keyframe(1.0, [0, 0.02, 0.32]),
  ];

  return {
    id: 'paper-6-publication-walk',
    name: 'Paper 6 Publication Walk',
    duration: 1,
    boneAnimations: SOURCE_BONES.map((mixamoBoneName, boneIndex) => ({
      mixamoBoneName,
      keyframes: kfs.map((kf, i) => ({
        time: kf.time,
        position: [
          kf.position[0] + boneIndex * 0.005,
          kf.position[1] + (boneIndex >= 3 ? -0.015 : 0.005),
          kf.position[2] + i * 0.002,
        ],
        rotation: kf.rotation,
      })),
    })),
  };
}

function cloneClip(clip: AnimClip, id: string, name: string): AnimClip {
  const out = new AnimClip(id, name, clip.getDuration());
  for (const track of clip.getTracks()) {
    out.addTrack(track);
  }
  return out;
}

function applyFootYNormalization(clip: AnimClip): AnimClip {
  const out = new AnimClip(`${clip.id}-normalized`, `${clip.name} normalized`, clip.getDuration());
  for (const track of clip.getTracks()) {
    const isFootPlantY =
      track.property === 'position' &&
      track.component === 'y' &&
      /(?:left|right)Foot/i.test(track.targetPath);

    if (isFootPlantY) {
      track.keyframes = track.keyframes.map((kf) => {
        const value = typeof kf.value === 'number' ? kf.value : 0;
        return { ...kf, value: Math.max(0, value) };
      });
    }

    out.addTrack(track);
  }
  return out;
}

function rawPositionOnly(source: MixamoAnimationSource): AnimClip {
  const out = new AnimClip(`${source.id}-raw`, `${source.name} raw positions`, source.duration);
  for (const bone of source.boneAnimations) {
    for (const component of ['x', 'y', 'z'] as const) {
      const index = component === 'x' ? 0 : component === 'y' ? 1 : 2;
      out.addTrack({
        id: `${bone.mixamoBoneName}-raw-pos-${component}`,
        targetPath: bone.mixamoBoneName,
        property: 'position',
        component,
        interpolation: 'linear',
        keyframes: bone.keyframes.map((kf) => ({
          time: kf.time,
          value: kf.position[index],
        })),
      });
    }
  }
  return out;
}

function samplePositionVector(clip: AnimClip, bonePaths: readonly string[]): Float64Array {
  const values: number[] = [];
  for (const t of SAMPLE_TIMES) {
    const sampled = clip.sample(t);
    for (const bonePath of bonePaths) {
      for (const component of POSITION_COMPONENTS) {
        const key = `${bonePath}.position.${component}`;
        const value = sampled.get(key);
        if (typeof value !== 'number') {
          throw new Error(`Aligned comparison channel "${key}" did not produce a scalar`);
        }
        values.push(value);
      }
    }
  }
  return Float64Array.from(values);
}

function maxPositionL1AgainstReference(reference: Float64Array, candidate: Float64Array): number {
  if (reference.length !== candidate.length || reference.length % 3 !== 0) {
    throw new Error('Position comparison vectors must have equal xyz-aligned lengths');
  }

  let max = 0;
  for (let i = 0; i < reference.length; i += 3) {
    const l1 =
      Math.abs(reference[i] - candidate[i]) +
      Math.abs(reference[i + 1] - candidate[i + 1]) +
      Math.abs(reference[i + 2] - candidate[i + 2]);
    if (l1 > max) max = l1;
  }
  return max;
}

function fnv1aVector(values: Float64Array): string {
  let hash = 0x811c9dc5;
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function consumeSamples(clip: AnimClip, iterations: number): number {
  const t0 = performance.now();
  let sink = 0;
  for (let i = 0; i < iterations; i++) {
    for (const t of SAMPLE_TIMES) {
      for (const value of clip.sampleValues(t).values()) {
        if (Array.isArray(value)) {
          sink += value[0] + value[1] + value[2] + value[3];
        } else {
          sink += value;
        }
      }
    }
  }
  if (sink === Number.NEGATIVE_INFINITY) {
    throw new Error('unreachable sink guard');
  }
  const elapsedMs = performance.now() - t0;
  return (elapsedMs * 1000) / (iterations * SAMPLE_TIMES.length);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function measureSamplingVariants(
  variants: readonly (readonly [Paper6AblationRow['variant'], AnimClip, readonly string[]])[]
): Map<Paper6AblationRow['variant'], number[]> {
  const measurements = new Map(
    variants.map(([variant]) => [variant, [] as number[]] satisfies [string, number[]])
  );

  for (const [, clip] of variants) consumeSamples(clip, WARMUP_ITERATIONS);

  // Rotate execution order each round to reduce systematic first/last bias.
  for (let round = 0; round < TIMING_ROUNDS; round++) {
    for (let offset = 0; offset < variants.length; offset++) {
      const [variant, clip] = variants[(round + offset) % variants.length];
      measurements.get(variant)!.push(consumeSamples(clip, ITERATIONS));
    }
  }

  return measurements;
}

export function runPaper6AblationBenchmark(): Paper6AblationArtifact {
  const source = makeSource();
  const retargeter = new MixamoRetargeter();
  const retargetOnly = cloneClip(
    retargeter.retarget(source, vrmRetargetConfig()),
    'paper-6-retarget-only',
    'Paper 6 retarget only'
  );
  const normalized = applyFootYNormalization(retargetToVRM(source));
  const raw = rawPositionOnly(source);

  const reference = samplePositionVector(normalized, TARGET_BONES);
  const referenceHash = fnv1aVector(reference);
  const variants = [
    ['foot-y-normalized', normalized, TARGET_BONES],
    ['retarget-only', retargetOnly, TARGET_BONES],
    ['raw-position-only', raw, SOURCE_BONES],
  ] as const;
  const timingMeasurements = measureSamplingVariants(variants);
  const cpuInfo = cpus();

  return {
    schema_version: 'paper-6-ablation-v2',
    benchmark: 'paper-6-ablation-publication',
    paper_ref: 'research/paper-6-animation-sca.tex',
    harness: 'packages/engine/src/animation/paper/benchmarks/p6-ablation-publication.ts',
    source_clip_id: source.id,
    frames: SAMPLE_TIMES.length,
    iterations_per_round: ITERATIONS,
    warmup_iterations: WARMUP_ITERATIONS,
    timing_rounds: TIMING_ROUNDS,
    sampling_contract: 'full-clip-playback+quaternion-nlerp[x,y,z,w]',
    comparison_contract: 'aligned-position[x,y,z]-in-source-bone-order',
    timing_contract:
      '100 warm-up iterations followed by five rotated-order rounds; median/min/max cover clip.sampleValues playback only. Foot-Y normalization and retarget construction are excluded, and raw-position-only samples fewer tracks.',
    comparability_note:
      'V2 hashes and max-L1 values use aligned xyz position channels. Playback timings are not comparable to pre-v2 component-track artifacts.',
    environment: {
      execution: 'single-process-cpu-javascript',
      os: `${platform()} ${release()}`,
      arch: arch(),
      cpu_model: cpuInfo[0]?.model ?? 'unknown',
      logical_cores: cpuInfo.length,
      node: process.version,
    },
    measured_at: new Date().toISOString(),
    rows: variants.map(([variant, clip, comparisonPaths]) => {
      const vector = samplePositionVector(clip, comparisonPaths);
      const timings = timingMeasurements.get(variant)!;
      return {
        variant,
        sample_only_per_frame_us_median: Number(median(timings).toFixed(3)),
        sample_only_per_frame_us_min: Number(Math.min(...timings).toFixed(3)),
        sample_only_per_frame_us_max: Number(Math.max(...timings).toFixed(3)),
        sampled_tracks: clip.getTrackCount(),
        comparison_hash: fnv1aVector(vector),
        reference_hash_equal: fnv1aVector(vector) === referenceHash,
        max_position_l1_vs_reference: Number(
          maxPositionL1AgainstReference(reference, vector).toFixed(6)
        ),
      };
    }),
  };
}

export function writePaper6AblationArtifact(
  artifact: Paper6AblationArtifact,
  outPath = '.bench-logs/paper-6-ablation-publication.json'
): void {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const artifact = runPaper6AblationBenchmark();
  writePaper6AblationArtifact(artifact, process.argv[2]);
  console.log(JSON.stringify(artifact, null, 2));
}
