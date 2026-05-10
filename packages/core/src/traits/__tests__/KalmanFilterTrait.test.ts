import { describe, it, expect, beforeEach } from 'vitest';
import { kalmanFilterHandler } from '../KalmanFilterTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('KalmanFilterTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('kf-1');
    ctx = createMockContext();
    attachTrait(kalmanFilterHandler, node, {}, ctx);
  });

  it('reports active=false before any measurement (false-case)', () => {
    sendEvent(kalmanFilterHandler, node, {}, ctx, { type: 'kalman_query', queryId: 'q1' });
    const status = getLastEvent(ctx, 'kalman_state') as { active: boolean };
    expect(status).toBeDefined();
    expect(status.active).toBe(false);
  });

  it('initializes on first measurement and converges position with second update', () => {
    sendEvent(kalmanFilterHandler, node, {}, ctx, {
      type: 'kalman_measurement',
      measurement: { pos: { x: 1, y: 2, z: 3 }, timestamp: Date.now() },
    });
    expect(getEventCount(ctx, 'kalman_initialized')).toBe(1);

    sendEvent(kalmanFilterHandler, node, {}, ctx, {
      type: 'kalman_measurement',
      measurement: { pos: { x: 1.1, y: 2.1, z: 3.1 }, timestamp: Date.now() },
    });
    expect(getEventCount(ctx, 'kalman_updated')).toBe(1);
    const updated = getLastEvent(ctx, 'kalman_updated') as { state: { pos: { x: number } } };
    expect(updated.state.pos.x).toBeGreaterThan(1);
    expect(updated.state.pos.x).toBeLessThanOrEqual(1.1);
  });

  it('reset clears active flag (false-case after activation)', () => {
    sendEvent(kalmanFilterHandler, node, {}, ctx, {
      type: 'kalman_measurement',
      measurement: { pos: { x: 5, y: 5, z: 5 }, timestamp: Date.now() },
    });
    sendEvent(kalmanFilterHandler, node, {}, ctx, { type: 'kalman_reset' });
    sendEvent(kalmanFilterHandler, node, {}, ctx, { type: 'kalman_query', queryId: 'q2' });
    const status = getLastEvent(ctx, 'kalman_state') as { active: boolean };
    expect(status.active).toBe(false);
  });
});
