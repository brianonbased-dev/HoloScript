/**
 * SceneReconstructionConsumer — Runtime bridge that listens for
 * `reconstruction:mesh_update` and maintains the latest mesh + progress state.
 *
 * Ingests events from the core SceneReconstructionTrait and exposes
 * reactive state for renderer components (progress bar, mesh face count,
 * semantic labels, completion status).
 *
 * @see packages/core/src/traits/SceneReconstructionTrait.ts
 */

export interface ReconstructionMeshUpdatePayload {
  faceCount: number;
  progress: number;
}

export interface ReconstructionInitPayload {
  mode: string;
}

export interface ReconstructionCompletePayload {
  faceCount: number;
}

export interface ReconstructionEventBus {
  on<T = unknown>(event: string, callback: (payload: T) => void): () => void;
  emit<T = unknown>(event: string, payload: T): void;
}

export interface ReconstructionState {
  faceCount: number;
  progress: number;
  isScanning: boolean;
  isComplete: boolean;
  mode: string;
  updatedAt: number;
}

export interface SceneReconstructionConsumerOptions {
  bus: ReconstructionEventBus;
}

export class SceneReconstructionConsumer {
  private readonly bus: ReconstructionEventBus;
  private state: ReconstructionState;
  private unsubscribers: Array<() => void> = [];
  private started = false;

  constructor(options: SceneReconstructionConsumerOptions) {
    this.bus = options.bus;
    this.state = {
      faceCount: 0,
      progress: 0,
      isScanning: false,
      isComplete: false,
      mode: '',
      updatedAt: 0,
    };
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    this.unsubscribers = [
      this.bus.on<ReconstructionInitPayload>('reconstruction:init', (payload) => {
        this.state.mode = payload.mode;
        this.state.isComplete = false;
        this.state.updatedAt = Date.now();
      }),
      this.bus.on<ReconstructionMeshUpdatePayload>('reconstruction:mesh_update', (payload) => {
        this.state.faceCount = payload.faceCount;
        this.state.progress = payload.progress;
        this.state.isScanning = true;
        this.state.updatedAt = Date.now();
      }),
      this.bus.on<void>('reconstruction:stop', () => {
        this.state.isScanning = false;
        this.state.updatedAt = Date.now();
      }),
      this.bus.on<ReconstructionCompletePayload>('reconstruction:complete', (payload) => {
        this.state.faceCount = payload.faceCount;
        this.state.progress = 1;
        this.state.isScanning = false;
        this.state.isComplete = true;
        this.state.updatedAt = Date.now();
      }),
    ];
  }

  stop(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
    this.started = false;
  }

  getState(): Readonly<ReconstructionState> {
    return { ...this.state };
  }

  reset(): void {
    this.state = {
      faceCount: 0,
      progress: 0,
      isScanning: false,
      isComplete: false,
      mode: '',
      updatedAt: 0,
    };
  }
}

export function createSceneReconstructionConsumer(
  options: SceneReconstructionConsumerOptions
): SceneReconstructionConsumer {
  const consumer = new SceneReconstructionConsumer(options);
  consumer.start();
  return consumer;
}

export function createWindowSceneReconstructionConsumer(
  options: Omit<SceneReconstructionConsumerOptions, 'bus'> & { target?: Window }
): SceneReconstructionConsumer {
  const target = options.target ?? globalThis.window;
  const bus: ReconstructionEventBus = {
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
  return createSceneReconstructionConsumer({ ...options, bus });
}
