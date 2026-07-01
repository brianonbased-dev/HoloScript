/**
 * useShaderPreview - browser shader preview backed by Three.js when WebGL is
 * available, with a deterministic SVG frame fallback for tests and non-WebGL
 * browsers.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export interface FrameResult {
  data_uri: string | null;
  png_byte_length: number;
  frame_time_ms: number;
  render_time_ms: number;
  readback_time_ms: number;
  encode_time_ms: number;
  within_budget: boolean;
  frame_number: number;
  width: number;
  height: number;
}

export interface PipelineTimings {
  init_device_ms: number;
  create_pipeline_ms: number;
  total_init_ms: number;
}

export interface BenchmarkResult {
  frame_count: number;
  total_time_ms: number;
  avg_frame_ms: number;
  min_frame_ms: number;
  max_frame_ms: number;
  p50_frame_ms: number;
  p95_frame_ms: number;
  p99_frame_ms: number;
  avg_render_ms: number;
  avg_readback_ms: number;
  avg_encode_ms: number;
  frames_in_budget: number;
  budget_hit_rate: number;
  effective_fps: number;
  target_fps: number;
  resolution: [number, number];
}

export type ShaderPreviewBackend = 'three-webgl' | 'svg-fallback';

export interface ShaderPreviewState {
  /** Whether the browser preview pipeline is initialized and ready to render. */
  ready: boolean;
  /** Whether the preview is currently initializing. */
  initializing: boolean;
  /** Current frame data URI for display in an img tag. */
  frameDataUri: string | null;
  /** Latest frame timing metrics. */
  frameTiming: FrameResult | null;
  /** Pipeline initialization timings. */
  initTimings: PipelineTimings | null;
  /** Error message if something went wrong. */
  error: string | null;
  /** Kept for compatibility with older callers; the primary path is browser mode. */
  isTauri: boolean;
  /** Active browser renderer backend. */
  backend: ShaderPreviewBackend;
  /** Running FPS counter. */
  fps: number;
}

export interface ShaderPreviewActions {
  /** Initialize the browser preview pipeline. */
  init: (width?: number, height?: number, shaderCode?: string) => Promise<void>;
  /** Start the render loop. */
  start: () => void;
  /** Stop the render loop. */
  stop: () => void;
  /** Hot-reload shader source. */
  updateShader: (shaderCode: string) => Promise<void>;
  /** Resize the render target. */
  resize: (width: number, height: number) => Promise<void>;
  /** Run benchmark and return results. */
  benchmark: (frameCount?: number) => Promise<BenchmarkResult | null>;
  /** Destroy the pipeline and free browser resources. */
  destroy: () => Promise<void>;
}

interface BrowserPreviewEngine {
  backend: ShaderPreviewBackend;
  width: number;
  height: number;
  canvas: HTMLCanvasElement | null;
  renderer: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  mesh: THREE.Mesh | null;
  material: THREE.ShaderMaterial | null;
  shaderCode: string;
}

const DEFAULT_VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vNormal;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const DEFAULT_FRAGMENT_SHADER = `
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
varying vec2 vUv;
varying vec3 vNormal;

void main() {
  float rim = pow(1.0 - max(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0), 2.0);
  float wave = 0.5 + 0.5 * sin((vUv.x + vUv.y) * 16.0 + uTime * 1.6);
  vec3 base = mix(vec3(0.10, 0.35, 0.95), vec3(0.25, 0.95, 0.72), wave);
  vec3 pointer = vec3(uMouse.x, uMouse.y, 1.0 - uMouse.x);
  gl_FragColor = vec4(base + pointer * rim * 0.45, 1.0);
}`;

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function hasDom(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function hasWebGlRuntime(): boolean {
  return typeof WebGLRenderingContext !== 'undefined';
}

function normalizeFragmentShader(shaderCode?: string): string {
  const source = shaderCode?.trim();
  if (!source) return DEFAULT_FRAGMENT_SHADER;

  // The browser preview uses Three/WebGL GLSL. WGSL/HoloScript snippets still
  // get a live placeholder frame instead of throwing away the whole preview.
  if (source.includes('@fragment') || source.includes('fn ')) {
    return DEFAULT_FRAGMENT_SHADER;
  }

  if (!/void\s+main\s*\(/.test(source)) {
    return DEFAULT_FRAGMENT_SHADER;
  }

  return source;
}

function createFallbackEngine(width: number, height: number, shaderCode = ''): BrowserPreviewEngine {
  return {
    backend: 'svg-fallback',
    width,
    height,
    canvas: null,
    renderer: null,
    scene: null,
    camera: null,
    mesh: null,
    material: null,
    shaderCode,
  };
}

function createBrowserPreviewEngine(
  width: number,
  height: number,
  shaderCode = ''
): BrowserPreviewEngine {
  if (!hasDom() || !hasWebGlRuntime()) {
    return createFallbackEngine(width, height, shaderCode);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  try {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x050814, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / Math.max(height, 1), 0.1, 100);
    camera.position.z = 3;

    const material = new THREE.ShaderMaterial({
      vertexShader: DEFAULT_VERTEX_SHADER,
      fragmentShader: normalizeFragmentShader(shaderCode),
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(width, height) },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      },
      transparent: true,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), material);
    scene.add(mesh);
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    const key = new THREE.PointLight(0x9ee7ff, 1.35);
    key.position.set(4, 3, 4);
    scene.add(key);

    return {
      backend: 'three-webgl',
      width,
      height,
      canvas,
      renderer,
      scene,
      camera,
      mesh,
      material,
      shaderCode,
    };
  } catch {
    return createFallbackEngine(width, height, shaderCode);
  }
}

