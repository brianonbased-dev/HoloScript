/**
 * MultiviewGaussianRenderer Trait
 * Shared preprocessing with per-user foveated blending for multi-user VR.
 * @version 1.0.0
 */
export interface ViewConfig {
  userId: string;
  eyePosition: [number, number, number];
  eyeDirection: [number, number, number];
  foveationCenter: [number, number]; // normalized NDC
  foveationRadius: number; // 0-1
  ipd: number; // interpupillary distance
}

export interface FoveatedBlendConfig {
  innerRadius: number; // full quality
  outerRadius: number; // reduced quality
  innerQuality: number; // 1.0 = full gaussians
  outerQuality: number; // 0.25 = quarter gaussians
  peripheralDecimation: number; // 0-1
}

export interface MultiviewRenderResult {
  sharedPreprocessMs: number;
  perViewSortMs: number[];
  perViewRenderMs: number[];
  totalGaussians: number;
  effectiveGaussiansPerView: number[];
  foveationSavingsPercent: number;
}

export const DEFAULT_FOVEATED_BLEND: FoveatedBlendConfig = {
  innerRadius: 0.15,
  outerRadius: 0.6,
  innerQuality: 1.0,
  outerQuality: 0.25,
  peripheralDecimation: 0.5,
};

export const LOCAL_WEBCAM_VIEW_ID = 'local-webcam';

/** Cosine of the half-FOV used for the cone-test visibility approximation.
 *  cos(60deg) = 0.5 — generous on purpose. Per-view rasterizers drop invisible
 *  splats cheaply; bitmask false-positives are fine, false-negatives are popping
 *  artifacts. Per-platform FOV refinement is future work. */
const DEFAULT_HALF_FOV_COS = 0.5;

/** Maximum number of views encodable in the uint32 visibility bitmask. P.043's
 *  practical ceiling is N=8-12; 32 leaves headroom without going to uint64. */
const MAX_BITMASK_VIEWS = 32;

export interface PreprocessResult {
  sortedIndices: Uint32Array;
  preprocessMs: number;
  /** When views + positions are populated: bit v of bitmask[g] indicates that
   *  gaussian g is visible from viewOrder()[v]. Undefined in iota-fallback mode. */
  visibilityBitmasks?: Uint32Array;
  /** Stable view-id list aligned to bit positions in visibilityBitmasks. */
  viewOrder?: string[];
}

export class MultiviewGaussianRendererTrait {
  public readonly traitName = 'MultiviewGaussianRenderer';
  private views: Map<string, ViewConfig> = new Map();
  private blendConfig: FoveatedBlendConfig;
  private sharedSortBuffer: Float32Array | null = null;
  private gaussianCount: number = 0;
  /** Flat x,y,z positions; length === gaussianCount * 3 when populated. */
  private gaussianPositions: Float32Array | null = null;
  /** Per-gaussian visibility bitmask. Bit v set iff gaussian visible in viewOrder[v]. */
  private visibilityBitmasks: Uint32Array | null = null;
  /** Stable view-id order; index into this array maps to bit position in bitmasks. */
  private viewOrder: string[] = [];

  constructor(blendConfig: Partial<FoveatedBlendConfig> = {}) {
    this.blendConfig = { ...DEFAULT_FOVEATED_BLEND, ...blendConfig };
  }

  addView(view: ViewConfig): void {
    this.views.set(view.userId, view);
  }
  removeView(userId: string): void {
    this.views.delete(userId);
  }
  updateView(userId: string, update: Partial<ViewConfig>): void {
    const v = this.views.get(userId);
    if (v) this.views.set(userId, { ...v, ...update });
  }

  upsertView(view: ViewConfig): void {
    const existing = this.views.get(view.userId);
    this.views.set(view.userId, existing ? { ...existing, ...view } : view);
  }

  getViewConfig(userId: string): ViewConfig | null {
    const view = this.views.get(userId);
    return view ? { ...view } : null;
  }

  setGaussianCount(count: number): void {
    this.gaussianCount = count;
  }

  /** Provide flat x,y,z positions for the gaussian set (length === count*3).
   *  When present (with at least one view registered), preprocess() does the
   *  P.043 shared centroid sort + per-view visibility bitmask. When absent,
   *  preprocess() falls back to iota indices (backward-compatible). */
  setGaussianPositions(positions: Float32Array): void {
    if (positions.length % 3 !== 0) {
      throw new Error(
        `MultiviewGaussianRenderer: positions length ${positions.length} is not divisible by 3`
      );
    }
    this.gaussianPositions = positions;
    if (this.gaussianCount === 0) this.gaussianCount = positions.length / 3;
  }

  /** Stable view-id order from the last preprocess(). Bit v of the visibility
   *  bitmask maps to viewOrder[v]. Empty when no views registered. */
  getViewOrder(): string[] {
    return [...this.viewOrder];
  }

