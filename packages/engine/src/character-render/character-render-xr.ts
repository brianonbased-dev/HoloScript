/**
 * character-render-xr — native-WebGPU WebXR character rendering (headset path).
 *
 * Additive SIBLING of renderCharacter (which stays the untouched G.GOLD.006 headless floor).
 * Where renderCharacter draws once to an offscreen texture + reads back, this drives the SAME
 * skinned-character pipeline per-XRView into the headset swapchain via XRWebGPUBinding projection
 * layers — no readback, composited straight to the display.
 *
 * VERIFICATION BOUNDARY (honest scope — refuse the demote):
 *   - Headless-verifiable (unit-tested here): `detectSupport()` feature-detect + graceful
 *     fallback (G.GOLD.006), `composeEyeViewProj()` per-eye math, `packFrameUniform()` layout.
 *   - ON-DEVICE-PENDING (cannot run in CI/Dawn — needs a real Quest + XRWebGPUBinding):
 *     the requestSession → binding → projection-layer → getViewerPose → per-eye composite loop
 *     in `XRCharacterRenderer`. It compiles + is typed (no `any`/@ts-ignore), but the in-headset
 *     render is provable only by running on-device (emit a quest-proof receipt there).
 *   - Today XRWebGPUBinding support is uneven on headsets; detectSupport falls back to the
 *     existing WebGL three.js path when it is absent — that fallback is the expected outcome
 *     until devices confirm the binding.
 *
 * @module character-render
 */

import skinSkinningWGSL from '../rendering/webgpu/shaders/skin-skinning.wgsl?raw';
import type { CharacterDrawSpec, MaterialGroup, ShadingModel } from '../native-render/draw-spec';
import type { CharacterHost } from './CharacterHost';
import { multiply, type Mat4 } from './skin-math';

// ── Type shims for the experimental WebGPU-WebXR binding (not yet in lib.dom; no `any`). ──
interface XRSubImageLike {
  colorTexture: GPUTexture;
  depthStencilTexture?: GPUTexture;
  imageIndex?: number;
  viewport: { x: number; y: number; width: number; height: number };
}
interface XRProjectionLayerLike {
  textureWidth: number;
  textureHeight: number;
}
interface XRWebGPUBindingLike {
  createProjectionLayer(init: {
    colorFormat: GPUTextureFormat;
    depthStencilFormat?: GPUTextureFormat;
    scaleFactor?: number;
  }): XRProjectionLayerLike;
  getViewSubImage(layer: XRProjectionLayerLike, view: XRView): XRSubImageLike;
}
interface XRWebGPUBindingCtor {
  new (session: XRSession, device: GPUDevice): XRWebGPUBindingLike;
}

const SHADER_VERTEX = 0x1;
const SHADER_FRAGMENT = 0x2;
const BUF_VERTEX = 0x0020;
const BUF_INDEX = 0x0010;
const BUF_UNIFORM = 0x0040;
const BUF_STORAGE = 0x0080;
const BUF_COPY_DST = 0x0008;
const TEX_RENDER_ATTACHMENT = 0x10;

const FRAG_ENTRY: Record<ShadingModel, string> = {
  lambert: 'fs_lambert',
  'skin-sss': 'fs_skin_sss',
  'marschner-hair': 'fs_marschner',
  'refractive-eye': 'fs_eye',
  'woven-cloth': 'fs_woven_cloth',
};

// =============================================================================
// Headless-verifiable pure helpers
// =============================================================================

export type XRRenderMode = 'xr-webgpu' | 'webgl-fallback' | 'flat';
export interface XRSupport {
  webgpu: boolean;
  immersiveVR: boolean;
  xrWebGPUBinding: boolean;
  mode: XRRenderMode;
  reason: string;
}

/**
 * Feature-detect the native-WebGPU XR path; NEVER throws (G.GOLD.006 graceful fallback).
 * Returns a discriminated result the caller routes on: xr-webgpu → this module; webgl-fallback
 * → the existing three.js ImmersiveViewer; flat → offscreen renderCharacter preview.
 */
