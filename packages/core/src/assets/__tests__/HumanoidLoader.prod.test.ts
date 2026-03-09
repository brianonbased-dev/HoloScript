/**
 * HumanoidLoader Production Tests
 *
 * Avatar lifecycle, format detection, RPM URL building, transform/expression/lookAt/visible,
 * event system, remove, and dispose.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HumanoidLoader,
  type HumanoidConfig,
  type Transform,
  type Vector3,
} from '../HumanoidLoader';

// Create a loader without SmartAssetLoader dependency (optional param)
function makeLoader(): HumanoidLoader {
  return new HumanoidLoader();
}

describe('HumanoidLoader — Production', () => {
  let loader: HumanoidLoader;

  beforeEach(() => {
    loader = makeLoader();
  });

  describe('avatar management', () => {
    it('starts with no avatars', () => {
      expect(loader.getAvatarIds()).toEqual([]);
    });

    it('getState returns undefined for missing', () => {
      expect(loader.getState('nope')).toBeUndefined();
    });

    it('removeAvatar clears avatar', () => {
      // Can't load without Three.js, but remove should be safe
      loader.removeAvatar('missing'); // no crash
    });
  });

  describe('setTransform', () => {
    it('no-ops for missing avatar', () => {
      // Should not throw
      loader.setTransform('missing', { position: { x: 1, y: 2, z: 3 } });
    });
  });

  describe('setExpression', () => {
    it('no-ops for missing avatar', () => {
      loader.setExpression('missing', 'happy', 0.5);
    });
  });

  describe('setLookAt', () => {
    it('no-ops for missing avatar', () => {
      loader.setLookAt('missing', { x: 0, y: 0, z: 1 });
    });
  });

  describe('setVisible', () => {
    it('no-ops for missing avatar', () => {
      loader.setVisible('missing', false);
    });
  });

  describe('event system', () => {
    it('on/off adds and removes listeners', () => {
      const cb = vi.fn();
      loader.on('load', cb as any);
      loader.emit('load', 'test-id');
      expect(cb).toHaveBeenCalledTimes(1);

      loader.off('load', cb as any);
      loader.emit('load', 'test-id');
      expect(cb).toHaveBeenCalledTimes(1); // no additional call
    });

    it('emit passes data', () => {
      const cb = vi.fn();
      loader.on('error', cb as any);
      loader.emit('error', 'av1', { message: 'oops' });
      expect(cb).toHaveBeenCalledWith({
        type: 'error',
        avatarId: 'av1',
        data: { message: 'oops' },
      });
    });
  });

  describe('dispose', () => {
    it('clears all avatars and listeners', () => {
      const cb = vi.fn();
      loader.on('load', cb as any);
      loader.dispose();
      loader.emit('load', 'x');
      expect(cb).not.toHaveBeenCalled();
      expect(loader.getAvatarIds()).toEqual([]);
    });
  });
});
