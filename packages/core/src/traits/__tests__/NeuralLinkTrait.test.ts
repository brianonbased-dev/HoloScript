import { describe, it, expect, beforeEach } from 'vitest';
import { neuralLinkHandler } from '../NeuralLinkTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, getEventCount, getLastEvent } from './traitTestHelpers';

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

  beforeEach(() => {
    node = createMockNode('nl');
    ctx = createMockContext();
    attachTrait(neuralLinkHandler, node, cfg, ctx);
  });

  it('emits neural_link_ready on attach', () => {
    expect(getEventCount(ctx, 'neural_link_ready')).toBe(1);
    const ev = getLastEvent(ctx, 'neural_link_ready') as any;
    expect(ev.model).toBe('brittney-v4.gguf');
    const s = (node as any).__neuralLinkState;
    expect(s.neural_status).toBe('connected');
  });

  it('neural_link_execute triggers inference', () => {
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_execute',
      data: { prompt: 'Hello world' },
    });
    const s = (node as any).__neuralLinkState;
    expect(s.neural_status).toBe('inferring');
    expect(getEventCount(ctx, 'on_neural_inference_start')).toBe(1);
  });

  it('neural_link_response stores result', () => {
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_response',
      data: { text: 'Hi there!', generationTime: 100 },
    });
    const s = (node as any).__neuralLinkState;
    expect(s.neural_status).toBe('idle');
    expect(s.last_response).toBe('Hi there!');
    expect(s.last_inference_time).toBe(100);
    expect(getEventCount(ctx, 'on_neural_response')).toBe(1);
  });

  it('detach disconnects and cleans up', () => {
    neuralLinkHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__neuralLinkState).toBeUndefined();
  });
});