export async function detectSupport(): Promise<XRSupport> {
  const nav =
    typeof navigator !== 'undefined' ? (navigator as Navigator & { xr?: XRSystem }) : undefined;
  const webgpu = !!nav && 'gpu' in nav;
  const hasXR = !!nav && 'xr' in nav && !!nav.xr;
  const xrWebGPUBinding =
    typeof (globalThis as Record<string, unknown>).XRWebGPUBinding !== 'undefined';
  let immersiveVR = false;
  if (hasXR) {
    try {
      immersiveVR = await nav!.xr!.isSessionSupported('immersive-vr');
    } catch {
      immersiveVR = false;
    }
  }
  if (webgpu && immersiveVR && xrWebGPUBinding)
    return {
      webgpu,
      immersiveVR,
      xrWebGPUBinding,
      mode: 'xr-webgpu',
      reason: 'native WebGPU WebXR available',
    };
  if (immersiveVR)
    return {
      webgpu,
      immersiveVR,
      xrWebGPUBinding,
      mode: 'webgl-fallback',
      reason: 'immersive-vr present but no WebGPU XR binding → three.js WebGL path',
    };
  return {
    webgpu,
    immersiveVR,
    xrWebGPUBinding,
    mode: 'flat',
    reason: 'no immersive-vr → flat preview',
  };
}

/** Per-eye view·projection from an XRView: projectionMatrix · inverse(view transform). Column-major. */
export function composeEyeViewProj(
  projectionMatrix: Float32Array,
  viewInverseMatrix: Float32Array
): Mat4 {
  return multiply(projectionMatrix as unknown as Mat4, viewInverseMatrix as unknown as Mat4);
}

/** Pack the 40-float Frame uniform (mvp16 + model16 + cameraPos4 + lightDir4) — matches skin-skinning.wgsl. */
export function packFrameUniform(
  mvp: Mat4,
  model: Float32Array,
  cameraPos: [number, number, number],
  lightDir: [number, number, number]
): Float32Array<ArrayBuffer> {
  const f = new Float32Array(40);
  f.set(mvp, 0);
  f.set(model, 16);
  f[32] = cameraPos[0];
  f[33] = cameraPos[1];
  f[34] = cameraPos[2];
  f[36] = lightDir[0];
  f[37] = lightDir[1];
  f[38] = lightDir[2];
  return f;
}

// =============================================================================
// On-device renderer (ON-DEVICE-PENDING — compiles + typed; live loop needs a Quest)
// =============================================================================

export interface XRCharacterRendererOptions {
  lightDir?: [number, number, number];
  clear?: [number, number, number, number];
  /** Color format the projection layer accepts (Quest is typically 'bgra8unorm'). */
  colorFormat?: GPUTextureFormat;
}

interface EyeResources {
  frameBuf: GPUBuffer;
  frameBindGroup: GPUBindGroup;
  depth?: GPUTexture;
}

/**
 * Drives the skinned-character pipeline into a WebXR headset via XRWebGPUBinding. Build once per
 * session; `start()` runs the per-frame, per-eye loop. The resource build DUPLICATES
 * renderCharacter's pattern (renderCharacter stays the untouched headless floor).
 */
export class XRCharacterRenderer {
  private session: XRSession | null = null;
  private binding: XRWebGPUBindingLike | null = null;
  private layer: XRProjectionLayerLike | null = null;
  private baseRef: XRReferenceSpace | null = null;
  private colorFormat: GPUTextureFormat;
  private readonly light: [number, number, number];
  private readonly clear: [number, number, number, number];

  // Persistent GPU resources (built once).
  private module: GPUShaderModule | null = null;
  private frameBGL: GPUBindGroupLayout | null = null;
  private matBGL: GPUBindGroupLayout | null = null;
  private pipelineLayout: GPUPipelineLayout | null = null;
  private pipelineCache = new Map<string, GPURenderPipeline>();
  private geo: {
    pos: GPUBuffer;
    norm: GPUBuffer;
    ji: GPUBuffer;
    jw: GPUBuffer;
    tan: GPUBuffer;
    idx: GPUBuffer;
  } | null = null;
  private jointBuf: GPUBuffer | null = null;
  private matBufs: GPUBuffer[] = [];
  private eyes: EyeResources[] = [];

  constructor(
    private readonly device: GPUDevice,
    private readonly host: CharacterHost,
    opts: XRCharacterRendererOptions = {}
  ) {
    this.colorFormat = opts.colorFormat ?? 'bgra8unorm';
    this.light = opts.lightDir ?? [0.4, 0.7, 0.6];
    this.clear = opts.clear ?? [0.05, 0.05, 0.07, 1];
  }

