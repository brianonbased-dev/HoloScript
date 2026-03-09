/**
 * RoadmapTrait Production Tests
 *
 * Binds a spatial object to a project milestone (Phase 5 Spatial Governance).
 * Tests: defaultConfig, onAttach (milestone sync → color/text/progress + emit),
 * onUpdate (periodic resync), onEvent (click handler with interactive flag).
 * Mocks roadmapService to avoid external dependencies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock roadmapService ──────────────────────────────────────────────────────

// Mock path relative to __tests__/ dir (NOT relative to the source file)
vi.mock('../../services/HololandRoadmapService', () => ({
  roadmapService: {
    getMilestone: vi.fn(),
  },
}));

import roadmapNodeHandler from '../RoadmapTrait';
import { roadmapService } from '../../services/HololandRoadmapService';

// ── Helpers ──────────────────────────────────────────────────────────────────

const svcMock = roadmapService as { getMilestone: ReturnType<typeof vi.fn> };

function milestone(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    title: 'Feature Complete',
    status: 'in-progress',
    progress: 60,
    ...overrides,
  };
}

function makeNode(): any {
  return { id: 'n1', properties: {} };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function makeConfig(
  overrides: Partial<{
    milestone_id: string;
    show_progress: boolean;
    interactive: boolean;
  }> = {}
) {
  return { ...roadmapNodeHandler.defaultConfig, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── defaultConfig ─────────────────────────────────────────────────────────────

describe('RoadmapTrait — defaultConfig', () => {
  it('name is roadmap_node', () => {
    expect(roadmapNodeHandler.name).toBe('roadmap_node');
  });

  it('milestone_id defaults to empty string', () => {
    expect(roadmapNodeHandler.defaultConfig.milestone_id).toBe('');
  });

  it('show_progress defaults to true', () => {
    expect(roadmapNodeHandler.defaultConfig.show_progress).toBe(true);
  });

  it('interactive defaults to true', () => {
    expect(roadmapNodeHandler.defaultConfig.interactive).toBe(true);
  });
});

// ── onAttach ──────────────────────────────────────────────────────────────────

describe('RoadmapTrait — onAttach', () => {
  it('sets node color from milestone status', () => {
    svcMock.getMilestone.mockReturnValue(milestone({ status: 'completed' }));
    const node = makeNode();
    roadmapNodeHandler.onAttach!(node, makeConfig({ milestone_id: 'm1' }), makeCtx() as any);
    expect(node.properties.color).toBe('#4caf50');
  });

  it('sets node text to milestone title', () => {
    svcMock.getMilestone.mockReturnValue(milestone({ title: 'MVP Launch', status: 'planned' }));
    const node = makeNode();
    roadmapNodeHandler.onAttach!(node, makeConfig({ milestone_id: 'm1' }), makeCtx() as any);
    expect(node.properties.text).toBe('MVP Launch');
  });

  it('sets node progress when show_progress=true', () => {
    svcMock.getMilestone.mockReturnValue(milestone({ progress: 75 }));
    const node = makeNode();
    roadmapNodeHandler.onAttach!(
      node,
      makeConfig({ milestone_id: 'm1', show_progress: true }),
      makeCtx() as any
    );
    expect(node.properties.progress).toBe(75);
  });

  it('does NOT set node progress when show_progress=false', () => {
    svcMock.getMilestone.mockReturnValue(milestone({ progress: 75 }));
    const node = makeNode();
    roadmapNodeHandler.onAttach!(
      node,
      makeConfig({ milestone_id: 'm1', show_progress: false }),
      makeCtx() as any
    );
    expect(node.properties.progress).toBeUndefined();
  });

  it('emits roadmap_node_attached with node id and milestone', () => {
    const m = milestone();
    svcMock.getMilestone.mockReturnValue(m);
    const node = makeNode();
    const ctx = makeCtx();
    roadmapNodeHandler.onAttach!(node, makeConfig({ milestone_id: 'm1' }), ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith(
      'roadmap_node_attached',
      expect.objectContaining({
        nodeId: 'n1',
        milestone: m,
      })
    );
  });

  it('still emits even when milestone is null (unknown id)', () => {
    svcMock.getMilestone.mockReturnValue(null);
    const node = makeNode();
    const ctx = makeCtx();
    roadmapNodeHandler.onAttach!(node, makeConfig({ milestone_id: 'unknown' }), ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith(
      'roadmap_node_attached',
      expect.objectContaining({
        milestone: null,
      })
    );
  });

  it('does not set node.properties when milestone is null', () => {
    svcMock.getMilestone.mockReturnValue(null);
    const node = makeNode();
    roadmapNodeHandler.onAttach!(node, makeConfig(), makeCtx() as any);
    expect(node.properties.color).toBeUndefined();
    expect(node.properties.text).toBeUndefined();
  });

  it('does not throw when node.properties is missing', () => {
    svcMock.getMilestone.mockReturnValue(milestone());
    const node = { id: 'n2' }; // no properties
    expect(() =>
      roadmapNodeHandler.onAttach!(node, makeConfig({ milestone_id: 'm1' }), makeCtx() as any)
    ).not.toThrow();
  });
});

// ── onUpdate ──────────────────────────────────────────────────────────────────

describe('RoadmapTrait — onUpdate', () => {
  it('updates color on every frame', () => {
    svcMock.getMilestone.mockReturnValue(milestone({ status: 'blocked' }));
    const node = makeNode();
    roadmapNodeHandler.onUpdate!(node, makeConfig({ milestone_id: 'm1' }), makeCtx() as any, 16);
    expect(node.properties.color).toBe('#f44336');
  });

  it('updates progress when show_progress=true', () => {
    svcMock.getMilestone.mockReturnValue(milestone({ progress: 90 }));
    const node = makeNode();
    roadmapNodeHandler.onUpdate!(
      node,
      makeConfig({ milestone_id: 'm1', show_progress: true }),
      makeCtx() as any,
      16
    );
    expect(node.properties.progress).toBe(90);
  });

  it('does NOT update progress when show_progress=false', () => {
    svcMock.getMilestone.mockReturnValue(milestone({ progress: 90 }));
    const node = makeNode();
    node.properties.progress = 50; // previous value
    roadmapNodeHandler.onUpdate!(
      node,
      makeConfig({ milestone_id: 'm1', show_progress: false }),
      makeCtx() as any,
      16
    );
    expect(node.properties.progress).toBe(50); // unchanged
  });

  it('does not throw when milestone is null', () => {
    svcMock.getMilestone.mockReturnValue(null);
    const node = makeNode();
    expect(() =>
      roadmapNodeHandler.onUpdate!(node, makeConfig(), makeCtx() as any, 16)
    ).not.toThrow();
  });
});

// ── onEvent ───────────────────────────────────────────────────────────────────

describe('RoadmapTrait — onEvent', () => {
  it('click event emits show_milestone_details when interactive=true', () => {
    const m = milestone();
    svcMock.getMilestone.mockReturnValue(m);
    const node = makeNode();
    const ctx = makeCtx();
    roadmapNodeHandler.onEvent!(
      node,
      makeConfig({ milestone_id: 'm1', interactive: true }),
      ctx as any,
      { type: 'click' }
    );
    expect(ctx.emit).toHaveBeenCalledWith(
      'show_milestone_details',
      expect.objectContaining({
        milestone: m,
      })
    );
  });

  it('click event does NOT emit when interactive=false', () => {
    svcMock.getMilestone.mockReturnValue(milestone());
    const node = makeNode();
    const ctx = makeCtx();
    roadmapNodeHandler.onEvent!(node, makeConfig({ interactive: false }), ctx as any, {
      type: 'click',
    });
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('non-click event type does not emit', () => {
    svcMock.getMilestone.mockReturnValue(milestone());
    const node = makeNode();
    const ctx = makeCtx();
    roadmapNodeHandler.onEvent!(node, makeConfig({ interactive: true }), ctx as any, {
      type: 'hover',
    });
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('click when milestone is null does not emit', () => {
    svcMock.getMilestone.mockReturnValue(null);
    const node = makeNode();
    const ctx = makeCtx();
    roadmapNodeHandler.onEvent!(
      node,
      makeConfig({ milestone_id: 'm_none', interactive: true }),
      ctx as any,
      { type: 'click' }
    );
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ── getStatusColor (indirectly via onAttach) ──────────────────────────────────

describe('RoadmapTrait — status color mapping (via onAttach)', () => {
  const cases: [string, string][] = [
    ['completed', '#4caf50'],
    ['in-progress', '#2196f3'],
    ['blocked', '#f44336'],
    ['planned', '#9e9e9e'],
    ['unknown', '#ffffff'],
  ];

  for (const [status, expectedColor] of cases) {
    it(`status "${status}" → ${expectedColor}`, () => {
      svcMock.getMilestone.mockReturnValue(milestone({ status }));
      const node = makeNode();
      roadmapNodeHandler.onAttach!(node, makeConfig({ milestone_id: 'm1' }), makeCtx() as any);
      expect(node.properties.color).toBe(expectedColor);
    });
  }
});
