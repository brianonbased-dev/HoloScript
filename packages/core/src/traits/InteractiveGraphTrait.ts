/**
 * Interactive Graph Trait
 *
 * Enables spatial interaction with codebase graph visualizations:
 * hover highlighting, click selection, edge tracing, and camera focus.
 *
 * Follows the TraitHandler lifecycle pattern (onAttach/onDetach/onUpdate/onEvent).
 *
 * Events handled:
 *   pointer_move  → raycast → update hovered node → emit graph:hover
 *   pointer_click → toggle selection → emit graph:select
 *   pointer_double_click → focus camera → emit graph:focus
 *
 * Events emitted:
 *   graph:hover  { nodeId, symbol, position }
 *   graph:select { nodeId, symbol, neighbors }
 *   graph:focus  { nodeId, cameraTarget }
 *   graph:edge_highlight { edges }
 *
 * @version 1.0.0
 */

import type { TraitHandler, TraitContext, TraitEvent, RaycastHit } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

// =============================================================================
// TYPES
// =============================================================================

export interface InteractiveGraphConfig {
  /** Enable hover highlighting (default: true) */
  hoverHighlight: boolean;
  /** Enable click-to-inspect (default: true) */
  clickInspect: boolean;
  /** Highlight connected edges on hover/select (default: true) */
  edgeHighlight: boolean;
  /** Allow multi-select with Shift+click (default: true) */
  multiSelect: boolean;
  /** Tooltip delay in ms (default: 300) */
  tooltipDelay: number;
  /** Max raycast distance (default: 100) */
  raycastDistance: number;
  /** Hover scale multiplier (default: 1.15) */
  hoverScale: number;
  /** Selected emissive intensity boost (default: 0.5) */
  selectedEmissive: number;
  /** Camera fly-to duration in seconds (default: 0.8) */
  flyToDuration: number;
}

interface InteractiveGraphState {
  /** Currently hovered node ID (null if none) */
  hoveredNode: string | null;
  /** Set of selected node IDs */
  selectedNodes: Set<string>;
  /** Set of highlighted edge IDs (from:to) */
  highlightedEdges: Set<string>;
  /** Hover timer for tooltip delay */
  hoverTimer: number;
  /** Whether a tooltip is currently shown */
  tooltipVisible: boolean;
  /** Camera fly-to animation progress (0 = done) */
  flyToProgress: number;
  /** Camera fly-to target position */
  flyToTarget: { x: number; y: number; z: number } | null;
  /** Camera fly-to start position */
  flyToStart: { x: number; y: number; z: number } | null;
}

// =============================================================================
// TRAIT HANDLER
// =============================================================================

