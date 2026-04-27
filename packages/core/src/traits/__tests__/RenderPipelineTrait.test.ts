import { describe, it, expect, beforeEach } from 'vitest';
import { renderPipelineHandler } from '../RenderPipelineTrait';
import type { HSPlusNode } from '../TraitTypes';

function makeNode(): HSPlusNode {
  return {
    id: 'node1',
    traits: new Set(),
    emit: vi.fn(),
    __rpState: undefined as unknown,
  } as unknown as HSPlusNode;
}

import { vi } from 'vitest';

describe('renderPipelineHandler', () => {
  it('has name render_pipeline', () => {
    expect(renderPipelineHandler.name).toBe('render_pipeline');
  });

  it('has defaultConfig with max_passes 8', () => {
    expect(renderPipelineHandler.defaultConfig).toMatchObject({ max_passes: 8 });
  });

  it('onAttach initializes __rpState', () => {
    const node = makeNode();
    const emitFn = vi.fn();
    const ctx = { emit: emitFn };
    const cfg = renderPipelineHandler.defaultConfig as any;
    renderPipelineHandler.onAttach!(node as any, cfg, ctx as any);

    const state = (node as any).__rpState;
    expect(state).toBeDefined();
    expect(state.passes).toEqual([]);
    expect(state.active).toBe(false);
  });

  it('rp:add_pass event adds a pass and emits rp:pass_added', () => {
    const node = makeNode();
    const emitFn = vi.fn();
    const ctx = { emit: emitFn };
    const cfg = renderPipelineHandler.defaultConfig as any;
    renderPipelineHandler.onAttach!(node as any, cfg, ctx as any);

    renderPipelineHandler.onEvent!(
      node as any,
      cfg,
      ctx as any,
      { type: 'rp:add_pass', passName: 'bloom' } as any
    );

    const state = (node as any).__rpState;
    expect(state.passes).toContain('bloom');
    expect(emitFn).toHaveBeenCalledWith('rp:pass_added', expect.objectContaining({ passName: 'bloom' }));
  });

  it('rp:execute event sets active=true and emits rp:executed', () => {
    const node = makeNode();
    const emitFn = vi.fn();
    const ctx = { emit: emitFn };
    const cfg = renderPipelineHandler.defaultConfig as any;
    renderPipelineHandler.onAttach!(node as any, cfg, ctx as any);

    renderPipelineHandler.onEvent!(
      node as any,
      cfg,
      ctx as any,
      { type: 'rp:execute' } as any
    );

    const state = (node as any).__rpState;
    expect(state.active).toBe(true);
    expect(emitFn).toHaveBeenCalledWith('rp:executed', expect.anything());
  });

  it('respects max_passes limit', () => {
    const node = makeNode();
    const emitFn = vi.fn();
    const ctx = { emit: emitFn };
    const cfg = { max_passes: 2 };
    renderPipelineHandler.onAttach!(node as any, cfg as any, ctx as any);

    for (let i = 0; i < 5; i++) {
      renderPipelineHandler.onEvent!(
        node as any,
        cfg as any,
        ctx as any,
        { type: 'rp:add_pass', passName: `pass${i}` } as any
      );
    }

    const state = (node as any).__rpState;
    expect(state.passes.length).toBeLessThanOrEqual(2);
  });

  it('onDetach cleans up state', () => {
    const node = makeNode();
    const ctx = { emit: vi.fn() };
    const cfg = renderPipelineHandler.defaultConfig as any;
    renderPipelineHandler.onAttach!(node as any, cfg, ctx as any);
    renderPipelineHandler.onDetach!(node as any, cfg, ctx as any);
    expect((node as any).__rpState).toBeUndefined();
  });
});
