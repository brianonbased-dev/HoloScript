/**
 * Shader Editor Canvas
 *
 * React Flow integration for node graph canvas with pan/zoom, selection, and connections
 */

'use client';

import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { ShaderNodeComponent } from './ShaderNodeComponent';
import { useShaderGraph } from '../../hooks/useShaderGraph';
import { useNodeSelection } from '../../hooks/useNodeSelection';

const nodeTypes = {
  shaderNode: ShaderNodeComponent,
};

interface ShaderEditorCanvasProps {
  snapToGrid?: boolean;
  snapGrid?: [number, number];
}

export function ShaderEditorCanvas({
  snapToGrid = true,
  snapGrid = [20, 20],
}: ShaderEditorCanvasProps) {
  const graph = useShaderGraph((state) => state.graph);
  const connect = useShaderGraph((state) => state.connect);
  const disconnect = useShaderGraph((state) => state.disconnect);
  const setNodePosition = useShaderGraph((state) => state.setNodePosition);
  const deleteNodes = useShaderGraph((state) => state.deleteNodes);

  const selectNode = useNodeSelection((state) => state.selectNode);
  const selectNodes = useNodeSelection((state) => state.selectNodes);
  const clearSelection = useNodeSelection((state) => state.clearSelection);
  const selectedNodeIds = useNodeSelection((state) => state.getSelectedNodes());

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);

  // Sync graph to React Flow
  useEffect(() => {
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    // Convert shader graph nodes to React Flow nodes
    graph.nodes.forEach((node) => {
      flowNodes.push({
        id: node.id,
        type: 'shaderNode',
        position: node.position,
        data: node,
        selected: selectedNodeIds.includes(node.id),
      });
    });

    // Convert connections to React Flow edges
    graph.connections.forEach((conn) => {
      flowEdges.push({
        id: conn.id,
        source: conn.fromNode,
        sourceHandle: conn.fromPort,
        target: conn.toNode,
        targetHandle: conn.toPort,
        type: 'default',
        animated: false,
      });
    });

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [graph, selectedNodeIds, setNodes, setEdges]);

  // Handle node changes (position, selection)
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      changes.forEach((change) => {
        if (change.type === 'position' && change.position) {
          setNodePosition(change.id, change.position.x, change.position.y);
        } else if (change.type === 'select') {
          if (change.selected) {
            selectNode(change.id, true);
          }
        }
      });
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [setNodePosition, selectNode, setNodes]
  );

  // Handle edge changes
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [setEdges]
  );

  // Handle new connections
  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target && connection.sourceHandle && connection.targetHandle) {
        connect(
          connection.source,
          connection.sourceHandle,
          connection.target,
          connection.targetHandle
        );
      }
    },
    [connect]
  );

  // Handle connection validation
  const isValidConnection = useCallback(
    (connection: Connection) => {
      // Prevent self-connection
      if (connection.source === connection.target) return false;

      // Additional validation would go here (type checking, etc.)
      return true;
    },
    []
  );

  // Handle node selection
  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[] }) => {
      if (selectedNodes.length === 0) {
        clearSelection();
      } else {
        selectNodes(selectedNodes.map((n) => n.id));
      }
    },
    [selectNodes, clearSelection]
  );

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete selected nodes
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeIds.length > 0) {
          e.preventDefault();
          deleteNodes(selectedNodeIds);
        }
      }

      // Select all (Ctrl+A)
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        selectNodes(Array.from(graph.nodes.keys()));
      }

      // Deselect all (Escape)
      if (e.key === 'Escape') {
        clearSelection();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeIds, deleteNodes, selectNodes, clearSelection, graph.nodes]);

  return (
    <div ref={reactFlowWrapper} className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        snapToGrid={snapToGrid}
        snapGrid={snapGrid}
        connectionMode={ConnectionMode.Strict}
        multiSelectionKeyCode="Shift"
        deleteKeyCode={null} // Handled manually
        fitView
        attributionPosition="bottom-right"
        className="bg-gray-950"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#374151"
        />
        <Controls className="bg-gray-800 border-gray-700" />
        <MiniMap
          className="bg-gray-900 border-gray-700"
          nodeColor={(node) => {
            const data = node.data as any;
            if (data.category === 'output') return '#ef4444';
            if (data.category === 'input') return '#3b82f6';
            return '#6b7280';
          }}
          maskColor="rgba(0, 0, 0, 0.6)"
        />
      </ReactFlow>
    </div>
  );
}
