import { describe, it, expect, beforeEach } from 'vitest';
import { digitalTwinHandler } from '../DigitalTwinTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount, getLastEvent } from './traitTestHelpers';

describe('DigitalTwinTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    physical_id: 'sensor-001',
    model_source: '',
    sync_properties: [
      { physical_key: 'temperature', virtual_property: 'temp', direction: 'in' as const },
      { physical_key: 'valve', virtual_property: 'valveState', direction: 'out' as const },
      { physical_key: 'pressure', virtual_property: 'press', direction: 'bidirectional' as const },
    ],
    update_mode: 'polling' as const,
    poll_interval: 5000,
    history_retention: 3600,
    simulation_mode: true,
    connection_string: '',
  };

  beforeEach(() => {
    node = createMockNode('twin');
    ctx = createMockContext();
    attachTrait(digitalTwinHandler, node, cfg, ctx);
  });

  it('initializes in simulation mode', () => {
    const s = (node as any).__digitalTwinState;
    expect(s).toBeDefined();
    expect(s.isSynced).toBe(true);
    expect(getEventCount(ctx, 'on_twin_connected')).toBe(1);
  });

  it('twin_connected event sets synced', () => {
    const s = (node as any).__digitalTwinState;
    s.isSynced = false;
    sendEvent(digitalTwinHandler, node, cfg, ctx, { type: 'twin_connected', handle: 'h1' });
    expect(s.isSynced).toBe(true);
    expect(s.connectionHandle).toBe('h1');
  });

  it('twin_state_update applies inbound properties', () => {
    sendEvent(digitalTwinHandler, node, cfg, ctx, {
      type: 'twin_state_update',
      state: { temperature: 42, pressure: 101 },
    });
    expect((node as any).temp).toBe(42);
    expect((node as any).press).toBe(101);
    expect(getEventCount(ctx, 'on_twin_sync')).toBe(1);
  });

  it('does not apply outbound-only properties inbound', () => {
    sendEvent(digitalTwinHandler, node, cfg, ctx, {
      type: 'twin_state_update',
      state: { valve: 'open' },
    });
    expect((node as any).valveState).toBeUndefined();
  });

  it('records history on state update', () => {
    sendEvent(digitalTwinHandler, node, cfg, ctx, {
      type: 'twin_state_update',
      state: { temperature: 20 },
    });
    const s = (node as any).__digitalTwinState;
    expect(s.historyBuffer.length).toBe(1);
  });

  it('twin_property_changed queues outbound update', () => {
    sendEvent(digitalTwinHandler, node, cfg, ctx, {
      type: 'twin_property_changed',
      property: 'valveState',
      value: 'closed',
    });
    const s = (node as any).__digitalTwinState;
    expect(s.pendingUpdates.length).toBe(1);
    expect(s.pendingUpdates[0].property).toBe('valve');
  });

  it('twin_disconnect sets disconnected', () => {
    sendEvent(digitalTwinHandler, node, cfg, ctx, { type: 'twin_disconnect' });
    expect((node as any).__digitalTwinState.isSynced).toBe(false);
    expect(getEventCount(ctx, 'on_twin_disconnected')).toBe(1);
  });

  it('twin_simulate applies simulated changes', () => {
    sendEvent(digitalTwinHandler, node, cfg, ctx, {
      type: 'twin_simulate',
      changes: { temperature: 99, pressure: 200 },
    });
    expect((node as any).temp).toBe(99);
    expect((node as any).press).toBe(200);
  });

  it('twin_query returns status', () => {
    sendEvent(digitalTwinHandler, node, cfg, ctx, { type: 'twin_query', queryId: 'q1' });
    const r = getLastEvent(ctx, 'twin_info') as any;
    expect(r.queryId).toBe('q1');
    expect(r.isSynced).toBe(true);
  });

  it('cleans up on detach', () => {
    digitalTwinHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__digitalTwinState).toBeUndefined();
  });
});