export const InteractiveGraphTrait: TraitHandler<InteractiveGraphConfig> = {
  name: 'interactive_graph',

  defaultConfig: {
    hoverHighlight: true,
    clickInspect: true,
    edgeHighlight: true,
    multiSelect: true,
    tooltipDelay: 300,
    raycastDistance: 100,
    hoverScale: 1.15,
    selectedEmissive: 0.5,
    flyToDuration: 0.8,
  },

  onAttach(node: HSPlusNode, config: InteractiveGraphConfig, context: TraitContext): void {
    const state: InteractiveGraphState = {
      hoveredNode: null,
      selectedNodes: new Set(),
      highlightedEdges: new Set(),
      hoverTimer: 0,
      tooltipVisible: false,
      flyToProgress: 0,
      flyToTarget: null,
      flyToStart: null,
    };
    context.setState({ interactiveGraph: state });

    context.emit('graph:ready', {
      config: {
        hoverHighlight: config.hoverHighlight,
        clickInspect: config.clickInspect,
        multiSelect: config.multiSelect,
      },
    });
  },

  onDetach(_node: HSPlusNode, _config: InteractiveGraphConfig, context: TraitContext): void {
    const state = context.getState().interactiveGraph as InteractiveGraphState | undefined;
    if (state) {
      if (state.selectedNodes.size > 0) {
        context.emit('graph:selection_cleared', {
          previousCount: state.selectedNodes.size,
        });
      }
      state.selectedNodes.clear();
      state.highlightedEdges.clear();
    }
  },

  onUpdate(
    _node: HSPlusNode,
    config: InteractiveGraphConfig,
    context: TraitContext,
    delta: number
  ): void {
    const state = context.getState().interactiveGraph as InteractiveGraphState | undefined;
    if (!state) return;

    // Hover tooltip timer
    if (state.hoveredNode && !state.tooltipVisible) {
      state.hoverTimer += delta * 1000; // Convert to ms
      if (state.hoverTimer >= config.tooltipDelay) {
        state.tooltipVisible = true;
        context.emit('graph:tooltip_show', { nodeId: state.hoveredNode });
      }
    }

    // Camera fly-to animation
    if (state.flyToProgress > 0 && state.flyToTarget && state.flyToStart && context.camera) {
      state.flyToProgress = Math.max(0, state.flyToProgress - delta / config.flyToDuration);
      const t = 1 - state.flyToProgress;
      // Ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);

      const pos = context.camera.position;
      pos.x = state.flyToStart.x + (state.flyToTarget.x - state.flyToStart.x) * ease;
      pos.y = state.flyToStart.y + (state.flyToTarget.y - state.flyToStart.y) * ease;
      pos.z = state.flyToStart.z + (state.flyToTarget.z - state.flyToStart.z) * ease;

      if (state.flyToProgress <= 0) {
        state.flyToTarget = null;
        state.flyToStart = null;
        context.emit('graph:fly_to_complete');
      }
    }
  },

  onEvent(
    _node: HSPlusNode,
    config: InteractiveGraphConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = context.getState().interactiveGraph as InteractiveGraphState | undefined;
    if (!state) return;

    switch (event.type) {
      case 'pointer_move':
        handlePointerMove(state, config, context, event);
        break;

      case 'pointer_click':
      case 'click':
        handlePointerClick(state, config, context, event);
        break;

      case 'pointer_double_click':
        handleDoubleClick(state, config, context, event);
        break;

      case 'graph:clear_selection':
        state.selectedNodes.clear();
        state.highlightedEdges.clear();
        context.emit('graph:selection_cleared', { previousCount: 0 });
        break;

      case 'graph:select_nodes': {
        const nodeIds = (event as Record<string, unknown>).nodeIds as string[] | undefined;
        if (nodeIds) {
          for (const id of nodeIds) {
            state.selectedNodes.add(id);
          }
          context.emit('graph:select', {
            nodeIds: Array.from(state.selectedNodes),
            count: state.selectedNodes.size,
          });
        }
        break;
      }

      case 'graph:focus_node': {
        const targetId = (event as Record<string, unknown>).nodeId as string | undefined;
        if (targetId) {
          startFlyTo(state, config, context, targetId);
        }
        break;
      }
    }
  },
};

// ── Event Handlers ─────────────────────────────────────────────────────────

function handlePointerMove(
  state: InteractiveGraphState,
  config: InteractiveGraphConfig,
  context: TraitContext,
  event: TraitEvent
): void {
  if (!config.hoverHighlight) return;

  // Raycast from pointer
  const hit = performRaycast(context, config);
  const hitNodeId = hit?.node?.name ?? null;

  if (hitNodeId !== state.hoveredNode) {
    // Unhover previous
    if (state.hoveredNode) {
      context.emit('graph:hover_exit', { nodeId: state.hoveredNode });
      if (state.tooltipVisible) {
        context.emit('graph:tooltip_hide', { nodeId: state.hoveredNode });
        state.tooltipVisible = false;
      }
    }

    state.hoveredNode = hitNodeId;
    state.hoverTimer = 0;
    state.tooltipVisible = false;

    // Hover new
    if (hitNodeId && hit) {
      const symbol = hit.node.properties ?? {};
      context.emit('graph:hover', {
        nodeId: hitNodeId,
        symbol,
        position: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
      });

      // Highlight connected edges
      if (config.edgeHighlight) {
        updateEdgeHighlights(state, context, hitNodeId);
      }
    } else {
      // Clear edge highlights when not hovering
      if (state.highlightedEdges.size > 0 && state.selectedNodes.size === 0) {
        state.highlightedEdges.clear();
        context.emit('graph:edge_highlight', { edges: [] });
      }
    }
  }
}

