/**
 * SplatCharacterHost — entity-generic native character driver for a Gaussian-SPLAT body
 * (render "Part 2", the photoreal counterpart to {@link CharacterHost}'s rasterized skinned mesh).
 *
 * A character entity whose body is a trained Gaussian splat cloud — loaded from the existing
 * splat infrastructure (`GaussianPlyLoader` for `.ply`, the `GaussianSplatData` codec interchange
 * for glTF/SPZ) rather than procedurally generated. Like CharacterHost it is:
 *   - entity-generic (D.094): keyed by `entityId`, default-anything, nothing hardcoded;
 *   - mind-bearing (D.102): `bindMind` adopts a wallet identity + `private:<wallet>` memory so the
 *     SAME agent inhabits this body across substrates — identical seam to CharacterHost.
 *
 * `render()` frames the cloud automatically (centroid + bounding radius → a +Z-forward camera that
 * fits it), so a real capture centred anywhere in world space renders without the caller knowing
 * its coordinate frame. NO Three.js, NO R3F — this drives the same native WebGPU splat pipeline as
 * `renderSplats`, which reuses the Paper-grade `GaussianSplatSorter` unchanged.
 *
 * @module character-render
 */

import {
  renderSplats,
  gaussian3DToSplats,
  gaussianSplatDataToSplats,
  type RawSplatInput,
} from '../native-render/splat-render';
import { loadGaussianPly } from '../gpu/GaussianPlyLoader';
import type { Gaussian3D } from '../gpu/GaussianTrainer3D';
import type { GaussianSplatData } from '../gpu/codecs/types';
import type { CameraState } from '../gpu/GaussianSplatSorter';
import type { PixelGrid } from '../native-render/gpu-verify';
import type { CharacterMind, MindIdentity, MindMemoryEntry } from './CharacterMind';
import { multiply } from './skin-math';

/**
 * Build a camera that frames an arbitrary splat cloud. Computes the cloud's centroid and bounding
 * radius, then places a +Z-forward perspective camera (the splat pipeline treats `depth=(view·pos).z`
 * and culls `depth<0.01`, so the whole cloud must sit at positive camera-space Z) at a distance that
 * fits the radius within the vertical FoV with margin. Column-major; `view` is identity-rotation +
 * a translation that maps the centroid to `(0,0,dist)`.
 */
export function framingSplatCamera(
  splats: readonly RawSplatInput[],
  size: number,
  fovYDeg = 60
): CameraState {
  const n = splats.length;
  let cx = 0,
    cy = 0,
    cz = 0;
  for (const s of splats) {
    cx += s.position[0];
    cy += s.position[1];
    cz += s.position[2];
  }
  if (n > 0) {
    cx /= n;
    cy /= n;
    cz /= n;
  }
  let rad = 0;
  for (const s of splats) {
    const dx = s.position[0] - cx;
    const dy = s.position[1] - cy;
    const dz = s.position[2] - cz;
    rad = Math.max(rad, Math.hypot(dx, dy, dz));
  }
  rad = rad || 1; // a single-point / empty cloud still gets a sane frustum

  const fovY = (fovYDeg * Math.PI) / 180;
  const tanFov = Math.tan(fovY / 2);
  const f = 1 / tanFov;
  const aspect = 1;
  // Fit the radius in the FoV with margin (ndc ≈ 0.7), and keep dist > rad so all camZ > 0.
  const dist = Math.max((rad * f) / 0.7, rad * 2) + 0.1;

  const proj = new Float32Array(16);
  proj[0] = f / aspect;
  proj[5] = f;
  proj[14] = 0.5; // clip.z constant, safely in [0,1] (depthCompare 'always')
  proj[11] = 1; // clip.w = z_eye

  // Identity rotation + translation mapping centroid → camera-space (0,0,dist).
  const view = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -cx, -cy, dist - cz, 1]);
  const viewProjection = multiply(proj, view);
  const focal = (0.5 * size) / tanFov;

  return {
    viewMatrix: view,
    projMatrix: proj,
    viewProjectionMatrix: viewProjection,
    cameraPosition: [cx, cy, cz - dist],
    focalX: focal,
    focalY: focal,
  };
}

