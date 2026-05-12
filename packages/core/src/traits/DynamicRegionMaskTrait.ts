/**
 * DynamicRegionMaskTrait
 *
 * Declares per-frame mask regions for 3D Gaussian Splatting capture/training.
 * Closes the Brush-vs-HoloScript gap identified in
 * research/2026-05-12_brush-vs-holoscript-audit-calibration.md §3.2 — Brush
 * suppresses dynamic objects during training; HoloScript previously had no
 * surface for it.
 *
 * HoloScript wedge over Brush: masks are declarative at the scene-graph level
 * (`@dynamic` annotations on existing nodes) and synthesized into per-frame
 * inputs at compile time. Brush requires hand-painted masks.
 *
 * Scope (this version): trait declaration + event protocol only. The actual
 * mask payload injection into `GaussianBakingConfig.frameMasks` is a
 * separate follow-up — see research/2026-05-12_dynamic-region-mask-trait.md.
 *
 * @version 0.1.0
 */

import type { TraitHandler, TraitContext, TraitEvent, HSPlusNode } from './TraitTypes';
import { extractPayload } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

/**
 * How the per-frame mask URLs are produced.
 *
 * - `none`: no masking (training proceeds with raw frames). Mirrors Brush's
 *   default — masking is opt-in.
 * - `per_frame`: caller supplies an explicit `frameKey -> maskUrl` map. Maps
 *   directly onto the existing Brush mask pipeline.
 * - `scene_graph`: walk the AST for nodes annotated `@dynamic` and emit
 *   `dynamic_region:synthesis_request` events. HoloScript-only wedge — the
 *   compile-time mask story.
 * - `segmentation_model`: caller routes a model id (sam2, mediapipe, etc.)
 *   to a downstream consumer that runs inference per-frame. Trait stays
 *   model-agnostic; consumer registration is out of scope here.
 */
export type DynamicRegionMaskSource =
  | 'none'
  | 'per_frame'
  | 'scene_graph'
  | 'segmentation_model';

export interface DynamicRegionMaskConfig {
  /** Mask production strategy (default: `'none'`). */
  source: DynamicRegionMaskSource;
  /** Explicit per-frame URLs when `source === 'per_frame'`. */
  perFrameMasks: Record<string, string>;
  /** Pixels of dilation applied around mask edges (default: 4). */
  dilationPixels: number;
  /** If true, the mask marks REGIONS TO KEEP. If false, marks regions to suppress (Brush default). */
  invert: boolean;
  /** Segmentation model id when `source === 'segmentation_model'`. */
  segmentationModel?: string;
  /** Tag passed back in all emitted events for routing/correlation. */
  tag?: string;
}

export interface DynamicRegionMaskState {
  /** Frame keys for which mask requests have been emitted. */
  attachedFrameKeys: string[];
  /** Total synthesis requests emitted from scene-graph walks. */
  synthesisRequestCount: number;
  /** Last submitted training job id (if observed via `gaussian:training_job_submit`). */
  lastTrainingJobId: string | null;
}

// =============================================================================
// INTERNALS
// =============================================================================

function getState(node: HSPlusNode): DynamicRegionMaskState | undefined {
  return node.__dynamicRegionMaskState as DynamicRegionMaskState | undefined;
}

function initState(node: HSPlusNode): DynamicRegionMaskState {
  const state: DynamicRegionMaskState = {
    attachedFrameKeys: [],
    synthesisRequestCount: 0,
    lastTrainingJobId: null,
  };
  node.__dynamicRegionMaskState = state;
  return state;
}

export interface DynamicRegionMaskAttachment {
  frameKey: string;
  maskUrl: string;
  dilationPixels: number;
  invert: boolean;
}

/**
 * Build the mask attachment list emitted alongside training job submission.
 * Pure / deterministic so tests can exercise it without event plumbing.
 */
export function buildMaskAttachments(
  config: DynamicRegionMaskConfig
): DynamicRegionMaskAttachment[] {
  if (config.source !== 'per_frame') return [];
  const entries = Object.entries(config.perFrameMasks);
  return entries.map(([frameKey, maskUrl]) => ({
    frameKey,
    maskUrl,
    dilationPixels: config.dilationPixels,
    invert: config.invert,
  }));
}

