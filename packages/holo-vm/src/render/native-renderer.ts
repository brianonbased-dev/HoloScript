/**
 * NativeHoloRenderer — vertical slice (D.083 native-first sovereign execution).
 *
 * THE KEYSTONE: draws HoloVM world state to pixels with ZERO foreign engine
 * (no three.js, no react, no cannon). The audit (2026-06-05) found that
 * @holoscript/holo-vm is a real native VM but computes STATE only — every visible
 * pixel routed through Three.js. This module closes that gap at the source: it reads
 * an ECSWorld (the VM's canonical world state) and rasterizes it natively.
 *
 * This file lives INSIDE holo-vm precisely because holo-vm has zero foreign deps —
 * so "the native render path imports no three" is true by construction.
 *
 * SLICE SCOPE: orthographic projection + per-entity quad fill via a CPU software
 * backend (the Canvas2D-fallback tier). It proves the path VM-state → native pixels.
 * The WebGPU backend (primary tier) implements the SAME RenderBackend interface and
 * drops in next — see WebGPURenderBackend stub note at the bottom.
 */

import {
  ECSWorld,
  type TransformComponent,
  type GeometryComponent,
  type MaterialComponent,
} from '../executor';
import { ComponentType, HoloTraitId } from '../opcodes';

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Unpack a packed 0xRRGGBB material color (HoloVM MaterialComponent.color) to RGBA. */
export function unpackColor(packed: number, opacity = 1): RGBA {
  return {
    r: (packed >> 16) & 0xff,
    g: (packed >> 8) & 0xff,
    b: packed & 0xff,
    a: Math.round(Math.max(0, Math.min(1, opacity)) * 255),
  };
}

/** A native RGBA framebuffer — no canvas/DOM/foreign dep; just bytes. */
export class NativeFramebuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray; // RGBA, row-major

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  clear(c: RGBA): void {
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = c.r;
      this.data[i + 1] = c.g;
      this.data[i + 2] = c.b;
      this.data[i + 3] = c.a;
    }
  }

  /** Read a pixel as RGBA (out-of-bounds → transparent black). */
  pixel(x: number, y: number): RGBA {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return { r: 0, g: 0, b: 0, a: 0 };
    const i = (y * this.width + x) * 4;
    return { r: this.data[i], g: this.data[i + 1], b: this.data[i + 2], a: this.data[i + 3] };
  }
}

/** Backend a renderer draws through. SoftwareRasterBackend is the CPU tier; the
 *  WebGPU tier implements the same three methods over a GPUDevice. */
export interface RenderBackend {
  begin(clear: RGBA): void;
  /** Axis-aligned filled quad in pixel space (the slice's only primitive). */
  drawQuad(cx: number, cy: number, halfW: number, halfH: number, color: RGBA): void;
  end(): void;
}

/** CPU rasterizer → NativeFramebuffer. Zero foreign deps; fully testable in Node. */
export class SoftwareRasterBackend implements RenderBackend {
  constructor(private readonly fb: NativeFramebuffer) {}

  begin(clear: RGBA): void {
    this.fb.clear(clear);
  }

  drawQuad(cx: number, cy: number, halfW: number, halfH: number, color: RGBA): void {
    const x0 = Math.max(0, Math.floor(cx - halfW));
    const x1 = Math.min(this.fb.width - 1, Math.ceil(cx + halfW));
    const y0 = Math.max(0, Math.floor(cy - halfH));
    const y1 = Math.min(this.fb.height - 1, Math.ceil(cy + halfH));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y * this.fb.width + x) * 4;
        this.fb.data[i] = color.r;
        this.fb.data[i + 1] = color.g;
        this.fb.data[i + 2] = color.b;
        this.fb.data[i + 3] = color.a;
      }
    }
  }

  end(): void {
    /* CPU backend writes directly; nothing to flush */
  }
}

/** Orthographic camera: world units → pixels. Camera looks down -Z; X right, Y up. */
export interface OrthoCamera {
  /** Pixels per world unit. */
  pixelsPerUnit: number;
  /** World-space point mapped to the framebuffer center. */
  centerWorld: { x: number; y: number };
}

export interface RenderStats {
  entitiesConsidered: number;
  entitiesDrawn: number;
  /** IDs of entities carrying the @rigid (HoloTraitId.Rigid) trait. */
  rigidEntities: number[];
  /** IDs of entities carrying the @grabbable (HoloTraitId.Grabbable) trait. */
  grabbableEntities: number[];
  /** Set of all trait IDs present in the drawn frame (union across all entities). */
  activeTraitIds: Set<number>;
}

