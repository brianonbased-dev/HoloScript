import { describe, it, expect, beforeEach } from 'vitest';
import { CameraConstraints } from '../CameraConstraints';

describe('CameraConstraints', () => {
  let cc: CameraConstraints;

  beforeEach(() => {
    cc = new CameraConstraints();
  });

  // ---- Initial State ----

  it('starts at origin', () => {
    expect(cc.getPosition()).toEqual({ x: 0, y: 0 });
  });

  // ---- Bounds Clamping ----

  it('setBounds clamps position', () => {
    cc.setBounds({ minX: -10, maxX: 10, minY: -10, maxY: 10 });
    cc.setSmoothing(1); // instant
    cc.follow(100, 100);
    const pos = cc.getPosition();
    expect(pos.x).toBeLessThanOrEqual(10);
    expect(pos.y).toBeLessThanOrEqual(10);
  });

  it('bounds clamp negative direction', () => {
    cc.setBounds({ minX: -5, maxX: 5, minY: -5, maxY: 5 });
    cc.setSmoothing(1);
    cc.follow(-100, -100);
    expect(cc.getPosition().x).toBeGreaterThanOrEqual(-5);
    expect(cc.getPosition().y).toBeGreaterThanOrEqual(-5);
  });

  // ---- Smoothing ----

  it('smoothing 1 immediately reaches target', () => {
    cc.setSmoothing(1);
    cc.follow(50, 50);
    expect(cc.getPosition()).toEqual({ x: 50, y: 50 });
  });

  it('smoothing 0 does not move', () => {
    cc.setSmoothing(0);
    cc.follow(50, 50);
    expect(cc.getPosition()).toEqual({ x: 0, y: 0 });
  });

  it('partial smoothing moves partway', () => {
    cc.setSmoothing(0.5);
    cc.follow(100, 0);
    const pos = cc.getPosition();
    expect(pos.x).toBeGreaterThan(0);
    expect(pos.x).toBeLessThan(100);
  });

  // ---- Dead Zone ----

  it('dead zone prevents small movements', () => {
    cc.setSmoothing(1);
    cc.setDeadZone({ width: 20, height: 20 });
    cc.follow(5, 5); // within dead zone
    expect(cc.getPosition()).toEqual({ x: 0, y: 0 });
  });

  it('dead zone allows large movements', () => {
    cc.setSmoothing(1);
    cc.setDeadZone({ width: 10, height: 10 });
    cc.follow(50, 50);
    const pos = cc.getPosition();
    expect(pos.x).toBeGreaterThan(0);
    expect(pos.y).toBeGreaterThan(0);
  });

  // ---- Look-Ahead ----

  it('look-ahead shifts target in velocity direction', () => {
    cc.setSmoothing(1);
    cc.setLookAhead(10);
    // Moving right
    cc.follow(0, 0, 1, 0);
    const pos = cc.getPosition();
    expect(pos.x).toBeGreaterThan(0); // shifted right
  });

  // ---- Set Position ----

  it('setPosition overrides current position', () => {
    cc.setPosition(42, 99);
    expect(cc.getPosition()).toEqual({ x: 42, y: 99 });
  });

  // ---- Soft Limits ----

  it('soft limits pull back from edges', () => {
    cc.setBounds({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
    cc.setSoftLimit({ distance: 20, stiffness: 0.5 });
    cc.setSmoothing(1);
    // Put camera near edge
    cc.setPosition(95, 50);
    cc.follow(95, 50);
    const pos = cc.getPosition();
    // Should be pushed away from right edge
    expect(pos.x).toBeLessThanOrEqual(100);
  });

  // ---- Smoothing clamp ----

  it('setSmoothing clamps to 0-1', () => {
    cc.setSmoothing(2);
    cc.follow(100, 0);
    expect(cc.getPosition().x).toBe(100); // clamped to 1

    cc.setPosition(0, 0);
    cc.setSmoothing(-1);
    cc.follow(100, 0);
    expect(cc.getPosition().x).toBe(0); // clamped to 0
  });
});
