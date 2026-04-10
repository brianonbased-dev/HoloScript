/**
 * CameraPath — Production Test Suite
 *
 * Covers: setPoints, addPoint, play/pause/stop, update advancement,
 * Catmull-Rom evaluate, looping, look-at interpolation, speed control.
 */
import { describe, it, expect } from 'vitest';
import { CameraPath } from '../CameraPath';

const POINTS = [
  { x: 0, y: 0, z: 0 },
  { x: 10, y: 0, z: 0 },
  { x: 20, y: 10, z: 0 },
  { x: 30, y: 0, z: 0 },
];

describe('CameraPath — Production', () => {
  // ─── Setup ────────────────────────────────────────────────────────
  it('setPoints and getPointCount', () => {
    const cp = new CameraPath();
    cp.setPoints(POINTS);
    expect(cp.getPointCount()).toBe(4);
  });

  it('addPoint appends', () => {
    const cp = new CameraPath();
    cp.addPoint({ x: 0, y: 0, z: 0 });
    cp.addPoint({ x: 1, y: 1, z: 1 });
    expect(cp.getPointCount()).toBe(2);
  });

  it('clearPoints resets', () => {
    const cp = new CameraPath();
    cp.setPoints(POINTS);
    cp.clearPoints();
    expect(cp.getPointCount()).toBe(0);
  });

  // ─── Playback ─────────────────────────────────────────────────────
  it('play starts playback at progress 0', () => {
    const cp = new CameraPath();
    cp.setPoints(POINTS);
    cp.play();
    expect(cp.isPlaying()).toBe(true);
    expect(cp.getProgress()).toBe(0);
  });

  it('update advances progress', () => {
    const cp = new CameraPath();
    cp.setPoints(POINTS);
    cp.setSpeed(1);
    cp.play();
    cp.update(0.5);
    expect(cp.getProgress()).toBeGreaterThan(0);
  });

  it('stop resets progress and playing', () => {
    const cp = new CameraPath();
    cp.setPoints(POINTS);
    cp.play();
    cp.update(0.5);
    cp.stop();
    expect(cp.isPlaying()).toBe(false);
    expect(cp.getProgress()).toBe(0);
  });

  it('pause and resume', () => {
    const cp = new CameraPath();
    cp.setPoints(POINTS);
    cp.play();
    cp.update(0.1);
    const prog = cp.getProgress();
    cp.pause();
    cp.update(1);
    expect(cp.getProgress()).toBe(prog); // no advancement
    cp.resume();
    cp.update(0.1);
    expect(cp.getProgress()).toBeGreaterThan(prog);
  });

  // ─── Evaluate ─────────────────────────────────────────────────────
  it('evaluate at t=0 returns first point', () => {
    const cp = new CameraPath();
    cp.setPoints(POINTS);
    const r = cp.evaluate(0);
    expect(r.position.x).toBeCloseTo(0, 1);
  });

  it('evaluate at t=1 returns last point', () => {
    const cp = new CameraPath();
    cp.setPoints(POINTS);
    const r = cp.evaluate(1);
    expect(r.position.x).toBeCloseTo(30, 1);
  });

  // ─── Looping ──────────────────────────────────────────────────────
  it('non-looping path stops at end', () => {
    const cp = new CameraPath();
    cp.setPoints(POINTS);
    cp.setSpeed(100); // very fast
    cp.play();
    cp.update(10);
    expect(cp.isPlaying()).toBe(false);
    expect(cp.getProgress()).toBe(1);
  });

  it('looping path wraps around', () => {
    const cp = new CameraPath();
    cp.setPoints(POINTS);
    cp.setSpeed(100);
    cp.setLoop(true);
    cp.play();
    cp.update(10);
    expect(cp.isPlaying()).toBe(true);
    expect(cp.getProgress()).toBeLessThan(1);
  });

  // ─── Look-At ──────────────────────────────────────────────────────
  it('interpolates look-at when points have lookAt', () => {
    const cp = new CameraPath();
    cp.setPoints([
      { x: 0, y: 0, z: 0, lookAtX: 0, lookAtY: 0, lookAtZ: 10 },
      { x: 10, y: 0, z: 0, lookAtX: 10, lookAtY: 0, lookAtZ: 10 },
    ]);
    const r = cp.evaluate(0.5);
    expect(r.lookAt).not.toBeNull();
    expect(r.lookAt!.x).toBeCloseTo(5, 0);
  });
});