function disposeEngine(engine: BrowserPreviewEngine | null): void {
  if (!engine) return;

  engine.renderer?.dispose();
  engine.material?.dispose();
  engine.mesh?.geometry?.dispose();
  engine.scene?.clear();
}

function setEngineSize(engine: BrowserPreviewEngine, width: number, height: number): void {
  engine.width = width;
  engine.height = height;
  engine.canvas && (engine.canvas.width = width);
  engine.canvas && (engine.canvas.height = height);
  engine.renderer?.setSize(width, height, false);

  if (engine.camera) {
    engine.camera.aspect = width / Math.max(height, 1);
    engine.camera.updateProjectionMatrix();
  }

  const resolution = engine.material?.uniforms.uResolution?.value;
  if (resolution instanceof THREE.Vector2) {
    resolution.set(width, height);
  }
}

function setEngineShader(engine: BrowserPreviewEngine, shaderCode: string): void {
  engine.shaderCode = shaderCode;
  if (!engine.material) return;

  engine.material.fragmentShader = normalizeFragmentShader(shaderCode);
  engine.material.needsUpdate = true;
}

function fallbackDataUri(width: number, height: number, frameNumber: number): string {
  const hue = (frameNumber * 23) % 360;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<defs>',
    `<linearGradient id="g" x1="0" x2="1" y1="0" y2="1">`,
    `<stop offset="0" stop-color="hsl(${hue}, 90%, 48%)"/>`,
    `<stop offset="1" stop-color="hsl(${(hue + 120) % 360}, 80%, 54%)"/>`,
    '</linearGradient>',
    '</defs>',
    '<rect width="100%" height="100%" fill="#050814"/>',
    `<circle cx="${width * 0.5}" cy="${height * 0.48}" r="${Math.min(width, height) * 0.28}" fill="url(#g)" opacity="0.92"/>`,
    `<circle cx="${width * 0.58}" cy="${height * 0.38}" r="${Math.min(width, height) * 0.08}" fill="#ffffff" opacity="0.24"/>`,
    `<text x="${width / 2}" y="${height - 24}" fill="#c7d2fe" text-anchor="middle" font-family="monospace" font-size="13">browser shader preview</text>`,
    '</svg>',
  ].join('');

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function renderFrame(
  engine: BrowserPreviewEngine,
  targetFps: number,
  frameNumber: number,
  mouse: { x: number; y: number }
): FrameResult {
  const start = nowMs();
  const width = engine.width;
  const height = engine.height;
  let renderTime = 0;
  let readbackTime = 0;
  let encodeTime = 0;
  let dataUri: string | null = null;

  if (engine.renderer && engine.scene && engine.camera && engine.material) {
    const renderStart = nowMs();
    try {
      engine.material.uniforms.uTime.value = frameNumber / Math.max(targetFps, 1);
      engine.material.uniforms.uMouse.value.set(mouse.x, mouse.y);
      if (engine.mesh) {
        engine.mesh.rotation.y = frameNumber * 0.012;
        engine.mesh.rotation.x = Math.sin(frameNumber * 0.01) * 0.12;
      }
      engine.renderer.render(engine.scene, engine.camera);
      renderTime = nowMs() - renderStart;

      const readbackStart = nowMs();
      dataUri = engine.canvas?.toDataURL('image/png') ?? null;
      readbackTime = nowMs() - readbackStart;
    } catch {
      engine.backend = 'svg-fallback';
      renderTime = nowMs() - renderStart;
    }
  }

  if (!dataUri) {
    const encodeStart = nowMs();
    dataUri = fallbackDataUri(width, height, frameNumber);
    encodeTime = nowMs() - encodeStart;
  }

  const frameTime = Math.max(nowMs() - start, 0.001);
  const frameBudget = 1000 / Math.max(targetFps, 1);

  return {
    data_uri: dataUri,
    png_byte_length: dataUri.length,
    frame_time_ms: frameTime,
    render_time_ms: renderTime,
    readback_time_ms: readbackTime,
    encode_time_ms: encodeTime,
    within_budget: frameTime <= frameBudget,
    frame_number: frameNumber,
    width,
    height,
  };
}

