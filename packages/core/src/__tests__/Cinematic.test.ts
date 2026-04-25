import { describe, it, expect } from 'vitest';
import { SequenceTrack } from '../cinematic/SequenceTrack';
import { CameraRig } from '../cinematic/CameraRig';
import { CinematicDirector } from '../cinematic/CinematicDirector';

describe('Cycle 144: Cinematic Sequencer', () => {
  // -------------------------------------------------------------------------
  // SequenceTrack
  // -------------------------------------------------------------------------

  it('should evaluate keyframes along a timeline', () => {
    const seq = new SequenceTrack();
    seq.addTrack('pos_y', 'Position Y', 'float');
    seq.addClip('pos_y', 0, 2, [
      { time: 0, value: 0, easing: 'linear' },
      { time: 1, value: 10, easing: 'linear' },
    ]);

    seq.play();
    const out = seq.update(1); // 1 second = midpoint of 2s clip
    expect(out.get('pos_y')).toBeCloseTo(5, 0);
  });

  it('should handle clip blending and muting', () => {
    const seq = new SequenceTrack();
    const track = seq.addTrack('alpha', 'Alpha', 'float');
    seq.addClip(
      'alpha',
      0,
      2,
      [
        { time: 0, value: 1, easing: 'linear' },
        { time: 1, value: 1, easing: 'linear' },
      ],
      0.5,
      0.5
    ); // blendIn=0.5s, blendOut=0.5s

    seq.play();
    const early = seq.update(0.25); // In blend-in zone (0.25/0.5=0.5)
    expect(early.get('alpha')!).toBeLessThan(1);

    // Mute track
    seq.muteTrack('alpha', true);
    seq.seek(0);
    const muted = seq.update(1);
    expect(muted.has('alpha')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // CameraRig
  // -------------------------------------------------------------------------

  it('should move along a dolly path', () => {
    const rig = new CameraRig({ mode: 'dolly', speed: 10 });
    rig.setDollyPath([
      [0, 0, 0],
      [10, 0, 0],
    ]);

    rig.update(0.5);
    const state = rig.getState();
    expect(state.position[0]).toBeGreaterThan(0);
  });

  it('should apply camera shake with decay', () => {
    const rig = new CameraRig({ mode: 'static' });
    rig.shake('heavy');

    const s1 = rig.update(0.01);
    const offset1 = Math.abs(s1.shakeOffset[0]) + Math.abs(s1.shakeOffset[1]);
    expect(offset1).toBeGreaterThan(0);

    // After duration, shake should be zero
    rig.update(2);
    const s2 = rig.getState();
    expect(s2.shakeOffset[0]).toBe(0);
  });

  // -------------------------------------------------------------------------
  // CinematicDirector
  // -------------------------------------------------------------------------

  it('should fire cues at correct times', () => {
    const dir = new CinematicDirector();
    dir.createScene('intro', 'Intro', 5);

    const firedCues: string[] = [];
    dir.addCue('intro', { id: 'c1', time: 1, type: 'dialogue', data: { text: 'Hello' } });
    dir.addCue('intro', { id: 'c2', time: 3, type: 'sound', data: { clip: 'boom' } });

    dir.onCue('dialogue', (cue) => firedCues.push(cue.id));
    dir.onCue('sound', (cue) => firedCues.push(cue.id));

    dir.playScene('intro');
    dir.update(2); // Should fire c1
    expect(firedCues).toContain('c1');
    expect(firedCues).not.toContain('c2');

    dir.update(2); // Should fire c2
    expect(firedCues).toContain('c2');
  });

  it('should manage actor marks and scene lifecycle', () => {
    const dir = new CinematicDirector();
    dir.createScene('battle', 'Battle', 10);
    dir.addActorMark('battle', {
      actorId: 'hero',
      position: [0, 0, 0],
      rotation: [0, 90, 0 ],
      animation: 'idle',
    });

    const scene = dir.getScene('battle')!;
    expect(scene.actors.length).toBe(1);
    expect(scene.actors[0].animation).toBe('idle');

    dir.playScene('battle');
    expect(dir.isPlaying()).toBe(true);

    dir.update(11); // Past duration
    expect(dir.isPlaying()).toBe(false);
  });
});