export interface SplatCharacterHostOptions {
  /** Entity id — the agent this splat body belongs to (D.094 entity-generic). */
  entityId: string;
  /** The body's splats (use a `from*` factory to load from the splat infrastructure). */
  splats: readonly RawSplatInput[];
}

export interface SplatCharacterRenderOptions {
  /** Square framebuffer edge (default 128). */
  size?: number;
  /** Vertical FoV for the auto-framing camera (ignored when `camera` is supplied). */
  fovYDeg?: number;
  /** Clear RGBA 0..1 (default opaque black). */
  clear?: [number, number, number, number];
  /** Camera override; defaults to {@link framingSplatCamera} over this body's splats. */
  camera?: CameraState;
}

export class SplatCharacterHost {
  readonly entityId: string;
  private readonly splats: readonly RawSplatInput[];
  // D.102 portable mind (opt-in via bindMind; body renders identically with or without it).
  private mind: CharacterMind | null = null;
  private boundIdentity: MindIdentity | null = null;
  private memory: MindMemoryEntry[] = [];

  constructor(opts: SplatCharacterHostOptions) {
    this.entityId = opts.entityId;
    this.splats = opts.splats;
  }

  /** Load a body from the trainer / `.ply`-loader `Gaussian3D` SoA. */
  static fromGaussian3D(entityId: string, g: Gaussian3D): SplatCharacterHost {
    return new SplatCharacterHost({ entityId, splats: gaussian3DToSplats(g) });
  }

  /** Load a body from the codec interchange format (`GltfGaussianSplatCodec` / SPZ decode). */
  static fromGaussianSplatData(entityId: string, d: GaussianSplatData): SplatCharacterHost {
    return new SplatCharacterHost({ entityId, splats: gaussianSplatDataToSplats(d) });
  }

  /** Load a body directly from 3DGS `.ply` bytes (consumes the proven `loadGaussianPly` decode). */
  static fromPly(entityId: string, ply: Uint8Array | ArrayBuffer): SplatCharacterHost {
    return SplatCharacterHost.fromGaussian3D(entityId, loadGaussianPly(ply));
  }

  /** Number of Gaussians in this body. */
  get splatCount(): number {
    return this.splats.length;
  }

  /**
   * Render this splat body to verified pixels. Auto-frames the cloud unless a `camera` is given.
   */
  async render(device: GPUDevice, opts: SplatCharacterRenderOptions = {}): Promise<PixelGrid> {
    const size = opts.size ?? 128;
    const camera = opts.camera ?? framingSplatCamera(this.splats, size, opts.fovYDeg);
    return renderSplats(device, this.splats, { size, clear: opts.clear, camera });
  }

  // ── D.102 "portable agent mind" — identical seam to CharacterHost (opt-in) ──
  /**
   * Bind a portable mind to this body: adopt its wallet identity and load its wallet-scoped memory
   * so the SAME agent inhabits the splat body across substrates. Degrades to body-only on any
   * failure — NEVER throws, and never changes how the body renders.
   */
  async bindMind(mind: CharacterMind, query?: string, limit?: number): Promise<void> {
    this.mind = mind;
    try {
      this.boundIdentity = mind.identity();
      this.memory = await mind.loadMemory(query, limit);
    } catch {
      this.memory = [];
    }
  }

  /** The bound mind's identity (wallet + agent id), or null if no mind is bound. */
  getIdentity(): MindIdentity | null {
    return this.boundIdentity ? { ...this.boundIdentity } : null;
  }

  /** A copy of the loaded wallet-scoped memory (empty if no mind / load failed). */
  getMemory(): MindMemoryEntry[] {
    return this.memory.map((e) => ({ ...e }));
  }

  /** True once a mind has been bound (regardless of whether memory loaded). */
  hasMind(): boolean {
    return this.mind !== null;
  }
}
