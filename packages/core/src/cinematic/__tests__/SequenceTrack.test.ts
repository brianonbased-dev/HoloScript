import { describe, it, expect, beforeEach } from 'vitest';
import { SequenceTrack } from '../SequenceTrack';
import type { TrackKeyframe } from '../SequenceTrack';

const linearKFs: TrackKeyframe[] = [
  { time: 0, value: 0, easing: 'linear' },
  { time: 1, value: 100, easing: 'linear' },
];

describe('SequenceTrack', () => {
  let seq: SequenceTrack;

  beforeEach(() => {
    seq = new SequenceTrack();
  });

  it('addTrack and getTrack', () => {
    seq.addTrack('t1', 'Position', 'float');
    expect(seq.getTrack('t1')).toBeDefined();
    expect(seq.getTrack('t1')!.name).toBe('Position');
  });

  it('removeTrack deletes track', () => {
    seq.addTrack('t1', 'X', 'float');
    seq.removeTrack('t1');
    expect(seq.getTrack('t1')).toBeUndefined();
  });

  it('getTracks returns all tracks', () => {
    seq.addTrack('a', 'A', 'float');
    seq.addTrack('b', 'B', 'position');
    expect(seq.getTracks().length).toBe(2);
  });

  it('addClip to track', () => {
    seq.addTrack('t1', 'X', 'float');
    const clip = seq.addClip('t1', 0, 2, linearKFs);
    expect(clip).not.toBeNull();
    expect(seq.getTrack('t1')!.clips.length).toBe(1);
  });

  it('addClip returns null for unknown track', () => {
    expect(seq.addClip('unknown', 0, 1, linearKFs)).toBeNull();
  });

  it('updateDuration tracks longest clip', () => {
    seq.addTrack('t1', 'X', 'float');
    seq.addClip('t1', 0, 2, linearKFs);
    seq.addClip('t1', 3, 5, linearKFs);
    expect(seq.getDuration()).toBe(8);
  });

  it('play/pause/stop controls', () => {
    expect(seq.isPlaying()).toBe(false);
    seq.play();
    expect(seq.isPlaying()).toBe(true);
    seq.pause();
    expect(seq.isPlaying()).toBe(false);
    seq.stop();
    expect(seq.getCurrentTime()).toBe(0);
  });

  it('update advances time and evaluates clips', () => {
    seq.addTrack('t1', 'X', 'float');
    seq.addClip('t1', 0, 2, linearKFs);
    seq.play();
    const output = seq.update(1); // 1 second into a 2-second clip
    expect(output.has('t1')).toBe(true);
    expect(output.get('t1')!).toBeCloseTo(50, 0); // halfway → value ≈ 50
  });

  it('muted track produces no output', () => {
    seq.addTrack('t1', 'X', 'float');
    seq.addClip('t1', 0, 2, linearKFs);
    seq.muteTrack('t1', true);
    seq.play();
    const output = seq.update(1);
    expect(output.has('t1')).toBe(false);
  });

  it('loop resets time after duration', () => {
    seq.addTrack('t1', 'X', 'float');
    seq.addClip('t1', 0, 1, linearKFs);
    seq.setLoop(true);
    seq.play();
    seq.update(1.5); // past duration of 1
    expect(seq.isPlaying()).toBe(true);
    expect(seq.getCurrentTime()).toBeLessThan(1);
  });

  it('seek clamps to duration', () => {
    seq.addTrack('t1', 'X', 'float');
    seq.addClip('t1', 0, 2, linearKFs);
    seq.seek(10);
    expect(seq.getCurrentTime()).toBe(2);
    seq.seek(-1);
    expect(seq.getCurrentTime()).toBe(0);
  });

  it('blendIn/blendOut attenuates output', () => {
    seq.addTrack('t1', 'X', 'float');
    seq.addClip(
      't1',
      0,
      4,
      [
        { time: 0, value: 100, easing: 'linear' },
        { time: 1, value: 100, easing: 'linear' },
      ],
      1,
      1
    ); // 1s blend in, 1s blend out
    seq.play();
    const earlyOut = seq.update(0.5); // 0.5s into 1s blendIn → blend=0.5
    expect(earlyOut.get('t1')!).toBeLessThan(100);
  });

  it('speed multiplier affects playback rate', () => {
    seq.addTrack('t1', 'X', 'float');
    seq.addClip('t1', 0, 2, linearKFs);
    seq.setSpeed(2);
    seq.play();
    seq.update(1); // at 2x speed, advances 2s
    expect(seq.getCurrentTime()).toBeCloseTo(2, 0);
  });

  it('removeClip removes from track', () => {
    seq.addTrack('t1', 'X', 'float');
    const clip = seq.addClip('t1', 0, 1, linearKFs)!;
    seq.removeClip('t1', clip.id);
    expect(seq.getTrack('t1')!.clips.length).toBe(0);
  });
});
