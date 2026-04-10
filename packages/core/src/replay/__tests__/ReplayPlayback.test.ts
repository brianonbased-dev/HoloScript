import { describe, it, expect, vi } from 'vitest';
import { ReplayPlayback } from '../ReplayPlayback';
import type { ReplayData, ReplayFrame } from '../ReplayRecorder';

function makeReplayData(frameCount = 5, duration = 1000): ReplayData {
  const frames: ReplayFrame[] = [];
  for (let i = 0; i < frameCount; i++) {
    frames.push({
      frameIndex: i,
      timestamp: (i / (frameCount - 1)) * duration,
      inputs: { move: i },
      state: { x: i * 10 },
    });
  }
  return {
    header: {
      id: 'test',
      name: 'test',
      startTime: 0,
      duration,
      frameCount,
      fps: 30,
      version: 1,
      metadata: {},
    },
    frames,
  };
}

describe('ReplayPlayback', () => {
  it('starts unloaded', () => {
    const pb = new ReplayPlayback();
    expect(pb.isLoaded()).toBe(false);
    expect(pb.getState()).toBe('stopped');
  });

  it('load sets data', () => {
    const pb = new ReplayPlayback();
    pb.load(makeReplayData());
    expect(pb.isLoaded()).toBe(true);
    expect(pb.getFrameCount()).toBe(5);
    expect(pb.getDuration()).toBe(1000);
  });

  it('play/pause/stop control state', () => {
    const pb = new ReplayPlayback();
    pb.load(makeReplayData());
    pb.play();
    expect(pb.getState()).toBe('playing');
    pb.pause();
    expect(pb.getState()).toBe('paused');
    pb.stop();
    expect(pb.getState()).toBe('stopped');
    expect(pb.getCurrentTime()).toBe(0);
  });

  it('play does nothing without data', () => {
    const pb = new ReplayPlayback();
    pb.play();
    expect(pb.getState()).toBe('stopped');
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

  it('seek jumps to time', () => {
    const pb = new ReplayPlayback();
    pb.load(makeReplayData(5, 1000));
    pb.seek(500);
    expect(pb.getCurrentTime()).toBe(500);
    expect(pb.getProgress()).toBeCloseTo(0.5);
  });

  it('seek clamps to duration', () => {
    const pb = new ReplayPlayback();
    pb.load(makeReplayData(5, 1000));
    pb.seek(9999);
    expect(pb.getCurrentTime()).toBe(1000);
    pb.seek(-100);
    expect(pb.getCurrentTime()).toBe(0);
  });

  it('seekToFrame jumps to frame timestamp', () => {
    const pb = new ReplayPlayback();
    pb.load(makeReplayData(5, 1000));
    pb.seekToFrame(2); // timestamp = 500
    expect(pb.getCurrentTime()).toBe(500);
  });

  it('update advances time and returns frame', () => {
    const pb = new ReplayPlayback();
    pb.load(makeReplayData(5, 1000));
    pb.play();
    const frame = pb.update(0.1); // 100ms at 1x speed
    expect(frame).not.toBeNull();
    expect(pb.getCurrentTime()).toBeCloseTo(100);
  });

  it('update returns null when not playing', () => {
    const pb = new ReplayPlayback();
    pb.load(makeReplayData());
    expect(pb.update(0.1)).toBeNull();
  });

  it('stops at end without looping', () => {
    const pb = new ReplayPlayback();
    pb.load(makeReplayData(5, 1000));
    pb.play();
    pb.update(2); // 2000ms > 1000ms duration
    expect(pb.getState()).toBe('stopped');
    expect(pb.getCurrentTime()).toBe(1000);
  });

  it('loops when looping enabled', () => {
    const pb = new ReplayPlayback();
    pb.load(makeReplayData(5, 1000));
    pb.setLoop(true);
    pb.play();
    pb.update(1.5); // 1500ms → wraps to 500
    expect(pb.getState()).toBe('playing');
    expect(pb.getCurrentTime()).toBeCloseTo(500);
  });

  it('camera mode can be set', () => {
    const pb = new ReplayPlayback();
    expect(pb.getCameraMode()).toBe('follow');
    pb.setCameraMode('orbit');
    expect(pb.getCameraMode()).toBe('orbit');
  });

  it('events fire during update window', () => {
    const pb = new ReplayPlayback();
    pb.load(makeReplayData(5, 1000));
    pb.addEvent('kill', 50, { target: 'enemy' });
    const cb = vi.fn();
    pb.onEvent('kill', cb);
    pb.play();
    pb.update(0.1); // 0→100ms, passes 50ms mark
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0].name).toBe('kill');
  });

  it('getFrameAtTime binary searches frames', () => {
    const pb = new ReplayPlayback();
    pb.load(makeReplayData(5, 1000));
    const frame = pb.getFrameAtTime(250);
    expect(frame).not.toBeNull();
    expect(frame!.frameIndex).toBe(1); // frame at timestamp=250
  });
});
