/**
 * AudioContextImpl.ts
 *
 * Implementation of the HoloScript audio context with support for
 * buffer sources, oscillators, spatial audio, and effects chains.
 *
 * @module audio
 */

import {
  IAudioContext,
  IAudioSourceConfig,
  IAudioSourceState,
  IAudioListenerConfig,
  IAudioGroup,
  AudioEffect,
  AudioEventType,
  AudioEventCallback,
  IAudioEvent,
  IAudioSystemConfig,
  IVector3,
  IAudioOrientation,
  PlaybackState,
  AUDIO_DEFAULTS,
  zeroVector,
  defaultOrientation,
} from './AudioTypes';

// ============================================================================
// Internal Types
// ============================================================================

interface InternalSource {
  id: string;
  config: IAudioSourceConfig;
  state: PlaybackState;
  volume: number;
  pitch: number;
  loop: boolean;
  position: IVector3;
  currentTime: number;
  duration: number;
  startedAt: number;
  pausedAt: number;
  effects: string[];
  analyzerData?: Float32Array;
  frequencyData?: Uint8Array;
}

interface InternalEffect {
  id: string;
  config: AudioEffect;
}

interface InternalGroup {
  id: string;
  config: IAudioGroup;
  sources: Set<string>;
}

// ============================================================================
// AudioContextImpl
// ============================================================================

/**
 * HoloScript audio context implementation
 */
export class AudioContextImpl implements IAudioContext {
  private _state: 'suspended' | 'running' | 'closed' = 'suspended';
  private _currentTime: number = 0;
  private _masterVolume: number = 1.0;
  private _isMuted: boolean = false;
  private _previousVolume: number = 1.0;

  private readonly config: Required<IAudioSystemConfig>;
  private readonly sources: Map<string, InternalSource> = new Map();
  private readonly effects: Map<string, InternalEffect> = new Map();
  private readonly groups: Map<string, InternalGroup> = new Map();
  private readonly bufferCache: Map<string, ArrayBuffer> = new Map();
  private readonly decodedBuffers: Map<string, AudioBuffer> = new Map();
  private readonly eventListeners: Map<AudioEventType, Set<AudioEventCallback>> = new Map();

  private listenerPosition: IVector3 = zeroVector();
  private listenerOrientation: IAudioOrientation = defaultOrientation();
  private listenerVelocity: IVector3 = zeroVector();

