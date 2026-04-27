/**
 * IncidentTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { incidentHandler } from '../IncidentTrait';

const makeNode = () => ({
  id: 'n1', traits: new Set<string>(), emit: vi.fn(),
  __incidentState: undefined as unknown,
});
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});
const defaultConfig = { max_incidents: 200, auto_archive_resolved: true };

describe('IncidentTrait', () => {
  it('has name "incident"', () => {
    expect(incidentHandler.name).toBe('incident');
  });

  it('defaultConfig max_incidents=200', () => {
    expect(incidentHandler.defaultConfig?.max_incidents).toBe(200);
  });

  it('onAttach creates empty incidents map', () => {
    const node = makeNode();
    incidentHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__incidentState as { incidents: Map<string, unknown> };
    expect(state.incidents.size).toBe(0);
  });

  it('incident:open creates incident and emits incident:updated with status open', () => {
    const node = makeNode();
    incidentHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    incidentHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'incident:open', incidentId: 'inc-1', title: 'DB down', severity: 'critical', source: 'monitor',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('incident:updated', expect.objectContaining({
      incidentId: 'inc-1', status: 'open',
    }));
  });

  it('incident:acknowledge sets status to acknowledged', () => {
    const node = makeNode();
    incidentHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    incidentHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'incident:open', incidentId: 'inc-2', title: 'API error', severity: 'high', source: 'alert',
    } as never);
    node.emit.mockClear();
    incidentHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'incident:acknowledge', incidentId: 'inc-2', acknowledgedBy: 'oncall',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('incident:updated', expect.objectContaining({
      incidentId: 'inc-2', status: 'acknowledged',
    }));
  });

  it('incident:resolve sets status to resolved', () => {
    const node = makeNode();
    incidentHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    incidentHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'incident:open', incidentId: 'inc-3', title: 'OOM', severity: 'low', source: 'k8s',
    } as never);
    node.emit.mockClear();
    incidentHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'incident:resolve', incidentId: 'inc-3', resolution: 'Restarted pod',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('incident:updated', expect.objectContaining({
      incidentId: 'inc-3', status: 'resolved',
    }));
  });

  it('incident:list emits incident:info with array', () => {
    const node = makeNode();
    incidentHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    incidentHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'incident:list',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('incident:info', expect.objectContaining({
      incidents: expect.any(Array),
    }));
  });
});
