/**
 * MaterialXTrait Production Tests
 *
 * MaterialX material description support for cross-platform authoring.
 * Covers: defaultConfig, onAttach (source guard → loadMaterialX emit),
 * onDetach (materialId guard), 7 onEvent types.
 */

import { describe, it, expect, vi } from 'vitest';
import { materialXHandler } from '../MaterialXTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() { return { id: 'mx_test' } as any; }
function makeCtx() { return { emit: vi.fn() }; }

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...materialXHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  materialXHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(node: any) { return node.__materialXState as any; }
function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  materialXHandler.onEvent!(node, cfg, ctx as any, evt as any);
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('MaterialXTrait — defaultConfig', () => {
  it('has 7 fields with correct defaults', () => {
    const d = materialXHandler.defaultConfig!;
    expect(d.source).toBe('');
    expect(d.material_name).toBe('');
    expect(d.node_graph).toBe('');
    expect(d.color_space).toBe('srgb');
    expect(d.shading_model).toBe('standard_surface');
    expect(d.texture_path).toBe('');
    expect(d.compile_to_glsl).toBe(true);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('MaterialXTrait — onAttach', () => {
  it('initialises state with correct defaults', () => {
    const node = makeNode();
    attach(node);
    const s = st(node);
    expect(s.isLoaded).toBe(false);
    expect(s.isLoading).toBe(false);
    expect(s.materialId).toBeNull();
    expect(s.nodeGraph).toBeInstanceOf(Map);
    expect(s.inputs).toBeInstanceOf(Map);
    expect(s.compiledShader).toBeNull();
  });

  it('emits materialx_load with all config fields when source is set', () => {
    const node = makeNode();
    const { ctx } = attach(node, {
      source: 'pbr.mtlx',
      material_name: 'SteelMat',
      node_graph: 'GraphA',
      color_space: 'linear',
      shading_model: 'gltf_pbr',
      texture_path: '/textures/',
      compile_to_glsl: true,
    });
    expect(ctx.emit).toHaveBeenCalledWith('materialx_load', expect.objectContaining({
      source: 'pbr.mtlx',
      materialName: 'SteelMat',
      nodeGraph: 'GraphA',
      colorSpace: 'linear',
      shadingModel: 'gltf_pbr',
      texturePath: '/textures/',
      compileToGlsl: true,
    }));
    expect(st(node).isLoading).toBe(true);
  });

  it('does NOT emit materialx_load when source is empty', () => {
    const node = makeNode();
    const { ctx } = attach(node, { source: '' });
    expect(ctx.emit).not.toHaveBeenCalled();
    expect(st(node).isLoading).toBe(false);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('MaterialXTrait — onDetach', () => {
  it('emits materialx_destroy when materialId is set', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).materialId = 'mat_abc';
    ctx.emit.mockClear();
    materialXHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('materialx_destroy', expect.any(Object));
  });

  it('does NOT emit materialx_destroy when materialId is null', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    materialXHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('materialx_destroy', expect.any(Object));
  });

  it('removes __materialXState', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    materialXHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__materialXState).toBeUndefined();
  });
});

// ─── onEvent — materialx_loaded ───────────────────────────────────────────────

describe('MaterialXTrait — onEvent: materialx_loaded', () => {
  it('sets isLoaded, stores materialId+shader, emits apply+on_format_converted', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'materialx_loaded', materialId: 'mat1', shader: { code: 'glsl...' } });
    expect(st(node).isLoaded).toBe(true);
    expect(st(node).isLoading).toBe(false);
    expect(st(node).materialId).toBe('mat1');
    expect(ctx.emit).toHaveBeenCalledWith('materialx_apply', expect.objectContaining({ materialId: 'mat1' }));
    expect(ctx.emit).toHaveBeenCalledWith('on_format_converted', expect.objectContaining({ materialId: 'mat1' }));
  });
});

