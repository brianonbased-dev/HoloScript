/**
 * ModelLoadTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { modelLoadHandler } from '../ModelLoadTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __modelLoadState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_loaded: 5, warmup_rounds: 1 };

describe('ModelLoadTrait', () => {
  it('has name "model_load"', () => {
    expect(modelLoadHandler.name).toBe('model_load');
  });

  it('defaultConfig max_loaded=5', () => {
    expect(modelLoadHandler.defaultConfig?.max_loaded).toBe(5);
  });

  it('onAttach creates empty loaded map', () => {
    const node = makeNode();
    modelLoadHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__modelLoadState as { loaded: Map<string, unknown> };
    expect(state.loaded.size).toBe(0);
  });

  it('model:load registers model and emits model:loaded', () => {
    const node = makeNode();
    modelLoadHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    modelLoadHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'model:load', modelId: 'gpt4', provider: 'openai',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('model:loaded', expect.objectContaining({ modelId: 'gpt4' }));
  });

  it('model:unload removes model and emits model:unloaded', () => {
    const node = makeNode();
    modelLoadHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    modelLoadHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'model:load', modelId: 'm1',
    } as never);
    node.emit.mockClear();
    modelLoadHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'model:unload', modelId: 'm1',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('model:unloaded', { modelId: 'm1' });
  });

  it('emits model:error when max_loaded exceeded', () => {
    const node = makeNode();
    modelLoadHandler.onAttach!(node as never, { max_loaded: 1, warmup_rounds: 1 }, makeCtx(node) as never);
    modelLoadHandler.onEvent!(node as never, { max_loaded: 1, warmup_rounds: 1 }, makeCtx(node) as never, {
      type: 'model:load', modelId: 'm1',
    } as never);
    node.emit.mockClear();
    modelLoadHandler.onEvent!(node as never, { max_loaded: 1, warmup_rounds: 1 }, makeCtx(node) as never, {
      type: 'model:load', modelId: 'm2',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('model:error', expect.objectContaining({ modelId: 'm2' }));
  });
});
