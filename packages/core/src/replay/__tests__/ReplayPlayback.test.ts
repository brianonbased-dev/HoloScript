import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReplayPlayback } from '../ReplayPlayback';
import type { ReplayData } from '../ReplayRecorder';

function makeReplayData(frameCount = 5): ReplayData {
  const frames = Array.from({ length: frameCount }, (_, i) => ({
    frameIndex: i,
    timestamp: i * 100, // 100ms per frame
    inputs: { jump: i === 2 },
    state: { x: i * 10, y: 0 },
  }));
  return {
    header: {
      id: 'replay_test',
      name: 'test-replay',
      startTime: Date.now(),
      duration: (frameCount - 1) * 100,
      frameCount,
      fps: 10,
      version: 1,
      metadata: {},
    },
    frames,
  };
}

describe('ReplayPlayback', () => {
  let playback: ReplayPlayback;

  beforeEach(() => {
    playback = new ReplayPlayback();
  });

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  it('starts unloaded', () => {
    expect(playback.isLoaded()).toBe(false);
  });

  it('load sets data', () => {
    playback.load(makeReplayData());
    expect(playback.isLoaded()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Play / Pause / Stop
  // ---------------------------------------------------------------------------

  it('play sets state to playing', () => {
    playback.load(makeReplayData());
    playback.play();
    expect(playback.getState()).toBe('playing');
  });

  it('pause sets state to paused', () => {
    playback.load(makeReplayData());
    playback.play();
    playback.pause();
    expect(playback.getState()).toBe('paused');
  });

  it('stop resets to beginning', () => {
    playback.load(makeReplayData());
    playback.play();
    playback.update(0.05);
    playback.stop();
    expect(playback.getState()).toBe('stopped');
    expect(playback.getCurrentTime()).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Speed
  // ---------------------------------------------------------------------------

  it('setSpeed clamps to 0.1-8', () => {
    playback.setSpeed(0.01);
    expect(playback.getSpeed()).toBeGreaterThanOrEqual(0.1);
    playback.setSpeed(100);
    expect(playback.getSpeed()).toBeLessThanOrEqual(8);
  });

  it('speed affects playback rate', () => {
    playback.load(makeReplayData());
    playback.play();
    playback.setSpeed(2);
    playback.update(0.05); // 50ms * 2 speed * 1000 = 100ms of replay time
    expect(playback.getCurrentTime()).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Seeking
  // ---------------------------------------------------------------------------

  it('seek jumps to time', () => {
    playback.load(makeReplayData());
    playback.seek(200);
    expect(playback.getCurrentTime()).toBe(200);
  });

  it('seek clamps to duration', () => {
    playback.load(makeReplayData());
    playback.seek(99999);
    expect(playback.getCurrentTime()).toBeLessThanOrEqual(400);
  });

  it('seekToFrame jumps to frame timestamp', () => {
    playback.load(makeReplayData());
    playback.seekToFrame(3);
    expect(playback.getCurrentTime()).toBe(300);
  });

  it('getProgress returns 0-1 range', () => {
    playback.load(makeReplayData());
    expect(playback.getProgress()).toBe(0);
    playback.seek(200);
    expect(playback.getProgress()).toBeCloseTo(0.5, 1);
  });

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  it('update returns frame during playback', () => {
    playback.load(makeReplayData());
    playback.play();
    const frame = playback.update(0.05);
    expect(frame).not.toBeNull();
    expect(frame).toHaveProperty('frameIndex');
    expect(frame).toHaveProperty('state');
  });

  it('update returns null when stopped', () => {
    playback.load(makeReplayData());
    expect(playback.update(0.05)).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------

  it('looping restarts after end', () => {
    playback.load(makeReplayData());
    playback.setLoop(true);
    playback.play();
    playback.update(1); // 1000ms > 400ms duration → should loop
    expect(playback.getState()).toBe('playing');
  });

  it('non-looping stops at end', () => {
    playback.load(makeReplayData());
    playback.play();
    playback.update(1); // Past duration
    expect(playback.getState()).toBe('stopped');
  });

  // ---------------------------------------------------------------------------
  // Camera Mode
  // ---------------------------------------------------------------------------

  it('setCameraMode and getCameraMode', () => {
    playback.setCameraMode('orbit');
    expect(playback.getCameraMode()).toBe('orbit');
  });

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  it('addEvent + onEvent fires callback during update', () => {
    playback.load(makeReplayData());
    playback.addEvent('explosion', 50, { damage: 100 });
    const events: any[] = [];
    playback.onEvent('explosion', (e) => events.push(e));
    playback.play();
    playback.update(0.1); // Advances past 50ms (100ms into replay)
    expect(events.length).toBe(1);
    expect(events[0].data.damage).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  it('getDuration returns header duration', () => {
    playback.load(makeReplayData());
    expect(playback.getDuration()).toBe(400);
  });

  it('getFrameCount returns header frame count', () => {
    playback.load(makeReplayData());
    expect(playback.getFrameCount()).toBe(5);
  });
});
