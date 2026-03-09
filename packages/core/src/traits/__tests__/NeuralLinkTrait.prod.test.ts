/**
 * NeuralLinkTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { neuralLinkHandler } from '../NeuralLinkTrait';

function makeNode(id = 'nl_node') {
  return { id };
}
function makeContext() {
  return { emit: vi.fn() };
}
function attachNode(config: any = {}) {
  const node = makeNode();
  const ctx = makeContext();
  const cfg = { ...neuralLinkHandler.defaultConfig!, ...config };
  neuralLinkHandler.onAttach!(node, cfg, ctx);
  return { node, ctx, cfg };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('neuralLinkHandler.defaultConfig', () => {
  it('model = brittney-v4.gguf', () =>
    expect(neuralLinkHandler.defaultConfig!.model).toBe('brittney-v4.gguf'));
  it('temperature = 0.7', () => expect(neuralLinkHandler.defaultConfig!.temperature).toBe(0.7));
  it('max_tokens = 2048', () => expect(neuralLinkHandler.defaultConfig!.max_tokens).toBe(2048));
  it('sync = local', () => expect(neuralLinkHandler.defaultConfig!.sync).toBe('local'));
  it('personality_anchor = empty string', () =>
    expect(neuralLinkHandler.defaultConfig!.personality_anchor).toBe(''));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('neuralLinkHandler.onAttach', () => {
  it('creates __neuralLinkState', () => {
    const { node } = attachNode();
    expect((node as any).__neuralLinkState).toBeDefined();
  });
  it('initial neural_status = connected', () => {
    const { node } = attachNode();
    expect((node as any).__neuralLinkState.neural_status).toBe('connected');
  });
  it('initial active_model = config.model', () => {
    const { node } = attachNode({ model: 'custom.gguf' });
    expect((node as any).__neuralLinkState.active_model).toBe('custom.gguf');
  });
  it('initial last_inference_time = 0', () => {
    const { node } = attachNode();
    expect((node as any).__neuralLinkState.last_inference_time).toBe(0);
  });
  it('initial last_response = null', () => {
    const { node } = attachNode();
    expect((node as any).__neuralLinkState.last_response).toBeNull();
  });
  it('emits neural_link_ready with nodeId and model', () => {
    const { ctx } = attachNode({ model: 'gemma-7b.gguf' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'neural_link_ready',
      expect.objectContaining({
        nodeId: 'nl_node',
        model: 'gemma-7b.gguf',
      })
    );
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('neuralLinkHandler.onDetach', () => {
  it('removes __neuralLinkState', () => {
    const { node, cfg, ctx } = attachNode();
    neuralLinkHandler.onDetach!(node, cfg, ctx);
    expect((node as any).__neuralLinkState).toBeUndefined();
  });
});

// ─── onUpdate ────────────────────────────────────────────────────────────────

describe('neuralLinkHandler.onUpdate', () => {
  it('does not throw and emits nothing', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    expect(() => neuralLinkHandler.onUpdate!(node, cfg, ctx, 0.016)).not.toThrow();
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onEvent — neural_link_execute ───────────────────────────────────────────

describe('neuralLinkHandler.onEvent — neural_link_execute', () => {
  it('sets neural_status = inferring', () => {
    const { node, cfg, ctx } = attachNode();
    neuralLinkHandler.onEvent!(node, cfg, ctx, {
      type: 'neural_link_execute',
      data: { prompt: 'hello' },
    });
    expect((node as any).__neuralLinkState.neural_status).toBe('inferring');
  });
  it('emits on_neural_inference_start with nodeId, model, prompt', () => {
    const { node, cfg, ctx } = attachNode({ model: 'llama.gguf' });
    ctx.emit.mockClear();
    neuralLinkHandler.onEvent!(node, cfg, ctx, {
      type: 'neural_link_execute',
      data: { prompt: 'What is 2+2?' },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_neural_inference_start',
      expect.objectContaining({
        nodeId: 'nl_node',
        model: 'llama.gguf',
        prompt: 'What is 2+2?',
      })
    );
  });
  it('works with missing prompt (undefined)', () => {
    const { node, cfg, ctx } = attachNode();
    expect(() =>
      neuralLinkHandler.onEvent!(node, cfg, ctx, { type: 'neural_link_execute', data: {} })
    ).not.toThrow();
  });
  it('works with missing data entirely', () => {
    const { node, cfg, ctx } = attachNode();
    expect(() =>
      neuralLinkHandler.onEvent!(node, cfg, ctx, { type: 'neural_link_execute' })
    ).not.toThrow();
  });
});

// ─── onEvent — neural_link_response ──────────────────────────────────────────

describe('neuralLinkHandler.onEvent — neural_link_response', () => {
  it('sets neural_status = idle', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__neuralLinkState.neural_status = 'inferring';
    neuralLinkHandler.onEvent!(node, cfg, ctx, {
      type: 'neural_link_response',
      data: { text: 'Hello!', generationTime: 120 },
    });
    expect((node as any).__neuralLinkState.neural_status).toBe('idle');
  });
  it('stores last_response', () => {
    const { node, cfg, ctx } = attachNode();
    neuralLinkHandler.onEvent!(node, cfg, ctx, {
      type: 'neural_link_response',
      data: { text: 'Done.', generationTime: 80 },
    });
    expect((node as any).__neuralLinkState.last_response).toBe('Done.');
  });
  it('stores last_inference_time', () => {
    const { node, cfg, ctx } = attachNode();
    neuralLinkHandler.onEvent!(node, cfg, ctx, {
      type: 'neural_link_response',
      data: { text: 'x', generationTime: 350 },
    });
    expect((node as any).__neuralLinkState.last_inference_time).toBe(350);
  });
  it('defaults last_inference_time = 0 when missing', () => {
    const { node, cfg, ctx } = attachNode();
    neuralLinkHandler.onEvent!(node, cfg, ctx, {
      type: 'neural_link_response',
      data: { text: 'y' },
    });
    expect((node as any).__neuralLinkState.last_inference_time).toBe(0);
  });
  it('emits on_neural_response with nodeId and text', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    neuralLinkHandler.onEvent!(node, cfg, ctx, {
      type: 'neural_link_response',
      data: { text: 'Response!', generationTime: 50 },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_neural_response',
      expect.objectContaining({
        nodeId: 'nl_node',
        text: 'Response!',
      })
    );
  });
  it('does NOT reset inferring status on unrelated events', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__neuralLinkState.neural_status = 'inferring';
    neuralLinkHandler.onEvent!(node, cfg, ctx, { type: 'unknown_event' });
    expect((node as any).__neuralLinkState.neural_status).toBe('inferring');
  });
});
