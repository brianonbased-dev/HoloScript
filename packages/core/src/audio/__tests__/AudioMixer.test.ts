import { describe, it, expect, beforeEach } from 'vitest';
import { AudioMixer } from '../AudioMixer';

describe('AudioMixer', () => {
  let mixer: AudioMixer;

  beforeEach(() => {
    mixer = new AudioMixer();
  });

  // ---------- Default channels ----------
  it('creates default channels on construction', () => {
    const channels = mixer.getChannels();
    expect(channels.length).toBeGreaterThanOrEqual(6);
    const names = channels.map((c) => c.name);
    expect(names).toContain('master');
    expect(names).toContain('sfx');
    expect(names).toContain('music');
    expect(names).toContain('voice');
  });

  // ---------- Channel Volume ----------
  it('gets default sfx volume as 1.0', () => {
    expect(mixer.getChannelVolume('sfx')).toBe(1.0);
  });

  it('sets channel volume with clamping', () => {
    mixer.setChannelVolume('sfx', 0.5);
    expect(mixer.getChannelVolume('sfx')).toBe(0.5);
    mixer.setChannelVolume('sfx', 2); // clamp to 1
    expect(mixer.getChannelVolume('sfx')).toBe(1);
  });

  // ---------- Mute ----------
  it('mutes and unmutes a channel', () => {
    mixer.setChannelMuted('music', true);
    expect(mixer.isChannelMuted('music')).toBe(true);
    mixer.setChannelMuted('music', false);
    expect(mixer.isChannelMuted('music')).toBe(false);
  });

  // ---------- Effective Volume ----------
  it('computes effective volume = source * channel * master', () => {
    mixer.setChannelVolume('sfx', 0.5);
    mixer.setMasterVolume(0.8);
    expect(mixer.getEffectiveVolume('sfx', 1.0)).toBeCloseTo(0.4);
  });

  it('effective volume is 0 when channel muted', () => {
    mixer.setChannelMuted('sfx', true);
    expect(mixer.getEffectiveVolume('sfx', 1.0)).toBe(0);
  });

  it('effective volume is 0 when master muted', () => {
    mixer.setMasterMuted(true);
    expect(mixer.getEffectiveVolume('sfx', 1.0)).toBe(0);
  });

  it('effective volume returns 0 for unknown channel', () => {
    expect(mixer.getEffectiveVolume('nonexistent', 1.0)).toBe(0);
  });

  // ---------- Master ----------
  it('sets and gets master volume', () => {
    mixer.setMasterVolume(0.3);
    expect(mixer.getMasterVolume()).toBeCloseTo(0.3);
  });

  it('master mute toggle', () => {
    mixer.setMasterMuted(true);
    expect(mixer.isMasterMuted()).toBe(true);
    mixer.setMasterMuted(false);
    expect(mixer.isMasterMuted()).toBe(false);
  });

  // ---------- Groups ----------
  it('muteGroup mutes multiple channels', () => {
    mixer.muteGroup(['sfx', 'music']);
    expect(mixer.isChannelMuted('sfx')).toBe(true);
    expect(mixer.isChannelMuted('music')).toBe(true);
    expect(mixer.isChannelMuted('voice')).toBe(false);
  });

  it('unmuteGroup unmutes multiple channels', () => {
    mixer.muteGroup(['sfx', 'music']);
    mixer.unmuteGroup(['sfx', 'music']);
    expect(mixer.isChannelMuted('sfx')).toBe(false);
    expect(mixer.isChannelMuted('music')).toBe(false);
  });

  // ---------- Custom Channel ----------
  it('creates a custom channel', () => {
    mixer.createChannel('custom', 0.7);
    expect(mixer.getChannelVolume('custom')).toBe(0.7);
  });

  // ==========================================================================
  // ADVANCED DYNAMIC MIXING FEATURES
  // ==========================================================================

  describe('Ducking System', () => {
    it('configures ducking for music when voice plays', () => {
      mixer.configureDucking({
        enabled: true,
        triggerChannel: 'voice',
        targetChannels: ['music', 'ambient'],
        threshold: -20, // dB
        ratio: 0.7, // Duck to 30% of original volume
        attackTime: 0.1, // 100ms attack
        releaseTime: 0.5, // 500ms release
      });

      // Register a voice source above threshold
      mixer.registerSource({
        id: 'voice1',
        channel: 'voice',
        volume: 0.8,
        priority: 10,
        startTime: Date.now(),
      });

      // Update ducking (simulate 200ms elapsed for full attack)
      mixer.updateDucking(0.2);

      // Music should be ducked
      const musicAttenuation = mixer.getDuckingAttenuation('music');
      expect(musicAttenuation).toBeGreaterThan(0);
      expect(musicAttenuation).toBeLessThanOrEqual(0.7);
    });

    it('releases ducking when trigger channel stops', () => {
      mixer.configureDucking({
        enabled: true,
        triggerChannel: 'voice',
        targetChannels: ['music'],
        threshold: -20,
        ratio: 0.7,
        attackTime: 0.1,
        releaseTime: 0.5,
      });

      // Register and then unregister voice source
      const sourceId = 'voice1';
      mixer.registerSource({
        id: sourceId,
        channel: 'voice',
        volume: 0.8,
        priority: 10,
        startTime: Date.now(),
      });

      mixer.updateDucking(0.2); // Attack
      mixer.unregisterSource(sourceId); // Stop voice
      mixer.updateDucking(1.0); // Full release

      // Music should no longer be ducked
      const musicAttenuation = mixer.getDuckingAttenuation('music');
      expect(musicAttenuation).toBeLessThan(0.1);
    });

    it('applies ducking to effective volume calculation', () => {
      mixer.configureDucking({
        enabled: true,
        triggerChannel: 'voice',
        targetChannels: ['music'],
        threshold: -20,
        ratio: 0.5,
        attackTime: 0.1,
        releaseTime: 0.5,
      });

      mixer.registerSource({
        id: 'voice1',
        channel: 'voice',
        volume: 0.8,
        priority: 10,
        startTime: Date.now(),
      });

      mixer.updateDucking(0.2); // Full attack

      // Get effective volume for music (should be ducked)
      const normalVolume = 1.0 * mixer.getChannelVolume('music') * mixer.getMasterVolume();
      const duckedVolume = mixer.getEffectiveVolume('music', 1.0);

      expect(duckedVolume).toBeLessThan(normalVolume);
    });

    it('removes ducking configuration', () => {
      mixer.configureDucking({
        enabled: true,
        triggerChannel: 'voice',
        targetChannels: ['music'],
        threshold: -20,
        ratio: 0.7,
        attackTime: 0.1,
        releaseTime: 0.5,
      });

      mixer.removeDucking('voice', ['music']);

      // Register voice source
      mixer.registerSource({
        id: 'voice1',
        channel: 'voice',
        volume: 0.8,
        priority: 10,
        startTime: Date.now(),
      });

      mixer.updateDucking(0.2);

      // Music should NOT be ducked
      const musicAttenuation = mixer.getDuckingAttenuation('music');
      expect(musicAttenuation).toBe(0);
    });
  });

  describe('Voice Stealing', () => {
    it('respects max voices limit on channel', () => {
      // SFX channel has max 32 voices
      const maxVoices = mixer.getChannels().find((c) => c.name === 'sfx')?.maxVoices ?? 0;
      expect(maxVoices).toBeGreaterThan(0);

      // Register sources up to limit
      const sources: string[] = [];
      for (let i = 0; i < maxVoices; i++) {
        const sourceId = `sfx${i}`;
        const registered = mixer.registerSource({
          id: sourceId,
          channel: 'sfx',
          volume: 0.5,
          priority: 5,
          startTime: Date.now() + i,
        });
        expect(registered).toBe(true);
        sources.push(sourceId);
      }

      // Verify voice count
      expect(mixer.getChannelVoiceCount('sfx')).toBe(maxVoices);

      // Try to register one more (should trigger voice stealing)
      const extraId = 'sfx_extra';
      const registered = mixer.registerSource({
        id: extraId,
        channel: 'sfx',
        volume: 0.5,
        priority: 5,
        startTime: Date.now() + maxVoices,
      });

      // Should succeed (via stealing)
      expect(registered).toBe(true);
      expect(mixer.getChannelVoiceCount('sfx')).toBe(maxVoices);
    });

    it('steals oldest voice when strategy is "oldest"', () => {
      mixer.setVoiceStealingStrategy({ mode: 'oldest' });

      // Create channel with max 3 voices
      mixer.createChannel('test', 1.0, 5, 3);

      // Register 3 sources
      const startTime = Date.now();
      mixer.registerSource({
        id: 's1',
        channel: 'test',
        volume: 0.5,
        priority: 5,
        startTime: startTime,
      });
      mixer.registerSource({
        id: 's2',
        channel: 'test',
        volume: 0.5,
        priority: 5,
        startTime: startTime + 100,
      });
      mixer.registerSource({
        id: 's3',
        channel: 'test',
        volume: 0.5,
        priority: 5,
        startTime: startTime + 200,
      });

      // Register 4th source (should steal s1, the oldest)
      mixer.registerSource({
        id: 's4',
        channel: 'test',
        volume: 0.5,
        priority: 5,
        startTime: startTime + 300,
      });

      // Check active sources
      const sources = mixer.getChannelSources('test');
      const ids = sources.map((s) => s.id);

      expect(sources.length).toBe(3);
      expect(ids).not.toContain('s1'); // s1 should be stolen
      expect(ids).toContain('s2');
      expect(ids).toContain('s3');
      expect(ids).toContain('s4');
    });

    it('steals quietest voice when strategy is "quietest"', () => {
      mixer.setVoiceStealingStrategy({ mode: 'quietest' });

      mixer.createChannel('test', 1.0, 5, 3);

      mixer.registerSource({
        id: 's1',
        channel: 'test',
        volume: 0.8,
        priority: 5,
        startTime: Date.now(),
      });
      mixer.registerSource({
        id: 's2',
        channel: 'test',
        volume: 0.3, // Quietest
        priority: 5,
        startTime: Date.now(),
      });
      mixer.registerSource({
        id: 's3',
        channel: 'test',
        volume: 0.6,
        priority: 5,
        startTime: Date.now(),
      });

      mixer.registerSource({
        id: 's4',
        channel: 'test',
        volume: 0.5,
        priority: 5,
        startTime: Date.now(),
      });

      const sources = mixer.getChannelSources('test');
      const ids = sources.map((s) => s.id);

      expect(sources.length).toBe(3);
      expect(ids).not.toContain('s2'); // s2 should be stolen (quietest)
    });

    it('steals lowest priority voice when strategy is "lowest_priority"', () => {
      mixer.setVoiceStealingStrategy({ mode: 'lowest_priority' });

      mixer.createChannel('test', 1.0, 5, 3);

      mixer.registerSource({
        id: 's1',
        channel: 'test',
        volume: 0.5,
        priority: 7,
        startTime: Date.now(),
      });
      mixer.registerSource({
        id: 's2',
        channel: 'test',
        volume: 0.5,
        priority: 3, // Lowest priority
        startTime: Date.now(),
      });
      mixer.registerSource({
        id: 's3',
        channel: 'test',
        volume: 0.5,
        priority: 5,
        startTime: Date.now(),
      });

      mixer.registerSource({
        id: 's4',
        channel: 'test',
        volume: 0.5,
        priority: 6, // Higher than s2
        startTime: Date.now(),
      });

      const sources = mixer.getChannelSources('test');
      const ids = sources.map((s) => s.id);

      expect(sources.length).toBe(3);
      expect(ids).not.toContain('s2'); // s2 should be stolen (lowest priority)
    });

    it('does not steal if new source has lower priority', () => {
      mixer.setVoiceStealingStrategy({ mode: 'lowest_priority' });

      mixer.createChannel('test', 1.0, 5, 2);

      mixer.registerSource({
        id: 's1',
        channel: 'test',
        volume: 0.5,
        priority: 7,
        startTime: Date.now(),
      });
      mixer.registerSource({
        id: 's2',
        channel: 'test',
        volume: 0.5,
        priority: 8,
        startTime: Date.now(),
      });

      // Try to add source with priority 5 (lower than existing)
      const registered = mixer.registerSource({
        id: 's3',
        channel: 'test',
        volume: 0.5,
        priority: 5,
        startTime: Date.now(),
      });

      expect(registered).toBe(false);
      expect(mixer.getChannelVoiceCount('test')).toBe(2);
    });

    it('unregisterSource decreases voice count', () => {
      mixer.createChannel('test', 1.0, 5, 10);

      mixer.registerSource({
        id: 's1',
        channel: 'test',
        volume: 0.5,
        priority: 5,
        startTime: Date.now(),
      });

      expect(mixer.getChannelVoiceCount('test')).toBe(1);

      mixer.unregisterSource('s1');

      expect(mixer.getChannelVoiceCount('test')).toBe(0);
    });
  });

  describe('Context-Aware Mixing', () => {
    it('sets mixing context and applies channel volumes', () => {
      mixer.setMixingContext({
        name: 'combat',
        channelVolumes: {
          music: 0.3,
          sfx: 1.0,
          ambient: 0.2,
        },
      });

      expect(mixer.getMixingContext()?.name).toBe('combat');
      expect(mixer.getChannelVolume('music')).toBe(0.3);
      expect(mixer.getChannelVolume('sfx')).toBe(1.0);
      expect(mixer.getChannelVolume('ambient')).toBe(0.2);
    });

    it('clears mixing context', () => {
      mixer.setMixingContext({
        name: 'dialogue',
        channelVolumes: {
          music: 0.1,
          voice: 1.0,
        },
      });

      mixer.setMixingContext(null);

      expect(mixer.getMixingContext()).toBeNull();
    });

    it('switches between contexts', () => {
      mixer.setMixingContext({
        name: 'combat',
        channelVolumes: {
          music: 0.3,
          sfx: 1.0,
        },
      });

      expect(mixer.getChannelVolume('music')).toBe(0.3);

      mixer.setMixingContext({
        name: 'ambient',
        channelVolumes: {
          music: 0.7,
          sfx: 0.5,
        },
      });

      expect(mixer.getChannelVolume('music')).toBe(0.7);
      expect(mixer.getChannelVolume('sfx')).toBe(0.5);
    });
  });

  describe('Sidechain Configuration', () => {
    it('configures sidechain compression', () => {
      mixer.configureSidechain({
        enabled: true,
        sourceChannel: 'music',
        targetChannel: 'sfx',
        threshold: -10,
        ratio: 4,
        attackTime: 0.01,
        releaseTime: 0.1,
      });

      // Configuration should be stored (no exception thrown)
    });

    it('removes sidechain configuration', () => {
      mixer.configureSidechain({
        enabled: true,
        sourceChannel: 'music',
        targetChannel: 'sfx',
        threshold: -10,
        ratio: 4,
        attackTime: 0.01,
        releaseTime: 0.1,
      });

      mixer.removeSidechain('music', 'sfx');

      // No exception thrown
    });
  });
});
