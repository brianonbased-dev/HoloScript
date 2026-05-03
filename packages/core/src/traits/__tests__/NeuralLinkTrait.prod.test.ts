/**
 * NeuralLinkTrait — Production Test Suite
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { neuralLinkHandler } from '../NeuralLinkTrait';

function makeNode(id = 'nl_node') {
  return { id };
}
function makeContext() {
  return { emit: vi.fn() };
}
function attachNode(config: Record<string, unknown> = {}) {
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
  it('inference_timeout_ms = 30000', () =>
    expect(neuralLinkHandler.defaultConfig!.inference_timeout_ms).toBe(30_000));
  it('heartbeat_interval_ms = 5000', () =>
    expect(neuralLinkHandler.defaultConfig!.heartbeat_interval_ms).toBe(5_000));
  it('sync_interval_ms = 10000', () =>
    expect(neuralLinkHandler.defaultConfig!.sync_interval_ms).toBe(10_000));
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
  it('initial inference_start = null', () => {
    const { node } = attachNode();
    expect((node as any).__neuralLinkState.inference_start).toBeNull();
  });
  it('initial heartbeat_elapsed = 0', () => {
    const { node } = attachNode();
    expect((node as any).__neuralLinkState.heartbeat_elapsed).toBe(0);
  });
  it('initial sync_elapsed = 0', () => {
    const { node } = attachNode();
    expect((node as any).__neuralLinkState.sync_elapsed).toBe(0);
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
  it('sets status to disconnected before removing', () => {
    const { node, cfg, ctx } = attachNode();
    const stateRef = (node as any).__neuralLinkState;
    neuralLinkHandler.onDetach!(node, cfg, ctx);
    // state object still exists but status is 'disconnected'
    expect(stateRef.neural_status).toBe('disconnected');
  });
});

// ─── onUpdate — heartbeat ──────────────────────────────────────────────────

describe('neuralLinkHandler.onUpdate — heartbeat', () => {
  it('emits neural_link_heartbeat after interval elapses', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    // Default heartbeat_interval_ms = 5000, delta=5.1s => 5100ms > 5000ms
    neuralLinkHandler.onUpdate!(node, cfg, ctx, 5.1);
    expect(ctx.emit).toHaveBeenCalledWith(
      'neural_link_heartbeat',
      expect.objectContaining({
        nodeId: 'nl_node',
        model: 'brittney-v4.gguf',
        status: 'connected',
      })
    );
  });
  it('does not emit heartbeat before interval', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    neuralLinkHandler.onUpdate!(node, cfg, ctx, 3.0);
    expect(ctx.emit).not.toHaveBeenCalledWith('neural_link_heartbeat', expect.anything());
  });
  it('accumulates delta across calls', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    neuralLinkHandler.onUpdate!(node, cfg, ctx, 2.5);
    neuralLinkHandler.onUpdate!(node, cfg, ctx, 2.6);
    expect(ctx.emit).toHaveBeenCalledWith(
      'neural_link_heartbeat',
      expect.anything()
    );
  });
  it('resets heartbeat_elapsed after emission', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    neuralLinkHandler.onUpdate!(node, cfg, ctx, 6.0);
    expect((node as any).__neuralLinkState.heartbeat_elapsed).toBeLessThan(200);
  });
});

// ─── onUpdate — inference timeout ──────────────────────────────────────────

describe('neuralLinkHandler.onUpdate — inference timeout', () => {
  it('emits neural_link_timeout when inference exceeds timeout', () => {
    const { node, cfg, ctx } = attachNode({ inference_timeout_ms: 1000 });
    ctx.emit.mockClear();
    // Start inference
    neuralLinkHandler.onEvent!(node, cfg, ctx, {
      type: 'neural_link_execute',
      data: { prompt: 'test' },
    });
    // Artificially age the start time
    (node as any).__neuralLinkState.inference_start = Date.now() - 2000;
    neuralLinkHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'neural_link_timeout',
      expect.objectContaining({
        nodeId: 'nl_node',
        model: 'brittney-v4.gguf',
      })
    );
    expect((node as any).__neuralLinkState.neural_status).toBe('idle');
    expect((node as any).__neuralLinkState.inference_start).toBeNull();
  });
  it('does not emit timeout if response arrived', () => {
    const { node, cfg, ctx } = attachNode({ inference_timeout_ms: 1000 });
    ctx.emit.mockClear();
    neuralLinkHandler.onEvent!(node, cfg, ctx, {
      type: 'neural_link_execute',
      data: { prompt: 'fast' },
    });
    neuralLinkHandler.onEvent!(node, cfg, ctx, {
      type: 'neural_link_response',
      data: { text: 'ok', generationTime: 50 },
    });
    neuralLinkHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('neural_link_timeout', expect.anything());
  });
  it('does not emit timeout when not inferring', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    neuralLinkHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('neural_link_timeout', expect.anything());
  });
  it('preserves idle state when not inferring', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    neuralLinkHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect((node as any).__neuralLinkState.neural_status).toBe('connected');
  });
});

// ─── onUpdate — mesh sync ──────────────────────────────────────────────────

describe('neuralLinkHandler.onUpdate — mesh sync', () => {
  it('emits neural_link_sync when sync=mesh and interval elapses', () => {
    const { node, cfg, ctx } = attachNode({ sync: 'mesh' });
    ctx.emit.mockClear();
    // Default sync_interval_ms = 10000, delta=10.5s => 10500ms > 10000ms
    neuralLinkHandler.onUpdate!(node, cfg, ctx, 10.5);
    expect(ctx.emit).toHaveBeenCalledWith(
      'neural_link_sync',
      expect.objectContaining({
        nodeId: 'nl_node',
        model: 'brittney-v4.gguf',
        status: 'connected',
        last_inference_time: 0,
      })
    );
  });
  it('does not emit sync when sync=local', () => {
    const { node, cfg, ctx } = attachNode({ sync: 'local' });
    ctx.emit.mockClear();
    neuralLinkHandler.onUpdate!(node, cfg, ctx, 15.0);
    expect(ctx.emit).not.toHaveBeenCalledWith('neural_link_sync', expect.anything());
  });
  it('does not emit sync before interval elapses', () => {
    const { node, cfg, ctx } = attachNode({ sync: 'mesh' });
    ctx.emit.mockClear();
    neuralLinkHandler.onUpdate!(node, cfg, ctx, 5.0);
    expect(ctx.emit).not.toHaveBeenCalledWith('neural_link_sync', expect.anything());
  });
  it('resets sync_elapsed after emission', () => {
    const { node, cfg, ctx } = attachNode({ sync: 'mesh' });
    ctx.emit.mockClear();
    neuralLinkHandler.onUpdate!(node, cfg, ctx, 11.0);
    expect((node as any).__neuralLinkState.sync_elapsed).toBeLessThan(200);
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
  it('sets inference_start to current timestamp', () => {
    const { node, cfg, ctx } = attachNode();
    const before = Date.now();
    neuralLinkHandler.onEvent!(node, cfg, ctx, {
      type: 'neural_link_execute',
      data: { prompt: 'hello' },
    });
    expect((node as any).__neuralLinkState.inference_start).toBeGreaterThanOrEqual(before);
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
  it('clears inference_start on response', () => {
    const { node, cfg, ctx } = attachNode();
    neuralLinkHandler.onEvent!(node, cfg, ctx, {
      type: 'neural_link_execute',
      data: { prompt: 'q' },
    });
    expect((node as any).__neuralLinkState.inference_start).not.toBeNull();
    neuralLinkHandler.onEvent!(node, cfg, ctx, {
      type: 'neural_link_response',
      data: { text: 'A', generationTime: 50 },
    });
    expect((node as any).__neuralLinkState.inference_start).toBeNull();
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