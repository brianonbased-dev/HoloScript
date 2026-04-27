/**
 * InteractiveGraphTrait — comprehensive test suite
 */
import { describe, it, expect } from 'vitest';
import {
  InteractiveGraphTrait,
  type InteractiveGraphConfig,
} from '../InteractiveGraphTrait';
import type { HSPlusNode, TraitContext } from '../TraitTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(): HSPlusNode {
  return {} as HSPlusNode;
}

interface StateStore {
  interactiveGraph?: {
    hoveredNode: string | null;
    selectedNodes: Set<string>;
    highlightedEdges: Set<string>;
    hoverTimer: number;
    tooltipVisible: boolean;
    flyToProgress: number;
    flyToTarget: [number, number, number] | null;
    flyToStart: [number, number, number] | null;
  };
}

function makeContext(partial: Partial<TraitContext> = {}) {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  const store: StateStore = {};

  const context: TraitContext = {
    emit: (type: string, payload?: unknown) => {
      emitted.push({ type, payload });
    },
    setState: (s: Partial<StateStore>) => {
      Object.assign(store, s);
    },
    getState: () => store as Record<string, unknown>,
    ...partial,
  };
  return { context, emitted, store };
}

/** Build a mock raycast hit for a named node at a given position */
function mockHit(nodeId: string, x = 0, y = 0, z = 0) {
  return {
    node: { name: nodeId, properties: { kind: 'function' } },
    point: [x, y, z] as [number, number, number],
    distance: 5,
  };
}

const BASE_CONFIG = InteractiveGraphTrait.defaultConfig as InteractiveGraphConfig;

function setup(partial: Partial<InteractiveGraphConfig> = {}, ctxPartial: Partial<TraitContext> = {}) {
  const node = makeNode();
  const { context, emitted, store } = makeContext(ctxPartial);
  const config: InteractiveGraphConfig = { ...BASE_CONFIG, ...partial };
  InteractiveGraphTrait.onAttach(node, config, context);
  emitted.length = 0;
  return { node, context, emitted, store, config };
}

function getGraphState(store: StateStore) {
  return store.interactiveGraph!;
}

function fire(
  node: HSPlusNode,
  config: InteractiveGraphConfig,
  context: TraitContext,
  type: string,
  extra: Record<string, unknown> = {}
) {
  InteractiveGraphTrait.onEvent(node, config, context, { type, ...extra });
}

// ---------------------------------------------------------------------------
// onAttach
// ---------------------------------------------------------------------------

