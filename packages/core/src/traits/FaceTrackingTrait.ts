/**
 * FaceTracking Trait
 *
 * Face mesh and expression tracking for avatars and effects.
 * Supports ARKit, HTC, and custom blend shape sets.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type MeshTopology = 'arkit' | 'htc' | 'meta' | 'generic';

type BlendShape =
  | 'eyeBlinkLeft'
  | 'eyeBlinkRight'
  | 'eyeLookDownLeft'
  | 'eyeLookDownRight'
  | 'eyeLookInLeft'
  | 'eyeLookInRight'
  | 'eyeLookOutLeft'
  | 'eyeLookOutRight'
  | 'eyeLookUpLeft'
  | 'eyeLookUpRight'
  | 'eyeSquintLeft'
  | 'eyeSquintRight'
  | 'eyeWideLeft'
  | 'eyeWideRight'
  | 'jawForward'
  | 'jawLeft'
  | 'jawRight'
  | 'jawOpen'
  | 'mouthClose'
  | 'mouthFunnel'
  | 'mouthPucker'
  | 'mouthLeft'
  | 'mouthRight'
  | 'mouthSmileLeft'
  | 'mouthSmileRight'
  | 'mouthFrownLeft'
  | 'mouthFrownRight'
  | 'browDownLeft'
  | 'browDownRight'
  | 'browInnerUp'
  | 'browOuterUpLeft'
  | 'browOuterUpRight'
  | 'cheekPuff'
  | 'cheekSquintLeft'
  | 'cheekSquintRight'
  | 'noseSneerLeft'
  | 'noseSneerRight'
  | 'tongueOut';

interface EyeGaze {
  direction: { x: number; y: number; z: number };
  origin: { x: number; y: number; z: number };
  confidence: number;
}

interface FaceTrackingState {
  isTracking: boolean;
  blendShapes: Map<BlendShape, number>;
  leftEye: EyeGaze | null;
  rightEye: EyeGaze | null;
  headPose: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
  } | null;
  lastUpdateTime: number;
  smoothedShapes: Map<BlendShape, number>;
  lipSyncPhoneme: string | null;
}

interface FaceTrackingConfig {
  blend_shapes: boolean;
  mesh_topology: MeshTopology;
  eye_tracking: boolean;
  lip_sync: boolean;
  smoothing: number;
  confidence_threshold: number;
  update_rate: number;
}

// =============================================================================
// LIP SYNC HELPERS
// =============================================================================

function detectPhoneme(blendShapes: Map<BlendShape, number>): string | null {
  const jawOpen = blendShapes.get('jawOpen') ?? 0;
  const mouthFunnel = blendShapes.get('mouthFunnel') ?? 0;
  const mouthPucker = blendShapes.get('mouthPucker') ?? 0;
  const mouthSmileL = blendShapes.get('mouthSmileLeft') ?? 0;
  const mouthSmileR = blendShapes.get('mouthSmileRight') ?? 0;
  const mouthClose = blendShapes.get('mouthClose') ?? 0;

  if (jawOpen > 0.7) return 'AA';
  if (mouthFunnel > 0.6) return 'OO';
  if (mouthPucker > 0.6) return 'UU';
  if ((mouthSmileL + mouthSmileR) / 2 > 0.5) return 'EE';
  if (mouthClose > 0.5 && jawOpen < 0.2) return 'MM';
  if (jawOpen > 0.3 && jawOpen < 0.6) return 'AH';

  return null;
}

// =============================================================================
// HANDLER
// =============================================================================

export const faceTrackingHandler: TraitHandler<FaceTrackingConfig> = {
  name: 'face_tracking',

  defaultConfig: {
    blend_shapes: true,
    mesh_topology: 'arkit',
    eye_tracking: true,
    lip_sync: true,
    smoothing: 0.3,
    confidence_threshold: 0.5,
    update_rate: 60,
  },

  onAttach(node, config, context) {
    const state: FaceTrackingState = {
      isTracking: false,
      blendShapes: new Map(),
      leftEye: null,
      rightEye: null,
      headPose: null,
      lastUpdateTime: 0,
      smoothedShapes: new Map(),
      lipSyncPhoneme: null,
    };
    node.__faceTrackingState = state;

    context.emit?.('face_tracking_start', {
      node,
      topology: config.mesh_topology,
      blendShapes: config.blend_shapes,
      eyeTracking: config.eye_tracking,
    });
  },

  onDetach(node, config, context) {
    context.emit?.('face_tracking_stop', { node });
    delete node.__faceTrackingState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__faceTrackingState as FaceTrackingState;
    if (!state || !state.isTracking) return;

    if (config.blend_shapes && state.smoothedShapes.size > 0) {
      context.emit?.('avatar_blend_shapes', {
        node,
        blendShapes: Object.fromEntries(state.smoothedShapes),
      });
    }

    if (config.eye_tracking && (state.leftEye || state.rightEye)) {
      context.emit?.('avatar_eye_gaze', {
        node,
        leftEye: state.leftEye,
        rightEye: state.rightEye,
      });
    }

    if (state.headPose) {
      context.emit?.('avatar_head_pose', {
        node,
        position: state.headPose.position,
        rotation: state.headPose.rotation,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__faceTrackingState as FaceTrackingState;
    if (!state) return;

    if (event.type === 'face_data_update') {
      const wasTracking = state.isTracking;
      state.isTracking = true;
      state.lastUpdateTime = Date.now();

      if (config.blend_shapes && event.blendShapes) {
        const shapes = event.blendShapes as Record<string, number>;

        for (const [name, value] of Object.entries(shapes)) {
          state.blendShapes.set(name as BlendShape, value);
          const prev = state.smoothedShapes.get(name as BlendShape) ?? value;
          const smoothed = prev * config.smoothing + value * (1 - config.smoothing);
          state.smoothedShapes.set(name as BlendShape, smoothed);
        }

        if (config.lip_sync) {
          const phoneme = detectPhoneme(state.smoothedShapes);
          if (phoneme !== state.lipSyncPhoneme) {
            state.lipSyncPhoneme = phoneme;
            context.emit?.('lip_sync_phoneme', { node, phoneme });
          }
        }
      }

      if (config.eye_tracking && event.eyes) {
        const eyes = event.eyes as { left?: EyeGaze; right?: EyeGaze };
        if (eyes.left) state.leftEye = eyes.left;
        if (eyes.right) state.rightEye = eyes.right;
      }

      if (event.headPose) {
        state.headPose = event.headPose as typeof state.headPose;
      }

      if (!wasTracking) {
        context.emit?.('face_tracking_found', { node });
      }

      context.emit?.('face_expression_update', {
        node,
        blendShapes: Object.fromEntries(state.smoothedShapes),
      });
    } else if (event.type === 'face_tracking_lost') {
      if (state.isTracking) {
        state.isTracking = false;
        context.emit?.('face_tracking_lost', { node });
      }
    }
  },
};

export default faceTrackingHandler;