function handlePointerClick(
  state: InteractiveGraphState,
  config: InteractiveGraphConfig,
  context: TraitContext,
  event: TraitEvent
): void {
  if (!config.clickInspect) return;

  const hit = performRaycast(context, config);
  const hitNodeId = hit?.node?.name ?? null;

  if (!hitNodeId) {
    // Click on empty space: clear selection
    if (state.selectedNodes.size > 0) {
      state.selectedNodes.clear();
      state.highlightedEdges.clear();
      context.emit('graph:selection_cleared', { previousCount: 0 });
      context.emit('graph:edge_highlight', { edges: [] });
    }
    return;
  }

  const isShift = (event as Record<string, unknown>).modifiers?.includes('Shift') ?? false;

  if (config.multiSelect && isShift) {
    // Additive select
    if (state.selectedNodes.has(hitNodeId)) {
      state.selectedNodes.delete(hitNodeId);
    } else {
      state.selectedNodes.add(hitNodeId);
    }
  } else {
    // Single select
    state.selectedNodes.clear();
    state.selectedNodes.add(hitNodeId);
  }

  // Update edge highlights for all selected nodes
  state.highlightedEdges.clear();
  for (const nodeId of state.selectedNodes) {
    updateEdgeHighlights(state, context, nodeId);
  }

  const symbol = hit?.node.properties ?? {};
  context.emit('graph:select', {
    nodeId: hitNodeId,
    symbol,
    selectedNodes: Array.from(state.selectedNodes),
    count: state.selectedNodes.size,
  });
}

function handleDoubleClick(
  state: InteractiveGraphState,
  config: InteractiveGraphConfig,
  context: TraitContext,
  _event: TraitEvent
): void {
  const hit = performRaycast(context, config);
  if (!hit?.node?.name) return;

  startFlyTo(state, config, context, hit.node.name);

  context.emit('graph:focus', {
    nodeId: hit.node.name,
    cameraTarget: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function performRaycast(context: TraitContext, config: InteractiveGraphConfig): RaycastHit | null {
  // Try VR pointer ray first, fall back to camera forward
  const pointerRay = context.vr?.getPointerRay?.('right');

  if (pointerRay) {
    return (
      context.physics?.raycast(pointerRay.origin, pointerRay.direction, config.raycastDistance) ??
      null
    );
  }

  if (context.camera) {
    const origin = context.camera.position;
    // Default forward direction (negative Z)
    const direction = { x: 0, y: 0, z: -1 };
    if (context.camera.rotation) {
      // Simple rotation-based direction (pitch + yaw)
      const pitch = context.camera.rotation.x;
      const yaw = context.camera.rotation.y;
      direction.x = Math.sin(yaw) * Math.cos(pitch);
      direction.y = -Math.sin(pitch);
      direction.z = -Math.cos(yaw) * Math.cos(pitch);
    }
    return context.physics?.raycast(origin, direction, config.raycastDistance) ?? null;
  }

  return null;
}

function startFlyTo(
  state: InteractiveGraphState,
  config: InteractiveGraphConfig,
  context: TraitContext,
  nodeId: string
): void {
  if (!context.camera) return;

  // Get node position from the physics body or scene objects
  const bodyPos = context.physics?.getBodyPosition?.(nodeId);
  if (!bodyPos) return;

  state.flyToStart = { ...context.camera.position };
  // Offset camera slightly behind and above the target
  state.flyToTarget = {
    x: bodyPos.x,
    y: bodyPos.y + 2,
    z: bodyPos.z + 5,
  };
  state.flyToProgress = 1;
}

function updateEdgeHighlights(
  state: InteractiveGraphState,
  context: TraitContext,
  nodeId: string
): void {
  // Edge IDs follow the "from->to" convention from SceneEdge
  // We highlight both incoming and outgoing edges
  state.highlightedEdges.add(`*->${nodeId}`);
  state.highlightedEdges.add(`${nodeId}->*`);

  context.emit('graph:edge_highlight', {
    edges: Array.from(state.highlightedEdges),
    focusNode: nodeId,
  });
}
