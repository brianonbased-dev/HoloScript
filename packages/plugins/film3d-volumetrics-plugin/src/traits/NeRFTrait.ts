/** @nerf Trait - Neural Radiance Field rendering. @trait nerf */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type NeRFMethod = 'instant_ngp' | 'nerfacto' | 'tensorf' | 'mip_nerf' | 'zip_nerf';
export type NeRFQuality = 'fast' | 'balanced' | 'quality';
export type Vec3 = [number, number, number];

export interface NeRFConfig {
  method: NeRFMethod;
  resolution: number;
  nearPlane: number;
  farPlane: number;
  samplesPerRay: number;
  batchSize: number;
  enableDeformation: boolean;
  source?: string;
  modelUrl?: string;
  quality?: NeRFQuality;
  cacheFrames?: boolean;
  cacheSize?: number;
  backgroundColor?: Vec3;
}

export interface NeRFCamera {
  position?: Vec3;
  rotation?: Vec3;
  fov?: number;
}

export interface NeRFRenderRequest {
  node: HSPlusNode;
  handle: unknown;
  method: NeRFMethod;
  source: string | null;
  camera: NeRFCamera;
  resolution: number;
  quality: NeRFQuality;
  samplesPerRay: number;
  nearPlane: number;
  farPlane: number;
  batchSize: number;
  enableDeformation: boolean;
  cacheKey?: string;
}

export interface NeRFRenderedFrame {
  frame: unknown;
  renderTime?: number;
  psnr?: number;
  fps?: number;
  cacheKey?: string;
}

export interface NeRFInferenceAdapter {
  loadModel?: (config: NeRFConfig, node: HSPlusNode) => unknown | Promise<unknown>;
  renderFrame: (request: NeRFRenderRequest) => NeRFRenderedFrame | Promise<NeRFRenderedFrame>;
  destroy?: (handle: unknown, node: HSPlusNode) => void | Promise<void>;
}

interface NeRFState {
  isRendering: boolean;
  isReady: boolean;
  isLoading: boolean;
  inFlight: boolean;
  fps: number;
  trainStep: number;
  psnr: number;
  renderTime: number;
  frameCache: Map<string, unknown>;
  lastCameraHash: string;
  modelHandle: unknown;
}

type NeRFGlobal = typeof globalThis & {
  __holoscriptNeRFInference?: NeRFInferenceAdapter;
};

const defaultConfig: NeRFConfig = {
  method: 'instant_ngp',
  resolution: 512,
  nearPlane: 0.01,
  farPlane: 100,
  samplesPerRay: 64,
  batchSize: 4096,
  enableDeformation: false,
  quality: 'balanced',
  cacheFrames: true,
  cacheSize: 32,
  backgroundColor: [0, 0, 0],
};

export function registerNeRFInferenceAdapter(adapter: NeRFInferenceAdapter): () => void {
  (globalThis as NeRFGlobal).__holoscriptNeRFInference = adapter;
  return () => {
    if ((globalThis as NeRFGlobal).__holoscriptNeRFInference === adapter) {
      delete (globalThis as NeRFGlobal).__holoscriptNeRFInference;
    }
  };
}

export function clearNeRFInferenceAdapter(): void {
  delete (globalThis as NeRFGlobal).__holoscriptNeRFInference;
}

function getAdapter(ctx: TraitContext): NeRFInferenceAdapter | undefined {
  const fromContext = ctx.nerfInference;
  if (isAdapter(fromContext)) return fromContext;
  return (globalThis as NeRFGlobal).__holoscriptNeRFInference;
}

function isAdapter(value: unknown): value is NeRFInferenceAdapter {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { renderFrame?: unknown }).renderFrame === 'function'
  );
}

function modelSource(config: NeRFConfig): string | null {
  return config.modelUrl ?? config.source ?? null;
}

function cameraHash(camera: NeRFCamera): string {
  const pos = camera.position ?? [0, 0, 0];
  const rot = camera.rotation ?? [0, 0, 0];
  const q = (n: number) => Math.round(n * 100) / 100;
  return `${q(pos[0])},${q(pos[1])},${q(pos[2])},${q(rot[0])},${q(rot[1])},${q(rot[2])}`;
}

