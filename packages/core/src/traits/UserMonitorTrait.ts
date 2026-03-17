/**
 * @holoscript/core User Monitor Trait
 *
 * Passively monitors user tracking data and behavioral signals to detect
 * emotional states like frustration and confusion.
 */

import type { TraitHandler, TraitContext } from './TraitTypes';
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
    node.__userMonitorState = state;
  },

  onDetach(node) {
    delete node.__userMonitorState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__userMonitorState as UserMonitorState;
    if (!state) return;

    // 1. Collect tracking signals
    const headPos = context.vr.headset.position;
    const hand = context.vr.getDominantHand();
    const handPos = hand ? hand.position : null;

    state.headPositions.push([...(headPos as any)] as any as Vector3);
    if (handPos) state.handPositions.push([...(handPos as any)] as any as Vector3);

    // Keep buffers small (last 30 frames ~0.5s)
    if (state.headPositions.length > 30) state.headPositions.shift();
    if (state.handPositions.length > 30) state.handPositions.shift();

    // 2. Periodic inference
    state.lastInferenceTime += delta;
    if (state.lastInferenceTime >= (config.updateRate ?? 0.2)) {
      state.lastInferenceTime = 0;
      (this as any).performInference(node, config, context, state);
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__userMonitorState as UserMonitorState;
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

/**
 * Perform emotion inference using the @builtin detector
 */
(userMonitorHandler as any).performInference = function (
  node: HSPlusNode,
  config: UserMonitorConfig,
  context: TraitContext,
  state: UserMonitorState
) {
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
};

function calculateStability(positions: Vector3[]): number {
  if (positions.length < 2) return 1.0;

  let totalDelta = 0;
  for (let i = 1; i < positions.length; i++) {
    const p1 = positions[i - 1];
    const p2 = positions[i];
    totalDelta += Math.sqrt(
      ((p2 as any)[0] - (p1 as any)[0]) ** 2 +
        ((p2 as any)[1] - (p1 as any)[1]) ** 2 +
        ((p2 as any)[2] - (p1 as any)[2]) ** 2
    );
  }

  const avgDelta = totalDelta / (positions.length - 1);
  // Normalize: 0.05m delta per frame is high jitter for VR
  return Math.max(0, 1.0 - avgDelta / 0.05);
}

export default userMonitorHandler;
