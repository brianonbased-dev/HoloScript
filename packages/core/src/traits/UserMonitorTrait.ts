/**
 * @holoscript/core User Monitor Trait
 *
 * Passively monitors user tracking data and behavioral signals to detect
 * emotional states like frustration and confusion.
 */

import type { TraitHandler, TraitContext } from './TraitTypes';
// @ts-expect-error During migration
import { getEmotionDetector, type EmotionInference } from '../runtime/EmotionDetector';
import { HSPlusNode, Vector3 } from '../types/HoloScriptPlus';

export interface UserMonitorConfig {
  /** Frequency of emotion inference (in seconds, default 0.2s = 5Hz) */
  updateRate?: number;

  /** Sensitivity to jitter (0-1) */
  jitterSensitivity?: number;

  /** Auto-adjust interactions based on frustration */
  adaptiveAssistance?: boolean;
}

interface UserMonitorState {
  lastInferenceTime: number;
  headPositions: Vector3[];
  handPositions: Vector3[];
  clickCount: number;
  lastClickTime: number;
  frustration: number;
  confusion: number;
  engagement: number;
}

/** Module-level state store to avoid casting node to any */
const traitState = new WeakMap<HSPlusNode, UserMonitorState>();

function performInference(
  node: HSPlusNode,
  config: UserMonitorConfig,
  _context: TraitContext,
  state: UserMonitorState
): void {
  const detector = getEmotionDetector('default') || getEmotionDetector('lite');
  if (!detector) return;

  // Calculate stability (inverse of standard deviation of movement)
  const headStability = calculateStability(state.headPositions);
  const handStability = calculateStability(state.handPositions);

  // Interaction intensity (rapid clicks)
  const interactionIntensity = Math.min(1.0, state.clickCount / 10);

  const inference: EmotionInference = detector.infer({
    headStability,
    handStability,
    interactionIntensity,
    behavioralStressing: interactionIntensity > 0.5 ? 0.7 : 0.2,
  });

  // Update state
  state.frustration = inference.frustration;
  state.confusion = inference.confusion;
  state.engagement = inference.engagement;

  // Sync to node properties for HoloScript usage
  if (node.properties) {
    node.properties.userFrustration = state.frustration;
    node.properties.userConfusion = state.confusion;
  }
}

export const userMonitorHandler: TraitHandler<UserMonitorConfig> = {
  name: 'user_monitor',

  defaultConfig: {
    updateRate: 0.2,
    jitterSensitivity: 0.5,
    adaptiveAssistance: true,
  },

  onAttach(node, _config, _context) {
    const state: UserMonitorState = {
      lastInferenceTime: 0,
      headPositions: [],
      handPositions: [],
      clickCount: 0,
      lastClickTime: 0,
      frustration: 0,
      confusion: 0,
      engagement: 0,
    };
    traitState.set(node, state);
    node.__userMonitorState = state;
  },

  onDetach(node) {
    traitState.delete(node);
    delete node.__userMonitorState;
  },

  onUpdate(node, config, context, delta) {
    const state = traitState.get(node);
    if (!state) return;

    // 1. Collect tracking signals
    const headPos = context.vr.headset.position;
    const hand = context.vr.getDominantHand();
    const handPos = hand ? hand.position : null;

    const hx = Array.isArray(headPos) ? headPos[0] : (headPos.x ?? 0);
    const hy = Array.isArray(headPos) ? headPos[1] : (headPos.y ?? 0);
    const hz = Array.isArray(headPos) ? headPos[2] : (headPos.z ?? 0);
    state.headPositions.push([hx, hy, hz] as unknown as Vector3);
    if (handPos) {
      const px = Array.isArray(handPos) ? handPos[0] : (handPos.x ?? 0);
      const py = Array.isArray(handPos) ? handPos[1] : (handPos.y ?? 0);
      const pz = Array.isArray(handPos) ? handPos[2] : (handPos.z ?? 0);
      state.handPositions.push([px, py, pz] as unknown as Vector3);
    }

    // Keep buffers small (last 30 frames ~0.5s)
    if (state.headPositions.length > 30) state.headPositions.shift();
    if (state.handPositions.length > 30) state.handPositions.shift();

    // 2. Periodic inference
    state.lastInferenceTime += delta;
    if (state.lastInferenceTime >= (config.updateRate ?? 0.2)) {
      state.lastInferenceTime = 0;
      performInference(node, config, context, state);
    }
  },

  onEvent(node, config, context, event) {
    const state = traitState.get(node);
    if (!state) return;

    if (event.type === 'click') {
      const now = Date.now();
      // Track rapid clicking as a stress signal
      if (now - state.lastClickTime < 500) {
        state.clickCount++;
      } else {
        state.clickCount = Math.max(0, state.clickCount - 1);
      }
      state.lastClickTime = now;
    }
  },
};

function calculateStability(positions: Vector3[]): number {
  if (positions.length < 2) return 1.0;

  let totalDelta = 0;
  for (let i = 1; i < positions.length; i++) {
    const p1 = positions[i - 1];
    const p2 = positions[i];
    totalDelta += Math.sqrt(
      ((p2.x ?? p2[0] ?? 0) - (p1.x ?? p1[0] ?? 0)) ** 2 +
        ((p2.y ?? p2[1] ?? 0) - (p1.y ?? p1[1] ?? 0)) ** 2 +
        ((p2.z ?? p2[2] ?? 0) - (p1.z ?? p1[2] ?? 0)) ** 2
    );
  }

  const avgDelta = totalDelta / (positions.length - 1);
  // Normalize: 0.05m delta per frame is high jitter for VR
  return Math.max(0, 1.0 - avgDelta / 0.05);
}

export default userMonitorHandler;
