/**
 * SceneGraph Trait
 *
 * Explicit scene hierarchy for interchange and composition.
 * Manages parent-child relationships and transformations.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type MergeStrategy = 'replace' | 'merge' | 'append' | 'skip_existing';
type CoordinateSystem = 'y_up' | 'z_up';

interface SceneGraphNode {
  id: string;
  name: string;
  parent: string | null;
  children: string[];
  localTransform: {
    position: [number, number, number];
    rotation: [number, number, number, number];
    scale: [number, number, number];
  };
}

interface SceneGraphState {
  nodeCount: number;
  depth: number;
  rootId: string | null;
  nodes: Map<string, SceneGraphNode>;
  isDirty: boolean;
}

interface SceneGraphConfig {
  root_node: string;
  instancing: boolean;
  merge_strategy: MergeStrategy;
  coordinate_system: CoordinateSystem;
  unit_scale: number; // Meters per unit
  flatten_on_export: boolean;
}

// =============================================================================
// HANDLER
// =============================================================================

export const sceneGraphHandler: TraitHandler<SceneGraphConfig> = {
  name: 'scene_graph',

  defaultConfig: {
    root_node: '',
    instancing: true,
    merge_strategy: 'merge',
    coordinate_system: 'y_up',
    unit_scale: 1.0,
    flatten_on_export: false,
  },

  onAttach(node, config, context) {
    const nodeId = (node as { id?: string }).id || 'root';

    const state: SceneGraphState = {
      nodeCount: 1,
      depth: 0,
      rootId: nodeId,
      nodes: new Map(),
      isDirty: false,
    };
    node.__sceneGraphState = state;

    // Register root node
    state.nodes.set(nodeId, {
      id: nodeId,
      name: config.root_node || nodeId,
      parent: null,
      children: [],
      localTransform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
    });

    context.emit?.('scene_graph_init', {
      node,
      rootId: nodeId,
      coordinateSystem: config.coordinate_system,
      unitScale: config.unit_scale,
    });
  },

  onDetach(node, config, context) {
    context.emit?.('scene_graph_destroy', { node });
    delete node.__sceneGraphState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__sceneGraphState as SceneGraphState;
    if (!state || !state.isDirty) return;

    state.isDirty = false;

    // Recalculate depth and node count
    state.nodeCount = state.nodes.size;
    state.depth = calculateMaxDepth(state);

    context.emit?.('scene_graph_updated', {
      node,
      nodeCount: state.nodeCount,
      depth: state.depth,
    });
  },

  onEvent(node, config, context, event) {
    const state = node.__sceneGraphState as SceneGraphState;
    if (!state) return;

    if (event.type === 'scene_graph_add_node') {
      const childId = event.childId as string;
      const parentId = (event.parentId as string) || state.rootId;
      const name = (event.name as string) || childId;
      const transform = (event.transform as SceneGraphNode['localTransform']) || {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      };

      if (state.nodes.has(childId)) {
        if (config.merge_strategy === 'skip_existing') return;
        if (config.merge_strategy === 'replace') {
          removeNode(state, childId);
        }
      }

      const newNode: SceneGraphNode = {
        id: childId,
        name,
        parent: parentId || null,
        children: [],
        localTransform: transform,
      };

      state.nodes.set(childId, newNode);

      if (parentId && state.nodes.has(parentId)) {
        state.nodes.get(parentId)!.children.push(childId);
      }

      state.isDirty = true;

      context.emit?.('on_node_added', {
        node,
        childId,
        parentId,
      });
    } else if (event.type === 'scene_graph_remove_node') {
      const nodeId = event.nodeId as string;
      removeNode(state, nodeId);
      state.isDirty = true;
    } else if (event.type === 'scene_graph_reparent') {
      const nodeId = event.nodeId as string;
      const newParentId = event.newParentId as string;

      const sgNode = state.nodes.get(nodeId);
      if (sgNode && state.nodes.has(newParentId)) {
        // Remove from old parent
        if (sgNode.parent && state.nodes.has(sgNode.parent)) {
          const oldParent = state.nodes.get(sgNode.parent)!;
          oldParent.children = oldParent.children.filter((c) => c !== nodeId);
        }

        // Add to new parent
        sgNode.parent = newParentId;
        state.nodes.get(newParentId)!.children.push(nodeId);

        state.isDirty = true;
      }
    } else if (event.type === 'scene_graph_set_transform') {
      const nodeId = event.nodeId as string;
      const transform = event.transform as Partial<SceneGraphNode['localTransform']>;

      const sgNode = state.nodes.get(nodeId);
      if (sgNode) {
        if (transform.position) sgNode.localTransform.position = transform.position;
        if (transform.rotation) sgNode.localTransform.rotation = transform.rotation;
        if (transform.scale) sgNode.localTransform.scale = transform.scale;

        context.emit?.('scene_graph_transform_updated', {
          node,
          nodeId,
          transform: sgNode.localTransform,
        });
      }
    } else if (event.type === 'scene_graph_get_children') {
      const parentId = (event.parentId as string) || state.rootId;
      const sgNode = state.nodes.get(parentId || '');

      context.emit?.('scene_graph_children_result', {
        node,
        parentId,
        children: sgNode?.children || [],
        callbackId: event.callbackId,
      });
    } else if (event.type === 'scene_graph_export') {
      const format = (event.format as string) || 'json';

      context.emit?.('scene_graph_generate_export', {
        node,
        format,
        flatten: config.flatten_on_export,
        coordinateSystem: config.coordinate_system,
        unitScale: config.unit_scale,
        nodes: Array.from(state.nodes.values()),
      });
    } else if (event.type === 'scene_graph_import') {
      const data = event.data as SceneGraphNode[];

      for (const importNode of data) {
        state.nodes.set(importNode.id, importNode);
      }

      state.isDirty = true;

      context.emit?.('on_scene_composed', {
        node,
        importedCount: data.length,
      });
    } else if (event.type === 'scene_graph_query') {
      context.emit?.('scene_graph_info', {
        queryId: event.queryId,
        node,
        nodeCount: state.nodeCount,
        depth: state.depth,
        rootId: state.rootId,
        coordinateSystem: config.coordinate_system,
        unitScale: config.unit_scale,
      });
    }
  },
};

function removeNode(state: SceneGraphState, nodeId: string): void {
  const sgNode = state.nodes.get(nodeId);
  if (!sgNode) return;

  // Remove from parent's children
  if (sgNode.parent && state.nodes.has(sgNode.parent)) {
    const parent = state.nodes.get(sgNode.parent)!;
    parent.children = parent.children.filter((c) => c !== nodeId);
  }

  // Recursively remove children
  for (const childId of sgNode.children) {
    removeNode(state, childId);
  }

  state.nodes.delete(nodeId);
}

function calculateMaxDepth(state: SceneGraphState): number {
  let maxDepth = 0;

  function traverse(nodeId: string, depth: number): void {
    maxDepth = Math.max(maxDepth, depth);
    const sgNode = state.nodes.get(nodeId);
    if (sgNode) {
      for (const childId of sgNode.children) {
        traverse(childId, depth + 1);
      }
    }
  }

  if (state.rootId) {
    traverse(state.rootId, 0);
  }

  return maxDepth;
}

export default sceneGraphHandler;
