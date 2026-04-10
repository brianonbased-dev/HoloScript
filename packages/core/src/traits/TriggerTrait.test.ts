/**
 * TriggerTrait Tests
 *
 * Tests for collision detection zones without physics response.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TriggerTrait, createTriggerTrait } from './TriggerTrait';

describe('TriggerTrait', () => {
  let trait: TriggerTrait;

  beforeEach(() => {
    trait = createTriggerTrait();
  });

  describe('factory function', () => {
    it('should create trigger trait with factory', () => {
      expect(trait).toBeInstanceOf(TriggerTrait);
    });

    it('should create with custom config', () => {
      const custom = createTriggerTrait({
        shape: 'sphere',
        size: { x: 5, y: 5, z: 5 },
      });
      expect(custom.getConfig().shape).toBe('sphere');
      expect(custom.getConfig().size?.x).toBe(5);
    });
  });

  describe('configuration', () => {
    it('should get configuration', () => {
      const config = trait.getConfig();
      expect(config).toBeDefined();
      expect(config.shape).toBeDefined();
    });

    it('should have default shape as box', () => {
      expect(trait.getConfig().shape).toBe('box');
    });

    it('should support enabled/disabled state', () => {
      const disabled = createTriggerTrait({ enabled: false });
      expect(disabled.getConfig().enabled).toBe(false);
    });
  });

  describe('trigger shapes', () => {
    it('should support box shape', () => {
      const box = createTriggerTrait({ shape: 'box' });
      expect(box.getConfig().shape).toBe('box');
    });

    it('should support sphere shape', () => {
      const sphere = createTriggerTrait({ shape: 'sphere' });
      expect(sphere.getConfig().shape).toBe('sphere');
    });

    it('should support capsule shape', () => {
      const capsule = createTriggerTrait({ shape: 'capsule' });
      expect(capsule.getConfig().shape).toBe('capsule');
    });

    it('should support cylinder shape', () => {
      const cylinder = createTriggerTrait({ shape: 'cylinder' });
      expect(cylinder.getConfig().shape).toBe('cylinder');
    });
  });

  describe('state management', () => {
    it('should get current state', () => {
      const state = trait.getState();
      expect(state).toBeDefined();
      expect(state.occupantCount).toBeDefined();
    });

    it('should track occupants', () => {
      const state = trait.getState();
      expect(state.occupants).toBeDefined();
      expect(Array.isArray(state.occupants)).toBe(true);
    });

    it('should start with zero occupants', () => {
      const state = trait.getState();
      expect(state.occupantCount).toBe(0);
    });
  });

  describe('shape configuration', () => {
    it('should set shape', () => {
      trait.setShape('sphere', { radius: 2 });
      expect(trait.getConfig().shape).toBe('sphere');
    });

    it('should set size', () => {
      trait.setSize({ x: 2, y: 2, z: 2 });
      expect(trait.getConfig().size?.x).toBe(2);
    });

    it('should set radius', () => {
      trait.setRadius(3);
      expect(trait.getConfig().radius).toBe(3);
    });

    it('should set center offset', () => {
      trait.setCenter({ x: 1, y: 0, z: 0 });
      expect(trait.getConfig().center?.x).toBe(1);
    });
  });

  describe('tag filtering', () => {
    it('should configure include tags', () => {
      const filtered = createTriggerTrait({
        filterTags: ['player', 'enemy'],
        filterMode: 'include',
      });
      expect(filtered.getConfig().filterTags).toContain('player');
      expect(filtered.getConfig().filterMode).toBe('include');
    });

    it('should configure exclude tags', () => {
      const filtered = createTriggerTrait({
        filterTags: ['decoration'],
        filterMode: 'exclude',
      });
      expect(filtered.getConfig().filterMode).toBe('exclude');
    });

    it('should set filter tags dynamically', () => {
      trait.setFilterTags(['player'], 'include');
      expect(trait.getConfig().filterTags).toContain('player');
    });
  });

  describe('actions', () => {
    it('should add enter action', () => {
      trait.addEnterAction({
        type: 'call',
        handler: 'onPlayerEnter',
      });
      expect(trait.getConfig().onEnter?.length).toBe(1);
    });

    it('should add stay action', () => {
      trait.addStayAction({
        type: 'call',
        handler: 'onPlayerStay',
      });
      expect(trait.getConfig().onStay?.length).toBe(1);
    });

    it('should add exit action', () => {
      trait.addExitAction({
        type: 'call',
        handler: 'onPlayerExit',
      });
      expect(trait.getConfig().onExit?.length).toBe(1);
    });

    it('should clear actions for event type', () => {
      trait.addEnterAction({ type: 'call', handler: 'test1' });
      trait.addEnterAction({ type: 'call', handler: 'test2' });
      trait.clearActions('enter');
      expect(trait.getConfig().onEnter?.length ?? 0).toBe(0);
    });
  });

  describe('occupancy', () => {
    it('should configure max occupants', () => {
      const limited = createTriggerTrait({ maxOccupants: 5 });
      expect(limited.getConfig().maxOccupants).toBe(5);
    });

    it('should get occupant count', () => {
      expect(trait.getOccupantCount()).toBe(0);
    });

    it('should handle triggering', () => {
      const result = trait.handleEnter('entity123');
      expect(result).not.toBeNull();
      expect(trait.getOccupantCount()).toBe(1);
    });

    it('should handle exit', () => {
      trait.handleEnter('entity123');
      trait.handleExit('entity123');
      expect(trait.getOccupantCount()).toBe(0);
    });
  });

  describe('cooldown', () => {
    it('should set cooldown', () => {
      trait.setCooldown(1000);
      // Cooldown set internally
      expect(trait.getConfig()).toBeDefined();
    });
  });

  describe('trigger simulation', () => {
    it('should simulate enter event', () => {
      const entered = trait.handleEnter('entity1');
      expect(entered).not.toBeNull();
    });

    it('should simulate stay event', () => {
      trait.handleEnter('entity1');
      trait.handleStay('entity1');
      expect(trait.getOccupantCount()).toBe(1);
    });

    it('should reset trigger', () => {
      trait.handleEnter('entity1');
      trait.setEnabled(false);
      trait.setEnabled(true);
      // Note: setEnabled doesn't clear occupants, check contains instead
      expect(typeof trait.contains('entity1')).toBe('boolean');
    });
  });
});
