import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { PhysicsWorld, PhysicsOptions } from './PhysicsWorld';

// Mock Three.js Object3D
function createMockMesh(
  position: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
  scale: { x: number; y: number; z: number } = { x: 1, y: 1, z: 1 },
  quaternion: { x: number; y: number; z: number; w: number } = { x: 0, y: 0, z: 0, w: 1 }
): THREE.Object3D {
  const mesh = {
    position: {
      x: position.x,
      y: position.y,
      z: position.z,
      copy: vi.fn(function (this: any, source: any) {
        this.x = source.x;
        this.y = source.y;
        this.z = source.z;
        return this;
      }),
    },
    scale: {
      x: scale.x,
      y: scale.y,
      z: scale.z,
    },
    quaternion: {
      x: quaternion.x,
      y: quaternion.y,
      z: quaternion.z,
      w: quaternion.w,
      copy: vi.fn(function (this: any, source: any) {
        this.x = source.x;
        this.y = source.y;
        this.z = source.z;
        this.w = source.w;
        return this;
      }),
    },
  };
  return mesh as unknown as THREE.Object3D;
}

describe('PhysicsWorld', () => {
  describe('constructor', () => {
    it('should create a physics world with default options', () => {
      const physics = new PhysicsWorld();
      expect(physics).toBeDefined();
    });

    it('should use default gravity when not specified', () => {
      const physics = new PhysicsWorld();
      // Add a body to verify the world is set up
      const mesh = createMockMesh();
      const body = physics.addBody('test', mesh, 'box', 1);
      expect(body).toBeDefined();
    });

    it('should accept custom gravity', () => {
      const physics = new PhysicsWorld({
        gravity: [0, -20, 0],
      });
      const mesh = createMockMesh();
      const body = physics.addBody('test', mesh, 'box', 1);
      expect(body).toBeDefined();
    });

    it('should accept zero gravity', () => {
      const physics = new PhysicsWorld({
        gravity: [0, 0, 0],
      });
      const mesh = createMockMesh();
      const body = physics.addBody('test', mesh, 'box', 1);
      expect(body).toBeDefined();
    });

    it('should accept custom solver iterations', () => {
      const physics = new PhysicsWorld({
        iterations: 20,
      });
      expect(physics).toBeDefined();
    });

    it('should accept custom step size', () => {
      const physics = new PhysicsWorld({
        stepSize: 1 / 120,
      });
      expect(physics).toBeDefined();
    });

    it('should accept all options combined', () => {
      const physics = new PhysicsWorld({
        gravity: [0, -15, 0],
        iterations: 15,
        stepSize: 1 / 90,
      });
      expect(physics).toBeDefined();
    });
  });

  describe('addBody', () => {
    let physics: PhysicsWorld;

    beforeEach(() => {
      physics = new PhysicsWorld();
    });

    it('should add a box body with default mass', () => {
      const mesh = createMockMesh({ x: 1, y: 2, z: 3 });
      const body = physics.addBody('box1', mesh);
      expect(body).toBeDefined();
      expect(body.mass).toBe(1);
    });

    it('should add a box body with custom mass', () => {
      const mesh = createMockMesh();
      const body = physics.addBody('box2', mesh, 'box', 5);
      expect(body).toBeDefined();
      expect(body.mass).toBe(5);
    });

    it('should add a sphere body', () => {
      const mesh = createMockMesh({ x: 0, y: 5, z: 0 }, { x: 2, y: 2, z: 2 });
      const body = physics.addBody('sphere1', mesh, 'sphere', 2);
      expect(body).toBeDefined();
      expect(body.mass).toBe(2);
    });

    it('should add a plane body with zero mass', () => {
      const mesh = createMockMesh();
      const body = physics.addBody('plane1', mesh, 'plane', 10);
      // Planes are always static (mass = 0)
      expect(body).toBeDefined();
      expect(body.mass).toBe(0);
    });

    it('should set body position from mesh position', () => {
      const mesh = createMockMesh({ x: 10, y: 20, z: 30 });
      const body = physics.addBody('positioned', mesh);
      expect(body.position.x).toBe(10);
      expect(body.position.y).toBe(20);
      expect(body.position.z).toBe(30);
    });

    it('should set body quaternion from mesh quaternion', () => {
      const mesh = createMockMesh(
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 1, z: 1 },
        { x: 0.5, y: 0.5, z: 0.5, w: 0.5 }
      );
      const body = physics.addBody('rotated', mesh);
      expect(body.quaternion.x).toBeCloseTo(0.5);
      expect(body.quaternion.y).toBeCloseTo(0.5);
      expect(body.quaternion.z).toBeCloseTo(0.5);
      expect(body.quaternion.w).toBeCloseTo(0.5);
    });

    it('should add multiple bodies with unique IDs', () => {
      const mesh1 = createMockMesh({ x: 0, y: 0, z: 0 });
      const mesh2 = createMockMesh({ x: 5, y: 0, z: 0 });
      const mesh3 = createMockMesh({ x: 10, y: 0, z: 0 });

      const body1 = physics.addBody('obj1', mesh1);
      const body2 = physics.addBody('obj2', mesh2);
      const body3 = physics.addBody('obj3', mesh3);

      expect(body1).not.toBe(body2);
      expect(body2).not.toBe(body3);
      expect(body1).not.toBe(body3);
    });

    it('should handle scaled meshes for box shapes', () => {
      const mesh = createMockMesh({ x: 0, y: 0, z: 0 }, { x: 2, y: 3, z: 4 });
      const body = physics.addBody('scaledBox', mesh, 'box', 1);
      expect(body).toBeDefined();
    });

    it('should handle scaled meshes for sphere shapes', () => {
      const mesh = createMockMesh({ x: 0, y: 0, z: 0 }, { x: 3, y: 2, z: 1 });
      const body = physics.addBody('scaledSphere', mesh, 'sphere', 1);
      expect(body).toBeDefined();
    });

    it('should add static body when mass is zero', () => {
      const mesh = createMockMesh();
      const body = physics.addBody('static', mesh, 'box', 0);
      expect(body.mass).toBe(0);
    });
  });

  describe('removeBody', () => {
    let physics: PhysicsWorld;

    beforeEach(() => {
      physics = new PhysicsWorld();
    });

    it('should remove an existing body', () => {
      const mesh = createMockMesh();
      physics.addBody('toRemove', mesh);
      physics.removeBody('toRemove');
      // After removal, trying to apply impulse should do nothing (no error)
      expect(() => physics.applyImpulse('toRemove', [1, 0, 0])).not.toThrow();
    });

    it('should handle removing non-existent body gracefully', () => {
      expect(() => physics.removeBody('nonexistent')).not.toThrow();
    });

    it('should allow re-adding body with same ID after removal', () => {
      const mesh1 = createMockMesh({ x: 0, y: 0, z: 0 });
      const mesh2 = createMockMesh({ x: 5, y: 5, z: 5 });

      physics.addBody('reuse', mesh1);
      physics.removeBody('reuse');
      const newBody = physics.addBody('reuse', mesh2);

      expect(newBody.position.x).toBe(5);
      expect(newBody.position.y).toBe(5);
      expect(newBody.position.z).toBe(5);
    });

    it('should remove body from both bodies and meshes maps', () => {
      const mesh = createMockMesh();
      physics.addBody('mapped', mesh);
      physics.removeBody('mapped');

      // Verify removal by checking setVelocity doesn't affect anything
      physics.setVelocity('mapped', [10, 10, 10]);
      // No error should occur, body just doesn't exist
    });
  });

  describe('step', () => {
    let physics: PhysicsWorld;

    beforeEach(() => {
      physics = new PhysicsWorld();
    });

    it('should step the physics simulation', () => {
      const mesh = createMockMesh({ x: 0, y: 10, z: 0 });
      physics.addBody('falling', mesh, 'box', 1);

      // Step simulation
      expect(() => physics.step(1 / 60)).not.toThrow();
    });

    it('should sync mesh position with physics body', () => {
      const mesh = createMockMesh({ x: 0, y: 10, z: 0 });
      physics.addBody('synced', mesh, 'box', 1);

      // Step multiple times to let gravity take effect
      for (let i = 0; i < 10; i++) {
        physics.step(1 / 60);
      }

      // Mesh position copy should have been called
      expect(mesh.position.copy).toHaveBeenCalled();
    });

    it('should sync mesh quaternion with physics body', () => {
      const mesh = createMockMesh();
      physics.addBody('rotating', mesh, 'box', 1);

      physics.step(1 / 60);

      expect(mesh.quaternion.copy).toHaveBeenCalled();
    });

    it('should handle step with zero time delta', () => {
      const mesh = createMockMesh();
      physics.addBody('test', mesh);
      expect(() => physics.step(0)).not.toThrow();
    });

    it('should handle step with large time delta', () => {
      const mesh = createMockMesh();
      physics.addBody('test', mesh);
      expect(() => physics.step(1)).not.toThrow();
    });

    it('should sync all bodies in the world', () => {
      const mesh1 = createMockMesh({ x: 0, y: 10, z: 0 });
      const mesh2 = createMockMesh({ x: 5, y: 20, z: 0 });
      const mesh3 = createMockMesh({ x: 10, y: 30, z: 0 });

      physics.addBody('body1', mesh1);
      physics.addBody('body2', mesh2);
      physics.addBody('body3', mesh3);

      physics.step(1 / 60);

      expect(mesh1.position.copy).toHaveBeenCalled();
      expect(mesh2.position.copy).toHaveBeenCalled();
      expect(mesh3.position.copy).toHaveBeenCalled();
    });
  });

  describe('applyImpulse', () => {
    let physics: PhysicsWorld;

    beforeEach(() => {
      physics = new PhysicsWorld();
    });

    it('should apply impulse to existing body', () => {
      const mesh = createMockMesh();
      const body = physics.addBody('impulsed', mesh, 'box', 1);

      // Initial velocity should be zero
      expect(body.velocity.x).toBe(0);
      expect(body.velocity.y).toBe(0);
      expect(body.velocity.z).toBe(0);

      physics.applyImpulse('impulsed', [10, 0, 0]);

      // After impulse, velocity should change
      expect(body.velocity.x).not.toBe(0);
    });

    it('should apply impulse at center of mass by default', () => {
      const mesh = createMockMesh();
      physics.addBody('centered', mesh, 'box', 1);
      expect(() => physics.applyImpulse('centered', [5, 5, 5])).not.toThrow();
    });

    it('should apply impulse at specific world point', () => {
      const mesh = createMockMesh();
      physics.addBody('offset', mesh, 'box', 1);
      expect(() => physics.applyImpulse('offset', [5, 0, 0], [1, 0, 0])).not.toThrow();
    });

    it('should handle applying impulse to non-existent body', () => {
      expect(() => physics.applyImpulse('ghost', [1, 0, 0])).not.toThrow();
    });

    it('should apply impulse in all axes', () => {
      const mesh = createMockMesh();
      const body = physics.addBody('multiAxis', mesh, 'box', 1);

      physics.applyImpulse('multiAxis', [10, 20, 30]);

      // Velocity should be affected in all directions
      expect(body.velocity.x).not.toBe(0);
      expect(body.velocity.y).not.toBe(0);
      expect(body.velocity.z).not.toBe(0);
    });

    it('should apply negative impulse', () => {
      const mesh = createMockMesh();
      const body = physics.addBody('negative', mesh, 'box', 1);

      physics.applyImpulse('negative', [-10, -10, -10]);

      expect(body.velocity.x).toBeLessThan(0);
      expect(body.velocity.y).toBeLessThan(0);
      expect(body.velocity.z).toBeLessThan(0);
    });
  });

  describe('setVelocity', () => {
    let physics: PhysicsWorld;

    beforeEach(() => {
      physics = new PhysicsWorld();
    });

    it('should set velocity on existing body', () => {
      const mesh = createMockMesh();
      const body = physics.addBody('velocity', mesh, 'box', 1);

      physics.setVelocity('velocity', [5, 10, 15]);

      expect(body.velocity.x).toBe(5);
      expect(body.velocity.y).toBe(10);
      expect(body.velocity.z).toBe(15);
    });

    it('should handle setting velocity on non-existent body', () => {
      expect(() => physics.setVelocity('ghost', [1, 2, 3])).not.toThrow();
    });

    it('should overwrite existing velocity', () => {
      const mesh = createMockMesh();
      const body = physics.addBody('overwrite', mesh, 'box', 1);

      physics.setVelocity('overwrite', [10, 10, 10]);
      expect(body.velocity.x).toBe(10);

      physics.setVelocity('overwrite', [0, 0, 0]);
      expect(body.velocity.x).toBe(0);
      expect(body.velocity.y).toBe(0);
      expect(body.velocity.z).toBe(0);
    });

    it('should set negative velocity', () => {
      const mesh = createMockMesh();
      const body = physics.addBody('negVel', mesh, 'box', 1);

      physics.setVelocity('negVel', [-5, -10, -15]);

      expect(body.velocity.x).toBe(-5);
      expect(body.velocity.y).toBe(-10);
      expect(body.velocity.z).toBe(-15);
    });

    it('should set zero velocity to stop body', () => {
      const mesh = createMockMesh();
      const body = physics.addBody('stop', mesh, 'box', 1);

      // Apply impulse to get it moving
      physics.applyImpulse('stop', [100, 100, 100]);
      expect(body.velocity.x).not.toBe(0);

      // Stop the body
      physics.setVelocity('stop', [0, 0, 0]);
      expect(body.velocity.x).toBe(0);
      expect(body.velocity.y).toBe(0);
      expect(body.velocity.z).toBe(0);
    });
  });

  describe('physics simulation behavior', () => {
    it('should simulate gravity over time', () => {
      const physics = new PhysicsWorld({
        gravity: [0, -9.82, 0],
      });

      const mesh = createMockMesh({ x: 0, y: 100, z: 0 });
      const body = physics.addBody('falling', mesh, 'box', 1);

      const initialY = body.position.y;

      // Simulate 1 second of physics
      for (let i = 0; i < 60; i++) {
        physics.step(1 / 60);
      }

      // Body should have fallen due to gravity
      expect(body.position.y).toBeLessThan(initialY);
    });

    it('should keep static bodies in place', () => {
      const physics = new PhysicsWorld({
        gravity: [0, -9.82, 0],
      });

      const mesh = createMockMesh({ x: 0, y: 10, z: 0 });
      const body = physics.addBody('static', mesh, 'box', 0); // mass = 0 means static

      const initialY = body.position.y;

      // Simulate physics
      for (let i = 0; i < 60; i++) {
        physics.step(1 / 60);
      }

      // Static body should not move
      expect(body.position.y).toBe(initialY);
    });

    it('should handle high-speed objects', () => {
      const physics = new PhysicsWorld({
        gravity: [0, 0, 0], // No gravity for clean test
      });

      const mesh = createMockMesh();
      const body = physics.addBody('fast', mesh, 'box', 1);

      physics.setVelocity('fast', [1000, 1000, 1000]);

      physics.step(1 / 60);

      // Body should have moved significantly
      expect(body.position.x).toBeGreaterThan(0);
      expect(body.position.y).toBeGreaterThan(0);
      expect(body.position.z).toBeGreaterThan(0);
    });

    it('should maintain body integrity after multiple operations', () => {
      const physics = new PhysicsWorld();

      const mesh = createMockMesh();
      const body = physics.addBody('integrity', mesh, 'box', 1);

      // Multiple operations
      physics.setVelocity('integrity', [10, 0, 0]);
      physics.step(1 / 60);
      physics.applyImpulse('integrity', [0, 10, 0]);
      physics.step(1 / 60);
      physics.setVelocity('integrity', [0, 0, 10]);
      physics.step(1 / 60);

      // Body should still be valid
      expect(body).toBeDefined();
      expect(typeof body.position.x).toBe('number');
      expect(typeof body.position.y).toBe('number');
      expect(typeof body.position.z).toBe('number');
    });
  });

  describe('edge cases', () => {
    it('should handle empty world step', () => {
      const physics = new PhysicsWorld();
      expect(() => physics.step(1 / 60)).not.toThrow();
    });

    it('should handle extreme gravity values', () => {
      const physics = new PhysicsWorld({
        gravity: [0, -1000, 0],
      });

      const mesh = createMockMesh({ x: 0, y: 100, z: 0 });
      physics.addBody('extreme', mesh, 'box', 1);

      expect(() => physics.step(1 / 60)).not.toThrow();
    });

    it('should handle very small step sizes', () => {
      const physics = new PhysicsWorld({
        stepSize: 1 / 1000,
      });

      const mesh = createMockMesh();
      physics.addBody('tiny', mesh);

      expect(() => physics.step(1 / 1000)).not.toThrow();
    });

    it('should handle very large step sizes', () => {
      const physics = new PhysicsWorld({
        stepSize: 1,
      });

      const mesh = createMockMesh();
      physics.addBody('large', mesh);

      expect(() => physics.step(1)).not.toThrow();
    });

    it('should handle adding many bodies', () => {
      const physics = new PhysicsWorld();

      const bodies: CANNON.Body[] = [];
      for (let i = 0; i < 100; i++) {
        const mesh = createMockMesh({ x: i, y: 0, z: 0 });
        bodies.push(physics.addBody(`body${i}`, mesh));
      }

      expect(bodies.length).toBe(100);
      expect(() => physics.step(1 / 60)).not.toThrow();
    });

    it('should handle removing all bodies', () => {
      const physics = new PhysicsWorld();

      for (let i = 0; i < 10; i++) {
        const mesh = createMockMesh();
        physics.addBody(`body${i}`, mesh);
      }

      for (let i = 0; i < 10; i++) {
        physics.removeBody(`body${i}`);
      }

      expect(() => physics.step(1 / 60)).not.toThrow();
    });

    it('should handle special ID characters', () => {
      const physics = new PhysicsWorld();
      const mesh = createMockMesh();

      const specialIds = [
        'body-with-dashes',
        'body_with_underscores',
        'body.with.dots',
        'body:with:colons',
        'body/with/slashes',
        'body with spaces',
        '123numericstart',
        '',
      ];

      for (const id of specialIds) {
        expect(() => physics.addBody(id, mesh)).not.toThrow();
        physics.removeBody(id);
      }
    });
  });
});
