import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PressableTrait } from '../traits/PressableTrait';
import { SlidableTrait } from '../traits/SlidableTrait';
import { TraitContext } from '../traits/VRTraitSystem';

describe('Tactile UI Interactions', () => {
  let context: TraitContext;
  let node: any;
  let physicsBodyPos: any;

  beforeEach(() => {
    physicsBodyPos = { x: 0, y: 0, z: 0 };
    node = {
      id: 'test_node',
      properties: {
        position: [0, 0, 0],
        distance: 0.1, // 10cm press range for button
        axis: 'x', // Slider axis
        length: 1.0, // 1m slider
      },
    };

    context = {
      emit: vi.fn(),
      haptics: {
        pulse: vi.fn(),
        rumble: vi.fn(),
      },
      physics: {
        getBodyPosition: vi.fn().mockImplementation(() => ({ ...physicsBodyPos })),
        setKinematic: vi.fn(),
        applyVelocity: vi.fn(),
        raycast: vi.fn(),
        applyAngularVelocity: vi.fn(),
        getBodyVelocity: vi.fn(),
      },
      vr: {
        hands: { left: null, right: null },
        headset: { position: [0, 0, 0], rotation: [0, 0, 0] },
        getPointerRay: vi.fn(),
        getDominantHand: vi.fn(),
      },
      // Mock other context parts if needed
      audio: { playSound: vi.fn() },
      getState: vi.fn(),
      setState: vi.fn(),
      getScaleMultiplier: vi.fn(() => 1),
      setScaleContext: vi.fn(),
    } as unknown as TraitContext;
  });

  describe('PressableTrait', () => {
    it('emits press_start when depressed > 50%', () => {
      const trait = new PressableTrait();

      // Initial update to capture start pos
      trait.onUpdate(node, context, 0.016);

      // Simulate physics moving body down Z axis (local)
      // Pressed in by 0.06 (60% of distance)
      physicsBodyPos.z = 0.06;

      trait.onUpdate(node, context, 0.016);

      expect(context.emit).toHaveBeenCalledWith('ui_press_start', { nodeId: 'test_node' });
      expect(context.haptics.pulse).toHaveBeenCalled();
    });

    it('emits press_end when released < 30%', () => {
      const trait = new PressableTrait();

      // Setup: Already pressed
      trait.onUpdate(node, context, 0.016);
      physicsBodyPos.z = 0.06;
      trait.onUpdate(node, context, 0.016);
      expect(context.emit).toHaveBeenCalledWith('ui_press_start', { nodeId: 'test_node' });

      // Release to 0.02 (20%)
      physicsBodyPos.z = 0.02;
      trait.onUpdate(node, context, 0.016);

      expect(context.emit).toHaveBeenCalledWith('ui_press_end', { nodeId: 'test_node' });
    });
  });

  describe('SlidableTrait', () => {
    it('calculates value based on position along axis', () => {
      const trait = new SlidableTrait();

      // Initial update
      trait.onUpdate(node, context, 0.016);

      // Move along X axis
      // Length is 1.0. Range is -0.5 to 0.5 relative to center.
      // Move to 0.25 (75% mark? No, Center=0.5. -0.5=0, 0.5=1.
      // Value = (Delta + L/2) / L
      // Delta = 0.25. (0.25 + 0.5) / 1.0 = 0.75.
      physicsBodyPos.x = 0.25;

      trait.onUpdate(node, context, 0.016);

      expect(node.properties.value).toBeCloseTo(0.75);
      expect(context.emit).toHaveBeenCalledWith('ui_value_change', {
        nodeId: 'test_node',
        value: 0.75,
      });
    });

    it('triggers haptic rumble on value change', () => {
      const trait = new SlidableTrait();
      trait.onUpdate(node, context, 0.016);

      physicsBodyPos.x = 0.1; // 10% change -> 0.6 value
      trait.onUpdate(node, context, 0.016);

      expect(context.haptics.rumble).toHaveBeenCalled();
    });
  });
});
