/**
 * VolumetricRenderUpdateConsumer — Runtime bridge from VolumetricTrait events
 * to renderer draw-order + opacity state.
 *
 * Subscribes to `volumetric_render_update` emitted by the core trait
 * (packages/core/src/traits/VolumetricTrait.ts) and maintains the latest
 * sorted index array + opacity per node.
 *
 * @see PointCloudEventConsumer.ts for the sibling event-consumer pattern.
 */

export interface VolumetricEventBus {
  on<T = unknown>(event: string, callback: (payload: T) => void): () => void;
  emit<T = unknown>(event: string, payload: T): void;
}

export interface VolumetricRenderUpdatePayload {
  node: unknown;
  indices: Uint32Array | null;
  opacity: number;
}

export interface VolumetricRenderState {
  nodeId: string;
  indices: Uint32Array | null;
  opacity: number;
  updatedAt: number;
}

export interface VolumetricConsumerOptions {
  bus: VolumetricEventBus;
}

export class VolumetricRenderUpdateConsumer {
  private readonly bus: VolumetricEventBus;
  private readonly states = new Map<string, VolumetricRenderState>();
  private unsubscribers: Array<() => void> = [];
  private started = false;

  constructor(options: VolumetricConsumerOptions) {
    this.bus = options.bus;
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    this.unsubscribers = [
      this.bus.on<VolumetricRenderUpdatePayload>('volumetric_render_update', (payload) => {
        this.handleUpdate(payload);
      }),
    ];
  }

  stop(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
    this.started = false;
  }

  getState(node: unknown): VolumetricRenderState | undefined {
    return this.states.get(nodeIdFor(node));
  }

  getAllStates(): VolumetricRenderState[] {
    return Array.from(this.states.values());
  }

  clear(): void {
    this.states.clear();
  }

  private handleUpdate(payload: VolumetricRenderUpdatePayload): void {
    const nodeId = nodeIdFor(payload.node);
    this.states.set(nodeId, {
      nodeId,
      indices: payload.indices,
      opacity: payload.opacity,
      updatedAt: Date.now(),
    });
  }
}

export function createVolumetricRenderUpdateConsumer(
  options: VolumetricConsumerOptions
): VolumetricRenderUpdateConsumer {
  const consumer = new VolumetricRenderUpdateConsumer(options);
  consumer.start();
  return consumer;
}

export function createWindowVolumetricRenderUpdateConsumer(
  options: Omit<VolumetricConsumerOptions, 'bus'> & { target?: Window }
): VolumetricRenderUpdateConsumer {
  const target = options.target ?? globalThis.window;
  const bus: VolumetricEventBus = {
    on(event, callback) {
      if (!target) return () => {};
      const handler = (evt: Event) => callback((evt as CustomEvent).detail);
      target.addEventListener(`holoscript:${event}`, handler);
      return () => target.removeEventListener(`holoscript:${event}`, handler);
    },
    emit(event, payload) {
      target?.dispatchEvent(new CustomEvent(`holoscript:${event}`, { detail: payload }));
    },
  };
  return createVolumetricRenderUpdateConsumer({ ...options, bus });
}

/**
 * Reorder a flat Float32Array by an index mapping.
 *
 * @param src — source array (length = count * floatsPerEntry)
 * @param indices — draw-order indices (length = count)
 * @param floatsPerEntry — e.g. 16 for a 4x4 matrix, 4 for an RGBA color
 */
export function reorderByIndices(
  src: Float32Array,
  indices: Uint32Array,
  floatsPerEntry: number
): Float32Array {
  const count = indices.length;
  const out = new Float32Array(src.length);
  for (let i = 0; i < count; i++) {
    const srcIdx = indices[i];
    for (let j = 0; j < floatsPerEntry; j++) {
      out[i * floatsPerEntry + j] = src[srcIdx * floatsPerEntry + j];
    }
  }
  return out;
}

function nodeIdFor(node: unknown): string {
  if (typeof node === 'string') return node;
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (typeof record.id === 'string') return record.id;
    if (typeof record.name === 'string') return record.name;
  }
  return 'unknown-node';
}
