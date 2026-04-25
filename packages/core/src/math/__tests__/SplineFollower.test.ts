import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SplineFollower } from '../SplineFollower';

// Mock SplinePath
function mockSpline(length = 100) {
  return {
    getLength: () => length,
    evaluate: (t: number) => ([t * length, 0, 0]),
    getTangent: (t: number) => ([1, 0, 0]),
  } as any;
}

describe('SplineFollower', () => {
  let follower: SplineFollower;

  beforeEach(() => {
    follower = new SplineFollower(mockSpline(100));
  });

  it('starts at t=0 and not playing', () => {
    expect(follower.getT()).toBe(0);
    expect(follower.isPlaying()).toBe(false);
  });

  it('play/pause/stop controls', () => {
    follower.play();
    expect(follower.isPlaying()).toBe(true);
    follower.pause();
    expect(follower.isPlaying()).toBe(false);
    follower.setT(0.5);
    follower.stop();
    expect(follower.getT()).toBe(0);
  });

  it('update advances t based on speed and dt', () => {
    follower.setSpeed(50); // 50 units/sec on a 100-unit spline
    follower.play();
    follower.update(1); // 1 second → should advance 0.5
    expect(follower.getT()).toBeCloseTo(0.5, 2);
  });

  it('stops at t=1 without loop', () => {
    follower.setSpeed(200);
    follower.play();
    follower.update(1);
    expect(follower.getT()).toBe(1);
    expect(follower.isPlaying()).toBe(false);
  });

  it('loops when loop is enabled', () => {
    follower.setSpeed(150);
    follower.setLoop(true);
    follower.play();
    follower.update(1); // t would be 1.5, wraps to 0.5
    expect(follower.getT()).toBeCloseTo(0.5, 1);
    expect(follower.isPlaying()).toBe(true);
  });

  it('ping-pong reverses direction', () => {
    follower.setSpeed(150);
    follower.setPingPong(true);
    follower.play();
    follower.update(1); // reaches 1, reverses
    expect(follower.getT()).toBe(1);
    // Update again, should go backwards
    follower.update(0.5);
    expect(follower.getT()).toBeLessThan(1);
  });

  it('setT clamps between 0 and 1', () => {
    follower.setT(5);
    expect(follower.getT()).toBe(1);
    follower.setT(-1);
    expect(follower.getT()).toBe(0);
  });

  it('setSpeed clamps to non-negative', () => {
    follower.setSpeed(-5);
    expect(follower.getSpeed()).toBe(0);
  });

  it('getPosition returns spline evaluation', () => {
    follower.setT(0.5);
    const pos = follower.getPosition();
    expect(pos[0]).toBeCloseTo(50, 0);
  });

  it('markers fire when t passes their position', () => {
    const handler = vi.fn();
    follower.onMarker(handler);
    follower.addMarker(0.5, 'halfway');
    follower.setSpeed(60);
    follower.play();
    follower.update(1); // t ≈ 0.6, passes 0.5
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].label).toBe('halfway');
  });

  it('onComplete fires when reaching end', () => {
    const handler = vi.fn();
    follower.onComplete(handler);
    follower.setSpeed(200);
    follower.play();
    follower.update(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('getDistanceTraveled and getRemainingDistance', () => {
    follower.setT(0.3);
    expect(follower.getDistanceTraveled()).toBeCloseTo(30, 0);
    expect(follower.getRemainingDistance()).toBeCloseTo(70, 0);
  });
});