function cameraFrom(ctx: TraitContext, event?: TraitEvent): NeRFCamera {
  const payloadCamera = event?.payload?.camera;
  if (payloadCamera && typeof payloadCamera === 'object') return payloadCamera as NeRFCamera;
  const contextCamera = ctx.camera;
  if (contextCamera && typeof contextCamera === 'object') return contextCamera as NeRFCamera;
  return { position: [0, 0, 0], rotation: [0, 0, 0], fov: 60 };
}

function emitError(ctx: TraitContext, node: HSPlusNode, error: string): void {
  ctx.emit?.('nerf_error', { node, error });
  ctx.emit?.('nerf:error', { node, error });
}

function markLoaded(
  node: HSPlusNode,
  state: NeRFState,
  ctx: TraitContext,
  handle: unknown,
  config: NeRFConfig
): void {
  state.isLoading = false;
  state.isReady = true;
  state.modelHandle = handle;
  ctx.emit?.('nerf_model_loaded', {
    node,
    handle,
    method: config.method,
    source: modelSource(config),
  });
  ctx.emit?.('on_nerf_ready', { node });
  ctx.emit?.('nerf:loaded', { method: config.method, source: modelSource(config), ready: true });
}

function loadModel(
  node: HSPlusNode,
  state: NeRFState,
  config: NeRFConfig,
  ctx: TraitContext
): void {
  const source = modelSource(config);
  const adapter = getAdapter(ctx);
  if (!source && !adapter?.loadModel) {
    state.isReady = true;
    ctx.emit?.('nerf:loaded', { method: config.method, ready: true, source: null });
    return;
  }

  state.isLoading = true;
  ctx.emit?.('nerf_load', {
    node,
    url: source,
    method: config.method,
    backgroundColor: config.backgroundColor ?? defaultConfig.backgroundColor,
  });

  if (!adapter?.loadModel) return;

  Promise.resolve(adapter.loadModel(config, node))
    .then((handle) => markLoaded(node, state, ctx, handle, config))
    .catch((err) => {
      state.isLoading = false;
      const error = err instanceof Error ? err.message : String(err);
      ctx.emit?.('nerf_load_error', { node, error });
      ctx.emit?.('on_nerf_error', { node, error });
      ctx.emit?.('nerf:error', { node, error });
    });
}

function applyRenderedFrame(
  node: HSPlusNode,
  state: NeRFState,
  config: NeRFConfig,
  ctx: TraitContext,
  result: NeRFRenderedFrame,
  fallbackCacheKey?: string
): void {
  const cacheKey = result.cacheKey ?? fallbackCacheKey;
  state.inFlight = false;
  state.renderTime = result.renderTime ?? state.renderTime;
  state.psnr = result.psnr ?? state.psnr;
  state.fps = result.fps ?? (state.renderTime > 0 ? 1000 / state.renderTime : state.fps);

  if (config.cacheFrames !== false && cacheKey) {
    const cacheSize = Math.max(1, Math.floor(config.cacheSize ?? defaultConfig.cacheSize ?? 32));
    if (state.frameCache.size >= cacheSize) {
      const firstKey = state.frameCache.keys().next().value;
      if (firstKey) state.frameCache.delete(firstKey);
    }
    state.frameCache.set(cacheKey, result.frame);
  }

  ctx.emit?.('nerf_frame_rendered', {
    node,
    frame: result.frame,
    renderTime: state.renderTime,
    psnr: state.psnr,
    fps: state.fps,
    cacheKey,
  });
  ctx.emit?.('nerf:frame', {
    frame: result.frame,
    renderTime: state.renderTime,
    psnr: state.psnr,
    fps: state.fps,
    cacheKey,
  });
}

function requestRender(
  node: HSPlusNode,
  state: NeRFState,
  config: NeRFConfig,
  ctx: TraitContext,
  event?: TraitEvent
): void {
  const camera = cameraFrom(ctx, event);
  const hash = cameraHash(camera);
  state.trainStep += 1;
  state.lastCameraHash = hash;

  if (config.cacheFrames !== false && state.frameCache.has(hash)) {
    ctx.emit?.('nerf_use_cached', { node, cacheKey: hash });
    ctx.emit?.('nerf:cached', { cacheKey: hash });
    return;
  }

  const request: NeRFRenderRequest = {
    node,
    handle: state.modelHandle,
    method: config.method,
    source: modelSource(config),
    camera,
    resolution: config.resolution,
    quality: config.quality ?? 'balanced',
    samplesPerRay: config.samplesPerRay,
    nearPlane: config.nearPlane,
    farPlane: config.farPlane,
    batchSize: config.batchSize,
    enableDeformation: config.enableDeformation,
    cacheKey: config.cacheFrames === false ? undefined : hash,
  };

  const adapter = getAdapter(ctx);
  if (!adapter) {
    if (!state.isReady) return;
    ctx.emit?.('nerf_render', request);
    ctx.emit?.('nerf:rendering', { method: config.method, cacheKey: request.cacheKey });
    return;
  }
  if (state.inFlight) return;

  state.inFlight = true;
  ctx.emit?.('nerf:rendering', { method: config.method, cacheKey: request.cacheKey });
  Promise.resolve(adapter.renderFrame(request))
    .then((result) => applyRenderedFrame(node, state, config, ctx, result, request.cacheKey))
    .catch((err) => {
      state.inFlight = false;
      const error = err instanceof Error ? err.message : String(err);
      emitError(ctx, node, error);
    });
}

