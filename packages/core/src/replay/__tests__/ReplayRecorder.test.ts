import { describe, it, expect } from 'vitest';
import { ReplayRecorder } from '../ReplayRecorder';

describe('ReplayRecorder', () => {
  it('starts not recording', () => {
    const rec = new ReplayRecorder();
    expect(rec.isRecording()).toBe(false);
    expect(rec.getFrameCount()).toBe(0);
  });

  it('start enables recording', () => {
    const rec = new ReplayRecorder();
    rec.start('test');
    expect(rec.isRecording()).toBe(true);
  });

  it('captureFrame records at fps interval', () => {
    const rec = new ReplayRecorder(30); // ~33ms per frame
    rec.start('test');
    // dt in seconds, interval = 1000/30 ≈ 33ms
    expect(rec.captureFrame(0.035, { jump: true }, { x: 1 })).toBe(true);
    expect(rec.getFrameCount()).toBe(1);
  });

  it('captureFrame skips frames below interval', () => {
    const rec = new ReplayRecorder(30);
    rec.start('test');
    rec.captureFrame(0.035, {}, { x: 0 }); // captured
    expect(rec.captureFrame(0.005, {}, { x: 1 })).toBe(false); // too soon
  });

  it('captureFrame returns false when not recording', () => {
    const rec = new ReplayRecorder();
    expect(rec.captureFrame(0.1, {}, {})).toBe(false);
  });

  it('pause stops capture, resume restarts', () => {
    const rec = new ReplayRecorder(30);
    rec.start('test');
    rec.pause();
    expect(rec.isRecording()).toBe(false);
    expect(rec.captureFrame(0.1, {}, {})).toBe(false);
    rec.resume();
    expect(rec.isRecording()).toBe(true);
  });

  it('stop returns ReplayData', () => {
    const rec = new ReplayRecorder(30);
    rec.start('myReplay');
    rec.captureFrame(0.05, { left: 1 }, { x: 10 });
    const data = rec.stop();
    expect(data.header.name).toBe('myReplay');
    expect(data.header.frameCount).toBe(1);
    expect(data.header.fps).toBe(30);
    expect(data.header.version).toBe(1);
    expect(data.frames.length).toBe(1);
    expect(data.frames[0].inputs.left).toBe(1);
  });

  it('export returns data without stopping', () => {
    const rec = new ReplayRecorder();
    rec.start('test');
    rec.captureFrame(0.05, {}, { y: 5 });
    const data = rec.export();
    expect(data.frames.length).toBe(1);
    expect(rec.isRecording()).toBe(true); // still recording
  });

  it('compress produces delta frames', () => {
    const rec = new ReplayRecorder(60);
    rec.start('delta');
    rec.captureFrame(0.02, {}, { x: 10, y: 20 });
    rec.captureFrame(0.02, {}, { x: 10, y: 20 }); // same state
    rec.captureFrame(0.02, {}, { x: 15, y: 20 }); // x changed
    const compressed = rec.compress();
    // Frame 0: full state. Frame 1: empty delta. Frame 2: only x.
    expect(Object.keys(compressed.frames[1].state).length).toBe(0);
    expect(compressed.frames[2].state).toEqual({ x: 15 });
  });

  it('getDuration tracks elapsed time', () => {
    const rec = new ReplayRecorder();
    rec.start('dur');
    rec.captureFrame(0.05, {}, {}); // 50ms
    rec.captureFrame(0.05, {}, {}); // 100ms
    expect(rec.getDuration()).toBeCloseTo(100, -1);
  });

  it('setMetadata stores custom metadata', () => {
    const rec = new ReplayRecorder();
    rec.setMetadata('level', 'forest');
    rec.start('meta');
    rec.captureFrame(0.05, {}, {});
    const data = rec.stop();
    expect(data.header.metadata.level).toBe('forest');
  });

  it('frames have sequential indices', () => {
    const rec = new ReplayRecorder(60);
    rec.start('seq');
    for (let i = 0; i < 5; i++) rec.captureFrame(0.02, {}, { v: i });
    const data = rec.export();
    data.frames.forEach((f, i) => expect(f.frameIndex).toBe(i));
  });
});
