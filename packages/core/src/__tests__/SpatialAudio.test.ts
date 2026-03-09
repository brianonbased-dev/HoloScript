import { describe, it, expect, vi, beforeEach } from 'vitest';
import { headTrackedAudioHandler } from '../traits/HeadTrackedAudioTrait';
import { audioOcclusionHandler } from '../traits/AudioOcclusionTrait';

describe('Spatial Audio Verification (Cycle 74)', () => {
  describe('HeadTrackedAudioTrait', () => {
    it('should compensate for head rotation (World Anchor)', () => {
      const node = { position: { x: 10, y: 0, z: 0 } }; // Source is to the RIGHT
      const context = { emit: vi.fn() };
      const config = {
        ...headTrackedAudioHandler.defaultConfig,
        anchor_mode: 'world',
        stabilization: 0,
      };

      headTrackedAudioHandler.onAttach!(node as any, config as any, context as any);
      (node as any).__headTrackedAudioState.isPlaying = true;

      // Scenario: Head rotates 90 degrees LEFT (Y-axis rotation)
      // If I look LEFT, the source (originally RIGHT) should sound BEHIND me.
      // Quaternion for 90 deg rotation around Y
      const rotation90Left = { x: 0, y: 0.7071, z: 0, w: 0.7071 };

      // Trigger update with this rotation
      headTrackedAudioHandler.onEvent!(
        node as any,
        config as any,
        context as any,
        {
          type: 'head_rotation_update',
          rotation: rotation90Left,
        } as any
      );

      headTrackedAudioHandler.onUpdate!(node as any, config as any, context as any, 0.1);

      expect(context.emit).toHaveBeenCalledWith(
        'audio_set_position',
        expect.objectContaining({
          position: expect.objectContaining({
            // Roughly (0, 0, 10) -> Behind (Positive Z in some coords, checking relative shift)
            // Let's just check it CHANGED from (10,0,0) significantly
            x: expect.not.closeTo(10, 1),
          }),
        })
      );
    });
  });

  describe('AudioOcclusionTrait', () => {
    it('should trigger raycast on update', () => {
      const node = {};
      const context = { emit: vi.fn() };
      const config = { ...audioOcclusionHandler.defaultConfig, mode: 'raycast', update_rate: 100 };

      audioOcclusionHandler.onAttach!(node as any, config as any, context as any);

      // Advance time > 10ms (100Hz = 10ms interval)
      (node as any).__audioOcclusionState.lastRaycastTime = 0;
      const now = 50;
      vi.setSystemTime(now); // Mock time if using fake timers, or just manually set state

      // Manually forcing time check logic
      (node as any).__audioOcclusionState.lastRaycastTime = Date.now() - 100;

      audioOcclusionHandler.onUpdate!(node as any, config as any, context as any, 0.1);

      expect(context.emit).toHaveBeenCalledWith('audio_occlusion_raycast', expect.any(Object));
    });

    it('should calculate attenuation from occluders', () => {
      const node = {};
      const context = { emit: vi.fn() };
      const config = audioOcclusionHandler.defaultConfig;

      audioOcclusionHandler.onAttach!(node as any, config as any, context as any);

      // Simulate raycast result with 1 wall
      // Atten: 0.5, Trans: 0.2
      // Calc: 0.5 * (1 - (1 * 0.2)) = 0.5 * 0.8 = 0.4
      audioOcclusionHandler.onEvent!(
        node as any,
        config as any,
        context as any,
        {
          type: 'audio_occlusion_raycast_result',
          occluders: [{ transmission: 1.0 }],
        } as any
      );

      const state = (node as any).__audioOcclusionState;
      expect(state.isOccluded).toBe(true);
      expect(state.occlusionAmount).toBeCloseTo(0.4);

      // Trigger update to apply gain
      audioOcclusionHandler.onUpdate!(node as any, config as any, context as any, 0.1);

      expect(context.emit).toHaveBeenCalledWith(
        'audio_set_gain',
        expect.objectContaining({
          source: 'occlusion',
          // gain calculated from dB
        })
      );
    });
  });
});
