/**
 * @holoscript/runtime - AmbisonicDecoderCoordinator
 *
 * Consumes ambisonic decoder events emitted by AmbisonicsTrait
 * (packages/core/src/traits/AmbisonicsTrait.ts) and applies head-tracked
 * rotation to a soundfield decoder. Closes the missing listener side for the
 * trait's `ambisonics_update_rotation` emit (Pattern E: emit-without-listener).
 *
 * Before this coordinator, AmbisonicsTrait.onUpdate emitted
 * `ambisonics_update_rotation` every tick but nothing consumed it, so head
 * rotation silently failed to rotate the soundfield. This coordinator subscribes
 * to the trait lifecycle (init / rotation / playback / cleanup) and maintains a
 * per-node decoder record whose rotation operator is recomputed from the
 * listener quaternion using real spherical-harmonic rotation.
 *
 * Mirrors SessionPresenceCoordinator (the established Pattern E consumer shape).
 */

import type { EventBus } from './events.js';
import {
  ambisonicRotationMatrix,
  channelCount as ambisonicChannelCount,
  type Matrix,
  type Quaternion,
} from './ambisonicRotation.js';

// ---------------------------------------------------------------------------
// Event payload types (as emitted by AmbisonicsTrait via context.emit)
// ---------------------------------------------------------------------------

/** Node reference as passed by the trait — an object with an id, or a string. */
export type NodeRef = string | { id?: string; [k: string]: unknown };

export interface AmbisonicsInitEvent {
  node: NodeRef;
  order: number;
  normalization?: string;
  channelOrdering?: string;
  decoderType?: string;
}

export interface AmbisonicsRotationEvent {
  node: NodeRef;
  rotation: Quaternion;
}

export interface AmbisonicsPlaybackEvent {
  node: NodeRef;
}

// ---------------------------------------------------------------------------
// Decoder record
// ---------------------------------------------------------------------------

export interface AmbisonicDecoderRecord {
  nodeId: string;
  order: number;
  channelCount: number;
  normalization: string;
  channelOrdering: string;
  decoderType: string;
  playing: boolean;
  /** Last applied listener quaternion [x,y,z,w]. */
  rotationQuaternion: Quaternion;
  /** Full (channels x channels) block-diagonal soundfield rotation operator. */
  rotationMatrix: Matrix;
  /** Number of rotation updates applied since the decoder was initialized. */
  rotationUpdateCount: number;
  initializedAt: number;
  updatedAt: number;
}

export type DecoderHandler = (record: AmbisonicDecoderRecord) => void;

export interface AmbisonicDecoderCoordinatorOptions {
  bus: EventBus;
  /** Order assumed when a rotation arrives before an init event. Default 1 (FOA). */
  defaultOrder?: number;
  onRotationUpdated?: DecoderHandler;
  onDecoderInitialized?: DecoderHandler;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveNodeId(node: NodeRef): string {
  if (typeof node === 'string') return node;
  if (node && typeof node.id === 'string') return node.id;
  return String(node);
}

function identityMatrix(n: number): Matrix {
  const M: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) M[i][i] = 1;
  return M;
}

function clampOrder(order: number): number {
  if (!Number.isFinite(order) || order < 1) return 1;
  if (order > 3) return 3;
  return Math.floor(order);
}

// ---------------------------------------------------------------------------
// AmbisonicDecoderCoordinator
// ---------------------------------------------------------------------------

/**
 * Tracks ambisonic decoders and applies head-tracked soundfield rotation.
 *
 * ```ts
 * import { eventBus } from '@holoscript/runtime';
 * const decoders = new AmbisonicDecoderCoordinator({ bus: eventBus });
 * decoders.start();
 *
 * // After AmbisonicsTrait attaches and the listener rotates, the decoder's
 * // rotationMatrix reflects the counter-rotated soundfield:
 * const rot = decoders.getRotationMatrix('amb_1');
 * ```
 */
export class AmbisonicDecoderCoordinator {
  private readonly bus: EventBus;
  private readonly defaultOrder: number;
  private readonly opts: AmbisonicDecoderCoordinatorOptions;

  private decoders = new Map<string, AmbisonicDecoderRecord>();
  private rotationHandlers = new Set<DecoderHandler>();
  private initHandlers = new Set<DecoderHandler>();
  private unsubscribers: Array<() => void> = [];
  private _started = false;