  /** Begin an immersive-vr session and start the per-eye render loop. ON-DEVICE only. */
  async start(): Promise<void> {
    const nav = navigator as Navigator & { xr?: XRSystem };
    if (!nav.xr) throw new Error('WebXR not available');
    this.session = await nav.xr.requestSession('immersive-vr', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking', 'layers', 'bounded-floor'],
    });
    const Ctor = (globalThis as Record<string, unknown>).XRWebGPUBinding as unknown as
      | XRWebGPUBindingCtor
      | undefined;
    if (!Ctor) throw new Error('XRWebGPUBinding unavailable on this device');
    this.binding = new Ctor(this.session, this.device);
    this.layer = this.binding.createProjectionLayer({
      colorFormat: this.colorFormat,
      depthStencilFormat: 'depth24plus',
      scaleFactor: 1.0,
    });
    // updateRenderState layers — typed loosely (XRRenderStateInit.layers is experimental).
    await this.session.updateRenderState({ layers: [this.layer] } as unknown as XRRenderStateInit);
    this.baseRef = await this.session.requestReferenceSpace('local-floor');
    this.buildResources();
    this.session.addEventListener('end', () => this.dispose());
    const loop = (_t: number, frame: XRFrame): void => {
      this.onFrame(frame);
      this.session?.requestAnimationFrame(loop);
    };
    this.session.requestAnimationFrame(loop);
  }

  private onFrame(frame: XRFrame): void {
    if (
      !this.session ||
      !this.binding ||
      !this.layer ||
      !this.baseRef ||
      !this.geo ||
      !this.jointBuf
    )
      return;
    const pose = frame.getViewerPose(this.baseRef);
    if (!pose) return; // headset not localized yet; caller re-arms requestAnimationFrame
    const spec = this.host.getDrawSpec();
    const { device } = this;
    device.queue.writeBuffer(this.jointBuf, 0, spec.jointMatrices);
    const groups = this.normalizeGroups(spec);
    const enc = device.createCommandEncoder();

    pose.views.forEach((view, eye) => {
      const sub = this.binding!.getViewSubImage(this.layer!, view);
      const viewProj = composeEyeViewProj(view.projectionMatrix, view.transform.inverse.matrix);
      const mvp = multiply(viewProj, spec.modelMatrix);
      const p = view.transform.position;
      const frameData = packFrameUniform(mvp, spec.modelMatrix, [p.x, p.y, p.z], this.light);
      const er = this.eyeResources(eye, sub);
      device.queue.writeBuffer(er.frameBuf, 0, frameData);

      const colorView = sub.colorTexture.createView({
        dimension: '2d',
        baseArrayLayer: sub.imageIndex ?? 0,
        arrayLayerCount: 1,
      });
      const depthTex = sub.depthStencilTexture ?? er.depth!;
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: colorView,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: this.clear[0], g: this.clear[1], b: this.clear[2], a: this.clear[3] },
          },
        ],
        depthStencilAttachment: {
          view: depthTex.createView(),
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      });
      const vp = sub.viewport;
      pass.setViewport(vp.x, vp.y, vp.width, vp.height, 0, 1);
      pass.setVertexBuffer(0, this.geo!.pos);
      pass.setVertexBuffer(1, this.geo!.norm);
      pass.setVertexBuffer(2, this.geo!.ji);
      pass.setVertexBuffer(3, this.geo!.jw);
      pass.setVertexBuffer(4, this.geo!.tan);
      pass.setIndexBuffer(this.geo!.idx, 'uint32');
      pass.setBindGroup(0, er.frameBindGroup);
      groups.forEach((g, i) => {
        pass.setPipeline(this.getPipeline(g.material.shadingModel, !!g.transparent));
        pass.setBindGroup(1, this.matBindGroup(i, g));
        pass.drawIndexed(g.indexCount, 1, g.indexStart);
      });
      pass.end();
    });
    device.queue.submit([enc.finish()]);
  }

  private normalizeGroups(spec: CharacterDrawSpec): MaterialGroup[] {
    const groups =
      spec.materialGroups && spec.materialGroups.length > 0
        ? spec.materialGroups
        : [
            {
              indexStart: 0,
              indexCount: spec.mesh.indices.length,
              material: { ...spec.material, shadingModel: 'lambert' as const },
            },
          ];
    return [...groups].sort(
      (a, b) => Number(a.transparent ?? false) - Number(b.transparent ?? false)
    );
  }

  private buildResources(): void {
    const { device } = this;
    const spec = this.host.getDrawSpec();
    const { mesh } = spec;
    this.module = device.createShaderModule({ code: skinSkinningWGSL });
    this.frameBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: SHADER_VERTEX | SHADER_FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: SHADER_VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });
    this.matBGL = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: SHADER_FRAGMENT, buffer: { type: 'uniform' } }],
    });
    this.pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.frameBGL, this.matBGL],
    });
    const mk = (
      a: Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>,
      usage: number
    ): GPUBuffer => {
      const b = device.createBuffer({ size: a.byteLength, usage: usage | BUF_COPY_DST });
      device.queue.writeBuffer(b, 0, a);
      return b;
    };
    this.geo = {
      pos: mk(mesh.positions, BUF_VERTEX),
      norm: mk(mesh.normals, BUF_VERTEX),
      ji: mk(mesh.jointIndices, BUF_VERTEX),
      jw: mk(mesh.jointWeights, BUF_VERTEX),
      tan: mk(mesh.tangents, BUF_VERTEX),
      idx: mk(mesh.indices, BUF_INDEX),
    };
    this.jointBuf = mk(spec.jointMatrices, BUF_STORAGE);
  }

  private eyeResources(eye: number, sub: XRSubImageLike): EyeResources {
    let er = this.eyes[eye];
    if (!er) {
      const frameBuf = this.device.createBuffer({
        size: 40 * 4,
        usage: BUF_UNIFORM | BUF_COPY_DST,
      });
      const frameBindGroup = this.device.createBindGroup({
        layout: this.frameBGL!,
        entries: [
          { binding: 0, resource: { buffer: frameBuf } },
          { binding: 1, resource: { buffer: this.jointBuf! } },
        ],
      });
      er = { frameBuf, frameBindGroup };
      this.eyes[eye] = er;
    }
    // Per-eye depth fallback sized to the subimage (never reuse a flat-canvas depth).
    if (!sub.depthStencilTexture) {
      const w = sub.colorTexture.width;
      const h = sub.colorTexture.height;
      if (!er.depth || er.depth.width !== w || er.depth.height !== h) {
        er.depth?.destroy();
        er.depth = this.device.createTexture({
          size: [w, h],
          format: 'depth24plus',
          usage: TEX_RENDER_ATTACHMENT,
        });
      }
    }
    return er;
  }

  private getPipeline(model: ShadingModel, transparent: boolean): GPURenderPipeline {
    const key = `${model}:${transparent ? 1 : 0}`;
    let p = this.pipelineCache.get(key);
    if (!p) {
      p = this.device.createRenderPipeline({
        layout: this.pipelineLayout!,
        vertex: {
          module: this.module!,
          entryPoint: 'vs',
          buffers: [
            {
              arrayStride: 12,
              attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
            },
            {
              arrayStride: 12,
              attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }],
            },
            { arrayStride: 4, attributes: [{ shaderLocation: 2, offset: 0, format: 'uint32' }] },
            { arrayStride: 4, attributes: [{ shaderLocation: 3, offset: 0, format: 'float32' }] },
            {
              arrayStride: 16,
              attributes: [{ shaderLocation: 4, offset: 0, format: 'float32x4' }],
            },
          ],
        },
        fragment: {
          module: this.module!,
          entryPoint: FRAG_ENTRY[model],
          targets: [
            {
              format: this.colorFormat,
              ...(transparent
                ? {
                    blend: {
                      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
                      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                    },
                  }
                : {}),
            },
          ],
        },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: {
          format: 'depth24plus',
          depthWriteEnabled: !transparent,
          depthCompare: 'less',
        },
      });
      this.pipelineCache.set(key, p);
    }
    return p;
  }

  private matBindGroup(i: number, g: MaterialGroup): GPUBindGroup {
    // Rebuild per frame (materials may change); cheap for the small group count.
    const m = g.material;
    const data = new Float32Array(16);
    data[0] = ((m.color >> 16) & 0xff) / 255;
    data[1] = ((m.color >> 8) & 0xff) / 255;
    data[2] = (m.color & 0xff) / 255;
    data[3] = m.opacity;
    if (m.shadingModel === 'woven-cloth') {
      data[4] = m.roughness;
      data[5] = m.sheen;
      data[6] = m.weaveScale;
      data[7] = m.rimStrength;
    }
    const buf = this.device.createBuffer({
      size: data.byteLength,
      usage: BUF_UNIFORM | BUF_COPY_DST,
    });
    this.device.queue.writeBuffer(buf, 0, data);
    this.matBufs.push(buf);
    return this.device.createBindGroup({
      layout: this.matBGL!,
      entries: [{ binding: 0, resource: { buffer: buf } }],
    });
  }

  /** Destroy GPU resources + drop the session. Auto-called on session 'end'. */
  dispose(): void {
    for (const e of this.eyes) {
      e.frameBuf.destroy();
      e.depth?.destroy();
    }
    this.eyes = [];
    for (const b of this.matBufs) b.destroy();
    this.matBufs = [];
    if (this.geo) for (const b of Object.values(this.geo)) b.destroy();
    this.geo = null;
    this.jointBuf?.destroy();
    this.jointBuf = null;
    this.session = null;
    this.binding = null;
    this.layer = null;
  }
}
