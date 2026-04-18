export interface Channel {
  name: string;
  volume: number;
  muted: boolean;
}

export class AudioMixer {
  private masterVolume = 1;
  private masterMuted = false;
  private channels: Map<string, Channel> = new Map([
    ['sfx', { name: 'sfx', volume: 1, muted: false }],
    ['music', { name: 'music', volume: 0.5, muted: false }],
    ['ambient', { name: 'ambient', volume: 1, muted: false }],
    ['ui', { name: 'ui', volume: 1, muted: false }],
    ['voice', { name: 'voice', volume: 1, muted: false }],
  ]);

  private clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
  }

  getChannels(): Channel[] {
    return [...this.channels.values()];
  }

  setMasterVolume(v: number): void {
    this.masterVolume = this.clamp01(v);
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  setMasterMuted(muted: boolean): void {
    this.masterMuted = muted;
  }

  setChannelVolume(name: string, vol: number): void {
    const ch = this.channels.get(name);
    if (ch) ch.volume = this.clamp01(vol);
  }

  getChannelVolume(name: string): number {
    return this.channels.get(name)?.volume ?? 0;
  }

  setChannelMuted(name: string, muted: boolean): void {
    const ch = this.channels.get(name);
    if (ch) ch.muted = muted;
  }

  isChannelMuted(name: string): boolean {
    return this.channels.get(name)?.muted ?? false;
  }

  getEffectiveVolume(channelName: string, volume: number): number {
    if (this.masterMuted) return 0;
    const ch = this.channels.get(channelName);
    if (!ch || ch.muted) return 0;
    return this.masterVolume * ch.volume * volume;
  }

  muteGroup(names: string[]): void {
    for (const name of names) this.setChannelMuted(name, true);
  }

  unmuteGroup(names: string[]): void {
    for (const name of names) this.setChannelMuted(name, false);
  }

  createChannel(name: string, volume = 1): void {
    this.channels.set(name, { name, volume: this.clamp01(volume), muted: false });
  }
}
