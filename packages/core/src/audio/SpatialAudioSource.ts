/**
 * SpatialAudioSource — positional audio source with volume and playback state.
 */

export interface SpatialAudioSourceConfig {
  position: [number, number, number];
  volume?: number;
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
  loop?: boolean;
}

export class SpatialAudioSource {
  private position: [number, number, number];
  private volume: number;
  private playing = false;
  private config: SpatialAudioSourceConfig;

  constructor(config: SpatialAudioSourceConfig) {
    this.config = { ...config };
    this.position = [config.position[0], config.position[1], config.position[2]];
    this.volume = config.volume ?? 1;
  }

  play(): void { this.playing = true; }
  stop(): void { this.playing = false; }
  pause(): void { this.playing = false; }
  resume(): void { this.playing = true; }

  isPlaying(): boolean { return this.playing; }

  getVolume(): number { return this.volume; }
  setVolume(v: number): void { this.volume = v; }

  getPosition(): [number, number, number] {
    return [...this.position] as [number, number, number];
  }

  setPosition(x: number, y: number, z: number): void {
    this.position = [x, y, z];
  }

  getConfig(): SpatialAudioSourceConfig {
    return { ...this.config };
  }
}
