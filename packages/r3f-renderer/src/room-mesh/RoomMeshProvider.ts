/**
 * RoomMeshProvider — Runtime bridge that listens for `room_mesh_request_update`
 * and fulfills it via a registered mesh-provider callback.
 *
 * When the core RoomMeshTrait emits `room_mesh_request_update`, this provider
 * calls the registered callback to generate mesh data, then emits
 * `mesh_block_update` (and optionally `room_boundary_detected`) back to the
 * trait so node state advances.
 *
 * @see packages/core/src/traits/RoomMeshTrait.ts
 * @see PointCloudEventConsumer.ts for the sibling event-consumer pattern.
 */

export interface MeshBlock {
  id: string;
  vertices: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  semanticLabel?: 'floor' | 'wall' | 'ceiling' | 'furniture' | 'unknown';
  vertexCount: number;
  triangleCount: number;
  lastUpdated: number;
}

export interface RoomBounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface MeshProviderResult {
  blocks: MeshBlock[];
  bounds?: RoomBounds;
  progress?: number;
  complete?: boolean;
}

export type MeshProviderCallback = (
  node: unknown
) => MeshProviderResult | Promise<MeshProviderResult>;

export interface RoomMeshEventBus {
  on<T = unknown>(event: string, callback: (payload: T) => void): () => void;
  emit<T = unknown>(event: string, payload: T): void;
}

export interface RoomMeshProviderOptions {
  bus: RoomMeshEventBus;
  provider: MeshProviderCallback;
}

export class RoomMeshProvider {
  private readonly bus: RoomMeshEventBus;
  private readonly provider: MeshProviderCallback;
  private unsubscribers: Array<() => void> = [];
  private started = false;
  private readonly callLog = new Map<string, number>();

  constructor(options: RoomMeshProviderOptions) {
    this.bus = options.bus;
    this.provider = options.provider;
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    this.unsubscribers = [
      this.bus.on<{ node: unknown }>('room_mesh_request_update', (payload) => {
        void this.handleRequest(payload.node);
      }),
    ];
  }

  stop(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
    this.started = false;
  }

  getCallCount(nodeId: string): number {
    return this.callLog.get(nodeId) ?? 0;
  }

  clearLog(): void {
    this.callLog.clear();
  }

  private async handleRequest(node: unknown): Promise<void> {
    const nodeId = this.nodeIdFor(node);
    this.callLog.set(nodeId, (this.callLog.get(nodeId) ?? 0) + 1);

    try {
      const result = await this.provider(node);

      for (const block of result.blocks) {
        this.bus.emit('mesh_block_update', { node, block });
      }

      if (result.bounds) {
        this.bus.emit('room_boundary_detected', { node, bounds: result.bounds });
      }

      if (typeof result.progress === 'number') {
        this.bus.emit('room_mesh_scan_progress', { node, progress: result.progress });
      }

      if (result.complete) {
        this.bus.emit('room_mesh_complete', { node });
      }
    } catch (error) {
      this.bus.emit('room_mesh_provider_error', {
        node,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private nodeIdFor(node: unknown): string {
    if (typeof node === 'string') return node;
    if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>;
      if (typeof record.id === 'string') return record.id;
      if (typeof record.name === 'string') return record.name;
    }
    return 'unknown-node';
  }
}

export function createRoomMeshProvider(options: RoomMeshProviderOptions): RoomMeshProvider {
  const provider = new RoomMeshProvider(options);
  provider.start();
  return provider;
}

export function createWindowRoomMeshProvider(
  options: Omit<RoomMeshProviderOptions, 'bus'> & { target?: Window }
): RoomMeshProvider {
  const target = options.target ?? globalThis.window;
  const bus: RoomMeshEventBus = {
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
  return createRoomMeshProvider({ ...options, bus });
}
