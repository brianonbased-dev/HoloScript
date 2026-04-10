import { describe, it, expect } from 'vitest';
import { CameraShake } from '../camera/CameraShake';
import { CameraConstraints } from '../camera/CameraConstraints';
import { CameraPath } from '../camera/CameraPath';

describe('Cycle 165: Camera Extensions', () => {
  // -------------------------------------------------------------------------
  // CameraShake
  // -------------------------------------------------------------------------

  it('should produce shake offset proportional to trauma', () => {
    const shake = new CameraShake();
    shake.addLayer('main', { amplitude: 20, decay: 0 }); // No decay for test

    shake.setTrauma('main', 0);
    const none = shake.update(0.016);
    expect(none.offsetX).toBe(0);

    shake.setTrauma('main', 1.0);
    const full = shake.update(0.016);
    expect(Math.abs(full.offsetX)).toBeGreaterThan(0);
  });

  it('should decay trauma over time', () => {
    const shake = new CameraShake();
    shake.addLayer('hit', { trauma: 1, decay: 2, amplitude: 10 });

    shake.update(0.5); // trauma should decay by 1.0
    expect(shake.getTrauma('hit')).toBeCloseTo(0);
    expect(shake.isShaking()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // CameraConstraints
  // -------------------------------------------------------------------------

  it('should clamp camera within bounds', () => {
    const cam = new CameraConstraints();
    cam.setBounds({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
    cam.setSmoothing(1); // instant

    const pos = cam.follow(150, -20);
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(0);
  });

  it('should apply dead zone', () => {
    const cam = new CameraConstraints();
    cam.setSmoothing(1);
    cam.setDeadZone({ width: 20, height: 20 });
    cam.setPosition(50, 50);

    // Target inside dead zone — camera shouldn't move
    const pos = cam.follow(55, 55);
    expect(pos.x).toBe(50);
    expect(pos.y).toBe(50);
  });

  // -------------------------------------------------------------------------
  // CameraPath
  // -------------------------------------------------------------------------

  it('should interpolate along Catmull-Rom spline', () => {
    const path = new CameraPath();
    path.setPoints([
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 20, y: 10, z: 0 },
      { x: 30, y: 10, z: 0 },
    ]);

    const start = path.evaluate(0);
    expect(start.position.x).toBeCloseTo(0);

    const mid = path.evaluate(0.5);
    expect(mid.position.x).toBeGreaterThan(5);
    expect(mid.position.x).toBeLessThan(25);

    const end = path.evaluate(1);
    expect(end.position.x).toBeCloseTo(30);
  });

  it('should stop at end or loop', () => {
    const path = new CameraPath();
    path.setPoints([
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
    ]);
    path.setSpeed(10);
    path.play();

    // Run long enough to complete
    path.update(1);
    expect(path.isPlaying()).toBe(false);
    expect(path.getProgress()).toBe(1);
  });
});
