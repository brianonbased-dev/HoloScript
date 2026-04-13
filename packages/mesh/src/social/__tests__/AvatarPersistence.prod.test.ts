/**
 * AvatarPersistence Production Tests
 *
 * Save/load/delete/list/clone avatar configs, deep copy safety.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AvatarPersistence, type AvatarConfig } from '@holoscript/core';

function makeConfig(userId: string): AvatarConfig {
  return {
    userId,
    displayName: `User-${userId}`,
    appearance: {
      modelUrl: '/models/avatar.glb',
      primaryColor: '#ff0000',
      secondaryColor: '#0000ff',
      accessories: ['hat', 'glasses'],
      height: 1.8,
    },
    personality: { mood: 'neutral' } as any,
    trackingSource: 'controller' as any,
    ikMode: 'upperBody' as any,
    createdAt: 1000,
    updatedAt: 1000,
  };
}

describe('AvatarPersistence — Production', () => {
  let persistence: AvatarPersistence;

  beforeEach(() => {
    persistence = new AvatarPersistence();
  });

  describe('save / load', () => {
    it('saves and loads config', () => {
      persistence.save(makeConfig('u1'));
      const loaded = persistence.load('u1');
      expect(loaded?.displayName).toBe('User-u1');
    });

    it('returns null for missing', () => {
      expect(persistence.load('nope')).toBeNull();
    });

    it('deep copies — mutation safe', () => {
      const cfg = makeConfig('u1');
      persistence.save(cfg);
      cfg.appearance.primaryColor = '#000000';
      expect(persistence.load('u1')?.appearance.primaryColor).toBe('#ff0000');
    });

    it('requires userId', () => {
      const cfg = makeConfig('');
      cfg.userId = '';
      expect(() => persistence.save(cfg)).toThrow('userId is required');
    });
  });

  describe('delete', () => {
    it('deletes stored config', () => {
      persistence.save(makeConfig('u1'));
      expect(persistence.delete('u1')).toBe(true);
      expect(persistence.load('u1')).toBeNull();
    });

    it('returns false for missing', () => {
      expect(persistence.delete('nope')).toBe(false);
    });
  });

  describe('list', () => {
    it('lists all user IDs', () => {
      persistence.save(makeConfig('u1'));
      persistence.save(makeConfig('u2'));
      expect(persistence.list()).toEqual(expect.arrayContaining(['u1', 'u2']));
    });
  });

  describe('clone', () => {
    it('clones to new userId', () => {
      persistence.save(makeConfig('u1'));
      const cloned = persistence.clone('u1', 'u2');
      expect(cloned?.userId).toBe('u2');
      expect(cloned?.displayName).toBe('User-u1');
      expect(persistence.size).toBe(2);
    });

    it('returns null for missing source', () => {
      expect(persistence.clone('nope', 'u2')).toBeNull();
    });
  });

  describe('size', () => {
    it('counts stored configs', () => {
      expect(persistence.size).toBe(0);
      persistence.save(makeConfig('u1'));
      expect(persistence.size).toBe(1);
    });
  });
});
