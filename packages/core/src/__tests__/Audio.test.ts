import { describe, it, expect } from 'vitest';
import { AudioEngine } from '../audio/AudioEngine';
import { SoundPool } from '../audio/SoundPool';
import { AudioMixer } from '../audio/AudioMixer';

describe('Audio System', () => {
  describe('AudioEngine', () => {
    it('Plays and tracks audio sources', () => {
      const engine = new AudioEngine();
      const id = engine.play('click', { id: 'src1', volume: 0.8 });

      expect(engine.getActiveCount()).toBe(1);
      expect(engine.getSource(id)?.isPlaying).toBe(true);
    });

    it('Stops audio sources', () => {
      const engine = new AudioEngine();
      const id = engine.play('click', { id: 'src2' });
      engine.stop(id);

      expect(engine.getActiveCount()).toBe(0);
    });

    it('Attenuates volume based on distance (inverse model)', () => {
      const engine = new AudioEngine();
      engine.setListenerPosition([0, 0, 0]);

      const id = engine.play('sound', {
        id: 'dist_test',
        position: [10, 0, 0],
        volume: 1,
        refDistance: 1,
        maxDistance: 50,
        rolloffFactor: 1,
        distanceModel: 'inverse',
        spatialize: true,
      });

      engine.update(0.016);
      const source = engine.getSource(id);
      expect(source!.computedVolume).toBeLessThan(1);
      expect(source!.computedVolume).toBeGreaterThan(0);
    });

    it('Nearby sound is louder than distant sound', () => {
      const engine = new AudioEngine();
      engine.setListenerPosition([0, 0, 0]);

      const nearId = engine.play('s', {
        id: 'near',
        position: [1, 0, 0],
        volume: 1,
        spatialize: true,
        distanceModel: 'inverse',
        refDistance: 1,
        maxDistance: 50,
        rolloffFactor: 1,
      });
      const farId = engine.play('s', {
        id: 'far',
        position: [20, 0, 0],
        volume: 1,
        spatialize: true,
        distanceModel: 'inverse',
        refDistance: 1,
        maxDistance: 50,
        rolloffFactor: 1,
      });

      engine.update(0.016);
      expect(engine.getSource(nearId)!.computedVolume).toBeGreaterThan(
        engine.getSource(farId)!.computedVolume
      );
    });

    it('Computes stereo panning', () => {
      const engine = new AudioEngine();
      engine.setListenerPosition([0, 0, 0]);
      engine.setListenerOrientation([0, 0, -1], [0, 1, 0]);

      const rightId = engine.play('s', {
        id: 'right',
        position: [5, 0, 0],
        spatialize: true,
      });
      const leftId = engine.play('s', {
        id: 'left',
        position: [-5, 0, 0],
        spatialize: true,
      });

      engine.update(0.016);
      expect(engine.getSource(rightId)!.computedPan).toBeGreaterThan(0); // Right
      expect(engine.getSource(leftId)!.computedPan).toBeLessThan(0); // Left
    });

    it('Respects master volume and mute', () => {
      const engine = new AudioEngine();
      engine.setMasterVolume(0.5);
      const id = engine.play('s', { id: 'vol', volume: 1, spatialize: false });
      engine.update(0.016);
      expect(engine.getSource(id)!.computedVolume).toBeCloseTo(0.5, 1);

      engine.setMuted(true);
      engine.update(0.016);
      expect(engine.getSource(id)!.computedVolume).toBe(0);
    });

    it('Stops all sources', () => {
      const engine = new AudioEngine();
      engine.play('a', {});
      engine.play('b', {});
      engine.play('c', {});
      expect(engine.getActiveCount()).toBe(3);

      engine.stopAll();
      expect(engine.getActiveCount()).toBe(0);
    });
  });

  describe('SoundPool', () => {
    it('Registers and retrieves sounds', () => {
      const pool = new SoundPool();
      pool.register({
        id: 'click1',
        name: 'Click',
        duration: 0.1,
        category: 'ui',
        volume: 0.8,
        loop: false,
      });

      expect(pool.has('click1')).toBe(true);
      expect(pool.get('click1')?.name).toBe('Click');
      expect(pool.count).toBe(1);
    });

    it('Filters by category', () => {
      const pool = new SoundPool();
      pool.registerAll([
        { id: 's1', name: 'A', duration: 1, category: 'sfx', volume: 1, loop: false },
        { id: 's2', name: 'B', duration: 1, category: 'sfx', volume: 1, loop: false },
        { id: 's3', name: 'C', duration: 1, category: 'music', volume: 1, loop: true },
      ]);

      expect(pool.getByCategory('sfx')).toHaveLength(2);
      expect(pool.getByCategory('music')).toHaveLength(1);
    });
  });

  describe('AudioMixer', () => {
    it('Creates default channels', () => {
      const mixer = new AudioMixer();
      const channels = mixer.getChannels();
      expect(channels.length).toBeGreaterThanOrEqual(5);
    });

    it('Computes effective volume through channel', () => {
      const mixer = new AudioMixer();
      mixer.setMasterVolume(1.0);
      mixer.setChannelVolume('sfx', 0.5);

      const effective = mixer.getEffectiveVolume('sfx', 0.8);
      expect(effective).toBeCloseTo(0.4, 2);
    });

    it('Muting channel zeroes volume', () => {
      const mixer = new AudioMixer();
      mixer.setChannelMuted('sfx', true);
      expect(mixer.getEffectiveVolume('sfx', 1.0)).toBe(0);
    });

    it('Master mute zeroes all channels', () => {
      const mixer = new AudioMixer();
      mixer.setMasterMuted(true);
      expect(mixer.getEffectiveVolume('sfx', 1.0)).toBe(0);
      expect(mixer.getEffectiveVolume('music', 1.0)).toBe(0);
    });

    it('Group mute/unmute', () => {
      const mixer = new AudioMixer();
      mixer.muteGroup(['sfx', 'ambient']);
      expect(mixer.isChannelMuted('sfx')).toBe(true);
      expect(mixer.isChannelMuted('ambient')).toBe(true);
      expect(mixer.isChannelMuted('music')).toBe(false);

      mixer.unmuteGroup(['sfx', 'ambient']);
      expect(mixer.isChannelMuted('sfx')).toBe(false);
    });
  });
});
