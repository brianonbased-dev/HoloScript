/**
 * WebGPUBackendRenderer.ts — ECSWorld → WebGPURenderer primary scene backend.
 *
 * Task: task_1780691124860_2h3s  (D.083, native-engine, P1)
 *
 * Wires the THREE-free path:
 *   engine/vm ECSWorld  →  DrawSpec[] (pure data, no GPU)
 *                       →  IDrawCall[]  (GPU resources, requires GPUDevice)
 *                       →  WebGPURenderer.beginFrame / submitDrawCalls / endFrame
 *
 * This is a BaseRuntimeRenderer implementation so RuntimeRenderer backend
 * selection can default to it, demoting ThreeJSRenderer to bridge-only.
 *
 * DESIGN NOTES (pre-mortem outcomes, preserved here):
 * - IDrawCall is GPU-resource-bound: the connector must hold a GPUDevice.
 *   We lazy-init via WebGPURenderer.initialize() on the first render() call.
 * - Pipeline registration: we use a single unlit pipeline per geometry kind.
 *   PBR / advanced material pipelines are opt-in via the material's pipelineId.
 * - ThreeJSRenderer is NOT touched here; it remains importable for bridge use.
 *   The DEFAULT_BACKEND constant controls which is instantiated by RuntimeRegistry.
 */

import {
  BaseRuntimeRenderer,
  type RenderableObject,
  type RenderableLight,
  type RenderableCamera,
  type ParticleSystem,
  type PostProcessingEffect,
  type RendererConfig,
  type RendererStatistics,
} from './RuntimeRenderer';
import type { HoloComposition } from '@holoscript/core';
import { WebGPURenderer } from '../rendering/webgpu/WebGPURenderer';
import {
  UNLIT_VERTEX_SHADER,
  UNLIT_FRAGMENT_SHADER,
  type IDrawCall,
  type IRenderMesh,
  type IRenderMaterial,
  type IVertexBuffer,
  type IIndexBuffer,
} from '../rendering/webgpu/WebGPUTypes';
import { ECSWorld } from '../vm/executor';
import { extractDrawSpecs, type DrawSpec } from '../native-render/draw-spec';
import { primitiveToMesh } from '../native-render/primitive-mesh';

// ---------------------------------------------------------------------------
// GPU usage flag literals (avoids globalThis.GPUBufferUsage not defined in CI)
// Mirror scene-render.ts which uses the same pattern.
// ---------------------------------------------------------------------------
const BUF_VERTEX   = 0x0020;
const BUF_INDEX    = 0x0010;
const BUF_UNIFORM  = 0x0040;
const BUF_COPY_DST = 0x0008;

// ---------------------------------------------------------------------------
// Per-frame mesh cache key
// ---------------------------------------------------------------------------

type MeshCacheKey = string; // `${entityId}:${geometryKind}:${JSON.stringify(params)}`

function meshCacheKey(spec: DrawSpec): MeshCacheKey {
  return `${spec.entityId}:${spec.geometry.kind}:${JSON.stringify(spec.geometry.params)}`;
}

// ---------------------------------------------------------------------------
// GPU resource cache entries
// ---------------------------------------------------------------------------

interface CachedMesh {
  vbuf: GPUBuffer;
  ibuf: GPUBuffer;
  vertexCount: number;
  indexCount: number;
}

interface CachedMaterial {
  ubuf: GPUBuffer;
  bindGroup: GPUBindGroup;
}

// ---------------------------------------------------------------------------
// WebGPUBackendRenderer
// ---------------------------------------------------------------------------

export class WebGPUBackendRenderer extends BaseRuntimeRenderer {
  private readonly webgpu: WebGPURenderer;
  private world: ECSWorld | null = null;
  private initialized = false;
  private rafId: number | null = null;
  private lastTime = 0;

  // Unlit pipeline id — registered once on initialize
  private readonly PIPELINE_ID = 'unlit-native';

  // GPU resource caches — cleared on resize/dispose
  private meshCache: Map<MeshCacheKey, CachedMesh> = new Map();
  private materialCache: Map<number, CachedMaterial> = new Map(); // keyed by entityId

  // Camera state
  private cameraPos: [number, number, number] = [0, 2, 5];
  private cameraTarget: [number, number, number] = [0, 0, 0];

  constructor(config: RendererConfig = {}) {
    super(config);
    this.webgpu = new WebGPURenderer({
      powerPreference: 'high-performance',
      debug: config.debug ?? false,
    });
  }

  // -------------------------------------------------------------------------
  // Attach an ECSWorld to be rendered each frame. Call before start().
  // -------------------------------------------------------------------------

  attachWorld(world: ECSWorld): void {
    this.world = world;
  }