function scheduleFrame(callback: FrameRequestCallback): number {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(callback);
  }

  return globalThis.setTimeout(() => callback(nowMs()), 16) as unknown as number;
}

function cancelScheduledFrame(id: number): void {
  if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(id);
    return;
  }

  globalThis.clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
}

function summarizeBenchmark(
  frames: FrameResult[],
  totalTime: number,
  targetFps: number
): BenchmarkResult {
  const sorted = [...frames].sort((a, b) => a.frame_time_ms - b.frame_time_ms);
  const at = (ratio: number) =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * ratio)))]
      ?.frame_time_ms ?? 0;
  const sum = (selector: (frame: FrameResult) => number) =>
    frames.reduce((acc, frame) => acc + selector(frame), 0);
  const frameCount = Math.max(frames.length, 1);
  const resolution: [number, number] = [frames[0]?.width ?? 0, frames[0]?.height ?? 0];

  return {
    frame_count: frames.length,
    total_time_ms: totalTime,
    avg_frame_ms: sum((frame) => frame.frame_time_ms) / frameCount,
    min_frame_ms: sorted[0]?.frame_time_ms ?? 0,
    max_frame_ms: sorted[sorted.length - 1]?.frame_time_ms ?? 0,
    p50_frame_ms: at(0.5),
    p95_frame_ms: at(0.95),
    p99_frame_ms: at(0.99),
    avg_render_ms: sum((frame) => frame.render_time_ms) / frameCount,
    avg_readback_ms: sum((frame) => frame.readback_time_ms) / frameCount,
    avg_encode_ms: sum((frame) => frame.encode_time_ms) / frameCount,
    frames_in_budget: frames.filter((frame) => frame.within_budget).length,
    budget_hit_rate: frames.filter((frame) => frame.within_budget).length / frameCount,
    effective_fps: totalTime > 0 ? (frames.length / totalTime) * 1000 : 0,
    target_fps: targetFps,
    resolution,
  };
}

/**
 * Hook for managing the browser shader preview pipeline.
 *
 * @param targetFps - Target frame rate (default: 30)
 */
