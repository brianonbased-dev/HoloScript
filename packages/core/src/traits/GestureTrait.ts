import { VRHand, Vector3 } from '../types/HoloScriptPlus';
import { TraitHandler, TraitContext, VRContext } from './TraitTypes';

export type GestureType =
  | 'swipe_left'
  | 'swipe_right'
  | 'swipe_up'
  | 'swipe_down'
  | 'pinch'
  | 'palm_open';

export interface GestureConfig {
  enabledGestures: GestureType[];
  swipeThreshold?: number; // Distance in meters
  pinchThreshold?: number; // 0-1 strength
  palmThreshold?: number; // 0-1 openness? No, usually distinct state.
  debounce?: number; // ms
}

interface GestureState {
  lastPosition: Vector3 | null;
  lastTime: number;
  isPinching: boolean;
  lastGestureTime: number;
}

const gestureStates = new Map<string, Record<string, GestureState>>(); // nodeId -> hand -> state

export const gestureHandler: TraitHandler<GestureConfig> = {
  name: 'gesture_recognition',
  defaultConfig: {
    enabledGestures: ['swipe_left', 'swipe_right', 'pinch'],
    swipeThreshold: 0.1,
    pinchThreshold: 0.9,
    debounce: 300,
  },

  onAttach(node, config, context) {
    gestureStates.set(node.id!, {
      left: { lastPosition: null, lastTime: 0, isPinching: false, lastGestureTime: 0 },
      right: { lastPosition: null, lastTime: 0, isPinching: false, lastGestureTime: 0 },
    });
  },

  onDetach(node, config, context) {
    gestureStates.delete(node.id!);
  },

  onUpdate(node, config, context, delta) {
    const vrContext = context.vr as VRContext;
    if (!vrContext || !vrContext.hands) return;

    const nodeStates = gestureStates.get(node.id!);
    if (!nodeStates) return;

    const time = performance.now();

    (['left', 'right'] as const).forEach((handName) => {
      const hand = vrContext.hands[handName];
      if (!hand) return;

      const state = nodeStates[handName];

      // 1. Pinch Detection
      if (config.enabledGestures.includes('pinch')) {
        const isPinching = (hand.pinchStrength || 0) > (config.pinchThreshold || 0.9);
        if (isPinching && !state.isPinching) {
          if (time - state.lastGestureTime > (config.debounce || 300)) {
            context.emit('gesture', { type: 'pinch', hand: handName, nodeId: node.id });
            state.lastGestureTime = time;
          }
        }
        state.isPinching = isPinching;
      }

      // Helper to extract x/y consistently
      const getX = (p: Vector3) => Array.isArray(p) ? p[0] : (p.x ?? 0);
      const getY = (p: Vector3) => Array.isArray(p) ? p[1] : (p.y ?? 0);

      // 2. Swipe Detection
      // Require tracked movement over short window
      if (state.lastPosition) {
        const dx = getX(hand.position) - getX(state.lastPosition);
        const dy = getY(hand.position) - getY(state.lastPosition);
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > (config.swipeThreshold || 0.1)) {
          if (time - state.lastGestureTime > (config.debounce || 300)) {
            let type: GestureType | null = null;
            if (Math.abs(dx) > Math.abs(dy)) {
              type = dx > 0 ? 'swipe_right' : 'swipe_left';
            } else {
              type = dy > 0 ? 'swipe_up' : 'swipe_down';
            }

            if (type && config.enabledGestures.includes(type)) {
              context.emit('gesture', { type, hand: handName, nodeId: node.id });
              state.lastGestureTime = time;
              // Reset position to prevent double triggers?
              // Or just rely on debounce.
            }
          }
        }
      }

      state.lastPosition = Array.isArray(hand.position) ? [...hand.position] : { x: hand.position.x ?? 0, y: hand.position.y ?? 0, z: hand.position.z ?? 0 };
      state.lastTime = time;
    });
  },
};
