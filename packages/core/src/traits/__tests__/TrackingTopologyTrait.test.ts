import { describe, it, expect, beforeEach } from 'vitest';
import { trackingTopologyHandler } from '../TrackingTopologyTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
} from './traitTestHelpers';

describe('TrackingTopologyTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('topo-1');
    ctx = createMockContext();
    attachTrait(trackingTopologyHandler, node, {}, ctx);
  });

  it('upserts headsets and exposes them on query', () => {
    sendEvent(trackingTopologyHandler, node, {}, ctx, {
      type: 'topology_upsert_headset',
      headset: { id: 'h1', position: { x: 0, y: 1, z: 0 }, active: true, fov_deg: 110 },
    });
    sendEvent(trackingTopologyHandler, node, {}, ctx, { type: 'topology_query', queryId: 'q1' });
    const snap = getLastEvent(ctx, 'topology_snapshot') as { headsets: Array<{ id: string }> };
    expect(snap.headsets).toHaveLength(1);
    expect(snap.headsets[0].id).toBe('h1');
  });

  it('remove of non-existent target is a no-op (false-case, no crash)', () => {
    sendEvent(trackingTopologyHandler, node, {}, ctx, {
      type: 'topology_remove_target',
      id: 'does-not-exist',
    });
    sendEvent(trackingTopologyHandler, node, {}, ctx, { type: 'topology_query', queryId: 'q2' });
    const snap = getLastEvent(ctx, 'topology_snapshot') as { targets: unknown[] };
    expect(snap.targets).toHaveLength(0);
  });

  it('association list is per-frame ephemeral (cleared after refresh)', () => {
    sendEvent(trackingTopologyHandler, node, {}, ctx, {
      type: 'topology_association',
      association: {
        kind: 'hungarian',
        from: { x: 0, y: 0, z: 0 },
        to: { x: 1, y: 0, z: 0 },
        cost_or_similarity: 0.2,
        dashed: false,
        badge_text: '0.20',
      },
    });
    sendEvent(trackingTopologyHandler, node, {}, ctx, { type: 'topology_query', queryId: 'q3' });
    const snap = getLastEvent(ctx, 'topology_snapshot') as { associations: unknown[] };
    expect(snap.associations).toHaveLength(1);
  });
});