describe('onAttach', () => {
  it('should initialise interactiveGraph state', () => {
    const { store } = setup();
    expect(store.interactiveGraph).toBeDefined();
  });

  it('should start with no hovered node', () => {
    const { store } = setup();
    expect(getGraphState(store).hoveredNode).toBeNull();
  });

  it('should start with empty selectedNodes', () => {
    const { store } = setup();
    expect(getGraphState(store).selectedNodes.size).toBe(0);
  });

  it('should start with empty highlightedEdges', () => {
    const { store } = setup();
    expect(getGraphState(store).highlightedEdges.size).toBe(0);
  });

  it('should emit graph:ready', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    InteractiveGraphTrait.onAttach(node, BASE_CONFIG, context);
    expect(emitted.some(e => e.type === 'graph:ready')).toBe(true);
  });

  it('graph:ready payload includes hoverHighlight', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    InteractiveGraphTrait.onAttach(node, BASE_CONFIG, context);
    const ev = emitted.find(e => e.type === 'graph:ready');
    expect((ev!.payload as any).config.hoverHighlight).toBe(true);
  });

  it('should start tooltipVisible=false', () => {
    const { store } = setup();
    expect(getGraphState(store).tooltipVisible).toBe(false);
  });

  it('should start flyToProgress=0', () => {
    const { store } = setup();
    expect(getGraphState(store).flyToProgress).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// onDetach
// ---------------------------------------------------------------------------

describe('onDetach', () => {
  it('should clear selectedNodes', () => {
    const { node, config, context, store } = setup();
    getGraphState(store).selectedNodes.add('node-1');
    InteractiveGraphTrait.onDetach(node, config, context);
    expect(getGraphState(store).selectedNodes.size).toBe(0);
  });

  it('should clear highlightedEdges', () => {
    const { node, config, context, store } = setup();
    getGraphState(store).highlightedEdges.add('a->b');
    InteractiveGraphTrait.onDetach(node, config, context);
    expect(getGraphState(store).highlightedEdges.size).toBe(0);
  });

  it('should emit graph:selection_cleared when nodes were selected', () => {
    const { node, config, store } = setup();
    getGraphState(store).selectedNodes.add('n1');
    const { context, emitted } = makeContext();
    // Re-attach state to new context
    const { context: ctx2, emitted: ev2 } = makeContext();
    ctx2.getState = () => store as Record<string, unknown>;
    InteractiveGraphTrait.onDetach(node, config, ctx2);
    expect(ev2.some(e => e.type === 'graph:selection_cleared')).toBe(true);
  });

  it('should handle detach gracefully when no state', () => {
    const node = makeNode();
    const { context } = makeContext();
    expect(() => InteractiveGraphTrait.onDetach(node, BASE_CONFIG, context)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// defaultConfig
// ---------------------------------------------------------------------------

describe('defaultConfig', () => {
  it('should have name "interactive_graph"', () => {
    expect(InteractiveGraphTrait.name).toBe('interactive_graph');
  });

  it('should have hoverHighlight true', () => {
    expect(BASE_CONFIG.hoverHighlight).toBe(true);
  });

  it('should have clickInspect true', () => {
    expect(BASE_CONFIG.clickInspect).toBe(true);
  });

  it('should have multiSelect true', () => {
    expect(BASE_CONFIG.multiSelect).toBe(true);
  });

  it('should have tooltipDelay 300', () => {
    expect(BASE_CONFIG.tooltipDelay).toBe(300);
  });

  it('should have flyToDuration 0.8', () => {
    expect(BASE_CONFIG.flyToDuration).toBe(0.8);
  });
});

// ---------------------------------------------------------------------------
// onUpdate — tooltip timer
// ---------------------------------------------------------------------------

describe('onUpdate — tooltip', () => {
  it('should not show tooltip before delay', () => {
    const { node, config, context, store } = setup({ tooltipDelay: 300 });
    getGraphState(store).hoveredNode = 'node-A';
    InteractiveGraphTrait.onUpdate(node, config, context, 0.1); // 100ms
    expect(getGraphState(store).tooltipVisible).toBe(false);
  });

  it('should show tooltip after delay elapsed', () => {
    const { node, config, context, store, emitted } = setup({ tooltipDelay: 300 });
    getGraphState(store).hoveredNode = 'node-A';
    InteractiveGraphTrait.onUpdate(node, config, context, 0.4); // 400ms > 300ms
    expect(getGraphState(store).tooltipVisible).toBe(true);
    expect(emitted.some(e => e.type === 'graph:tooltip_show')).toBe(true);
  });

  it('tooltip_show payload includes nodeId', () => {
    const { node, config, context, store, emitted } = setup({ tooltipDelay: 100 });
    getGraphState(store).hoveredNode = 'myNode';
    InteractiveGraphTrait.onUpdate(node, config, context, 0.2);
    const ev = emitted.find(e => e.type === 'graph:tooltip_show');
    expect((ev!.payload as any).nodeId).toBe('myNode');
  });

  it('should not emit tooltip_show if already visible', () => {
    const { node, config, context, store, emitted } = setup({ tooltipDelay: 100 });
    getGraphState(store).hoveredNode = 'n1';
    getGraphState(store).tooltipVisible = true;
    InteractiveGraphTrait.onUpdate(node, config, context, 1);
    expect(emitted.some(e => e.type === 'graph:tooltip_show')).toBe(false);
  });

  it('should not emit tooltip_show if no hovered node', () => {
    const { node, config, context, emitted } = setup({ tooltipDelay: 100 });
    InteractiveGraphTrait.onUpdate(node, config, context, 1);
    expect(emitted.some(e => e.type === 'graph:tooltip_show')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pointer_move — hover
// ---------------------------------------------------------------------------

describe('pointer_move', () => {
  it('should not process hover if hoverHighlight=false', () => {
    const physics = { raycast: () => mockHit('n1') };
    const camera = { position: [0, 0, 0] as [number, number, number] };
    const { node, config, context, emitted } = setup(
      { hoverHighlight: false },
      { physics, camera } as any
    );
    fire(node, config, context, 'pointer_move');
    expect(emitted.some(e => e.type === 'graph:hover')).toBe(false);
  });

  it('should emit graph:hover when node hit', () => {
    const physics = { raycast: () => mockHit('node-X', 1, 2, 3) };
    const camera = { position: [0, 0, 0] as [number, number, number] };
    const { node, config, context, emitted } = setup({}, { physics, camera } as any);
    fire(node, config, context, 'pointer_move');
    expect(emitted.some(e => e.type === 'graph:hover')).toBe(true);
  });

  it('graph:hover payload includes nodeId and position', () => {
    const physics = { raycast: () => mockHit('node-X', 1, 2, 3) };
    const camera = { position: [0, 0, 0] as [number, number, number] };
    const { node, config, context, emitted } = setup({}, { physics, camera } as any);
    fire(node, config, context, 'pointer_move');
    const ev = emitted.find(e => e.type === 'graph:hover');
    expect((ev!.payload as any).nodeId).toBe('node-X');
    expect((ev!.payload as any).position).toEqual([1, 2, 3]);
  });

  it('should update hoveredNode in state', () => {
    const physics = { raycast: () => mockHit('n1') };
    const camera = { position: [0, 0, 0] as [number, number, number] };
    const { node, config, context, store } = setup({}, { physics, camera } as any);
    fire(node, config, context, 'pointer_move');
    expect(getGraphState(store).hoveredNode).toBe('n1');
  });

  it('should emit graph:hover_exit when leaving a node', () => {
    const physics = { raycast: () => null };
    const { node, config, context, store, emitted } = setup({}, { physics } as any);
    getGraphState(store).hoveredNode = 'n1';
    fire(node, config, context, 'pointer_move');
    expect(emitted.some(e => e.type === 'graph:hover_exit')).toBe(true);
  });

  it('hover_exit payload includes the previous nodeId', () => {
    const physics = { raycast: () => null };
    const { node, config, context, store, emitted } = setup({}, { physics } as any);
    getGraphState(store).hoveredNode = 'prev-node';
    fire(node, config, context, 'pointer_move');
    const ev = emitted.find(e => e.type === 'graph:hover_exit');
    expect((ev!.payload as any).nodeId).toBe('prev-node');
  });

  it('should reset hoverTimer when node changes', () => {
    const physics = { raycast: () => mockHit('n2') };
    const { node, config, context, store } = setup({}, { physics } as any);
    getGraphState(store).hoveredNode = 'n1';
    getGraphState(store).hoverTimer = 500;
    fire(node, config, context, 'pointer_move');
    expect(getGraphState(store).hoverTimer).toBe(0);
  });

  it('should hide tooltip on node change', () => {
    const physics = { raycast: () => null };
    const { node, config, context, store, emitted } = setup({}, { physics } as any);
    getGraphState(store).hoveredNode = 'n1';
    getGraphState(store).tooltipVisible = true;
    fire(node, config, context, 'pointer_move');
    expect(emitted.some(e => e.type === 'graph:tooltip_hide')).toBe(true);
  });

  it('should emit graph:edge_highlight when edgeHighlight=true and node hit', () => {
    const physics = { raycast: () => mockHit('n1') };
    const camera = { position: [0, 0, 0] as [number, number, number] };
    const { node, config, context, emitted } = setup({ edgeHighlight: true }, { physics, camera } as any);
    fire(node, config, context, 'pointer_move');
    expect(emitted.some(e => e.type === 'graph:edge_highlight')).toBe(true);
  });

  it('should NOT emit edge_highlight when edgeHighlight=false', () => {
    const physics = { raycast: () => mockHit('n1') };
    const camera = { position: [0, 0, 0] as [number, number, number] };
    const { node, config, context, emitted } = setup({ edgeHighlight: false }, { physics, camera } as any);
    fire(node, config, context, 'pointer_move');
    expect(emitted.some(e => e.type === 'graph:edge_highlight')).toBe(false);
  });

  it('should not re-emit hover for same node', () => {
    const physics = { raycast: () => mockHit('n1') };
    const camera = { position: [0, 0, 0] as [number, number, number] };
    const { node, config, context, store, emitted } = setup({}, { physics, camera } as any);
    getGraphState(store).hoveredNode = 'n1'; // already hovered
    fire(node, config, context, 'pointer_move');
    expect(emitted.some(e => e.type === 'graph:hover')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pointer_click — selection
// ---------------------------------------------------------------------------

describe('pointer_click', () => {
  it('should not process click if clickInspect=false', () => {
    const physics = { raycast: () => mockHit('n1') };
    const camera = { position: [0, 0, 0] as [number, number, number] };
    const { node, config, context, emitted } = setup({ clickInspect: false }, { physics, camera } as any);
    fire(node, config, context, 'pointer_click');
    expect(emitted.some(e => e.type === 'graph:select')).toBe(false);
  });

  it('should emit graph:select when node clicked', () => {
    const physics = { raycast: () => mockHit('n1') };
    const camera = { position: [0, 0, 0] as [number, number, number] };
    const { node, config, context, emitted } = setup({}, { physics, camera } as any);
    fire(node, config, context, 'pointer_click');
    expect(emitted.some(e => e.type === 'graph:select')).toBe(true);
  });

  it('graph:select should include nodeId', () => {
    const physics = { raycast: () => mockHit('nodeA') };
    const camera = { position: [0, 0, 0] as [number, number, number] };
    const { node, config, context, emitted } = setup({}, { physics, camera } as any);
    fire(node, config, context, 'pointer_click');
    const ev = emitted.find(e => e.type === 'graph:select');
    expect((ev!.payload as any).nodeId).toBe('nodeA');
  });

  it('single click should replace selection', () => {
    const physics = { raycast: () => mockHit('n2') };
    const camera = { position: [0, 0, 0] as [number, number, number] };
    const { node, config, context, store } = setup({}, { physics, camera } as any);
    getGraphState(store).selectedNodes.add('n1');
    fire(node, config, context, 'pointer_click');
    expect(getGraphState(store).selectedNodes.has('n1')).toBe(false);
    expect(getGraphState(store).selectedNodes.has('n2')).toBe(true);
  });

  it('shift-click should add to selection when multiSelect=true', () => {
    const physics = { raycast: () => mockHit('n2') };
    const camera = { position: [0, 0, 0] as [number, number, number] };
    const { node, config, context, store } = setup({ multiSelect: true }, { physics, camera } as any);
    getGraphState(store).selectedNodes.add('n1');
    fire(node, config, context, 'pointer_click', { modifiers: ['Shift'] });
    expect(getGraphState(store).selectedNodes.has('n1')).toBe(true);
    expect(getGraphState(store).selectedNodes.has('n2')).toBe(true);
  });

  it('shift-click on already-selected node should deselect it', () => {
    const physics = { raycast: () => mockHit('n1') };
    const camera = { position: [0, 0, 0] as [number, number, number] };
    const { node, config, context, store } = setup({ multiSelect: true }, { physics, camera } as any);
    getGraphState(store).selectedNodes.add('n1');
    fire(node, config, context, 'pointer_click', { modifiers: ['Shift'] });
    expect(getGraphState(store).selectedNodes.has('n1')).toBe(false);
  });

  it('should clear selection when clicking empty space', () => {
    const physics = { raycast: () => null };
    const { node, config, context, store, emitted } = setup({}, { physics } as any);
    getGraphState(store).selectedNodes.add('n1');
    fire(node, config, context, 'pointer_click');
    expect(getGraphState(store).selectedNodes.size).toBe(0);
    expect(emitted.some(e => e.type === 'graph:selection_cleared')).toBe(true);
  });

  it('should not emit selection_cleared if empty and click on empty', () => {
    const physics = { raycast: () => null };
    const { node, config, context, emitted } = setup({}, { physics } as any);
    fire(node, config, context, 'pointer_click');
    expect(emitted.some(e => e.type === 'graph:selection_cleared')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pointer_double_click — focus
// ---------------------------------------------------------------------------

describe('pointer_double_click', () => {
  it('should emit graph:focus when node double-clicked', () => {
    const physics = {
      raycast: () => mockHit('n1', 5, 5, 5),
      getBodyPosition: () => [5, 5, 5] as [number, number, number],
    };
    const camera = { position: [0, 0, 10] as [number, number, number] };
    const { node, config, context, emitted } = setup({}, { physics, camera } as any);
    fire(node, config, context, 'pointer_double_click');
    expect(emitted.some(e => e.type === 'graph:focus')).toBe(true);
  });

  it('graph:focus payload includes nodeId and cameraTarget', () => {
    const physics = {
      raycast: () => mockHit('nFocus', 3, 2, 1),
      getBodyPosition: () => [3, 2, 1] as [number, number, number],
    };
    const camera = { position: [0, 0, 10] as [number, number, number] };
    const { node, config, context, emitted } = setup({}, { physics, camera } as any);
    fire(node, config, context, 'pointer_double_click');
    const ev = emitted.find(e => e.type === 'graph:focus');
    expect((ev!.payload as any).nodeId).toBe('nFocus');
    expect((ev!.payload as any).cameraTarget).toBeDefined();
  });

  it('should do nothing if no raycast hit', () => {
    const physics = { raycast: () => null };
    const { node, config, context, emitted } = setup({}, { physics } as any);
    fire(node, config, context, 'pointer_double_click');
    expect(emitted.some(e => e.type === 'graph:focus')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// graph:clear_selection
// ---------------------------------------------------------------------------

describe('graph:clear_selection', () => {
  it('should clear selectedNodes', () => {
    const { node, config, context, store } = setup();
    getGraphState(store).selectedNodes.add('n1');
    fire(node, config, context, 'graph:clear_selection');
    expect(getGraphState(store).selectedNodes.size).toBe(0);
  });

  it('should emit graph:selection_cleared', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'graph:clear_selection');
    expect(emitted.some(e => e.type === 'graph:selection_cleared')).toBe(true);
  });

  it('should clear highlightedEdges', () => {
    const { node, config, context, store } = setup();
    getGraphState(store).highlightedEdges.add('a->b');
    fire(node, config, context, 'graph:clear_selection');
    expect(getGraphState(store).highlightedEdges.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// graph:select_nodes
// ---------------------------------------------------------------------------

describe('graph:select_nodes', () => {
  it('should add multiple nodes to selection', () => {
    const { node, config, context, store } = setup();
    fire(node, config, context, 'graph:select_nodes', { nodeIds: ['a', 'b', 'c'] });
    expect(getGraphState(store).selectedNodes.size).toBe(3);
  });

  it('should emit graph:select', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'graph:select_nodes', { nodeIds: ['x'] });
    expect(emitted.some(e => e.type === 'graph:select')).toBe(true);
  });

  it('should include count in select payload', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'graph:select_nodes', { nodeIds: ['a', 'b'] });
    const ev = emitted.find(e => e.type === 'graph:select');
    expect((ev!.payload as any).count).toBe(2);
  });

  it('should do nothing if nodeIds missing', () => {
    const { node, config, context } = setup();
    expect(() => fire(node, config, context, 'graph:select_nodes', {})).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// graph:focus_node
// ---------------------------------------------------------------------------

describe('graph:focus_node', () => {
  it('should emit graph:fly_to_complete after flyToDuration seconds', () => {
    const physics = {
      getBodyPosition: () => [10, 0, 0] as [number, number, number],
    };
    const camera = { position: [0, 0, 0] as [number, number, number] };
    const { node, config, context, store, emitted } = setup(
      { flyToDuration: 0.5 },
      { physics, camera } as any
    );
    fire(node, config, context, 'graph:focus_node', { nodeId: 'target' });
    // Simulate enough update ticks to complete fly-to
    for (let i = 0; i < 5; i++) {
      InteractiveGraphTrait.onUpdate(node, config, context, 0.2);
    }
    expect(emitted.some(e => e.type === 'graph:fly_to_complete')).toBe(true);
  });

  it('should not start fly-to without camera', () => {
    const physics = { getBodyPosition: () => [1, 2, 3] as [number, number, number] };
    const { node, config, context, store } = setup({}, { physics } as any);
    fire(node, config, context, 'graph:focus_node', { nodeId: 'n1' });
    expect(getGraphState(store).flyToProgress).toBe(0);
  });

  it('should not start fly-to without body position', () => {
    const physics = { getBodyPosition: () => undefined };
    const camera = { position: [0, 0, 0] as [number, number, number] };
    const { node, config, context, store } = setup({}, { physics, camera } as any);
    fire(node, config, context, 'graph:focus_node', { nodeId: 'n1' });
    expect(getGraphState(store).flyToProgress).toBe(0);
  });
});