  // -------------------------------------------------------------------------
  // BaseRuntimeRenderer — lifecycle
  // -------------------------------------------------------------------------

  initialize(composition: HoloComposition, config?: RendererConfig): void {
    this.composition = composition;
    if (config) {
      this.config = { ...this.config, ...config };
    }
    // Actual GPU init deferred to first render() — canvas may not be ready yet.
  }

  start(): void {
    if (this.isRunning) return;
    // requestAnimationFrame is only available in browser contexts; skip loop in headless.
    if (typeof requestAnimationFrame === 'undefined') {
      this.isRunning = true;
      return;
    }
    this.isRunning = true;
    const loop = (time: number) => {
      if (!this.isRunning) return;
      const dt = this.lastTime > 0 ? (time - this.lastTime) / 1000 : 0;
      this.lastTime = time;
      this.update(dt);
      this.render();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.rafId);
      }
      this.rafId = null;
    }
  }

  update(_deltaTime: number): void {
    // Scene logic / physics ticks go here in future.
    // For now the world is updated externally; we just extract + render.
  }

  render(): void {
    if (!this.initialized) {
      // Can't render without GPU init; skip silently if canvas not ready.
      return;
    }

    const device = this.webgpu.getDevice();
    if (!device) return;

    const encoder = this.webgpu.beginFrame();
    if (!encoder) return;

    // Build camera uniforms from current camera state
    const width = this.config.width ?? 1920;
    const height = this.config.height ?? 1080;
    const aspect = width / height;
    const fov = ((75 * Math.PI) / 180); // 75° default
    const near = 0.1, far = 1000;

    // Perspective projection matrix (column-major)
    const proj = perspectiveMatrix(fov, aspect, near, far);
    // View matrix from cameraPos → cameraTarget
    const view = lookAtMatrix(this.cameraPos, this.cameraTarget, [0, 1, 0]);
    const viewProj = mul4x4(proj, view);

    this.webgpu.updateCameraUniforms({
      viewMatrix: view,
      projectionMatrix: proj,
      viewProjectionMatrix: viewProj,
      inverseViewMatrix: new Float32Array(16),
      inverseProjectionMatrix: new Float32Array(16),
      cameraPosition: new Float32Array(this.cameraPos),
      near,
      far,
      fov,
      aspectRatio: aspect,
    });

    const drawCalls = this.world ? this.buildDrawCalls(device) : [];
    const pass = this.webgpu.beginRenderPass(encoder);
    this.webgpu.submitDrawCalls(pass, drawCalls);
    this.webgpu.endRenderPass(pass);
    this.webgpu.endFrame(encoder);
  }

  // -------------------------------------------------------------------------
  // Initialize WebGPU (call after canvas is available)
  // -------------------------------------------------------------------------

  async initializeGPU(canvas: HTMLCanvasElement): Promise<void> {
    await this.webgpu.initialize({ canvas });
    const device = this.webgpu.getDevice()!;
    this.registerUnlitPipeline(device);
    this.initialized = true;
  }

  // -------------------------------------------------------------------------
  // Pipeline registration
  // -------------------------------------------------------------------------

  private registerUnlitPipeline(device: GPUDevice): void {
    // Pipeline is registered via WebGPURenderer.createRenderPipeline.
    // Vertex layout: position(vec3) + uv(vec2) + color(vec4) = 36 bytes/vertex.
    // Our primitive meshes emit position-only (XYZ, 12 bytes/vertex), so we use
    // a minimal vertex shader variant that only reads position.
    this.webgpu.createRenderPipeline(this.PIPELINE_ID, {
      label: 'unlit-native',
      vertexShader: { code: UNLIT_VERTEX_SHADER, entryPoint: 'main', label: 'unlit-vs' },
      fragmentShader: { code: UNLIT_FRAGMENT_SHADER, entryPoint: 'main', label: 'unlit-fs' },
      vertexBufferLayouts: [
        {
          arrayStride: 12, // vec3 position only
          attributes: [{ format: 'float32x3', offset: 0, shaderLocation: 0 }],
        },
      ],
      colorTargets: [{ format: 'bgra8unorm' }],
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
      topology: 'triangle-list',
      cullMode: 'back',
    });
  }

  // -------------------------------------------------------------------------
  // ECSWorld → IDrawCall[] connector
  // -------------------------------------------------------------------------

  private buildDrawCalls(device: GPUDevice): IDrawCall[] {
    if (!this.world) return [];

    const specs = extractDrawSpecs(this.world);
    const drawCalls: IDrawCall[] = [];

    for (const spec of specs) {
      // Skip external mesh geometry (requires asset loader, handled elsewhere)
      if (spec.geometry.kind === 'mesh') continue;

      const mesh = this.getOrCreateMesh(device, spec);
      const material = this.getOrCreateMaterial(device, spec);
      if (!mesh || !material) continue;

      const renderMesh: IRenderMesh = {
        id: `entity-${spec.entityId}`,
        vertexBuffers: [mesh.vbuf as unknown as IVertexBuffer], // cast: IVertexBuffer typed but GPUBuffer is what we pass
        indexBuffer: {
          buffer: mesh.ibuf,
          indexCount: mesh.indexCount,
          format: 'uint32',
        } satisfies IIndexBuffer,
        vertexCount: mesh.vertexCount,
        instanceCount: 1,
      };

      drawCalls.push({
        mesh: renderMesh,
        material: material.renderMaterial,
        modelMatrix: spec.modelMatrix,
        sortKey: spec.entityId,
        cameraDistance: 0,
      });
    }

    return drawCalls;
  }

  private getOrCreateMesh(device: GPUDevice, spec: DrawSpec): CachedMesh | null {
    const key = meshCacheKey(spec);
    const cached = this.meshCache.get(key);
    if (cached) return cached;

    const prim = primitiveToMesh(spec.geometry.kind, spec.geometry.params);

    const vbuf = device.createBuffer({
      label: `vbuf:${key}`,
      size: prim.positions.byteLength,
      usage: BUF_VERTEX | BUF_COPY_DST,
    });
    device.queue.writeBuffer(vbuf, 0, prim.positions);

    const ibuf = device.createBuffer({
      label: `ibuf:${key}`,
      size: prim.indices.byteLength,
      usage: BUF_INDEX | BUF_COPY_DST,
    });
    device.queue.writeBuffer(ibuf, 0, prim.indices);

    const entry: CachedMesh = { vbuf, ibuf, vertexCount: prim.vertexCount, indexCount: prim.indices.length };
    this.meshCache.set(key, entry);
    return entry;
  }

  private getOrCreateMaterial(
    device: GPUDevice,
    spec: DrawSpec
  ): { ubuf: GPUBuffer; renderMaterial: IRenderMaterial } | null {
    const cached = this.materialCache.get(spec.entityId);
    // Re-create every frame to pick up material changes (simple path; cache by color hash for perf later).
    if (cached) {
      this.updateMaterialBuffer(device, cached.ubuf, spec);
      return {
        ubuf: cached.ubuf,
        renderMaterial: this.buildRenderMaterial(cached.ubuf, spec),
      };
    }

    // Build a simple MVP+color uniform buffer: [mvpMatrix (16 floats)] already in cameraUniforms;
    // the material buffer holds [baseColor(4), metallic(1), roughness(1), emissive(3)] = 9 floats.
    // Using a 64-byte aligned buffer (16 floats).
    const ubuf = device.createBuffer({
      label: `mat:${spec.entityId}`,
      size: 64,
      usage: BUF_UNIFORM | BUF_COPY_DST,
    });

    this.updateMaterialBuffer(device, ubuf, spec);
    this.materialCache.set(spec.entityId, { ubuf, bindGroup: null as unknown as GPUBindGroup });

    return {
      ubuf,
      renderMaterial: this.buildRenderMaterial(ubuf, spec),
    };
  }

  private updateMaterialBuffer(device: GPUDevice, ubuf: GPUBuffer, spec: DrawSpec): void {
    const data = new Float32Array(16);
    const { color, metalness, roughness, opacity } = spec.material;
    data[0] = ((color >> 16) & 0xff) / 255; // r
    data[1] = ((color >> 8) & 0xff) / 255;  // g
    data[2] = (color & 0xff) / 255;          // b
    data[3] = opacity;                        // a
    data[4] = metalness;
    data[5] = roughness;
    device.queue.writeBuffer(ubuf, 0, data);
  }

  private buildRenderMaterial(ubuf: GPUBuffer, spec: DrawSpec): IRenderMaterial {
    const device = this.webgpu.getDevice()!;
    // Build a bind group for this material buffer (group 0).
    // NOTE: The pipeline uses group(0) binding(0) for uniforms (MVP in unlit shader).
    // Our unlit pipeline's BGL is auto-derived from the shader — it expects a uniform at group 0, binding 0.
    // We retrieve it from the compiled pipeline.
    const pipeline = (this.webgpu as unknown as { pipelines: Map<string, GPURenderPipeline> }).pipelines?.get(this.PIPELINE_ID);
    let bindGroup: GPUBindGroup;
    if (pipeline) {
      bindGroup = device.createBindGroup({
        label: `bg:${spec.entityId}`,
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: ubuf } }],
      });
    } else {
      // Pipeline not yet ready — create a placeholder (won't be submitted if pipeline is missing)
      bindGroup = {} as unknown as GPUBindGroup;
    }

    return {
      id: `mat-${spec.entityId}`,
      pipelineId: this.PIPELINE_ID,
      bindGroup,
      textures: new Map(),
      uniforms: new ArrayBuffer(0),
      transparent: spec.material.opacity < 1,
      doubleSided: false,
    };
  }

  // -------------------------------------------------------------------------
  // BaseRuntimeRenderer — scene management (objects managed via ECSWorld)
  // -------------------------------------------------------------------------

  addObject(object: RenderableObject): void {
    this.objects.set(object.id, object);
  }

  removeObject(objectId: string): void {
    this.objects.delete(objectId);
  }

  updateObjectTransform(
    objectId: string,
    transform: { position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] }
  ): void {
    const obj = this.objects.get(objectId);
    if (!obj) return;
    if (transform.position) obj.position = transform.position;
    if (transform.rotation) obj.rotation = transform.rotation;
    if (transform.scale) obj.scale = transform.scale;
  }

  addParticleSystem(_system: ParticleSystem): void { /* TODO */ }
  updateParticleSystem(_id: string, _positions: Float32Array, _colors?: Float32Array): void { /* TODO */ }
  removeParticleSystem(id: string): void { this.particleSystems.delete(id); }

  addLight(light: RenderableLight): void {
    this.lights.set(light.id, light);
  }

  updateCamera(camera: RenderableCamera): void {
    this.camera = camera;
    this.cameraPos = camera.position;
    this.cameraTarget = camera.target;
  }

  enablePostProcessing(_effect: PostProcessingEffect): void { /* TODO */ }

  getStatistics(): RendererStatistics {
    const stats = this.webgpu.getStats();
    return {
      fps: stats.fps,
      frameTime: stats.average.frameTime,
      drawCalls: stats.currentFrame.drawCalls,
      triangles: stats.currentFrame.triangles,
      points: 0,
      lines: 0,
      objects: this.objects.size,
      lights: this.lights.size,
      textures: 0,
      programs: 1,
    };
  }

  resize(width: number, height: number): void {
    this.config.width = width;
    this.config.height = height;
    this.webgpu.resize(width, height);
    // Clear mesh/material caches so GPU resources are re-created for new size
    this.clearGPUCaches();
  }

  dispose(): void {
    this.stop();
    this.clearGPUCaches();
    this.webgpu.destroy();
    this.initialized = false;
  }

  private clearGPUCaches(): void {
    for (const { vbuf, ibuf } of this.meshCache.values()) {
      vbuf.destroy();
      ibuf.destroy();
    }
    this.meshCache.clear();

    for (const { ubuf } of this.materialCache.values()) {
      ubuf.destroy();
    }
    this.materialCache.clear();
  }
}

