/**
 * AudioMixer — Production Test Suite
 *
 * Covers: default channels (master/sfx/music/ambient/ui/voice),
 * createChannel, setChannelVolume (clamp), getChannelVolume,
 * setChannelMuted/isChannelMuted, getEffectiveVolume (masterMuted,
 * channelMuted, product), setMasterVolume (clamp), getMasterVolume,
 * setMasterMuted/isMasterMuted, getChannels, muteGroup/unmuteGroup.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AudioMixer } from '../AudioMixer';

describe('AudioMixer — Production', () => {
  let mixer: AudioMixer;

  beforeEach(() => {
    mixer = new AudioMixer();
  });

  // ─── Default channels ─────────────────────────────────────────────
  it('creates default channels on construction', () => {
    const names = mixer.getChannels().map((c) => c.name);
    expect(names).toContain('master');
    expect(names).toContain('sfx');
    expect(names).toContain('music');
    expect(names).toContain('ambient');
  });

  // ─── createChannel ────────────────────────────────────────────────
  it('createChannel adds a new channel', () => {
    mixer.createChannel('dialog', 0.9);
    expect(mixer.getChannelVolume('dialog')).toBeCloseTo(0.9);
  });

  it('createChannel overwrites existing channel', () => {
    mixer.createChannel('sfx', 0.3);
    expect(mixer.getChannelVolume('sfx')).toBeCloseTo(0.3);
  });

  // ─── setChannelVolume ─────────────────────────────────────────────
  it('setChannelVolume updates volume', () => {
    mixer.setChannelVolume('sfx', 0.7);
    expect(mixer.getChannelVolume('sfx')).toBeCloseTo(0.7);
  });

  it('setChannelVolume clamps to [0,1]', () => {
    mixer.setChannelVolume('sfx', -99);
    expect(mixer.getChannelVolume('sfx')).toBe(0);
    mixer.setChannelVolume('sfx', 99);
    expect(mixer.getChannelVolume('sfx')).toBe(1);
  });

  it('getChannelVolume returns 1 for unknown channel', () => {
    expect(mixer.getChannelVolume('ghost')).toBe(1);
  });

  // ─── setChannelMuted / isChannelMuted ────────────────────────────
  it('setChannelMuted mutes a channel', () => {
    mixer.setChannelMuted('sfx', true);
    expect(mixer.isChannelMuted('sfx')).toBe(true);
  });

  it('isChannelMuted returns false for unmuted channel', () => {
    expect(mixer.isChannelMuted('sfx')).toBe(false);
  });

  it('isChannelMuted returns false for unknown channel', () => {
    expect(mixer.isChannelMuted('ghost')).toBe(false);
  });

  // ─── getEffectiveVolume ───────────────────────────────────────────
  it('getEffectiveVolume returns product of source * channel * master', () => {
    mixer.setMasterVolume(1.0);
    mixer.setChannelVolume('sfx', 0.5);
    expect(mixer.getEffectiveVolume('sfx', 0.8)).toBeCloseTo(0.4);
  });

  it('getEffectiveVolume returns 0 when master muted', () => {
    mixer.setMasterMuted(true);
    expect(mixer.getEffectiveVolume('sfx', 1.0)).toBe(0);
  });

  it('getEffectiveVolume returns 0 when channel muted', () => {
    mixer.setChannelMuted('sfx', true);
    expect(mixer.getEffectiveVolume('sfx', 1.0)).toBe(0);
  });

  it('getEffectiveVolume returns 0 for unknown channel', () => {
    // muted unknown → returns 0
    expect(mixer.getEffectiveVolume('ghost', 1.0)).toBe(0);
  });

  // ─── setMasterVolume ──────────────────────────────────────────────
  it('setMasterVolume clamps to [0,1]', () => {
    mixer.setMasterVolume(-5);
    expect(mixer.getMasterVolume()).toBe(0);
    mixer.setMasterVolume(5);
    expect(mixer.getMasterVolume()).toBe(1);
  });

  it('getMasterVolume default is 1', () => {
    expect(mixer.getMasterVolume()).toBe(1.0);
  });

  // ─── setMasterMuted / isMasterMuted ──────────────────────────────
  it('setMasterMuted true silences all', () => {
    mixer.setMasterMuted(true);
    expect(mixer.isMasterMuted()).toBe(true);
  });

  it('isMasterMuted default is false', () => {
    expect(mixer.isMasterMuted()).toBe(false);
  });

  // ─── getChannels ──────────────────────────────────────────────────
  it('getChannels returns all channels as array', () => {
    expect(mixer.getChannels().length).toBeGreaterThanOrEqual(6);
  });

  // ─── muteGroup / unmuteGroup ──────────────────────────────────────
  it('muteGroup mutes all listed channels', () => {
    mixer.muteGroup(['sfx', 'music', 'ambient']);
    expect(mixer.isChannelMuted('sfx')).toBe(true);
    expect(mixer.isChannelMuted('music')).toBe(true);
    expect(mixer.isChannelMuted('ambient')).toBe(true);
  });

  it('unmuteGroup unmutes all listed channels', () => {
    mixer.muteGroup(['sfx', 'music']);
    mixer.unmuteGroup(['sfx', 'music']);
    expect(mixer.isChannelMuted('sfx')).toBe(false);
    expect(mixer.isChannelMuted('music')).toBe(false);
  });
});