  constructor(options: AmbisonicDecoderCoordinatorOptions) {
    this.bus = options.bus;
    this.opts = options;
    this.defaultOrder = clampOrder(options.defaultOrder ?? 1);
    if (options.onRotationUpdated) this.rotationHandlers.add(options.onRotationUpdated);
    if (options.onDecoderInitialized) this.initHandlers.add(options.onDecoderInitialized);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  start(): void {
    if (this._started) return;
    this._started = true;

    this.unsubscribers.push(
      this.bus.on<AmbisonicsInitEvent>('ambisonics_init_decoder', (e) => this.onInit(e))
    );
    this.unsubscribers.push(
      this.bus.on<AmbisonicsRotationEvent>('ambisonics_update_rotation', (e) => this.onRotation(e))
    );
    this.unsubscribers.push(
      this.bus.on<AmbisonicsPlaybackEvent>('ambisonics_start_playback', (e) =>
        this.setPlaying(e, true)
      )
    );
    this.unsubscribers.push(
      this.bus.on<AmbisonicsPlaybackEvent>('ambisonics_stop_playback', (e) =>
        this.setPlaying(e, false)
      )
    );
    this.unsubscribers.push(
      this.bus.on<AmbisonicsPlaybackEvent>('ambisonics_pause_playback', (e) =>
        this.setPlaying(e, false)
      )
    );
    this.unsubscribers.push(
      this.bus.on<AmbisonicsPlaybackEvent>('ambisonics_cleanup', (e) => this.onCleanup(e))
    );
  }

  stop(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this._started = false;
  }

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  private onInit(e: AmbisonicsInitEvent): void {
    const nodeId = resolveNodeId(e.node);
    const order = clampOrder(e.order ?? this.defaultOrder);
    const channels = ambisonicChannelCount(order);
    const now = Date.now();
    const record: AmbisonicDecoderRecord = {
      nodeId,
      order,
      channelCount: channels,
      normalization: e.normalization ?? 'sn3d',
      channelOrdering: e.channelOrdering ?? 'acn',
      decoderType: e.decoderType ?? 'binaural',
      playing: false,
      rotationQuaternion: [0, 0, 0, 1],
      rotationMatrix: identityMatrix(channels),
      rotationUpdateCount: 0,
      initializedAt: now,
      updatedAt: now,
    };
    this.decoders.set(nodeId, record);
    this.initHandlers.forEach((h) => h(record));
  }

  private ensureRecord(nodeId: string): AmbisonicDecoderRecord {
    let record = this.decoders.get(nodeId);
    if (!record) {
      const channels = ambisonicChannelCount(this.defaultOrder);
      const now = Date.now();
      record = {
        nodeId,
        order: this.defaultOrder,
        channelCount: channels,
        normalization: 'sn3d',
        channelOrdering: 'acn',
        decoderType: 'binaural',
        playing: false,
        rotationQuaternion: [0, 0, 0, 1],
        rotationMatrix: identityMatrix(channels),
        rotationUpdateCount: 0,
        initializedAt: now,
        updatedAt: now,
      };
      this.decoders.set(nodeId, record);
    }
    return record;
  }

  /** The genuine mutation: recompute the soundfield rotation from the head pose. */
  private onRotation(e: AmbisonicsRotationEvent): void {
    const nodeId = resolveNodeId(e.node);
    const record = this.ensureRecord(nodeId);
    const q = e.rotation;
    if (!Array.isArray(q) || q.length !== 4) return;
    record.rotationQuaternion = [q[0], q[1], q[2], q[3]];
    record.rotationMatrix = ambisonicRotationMatrix(record.rotationQuaternion, record.order);
    record.rotationUpdateCount += 1;
    record.updatedAt = Date.now();
    this.rotationHandlers.forEach((h) => h(record));
  }

  private setPlaying(e: AmbisonicsPlaybackEvent, playing: boolean): void {
    const record = this.decoders.get(resolveNodeId(e.node));
    if (record) {
      record.playing = playing;
      record.updatedAt = Date.now();
    }
  }

  private onCleanup(e: AmbisonicsPlaybackEvent): void {
    this.decoders.delete(resolveNodeId(e.node));
  }

  // -------------------------------------------------------------------------
  // Query API
  // -------------------------------------------------------------------------

  getDecoder(nodeId: string): AmbisonicDecoderRecord | undefined {
    return this.decoders.get(nodeId);
  }

  getRotationMatrix(nodeId: string): Matrix | undefined {
    return this.decoders.get(nodeId)?.rotationMatrix;
  }

  getRotationUpdateCount(nodeId: string): number {
    return this.decoders.get(nodeId)?.rotationUpdateCount ?? 0;
  }

  getAllDecoders(): AmbisonicDecoderRecord[] {
    return Array.from(this.decoders.values());
  }

  decoderCount(): number {
    return this.decoders.size;
  }

  // -------------------------------------------------------------------------
  // Subscriptions
  // -------------------------------------------------------------------------

  onRotationUpdated(handler: DecoderHandler): () => void {
    this.rotationHandlers.add(handler);
    return () => this.rotationHandlers.delete(handler);
  }

  onDecoderInitialized(handler: DecoderHandler): () => void {
    this.initHandlers.add(handler);
    return () => this.initHandlers.delete(handler);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAmbisonicDecoderCoordinator(
  options: AmbisonicDecoderCoordinatorOptions
): AmbisonicDecoderCoordinator {
  const coordinator = new AmbisonicDecoderCoordinator(options);
  coordinator.start();
  return coordinator;
}