export function createNeRFHandler(): TraitHandler<NeRFConfig> {
  return {
    name: 'nerf',
    defaultConfig,
    onAttach(n: HSPlusNode, c: NeRFConfig, ctx: TraitContext) {
      const state: NeRFState = {
        isRendering: false,
        isReady: false,
        isLoading: false,
        inFlight: false,
        fps: 0,
        trainStep: 0,
        psnr: 0,
        renderTime: 0,
        frameCache: new Map(),
        lastCameraHash: '',
        modelHandle: null,
      };
      n.__nerfState = state;
      loadModel(n, state, { ...defaultConfig, ...c }, ctx);
    },
    onDetach(n: HSPlusNode, _c: NeRFConfig, ctx: TraitContext) {
      const state = n.__nerfState as NeRFState | undefined;
      const adapter = getAdapter(ctx);
      if (state?.modelHandle && adapter?.destroy) {
        Promise.resolve(adapter.destroy(state.modelHandle, n)).catch((err) => {
          const error = err instanceof Error ? err.message : String(err);
          emitError(ctx, n, error);
        });
      }
      if (state?.modelHandle) ctx.emit?.('nerf_destroy', { node: n });
      delete n.__nerfState;
      ctx.emit?.('nerf:unloaded');
    },
    onUpdate(n: HSPlusNode, c: NeRFConfig, ctx: TraitContext, _d: number) {
      const state = n.__nerfState as NeRFState | undefined;
      if (!state?.isRendering || state.isLoading) return;
      const camera = cameraFrom(ctx);
      const hash = cameraHash(camera);
      if (hash === state.lastCameraHash) return;
      requestRender(n, state, { ...defaultConfig, ...c }, ctx);
    },
    onEvent(n: HSPlusNode, c: NeRFConfig, ctx: TraitContext, e: TraitEvent) {
      const state = n.__nerfState as NeRFState | undefined;
      if (!state) return;
      const config = { ...defaultConfig, ...c };
      if (e.type === 'nerf:render' || e.type === 'nerf_render_request') {
        state.isRendering = true;
        requestRender(n, state, config, ctx, e);
      } else if (e.type === 'nerf:stop' || e.type === 'nerf_stop') {
        state.isRendering = false;
        ctx.emit?.('nerf:stopped', { steps: state.trainStep, psnr: state.psnr });
      } else if (e.type === 'nerf_model_loaded') {
        markLoaded(n, state, ctx, e.handle, config);
      } else if (e.type === 'nerf_load_error') {
        state.isLoading = false;
        emitError(ctx, n, String(e.error ?? e.payload?.error ?? 'NeRF load failed'));
      } else if (e.type === 'nerf_frame_rendered') {
        const result = (e.payload ?? e) as unknown as NeRFRenderedFrame;
        applyRenderedFrame(n, state, config, ctx, result, e.cacheKey as string);
      } else if (e.type === 'nerf_clear_cache') {
        state.frameCache.clear();
      } else if (e.type === 'nerf_reload') {
        state.isReady = false;
        state.frameCache.clear();
        loadModel(n, state, config, ctx);
      } else if (e.type === 'nerf_query') {
        ctx.emit?.('nerf_info', {
          queryId: e.queryId ?? e.payload?.queryId,
          node: n,
          isReady: state.isReady,
          isLoading: state.isLoading,
          isRendering: state.isRendering,
          renderTime: state.renderTime,
          cachedFrames: state.frameCache.size,
          trainStep: state.trainStep,
          psnr: state.psnr,
          fps: state.fps,
        });
      }
    },
  };
}