/**
 * Reads an ECSWorld (HoloVM canonical world state) and draws every renderable entity
 * (has Transform + Geometry + Material, alive) natively through the backend.
 * Painter's order = entity id (deterministic). Back-to-front depth is a later increment.
 *
 * TRAIT DISPATCH (D.083 native-first, task_1780656313424_h762):
 *   Entity.traits (a Set<number> maintained by APPLY_TRAIT / REMOVE_TRAIT opcodes in
 *   HoloVM) is read here each frame. Trait IDs use the HoloTraitId enum as the stable
 *   numeric contract between bytecode and renderer. No Three.js TraitSystem is involved —
 *   this is the canonical HoloVM → NativeHoloRenderer pipeline.
 *
 *   Current trait visual effects (first vertical slice):
 *     @rigid (0x01)     — no change to fill color; entity is catalogued in RenderStats.rigidEntities.
 *     @grabbable (0x02) — entity fill is BRIGHTENED by +40 on each RGB channel so the
 *                         user can see which objects are interactable. This is the only
 *                         non-trivial visual signal in the slice; more sophisticated
 *                         outline/highlight passes follow in the WebGPU backend.
 */
export class NativeHoloRenderer {
  constructor(private readonly backend: RenderBackend) {}

  render(
    world: ECSWorld,
    fb: { width: number; height: number },
    camera: OrthoCamera,
    clear: RGBA = { r: 18, g: 18, b: 22, a: 255 }
  ): RenderStats {
    this.backend.begin(clear);
    const cx0 = fb.width / 2;
    const cy0 = fb.height / 2;
    let considered = 0;
    let drawn = 0;
    const rigidEntities: number[] = [];
    const grabbableEntities: number[] = [];
    const activeTraitIds = new Set<number>();

    const entities = world.getAllEntities().sort((a, b) => a.id - b.id);
    for (const e of entities) {
      if (!e.alive) continue;
      considered++;
      const t = world.getComponent<TransformComponent>(e.id, ComponentType.Transform);
      const g = world.getComponent<GeometryComponent>(e.id, ComponentType.Geometry);
      const m = world.getComponent<MaterialComponent>(e.id, ComponentType.Material);
      if (!t || !g || !m) continue; // only renderable entities

      // ── Read VM trait state from the entity (set by APPLY_TRAIT opcode) ──────
      const isRigid = e.traits.has(HoloTraitId.Rigid);
      const isGrabbable = e.traits.has(HoloTraitId.Grabbable);

      // Catalogue trait IDs for caller inspection.
      for (const tid of e.traits) {
        activeTraitIds.add(tid);
      }
      if (isRigid) rigidEntities.push(e.id);
      if (isGrabbable) grabbableEntities.push(e.id);

      // ── Trait-driven visual effect: @grabbable brightens the entity fill ─────
      let color = unpackColor(m.color, m.opacity);
      if (isGrabbable) {
        // Brighten by +40 on each RGB channel (clamped to 255) to signal interactability.
        color = {
          r: Math.min(255, color.r + 40),
          g: Math.min(255, color.g + 40),
          b: Math.min(255, color.b + 40),
          a: color.a,
        };
      }

      // Orthographic projection: world XY → screen px (Y inverted: screen-down).
      const sx = cx0 + (t.position.x - camera.centerWorld.x) * camera.pixelsPerUnit;
      const sy = cy0 - (t.position.y - camera.centerWorld.y) * camera.pixelsPerUnit;
      // Half-extent from transform scale (slice: geometry-param sizing comes later).
      const halfW = Math.max(0.5, Math.abs(t.scale.x) * 0.5 * camera.pixelsPerUnit);
      const halfH = Math.max(0.5, Math.abs(t.scale.y) * 0.5 * camera.pixelsPerUnit);

      this.backend.drawQuad(sx, sy, halfW, halfH, color);
      drawn++;
    }

    this.backend.end();
    return { entitiesConsidered: considered, entitiesDrawn: drawn, rigidEntities, grabbableEntities, activeTraitIds };
  }
}

/*
 * NEXT INCREMENT — WebGPURenderBackend (primary tier, browser/Dawn):
 *   class WebGPURenderBackend implements RenderBackend, backed by the existing
 *   @holoscript/engine gpu/WebGPUContext + an instanced quad pipeline (WGSL). It
 *   implements begin()=clear pass, drawQuad()=enqueue an instance, end()=submit.
 *   The renderer above is backend-agnostic, so the GPU tier is a drop-in. Generalize
 *   geometry (Sphere→disc, Mesh→indexed draw), add depth sort, lights, WGSL materials.
 */
