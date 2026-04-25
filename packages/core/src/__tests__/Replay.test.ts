import { describe, it, expect } from 'vitest';
import { ReplayRecorder } from '../replay/ReplayRecorder';
import { ReplayPlayback } from '../replay/ReplayPlayback';
import { GhostRunner } from '../replay/GhostRunner';

describe('Cycle 140: Replay System', () => {
  // -------------------------------------------------------------------------
  // ReplayRecorder
  // -------------------------------------------------------------------------

  it('should record frames at configured FPS', () => {
    const rec = new ReplayRecorder(10); // 10 FPS = 100ms intervals
    rec.start('test');

    // Capture at 50ms intervals — only every other should capture
    for (let i = 0; i < 10; i++) {
      rec.captureFrame(0.05, { moveX: 1 }, { posX: i });
    }

    // 500ms total, at 10fps (100ms interval) → ~5 frames
    expect(rec.getFrameCount()).toBeGreaterThanOrEqual(4);
    expect(rec.getFrameCount()).toBeLessThanOrEqual(6);
  });

  it('should delta-compress state data', () => {
    const rec = new ReplayRecorder(60);
    rec.start('compress_test');

    // Frame 1: full state
    rec.captureFrame(0.02, {}, [10, 20, 0]);
    // Frame 2: only x changed
    rec.captureFrame(0.02, {}, [15, 20, 0]);
    // Frame 3: nothing changed
    rec.captureFrame(0.02, {}, [15, 20, 0]);

    const compressed = rec.compress();
    expect(compressed.frames.length).toBe(3);

    // Frame 2 should only have 'x' delta
    const f2state = compressed.frames[1].state;
    expect(f2state[0]).toBe(15);
    expect(f2state[1]).toBeUndefined(); // Not changed

    // Frame 3 should be empty (no changes)
    expect(Object.keys(compressed.frames[2].state).length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // ReplayPlayback
  // -------------------------------------------------------------------------

  it('should play back with speed control and seeking', () => {
    const rec = new ReplayRecorder(30);
    rec.start('playback_test');
    for (let i = 0; i < 30; i++) {
      rec.captureFrame(1 / 30, { input: i % 2 === 0 }, { pos: i });
    }
    const data = rec.stop();

    const player = new ReplayPlayback();
    player.load(data);
    player.play();
    expect(player.getState()).toBe('playing');

    // Advance 0.5 seconds
    const frame = player.update(0.5);
    expect(frame).not.toBeNull();
    expect(player.getProgress()).toBeGreaterThan(0);

    // Seek to 50%
    player.seek(data.header.duration / 2);
    expect(player.getProgress()).toBeCloseTo(0.5, 1);

    // 2x speed
    player.setSpeed(2);
    expect(player.getSpeed()).toBe(2);
  });

  it('should fire events at correct timestamps', () => {
    const rec = new ReplayRecorder(30);
    rec.start('event_test');
    for (let i = 0; i < 60; i++) rec.captureFrame(1 / 30, {}, { t: i });
    const data = rec.stop();

    const player = new ReplayPlayback();
    player.load(data);

    let eventFired = false;
    player.addEvent('explosion', 500, { power: 10 });
    player.onEvent('explosion', () => {
      eventFired = true;
    });

    player.play();
    player.update(0.3); // 300ms — not yet
    expect(eventFired).toBe(false);

    player.update(0.3); // 600ms — should fire
    expect(eventFired).toBe(true);
  });

  // -------------------------------------------------------------------------
  // GhostRunner
  // -------------------------------------------------------------------------

  it('should record and track personal best', () => {
    const ghost = new GhostRunner();

    ghost.startRecording();
    for (let i = 0; i < 100; i++) {
      ghost.sample(0.1, [i, 0, 0], 0, 5);
    }
    const run1 = ghost.finishRecording('run1');
    expect(run1.isPersonalBest).toBe(true);
    expect(run1.totalTime).toBeCloseTo(10, 0);

    // Faster run = new PB
    ghost.startRecording();
    for (let i = 0; i < 50; i++) {
      ghost.sample(0.1, [i * 2, 0, 0], 0, 10);
    }
    const run2 = ghost.finishRecording('run2');
    expect(run2.isPersonalBest).toBe(true);
    expect(ghost.getPersonalBest()!.id).toBe(run2.id);

    // Slower run = not PB
    ghost.startRecording();
    for (let i = 0; i < 200; i++) {
      ghost.sample(0.1, [i * 0.5, 0, 0], 0, 2.5);
    }
    const run3 = ghost.finishRecording('run3');
    expect(run3.isPersonalBest).toBe(false);
  });

  it('should play back ghost and advance samples', () => {
    const ghost = new GhostRunner();

    ghost.startRecording();
    for (let i = 0; i < 50; i++) {
      ghost.sample(0.1, [i, 0, 0], 0, 5);
    }
    const run = ghost.finishRecording('ghost_run');

    ghost.startPlayback(run.id);
    const result = ghost.updatePlayback(1.0); // 1 second in
    expect(result.has(run.id)).toBe(true);

    const sample = result.get(run.id);
    expect(sample).not.toBeNull();
    expect(sample!.position[0]).toBeGreaterThan(0);
  });

  it('should compare two runs at a given time', () => {
    const ghost = new GhostRunner();

    ghost.startRecording();
    for (let i = 0; i < 20; i++) ghost.sample(0.1, [i, 0, 0], 0, 5);
    const runA = ghost.finishRecording('A');

    ghost.startRecording();
    for (let i = 0; i < 20; i++) ghost.sample(0.1, [i * 2, 0, 0], 0, 10);
    const runB = ghost.finishRecording('B');

    const comp = ghost.compareAtTime(runA.id, runB.id, 1.0);
    expect(comp).not.toBeNull();
    expect(comp!.deltaPosition).toBeGreaterThan(0);
  });
});
