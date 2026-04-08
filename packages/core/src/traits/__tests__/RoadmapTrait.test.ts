import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockNode,
  createMockContext,
  attachTrait,
  updateTrait,
  sendEvent,
} from './traitTestHelpers';

// Mock roadmapService
vi.mock('../../services/HololandRoadmapService', () => ({
  roadmapService: {
    getMilestone: vi.fn((id: string) => {
      if (id === 'ms-1')
        return { id: 'ms-1', title: 'Launch MVP', status: 'in-progress', progress: 0.6 };
      if (id === 'ms-2') return { id: 'ms-2', title: 'Scale', status: 'completed', progress: 1.0 };
      if (id === 'ms-blocked')
        return { id: 'ms-blocked', title: 'Blocked', status: 'blocked', progress: 0.1 };
      return null;
    }),
  },
}));

import { roadmapNodeHandler } from '../RoadmapTrait';

describe('RoadmapTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    milestone_id: 'ms-1',
    show_progress: true,
    interactive: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    node = createMockNode('Sprint1');
    (node as any).properties = {};
    ctx = createMockContext();
    attachTrait(roadmapNodeHandler, node, cfg, ctx);
  });

  it('syncs color with Sprint status on attach', () => {
    // in-progress → blue #2196f3
    expect((node as any).properties.color).toBe('#2196f3');
  });

  it('syncs title with Sprint text on attach', () => {
    expect((node as any).properties.text).toBe('Launch MVP');
  });

  it('syncs progress when show_progress is true', () => {
    expect((node as any).properties.progress).toBe(0.6);
  });

  it('emits roadmap_node_attached on attach', () => {
    expect(ctx.emittedEvents.some((e) => e.event === 'roadmap_node_attached')).toBe(true);
  });

  it('updates color on periodic update', () => {
    updateTrait(roadmapNodeHandler, node, cfg, ctx, 1.0);
    expect((node as any).properties.color).toBe('#2196f3');
  });

  it('handles click event to show Sprint details', () => {
    sendEvent(roadmapNodeHandler, node, cfg, ctx, { type: 'click' });
    expect(ctx.emittedEvents.some((e) => e.event === 'show_milestone_details')).toBe(true);
  });

  it('maps completed status to green', () => {
    const node2 = createMockNode('ms2');
    (node2 as any).properties = {};
    attachTrait(roadmapNodeHandler, node2, { ...cfg, milestone_id: 'ms-2' }, ctx);
    expect((node2 as any).properties.color).toBe('#4caf50');
  });

  it('maps blocked status to red', () => {
    const node3 = createMockNode('ms3');
    (node3 as any).properties = {};
    attachTrait(roadmapNodeHandler, node3, { ...cfg, milestone_id: 'ms-blocked' }, ctx);
    expect((node3 as any).properties.color).toBe('#f44336');
  });

  it('handles missing Sprint gracefully', () => {
    const node4 = createMockNode('ms4');
    (node4 as any).properties = {};
    attachTrait(roadmapNodeHandler, node4, { ...cfg, milestone_id: 'nonexistent' }, ctx);
    // color should not be set
    expect((node4 as any).properties.color).toBeUndefined();
  });

  it('has correct handler name', () => {
    expect(roadmapNodeHandler.name).toBe('roadmap_node');
  });
});
