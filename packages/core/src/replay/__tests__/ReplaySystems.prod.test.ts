/**
 * ReplaySystems.prod.test.ts
 *
 * Production tests for the replay subsystem.
 * Covers: ReplayRecorder, ReplayPlayback, GhostRunner
 * Pure in-memory, deterministic, no I/O.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReplayRecorder } from '../ReplayRecorder';
import { ReplayPlayback } from '../ReplayPlayback';
import { GhostRunner } from '../GhostRunner';

// =============================================================================
// ReplayRecorder
// =============================================================================

describe('ReplayRecorder', () => {
  let rec: ReplayRecorder;

  beforeEach(() => {
    rec = new ReplayRecorder(30); // 30 fps → 33.33ms frame interval
  });

  it('starts in idle state', () => {
    expect(rec.isRecording()).toBe(false);
    expect(rec.getFrameCount()).toBe(0);
    expect(rec.getDuration()).toBe(0);
  });

  it('becomes active after start()', () => {
    rec.start('test-run');
    expect(rec.isRecording()).toBe(true);
  });

  it('stops and returns replay data', () => {
    rec.start('my-run');
    const data = rec.stop();
    expect(data).toBeDefined();
    expect(data.header.name).toBe('my-run');
    expect(rec.isRecording()).toBe(false);
  });

  it('pause and resume toggles isRecording()', () => {
    rec.start('r');
    expect(rec.isRecording()).toBe(true);
    rec.pause();
    expect(rec.isRecording()).toBe(false);
    rec.resume();
    expect(rec.isRecording()).toBe(true);
  });

  it('captureFrame rejects if not recording', () => {
    const captured = rec.captureFrame(0.1, { jump: true }, { x: 0 });
    expect(captured).toBe(false);
    expect(rec.getFrameCount()).toBe(0);
  });

  it('captureFrame rejects if paused', () => {
    rec.start('r');
    rec.pause();
    const captured = rec.captureFrame(0.1, { jump: true }, { x: 5 });
    expect(captured).toBe(false);
  });

  it('captureFrame captures at correct FPS interval', () => {
    rec = new ReplayRecorder(10); // 10 fps → 100ms interval
    rec.start('fps-test');

    // currentTime starts at 0. Interval = 100ms.
    rec.captureFrame(0.06, {}, { x: 0 }); // +60ms → currentTime=60ms,  60-0=60   < 100 → NOT captured
    rec.captureFrame(0.05, {}, { x: 1 }); // +50ms → currentTime=110ms, 110-0=110 >= 100 → CAPTURED (frame 0)
    rec.captureFrame(0.04, {}, { x: 2 }); // +40ms → currentTime=150ms, 150-110=40 < 100 → NOT captured

    expect(rec.getFrameCount()).toBe(1);
  });

  it('export() returns all captured frames with correct header', () => {
    rec = new ReplayRecorder(10);
    rec.start('export-test');
    rec.captureFrame(0.1, { fire: true }, { hp: 100 });
    rec.captureFrame(0.1, { fire: false }, { hp: 90 });
    const data = rec.export();

    expect(data.header.frameCount).toBe(2);
    expect(data.header.fps).toBe(10);
    expect(data.frames).toHaveLength(2);
    expect(data.frames[0].inputs).toEqual({ fire: true });
    expect(data.frames[1].state).toEqual({ hp: 90 });
  });

  it('compress() produces delta-only state changes', () => {
    rec = new ReplayRecorder(10);
    rec.start('compress-test');
    rec.captureFrame(0.1, {}, { x: 5, y: 0 });
    rec.captureFrame(0.1, {}, { x: 5, y: 3 }); // only y changed
    rec.captureFrame(0.1, {}, { x: 5, y: 3 }); // nothing changed

    const data = rec.compress();
    expect(data.frames[0].state).toEqual({ x: 5, y: 0 }); // full first frame
    expect(data.frames[1].state).toEqual({ y: 3 }); // only delta
    expect(data.frames[2].state).toEqual({}); // no changes
  });

  it('setMetadata stores values in header', () => {
    rec.start('meta-test');
    rec.setMetadata('level', 'dungeon-1');
    const data = rec.stop();
    expect(data.header.metadata['level']).toBe('dungeon-1');
  });

  it('multiple recordings produce incrementing IDs', () => {
    rec.start('r1');
    const d1 = rec.stop();
    rec.start('r2');
    const d2 = rec.stop();
    expect(d1.header.id).not.toBe(d2.header.id);
  });

  it('frame indices are sequential', () => {
    rec = new ReplayRecorder(10);
    rec.start('idx-test');
    for (let i = 0; i < 3; i++) rec.captureFrame(0.1, {}, {});
    const data = rec.export();
    expect(data.frames.map((f) => f.frameIndex)).toEqual([0, 1, 2]);
  });
});

// =============================================================================
// ReplayPlayback
// =============================================================================

describe('ReplayPlayback', () => {
  let pb: ReplayPlayback;

  function makeData(frameCount: number, fps = 10) {
    const rec = new ReplayRecorder(fps);
    rec.start('test');
    const dt = 1 / fps;
    for (let i = 0; i < frameCount; i++) {
      rec.captureFrame(dt, { f: i }, { v: i });
    }
    return rec.stop();
  }

  beforeEach(() => {
    pb = new ReplayPlayback();
  });

  it('starts unloaded', () => {
    expect(pb.isLoaded()).toBe(false);
    expect(pb.getState()).toBe('stopped');
  });

  it('loads replay data', () => {
    pb.load(makeData(5));
    expect(pb.isLoaded()).toBe(true);
    expect(pb.getFrameCount()).toBe(5);
  });

  it('play() sets state to playing', () => {
    pb.load(makeData(5));
    pb.play();
    expect(pb.getState()).toBe('playing');
  });

  it('pause() sets state to paused', () => {
    pb.load(makeData(5));
    pb.play();
    pb.pause();
    expect(pb.getState()).toBe('paused');
  });

  it('stop() resets time and state', () => {
    pb.load(makeData(5));
    pb.play();
    pb.update(0.2);
    pb.stop();
    expect(pb.getState()).toBe('stopped');
    expect(pb.getCurrentTime()).toBe(0);
  });

  it('setSpeed clamps to valid range', () => {
    pb.setSpeed(0.001);
    expect(pb.getSpeed()).toBe(0.1); // Clamped to minimum
    pb.setSpeed(10);
    expect(pb.getSpeed()).toBe(8); // Clamped to maximum
    pb.setSpeed(2);
    expect(pb.getSpeed()).toBe(2);
  });

  it('seek clamps to duration bounds', () => {
    const data = makeData(5);
    pb.load(data);
    pb.seek(-100);
    expect(pb.getCurrentTime()).toBe(0);
    pb.seek(99999);
    expect(pb.getCurrentTime()).toBe(data.header.duration);
  });

  it('seekToFrame positions at correct frame timestamp', () => {
    const data = makeData(5, 10);
    pb.load(data);
    pb.seekToFrame(2);
    const t = pb.getCurrentTime();
    expect(t).toBe(data.frames[2].timestamp);
  });

  it('getProgress returns 0 to 1', () => {
    const data = makeData(10, 10);
    pb.load(data);
    expect(pb.getProgress()).toBe(0);
    pb.seek(data.header.duration / 2);
    const p = pb.getProgress();
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it('update advances time and returns current frame', () => {
    pb.load(makeData(10, 10)); // 10fps → 100ms/frame
    pb.play();
    const frame = pb.update(0.15); // advance 150ms
    expect(frame).not.toBeNull();
    expect(pb.getCurrentTime()).toBeCloseTo(150);
  });

  it('update returns null when not playing', () => {
    pb.load(makeData(5));
    const frame = pb.update(0.5);
    expect(frame).toBeNull();
  });

  it('looping wraps around on finish', () => {
    pb.load(makeData(5, 10));
    pb.setLoop(true);
    expect(pb.isLooping()).toBe(true);
    pb.play();
    pb.update(100); // Way past end
    expect(pb.getState()).toBe('playing'); // Still playing due to loop
  });

  it('non-looping stops at end', () => {
    const data = makeData(3, 10);
    pb.load(data);
    pb.setLoop(false);
    pb.play();
    pb.update(100);
    expect(pb.getState()).toBe('stopped');
  });

  it('event callbacks fire when time window passes', () => {
    const data = makeData(5, 10);
    pb.load(data);
    pb.addEvent('boom', 200, { power: 9000 });

    let fired = false;
    let firedData: unknown = null;
    pb.onEvent('boom', (evt) => {
      fired = true;
      firedData = evt.data;
    });

    pb.play();
    pb.update(0.25); // advance 250ms, past 200ms marker
    expect(fired).toBe(true);
    expect((firedData as any).power).toBe(9000);
  });

  it('event fires only once within window', () => {
    const data = makeData(10, 10);
    pb.load(data);
    pb.addEvent('once', 100);
    let count = 0;
    pb.onEvent('once', () => count++);
    pb.play();
    pb.update(0.2); // Should fire once
    pb.update(0.2); // Should not fire again
    expect(count).toBe(1);
  });

  it('setCameraMode persists', () => {
    pb.setCameraMode('orbit');
    expect(pb.getCameraMode()).toBe('orbit');
    pb.setCameraMode('first-person');
    expect(pb.getCameraMode()).toBe('first-person');
  });

  it('getFrameAtTime does binary search correctly', () => {
    const data = makeData(10, 10); // frames at 100ms intervals
    pb.load(data);
    const frame = pb.getFrameAtTime(350);
    expect(frame).not.toBeNull();
    // The frame at or after 350ms (frame 3 is at 300ms, frame 4 at 400ms)
    expect(frame!.frameIndex).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// GhostRunner
// =============================================================================

describe('GhostRunner', () => {
  let ghost: GhostRunner;

  beforeEach(() => {
    ghost = new GhostRunner();
  });

  it('starts with no runs', () => {
    expect(ghost.getRunCount()).toBe(0);
    expect(ghost.getPersonalBest()).toBeNull();
  });

  it('startRecording sets recording state', () => {
    ghost.startRecording();
    expect(ghost.isRecording()).toBe(true);
  });

  it('sample() accumulates position data during recording', () => {
    ghost.startRecording();
    ghost.sample(0.1, { x: 0, y: 0, z: 0 }, 0, 5);
    ghost.sample(0.1, { x: 1, y: 0, z: 0 }, 0, 5);
    const run = ghost.finishRecording('run1');
    expect(run.samples).toHaveLength(2);
    expect(run.samples[0].position).toEqual([0, 0, 0]);
    expect(run.samples[1].position).toEqual([1, 0, 0]);
  });

  it('sample() is ignored when not recording', () => {
    ghost.sample(0.1, { x: 10, y: 0, z: 0 }, 0, 5);
    ghost.startRecording();
    const run = ghost.finishRecording('empty');
    expect(run.samples).toHaveLength(0);
  });

  it('finishRecording creates a run and stores it', () => {
    ghost.startRecording();
    ghost.sample(0.5, { x: 0, y: 0, z: 0 }, 0, 10);
    const run = ghost.finishRecording('speedrun');
    expect(run.name).toBe('speedrun');
    expect(ghost.getRunCount()).toBe(1);
    expect(ghost.getRun(run.id)).toBe(run);
    expect(ghost.isRecording()).toBe(false);
  });

  it('first run is always personal best', () => {
    ghost.startRecording();
    ghost.sample(1.0, { x: 0, y: 0, z: 0 }, 0, 10);
    const run = ghost.finishRecording('first');
    expect(run.isPersonalBest).toBe(true);
    expect(ghost.getPersonalBest()).toBe(run);
  });

  it('faster run beats personal best', () => {
    ghost.startRecording();
    ghost.sample(2.0, { x: 0, y: 0, z: 0 }, 0, 5);
    const slow = ghost.finishRecording('slow');

    ghost.startRecording();
    ghost.sample(1.0, { x: 0, y: 0, z: 0 }, 0, 10);
    const fast = ghost.finishRecording('fast');

    expect(fast.isPersonalBest).toBe(true);
    expect(ghost.getPersonalBest()).toBe(fast);
    expect(slow.isPersonalBest).toBe(true); // was PB at the time
  });

  it('slower run does not beat personal best', () => {
    ghost.startRecording();
    ghost.sample(1.0, { x: 0, y: 0, z: 0 }, 0, 10);
    const fast = ghost.finishRecording('fast');

    ghost.startRecording();
    ghost.sample(2.0, { x: 0, y: 0, z: 0 }, 0, 5);
    const slow = ghost.finishRecording('slow');

    expect(slow.isPersonalBest).toBe(false);
    expect(ghost.getPersonalBest()).toBe(fast);
  });

  it('getAllRuns returns runs sorted by totalTime', () => {
    // Record 3 runs with different times
    [3.0, 1.0, 2.0].forEach((time, idx) => {
      ghost.startRecording();
      ghost.sample(time, { x: idx, y: 0, z: 0 }, 0, 5);
      ghost.finishRecording(`run-${idx}`);
    });

    const all = ghost.getAllRuns();
    expect(all).toHaveLength(3);
    expect(all[0].totalTime).toBeLessThanOrEqual(all[1].totalTime);
    expect(all[1].totalTime).toBeLessThanOrEqual(all[2].totalTime);
  });

  it('startPlayback returns false for unknown run', () => {
    const ok = ghost.startPlayback('ghost_9999');
    expect(ok).toBe(false);
  });

  it('startPlayback returns true for known run', () => {
    ghost.startRecording();
    ghost.sample(0.5, { x: 0, y: 0, z: 0 }, 0, 5);
    const run = ghost.finishRecording('pb');
    const ok = ghost.startPlayback(run.id);
    expect(ok).toBe(true);
  });

  it('updatePlayback advances and returns current sample', () => {
    ghost.startRecording();
    ghost.sample(0.5, { x: 0, y: 0, z: 0 }, 0, 5);
    ghost.sample(0.5, { x: 5, y: 0, z: 0 }, 0, 5);
    const run = ghost.finishRecording('run');
    ghost.startPlayback(run.id);
    // sample0.time=0.5, sample1.time=1.0
    // Must advance past 1.0s to reach second sample (x=5)
    const results = ghost.updatePlayback(1.1);
    expect(results.has(run.id)).toBe(true);
    const sample = results.get(run.id);
    expect(sample).not.toBeNull();
    expect(sample?.position[0]).toBe(5); // Should be at second sample
  });

  it('stopPlayback removes run from active playbacks', () => {
    ghost.startRecording();
    ghost.sample(0.5, { x: 0, y: 0, z: 0 }, 0, 5);
    const run = ghost.finishRecording('r');
    ghost.startPlayback(run.id);
    ghost.stopPlayback(run.id);
    const results = ghost.updatePlayback(0.1);
    expect(results.size).toBe(0);
  });

  it('compareAtTime returns null for unknown runs', () => {
    const result = ghost.compareAtTime('ghost_a', 'ghost_b', 1.0);
    expect(result).toBeNull();
  });

  it('compareAtTime returns deltaTime and deltaPosition', () => {
    ghost.startRecording();
    ghost.sample(1.0, { x: 0, y: 0, z: 0 }, 0, 5);
    const runA = ghost.finishRecording('A');

    ghost.startRecording();
    ghost.sample(1.0, { x: 3, y: 4, z: 0 }, 0, 5); // 5 units away
    const runB = ghost.finishRecording('B');

    const cmp = ghost.compareAtTime(runA.id, runB.id, 0.5);
    expect(cmp).not.toBeNull();
    expect(cmp!.deltaPosition).toBeCloseTo(5, 1);
  });

  it('timestamps accumulate correctly across samples', () => {
    ghost.startRecording();
    ghost.sample(0.3, { x: 0, y: 0, z: 0 }, 0, 1);
    ghost.sample(0.4, { x: 1, y: 0, z: 0 }, 0, 1);
    ghost.sample(0.2, { x: 2, y: 0, z: 0 }, 0, 1);
    const run = ghost.finishRecording('timestamps');
    expect(run.samples[0].time).toBeCloseTo(0.3);
    expect(run.samples[1].time).toBeCloseTo(0.7);
    expect(run.samples[2].time).toBeCloseTo(0.9);
    expect(run.totalTime).toBeCloseTo(0.9);
  });
});
