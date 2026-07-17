/**
 * Paper 6 fixed runtime-pose publication runner.
 *
 * This is deliberately narrower than a rendered retargeting benchmark. It
 * drives the shipped MixamoRetargeter -> AnimationEngine.playSkeletal() ->
 * BoneSystem path for a fixed three-bone, no-shear hierarchy and records its
 * local/world pose bytes. Rendering, skinning, independent implementations,
 * SLERP, and cross-vendor identity are explicit non-claims in the receipt.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AnimationEngine } from '../../AnimationEngine';
import { BoneSystem, type BoneTransform } from '../../BoneSystem';
import {
  MixamoRetargeter,
  vrmRetargetConfig,
  type MixamoAnimationSource,
} from '../../MixamoRetargeter';

const BONE_ORDER = ['hips', 'leftUpperLeg', 'leftLowerLeg'] as const;
const TRANSFORM_FIELDS = [
  'tx',
  'ty',
  'tz',
  'rx',
  'ry',
  'rz',
  'rw',
  'sx',
  'sy',
  'sz',
] as const satisfies readonly (keyof BoneTransform)[];
const SAMPLE_TIME_SECONDS = 0.5;
const REPEAT_RUNS = 3;
const EPSILON = 1e-9;

type BoneId = (typeof BONE_ORDER)[number];

export interface Paper6PoseSnapshot {
  readonly local: BoneTransform;
  readonly world: BoneTransform;
}

export interface Paper6RuntimePoseRun {
  readonly poseHash: string;
  readonly poseBytes: Uint8Array;
  readonly snapshots: Readonly<Record<BoneId, Paper6PoseSnapshot>>;
}

export interface Paper6RuntimePoseArtifact {
  readonly schema_version: 'paper-6-runtime-pose-v1';
  readonly benchmark: 'paper-6-runtime-pose-publication';
  readonly paper_ref: 'ai-ecosystem/research/paper-6-animation-sca.tex';
  readonly harness: 'packages/engine/src/animation/paper/benchmarks/p6-runtime-pose-publication.ts';
  readonly runtime_path: readonly [
    'MixamoRetargeter.retarget',
    'AnimationEngine.playSkeletal/update',
    'AnimClip.sampleValues',
    'BoneSystem.applyLocalTransforms/updateWorldTransforms',
  ];
  readonly fixture: {
    readonly topology: 'hips -> leftUpperLeg -> leftLowerLeg';
    readonly bone_order: readonly BoneId[];
    readonly sample_time_seconds: number;
    readonly transform_fields_per_local_or_world_pose: typeof TRANSFORM_FIELDS;
    readonly packed_views_per_bone: readonly ['local', 'world'];
    readonly encoding: 'IEEE-754 binary32 little-endian';
    readonly canonicalization: 'abs(value)<1e-7 => +0; quaternion sign w>=0';
    readonly pose_bytes: number;
    readonly hierarchy_scope: 'compact TRS with identity scale; no shear';
  };
  readonly verification: {
    readonly expected_pose_asserted: true;
    readonly repeat_runs: number;
    readonly unique_pose_hashes: number;
    readonly pose_hash: string;
    readonly negative_control: 'root rotation removed';
    readonly negative_control_hash: string;
    readonly negative_control_diverged: true;
    readonly negative_control_child_world_position_changed: true;
    readonly negative_control_child_world_rotation_changed: true;
  };
  readonly expected_pose: Readonly<Record<BoneId, Paper6PoseSnapshot>>;
  readonly claims: {
    readonly same_process_fixed_fixture_pose_identity: true;
    readonly quaternion_nlerp_local_sampling: true;
    readonly hamilton_parent_child_rotation: true;
    readonly parent_rotated_child_offsets: true;
    readonly rendered: false;
    readonly skinning_palette_verified: false;
    readonly general_rig_or_nonuniform_scale_guarantee: false;
    readonly independent_engine_or_implementation: false;
    readonly gpu_or_wgsl: false;
    readonly cross_browser_vendor_or_machine_identity: false;
    readonly slerp: false;
    readonly minimax_slerp: false;
  };
  readonly environment: {
    readonly execution: 'single-process-cpu-javascript';
    readonly os: string;
    readonly arch: string;
    readonly cpu_model: string;
    readonly logical_cores: number;
    readonly node: string;
  };
  readonly measured_at: string;
}

function cloneTransform(transform: BoneTransform): BoneTransform {
  return { ...transform };
}

function makeSource(removeRootRotation: boolean): MixamoAnimationSource {
  const identity: [number, number, number, number] = [0, 0, 0, 1];
  const rootEnd: [number, number, number, number] = removeRootRotation ? identity : [0, 0, 1, 0];

  return {
    id: 'paper-6-pose-canonical',
    name: 'Paper 6 Pose Canonical',
    duration: 1,
    boneAnimations: [
      {
        mixamoBoneName: 'mixamorig:Hips',
        keyframes: [
          { time: 0, position: [1, 2, 3], rotation: identity },
          { time: 1, position: [1, 2, 3], rotation: rootEnd },
        ],
      },
      {
        mixamoBoneName: 'mixamorig:LeftUpLeg',
        keyframes: [
          { time: 0, position: [0, 1, 0], rotation: identity },
          { time: 1, position: [0, 1, 0], rotation: [1, 0, 0, 0] },
        ],
      },
      {
        mixamoBoneName: 'mixamorig:LeftLeg',
        keyframes: [
          { time: 0, position: [0, 1, 0], rotation: identity },
          { time: 1, position: [0, 1, 0], rotation: identity },
        ],
      },
    ],
  };
}

function makeBones(): BoneSystem {
  const bones = new BoneSystem();
  bones.addBone('hips', 'hips', null);
  bones.addBone('leftUpperLeg', 'leftUpperLeg', 'hips');
  bones.addBone('leftLowerLeg', 'leftLowerLeg', 'leftUpperLeg');
  return bones;
}

function canonicalQuaternion(transform: BoneTransform): [number, number, number, number] {
  const quaternion: [number, number, number, number] = [
    transform.rx,
    transform.ry,
    transform.rz,
    transform.rw,
  ];
  const firstNonZero = quaternion.find((value) => value !== 0) ?? 0;
  if (transform.rw < 0 || (transform.rw === 0 && firstNonZero < 0)) {
    return quaternion.map((value) => -value) as [number, number, number, number];
  }
  return quaternion;
}

function canonicalTransformValues(transform: BoneTransform): number[] {
  const [rx, ry, rz, rw] = canonicalQuaternion(transform);
  return [
    transform.tx,
    transform.ty,
    transform.tz,
    rx,
    ry,
    rz,
    rw,
    transform.sx,
    transform.sy,
    transform.sz,
  ].map((value) => (Math.abs(value) < 1e-7 ? 0 : value));
}

function packPose(snapshots: Readonly<Record<BoneId, Paper6PoseSnapshot>>): Uint8Array {
  const floatsPerBone = TRANSFORM_FIELDS.length * 2;
  const buffer = new ArrayBuffer(
    BONE_ORDER.length * floatsPerBone * Float32Array.BYTES_PER_ELEMENT
  );
  const view = new DataView(buffer);
  let byteOffset = 0;

  for (const boneId of BONE_ORDER) {
    for (const transform of [snapshots[boneId].local, snapshots[boneId].world]) {
      for (const value of canonicalTransformValues(transform)) {
        view.setFloat32(byteOffset, value, true);
        byteOffset += Float32Array.BYTES_PER_ELEMENT;
      }
    }
  }

  return new Uint8Array(buffer);
}

function hashPose(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function assertClose(actual: number, expected: number, context: string): void {
  if (Math.abs(actual - expected) > EPSILON) {
    throw new Error(`${context}: expected ${expected}, received ${actual}`);
  }
}

function assertTransform(
  actual: BoneTransform,
  expected: Partial<BoneTransform>,
  context: string
): void {
  for (const [field, value] of Object.entries(expected) as [keyof BoneTransform, number][]) {
    assertClose(actual[field], value, `${context}.${field}`);
  }
}

function assertExpectedPose(snapshots: Readonly<Record<BoneId, Paper6PoseSnapshot>>): void {
  const s = Math.SQRT1_2;
  assertTransform(
    snapshots.hips.local,
    { tx: 1, ty: 2, tz: 3, rx: 0, ry: 0, rz: s, rw: s },
    'hips.local'
  );
  assertTransform(
    snapshots.leftUpperLeg.local,
    { tx: 0, ty: 1, tz: 0, rx: s, ry: 0, rz: 0, rw: s },
    'leftUpperLeg.local'
  );
  assertTransform(
    snapshots.leftUpperLeg.world,
    { tx: 0, ty: 2, tz: 3, rx: 0.5, ry: 0.5, rz: 0.5, rw: 0.5 },
    'leftUpperLeg.world'
  );
  assertTransform(
    snapshots.leftLowerLeg.world,
    { tx: 0, ty: 2, tz: 4, rx: 0.5, ry: 0.5, rz: 0.5, rw: 0.5 },
    'leftLowerLeg.world'
  );
}

function readableSnapshots(
  snapshots: Readonly<Record<BoneId, Paper6PoseSnapshot>>
): Readonly<Record<BoneId, Paper6PoseSnapshot>> {
  const rounded = {} as Record<BoneId, Paper6PoseSnapshot>;
  for (const boneId of BONE_ORDER) {
    const round = (transform: BoneTransform): BoneTransform =>
      Object.fromEntries(
        Object.entries(transform).map(([field, value]) => [field, Number(value.toFixed(9))])
      ) as unknown as BoneTransform;
    rounded[boneId] = {
      local: round(snapshots[boneId].local),
      world: round(snapshots[boneId].world),
    };
  }
  return rounded;
}

function transformChanged(
  a: BoneTransform,
  b: BoneTransform,
  fields: readonly (keyof BoneTransform)[]
): boolean {
  return fields.some((field) => Math.abs(a[field] - b[field]) > EPSILON);
}

export function runPaper6RuntimePoseFixture(removeRootRotation = false): Paper6RuntimePoseRun {
  const clip = new MixamoRetargeter().retarget(makeSource(removeRootRotation), vrmRetargetConfig());
  const bones = makeBones();
  const engine = new AnimationEngine();
  engine.playSkeletal(clip, bones);
  engine.update(SAMPLE_TIME_SECONDS);

  const snapshots = {} as Record<BoneId, Paper6PoseSnapshot>;
  for (const boneId of BONE_ORDER) {
    const bone = bones.getBone(boneId);
    if (!bone) throw new Error(`Fixture bone "${boneId}" is missing`);
    snapshots[boneId] = {
      local: cloneTransform(bone.local),
      world: cloneTransform(bone.world),
    };
  }

  if (!removeRootRotation) assertExpectedPose(snapshots);
  const poseBytes = packPose(snapshots);
  return { poseHash: hashPose(poseBytes), poseBytes, snapshots };
}

export function runPaper6RuntimePoseBenchmark(): Paper6RuntimePoseArtifact {
  const runs = Array.from({ length: REPEAT_RUNS }, () => runPaper6RuntimePoseFixture());
  const uniqueHashes = new Set(runs.map((run) => run.poseHash));
  if (uniqueHashes.size !== 1) {
    throw new Error(`Canonical pose fixture diverged across ${REPEAT_RUNS} same-process runs`);
  }

  const canonical = runs[0];
  const negativeControl = runPaper6RuntimePoseFixture(true);
  const childPositionChanged = transformChanged(
    canonical.snapshots.leftLowerLeg.world,
    negativeControl.snapshots.leftLowerLeg.world,
    ['tx', 'ty', 'tz']
  );
  const childRotationChanged = transformChanged(
    canonical.snapshots.leftLowerLeg.world,
    negativeControl.snapshots.leftLowerLeg.world,
    ['rx', 'ry', 'rz', 'rw']
  );
  if (
    canonical.poseHash === negativeControl.poseHash ||
    !childPositionChanged ||
    !childRotationChanged
  ) {
    throw new Error('Parent-rotation negative control did not change the descendant world pose');
  }

  const cpuInfo = cpus();
  return {
    schema_version: 'paper-6-runtime-pose-v1',
    benchmark: 'paper-6-runtime-pose-publication',
    paper_ref: 'ai-ecosystem/research/paper-6-animation-sca.tex',
    harness: 'packages/engine/src/animation/paper/benchmarks/p6-runtime-pose-publication.ts',
    runtime_path: [
      'MixamoRetargeter.retarget',
      'AnimationEngine.playSkeletal/update',
      'AnimClip.sampleValues',
      'BoneSystem.applyLocalTransforms/updateWorldTransforms',
    ],
    fixture: {
      topology: 'hips -> leftUpperLeg -> leftLowerLeg',
      bone_order: BONE_ORDER,
      sample_time_seconds: SAMPLE_TIME_SECONDS,
      transform_fields_per_local_or_world_pose: TRANSFORM_FIELDS,
      packed_views_per_bone: ['local', 'world'],
      encoding: 'IEEE-754 binary32 little-endian',
      canonicalization: 'abs(value)<1e-7 => +0; quaternion sign w>=0',
      pose_bytes: canonical.poseBytes.byteLength,
      hierarchy_scope: 'compact TRS with identity scale; no shear',
    },
    verification: {
      expected_pose_asserted: true,
      repeat_runs: REPEAT_RUNS,
      unique_pose_hashes: uniqueHashes.size,
      pose_hash: canonical.poseHash,
      negative_control: 'root rotation removed',
      negative_control_hash: negativeControl.poseHash,
      negative_control_diverged: true,
      negative_control_child_world_position_changed: true,
      negative_control_child_world_rotation_changed: true,
    },
    expected_pose: readableSnapshots(canonical.snapshots),
    claims: {
      same_process_fixed_fixture_pose_identity: true,
      quaternion_nlerp_local_sampling: true,
      hamilton_parent_child_rotation: true,
      parent_rotated_child_offsets: true,
      rendered: false,
      skinning_palette_verified: false,
      general_rig_or_nonuniform_scale_guarantee: false,
      independent_engine_or_implementation: false,
      gpu_or_wgsl: false,
      cross_browser_vendor_or_machine_identity: false,
      slerp: false,
      minimax_slerp: false,
    },
    environment: {
      execution: 'single-process-cpu-javascript',
      os: `${platform()} ${release()}`,
      arch: arch(),
      cpu_model: cpuInfo[0]?.model ?? 'unknown',
      logical_cores: cpuInfo.length,
      node: process.version,
    },
    measured_at: new Date().toISOString(),
  };
}

export function writePaper6RuntimePoseArtifacts(
  artifact: Paper6RuntimePoseArtifact,
  outPaths: readonly string[] = [
    'packages/engine/.bench-logs/paper-6-runtime-pose-publication.json',
  ]
): void {
  const payload = `${JSON.stringify(artifact, null, 2)}\n`;
  for (const outPath of outPaths) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, payload, 'utf8');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const artifact = runPaper6RuntimePoseBenchmark();
  const outPaths = process.argv.slice(2);
  writePaper6RuntimePoseArtifacts(artifact, outPaths.length > 0 ? outPaths : undefined);
  console.log(JSON.stringify(artifact, null, 2));
}