  /** Per-gaussian visibility bitmask from the last preprocess(). null in
   *  iota-fallback mode (no positions or no views). */
  getVisibilityBitmasks(): Uint32Array | null {
    return this.visibilityBitmasks;
  }

  /** P.043 shared preprocess:
   *   1. Compute centroid eye position across all registered views.
   *   2. Sort gaussians back-to-front by distance from centroid (alpha-correct).
   *   3. Build per-gaussian visibility bitmask via cone test against each view.
   *
   *  Falls back to iota indices when no positions OR no views are registered.
   *  This keeps the existing single-user / view-less contract intact. */
  preprocess(): PreprocessResult {
    const start = performance.now();
    const N = this.gaussianCount;
    const indices = new Uint32Array(N);

    // FALSE CASE: no positions OR no views → iota fallback (preserves
    // pre-2026-05-12 contract for callers that only set gaussianCount).
    if (!this.gaussianPositions || this.views.size === 0) {
      for (let i = 0; i < N; i++) indices[i] = i;
      this.viewOrder = [];
      this.visibilityBitmasks = null;
      return { sortedIndices: indices, preprocessMs: performance.now() - start };
    }

    // Stable view-id order. Map.keys() preserves insertion order in modern JS.
    this.viewOrder = Array.from(this.views.keys()).slice(0, MAX_BITMASK_VIEWS);
    const numViews = this.viewOrder.length;
    const viewArr: ViewConfig[] = this.viewOrder.map((uid) => this.views.get(uid)!);

    // Compute centroid eye position across all views.
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const v of viewArr) {
      cx += v.eyePosition[0];
      cy += v.eyePosition[1];
      cz += v.eyePosition[2];
    }
    cx /= numViews;
    cy /= numViews;
    cz /= numViews;

    // Per-gaussian distance to centroid (squared — monotonic, avoids sqrt).
    const positions = this.gaussianPositions;
    const distances = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];
      const dx = px - cx;
      const dy = py - cy;
      const dz = pz - cz;
      distances[i] = dx * dx + dy * dy + dz * dz;
    }

    // Sort indices descending by distance (back-to-front for alpha-compositing).
    // Array sort is fine at this scale; WGSL port will use radix sort.
    const idxArr = new Array<number>(N);
    for (let i = 0; i < N; i++) idxArr[i] = i;
    idxArr.sort((a, b) => distances[b] - distances[a]);
    for (let i = 0; i < N; i++) indices[i] = idxArr[i];

    // Per-gaussian visibility bitmask via cone test against each view.
    const bitmask = new Uint32Array(N);
    // Pre-normalize each view's eye direction once.
    const normDirs = new Float32Array(numViews * 3);
    for (let v = 0; v < numViews; v++) {
      const d = viewArr[v].eyeDirection;
      const len = Math.hypot(d[0], d[1], d[2]) || 1;
      normDirs[v * 3] = d[0] / len;
      normDirs[v * 3 + 1] = d[1] / len;
      normDirs[v * 3 + 2] = d[2] / len;
    }

    for (let i = 0; i < N; i++) {
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];
      let mask = 0;

      for (let v = 0; v < numViews; v++) {
        const view = viewArr[v];
        const rx = px - view.eyePosition[0];
        const ry = py - view.eyePosition[1];
        const rz = pz - view.eyePosition[2];
        const rlen = Math.hypot(rx, ry, rz);
        if (rlen < 1e-6) {
          // Gaussian colocated with eye — count as visible (degenerate case).
          mask |= 1 << v;
          continue;
        }
        const nrx = rx / rlen;
        const nry = ry / rlen;
        const nrz = rz / rlen;
        const dx_n = normDirs[v * 3];
        const dy_n = normDirs[v * 3 + 1];
        const dz_n = normDirs[v * 3 + 2];
        const dot = nrx * dx_n + nry * dy_n + nrz * dz_n;
        if (dot >= DEFAULT_HALF_FOV_COS) {
          mask |= 1 << v;
        }
      }

      bitmask[i] = mask;
    }

    this.visibilityBitmasks = bitmask;

    return {
      sortedIndices: indices,
      preprocessMs: performance.now() - start,
      visibilityBitmasks: bitmask,
      viewOrder: [...this.viewOrder],
    };
  }

  /** Filter the globally-sorted indices into per-view arrays using the
   *  visibility bitmask from the most recent preprocess(). Order within each
   *  per-view array preserves the shared back-to-front sort. */
  getPerViewIndices(sortedIndices: Uint32Array): Map<string, Uint32Array> {
    const result = new Map<string, Uint32Array>();

    // No bitmask → every registered view sees the full shared sort.
    if (!this.visibilityBitmasks || this.viewOrder.length === 0) {
      for (const userId of this.views.keys()) {
        result.set(userId, sortedIndices);
      }
      return result;
    }

    const bitmasks = this.visibilityBitmasks;
    const numViews = this.viewOrder.length;
    // First pass: count visible-per-view to allocate exactly-sized Uint32Arrays.
    const counts = new Uint32Array(numViews);
    for (let i = 0; i < sortedIndices.length; i++) {
      const gIdx = sortedIndices[i];
      const m = bitmasks[gIdx];
      for (let v = 0; v < numViews; v++) {
        if (m & (1 << v)) counts[v]++;
      }
    }
    const perView: Uint32Array[] = new Array(numViews);
    const writeHeads = new Uint32Array(numViews);
    for (let v = 0; v < numViews; v++) perView[v] = new Uint32Array(counts[v]);

    // Second pass: scatter sorted indices into per-view arrays (preserves order).
    for (let i = 0; i < sortedIndices.length; i++) {
      const gIdx = sortedIndices[i];
      const m = bitmasks[gIdx];
      for (let v = 0; v < numViews; v++) {
        if (m & (1 << v)) {
          perView[v][writeHeads[v]++] = gIdx;
        }
      }
    }

    for (let v = 0; v < numViews; v++) {
      result.set(this.viewOrder[v], perView[v]);
    }
    return result;
  }

  getEffectiveCount(viewConfig: ViewConfig): number {
    // Foveated reduction: full count in fovea, reduced in periphery
    const fovealArea = Math.PI * this.blendConfig.innerRadius ** 2;
    const totalArea = 1.0; // normalized
    const fovealFraction = fovealArea / totalArea;
    const peripheralFraction = 1 - fovealFraction;
    return Math.ceil(
      this.gaussianCount * fovealFraction * this.blendConfig.innerQuality +
        this.gaussianCount * peripheralFraction * this.blendConfig.outerQuality
    );
  }

  estimateSavings(): number {
    if (this.views.size === 0) return 0;
    const naiveTotal = this.gaussianCount * this.views.size;
    let effectiveTotal = 0;
    for (const view of this.views.values()) effectiveTotal += this.getEffectiveCount(view);
    return naiveTotal > 0 ? ((naiveTotal - effectiveTotal) / naiveTotal) * 100 : 0;
  }

  getViewCount(): number {
    return this.views.size;
  }
  getBlendConfig(): FoveatedBlendConfig {
    return { ...this.blendConfig };
  }
  setBlendConfig(config: Partial<FoveatedBlendConfig>): void {
    Object.assign(this.blendConfig, config);
  }
}

