'use client';

/**
 * useNodeGraph — local state for the visual node graph editor.
 * Tracks nodes (instances) and edges (connections) in memory.
 */

import { useState, useCallback, _useId } from 'react';

export type PortType = 'float' | 'vec3' | 'color' | 'texture' | 'bool' | 'string';

export interface GraphPort {
  id: string;
  label: string;
  type: PortType;
}

export interface GraphNode {
  id: string;
  type: string; // matches NodeDef.type
  label: string;
  category: string;
  color: string;
  x: number;
  y: number;
  inputs: GraphPort[];
  outputs: GraphPort[];
}

export interface GraphEdge {
  id: string;
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
}

export interface NodeDef {
  type: string;
  label: string;
  category: string;
  color: string;
  inputs: GraphPort[];
  outputs: GraphPort[];
}

let _edgeCounter = 0;
let _nodeCounter = 0;

export function useNodeGraph() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const addNode = useCallback(
    (def: NodeDef, x = 100 + _nodeCounter * 40, y = 80 + _nodeCounter * 50) => {
      _nodeCounter++;
      const id = `n-${_nodeCounter}`;
      setNodes((prev) => [
        ...prev,
        {
          id,
          type: def.type,
          label: def.label,
          category: def.category,
          color: def.color,
          x,
          y,
          inputs: def.inputs,
          outputs: def.outputs,
        },
      ]);
      return id;
    },
    []
  );

  const removeNode = useCallback((id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.fromNodeId !== id && e.toNodeId !== id));
    setSelected((s) => (s === id ? null : s));
  }, []);

  const moveNode = useCallback((id: string, dx: number, dy: number) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x: n.x + dx, y: n.y + dy } : n)));
  }, []);

  const connect = useCallback(
    (fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string) => {
      // Prevent duplicate connections to same input
      setEdges((prev) => {
        const filtered = prev.filter((e) => !(e.toNodeId === toNodeId && e.toPortId === toPortId));
        const id = `e-${++_edgeCounter}`;
        return [...filtered, { id, fromNodeId, fromPortId, toNodeId, toPortId }];
      });
    },
    []
  );

  const disconnect = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
  }, []);

  const clearGraph = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelected(null);
    _nodeCounter = 0;
    _edgeCounter = 0;
  }, []);

  return {
    nodes,
    edges,
    selected,
    setSelected,
    addNode,
    removeNode,
    moveNode,
    connect,
    disconnect,
    clearGraph,
  };
}
