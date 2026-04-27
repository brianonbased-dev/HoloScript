import { describe, it, expect, beforeEach } from 'vitest';
import { AudioMixer } from '../AudioMixer.js';

describe('AudioMixer', () => {
  let mixer: AudioMixer;

  beforeEach(() => {
    mixer = new AudioMixer();
  });

  describe('initial state', () => {
    it('has master volume 1', () => {
      expect(mixer.getMasterVolume()).toBe(1);
    });

    it('has default channels', () => {
      const channels = mixer.getChannels();
      const names = channels.map((c) => c.name);
      expect(names).toContain('sfx');
      expect(names).toContain('music');
      expect(names).toContain('ambient');
      expect(names).toContain('ui');
      expect(names).toContain('voice');
    });

    it('music channel starts at volume 0.5', () => {
      expect(mixer.getChannelVolume('music')).toBeCloseTo(0.5);
    });
  });

  describe('setMasterVolume() / getMasterVolume()', () => {
    it('sets and gets master volume', () => {
      mixer.setMasterVolume(0.7);
      expect(mixer.getMasterVolume()).toBeCloseTo(0.7);
    });

    it('clamps to 0', () => {
      mixer.setMasterVolume(-0.5);
      expect(mixer.getMasterVolume()).toBe(0);
    });

    it('clamps to 1', () => {
      mixer.setMasterVolume(2);
      expect(mixer.getMasterVolume()).toBe(1);
    });
  });

  describe('setMasterMuted()', () => {
    it('mutes all output', () => {
      mixer.setMasterMuted(true);
      // effective volume of any channel should be 0
      expect(mixer.getEffectiveVolume('sfx', 1)).toBe(0);
    });

    it('unmutes', () => {
      mixer.setMasterMuted(true);
      mixer.setMasterMuted(false);
      expect(mixer.getEffectiveVolume('sfx', 1)).toBeGreaterThan(0);
    });
  });

  describe('setChannelVolume() / getChannelVolume()', () => {
    it('sets channel volume', () => {
      mixer.setChannelVolume('sfx', 0.3);
      expect(mixer.getChannelVolume('sfx')).toBeCloseTo(0.3);
    });

    it('clamps to [0, 1]', () => {
      mixer.setChannelVolume('sfx', 1.5);
      expect(mixer.getChannelVolume('sfx')).toBe(1);
      mixer.setChannelVolume('sfx', -1);
      expect(mixer.getChannelVolume('sfx')).toBe(0);
    });

    it('returns 0 for unknown channel', () => {
      expect(mixer.getChannelVolume('nonexistent')).toBe(0);
    });
  });

  describe('setChannelMuted() / isChannelMuted()', () => {
    it('mutes a channel', () => {
      mixer.setChannelMuted('sfx', true);
      expect(mixer.isChannelMuted('sfx')).toBe(true);
    });

    it('unmutes a channel', () => {
      mixer.setChannelMuted('sfx', true);
      mixer.setChannelMuted('sfx', false);
      expect(mixer.isChannelMuted('sfx')).toBe(false);
    });

    it('muted channel produces zero effective volume', () => {
      mixer.setChannelMuted('sfx', true);
      expect(mixer.getEffectiveVolume('sfx', 1)).toBe(0);
    });
  });

  describe('getEffectiveVolume()', () => {
    it('returns master * channel * source volume', () => {
      mixer.setMasterVolume(0.8);
      mixer.setChannelVolume('sfx', 0.5);
      const eff = mixer.getEffectiveVolume('sfx', 1.0);
      expect(eff).toBeCloseTo(0.4); // 0.8 * 0.5 * 1.0
    });

    it('returns 0 for unknown channel', () => {
      expect(mixer.getEffectiveVolume('unknown', 1)).toBe(0);
    });
  });

  describe('muteGroup() / unmuteGroup()', () => {
    it('mutes multiple channels', () => {
      mixer.muteGroup(['sfx', 'ambient']);
      expect(mixer.isChannelMuted('sfx')).toBe(true);
      expect(mixer.isChannelMuted('ambient')).toBe(true);
      expect(mixer.isChannelMuted('music')).toBe(false);
    });

    it('unmutes multiple channels', () => {
      mixer.muteGroup(['sfx', 'ambient']);
      mixer.unmuteGroup(['sfx', 'ambient']);
      expect(mixer.isChannelMuted('sfx')).toBe(false);
      expect(mixer.isChannelMuted('ambient')).toBe(false);
    });
  });

  describe('createChannel()', () => {
    it('creates a new channel', () => {
      mixer.createChannel('myChannel');
      const channels = mixer.getChannels();
      const found = channels.find((c) => c.name === 'myChannel');
      expect(found).toBeDefined();
    });

    it('creates channel with specified volume', () => {
      mixer.createChannel('myChannel', 0.6);
      expect(mixer.getChannelVolume('myChannel')).toBeCloseTo(0.6);
    });

    it('defaults channel volume to 1 when not specified', () => {
      mixer.createChannel('newChan');
      expect(mixer.getChannelVolume('newChan')).toBe(1);
    });
  });

  describe('getChannels()', () => {
    it('returns array of Channel objects', () => {
      const channels = mixer.getChannels();
      for (const ch of channels) {
        expect(typeof ch.name).toBe('string');
        expect(typeof ch.volume).toBe('number');
        expect(typeof ch.muted).toBe('boolean');
      }
    });
  });
});
