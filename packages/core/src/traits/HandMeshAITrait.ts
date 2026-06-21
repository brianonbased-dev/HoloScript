/**
 * HandMeshAI Trait
 *
 * AI-powered hand mesh reconstruction extending HandTrackingTrait.
 * Generates detailed 3D hand meshes from skeletal tracking data.
 *
 * @version 1.0.0 (V43 Tier 3)
 */

import type { TraitHandler } from './TraitTypes';
import { handTrackingHandler } from './HandTrackingTrait';
// @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
import type { HandTrackingConfig } from './HandTrackingTrait';

// =============================================================================
// TYPES
// =============================================================================

export interface HandMeshAIConfig extends HandTrackingConfig {
  // Hand tracking model
  hand_model: 'mediapipe_hands' | 'frankmocap' | 'mano' | 'handoccnet';
  joint_count: 21 | 42;
  bimanual_tracking: boolean;

  // Mesh-specific additions
  mesh_resolution: 'low' | 'medium' | 'high' | 'ultra';
  texture_enabled: boolean;
  vertex_count: number;
  real_time_generation: boolean;

  // Gesture and performance
  gesture_detection: boolean;
  inference_fps: number;
  temporal_smoothing: number;
}

interface HandMesh {
  vertices: Float32Array;
  normals: Float32Array;
  uvs?: Float32Array;
  indices: Uint16Array;
  texture?: string;
}

interface HandMeshState {
  left_mesh: HandMesh | null;
  right_mesh: HandMesh | null;
  is_generating: boolean;
  last_update_time: number;
}

// =============================================================================
// MESH GENERATION
// =============================================================================

type Vec3Tuple = [number, number, number];

interface JointPoseLike {
  position: Vec3Tuple;
  radius?: number;
}

interface MeshBuilder {
  vertices: number[];
  normals: number[];
  indices: number[];
}

type HandName = 'left' | 'right';

const RESOLUTION_PROFILES: Record<
  string,
  { radialSegments: number; lengthSegments: number; radiusScale: number }
> = {
  low: { radialSegments: 5, lengthSegments: 1, radiusScale: 0.95 },
  medium: { radialSegments: 6, lengthSegments: 2, radiusScale: 1 },
  high: { radialSegments: 8, lengthSegments: 3, radiusScale: 1 },
  ultra: { radialSegments: 10, lengthSegments: 4, radiusScale: 1.05 },
};

const DEFAULT_JOINTS: Record<string, JointPoseLike> = {
  wrist: { position: [0, 0, 0], radius: 0.026 },
  thumb_metacarpal: { position: [-0.035, 0.02, 0.006], radius: 0.014 },
  thumb_proximal: { position: [-0.062, 0.045, 0.006], radius: 0.012 },
  thumb_distal: { position: [-0.087, 0.066, 0.003], radius: 0.01 },
  thumb_tip: { position: [-0.11, 0.082, 0], radius: 0.008 },
  index_metacarpal: { position: [-0.026, 0.052, 0], radius: 0.012 },
  index_proximal: { position: [-0.031, 0.097, 0], radius: 0.01 },
  index_intermediate: { position: [-0.034, 0.135, 0], radius: 0.0085 },
  index_distal: { position: [-0.036, 0.17, 0], radius: 0.007 },
  index_tip: { position: [-0.038, 0.2, 0], radius: 0.006 },
  middle_metacarpal: { position: [0, 0.058, 0.002], radius: 0.013 },
  middle_proximal: { position: [0, 0.112, 0.002], radius: 0.0105 },
  middle_intermediate: { position: [0, 0.156, 0.002], radius: 0.009 },
  middle_distal: { position: [0, 0.194, 0.001], radius: 0.0075 },
  middle_tip: { position: [0, 0.228, 0], radius: 0.006 },
  ring_metacarpal: { position: [0.026, 0.052, 0], radius: 0.012 },
  ring_proximal: { position: [0.031, 0.1, 0], radius: 0.0105 },
  ring_intermediate: { position: [0.035, 0.14, 0], radius: 0.0085 },
  ring_distal: { position: [0.037, 0.174, 0], radius: 0.007 },
  ring_tip: { position: [0.039, 0.203, 0], radius: 0.006 },
  pinky_metacarpal: { position: [0.05, 0.043, -0.001], radius: 0.0105 },
  pinky_proximal: { position: [0.058, 0.082, -0.001], radius: 0.009 },
  pinky_intermediate: { position: [0.064, 0.113, -0.001], radius: 0.0075 },
  pinky_distal: { position: [0.067, 0.141, -0.001], radius: 0.0065 },
  pinky_tip: { position: [0.069, 0.166, -0.001], radius: 0.0055 },
};

