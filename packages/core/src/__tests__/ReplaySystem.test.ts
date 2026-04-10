import { describe, it, expect, vi } from 'vitest';
import { ReplayRecorder } from '../replay/ReplayRecorder';
import { ReplayPlayback } from '../replay/ReplayPlayback';

// =============================================================================
// C205 — Replay Recording & Playback
// =============================================================================

describe('ReplayRecorder', () => {
  it('start initialises recording state', () => {
    const rec = new ReplayRecorder(60);
    rec.start('test-run');
    expect(rec.isRecording()).toBe(true);
    expect(rec.getFrameCount()).toBe(0);
  });

  it('captureFrame stores frames at the configured rate', () => {
    const rec = new ReplayRecorder(60); // 16.67ms interval
    rec.start();
    // dt in seconds: 0.02s = 20ms > 16.67ms → should capture
    expect(rec.captureFrame(0.02, { jump: true }, { x: 1 })).toBe(true);
    expect(rec.getFrameCount()).toBe(1);
  });

  it('captureFrame skips if interval not elapsed', () => {
    const rec = new ReplayRecorder(60);
    rec.start();
    rec.captureFrame(0.02, {}, { x: 0 }); // captured
    // only 5ms later — below 16.67ms
    expect(rec.captureFrame(0.005, {}, { x: 1 })).toBe(false);
    expect(rec.getFrameCount()).toBe(1);
  });

  it('captureFrame returns false when paused', () => {
    const rec = new ReplayRecorder(30);
    rec.start();
    rec.pause();
    expect(rec.captureFrame(0.1, {}, { x: 0 })).toBe(false);
    expect(rec.isRecording()).toBe(false);
  });

  it('resume continues recording', () => {
    const rec = new ReplayRecorder(30);
    rec.start();
    rec.pause();
    rec.resume();
    expect(rec.isRecording()).toBe(true);
  });

  it('stop returns ReplayData with header and frames', () => {
    const rec = new ReplayRecorder(30);
    rec.start('my-replay');
    rec.captureFrame(0.05, { a: 1 }, { x: 10 });
    const data = rec.stop();
    expect(data.header.name).toBe('my-replay');
    expect(data.header.frameCount).toBe(1);
    expect(data.header.fps).toBe(30);
    expect(data.frames).toHaveLength(1);
  });

  it('getDuration tracks elapsed time', () => {
    const rec = new ReplayRecorder(30);
    rec.start();
    rec.captureFrame(0.1, {}, {});
    rec.captureFrame(0.1, {}, {});
    expect(rec.getDuration()).toBeCloseTo(200, 0); // 0.2s = 200ms
  });

  it('compress produces delta-only frames', () => {
    const rec = new ReplayRecorder(30);
    rec.start();
    rec.captureFrame(0.05, {}, { x: 10, y: 20 }); // frame 0: full
    rec.captureFrame(0.05, {}, { x: 10, y: 25 }); // frame 1: only y changed
    const data = rec.compress();
    // First frame has both keys
    expect(data.frames[0].state).toEqual({ x: 10, y: 20 });
    // Second frame should only have y (delta)
    expect(data.frames[1].state).toEqual({ y: 25 });
  });

  it('export returns all frames uncompressed', () => {
    const rec = new ReplayRecorder(30);
    rec.start();
    rec.captureFrame(0.05, {}, { x: 10, y: 20 });
    rec.captureFrame(0.05, {}, { x: 10, y: 25 });
    const data = rec.export();
    expect(data.frames[1].state).toEqual({ x: 10, y: 25 });
  });

  it('setMetadata stores custom data in header', () => {
    const rec = new ReplayRecorder(30);
    rec.start();
    rec.setMetadata('level', 'forest');
    const data = rec.stop();
    expect(data.header.metadata.level).toBe('forest');
  });
});

// =============================================================================
// ReplayPlayback
// =============================================================================

