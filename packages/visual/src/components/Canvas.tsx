/**
 * HoloScript Visual - Canvas Component
 *
 * Main node editor canvas using React Flow.
 */

import React, { useCallback, useRef, memo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type ReactFlowInstance,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
} from 'reactflow';
import 'reactflow/dist/style.css';

import HoloNode from './HoloNode';
import type { HoloNode as HoloNodeType, HoloEdge } from '../types';
import { useGraphStore } from '../store/graphStore';
import { CATEGORY_COLORS } from '../types';

/**
 * Custom node types for React Flow
 */
const nodeTypes = {
  holoNode: HoloNode,
};

/**
 * Canvas props
 */
export interface CanvasProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Canvas component
 */
const Canvas: React.FC<CanvasProps> = ({ className, style }) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  // Get state and actions from store
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const onNodesChange = useGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useGraphStore((s) => s.onEdgesChange);
  const onConnect = useGraphStore((s) => s.onConnect);
  const addNode = useGraphStore((s) => s.addNode);
  const setSelectedNodes = useGraphStore((s) => s.setSelectedNodes);

  // Handle dropping a node from sidebar
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const nodeType = event.dataTransfer.getData('application/holoscript-node');
      if (!nodeType || !reactFlowInstance.current) return;

      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;

      const position = reactFlowInstance.current.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      addNode(nodeType, position);
    },
    [addNode]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Handle selection changes
  const handleSelectionChange = useCallback(
    ({ nodes }: { nodes: HoloNodeType[] }) => {
      setSelectedNodes(nodes.map((n) => n.id));
    },
    [setSelectedNodes]
  );

  // Initialize React Flow
  const handleInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstance.current = instance;
  }, []);

  return (
    <div
      ref={reactFlowWrapper}
      className={className}
      style={{
        flex: 1,
        height: '100%',
        backgroundColor: '#0d0d14',
        ...style,
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange as OnNodesChange}
        onEdgesChange={onEdgesChange as OnEdgesChange}
        onConnect={onConnect as OnConnect}
        onInit={handleInit}
        onSelectionChange={handleSelectionChange}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#60a5fa', strokeWidth: 2 },
        }}
        connectionLineStyle={{ stroke: '#60a5fa', strokeWidth: 2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#2d2d3d" gap={16} size={1} />
        <Controls
          style={{
            backgroundColor: '#2d2d3d',
            borderRadius: 8,
            border: '1px solid #3d3d4d',
          }}
        />
        <MiniMap
          nodeColor={(node: HoloNodeType) => {
            const category = node.data?.category;
            return category ? CATEGORY_COLORS[category] : '#3d3d4d';
          }}
          style={{
            backgroundColor: '#1e1e2e',
            border: '1px solid #3d3d4d',
            borderRadius: 8,
          }}
          maskColor="rgba(0, 0, 0, 0.5)"
        />
      </ReactFlow>
    </div>
  );
};

export default memo(Canvas);
