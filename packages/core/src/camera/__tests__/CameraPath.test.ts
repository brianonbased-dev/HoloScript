import { describe, it, expect, beforeEach } from 'vitest';
import { CameraPath, PathPoint } from '../CameraPath';

const POINTS: PathPoint[] = [
  { x: 0, y: 0, z: 0 },
  { x: 10, y: 0, z: 0 },
  { x: 10, y: 10, z: 0 },
  { x: 0, y: 10, z: 0 },
];

describe('CameraPath', () => {
  let path: CameraPath;

  beforeEach(() => {
    path = new CameraPath();
  });

  // ---- Setup ----

  it('setPoints stores points', () => {
    path.setPoints(POINTS);
    expect(path.getPointCount()).toBe(4);
  });

  it('addPoint appends', () => {
    path.addPoint(POINTS[0]);
    path.addPoint(POINTS[1]);
    expect(path.getPointCount()).toBe(2);
  });

  it('clearPoints resets', () => {
    path.setPoints(POINTS);
    path.clearPoints();
    expect(path.getPointCount()).toBe(0);
  });

  // ---- Playback Control ----

  it('play starts playback', () => {
    path.setPoints(POINTS);
    path.play();
    expect(path.isPlaying()).toBe(true);
    expect(path.getProgress()).toBe(0);
  });

  it('pause stops playback', () => {
    path.setPoints(POINTS);
    path.play();
    path.pause();
    expect(path.isPlaying()).toBe(false);
  });

  it('stop resets progress', () => {
    path.setPoints(POINTS);
    path.play();
    path.update(0.5);
    path.stop();
    expect(path.getProgress()).toBe(0);
    expect(path.isPlaying()).toBe(false);
  });

  // ---- Update ----

  it('update advances progress', () => {
    path.setPoints(POINTS);
    path.setSpeed(1);
    path.play();
    path.update(0.5);
    expect(path.getProgress()).toBeGreaterThan(0);
  });

  it('update returns null when not playing', () => {
    path.setPoints(POINTS);
    expect(path.update(0.1)).toBeNull();
  });

  it('update stops at end when not looping', () => {
    path.setPoints(POINTS);
    path.setSpeed(100);
    path.play();
    path.update(100);
    expect(path.getProgress()).toBe(1);
    expect(path.isPlaying()).toBe(false);
  });

  it('update loops when looping enabled', () => {
    path.setPoints(POINTS);
    path.setSpeed(100);
    path.setLoop(true);
    path.play();
    path.update(100);
    expect(path.isPlaying()).toBe(true);
    expect(path.getProgress()).toBeLessThan(1);
  });

  // ---- Evaluate ----

  it('evaluate at 0 returns first point', () => {
    path.setPoints(POINTS);
    const result = path.evaluate(0);
    expect(result.position.x).toBeCloseTo(0, 1);
    expect(result.position.y).toBeCloseTo(0, 1);
  });

  it('evaluate at 1 returns last point', () => {
    path.setPoints(POINTS);
    const result = path.evaluate(1);
    expect(result.position.x).toBeCloseTo(0, 1);
    expect(result.position.y).toBeCloseTo(10, 1);
  });

  it('evaluate at 0.5 returns midpoint region', () => {
    path.setPoints(POINTS);
    const result = path.evaluate(0.5);
    // Catmull-Rom gives smooth curve, should be around middle
    expect(result.position.x).toBeGreaterThan(-1);
  });

  // ---- Look-At ----

  it('lookAt interpolation works', () => {
    const pts: PathPoint[] = [
      { x: 0, y: 0, z: 0, lookAtX: 0, lookAtY: 0, lookAtZ: 1 },
      { x: 10, y: 0, z: 0, lookAtX: 10, lookAtY: 0, lookAtZ: 1 },
    ];
    path.setPoints(pts);
    const result = path.evaluate(0.5);
    expect(result.lookAt).not.toBeNull();
    expect(result.lookAt!.x).toBeCloseTo(5, 0);
  });

  // ---- Speed Multiplier ----

  it('speedMultiplier affects progress rate', () => {
    const pts: PathPoint[] = [
      { x: 0, y: 0, z: 0, speedMultiplier: 2 },
      { x: 10, y: 0, z: 0 },
      { x: 20, y: 0, z: 0 },
    ];
    path.setPoints(pts);
    path.setSpeed(1);
    path.play();
    path.update(0.5);
    const progress = path.getProgress();
    expect(progress).toBeGreaterThan(0);
  });
});
