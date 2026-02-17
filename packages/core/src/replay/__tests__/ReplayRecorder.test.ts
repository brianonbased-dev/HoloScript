import { describe, it, expect, beforeEach } from 'vitest';
import { ReplayRecorder } from '../ReplayRecorder';

describe('ReplayRecorder', () => {
  let recorder: ReplayRecorder;

  beforeEach(() => { recorder = new ReplayRecorder(30); });

  // ---------------------------------------------------------------------------
  // Start / Stop
  // ---------------------------------------------------------------------------

  it('starts not recording', () => {
    expect(recorder.isRecording()).toBe(false);
  });

  it('start begins recording', () => {
    recorder.start('test-replay');
    expect(recorder.isRecording()).toBe(true);
  });

  it('stop returns ReplayData and stops recording', () => {
    recorder.start('test');
    const data = recorder.stop();
    expect(data.header).toBeDefined();
    expect(data.frames).toBeDefined();
    expect(recorder.isRecording()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Pause / Resume
  // ---------------------------------------------------------------------------

  it('pause stops recording, resume restarts', () => {
    recorder.start('test');
    expect(recorder.isRecording()).toBe(true);
    recorder.pause();
    expect(recorder.isRecording()).toBe(false);
    recorder.resume();
    expect(recorder.isRecording()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Frame Capture
  // ---------------------------------------------------------------------------

  it('captureFrame adds frame when recording', () => {
    recorder.start('test');
    const captured = recorder.captureFrame(
      0.05, // 50ms → exceeds 33ms interval
      { jump: true },
      { x: 10, y: 20 }
    );
    expect(captured).toBe(true);
    expect(recorder.getFrameCount()).toBe(1);
  });

  it('captureFrame rejects when not recording', () => {
    const result = recorder.captureFrame(0.05, {}, { x: 0 });
    expect(result).toBe(false);
  });

  it('captureFrame rejects when paused', () => {
    recorder.start('test');
    recorder.pause();
    const result = recorder.captureFrame(0.05, {}, { x: 0 });
    expect(result).toBe(false);
  });

  it('captureFrame rate-limits by fps', () => {
    recorder.start('test');
    recorder.captureFrame(0.05, {}, { x: 1 }); // 50ms → captured (>33ms interval)
    const skip = recorder.captureFrame(0.001, {}, { x: 2 }); // 1ms → too soon
    expect(skip).toBe(false);
    expect(recorder.getFrameCount()).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  it('export returns header and frames', () => {
    recorder.start('my-replay');
    recorder.captureFrame(0.05, { a: 1 }, { x: 10 });
    const data = recorder.export();
    expect(data.header.name).toBe('my-replay');
    expect(data.header.frameCount).toBe(1);
    expect(data.header.fps).toBe(30);
    expect(data.header.version).toBe(1);
    expect(data.frames).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // Compression
  // ---------------------------------------------------------------------------

  it('compress creates delta-compressed frames', () => {
    recorder.start('test');
    recorder.captureFrame(0.05, {}, { x: 1, y: 2 }); // Frame 0 (full)
    recorder.captureFrame(0.05, {}, { x: 1, y: 3 }); // Frame 1 (only y changed)
    const compressed = recorder.compress();
    expect(compressed.frames).toHaveLength(2);
    // Second frame should only have 'y' in state delta
    const frame1State = compressed.frames[1].state;
    expect(frame1State.y).toBe(3);
    expect(frame1State.x).toBeUndefined(); // x didn't change
  });

  // ---------------------------------------------------------------------------
  // Metadata
  // ---------------------------------------------------------------------------

  it('setMetadata is included in export', () => {
    recorder.start('test');
    recorder.setMetadata('level', 'tutorial');
    const data = recorder.export();
    expect(data.header.metadata.level).toBe('tutorial');
  });

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  it('getDuration tracks elapsed time', () => {
    recorder.start('test');
    recorder.captureFrame(0.1, {}, {});
    expect(recorder.getDuration()).toBeGreaterThan(0);
  });
});