const JOINT_ALIASES: Record<string, string[]> = {
  wrist: ['wrist'],
  thumb_metacarpal: ['thumb_metacarpal', 'thumb_cmc'],
  thumb_proximal: ['thumb_proximal', 'thumb_mcp'],
  thumb_distal: ['thumb_distal', 'thumb_ip'],
  thumb_tip: ['thumb_tip'],
  index_metacarpal: ['index_metacarpal', 'index_mcp'],
  index_proximal: ['index_proximal', 'index_pip'],
  index_intermediate: ['index_intermediate', 'index_dip'],
  index_distal: ['index_distal', 'index_dip'],
  index_tip: ['index_tip'],
  middle_metacarpal: ['middle_metacarpal', 'middle_mcp'],
  middle_proximal: ['middle_proximal', 'middle_pip'],
  middle_intermediate: ['middle_intermediate', 'middle_dip'],
  middle_distal: ['middle_distal', 'middle_dip'],
  middle_tip: ['middle_tip'],
  ring_metacarpal: ['ring_metacarpal', 'ring_mcp'],
  ring_proximal: ['ring_proximal', 'ring_pip'],
  ring_intermediate: ['ring_intermediate', 'ring_dip'],
  ring_distal: ['ring_distal', 'ring_dip'],
  ring_tip: ['ring_tip'],
  pinky_metacarpal: ['pinky_metacarpal', 'pinky_mcp'],
  pinky_proximal: ['pinky_proximal', 'pinky_pip'],
  pinky_intermediate: ['pinky_intermediate', 'pinky_dip'],
  pinky_distal: ['pinky_distal', 'pinky_dip'],
  pinky_tip: ['pinky_tip'],
};

const HAND_CHAINS = [
  ['wrist', 'thumb_metacarpal', 'thumb_proximal', 'thumb_distal', 'thumb_tip'],
  [
    'wrist',
    'index_metacarpal',
    'index_proximal',
    'index_intermediate',
    'index_distal',
    'index_tip',
  ],
  [
    'wrist',
    'middle_metacarpal',
    'middle_proximal',
    'middle_intermediate',
    'middle_distal',
    'middle_tip',
  ],
  ['wrist', 'ring_metacarpal', 'ring_proximal', 'ring_intermediate', 'ring_distal', 'ring_tip'],
  [
    'wrist',
    'pinky_metacarpal',
    'pinky_proximal',
    'pinky_intermediate',
    'pinky_distal',
    'pinky_tip',
  ],
] as const;

const PALM_JOINTS = [
  'thumb_metacarpal',
  'index_metacarpal',
  'middle_metacarpal',
  'ring_metacarpal',
  'pinky_metacarpal',
] as const;

function toPose(value: unknown): JointPoseLike | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as { position?: unknown; radius?: unknown };
  if (!Array.isArray(candidate.position) || candidate.position.length < 3) return undefined;

  const position: Vec3Tuple = [
    Number(candidate.position[0]),
    Number(candidate.position[1]),
    Number(candidate.position[2]),
  ];

  if (position.some((component) => !Number.isFinite(component))) return undefined;

  const radius =
    typeof candidate.radius === 'number' && Number.isFinite(candidate.radius)
      ? candidate.radius
      : undefined;

  return { position, radius };
}

function lookupPose(joints: unknown, name: string): JointPoseLike | undefined {
  if (joints instanceof Map) {
    return toPose(joints.get(name));
  }

  if (!joints || typeof joints !== 'object') return undefined;
  return toPose((joints as Record<string, unknown>)[name]);
}

function getJointPose(joints: unknown, semanticName: string): JointPoseLike {
  for (const alias of JOINT_ALIASES[semanticName] ?? [semanticName]) {
    const pose = lookupPose(joints, alias);
    if (pose) return pose;
  }

  return DEFAULT_JOINTS[semanticName] ?? DEFAULT_JOINTS.wrist;
}

