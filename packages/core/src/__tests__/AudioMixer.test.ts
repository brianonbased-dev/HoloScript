import { describe, it, expect, beforeEach } from 'vitest';
import { AudioMixer } from '../audio/AudioMixer';

// =============================================================================
// C274 — Audio Mixer
// =============================================================================

describe('AudioMixer', () => {
  let mixer: AudioMixer;
  beforeEach(() => { mixer = new AudioMixer(); });

  it('constructor creates default channels', () => {
    const channels = mixer.getChannels();
    const names = channels.map(c => c.name);
    expect(names).toContain('sfx');
    expect(names).toContain('music');
    expect(names).toContain('ambient');
    expect(names).toContain('voice');
    expect(names).toContain('ui');
  });

  it('default master volume is 1', () => {
    expect(mixer.getMasterVolume()).toBe(1);
  });

  it('music channel defaults to 0.5', () => {
    expect(mixer.getChannelVolume('music')).toBe(0.5);
  });

  it('setChannelVolume updates volume', () => {
    mixer.setChannelVolume('sfx', 0.3);
    expect(mixer.getChannelVolume('sfx')).toBeCloseTo(0.3);
  });

  it('setChannelVolume clamps to [0,1]', () => {
    mixer.setChannelVolume('sfx', 5);
    expect(mixer.getChannelVolume('sfx')).toBe(1);
    mixer.setChannelVolume('sfx', -1);
    expect(mixer.getChannelVolume('sfx')).toBe(0);
  });

  it('getEffectiveVolume multiplies source * channel * master', () => {
    mixer.setChannelVolume('sfx', 0.5);
    mixer.setMasterVolume(0.8);
    expect(mixer.getEffectiveVolume('sfx', 1)).toBeCloseTo(0.4);
  });

  it('getEffectiveVolume returns 0 when channel muted', () => {
    mixer.setChannelMuted('sfx', true);
    expect(mixer.getEffectiveVolume('sfx', 1)).toBe(0);
  });

  it('getEffectiveVolume returns 0 when master muted', () => {
    mixer.setMasterMuted(true);
    expect(mixer.getEffectiveVolume('sfx', 1)).toBe(0);
  });

  it('muteGroup mutes multiple channels', () => {
    mixer.muteGroup(['sfx', 'music']);
    expect(mixer.isChannelMuted('sfx')).toBe(true);
    expect(mixer.isChannelMuted('music')).toBe(true);
    expect(mixer.isChannelMuted('voice')).toBe(false);
  });

  it('unmuteGroup unmutes channels', () => {
    mixer.muteGroup(['sfx', 'music']);
    mixer.unmuteGroup(['sfx']);
    expect(mixer.isChannelMuted('sfx')).toBe(false);
    expect(mixer.isChannelMuted('music')).toBe(true);
  });

  it('createChannel adds new channel', () => {
    mixer.createChannel('foley', 0.7);
    expect(mixer.getChannelVolume('foley')).toBeCloseTo(0.7);
  });

  it('setMasterVolume clamps to [0,1]', () => {
    mixer.setMasterVolume(2);
    expect(mixer.getMasterVolume()).toBe(1);
    mixer.setMasterVolume(-0.5);
    expect(mixer.getMasterVolume()).toBe(0);
  });
});
