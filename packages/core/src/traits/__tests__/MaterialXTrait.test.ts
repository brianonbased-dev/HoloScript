import { describe, it, expect, beforeEach } from 'vitest';
import { materialXHandler } from '../MaterialXTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('MaterialXTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    source: 'materials/wood.mtlx',
    material_name: 'wood_oak',
    node_graph: 'NG_wood',
    color_space: 'srgb' as const,
    shading_model: 'standard_surface' as const,
    texture_path: '/textures',
    compile_to_glsl: true,
  };

  beforeEach(() => {
    node = createMockNode('mtlx');
    ctx = createMockContext();
    attachTrait(materialXHandler, node, cfg, ctx);
  });

  it('emits load on attach with source', () => {
    expect(getEventCount(ctx, 'materialx_load')).toBe(1);
    const s = (node as any).__materialXState;
    expect(s.isLoading).toBe(true);
    expect(s.isLoaded).toBe(false);
  });

  it('no load if source is empty', () => {
    const n = createMockNode('mtlx2');
    const c = createMockContext();
    attachTrait(materialXHandler, n, { ...cfg, source: '' }, c);
    expect(getEventCount(c, 'materialx_load')).toBe(0);
  });

  it('materialx_loaded applies material', () => {
    sendEvent(materialXHandler, node, cfg, ctx, {
      type: 'materialx_loaded',
      materialId: 'mat-1',
      shader: { code: '...' },
    });
    const s = (node as any).__materialXState;
    expect(s.isLoaded).toBe(true);
    expect(s.materialId).toBe('mat-1');
    expect(getEventCount(ctx, 'materialx_apply')).toBe(1);
  });

  it('materialx_error stops loading', () => {
    sendEvent(materialXHandler, node, cfg, ctx, { type: 'materialx_error', error: 'not found' });
    expect((node as any).__materialXState.isLoading).toBe(false);
    expect(getEventCount(ctx, 'on_materialx_error')).toBe(1);
  });

  it('materialx_set_input stores input', () => {
    sendEvent(materialXHandler, node, cfg, ctx, {
      type: 'materialx_set_input',
      name: 'roughness',
      value: 0.5,
    });
    const s = (node as any).__materialXState;
    expect(s.inputs.get('roughness')).toBe(0.5);
    expect(getEventCount(ctx, 'materialx_update_input')).toBe(1);
  });

  it('materialx_get_inputs emits inputs', () => {
    sendEvent(materialXHandler, node, cfg, ctx, {
      type: 'materialx_set_input',
      name: 'color',
      value: 'red',
    });
    sendEvent(materialXHandler, node, cfg, ctx, { type: 'materialx_get_inputs' });
    expect(getEventCount(ctx, 'materialx_inputs')).toBe(1);
  });

  it('materialx_reload re-loads', () => {
    sendEvent(materialXHandler, node, cfg, ctx, { type: 'materialx_reload' });
    expect(getEventCount(ctx, 'materialx_load')).toBe(2); // once on attach + once on reload
  });

  it('materialx_set_source destroys old and loads new', () => {
    // First simulate that a material was loaded
    sendEvent(materialXHandler, node, cfg, ctx, { type: 'materialx_loaded', materialId: 'mat-1' });
    sendEvent(materialXHandler, node, cfg, ctx, {
      type: 'materialx_set_source',
      source: 'new.mtlx',
    });
    expect(getEventCount(ctx, 'materialx_destroy')).toBe(1);
    expect(getEventCount(ctx, 'materialx_load')).toBe(2);
  });

  it('materialx_query emits info', () => {
    sendEvent(materialXHandler, node, cfg, ctx, { type: 'materialx_query', queryId: 'q1' });
    expect(getEventCount(ctx, 'materialx_info')).toBe(1);
  });

  it('detach cleans up and destroys if loaded', () => {
    sendEvent(materialXHandler, node, cfg, ctx, { type: 'materialx_loaded', materialId: 'mat-1' });
    materialXHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'materialx_destroy')).toBe(1);
    expect((node as any).__materialXState).toBeUndefined();
  });
});