// ── Handler (delegates to MultiviewGaussianRendererTrait) ──
import type {
  TraitHandler,
  HSPlusNode,
  TraitContext,
  TraitEvent,
  TraitInstanceDelegate,
} from './TraitTypes';

export const multiviewGaussianRendererHandler = {
  name: 'multiview_gaussian_renderer',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): void {
    // @ts-expect-error
    const instance = new MultiviewGaussianRendererTrait(config);
    node.__multiview_gaussian_renderer_instance = instance;
    ctx.emit('multiview_gaussian_renderer_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: unknown, ctx: TraitContext): void {
    const instance = node.__multiview_gaussian_renderer_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('multiview_gaussian_renderer_detached', { node });
    delete node.__multiview_gaussian_renderer_instance;
  },
  onEvent(node: HSPlusNode, _config: unknown, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__multiview_gaussian_renderer_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'multiview_gaussian_renderer_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('multiview_gaussian_renderer_configured', { node });
    }
    if (event.type === 'foveal_center_update') {
      const eventRecord = event as unknown as Record<string, unknown>;
      const payload =
        eventRecord.payload && typeof eventRecord.payload === 'object'
          ? (eventRecord.payload as Record<string, unknown>)
          : eventRecord;
      const center = payload.foveal_center ?? payload.fovealCenter;
      if (
        !Array.isArray(center) ||
        center.length !== 2 ||
        typeof center[0] !== 'number' ||
        typeof center[1] !== 'number'
      ) {
        return;
      }
      const userId = typeof payload.userId === 'string' ? payload.userId : LOCAL_WEBCAM_VIEW_ID;
      const renderer = instance as unknown as MultiviewGaussianRendererTrait;
      renderer.upsertView({
        userId,
        eyePosition: [0, 0, 0],
        eyeDirection: [0, 0, -1],
        foveationCenter: [center[0], center[1]],
        foveationRadius: DEFAULT_FOVEATED_BLEND.innerRadius,
        ipd: 0.063,
      });
      ctx.emit('multiview_gaussian_renderer_foveal_center_updated', {
        node,
        userId,
        foveationCenter: [center[0], center[1]],
      });
    }
  },
  onUpdate(node: HSPlusNode, _config: unknown, ctx: TraitContext, dt: number): void {
    const instance = node.__multiview_gaussian_renderer_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
