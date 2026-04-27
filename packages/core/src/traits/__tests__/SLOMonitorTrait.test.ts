/**
 * SLOMonitorTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { sloMonitorHandler } from '../SLOMonitorTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __sloState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { alert_on_budget_breach: true };

describe('SLOMonitorTrait', () => {
  it('has name "slo_monitor"', () => {
    expect(sloMonitorHandler.name).toBe('slo_monitor');
  });

  it('slo:define stores SLO', () => {
    const node = makeNode();
    sloMonitorHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    sloMonitorHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'slo:define', sloId: 'api', target: 0.99, window_ms: 86400000,
    } as never);
    const state = node.__sloState as { slos: Map<string, unknown> };
    expect(state.slos.has('api')).toBe(true);
  });
});