function addVec(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subVec(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scaleVec(v: Vec3Tuple, scale: number): Vec3Tuple {
  return [v[0] * scale, v[1] * scale, v[2] * scale];
}

function crossVec(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function lengthVec(v: Vec3Tuple): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalizeVec(v: Vec3Tuple, fallback: Vec3Tuple): Vec3Tuple {
  const length = lengthVec(v);
  if (length < 1e-6) return fallback;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function lerpVec(a: Vec3Tuple, b: Vec3Tuple, t: number): Vec3Tuple {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function lerpNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function pushVertex(builder: MeshBuilder, position: Vec3Tuple, normal: Vec3Tuple): number {
  builder.vertices.push(position[0], position[1], position[2]);
  builder.normals.push(normal[0], normal[1], normal[2]);
  return builder.vertices.length / 3 - 1;
}

function skinRadius(start: JointPoseLike, end: JointPoseLike, radiusScale: number): number {
  const inferred = lengthVec(subVec(end.position, start.position)) * 0.18;
  const radius = start.radius ?? end.radius ?? inferred;
  return Math.max(0.004, Math.min(0.035, radius * radiusScale));
}

function addBoneTube(
  builder: MeshBuilder,
  start: JointPoseLike,
  end: JointPoseLike,
  radialSegments: number,
  lengthSegments: number,
  radiusScale: number
): void {
  const axisVector = subVec(end.position, start.position);
  if (lengthVec(axisVector) < 1e-5) return;

  const axis = normalizeVec(axisVector, [0, 1, 0]);
  const helper: Vec3Tuple = Math.abs(axis[1]) < 0.92 ? [0, 1, 0] : [1, 0, 0];
  const tangent = normalizeVec(crossVec(axis, helper), [1, 0, 0]);
  const bitangent = normalizeVec(crossVec(axis, tangent), [0, 0, 1]);
  const startRadius = skinRadius(start, end, radiusScale);
  const endRadius = skinRadius(end, start, radiusScale * 0.82);
  const baseIndex = builder.vertices.length / 3;

  for (let row = 0; row <= lengthSegments; row++) {
    const t = row / lengthSegments;
    const center = lerpVec(start.position, end.position, t);
    const radius = lerpNumber(startRadius, endRadius, t);

    for (let segment = 0; segment < radialSegments; segment++) {
      const angle = (segment / radialSegments) * Math.PI * 2;
      const normal = normalizeVec(
        addVec(scaleVec(tangent, Math.cos(angle)), scaleVec(bitangent, Math.sin(angle))),
        tangent
      );
      pushVertex(builder, addVec(center, scaleVec(normal, radius)), normal);
    }
  }

  for (let row = 0; row < lengthSegments; row++) {
    const rowStart = baseIndex + row * radialSegments;
    const nextRowStart = rowStart + radialSegments;

    for (let segment = 0; segment < radialSegments; segment++) {
      const nextSegment = (segment + 1) % radialSegments;
      builder.indices.push(
        rowStart + segment,
        nextRowStart + segment,
        rowStart + nextSegment,
        rowStart + nextSegment,
        nextRowStart + segment,
        nextRowStart + nextSegment
      );
    }
  }
}

function addPalmSurface(builder: MeshBuilder, joints: unknown): void {
  const wrist = getJointPose(joints, 'wrist');
  const palm = PALM_JOINTS.map((joint) => getJointPose(joints, joint));
  const center = scaleVec(
    palm.reduce((acc, pose) => addVec(acc, pose.position), wrist.position),
    1 / (palm.length + 1)
  );
  const normal = normalizeVec(
    crossVec(subVec(palm[1].position, wrist.position), subVec(palm[4].position, wrist.position)),
    [0, 0, 1]
  );
  const centerIndex = pushVertex(builder, center, normal);
  const wristIndex = pushVertex(builder, wrist.position, normal);
  const palmIndices = palm.map((pose) => pushVertex(builder, pose.position, normal));

  for (let index = 0; index < palmIndices.length - 1; index++) {
    builder.indices.push(centerIndex, palmIndices[index], palmIndices[index + 1]);
  }

  builder.indices.push(
    centerIndex,
    wristIndex,
    palmIndices[0],
    centerIndex,
    palmIndices[4],
    wristIndex
  );
}

function generateHandMesh(jointPositions: unknown, resolution: string): HandMesh {
  const profile = RESOLUTION_PROFILES[resolution] ?? RESOLUTION_PROFILES.medium;
  const builder: MeshBuilder = { vertices: [], normals: [], indices: [] };

  addPalmSurface(builder, jointPositions);

  for (const chain of HAND_CHAINS) {
    for (let index = 0; index < chain.length - 1; index++) {
      addBoneTube(
        builder,
        getJointPose(jointPositions, chain[index]),
        getJointPose(jointPositions, chain[index + 1]),
        profile.radialSegments,
        profile.lengthSegments,
        profile.radiusScale
      );
    }
  }

  return {
    vertices: new Float32Array(builder.vertices),
    normals: new Float32Array(builder.normals),
    indices: new Uint16Array(builder.indices),
  };
}

function applyHandMeshResult(
  node: unknown,
  context: { emit?: (event: string, payload?: unknown) => void },
  hand: HandName,
  mesh: HandMesh
): void {
  const meshState = (node as { __handMeshState?: HandMeshState }).__handMeshState;
  if (!meshState) return;

  if (hand === 'left') {
    meshState.left_mesh = mesh;
  } else {
    meshState.right_mesh = mesh;
  }

  meshState.is_generating = false;

  context.emit?.('on_hand_mesh_updated', {
    node,
    hand,
    mesh,
    vertexCount: mesh.vertices.length / 3,
  });
}

function requestAndGenerateHandMesh(
  node: unknown,
  config: HandMeshAIConfig,
  context: { emit?: (event: string, payload?: unknown) => void },
  hand: HandName,
  joints: unknown,
  meshState: HandMeshState
): void {
  meshState.is_generating = true;

  context.emit?.('hand_mesh_generate', {
    node,
    hand,
    joints,
    resolution: config.mesh_resolution,
  });

  const mesh = generateHandMesh(joints, config.mesh_resolution);

  context.emit?.('hand_mesh_result', {
    node,
    hand,
    mesh,
    source: 'in_process_skinning',
  });

  applyHandMeshResult(node, context, hand, mesh);
}

// =============================================================================
// HANDLER
// =============================================================================

export const handMeshAIHandler: TraitHandler<HandMeshAIConfig> = {
  ...handTrackingHandler,
  name: 'hand_mesh_ai',

  defaultConfig: {
    ...handTrackingHandler.defaultConfig,
    // Hand tracking model
    hand_model: 'mediapipe_hands',
    joint_count: 21,
    bimanual_tracking: false,
    // Mesh defaults
    mesh_resolution: 'medium',
    texture_enabled: false,
    vertex_count: 256,
    real_time_generation: true,
    // Gesture and performance
    gesture_detection: false,
    inference_fps: 30,
    temporal_smoothing: 0.3,
  },

  onAttach(node, config, context) {
    // Call base HandTracking attach
    handTrackingHandler.onAttach?.(node, config as HandTrackingConfig, context);

    // Add mesh state
    const meshState: HandMeshState = {
      left_mesh: null,
      right_mesh: null,
      is_generating: false,
      last_update_time: 0,
    };
    node.__handMeshState = meshState;

    context.emit?.('hand_mesh_ai_init', {
      node,
      meshResolution: config.mesh_resolution,
      textureEnabled: config.texture_enabled,
    });
  },

  onDetach(node, config, context) {
    handTrackingHandler.onDetach?.(node, config as HandTrackingConfig, context);
    delete node.__handMeshState;
  },

  onUpdate(node, config, context, delta) {
    // Call base update
    handTrackingHandler.onUpdate?.(node, config as HandTrackingConfig, context, delta);

    const meshState = node.__handMeshState as HandMeshState;
    const trackingState = node.__handTrackingState;

    if (!meshState || !trackingState || !config.real_time_generation) return;

    // Generate meshes if hands are visible
    const currentTime = Date.now();
    const updateInterval = config.mesh_resolution === 'ultra' ? 100 : 50; // ms

    if (currentTime - meshState.last_update_time > updateInterval) {
      // @ts-expect-error
      if (trackingState.left.visible) {
        requestAndGenerateHandMesh(
          node,
          config,
          context,
          'left',
          // @ts-expect-error
          trackingState.left.joints,
          meshState
        );
      }

      // @ts-expect-error
      if (trackingState.right.visible) {
        requestAndGenerateHandMesh(
          node,
          config,
          context,
          'right',
          // @ts-expect-error
          trackingState.right.joints,
          meshState
        );
      }

      meshState.last_update_time = currentTime;
    }
  },

  onEvent(node, config, context, event) {
    if (event.type === 'hand_mesh_result') {
      const hand = event.hand as 'left' | 'right';
      const mesh = event.mesh as HandMesh;

      applyHandMeshResult(node, context, hand, mesh);
    }

    // Forward to base HandTracking handler
    handTrackingHandler.onEvent?.(node, config as HandTrackingConfig, context, event);
  },
};