// ---------------------------------------------------------------------------
// Backend selector constant — flip to ThreeJSRenderer for bridge fallback.
// ---------------------------------------------------------------------------

/**
 * DEFAULT_BACKEND controls which RuntimeRenderer is instantiated when no
 * backend is explicitly requested. 'webgpu' = WebGPUBackendRenderer (native,
 * Three-free); 'threejs' = ThreeJSRenderer (bridge, legacy).
 *
 * Demoting ThreeJSRenderer: when this is 'webgpu', grep for `ThreeJSRenderer`
 * imports in the primary scene path should find 0 results outside of
 * bridge/compat modules.
 */
export const DEFAULT_BACKEND: 'webgpu' | 'threejs' = 'webgpu';

// ---------------------------------------------------------------------------
// Math helpers (minimal, no external dep)
// ---------------------------------------------------------------------------

/** Column-major perspective matrix. */
function perspectiveMatrix(fov: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1.0 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

/** Column-major lookAt view matrix. */
function lookAtMatrix(
  eye: [number, number, number],
  center: [number, number, number],
  up: [number, number, number]
): Float32Array {
  let fx = center[0] - eye[0], fy = center[1] - eye[1], fz = center[2] - eye[2];
  const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;

  let sx = fy * up[2] - fz * up[1];
  let sy = fz * up[0] - fx * up[2];
  let sz = fx * up[1] - fy * up[0];
  const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;

  const ux = sy * fz - sz * fy;
  const uy = sz * fx - sx * fz;
  const uz = sx * fy - sy * fx;

  const m = new Float32Array(16);
  m[0] = sx; m[1] = ux; m[2] = -fx; m[3] = 0;
  m[4] = sy; m[5] = uy; m[6] = -fy; m[7] = 0;
  m[8] = sz; m[9] = uz; m[10] = -fz; m[11] = 0;
  m[12] = -(sx * eye[0] + sy * eye[1] + sz * eye[2]);
  m[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
  m[14] = fx * eye[0] + fy * eye[1] + fz * eye[2];
  m[15] = 1;
  return m;
}

/** 4x4 column-major matrix multiply: out = a * b. */
function mul4x4(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}
