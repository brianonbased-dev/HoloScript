import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gestureHandler, GestureConfig } from '../GestureTrait';

describe('GestureTrait', () => {
  let context: any;
  let node: any;
  let config: GestureConfig;
  let vrContext: any;

  beforeEach(() => {
    node = { id: 'gesture_node' };

    vrContext = {
      hands: {
        left: { position: [0, 0, 0], pinchStrength: 0 },
        right: { position: [0, 0, 0], pinchStrength: 0 },
      },
    };

    context = {
      vr: vrContext,
      emit: vi.fn(),
      getNode: vi.fn(),
    };

    config = {
      enabledGestures: ['swipe_left', 'swipe_right', 'pinch'],
      swipeThreshold: 0.1,
      pinchThreshold: 0.9,
      debounce: 0, // Zero debounce for testing
    };

    // Initialize state
    gestureHandler.onAttach!(node, config, context);
  });

  it('detects pinch', () => {
    // 1. No pinch
    gestureHandler.onUpdate!(node, config, context, 0.016);
    expect(context.emit).not.toHaveBeenCalled();

    // 2. Pinch start
    vrContext.hands.left.pinchStrength = 1.0;
    gestureHandler.onUpdate!(node, config, context, 0.016);

    expect(context.emit).toHaveBeenCalledWith('gesture', {
      type: 'pinch',
      hand: 'left',
      nodeId: 'gesture_node',
    });
  });

  it('detects swipe right', () => {
    // 1. Initial pos
    vrContext.hands.right.position = [0, 0, 0];
    gestureHandler.onUpdate!(node, config, context, 0.016);

    // 2. Move right > threshold
    vrContext.hands.right.position = [0.2, 0, 0];
    gestureHandler.onUpdate!(node, config, context, 0.016);

    expect(context.emit).toHaveBeenCalledWith('gesture', {
      type: 'swipe_right',
      hand: 'right',
      nodeId: 'gesture_node',
    });
  });

  it('detects swipe left', () => {
    // 1. Initial pos
    vrContext.hands.right.position = [0, 0, 0];
    gestureHandler.onUpdate!(node, config, context, 0.016);

    // 2. Move left > threshold
    vrContext.hands.right.position = [-0.2, 0, 0];
    gestureHandler.onUpdate!(node, config, context, 0.016);

    expect(context.emit).toHaveBeenCalledWith('gesture', {
      type: 'swipe_left',
      hand: 'right',
      nodeId: 'gesture_node',
    });
  });

  it('ignores small movements', () => {
    // 1. Initial pos
    vrContext.hands.right.position = [0, 0, 0];
    gestureHandler.onUpdate!(node, config, context, 0.016);

    // 2. Move slightly right < threshold
    vrContext.hands.right.position = [0.05, 0, 0];
    gestureHandler.onUpdate!(node, config, context, 0.016);

    expect(context.emit).not.toHaveBeenCalled();
  });
});
