/**
 * RealityKitMeshConsumer — Runtime bridge that listens for `rkMesh:tick`
 * and reconciles anchor/face counts into renderer-visible state.
 *
 * Consumes events from the core RealityKitMeshTrait and exposes reactive
 * state for visionOS/RealityKit mesh anchor surfaces (occlusion, physics,
 * semantic classification).
 *
 * @see packages/core/src/traits/RealityKitMeshTrait.ts
 */

export interface RkMeshTickPayload {
  anchorCount: number;
  totalFaces: number;
}

export interface RkMeshInitPayload {
  classification: boolean;
  physics: boolean;
}

export interface RkMeshAnchorPayload {
  id: string;
  classification: string;
}

export interface RealityKitMeshEventBus {
  on<T = unknown>(event: string, callback: (payload: T) => void): () => void;
  emit<T = unknown>(event: string, payload: T): void;
}

export interface RealityKitMeshState {
  anchorCount: number;
  totalFaces: number;
  isActive: boolean;
  classificationEnabled: boolean;
  physicsEnabled: boolean;
  updatedAt: number;
}

export interface RealityKitMeshConsumerOptions {
  bus: RealityKitMeshEventBus;
}

export class RealityKitMeshConsumer {
  private readonly bus: RealityKitMeshEventBus;
  private state: RealityKitMeshState;
  private unsubscribers: Array<() => void> = [];
  private started = false;

  constructor(options: RealityKitMeshConsumerOptions) {
    this.bus = options.bus;
    this.state = {
      anchorCount: 0,
      totalFaces: 0,
      isActive: false,
      classificationEnabled: false,
      physicsEnabled: false,
      updatedAt: 0,
    };
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    this.unsubscribers = [
      this.bus.on<RkMeshInitPayload>('rkMesh:init', (payload) => {
        this.state.classificationEnabled = payload.classification;
        this.state.physicsEnabled = payload.physics;
        this.state.updatedAt = Date.now();
      }),
      this.bus.on<RkMeshTickPayload>('rkMesh:tick', (payload) => {
        this.state.anchorCount = payload.anchorCount;
        this.state.totalFaces = payload.totalFaces;
        this.state.isActive = true;
        this.state.updatedAt = Date.now();
      }),
      this.bus.on<void>('rkMesh:cleanup', () => {
        this.state.isActive = false;
        this.state.anchorCount = 0;
        this.state.totalFaces = 0;
        this.state.updatedAt = Date.now();
      }),
    ];
  }

  stop(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
    this.started = false;
  }

  getState(): Readonly<RealityKitMeshState> {
    return { ...this.state };
  }

  reset(): void {
    this.state = {
      anchorCount: 0,
      totalFaces: 0,
      isActive: false,
      classificationEnabled: false,
      physicsEnabled: false,
      updatedAt: 0,
    };
  }
}

export function createRealityKitMeshConsumer(
  options: RealityKitMeshConsumerOptions
): RealityKitMeshConsumer {
  const consumer = new RealityKitMeshConsumer(options);
  consumer.start();
  return consumer;
}

export function createWindowRealityKitMeshConsumer(
  options: Omit<RealityKitMeshConsumerOptions, 'bus'> & { target?: Window }
): RealityKitMeshConsumer {
  const target = options.target ?? globalThis.window;
  const bus: RealityKitMeshEventBus = {
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
  return createRealityKitMeshConsumer({ ...options, bus });
}
