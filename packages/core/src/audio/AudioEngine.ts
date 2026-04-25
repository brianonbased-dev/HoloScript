type Vec3 = [number, number, number];
type Vec3Tuple = [number, number, number];

export interface AudioSourceOptions {
  id?: string;
  volume?: number;
  spatialize?: boolean;
  position?: Vec3Tuple | Vec3;
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
  distanceModel?: 'inverse' | 'linear' | 'exponential';
}

export interface AudioSource {
  id: string;
  soundId: string;
  volume: number;
  spatialize: boolean;
  position?: Vec3Tuple;
  refDistance: number;
  maxDistance: number;
  rolloffFactor: number;
  distanceModel: 'inverse' | 'linear' | 'exponential';
  isPlaying: boolean;
  computedVolume: number;
  computedPan: number;
}

export class AudioEngine {
  private sources: Map<string, AudioSource> = new Map();
  private masterVolume = 1;
  private masterMuted = false;
  private listenerPos: Vec3 = [0, 0, 0];
  private listenerForward: Vec3 = [0, 0, -1];
  private listenerUp: Vec3 = [0, 1, 0];
  private counter = 0;

  play(soundId: string, options: AudioSourceOptions = {}): string {
    const id = options.id ?? `_src_${++this.counter}`;

    const toTuple = (v?: Vec3Tuple | Vec3): Vec3Tuple | undefined => {
      if (!v) return undefined;
      if (Array.isArray(v)) return v as Vec3Tuple;
      return [(v as Vec3)[0], (v as Vec3)[1], (v as Vec3)[2]];
    };

    const src: AudioSource = {
      id,
      soundId,
      volume: options.volume ?? 1,
      spatialize: options.spatialize ?? (options.position !== undefined),
      position: toTuple(options.position),
      refDistance: options.refDistance ?? 1,
      maxDistance: options.maxDistance ?? 10000,
      rolloffFactor: options.rolloffFactor ?? 1,
      distanceModel: options.distanceModel ?? 'inverse',
      isPlaying: true,
      computedVolume: options.volume ?? 1,
      computedPan: 0,
    };

    this.sources.set(id, src);
    return id;
  }

  stop(id: string): void {
    this.sources.delete(id);
  }

  stopAll(): void {
    this.sources.clear();
  }

  getActiveCount(): number {
    return this.sources.size;
  }

  getActiveSources(): AudioSource[] {
    return Array.from(this.sources.values());
  }

  getSource(id: string): AudioSource | undefined {
    return this.sources.get(id);
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  isMuted(): boolean {
    return this.masterMuted;
  }

  setListenerPosition(pos: Vec3): void {
    this.listenerPos = pos;
  }

  setListenerOrientation(forward: Vec3, up: Vec3): void {
    this.listenerForward = forward;
    this.listenerUp = up;
  }

  getListener(): { position: Vec3Tuple; forward: Vec3Tuple; up: Vec3Tuple } {
    return {
      position: [this.listenerPos[0], this.listenerPos[1], this.listenerPos[2]],
      forward: [this.listenerForward[0], this.listenerForward[1], this.listenerForward[2]],
      up: [this.listenerUp[0], this.listenerUp[1], this.listenerUp[2]],
    };
  }

  setMasterVolume(v: number): void {
    this.masterVolume = v;
  }

  setMuted(muted: boolean): void {
    this.masterMuted = muted;
  }

  update(_dt: number): void {
    const rightAxis = this.crossNorm(this.listenerForward, this.listenerUp);

    for (const src of this.sources.values()) {
      if (this.masterMuted) {
        src.computedVolume = 0;
        continue;
      }

      let vol = src.volume * this.masterVolume;

      if (src.spatialize && src.position) {
        const dx = src.position[0] - this.listenerPos[0];
        const dy = src.position[1] - this.listenerPos[1];
        const dz = src.position[2] - this.listenerPos[2];
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance > 0) {
          if (src.distanceModel === 'inverse') {
            const d = Math.max(distance, src.refDistance);
            vol *= src.refDistance / (src.refDistance + src.rolloffFactor * (d - src.refDistance));
          } else if (src.distanceModel === 'linear') {
            const clamped = Math.min(Math.max(distance, src.refDistance), src.maxDistance);
            const range = src.maxDistance - src.refDistance;
            if (range > 0) {
              vol *= 1 - src.rolloffFactor * (clamped - src.refDistance) / range;
            }
          }

          const nx = dx / distance;
          const ny = dy / distance;
          const nz = dz / distance;
          src.computedPan = nx * rightAxis[0] + ny * rightAxis[1] + nz * rightAxis[2];
        }
      }

      src.computedVolume = Math.max(0, vol);
    }
  }

  private crossNorm(a: Vec3, b: Vec3): Vec3Tuple {
    const cx = a[1] * b[2] - a[2] * b[1];
    const cy = a[2] * b[0] - a[0] * b[2];
    const cz = a[0] * b[1] - a[1] * b[0];
    const len = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
    return [cx / len, cy / len, cz / len];
  }
}
