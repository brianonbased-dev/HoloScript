/**
 * EmbeddingTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { embeddingHandler } from '../EmbeddingTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __embeddingState: undefined as unknown,
});

const defaultConfig = { default_model: 'text-embedding-3-small', default_dimensions: 1536 };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('EmbeddingTrait — metadata', () => {
  it('has name "embedding"', () => {
    expect(embeddingHandler.name).toBe('embedding');
  });

  it('defaultConfig default_dimensions is 1536', () => {
    expect(embeddingHandler.defaultConfig?.default_dimensions).toBe(1536);
  });
});

describe('EmbeddingTrait — lifecycle', () => {
  it('onAttach initializes generated counter to 0', () => {
    const node = makeNode();
    embeddingHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__embeddingState as { generated: number };
    expect(state.generated).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    embeddingHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    embeddingHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__embeddingState).toBeUndefined();
  });
});

describe('EmbeddingTrait — onEvent', () => {
  it('embedding:generate emits embedding:result with vector and dims', () => {
    const node = makeNode();
    embeddingHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    embeddingHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'embedding:generate', input: 'hello world',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('embedding:result', expect.objectContaining({
      dimensions: 1536, model: 'text-embedding-3-small',
    }));
    const call = node.emit.mock.calls[0][1] as { vector: Float32Array };
    expect(call.vector).toBeInstanceOf(Float32Array);
    expect(call.vector.length).toBe(1536);
  });

  it('embedding:generate uses provided dimensions', () => {
    const node = makeNode();
    embeddingHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    embeddingHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'embedding:generate', input: 'test', dimensions: 512,
    } as never);
    const call = node.emit.mock.calls[0][1] as { dimensions: number; vector: Float32Array };
    expect(call.dimensions).toBe(512);
    expect(call.vector.length).toBe(512);
  });

  it('embedding:generate uses provided model', () => {
    const node = makeNode();
    embeddingHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    embeddingHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'embedding:generate', input: 'x', model: 'custom-embed-v1',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('embedding:result', expect.objectContaining({
      model: 'custom-embed-v1',
    }));
  });

  it('increments index per call', () => {
    const node = makeNode();
    embeddingHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    embeddingHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'embedding:generate', input: 'a' } as never);
    embeddingHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'embedding:generate', input: 'b' } as never);
    const lastCall = node.emit.mock.calls[1][1] as { index: number };
    expect(lastCall.index).toBe(2);
  });
});
