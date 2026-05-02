import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    inference_timeout_ms: 5000,
    heartbeat_interval_ms: 2000,
    sync_interval_ms: 5000,
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

  it('initializes with null inference_start', () => {
    expect(state().inference_start).toBeNull();
  });

  it('initializes with 0 heartbeat_elapsed', () => {
    expect(state().heartbeat_elapsed).toBe(0);
  });

  it('initializes with 0 sync_elapsed', () => {
    expect(state().sync_elapsed).toBe(0);
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

  it('execute event records inference_start timestamp', () => {
    const before = Date.now();
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_execute',
      data: { prompt: 'Hello' },
    });
    expect(state().inference_start).toBeGreaterThanOrEqual(before);
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

  it('response event clears inference_start', () => {
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_execute',
      data: { prompt: 'p' },
    });
    expect(state().inference_start).not.toBeNull();
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_response',
      data: { text: 'A', generationTime: 50 },
    });
    expect(state().inference_start).toBeNull();
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

  // ── onUpdate — heartbeat ─────────────────────────────────────────────────────

  it('emits heartbeat after enough delta accumulates', () => {
    // Default heartbeat_interval_ms = 2000
    // delta is in seconds, so 2.1 seconds exceeds the 2000ms threshold
    neuralLinkHandler.onUpdate!(node as any, cfg, ctx as any, 2.1);
    expect(getEventCount(ctx, 'neural_link_heartbeat')).toBe(1);
  });

  it('heartbeat includes nodeId, model, and current status', () => {
    neuralLinkHandler.onUpdate!(node as any, cfg, ctx as any, 2.1);
    const ev = getLastEvent(ctx, 'neural_link_heartbeat') as any;
    expect(ev.nodeId).toBe('nl');
    expect(ev.model).toBe('brittney-v4.gguf');
    expect(ev.status).toBe('connected');
  });

  it('does not emit heartbeat before interval elapses', () => {
    // 1 second of delta = 1000ms, below the 2000ms threshold
    neuralLinkHandler.onUpdate!(node as any, cfg, ctx as any, 1.0);
    expect(getEventCount(ctx, 'neural_link_heartbeat')).toBe(0);
  });

  it('accumulates heartbeat delta across multiple onUpdate calls', () => {
    neuralLinkHandler.onUpdate!(node as any, cfg, ctx as any, 1.0);
    expect(getEventCount(ctx, 'neural_link_heartbeat')).toBe(0);
    neuralLinkHandler.onUpdate!(node as any, cfg, ctx as any, 1.1);
    expect(getEventCount(ctx, 'neural_link_heartbeat')).toBe(1);
  });

  it('resets heartbeat_elapsed after emission', () => {
    neuralLinkHandler.onUpdate!(node as any, cfg, ctx as any, 2.5);
    expect(state().heartbeat_elapsed).toBeLessThan(100); // near-zero after reset
  });

  // ── onUpdate — inference timeout ─────────────────────────────────────────────

  it('emits timeout when inference exceeds inference_timeout_ms', () => {
    // Start inference
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_execute',
      data: { prompt: 'slow query' },
    });
    expect(state().neural_status).toBe('inferring');

    // Simulate time passing by setting inference_start far in the past
    state().inference_start = Date.now() - 6000; // 6s ago, exceeds 5000ms timeout

    // Trigger onUpdate — should detect timeout
    neuralLinkHandler.onUpdate!(node as any, cfg, ctx as any, 0.016);
    expect(getEventCount(ctx, 'neural_link_timeout')).toBe(1);
    expect(state().neural_status).toBe('idle');
    expect(state().inference_start).toBeNull();
  });

  it('timeout event includes nodeId, model, and elapsedMs', () => {
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_execute',
      data: { prompt: 'slow query' },
    });
    state().inference_start = Date.now() - 8000;

    neuralLinkHandler.onUpdate!(node as any, cfg, ctx as any, 0.016);
    const ev = getLastEvent(ctx, 'neural_link_timeout') as any;
    expect(ev.nodeId).toBe('nl');
    expect(ev.model).toBe('brittney-v4.gguf');
    expect(ev.elapsedMs).toBeGreaterThanOrEqual(8000);
  });

  it('does not timeout if response arrived in time', () => {
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_execute',
      data: { prompt: 'fast query' },
    });
    // Respond immediately
    sendEvent(neuralLinkHandler, node, cfg, ctx, {
      type: 'neural_link_response',
      data: { text: 'fast answer', generationTime: 100 },
    });
    // onUpdate should NOT emit timeout
    neuralLinkHandler.onUpdate!(node as any, cfg, ctx as any, 0.016);
    expect(getEventCount(ctx, 'neural_link_timeout')).toBe(0);
  });

  it('does not emit timeout when not inferring', () => {
    neuralLinkHandler.onUpdate!(node as any, cfg, ctx as any, 0.016);
    expect(getEventCount(ctx, 'neural_link_timeout')).toBe(0);
  });

  // ── onUpdate — mesh sync pulse ───────────────────────────────────────────────

  it('does not emit sync pulse when sync=local', () => {
    // Default config has sync='local', so no sync pulses should emit
    neuralLinkHandler.onUpdate!(node as any, cfg, ctx as any, 6.0);
    expect(getEventCount(ctx, 'neural_link_sync')).toBe(0);
  });

  it('emits sync pulse when sync=mesh and interval elapses', () => {
    const meshCfg = { ...cfg, sync: 'mesh' as const };
    const meshNode = createMockNode('mesh_nl');
    const meshCtx = createMockContext();
    attachTrait(neuralLinkHandler, meshNode, meshCfg, meshCtx);

    neuralLinkHandler.onUpdate!(meshNode as any, meshCfg, meshCtx as any, 5.5);
    expect(getEventCount(meshCtx, 'neural_link_sync')).toBe(1);
  });

  it('sync pulse includes status and last_inference_time', () => {
    const meshCfg = { ...cfg, sync: 'mesh' as const };
    const meshNode = createMockNode('mesh_nl2');
    const meshCtx = createMockContext();
    attachTrait(neuralLinkHandler, meshNode, meshCfg, meshCtx);

    neuralLinkHandler.onUpdate!(meshNode as any, meshCfg, meshCtx as any, 5.5);
    const ev = getLastEvent(meshCtx, 'neural_link_sync') as any;
    expect(ev.nodeId).toBe('mesh_nl2');
    expect(ev.model).toBe('brittney-v4.gguf');
    expect(ev.status).toBe('connected');
    expect(ev.last_inference_time).toBe(0);
  });

  it('sync pulse does not fire before sync_interval_ms', () => {
    const meshCfg = { ...cfg, sync: 'mesh' as const };
    const meshNode = createMockNode('mesh_nl3');
    const meshCtx = createMockContext();
    attachTrait(neuralLinkHandler, meshNode, meshCfg, meshCtx);

    neuralLinkHandler.onUpdate!(meshNode as any, meshCfg, meshCtx as any, 3.0);
    expect(getEventCount(meshCtx, 'neural_link_sync')).toBe(0);
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

  // ── onUpdate with no state ─────────────────────────────────────────────────

  it('onUpdate is a no-op when state is absent', () => {
    const orphanNode = createMockNode('orphan');
    // No onAttach — no state
    expect(() => neuralLinkHandler.onUpdate!(orphanNode as any, cfg, ctx as any, 1.0)).not.toThrow();
  });
});