import { describe, it, expect } from 'vitest';
import { CharacterController } from '../CharacterController';

describe('CharacterController', () => {
  it('initializes with default values', () => {
    const cc = new CharacterController();
    expect(cc.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(cc.rotation).toEqual({ x: 0, y: 0, z: 0 });
    expect(cc.isGrounded).toBe(true);
    expect(cc.isCrouching).toBe(false);
    expect(cc.height).toBe(1.8);
  });

  it('initializes with custom options', () => {
    const cc = new CharacterController({
      position: [1, 5, 3],
      rotation: { x: 0, y: 90, z: 0 },
      height: 2.0,
      gravity: -15,
      jumpForce: 8,
    });
    expect(cc.position).toEqual({ x: 1, y: 5, z: 3 });
    expect(cc.rotation).toEqual({ x: 0, y: 90, z: 0 });
    expect(cc.height).toBe(2.0);
    // Above ground level 0, so not grounded
    expect(cc.isGrounded).toBe(false);
  });

  it('moveForward displaces along facing direction', () => {
    const cc = new CharacterController({ rotation: { x: 0, y: 0, z: 0 } });
    cc.moveForward(5);
    // Facing Y=0 => sin(0)=0, cos(0)=1 => moves +Z
    expect(cc.position.x).toBeCloseTo(0, 5);
    expect(cc.position.z).toBeCloseTo(5, 5);
  });

  it('moveRight strafes perpendicular to facing', () => {
    const cc = new CharacterController({ rotation: { x: 0, y: 0, z: 0 } });
    cc.moveRight(3);
    // Facing Y=0 => cos(0)=1, -sin(0)=0 => moves +X
    expect(cc.position.x).toBeCloseTo(3, 5);
    expect(cc.position.z).toBeCloseTo(0, 5);
  });

  it('jump applies upward velocity only when grounded', () => {
    const cc = new CharacterController();
    expect(cc.isGrounded).toBe(true);
    const jumped = cc.jump();
    expect(jumped).toBe(true);
    expect(cc.isGrounded).toBe(false);

    // Second jump should fail
    const jumped2 = cc.jump();
    expect(jumped2).toBe(false);
  });

  it('gravity pulls character down and grounds them', () => {
    const cc = new CharacterController({ jumpForce: 10, gravity: -10 });
    cc.jump();
    // After a large enough update, character should return to ground
    for (let i = 0; i < 100; i++) {
      cc.update(0.05);
    }
    expect(cc.isGrounded).toBe(true);
    expect(cc.position.y).toBe(0);
  });

  it('crouch reduces height by half when grounded', () => {
    const cc = new CharacterController({ height: 2.0 });
    expect(cc.height).toBe(2.0);
    cc.crouch(true);
    expect(cc.isCrouching).toBe(true);
    expect(cc.height).toBe(1.0);
    cc.crouch(false);
    expect(cc.isCrouching).toBe(false);
    expect(cc.height).toBe(2.0);
  });

  it('crouch is ignored when airborne', () => {
    const cc = new CharacterController();
    cc.jump();
    cc.crouch(true);
    expect(cc.isCrouching).toBe(false);
  });

  it('rotate adjusts yaw and clamps pitch', () => {
    const cc = new CharacterController();
    cc.rotate(45, 100);
    expect(cc.rotation.y).toBe(45);
    expect(cc.rotation.x).toBe(90); // clamped to 90
    cc.rotate(0, -200);
    expect(cc.rotation.x).toBe(-90); // clamped to -90
  });

  it('setPosition teleports and updates grounded state', () => {
    const cc = new CharacterController();
    cc.setPosition({ x: 10, y: 20, z: 30 });
    expect(cc.position).toEqual({ x: 10, y: 20, z: 30 });
    expect(cc.isGrounded).toBe(false);
    cc.setPosition({ x: 0, y: 0, z: 0 });
    expect(cc.isGrounded).toBe(true);
  });

  it('update with zero or negative deltaTime is a no-op', () => {
    const cc = new CharacterController();
    cc.jump();
    const posBefore = cc.position;
    cc.update(0);
    expect(cc.position).toEqual(posBefore);
    cc.update(-1);
    expect(cc.position).toEqual(posBefore);
  });
});