/** Detect nodes whose directives or trait map include the `@dynamic` annotation. */
function isDynamicNode(child: unknown): boolean {
  if (!child || typeof child !== 'object') return false;
  const node = child as HSPlusNode & {
    directives?: Array<{ name?: string }>;
    traits?: Map<string, unknown> | Record<string, unknown>;
  };
  if (Array.isArray(node.directives)) {
    for (const d of node.directives) {
      if (d && d.name === 'dynamic') return true;
    }
  }
  if (node.traits instanceof Map) {
    if (node.traits.has('dynamic')) return true;
  } else if (node.traits && typeof node.traits === 'object') {
    if ('dynamic' in (node.traits as Record<string, unknown>)) return true;
  }
  return false;
}

function collectDynamicNodes(root: HSPlusNode): HSPlusNode[] {
  const out: HSPlusNode[] = [];
  const stack: unknown[] = [root];
  const seen = new Set<unknown>();
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;
    seen.add(cur);
    if (cur !== root && isDynamicNode(cur)) {
      out.push(cur as HSPlusNode);
    }
    const children = (cur as { children?: unknown }).children;
    if (Array.isArray(children)) {
      for (const c of children) stack.push(c);
    }
  }
  return out;
}

// =============================================================================
// HANDLER
// =============================================================================

export const dynamicRegionMaskHandler: TraitHandler<DynamicRegionMaskConfig> = {
  name: 'dynamic_region_mask',

  defaultConfig: {
    source: 'none',
    perFrameMasks: {},
    dilationPixels: 4,
    invert: false,
  },

  onAttach(node, config, context) {
    const state = initState(node);
    context.emit?.('dynamic_region_mask:ready', {
      node,
      source: config.source,
      tag: config.tag,
      hasPerFrame: Object.keys(config.perFrameMasks).length > 0,
    });

    if (config.source === 'scene_graph') {
      const targets = collectDynamicNodes(node);
      for (const target of targets) {
        state.synthesisRequestCount += 1;
        context.emit?.('dynamic_region:synthesis_request', {
          targetNode: target,
          dilationPixels: config.dilationPixels,
          invert: config.invert,
          tag: config.tag,
        });
      }
    }
  },

  onDetach(node) {
    delete node.__dynamicRegionMaskState;
  },

  onEvent(node, config, context, event) {
    const state = getState(node);
    if (!state) return;

    if (event.type === 'gaussian:capture_frame') {
      const payload = extractPayload(event);
      const frameKey = String(payload.frameKey ?? '');
      if (!frameKey) return;

      if (config.source === 'per_frame') {
        const maskUrl = config.perFrameMasks[frameKey];
        if (!maskUrl) return; // silent miss is intentional — caller can probe via :query
        state.attachedFrameKeys.push(frameKey);
        context.emit?.('dynamic_region_mask:frame_attached', {
          frameKey,
          maskUrl,
          dilationPixels: config.dilationPixels,
          invert: config.invert,
          tag: config.tag,
        });
        return;
      }

      if (config.source === 'segmentation_model' && config.segmentationModel) {
        state.attachedFrameKeys.push(frameKey);
        context.emit?.('dynamic_region:inference_request', {
          frameKey,
          model: config.segmentationModel,
          dilationPixels: config.dilationPixels,
          invert: config.invert,
          tag: config.tag,
        });
        return;
      }
      return;
    }

    if (event.type === 'gaussian:training_job_submit') {
      const payload = extractPayload(event);
      const jobId = String(payload.jobId ?? '');
      state.lastTrainingJobId = jobId || null;
      const attachments = buildMaskAttachments(config);
      context.emit?.('dynamic_region_mask:training_attachments', {
        jobId: state.lastTrainingJobId,
        attachments,
        source: config.source,
        tag: config.tag,
      });
      return;
    }

    if (event.type === 'dynamic_region:query') {
      const payload = extractPayload(event);
      context.emit?.('dynamic_region_mask:state', {
        queryId: payload.queryId,
        source: config.source,
        attachedFrameKeys: [...state.attachedFrameKeys],
        synthesisRequestCount: state.synthesisRequestCount,
        lastTrainingJobId: state.lastTrainingJobId,
        tag: config.tag,
      });
      return;
    }
  },
};

export default dynamicRegionMaskHandler;
