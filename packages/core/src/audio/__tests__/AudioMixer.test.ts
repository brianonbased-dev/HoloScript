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
    const names = channels.map(c => c.name);
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
});