// ─── onEvent — materialx_error ────────────────────────────────────────────────

describe('MaterialXTrait — onEvent: materialx_error', () => {
  it('clears isLoading and emits on_materialx_error', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: 'bad.mtlx' });
    st(node).isLoading = true;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'materialx_error', error: 'PARSE_FAILED' });
    expect(st(node).isLoading).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('on_materialx_error', expect.objectContaining({ error: 'PARSE_FAILED' }));
  });
});

// ─── onEvent — materialx_set_input ────────────────────────────────────────────

describe('MaterialXTrait — onEvent: materialx_set_input', () => {
  it('stores input and emits materialx_update_input', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).materialId = 'mat1';
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'materialx_set_input', name: 'roughness', value: 0.4 });
    expect(st(node).inputs.get('roughness')).toBe(0.4);
    expect(ctx.emit).toHaveBeenCalledWith('materialx_update_input', expect.objectContaining({
      inputName: 'roughness', value: 0.4,
    }));
  });

  it('overwrites existing input value', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'materialx_set_input', name: 'metalness', value: 0.1 });
    fire(node, cfg, ctx, { type: 'materialx_set_input', name: 'metalness', value: 0.9 });
    expect(st(node).inputs.get('metalness')).toBe(0.9);
  });
});

// ─── onEvent — materialx_get_inputs ───────────────────────────────────────────

describe('MaterialXTrait — onEvent: materialx_get_inputs', () => {
  it('emits materialx_inputs with current inputs as plain object', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).inputs.set('r', 0.3);
    st(node).inputs.set('m', 0.7);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'materialx_get_inputs' });
    expect(ctx.emit).toHaveBeenCalledWith('materialx_inputs', expect.objectContaining({
      inputs: { r: 0.3, m: 0.7 },
    }));
  });
});

// ─── onEvent — materialx_reload ───────────────────────────────────────────────

describe('MaterialXTrait — onEvent: materialx_reload', () => {
  it('emits materialx_load (reload) when source is set', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: 'water.mtlx' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'materialx_reload' });
    expect(ctx.emit).toHaveBeenCalledWith('materialx_load', expect.objectContaining({ source: 'water.mtlx' }));
  });

  it('no-op when source is empty', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'materialx_reload' });
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onEvent — materialx_set_source ──────────────────────────────────────────

describe('MaterialXTrait — onEvent: materialx_set_source', () => {
  it('destroys old materialId if set, resets state, loads new source', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: 'old.mtlx' });
    st(node).materialId = 'mat_old';
    st(node).isLoaded = true;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'materialx_set_source', source: 'new.mtlx' });
    expect(ctx.emit).toHaveBeenCalledWith('materialx_destroy', expect.any(Object));
    expect(st(node).materialId).toBeNull();
    expect(st(node).isLoaded).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('materialx_load', expect.objectContaining({ source: 'new.mtlx' }));
  });

  it('does NOT emit materialx_destroy when no materialId', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'materialx_set_source', source: 'new.mtlx' });
    expect(ctx.emit).not.toHaveBeenCalledWith('materialx_destroy', expect.any(Object));
    expect(ctx.emit).toHaveBeenCalledWith('materialx_load', expect.objectContaining({ source: 'new.mtlx' }));
  });
});

// ─── onEvent — materialx_query ────────────────────────────────────────────────

describe('MaterialXTrait — onEvent: materialx_query', () => {
  it('emits materialx_info with snapshot', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).isLoaded = true;
    st(node).materialId = 'mat1';
    st(node).inputs.set('a', 1);
    st(node).nodeGraph.set('n1', {});
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'materialx_query', queryId: 'mq1' });
    expect(ctx.emit).toHaveBeenCalledWith('materialx_info', expect.objectContaining({
      queryId: 'mq1', isLoaded: true, materialId: 'mat1', inputCount: 1, nodeGraphSize: 1,
    }));
  });
});
