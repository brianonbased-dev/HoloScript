/**
 * PortableTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { portableHandler } from '../PortableTrait';

function makeNode(extras: any = {}) {
  return { id: 'portable_node', ...extras };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function attach(cfg: any = {}, nodeExtras: any = {}) {
  const node = makeNode(nodeExtras);
  const ctx = makeCtx();
  const config = { ...portableHandler.defaultConfig!, ...cfg };
  portableHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('portableHandler.defaultConfig', () => {
  const d = portableHandler.defaultConfig!;
  it('interoperable=true', () => expect(d.interoperable).toBe(true));
  it('export_formats includes gltf', () => expect(d.export_formats).toContain('gltf'));
  it('metadata_standard=gltf_pbr', () => expect(d.metadata_standard).toBe('gltf_pbr'));
  it('cross_platform=true', () => expect(d.cross_platform).toBe(true));
  it('version=1.0', () => expect(d.version).toBe('1.0'));
  it('preserve_animations=true', () => expect(d.preserve_animations).toBe(true));
  it('preserve_physics=false', () => expect(d.preserve_physics).toBe(false));
  it('optimize_for_web=true', () => expect(d.optimize_for_web).toBe(true));
});

// ─── onAttach / analyzePortability ────────────────────────────────────────────

describe('portableHandler.onAttach', () => {
  it('creates __portableState', () => expect(attach().node.__portableState).toBeDefined());
  it('isExportReady=true after attach (clean node score ≥ 0.5)', () =>
    expect(attach().node.__portableState.isExportReady).toBe(true));
  it('lastExportTime=0', () => expect(attach().node.__portableState.lastExportTime).toBe(0));
  it('exportedFormats starts empty', () =>
    expect(attach().node.__portableState.exportedFormats.size).toBe(0));
  it('emits portable_analysis_complete on attach', () => {
    const { ctx } = attach();
    expect(ctx.emit).toHaveBeenCalledWith(
      'portable_analysis_complete',
      expect.objectContaining({ score: expect.any(Number) })
    );
  });
  it('score=1.0 for default clean node', () => {
    const { node } = attach();
    expect(node.__portableState.portabilityScore).toBeCloseTo(1.0);
  });
  it('isExportReady=true when score >= 0.5', () => {
    const { node } = attach();
    expect(node.__portableState.isExportReady).toBe(true);
  });
  it('customShader reduces score by 0.2', () => {
    const { node } = attach({}, { customShader: true });
    expect(node.__portableState.portabilityScore).toBeCloseTo(0.8);
  });
  it('customShader adds warning', () => {
    const { node } = attach({}, { customShader: true });
    expect(
      node.__portableState.warnings.some((w: string) => w.toLowerCase().includes('shader'))
    ).toBe(true);
  });
  it('preserve_physics adds warning and reduces score', () => {
    const { node } = attach({ preserve_physics: true });
    expect(node.__portableState.portabilityScore).toBeCloseTo(0.9);
    expect(
      node.__portableState.warnings.some((w: string) => w.toLowerCase().includes('physics'))
    ).toBe(true);
  });
  it('scripts without cross_platform adds warning', () => {
    const { node } = attach({ cross_platform: false }, { scripts: ['someScript'] });
    expect(
      node.__portableState.warnings.some((w: string) => w.toLowerCase().includes('script'))
    ).toBe(true);
  });
  it('multiple issues compound score reduction', () => {
    const { node } = attach({ preserve_physics: true }, { customShader: true });
    expect(node.__portableState.portabilityScore).toBeCloseTo(0.7);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('portableHandler.onDetach', () => {
  it('removes __portableState', () => {
    const { node, config, ctx } = attach();
    portableHandler.onDetach!(node, config, ctx);
    expect(node.__portableState).toBeUndefined();
  });
});

// ─── onEvent — portable_export ────────────────────────────────────────────────

describe('portableHandler.onEvent — portable_export', () => {
  it('emits portable_generate_export with format', () => {
    const { node, ctx, config } = attach({ export_formats: ['gltf', 'glb'] });
    ctx.emit.mockClear();
    portableHandler.onEvent!(node, config, ctx, { type: 'portable_export', format: 'glb' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'portable_generate_export',
      expect.objectContaining({ format: 'glb' })
    );
  });
  it('uses first format when none specified', () => {
    const { node, ctx, config } = attach({ export_formats: ['usdz', 'gltf'] });
    ctx.emit.mockClear();
    portableHandler.onEvent!(node, config, ctx, { type: 'portable_export' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'portable_generate_export',
      expect.objectContaining({ format: 'usdz' })
    );
  });
  it('rejects unsupported format with on_portable_error', () => {
    const { node, ctx, config } = attach({ export_formats: ['gltf'] });
    ctx.emit.mockClear();
    portableHandler.onEvent!(node, config, ctx, { type: 'portable_export', format: 'fbx' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_portable_error',
      expect.objectContaining({ error: expect.stringContaining('fbx') })
    );
  });
  it('includes metadataStandard, preserveAnimations, optimizeForWeb in export event', () => {
    const { node, ctx, config } = attach({
      export_formats: ['gltf'],
      preserve_animations: true,
      optimize_for_web: true,
    });
    ctx.emit.mockClear();
    portableHandler.onEvent!(node, config, ctx, { type: 'portable_export', format: 'gltf' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'portable_generate_export')!;
    expect(call[1].preserveAnimations).toBe(true);
    expect(call[1].optimizeForWeb).toBe(true);
  });
});

// ─── onEvent — portable_export_complete ──────────────────────────────────────

describe('portableHandler.onEvent — portable_export_complete', () => {
  it('sets isExportReady=true', () => {
    const { node, ctx, config } = attach();
    portableHandler.onEvent!(node, config, ctx, {
      type: 'portable_export_complete',
      format: 'gltf',
      size: 1024,
      url: 'https://cdn/asset.gltf',
    });
    expect(node.__portableState.isExportReady).toBe(true);
  });
  it('adds format to exportedFormats set', () => {
    const { node, ctx, config } = attach();
    portableHandler.onEvent!(node, config, ctx, {
      type: 'portable_export_complete',
      format: 'glb',
      size: 512,
      url: 'x',
    });
    expect(node.__portableState.exportedFormats.has('glb')).toBe(true);
  });
  it('updates lastExportTime', () => {
    const before = Date.now();
    const { node, ctx, config } = attach();
    portableHandler.onEvent!(node, config, ctx, {
      type: 'portable_export_complete',
      format: 'gltf',
      size: 0,
      url: '',
    });
    expect(node.__portableState.lastExportTime).toBeGreaterThanOrEqual(before);
  });
  it('emits on_asset_ported', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    portableHandler.onEvent!(node, config, ctx, {
      type: 'portable_export_complete',
      format: 'usdz',
      size: 2048,
      url: 'https://cdn/a.usdz',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_asset_ported',
      expect.objectContaining({ format: 'usdz', url: 'https://cdn/a.usdz' })
    );
  });
  it('tracks multiple formats separately', () => {
    const { node, ctx, config } = attach();
    portableHandler.onEvent!(node, config, ctx, {
      type: 'portable_export_complete',
      format: 'gltf',
      size: 0,
      url: '',
    });
    portableHandler.onEvent!(node, config, ctx, {
      type: 'portable_export_complete',
      format: 'glb',
      size: 0,
      url: '',
    });
    expect(Array.from(node.__portableState.exportedFormats)).toEqual(
      expect.arrayContaining(['gltf', 'glb'])
    );
  });
});

// ─── onEvent — portable_import ───────────────────────────────────────────────

describe('portableHandler.onEvent — portable_import', () => {
  it('emits portable_process_import', () => {
    const { node, ctx, config } = attach();
    const data = new ArrayBuffer(16);
    ctx.emit.mockClear();
    portableHandler.onEvent!(node, config, ctx, { type: 'portable_import', data, format: 'gltf' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'portable_process_import',
      expect.objectContaining({ format: 'gltf', data })
    );
  });
  it('defaults applyToNode=true when not specified', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    portableHandler.onEvent!(node, config, ctx, {
      type: 'portable_import',
      data: new ArrayBuffer(0),
      format: 'vrm',
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'portable_process_import')!;
    expect(call[1].applyToNode).toBe(true);
  });
});

// ─── onEvent — portable_import_complete ──────────────────────────────────────

describe('portableHandler.onEvent — portable_import_complete', () => {
  it('emits on_asset_imported', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    portableHandler.onEvent!(node, config, ctx, {
      type: 'portable_import_complete',
      format: 'gltf',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_asset_imported',
      expect.objectContaining({ format: 'gltf' })
    );
  });
});

// ─── onEvent — portable_validate ─────────────────────────────────────────────

describe('portableHandler.onEvent — portable_validate', () => {
  it('emits portable_validation_result', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    portableHandler.onEvent!(node, config, ctx, { type: 'portable_validate' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'portable_validation_result',
      expect.objectContaining({ score: expect.any(Number), isReady: expect.any(Boolean) })
    );
  });
  it('redoes portability analysis on validate', () => {
    const { node, ctx, config } = attach();
    // Add a custom shader to the node after attach
    (node as any).customShader = true;
    ctx.emit.mockClear();
    portableHandler.onEvent!(node, config, ctx, { type: 'portable_validate' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'portable_validation_result')!;
    expect(call[1].score).toBeCloseTo(0.8); // reduced from 1.0
  });
});

// ─── onEvent — portable_get_metadata ─────────────────────────────────────────

describe('portableHandler.onEvent — portable_get_metadata', () => {
  it('emits portable_extract_metadata with standard', () => {
    const { node, ctx, config } = attach({ metadata_standard: 'vrm_meta' });
    ctx.emit.mockClear();
    portableHandler.onEvent!(node, config, ctx, { type: 'portable_get_metadata' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'portable_extract_metadata',
      expect.objectContaining({ standard: 'vrm_meta' })
    );
  });
});

// ─── onEvent — portable_query ─────────────────────────────────────────────────

describe('portableHandler.onEvent — portable_query', () => {
  it('emits portable_info snapshot', () => {
    const { node, ctx, config } = attach({ export_formats: ['gltf', 'glb'] });
    portableHandler.onEvent!(node, config, ctx, { type: 'portable_query', queryId: 'pq1' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'portable_info',
      expect.objectContaining({
        queryId: 'pq1',
        isExportReady: true,
        exportedFormats: [],
        supportedFormats: expect.arrayContaining(['gltf', 'glb']),
      })
    );
  });
  it('exportedFormats in query reflects completed exports', () => {
    const { node, ctx, config } = attach();
    portableHandler.onEvent!(node, config, ctx, {
      type: 'portable_export_complete',
      format: 'gltf',
      size: 0,
      url: '',
    });
    ctx.emit.mockClear();
    portableHandler.onEvent!(node, config, ctx, { type: 'portable_query' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'portable_info')!;
    expect(call[1].exportedFormats).toContain('gltf');
  });
  it('warnings reflected in query when present', () => {
    const { node, ctx, config } = attach({ preserve_physics: true });
    portableHandler.onEvent!(node, config, ctx, { type: 'portable_query' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'portable_info')!;
    expect(call[1].warnings.length).toBeGreaterThan(0);
  });
});
