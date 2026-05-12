import { describe, it, expect, beforeEach } from 'vitest';
import {
  dynamicRegionMaskHandler,
  buildMaskAttachments,
  type DynamicRegionMaskConfig,
} from '../DynamicRegionMaskTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('DynamicRegionMaskTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('drm-1');
    ctx = createMockContext();
  });

  // ---------------------------------------------------------------------------
  // onAttach — ready event + scene-graph synthesis dispatch
  // ---------------------------------------------------------------------------

  it('emits ready on attach with source defaulting to none', () => {
    attachTrait(dynamicRegionMaskHandler, node, {}, ctx);
    const ev = getLastEvent(ctx, 'dynamic_region_mask:ready') as {
      source: string;
      hasPerFrame: boolean;
    };
    expect(ev).toBeDefined();
    expect(ev.source).toBe('none');
    expect(ev.hasPerFrame).toBe(false);
  });

  it('marks hasPerFrame=true when per-frame map is non-empty', () => {
    attachTrait(
      dynamicRegionMaskHandler,
      node,
      { source: 'per_frame', perFrameMasks: { 'frame-0001': 'https://cdn/m1.png' } },
      ctx
    );
    const ev = getLastEvent(ctx, 'dynamic_region_mask:ready') as { hasPerFrame: boolean };
    expect(ev.hasPerFrame).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // gaussian:capture_frame — per_frame mode (FALSE + TRUE cases per G.GOLD.013)
  // ---------------------------------------------------------------------------

  it('FALSE: source=none does NOT emit frame_attached on capture', () => {
    attachTrait(dynamicRegionMaskHandler, node, {}, ctx);
    sendEvent(dynamicRegionMaskHandler, node, {}, ctx, {
      type: 'gaussian:capture_frame',
      frameKey: 'frame-0001',
    });
    expect(getEventCount(ctx, 'dynamic_region_mask:frame_attached')).toBe(0);
  });

  it('FALSE: per_frame source with frame NOT in map emits nothing', () => {
    const cfg: Partial<DynamicRegionMaskConfig> = {
      source: 'per_frame',
      perFrameMasks: { 'frame-0001': 'https://cdn/m1.png' },
    };
    attachTrait(dynamicRegionMaskHandler, node, cfg, ctx);
    sendEvent(dynamicRegionMaskHandler, node, cfg, ctx, {
      type: 'gaussian:capture_frame',
      frameKey: 'frame-9999',
    });
    expect(getEventCount(ctx, 'dynamic_region_mask:frame_attached')).toBe(0);
  });

  it('TRUE: per_frame source with matching frame emits frame_attached', () => {
    const cfg: Partial<DynamicRegionMaskConfig> = {
      source: 'per_frame',
      perFrameMasks: { 'frame-0001': 'https://cdn/m1.png' },
      dilationPixels: 6,
      invert: true,
      tag: 'capture-A',
    };
    attachTrait(dynamicRegionMaskHandler, node, cfg, ctx);
    sendEvent(dynamicRegionMaskHandler, node, cfg, ctx, {
      type: 'gaussian:capture_frame',
      frameKey: 'frame-0001',
    });
    const ev = getLastEvent(ctx, 'dynamic_region_mask:frame_attached') as {
      frameKey: string;
      maskUrl: string;
      dilationPixels: number;
      invert: boolean;
      tag: string;
    };
    expect(ev.frameKey).toBe('frame-0001');
    expect(ev.maskUrl).toBe('https://cdn/m1.png');
    expect(ev.dilationPixels).toBe(6);
    expect(ev.invert).toBe(true);
    expect(ev.tag).toBe('capture-A');
  });

  // ---------------------------------------------------------------------------
  // gaussian:capture_frame — segmentation_model mode
  // ---------------------------------------------------------------------------

  it('FALSE: segmentation_model source with no model id emits nothing', () => {
    const cfg: Partial<DynamicRegionMaskConfig> = { source: 'segmentation_model' };
    attachTrait(dynamicRegionMaskHandler, node, cfg, ctx);
    sendEvent(dynamicRegionMaskHandler, node, cfg, ctx, {
      type: 'gaussian:capture_frame',
      frameKey: 'frame-0001',
    });
    expect(getEventCount(ctx, 'dynamic_region:inference_request')).toBe(0);
  });

  it('TRUE: segmentation_model source with model id emits inference_request', () => {
    const cfg: Partial<DynamicRegionMaskConfig> = {
      source: 'segmentation_model',
      segmentationModel: 'sam2',
    };
    attachTrait(dynamicRegionMaskHandler, node, cfg, ctx);
    sendEvent(dynamicRegionMaskHandler, node, cfg, ctx, {
      type: 'gaussian:capture_frame',
      frameKey: 'frame-0042',
    });
    const ev = getLastEvent(ctx, 'dynamic_region:inference_request') as {
      frameKey: string;
      model: string;
    };
    expect(ev.frameKey).toBe('frame-0042');
    expect(ev.model).toBe('sam2');
  });

  // ---------------------------------------------------------------------------
  // scene_graph mode — synthesis requests from @dynamic directives
  // ---------------------------------------------------------------------------

  it('FALSE: scene_graph source with no @dynamic children emits zero synthesis requests', () => {
    const sceneNode = {
      id: 'scene-root',
      children: [
        { id: 'static-A', children: [] },
        { id: 'static-B', children: [] },
      ],
    };
    attachTrait(
      dynamicRegionMaskHandler,
      sceneNode as unknown as Record<string, unknown>,
      { source: 'scene_graph' },
      ctx
    );
    expect(getEventCount(ctx, 'dynamic_region:synthesis_request')).toBe(0);
  });

  it('TRUE: scene_graph source emits one synthesis_request per @dynamic descendant (directive form)', () => {
    const sceneNode = {
      id: 'scene-root',
      children: [
        { id: 'static-A' },
        { id: 'dyn-1', directives: [{ name: 'dynamic' }] },
        {
          id: 'group',
          children: [{ id: 'dyn-2', directives: [{ name: 'dynamic' }] }],
        },
      ],
    };
    attachTrait(
      dynamicRegionMaskHandler,
      sceneNode as unknown as Record<string, unknown>,
      { source: 'scene_graph', dilationPixels: 8 },
      ctx
    );
    expect(getEventCount(ctx, 'dynamic_region:synthesis_request')).toBe(2);
    const ev = getLastEvent(ctx, 'dynamic_region:synthesis_request') as {
      dilationPixels: number;
    };
    expect(ev.dilationPixels).toBe(8);
  });

  it('TRUE: scene_graph mode also detects @dynamic via traits Map', () => {
    const sceneNode = {
      id: 'scene-root',
      children: [
        {
          id: 'dyn-via-map',
          traits: new Map<string, unknown>([['dynamic', {}]]),
        },
      ],
    };
    attachTrait(
      dynamicRegionMaskHandler,
      sceneNode as unknown as Record<string, unknown>,
      { source: 'scene_graph' },
      ctx
    );
    expect(getEventCount(ctx, 'dynamic_region:synthesis_request')).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // gaussian:training_job_submit — attachments bundle
  // ---------------------------------------------------------------------------

  it('FALSE: training_job_submit with source=none emits empty attachments array', () => {
    attachTrait(dynamicRegionMaskHandler, node, {}, ctx);
    sendEvent(dynamicRegionMaskHandler, node, {}, ctx, {
      type: 'gaussian:training_job_submit',
      jobId: 'job-1',
    });
    const ev = getLastEvent(ctx, 'dynamic_region_mask:training_attachments') as {
      attachments: unknown[];
      jobId: string | null;
      source: string;
    };
    expect(ev.jobId).toBe('job-1');
    expect(ev.source).toBe('none');
    expect(ev.attachments).toEqual([]);
  });

  it('TRUE: training_job_submit with per_frame source bundles every entry', () => {
    const cfg: Partial<DynamicRegionMaskConfig> = {
      source: 'per_frame',
      perFrameMasks: {
        'frame-0001': 'https://cdn/m1.png',
        'frame-0002': 'https://cdn/m2.png',
      },
      dilationPixels: 3,
    };
    attachTrait(dynamicRegionMaskHandler, node, cfg, ctx);
    sendEvent(dynamicRegionMaskHandler, node, cfg, ctx, {
      type: 'gaussian:training_job_submit',
      jobId: 'job-2',
    });
    const ev = getLastEvent(ctx, 'dynamic_region_mask:training_attachments') as {
      attachments: Array<{ frameKey: string; maskUrl: string; dilationPixels: number }>;
    };
    expect(ev.attachments).toHaveLength(2);
    expect(ev.attachments.map((a) => a.frameKey).sort()).toEqual(['frame-0001', 'frame-0002']);
    for (const a of ev.attachments) expect(a.dilationPixels).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // dynamic_region:query — state reflection
  // ---------------------------------------------------------------------------

  it('reflects accumulated state on query', () => {
    const cfg: Partial<DynamicRegionMaskConfig> = {
      source: 'per_frame',
      perFrameMasks: { 'frame-0001': 'https://cdn/m1.png' },
    };
    attachTrait(dynamicRegionMaskHandler, node, cfg, ctx);
    sendEvent(dynamicRegionMaskHandler, node, cfg, ctx, {
      type: 'gaussian:capture_frame',
      frameKey: 'frame-0001',
    });
    sendEvent(dynamicRegionMaskHandler, node, cfg, ctx, {
      type: 'gaussian:training_job_submit',
      jobId: 'job-9',
    });
    sendEvent(dynamicRegionMaskHandler, node, cfg, ctx, {
      type: 'dynamic_region:query',
      queryId: 'q1',
    });
    const ev = getLastEvent(ctx, 'dynamic_region_mask:state') as {
      queryId: string;
      attachedFrameKeys: string[];
      lastTrainingJobId: string | null;
    };
    expect(ev.queryId).toBe('q1');
    expect(ev.attachedFrameKeys).toEqual(['frame-0001']);
    expect(ev.lastTrainingJobId).toBe('job-9');
  });

  // ---------------------------------------------------------------------------
  // buildMaskAttachments — pure helper (deterministic, fully unit-testable)
  // ---------------------------------------------------------------------------

  describe('buildMaskAttachments (pure)', () => {
    const base: DynamicRegionMaskConfig = {
      source: 'none',
      perFrameMasks: {},
      dilationPixels: 4,
      invert: false,
    };

    it('FALSE: non-per_frame source returns []', () => {
      expect(buildMaskAttachments({ ...base, source: 'none' })).toEqual([]);
      expect(buildMaskAttachments({ ...base, source: 'scene_graph' })).toEqual([]);
      expect(buildMaskAttachments({ ...base, source: 'segmentation_model' })).toEqual([]);
    });

    it('FALSE: per_frame with empty map returns []', () => {
      expect(buildMaskAttachments({ ...base, source: 'per_frame' })).toEqual([]);
    });

    it('TRUE: per_frame map produces one attachment per entry preserving dilation/invert', () => {
      const out = buildMaskAttachments({
        ...base,
        source: 'per_frame',
        perFrameMasks: { a: 'urlA', b: 'urlB' },
        dilationPixels: 7,
        invert: true,
      });
      expect(out).toHaveLength(2);
      expect(out.every((a) => a.dilationPixels === 7)).toBe(true);
      expect(out.every((a) => a.invert === true)).toBe(true);
    });
  });
});
