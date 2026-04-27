/**
 * PagerdutyTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { pagerdutyHandler } from '../PagerdutyTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __pdState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { severity: 'critical' };

describe('PagerdutyTrait', () => {
  it('has name "pagerduty"', () => {
    expect(pagerdutyHandler.name).toBe('pagerduty');
  });

  it('pagerduty:trigger increments and emits pagerduty:triggered', () => {
    const node = makeNode();
    pagerdutyHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    pagerdutyHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'pagerduty:trigger', summary: 'CPU high',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('pagerduty:triggered', expect.objectContaining({
      incidentId: 'PD-1', severity: 'critical',
    }));
  });

  it('pagerduty:resolve emits pagerduty:resolved', () => {
    const node = makeNode();
    pagerdutyHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    pagerdutyHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'pagerduty:resolve', incidentId: 'PD-1',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('pagerduty:resolved', { incidentId: 'PD-1' });
  });
});
