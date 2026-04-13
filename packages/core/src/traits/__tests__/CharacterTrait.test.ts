/**
 * CharacterTrait Tests
 *
 * Tests for first/third person character controller.
 *
 * @version 3.1.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CharacterTrait,
  type CharacterConfig,
  type MovementInput,
  type Vector3,
} from '../CharacterTrait';

describe('CharacterTrait', () => {
  let character: CharacterTrait;

  beforeEach(() => {
    character = new CharacterTrait();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const config = character.getConfig();

      expect(config.height).toBe(1.8);
      expect(config.radius).toBe(0.3);
      expect(config.walkSpeed).toBe(3.0);
      expect(config.gravity).toBe(-9.81);
    });

    it('should accept custom config', () => {
      character = new CharacterTrait({
        height: 2.0,
        walkSpeed: 4.0,
        jumpHeight: 2.0,
      });

      const config = character.getConfig();
      expect(config.height).toBe(2.0);
      expect(config.walkSpeed).toBe(4.0);
      expect(config.jumpHeight).toBe(2.0);
    });

    it('should initialize state', () => {
      const state = character.getState();

      expect(state.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(state.velocity).toEqual({ x: 0, y: 0, z: 0 });
      expect(state.movementMode).toBe('walking');
      expect(state.groundState).toBe('grounded');
      expect(state.isCrouching).toBe(false);
      expect(state.isSprinting).toBe(false);
    });
  });

  describe('position', () => {
    it('should set position', () => {
      character.setPosition({ x: 10, y: 5, z: 20 });

      const state = character.getState();
      expect(state.position).toEqual({ x: 10, y: 5, z: 20 });
    });

    it('should get position', () => {
      character.setPosition({ x: 1, y: 2, z: 3 });

      const pos = character.getPosition();
      expect(pos.x).toBe(1);
      expect(pos.y).toBe(2);
      expect(pos.z).toBe(3);
    });
  });

  describe('velocity', () => {
    it('should set velocity', () => {
      character.setVelocity({ x: 5, y: 0, z: 0 });

      const state = character.getState();
      expect(state.velocity.x).toBe(5);
    });

    it('should get velocity', () => {
      character.setVelocity({ x: 1, y: 2, z: 3 });

      const vel = character.getVelocity();
      expect(vel.x).toBe(1);
      expect(vel.y).toBe(2);
      expect(vel.z).toBe(3);
    });
  });

  describe('movement modes', () => {
    it('should start in walking mode', () => {
      expect(character.getMovementMode()).toBe('walking');
    });

    it('should switch to running mode', () => {
      character.setMovementMode('running');
      expect(character.getMovementMode()).toBe('running');
    });

    it('should switch to sprinting mode', () => {
      character.setMovementMode('sprinting');
      expect(character.getMovementMode()).toBe('sprinting');
    });

    it('should switch to crouching mode', () => {
      character.setMovementMode('crouching');
      expect(character.getMovementMode()).toBe('crouching');
    });
  });

  describe('ground state', () => {
    it('should start grounded', () => {
      expect(character.isGrounded()).toBe(true);
    });

    it('should check if grounded', () => {
      expect(character.isGrounded()).toBe(true);
    });

    it('should update grounded state', () => {
      character.setGrounded(false);
      expect(character.isGrounded()).toBe(false);
    });
  });

  describe('crouch', () => {
    it('should start not crouching', () => {
      expect(character.isCrouching()).toBe(false);
    });

    it('should report crouching in crouch mode', () => {
      character.setMovementMode('crouching');
      expect(character.getMovementMode()).toBe('crouching');
    });
  });

  describe('Sprint', () => {
    it('should start not sprinting', () => {
      expect(character.isSprinting()).toBe(false);
    });

    it('should Sprint in Sprint mode', () => {
      character.setMovementMode('sprinting');
      expect(character.getMovementMode()).toBe('sprinting');
    });
  });

  describe('jump', () => {
    it('should jump when grounded', () => {
      const result = character.tryJump();
      expect(result).toBe(true);
      expect(character.isGrounded()).toBe(false);
    });

    it('should not double jump by default', () => {
      character.tryJump();
      const result = character.tryJump();
      // Default maxJumps is 1, so second jump fails
      expect(result).toBe(false);
    });

    it('should allow double jump when configured', () => {
      character = new CharacterTrait({ maxJumps: 2 });

      character.tryJump();
      const result = character.tryJump();

      expect(result).toBe(true);
    });
  });

  describe('events', () => {
    it('should register event listeners', () => {
      const callback = vi.fn();
      character.on('jump', callback);

      character.tryJump();

      expect(callback).toHaveBeenCalled();
    });

    it('should remove event listeners', () => {
      const callback = vi.fn();
      character.on('jump', callback);
      character.off('jump', callback);

      character.tryJump();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('movement', () => {
    it('should process forward movement', () => {
      const input: MovementInput = {
        forward: 1,
        strafe: 0,
      };

      character.move(input, 0.016);

      // Should have some velocity after moving
      const state = character.getState();
      expect(state.isMoving).toBe(true);
    });
  });

  describe('teleport', () => {
    it('should teleport to position', () => {
      character.teleport({ x: 100, y: 50, z: 200 });

      const pos = character.getPosition();
      expect(pos.x).toBe(100);
      expect(pos.y).toBe(50);
      expect(pos.z).toBe(200);
    });

    it('should reset velocity on teleport', () => {
      character.setVelocity({ x: 10, y: 5, z: 10 });
      character.teleport({ x: 0, y: 0, z: 0 });

      const vel = character.getVelocity();
      expect(vel.x).toBe(0);
      expect(vel.y).toBe(0);
      expect(vel.z).toBe(0);
    });

    it('should optionally keep velocity on teleport', () => {
      character.setVelocity({ x: 10, y: 5, z: 10 });
      character.teleport({ x: 0, y: 0, z: 0 }, false);

      const vel = character.getVelocity();
      expect(vel.x).toBe(10);
    });
  });

  describe('export/import state', () => {
    it('should export current state', () => {
      character.setPosition({ x: 1, y: 2, z: 3 });
      const state = character.exportState();

      expect(state.position.x).toBe(1);
      expect(state.position.y).toBe(2);
      expect(state.position.z).toBe(3);
    });

    it('should import state', () => {
      character.importState({
        position: [10, 20, 30],
      });

      const pos = character.getPosition();
      expect(pos.x).toBe(10);
      expect(pos.y).toBe(20);
      expect(pos.z).toBe(30);
    });
  });
});