  private timeUpdateInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: IAudioSystemConfig = {}) {
    this.config = { ...AUDIO_DEFAULTS, ...config };
    this._masterVolume = this.config.masterVolume;
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  public async initialize(): Promise<void> {
    if (this._state === 'running') return;

    this._state = 'running';
    this._currentTime = 0;

    // Start time tracking
    this.timeUpdateInterval = setInterval(() => {
      if (this._state === 'running') {
        this._currentTime += 0.01;
        this.updatePlayingSources();
      }
    }, 10);
  }

  public async suspend(): Promise<void> {
    if (this._state !== 'running') return;
    this._state = 'suspended';
  }

  public async resume(): Promise<void> {
    if (this._state !== 'suspended') return;
    this._state = 'running';
  }

  public dispose(): void {
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
      this.timeUpdateInterval = null;
    }

    this.sources.clear();
    this.effects.clear();
    this.groups.clear();
    this.bufferCache.clear();
    this.decodedBuffers.clear();
    this.eventListeners.clear();

    this._state = 'closed';
  }

  public get state(): 'suspended' | 'running' | 'closed' {
    return this._state;
  }

  public get currentTime(): number {
    return this._currentTime;
  }

  public get sampleRate(): number {
    return this.config.sampleRate;
  }

  // ==========================================================================
  // Master Controls
  // ==========================================================================

  public setMasterVolume(volume: number): void {
    this._masterVolume = Math.max(0, Math.min(1, volume));
    if (!this._isMuted) {
      this._previousVolume = this._masterVolume;
    }
  }

  public getMasterVolume(): number {
    return this._masterVolume;
  }

  public mute(): void {
    if (!this._isMuted) {
      this._previousVolume = this._masterVolume;
      this._masterVolume = 0;
      this._isMuted = true;
    }
  }

  public unmute(): void {
    if (this._isMuted) {
      this._masterVolume = this._previousVolume;
      this._isMuted = false;
    }
  }

  public get isMuted(): boolean {
    return this._isMuted;
  }

  // ==========================================================================
  // Listener
  // ==========================================================================

  public setListenerPosition(position: IVector3): void {
    this.listenerPosition = { ...position };
  }

  public setListenerOrientation(orientation: IAudioOrientation): void {
    this.listenerOrientation = {
      forward: { ...orientation.forward },
      up: { ...orientation.up },
    };
  }

  public setListenerVelocity(velocity: IVector3): void {
    this.listenerVelocity = { ...velocity };
  }

  public getListenerConfig(): IAudioListenerConfig {
    return {
      position: { ...this.listenerPosition },
      orientation: {
        forward: { ...this.listenerOrientation.forward },
        up: { ...this.listenerOrientation.up },
      },
      velocity: { ...this.listenerVelocity },
    };
  }

  // ==========================================================================
  // Source Management
  // ==========================================================================

  public async createSource(config: IAudioSourceConfig): Promise<string> {
    if (this.sources.has(config.id)) {
      throw new Error(`Source with id '${config.id}' already exists`);
    }

    if (this.sources.size >= this.config.maxSources) {
      throw new Error(`Maximum sources (${this.config.maxSources}) reached`);
    }

    // Load buffer if URL provided
    if (config.type === 'buffer' && config.url) {
      if (!this.bufferCache.has(config.url)) {
        const buffer = await this.loadBuffer(config.url);
        this.bufferCache.set(config.url, buffer);
      }
    }

    const source: InternalSource = {
      id: config.id,
      config,
      state: 'stopped',
      volume: config.volume ?? 1.0,
      pitch: config.pitch ?? 1.0,
      loop: config.loop ?? false,
      position: config.position ?? zeroVector(),
      currentTime: 0,
      duration: config.duration ?? 0,
      startedAt: 0,
      pausedAt: 0,
      effects: config.effects ?? [],
      analyzerData: new Float32Array(1024),
      frequencyData: new Uint8Array(512),
    };

    this.sources.set(config.id, source);

    // Add to group if specified
    if (config.group) {
      const group = this.groups.get(config.group);
      if (group) {
        group.sources.add(config.id);
      }
    }

    return config.id;
  }

  public getSource(id: string): IAudioSourceState | undefined {
    const source = this.sources.get(id);
    if (!source) return undefined;

    return {
      id: source.id,
      type: source.config.type,
      state: source.state,
      volume: source.volume,
      pitch: source.pitch,
      loop: source.loop,
      position: { ...source.position },
      currentTime: source.currentTime,
      duration: source.duration,
      spatial: source.config.spatial ?? false,
    };
  }

  public getAllSources(): IAudioSourceState[] {
    return Array.from(this.sources.values()).map((source) => ({
      id: source.id,
      type: source.config.type,
      state: source.state,
      volume: source.volume,
      pitch: source.pitch,
      loop: source.loop,
      position: { ...source.position },
      currentTime: source.currentTime,
      duration: source.duration,
      spatial: source.config.spatial ?? false,
    }));
  }

  public removeSource(id: string): boolean {
    const source = this.sources.get(id);
    if (!source) return false;

    // Stop if playing
    if (source.state === 'playing') {
      this.stop(id);
    }

    // Remove from group
    if (source.config.group) {
      const group = this.groups.get(source.config.group);
      if (group) {
        group.sources.delete(id);
      }
    }

    this.sources.delete(id);
    return true;
  }

  // ==========================================================================
  // Playback Control
  // ==========================================================================

  public play(sourceId: string, when?: number): void {
    const source = this.sources.get(sourceId);
    if (!source) return;

    if (when !== undefined && when > this._currentTime) {
      source.state = 'scheduled';
      source.startedAt = when;
    } else {
      source.state = 'playing';
      source.startedAt = this._currentTime;
      source.currentTime = 0;
    }

    this.emit({
      type: 'sourceStarted',
      sourceId,
      timestamp: this._currentTime,
    });
  }

  public stop(sourceId: string): void {
    const source = this.sources.get(sourceId);
    if (!source) return;

    source.state = 'stopped';
    source.currentTime = 0;
    source.startedAt = 0;
    source.pausedAt = 0;

    this.emit({
      type: 'sourceStopped',
      sourceId,
      timestamp: this._currentTime,
    });
  }

  public pause(sourceId: string): void {
    const source = this.sources.get(sourceId);
    if (!source || source.state !== 'playing') return;

    source.state = 'paused';
    source.pausedAt = this._currentTime;

    this.emit({
      type: 'sourcePaused',
      sourceId,
      timestamp: this._currentTime,
    });
  }

  public resumeSource(sourceId: string): void {
    const source = this.sources.get(sourceId);
    if (!source || source.state !== 'paused') return;

    const pauseDuration = this._currentTime - source.pausedAt;
    source.startedAt += pauseDuration;
    source.state = 'playing';
    source.pausedAt = 0;

    this.emit({
      type: 'sourceResumed',
      sourceId,
      timestamp: this._currentTime,
    });
  }

  // ==========================================================================
  // Source Properties
  // ==========================================================================

  public setVolume(sourceId: string, volume: number): void {
    const source = this.sources.get(sourceId);
    if (source) {
      source.volume = Math.max(0, Math.min(1, volume));
    }
  }

  public setPitch(sourceId: string, pitch: number): void {
    const source = this.sources.get(sourceId);
    if (source && pitch > 0) {
      source.pitch = pitch;
    }
  }

  public setLoop(sourceId: string, loop: boolean, start?: number, end?: number): void {
    const source = this.sources.get(sourceId);
    if (source) {
      source.loop = loop;
      if (start !== undefined) source.config.loopStart = start;
      if (end !== undefined) source.config.loopEnd = end;
    }
  }

  public setPosition(sourceId: string, position: IVector3): void {
    const source = this.sources.get(sourceId);
    if (source) {
      source.position = { ...position };
    }
  }

  public setOrientation(sourceId: string, orientation: IVector3): void {
    const source = this.sources.get(sourceId);
    if (source) {
      source.config.orientation = { ...orientation };
    }
  }

  // ==========================================================================
  // Effects
  // ==========================================================================

  public createEffect(config: AudioEffect): string {
    if (this.effects.has(config.id)) {
      throw new Error(`Effect with id '${config.id}' already exists`);
    }

    this.effects.set(config.id, { id: config.id, config });
    return config.id;
  }

  public getEffect(id: string): AudioEffect | undefined {
    return this.effects.get(id)?.config;
  }

  public removeEffect(id: string): boolean {
    if (!this.effects.has(id)) return false;

    // Remove from all sources
    for (const source of this.sources.values()) {
      const index = source.effects.indexOf(id);
      if (index !== -1) {
        source.effects.splice(index, 1);
      }
    }

    this.effects.delete(id);
    return true;
  }

  public connectSourceToEffect(sourceId: string, effectId: string): void {
    const source = this.sources.get(sourceId);
    const effect = this.effects.get(effectId);

    if (source && effect && !source.effects.includes(effectId)) {
      source.effects.push(effectId);
    }
  }

  public disconnectSourceFromEffect(sourceId: string, effectId: string): void {
    const source = this.sources.get(sourceId);
    if (source) {
      const index = source.effects.indexOf(effectId);
      if (index !== -1) {
        source.effects.splice(index, 1);
      }
    }
  }

  // ==========================================================================
  // Groups
  // ==========================================================================

  public createGroup(config: IAudioGroup): string {
    if (this.groups.has(config.id)) {
      throw new Error(`Group with id '${config.id}' already exists`);
    }

    this.groups.set(config.id, {
      id: config.id,
      config,
      sources: new Set(),
    });

    return config.id;
  }

  public getGroup(id: string): IAudioGroup | undefined {
    return this.groups.get(id)?.config;
  }

  public setGroupVolume(groupId: string, volume: number): void {
    const group = this.groups.get(groupId);
    if (group) {
      group.config.volume = Math.max(0, Math.min(1, volume));
    }
  }

  public setGroupMuted(groupId: string, muted: boolean): void {
    const group = this.groups.get(groupId);
    if (group) {
      group.config.muted = muted;
    }
  }

  public setGroupSolo(groupId: string, solo: boolean): void {
    const group = this.groups.get(groupId);
    if (group) {
      group.config.solo = solo;
    }
  }

  // ==========================================================================
  // Buffer Management
  // ==========================================================================

  public async loadBuffer(url: string): Promise<ArrayBuffer> {
    // Check cache first
    const cached = this.bufferCache.get(url);
    if (cached) return cached;

    // Simulate loading (in real implementation, would use fetch)
    const buffer = new ArrayBuffer(44100 * 2 * 2); // 1 second stereo 16-bit
    this.bufferCache.set(url, buffer);

    this.emit({
      type: 'bufferLoaded',
      timestamp: this._currentTime,
      data: { url },
    });

    return buffer;
  }

  public async decodeBuffer(buffer: ArrayBuffer): Promise<AudioBuffer> {
    // In real implementation, would use AudioContext.decodeAudioData
    // For now, return a mock AudioBuffer-like object
    return {
      length: buffer.byteLength / 4,
      duration: buffer.byteLength / (44100 * 4),
      sampleRate: 44100,
      numberOfChannels: 2,
      getChannelData: (_channel: number) => new Float32Array(buffer.byteLength / 4),
      copyFromChannel: () => {},
      copyToChannel: () => {},
    } as unknown as AudioBuffer;
  }

  public getCachedBuffer(url: string): ArrayBuffer | undefined {
    return this.bufferCache.get(url);
  }

  public clearBufferCache(): void {
    this.bufferCache.clear();
    this.decodedBuffers.clear();
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  public on(event: AudioEventType, callback: AudioEventCallback): void {
    let listeners = this.eventListeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.eventListeners.set(event, listeners);
    }
    listeners.add(callback);
  }

  public off(event: AudioEventType, callback: AudioEventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  public emit(event: IAudioEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(event);
        } catch (e) {
          console.error('Error in audio event callback:', e);
        }
      }
    }
  }

  // ==========================================================================
  // Analysis
  // ==========================================================================

  public getAnalyzerData(sourceId: string): Float32Array | undefined {
    const source = this.sources.get(sourceId);
    if (!source || !source.analyzerData) return undefined;

    // In real implementation, would copy from AnalyserNode
    // For now, generate mock waveform data
    if (source.state === 'playing') {
      for (let i = 0; i < source.analyzerData.length; i++) {
        source.analyzerData[i] = Math.sin(i * 0.1 + this._currentTime * 10) * 0.5;
      }
    }

    return source.analyzerData;
  }

  public getFrequencyData(sourceId: string): Uint8Array | undefined {
    const source = this.sources.get(sourceId);
    if (!source || !source.frequencyData) return undefined;

    // In real implementation, would copy from AnalyserNode
    // For now, generate mock frequency data
    if (source.state === 'playing') {
      for (let i = 0; i < source.frequencyData.length; i++) {
        const freq = i / source.frequencyData.length;
        source.frequencyData[i] = Math.floor(Math.random() * 128 + 64 * (1 - freq));
      }
    }

    return source.frequencyData;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private updatePlayingSources(): void {
    for (const source of this.sources.values()) {
      // Handle scheduled sources
      if (source.state === 'scheduled' && this._currentTime >= source.startedAt) {
        source.state = 'playing';
        this.emit({
          type: 'sourceStarted',
          sourceId: source.id,
          timestamp: this._currentTime,
        });
      }

      // Update playing sources
      if (source.state === 'playing') {
        source.currentTime = (this._currentTime - source.startedAt) * source.pitch;

        // Check for end of playback
        if (source.duration > 0 && source.currentTime >= source.duration) {
          if (source.loop) {
            source.currentTime = source.config.loopStart ?? 0;
            source.startedAt = this._currentTime;
            this.emit({
              type: 'sourceLooped',
              sourceId: source.id,
              timestamp: this._currentTime,
            });
          } else {
            source.state = 'stopped';
            source.currentTime = 0;
            this.emit({
              type: 'sourceEnded',
              sourceId: source.id,
              timestamp: this._currentTime,
            });
          }
        }
      }
    }
  }

  /**
   * Calculate spatial audio gain based on distance
   */
  public calculateSpatialGain(sourcePosition: IVector3): number {
    const dx = sourcePosition.x - this.listenerPosition.x;
    const dy = sourcePosition.y - this.listenerPosition.y;
    const dz = sourcePosition.z - this.listenerPosition.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const refDistance = this.config.defaultRefDistance;
    const maxDistance = this.config.defaultMaxDistance;

    if (distance <= refDistance) return 1.0;
    if (distance >= maxDistance) return 0.0;

    switch (this.config.defaultRolloff) {
      case 'linear':
        return 1 - (distance - refDistance) / (maxDistance - refDistance);
      case 'exponential':
        return Math.pow(distance / refDistance, -1);
      case 'inverse':
      default:
        return refDistance / (refDistance + (distance - refDistance));
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new audio context
 */
export function createAudioContext(config?: IAudioSystemConfig): IAudioContext {
  return new AudioContextImpl(config);
}