export function useShaderPreview(
  targetFps: number = 30
): [ShaderPreviewState, ShaderPreviewActions] {
  const [state, setState] = useState<ShaderPreviewState>({
    ready: false,
    initializing: false,
    frameDataUri: null,
    frameTiming: null,
    initTimings: null,
    error: null,
    isTauri: false,
    backend: 'svg-fallback',
    fps: 0,
  });

  const engineRef = useRef<BrowserPreviewEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const lastTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const fpsFrameCountRef = useRef(0);
  const fpsTimerRef = useRef(0);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });

  const updateFps = useCallback(() => {
    const now = nowMs();
    fpsFrameCountRef.current++;
    if (now - fpsTimerRef.current >= 1000) {
      setState((s) => ({ ...s, fps: fpsFrameCountRef.current }));
      fpsFrameCountRef.current = 0;
      fpsTimerRef.current = now;
    }
  }, []);

  const renderAndStoreFrame = useCallback((): FrameResult | null => {
    const engine = engineRef.current;
    if (!engine) return null;

    const frame = renderFrame(engine, targetFps, frameCountRef.current++, mouseRef.current);
    setState((s) => ({
      ...s,
      frameDataUri: frame.data_uri,
      frameTiming: frame,
      backend: engine.backend,
      error: null,
    }));
    updateFps();
    return frame;
  }, [targetFps, updateFps]);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current !== null) {
      cancelScheduledFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const frameLoop = useCallback(() => {
    if (!runningRef.current) return;

    const now = nowMs();
    const elapsed = now - lastTimeRef.current;
    const frameInterval = 1000 / Math.max(targetFps, 1);

    if (elapsed >= frameInterval) {
      lastTimeRef.current = now - (elapsed % frameInterval);
      renderAndStoreFrame();
    }

    if (runningRef.current) {
      rafRef.current = scheduleFrame(frameLoop);
    }
  }, [renderAndStoreFrame, targetFps]);

  const init = useCallback(
    async (width = 1280, height = 720, shaderCode?: string) => {
      stop();
      disposeEngine(engineRef.current);
      setState((s) => ({ ...s, initializing: true, error: null }));

      const start = nowMs();
      const engine = createBrowserPreviewEngine(width, height, shaderCode ?? '');
      const createdAt = nowMs();
      engineRef.current = engine;
      frameCountRef.current = 0;
      fpsFrameCountRef.current = 0;
      fpsTimerRef.current = nowMs();

      const frame = renderFrame(engine, targetFps, frameCountRef.current++, mouseRef.current);
      const total = nowMs() - start;

      setState((s) => ({
        ...s,
        ready: true,
        initializing: false,
        frameDataUri: frame.data_uri,
        frameTiming: frame,
        initTimings: {
          init_device_ms: 0,
          create_pipeline_ms: createdAt - start,
          total_init_ms: total,
        },
        error: null,
        isTauri: false,
        backend: engine.backend,
      }));
    },
    [stop, targetFps]
  );

  const start = useCallback(() => {
    if (!engineRef.current) {
      setState((s) => ({ ...s, error: 'Preview is not initialized yet.' }));
      return;
    }

    if (runningRef.current) return;
    runningRef.current = true;
    lastTimeRef.current = nowMs();
    fpsTimerRef.current = nowMs();
    fpsFrameCountRef.current = 0;
    rafRef.current = scheduleFrame(frameLoop);
  }, [frameLoop]);

  const updateShader = useCallback(
    async (shaderCode: string) => {
      const engine = engineRef.current;
      if (!engine) {
        await init(1280, 720, shaderCode);
        return;
      }

      try {
        setEngineShader(engine, shaderCode);
        renderAndStoreFrame();
      } catch (err) {
        setState((s) => ({ ...s, error: `Shader update failed: ${err}` }));
      }
    },
    [init, renderAndStoreFrame]
  );

  const resize = useCallback(
    async (width: number, height: number) => {
      const engine = engineRef.current;
      if (!engine) return;

      try {
        setEngineSize(engine, width, height);
        renderAndStoreFrame();
      } catch (err) {
        setState((s) => ({ ...s, error: `Resize failed: ${err}` }));
      }
    },
    [renderAndStoreFrame]
  );

  const benchmark = useCallback(
    async (frameCount = 90): Promise<BenchmarkResult | null> => {
      const engine = engineRef.current;
      if (!engine) return null;

      const startTime = nowMs();
      const frames: FrameResult[] = [];
      for (let i = 0; i < frameCount; i++) {
        frames.push(renderFrame(engine, targetFps, frameCountRef.current++, mouseRef.current));
      }
      return summarizeBenchmark(frames, nowMs() - startTime, targetFps);
    },
    [targetFps]
  );

  const destroy = useCallback(async () => {
    stop();
    disposeEngine(engineRef.current);
    engineRef.current = null;
    setState((s) => ({
      ...s,
      ready: false,
      initializing: false,
      frameDataUri: null,
      frameTiming: null,
      initTimings: null,
      fps: 0,
    }));
  }, [stop]);

  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current !== null) {
        cancelScheduledFrame(rafRef.current);
      }
      disposeEngine(engineRef.current);
      engineRef.current = null;
    };
  }, []);

  return [
    state,
    {
      init,
      start,
      stop,
      updateShader,
      resize,
      benchmark,
      destroy,
    },
  ];
}