describe('ReplayPlayback', () => {
  function makeData() {
    const rec = new ReplayRecorder(30);
    rec.start('test');
    for (let i = 0; i < 5; i++) {
      rec.captureFrame(0.05, { move: i }, { x: i * 10 });
    }
    return rec.stop();
  }

  it('load sets data and resets state', () => {
    const pb = new ReplayPlayback();
    expect(pb.isLoaded()).toBe(false);
    pb.load(makeData());
    expect(pb.isLoaded()).toBe(true);
    expect(pb.getState()).toBe('stopped');
  });

  it('play/pause/stop transitions', () => {
    const pb = new ReplayPlayback();
    pb.load(makeData());
    pb.play();
    expect(pb.getState()).toBe('playing');
    pb.pause();
    expect(pb.getState()).toBe('paused');
    pb.stop();
    expect(pb.getState()).toBe('stopped');
    expect(pb.getCurrentTime()).toBe(0);
  });

  it('setSpeed clamps between 0.1 and 8', () => {
    const pb = new ReplayPlayback();
    pb.setSpeed(0.01);
    expect(pb.getSpeed()).toBe(0.1);
    pb.setSpeed(100);
    expect(pb.getSpeed()).toBe(8);
    pb.setSpeed(2);
    expect(pb.getSpeed()).toBe(2);
  });

  it('seek clamps to duration', () => {
    const pb = new ReplayPlayback();
    const data = makeData();
    pb.load(data);
    pb.seek(999999);
    expect(pb.getCurrentTime()).toBe(data.header.duration);
    pb.seek(-10);
    expect(pb.getCurrentTime()).toBe(0);
  });

  it('seekToFrame jumps to frame timestamp', () => {
    const pb = new ReplayPlayback();
    const data = makeData();
    pb.load(data);
    pb.seekToFrame(2);
    expect(pb.getCurrentTime()).toBe(data.frames[2].timestamp);
  });

  it('getProgress returns 0-1 ratio', () => {
    const pb = new ReplayPlayback();
    const data = makeData();
    pb.load(data);
    pb.seek(data.header.duration / 2);
    expect(pb.getProgress()).toBeCloseTo(0.5, 1);
  });

  it('setLoop / isLooping', () => {
    const pb = new ReplayPlayback();
    expect(pb.isLooping()).toBe(false);
    pb.setLoop(true);
    expect(pb.isLooping()).toBe(true);
  });

  it('camera mode defaults to follow', () => {
    const pb = new ReplayPlayback();
    expect(pb.getCameraMode()).toBe('follow');
    pb.setCameraMode('orbit');
    expect(pb.getCameraMode()).toBe('orbit');
  });

  it('update advances time and returns frame', () => {
    const pb = new ReplayPlayback();
    pb.load(makeData());
    pb.play();
    const frame = pb.update(0.03); // 30ms
    expect(frame).not.toBeNull();
  });

  it('update fires event callbacks', () => {
    const pb = new ReplayPlayback();
    const data = makeData();
    pb.load(data);
    // Add event at 100ms
    pb.addEvent('checkpoint', 100, { cp: 1 });
    const cb = vi.fn();
    pb.onEvent('checkpoint', cb);
    pb.play();
    pb.update(0.15); // 150ms → passes 100ms
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].name).toBe('checkpoint');
  });

  it('update stops at end when not looping', () => {
    const pb = new ReplayPlayback();
    const data = makeData();
    pb.load(data);
    pb.play();
    pb.update(10); // well past end
    expect(pb.getState()).toBe('stopped');
  });

  it('update loops when looping enabled', () => {
    const pb = new ReplayPlayback();
    const data = makeData();
    pb.load(data);
    pb.setLoop(true);
    pb.play();
    pb.update(10); // well past end
    expect(pb.getState()).toBe('playing');
    expect(pb.getCurrentTime()).toBeLessThan(data.header.duration);
  });
});
