/**
 * @holoscript/runtime - SpatialVoiceCoordinator
 *
 * Consumes `spatial_voice_position` emitted by SpatialVoiceTrait
 * (packages/core/src/traits/SpatialVoiceTrait.ts) and maps each speaking node to
 * a positional audio result (distance-attenuated gain + stereo pan). Closes the
 * missing listener side for the trait's per-tick position emit (Pattern E:
 * emit-without-listener) — before this, voice positioning never reached a panner.
 *
 * Mirrors SessionPresenceCoordinator / AmbisonicDecoderCoordinator.
 */

import type { EventBus } from './events.js';
import {
  attenuationGain,
  stereoPan,
  distance as vecDistance,
  type RolloffModel,
  type Vec3,
} from './spatialVoiceAttenuation.js';

export interface SpatialVoicePositionEvent {
  nodeId: string;
  range: number;
  rolloff?: RolloffModel;
  rolloffFactor?: number;
  position?: Vec3;
}

export interface SpatialVoiceDestroyEvent {
  nodeId: string;
}

export interface VoiceSpatialization {
  nodeId: string;
  /** Distance attenuation gain in [0, 1]. */
  gain: number;
  /** Stereo pan in [-1, 1]. */
  pan: number;
  /** Distance from listener (world units). */
  distance: number;
  /** Voice range used for culling. */
  range: number;
  rolloff: RolloffModel;
  /** True when the source is within range (gain > 0). */
  audible: boolean;
  updatedAt: number;
  updateCount: number;
}

export type SpatializationHandler = (s: VoiceSpatialization) => void;

export interface SpatialVoiceCoordinatorOptions {
  bus: EventBus;
  /** Listener world position. Default origin. */
  listenerPosition?: Vec3;
  onSpatialization?: SpatializationHandler;
}

export class SpatialVoiceCoordinator {
  private readonly bus: EventBus;
  private listenerPosition: Vec3;
  private spatializations = new Map<string, VoiceSpatialization>();
  private handlers = new Set<SpatializationHandler>();
  private unsubscribers: Array<() => void> = [];
  private _started = false;

  constructor(options: SpatialVoiceCoordinatorOptions) {
    this.bus = options.bus;
    this.listenerPosition = options.listenerPosition ?? [0, 0, 0];
    if (options.onSpatialization) this.handlers.add(options.onSpatialization);
  }

  start(): void {
    if (this._started) return;
    this._started = true;
    this.unsubscribers.push(
      this.bus.on<SpatialVoicePositionEvent>('spatial_voice_position', (e) =>
        this.onPosition(e)
      )
    );
    this.unsubscribers.push(
      this.bus.on<SpatialVoiceDestroyEvent>('spatial_voice_destroy', (e) =>
        this.spatializations.delete(e.nodeId)
      )
    );
  }

  stop(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this._started = false;
  }

  /** Update the listener pose; subsequent position events use it. */
  setListenerPosition(pos: Vec3): void {
    this.listenerPosition = pos;
  }

  private onPosition(e: SpatialVoicePositionEvent): void {
    const pos = e.position ?? [0, 0, 0];
    const range = e.range;
    const rolloff: RolloffModel = e.rolloff ?? 'inverse';
    const factor = e.rolloffFactor ?? 1;
    const d = vecDistance(pos, this.listenerPosition);
    const gain = attenuationGain(d, range, rolloff, factor);
    const pan = stereoPan(pos, this.listenerPosition, range);
    const prev = this.spatializations.get(e.nodeId);
    const record: VoiceSpatialization = {
      nodeId: e.nodeId,
      gain,
      pan,
      distance: d,
      range,
      rolloff,
      audible: gain > 0,
      updatedAt: Date.now(),
      updateCount: (prev?.updateCount ?? 0) + 1,
    };
    this.spatializations.set(e.nodeId, record);
    this.handlers.forEach((h) => h(record));
  }

  getSpatialization(nodeId: string): VoiceSpatialization | undefined {
    return this.spatializations.get(nodeId);
  }

  getAll(): VoiceSpatialization[] {
    return Array.from(this.spatializations.values());
  }

  count(): number {
    return this.spatializations.size;
  }

  onSpatialization(handler: SpatializationHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}

export function createSpatialVoiceCoordinator(
  options: SpatialVoiceCoordinatorOptions
): SpatialVoiceCoordinator {
  const coordinator = new SpatialVoiceCoordinator(options);
  coordinator.start();
  return coordinator;
}
