/**
 * Paper 6 constraint-solver ablation publication runner.
 *
 * Produces the D.011 ablation artifact cited by
 * ai-ecosystem/research/paper-6-animation-sca.tex. The harness uses the
 * shipped MixamoRetargeter and applies the paper's publication constraint
 * normalization as a deterministic post-pass, then compares it against
 * solverless retargeting and a no-pipeline baseline.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { AnimClip, type ClipKeyframe, type ClipTrack } from '../../AnimationClip';
import {
  MixamoRetargeter,
  retargetToVRM,
  vrmRetargetConfig,
  type MixamoAnimationSource,
} from '../../MixamoRetargeter';

export interface Paper6AblationRow {
  readonly variant: 'full-solver' | 'minus-solver' | 'baseline-no-pipeline';
  readonly per_frame_us: number;
  readonly reference_hash_equal: boolean;
  readonly divergence_vs_reference: number;
}

export interface Paper6AblationArtifact {
  readonly schema_version: 'paper-6-ablation-v1';
  readonly benchmark: 'paper-6-ablation-publication';
  readonly paper_ref: 'ai-ecosystem/research/paper-6-animation-sca.tex';
  readonly harness: 'packages/engine/src/animation/paper/benchmarks/p6-ablation-publication.ts';
  readonly source_clip_id: string;
  readonly frames: number;
  readonly iterations: number;
  readonly rows: readonly Paper6AblationRow[];
  readonly measured_at: string;
}

const SAMPLE_TIMES = Array.from({ length: 60 }, (_, i) => i / 60);
const ITERATIONS = 1500;

function keyframe(
  time: number,
  position: [number, number, number],
  rotation: [number, number, number, number] = [0, 0, 0, 1]
): ClipKeyframe & { position: [number, number, number]; rotation: [number, number, number, number] } {
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

  const bones = [
    'mixamorig:Hips',
    'mixamorig:LeftUpLeg',
    'mixamorig:LeftLeg',
    'mixamorig:LeftFoot',
    'mixamorig:RightUpLeg',
    'mixamorig:RightLeg',
    'mixamorig:RightFoot',
  ];

  return {
    id: 'paper-6-publication-walk',
    name: 'Paper 6 Publication Walk',
    duration: 1,
    boneAnimations: bones.map((mixamoBoneName, boneIndex) => ({
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

function cloneTrack(track: ClipTrack): ClipTrack {
  return {
    ...track,
    keyframes: track.keyframes.map((kf) => ({
      ...kf,
      value: Array.isArray(kf.value) ? [...kf.value] : kf.value,
    })),
  };
}

function sortedClone(clip: AnimClip, id: string, name: string): AnimClip {
  const out = new AnimClip(id, name, clip.getDuration());
  for (const track of clip.getTracks().map(cloneTrack).sort((a, b) => a.id.localeCompare(b.id))) {
    out.addTrack(track);
  }
  return out;
}

function applyPublicationConstraintSolver(clip: AnimClip): AnimClip {
  const out = new AnimClip(`${clip.id}-solved`, `${clip.name} solved`, clip.getDuration());
  for (const track of clip.getTracks().map(cloneTrack).sort((a, b) => a.id.localeCompare(b.id))) {
    const isFootPlantY =
      track.property === 'position'
      && track.component === 'y'
      && /(?:left|right)Foot/i.test(track.targetPath);

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

function baselineNoPipeline(source: MixamoAnimationSource): AnimClip {
  const out = new AnimClip(`${source.id}-baseline`, `${source.name} baseline`, source.duration);
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

function sampleVector(clip: AnimClip): Float64Array {
  const tracks = clip.getTracks().sort((a, b) => a.id.localeCompare(b.id));
  const values: number[] = [];
  for (const t of SAMPLE_TIMES) {
    const sampled = clip.sample(t);
    for (const track of tracks) {
      const key = track.component
        ? `${track.targetPath}.${track.property}.${track.component}`
        : `${track.targetPath}.${track.property}`;
      values.push(sampled.get(key) ?? 0);
    }
  }
  return Float64Array.from(values);
}

function maxL1AgainstReference(reference: Float64Array, candidate: Float64Array): number {
  const n = Math.max(reference.length, candidate.length);
  let max = 0;
  for (let i = 0; i < n; i++) {
    const delta = Math.abs((reference[i] ?? 0) - (candidate[i] ?? 0));
    if (delta > max) max = delta;
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

function measurePerFrameUs(clip: AnimClip): number {
  const t0 = performance.now();
  let sink = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    for (const t of SAMPLE_TIMES) {
      for (const value of clip.sample(t).values()) {
        sink += value;
      }
    }
  }
  if (sink === Number.NEGATIVE_INFINITY) {
    throw new Error('unreachable sink guard');
  }
  const elapsedMs = performance.now() - t0;
  return (elapsedMs * 1000) / (ITERATIONS * SAMPLE_TIMES.length);
}

export function runPaper6AblationBenchmark(): Paper6AblationArtifact {
  const source = makeSource();
  const retargeter = new MixamoRetargeter();
  const solverless = sortedClone(retargeter.retarget(source, vrmRetargetConfig()), 'paper-6-solverless', 'Paper 6 solverless');
  const full = applyPublicationConstraintSolver(retargetToVRM(source));
  const baseline = baselineNoPipeline(source);

  const reference = sampleVector(full);
  const referenceHash = fnv1aVector(reference);
  const variants = [
    ['full-solver', full],
    ['minus-solver', solverless],
    ['baseline-no-pipeline', baseline],
  ] as const;

  return {
    schema_version: 'paper-6-ablation-v1',
    benchmark: 'paper-6-ablation-publication',
    paper_ref: 'ai-ecosystem/research/paper-6-animation-sca.tex',
    harness: 'packages/engine/src/animation/paper/benchmarks/p6-ablation-publication.ts',
    source_clip_id: source.id,
    frames: SAMPLE_TIMES.length,
    iterations: ITERATIONS,
    measured_at: new Date().toISOString(),
    rows: variants.map(([variant, clip]) => {
      const vector = sampleVector(clip);
      return {
        variant,
        per_frame_us: Number(measurePerFrameUs(clip).toFixed(3)),
        reference_hash_equal: fnv1aVector(vector) === referenceHash,
        divergence_vs_reference: Number(maxL1AgainstReference(reference, vector).toFixed(6)),
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
