import { describe, it, expect, beforeEach } from 'vitest';
import { neuralLinkHandler } from '../NeuralLinkTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('NeuralLinkTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    model: 'brittney-v4.gguf',
    temperature: 0.7,
    max_tokens: 2048,
    sync: 'local' as const,
    personality_anchor: '',
  };

  function state() {
    return (node as any).__neuralLinkState;
  }

  beforeEach(() => {
    node = createMockNode('nl');
    ctx = createMockContext();
    attachTrait(neuralLinkHandler, node, cfg, ctx);
  });

  // ── onAttach ────────────────────────────────────────────────────────────────

  it('emits neural_link_ready on attach', () => {
    expect(getEventCount(ctx, 'neural_link_ready')).toBe(1);
  });

  it('ready event contains model name', () => {
    const ev = getLastEvent(ctx, 'neural_link_ready') as any;
    expect(ev.model).toBe('brittney-v4.gguf');
  });

  it('initializes with connected status', () => {
    expect(state().neural_status).toBe('connected');
  });

  it('initializes with correct active_model', () => {
    expect(state().active_model).toBe('brittney-v4.gguf');
  });

  it('initializes with null last_response', () => {
    expect(state().last_response).toBeNull();
  });

  it('initializes with 0 last_inference_time', () => {
    expect(state().last_inference_time).toBe(0);
  });

  it('different model names reflected in state', () => {
    const n2 = createMockNode('nl2');
    const c2 = createMockContext();
    const altCfg = { ...cfg, model: 'local-7b.gguf' };
    attachTrait(neuralLinkHandler, n2, altCfg, c2);
    expect((n2 as any).__neuralLinkState.active_model).toBe('local-7b.gguf');
  });

  // ── neural_link_execute ──────────────────────────────────────────────────────

  it('execute event sets status to inferring', () => {
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_execute',
      data: { prompt: 'Hello' },
    });
    expect(state().neural_status).toBe('inferring');
  });

  it('execute emits on_neural_inference_start', () => {
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_execute',
      data: { prompt: 'Hello' },
    });
    expect(getEventCount(ctx, 'on_neural_inference_start')).toBe(1);
  });

  it('execute event includes prompt in emitted event', () => {
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_execute',
      data: { prompt: 'Test prompt' },
    });
    const ev = getLastEvent(ctx, 'on_neural_inference_start') as any;
    expect(ev.prompt).toBe('Test prompt');
  });

  it('multiple execute events tracked individually', () => {
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_execute',
      data: { prompt: 'P1' },
    });
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_execute',
      data: { prompt: 'P2' },
    });
    expect(getEventCount(ctx, 'on_neural_inference_start')).toBe(2);
  });

  // ── neural_link_response ─────────────────────────────────────────────────────

  it('response event stores text in last_response', () => {
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_response',
      data: { text: 'Hi!', generationTime: 100 },
    });
    expect(state().last_response).toBe('Hi!');
  });

  it('response event sets status back to idle', () => {
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_execute',
      data: { prompt: 'p' },
    });
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_response',
      data: { text: 'A', generationTime: 50 },
    });
    expect(state().neural_status).toBe('idle');
  });

  it('response event stores generationTime', () => {
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_response',
      data: { text: 'X', generationTime: 250 },
    });
    expect(state().last_inference_time).toBe(250);
  });

  it('response event emits on_neural_response', () => {
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_response',
      data: { text: 'Y', generationTime: 10 },
    });
    expect(getEventCount(ctx, 'on_neural_response')).toBe(1);
  });

  it('response with missing generationTime defaults to 0', () => {
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_response',
      data: { text: 'Z' },
    });
    expect(state().last_inference_time).toBe(0);
  });

  // ── detach ──────────────────────────────────────────────────────────────────

  it('detach removes state', () => {
    neuralLinkHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__neuralLinkState).toBeUndefined();
  });

  it('detach while inferring still cleans up', () => {
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_execute',
      data: { prompt: 'p' },
    });
    neuralLinkHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__neuralLinkState).toBeUndefined();
  });
});
