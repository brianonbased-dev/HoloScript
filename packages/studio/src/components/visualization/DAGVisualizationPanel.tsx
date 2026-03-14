/**
 * DAGVisualizationPanel
 *
 * Renders the HoloScript scene graph as an interactive DAG (Directed Acyclic Graph).
 * Nodes are objects, edges are parent-child relationships.
 * Uses SVG for 2D graph rendering with zoom/pan interactions.
 *
 * Features:
 *   - Auto-layout using topological sort + layered positioning
 *   - Interactive node selection → syncs with scene graph store
 *   - Trait badges on each node
 *   - Color-coded by node type (mesh, light, group, etc.)
 *   - Real-time updates when scene graph changes
 */

'use client';

import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { useSceneGraphStore } from '@/lib/stores/sceneGraphStore';
import type { SceneNode } from '@/lib/stores';
import { X, ZoomIn, ZoomOut, Maximize2, Flame } from 'lucide-react';

// ── Layout constants ────────────────────────────────────────────────────────
const NODE_WIDTH = 160;
const NODE_HEIGHT = 56;
const LAYER_GAP_X = 200;
const NODE_GAP_Y = 72;
const PADDING = 40;

// ── Node type colors ────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  mesh: '#6366f1',      // indigo
  light: '#f59e0b',     // amber
  group: '#10b981',     // emerald
  camera: '#3b82f6',    // blue
  audio: '#ec4899',     // pink
  environment: '#8b5cf6', // violet
  default: '#64748b',   // slate
};

interface LayoutNode {
  id: string;
  name: string;
  type: string;
  traits: string[];
  x: number;
  y: number;
  layer: number;
  parentId?: string;
}

interface LayoutEdge {
  from: string;
  to: string;
}

function layoutDAG(nodes: SceneNode[]): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const layoutNodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  const layerMap = new Map<number, LayoutNode[]>();

  // Flatten scene graph with depth tracking
  function traverse(nodeList: SceneNode[], depth: number, parentId?: string) {
    for (const node of nodeList) {
      const ln: LayoutNode = {
        id: node.id,
        name: node.name || node.id.slice(0, 8),
        type: node.type || 'default',
        traits: node.traits.map((t) => t.name).filter(Boolean).slice(0, 4),
        x: 0,
        y: 0,
        layer: depth,
        parentId,
      };
      layoutNodes.push(ln);

      if (parentId) {
        edges.push({ from: parentId, to: node.id });
      }

      if (!layerMap.has(depth)) layerMap.set(depth, []);
      layerMap.get(depth)!.push(ln);

      // Recurse into children
      if ('children' in node && Array.isArray((node as any).children)) {
        traverse((node as any).children, depth + 1, node.id);
      }
    }
  }

  traverse(nodes, 0);

  // Position: layer → x, index within layer → y
  for (const [layer, layerNodes] of layerMap.entries()) {
    for (let i = 0; i < layerNodes.length; i++) {
      layerNodes[i].x = PADDING + layer * LAYER_GAP_X;
      layerNodes[i].y = PADDING + i * NODE_GAP_Y;
    }
  }

  return { nodes: layoutNodes, edges };
}

export const DAGVisualizationPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const sceneNodes = useSceneGraphStore((s) => s.nodes);
  const selectNode = useSceneGraphStore((s) => s.selectNode);
  const selectedNodeId = useSceneGraphStore((s) => s.selectedNodeId);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Heatmap: max trait count for normalization
  const maxTraitCount = useMemo(
    () => Math.max(1, ...layoutNodes.map((n) => n.traits.length)),
    [layoutNodes]
  );

  // Heatmap color: green (0 traits) → yellow → red (max traits)
  const getHeatmapColor = useCallback(
    (traitCount: number) => {
      const ratio = traitCount / maxTraitCount;
      if (ratio < 0.5) {
        // green → yellow
        const g = 200;
        const r = Math.round(ratio * 2 * 255);
        return `rgb(${r}, ${g}, 50)`;
      }
      // yellow → red
      const r = 255;
      const g = Math.round((1 - (ratio - 0.5) * 2) * 200);
      return `rgb(${r}, ${g}, 50)`;
    },
    [maxTraitCount]
  );

  const { nodes: layoutNodes, edges } = useMemo(() => layoutDAG(sceneNodes), [sceneNodes]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, LayoutNode>();
    for (const n of layoutNodes) map.set(n.id, n);
    return map;
  }, [layoutNodes]);

  const maxX = useMemo(
    () => Math.max(...layoutNodes.map((n) => n.x + NODE_WIDTH), 400) + PADDING,
    [layoutNodes]
  );
  const maxY = useMemo(
    () => Math.max(...layoutNodes.map((n) => n.y + NODE_HEIGHT), 300) + PADDING,
    [layoutNodes]
  );

  const handleNodeClick = useCallback(
    (id: string) => {
      selectNode?.(id);
    },
    [selectNode]
  );

  // Pan handling
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    },
    [pan]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      setPan({
        x: panStart.current.panX + (e.clientX - panStart.current.x),
        y: panStart.current.panY + (e.clientY - panStart.current.y),
      });
    },
    [isPanning]
  );

  const onMouseUp = useCallback(() => setIsPanning(false), []);

  const fitToView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-700 text-slate-300">
      {/* Header */}
      <div className="p-3 border-b border-slate-700 bg-slate-800 flex justify-between items-center">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-100 flex items-center gap-2">
          <span className="text-indigo-400">◇</span> Scene DAG
          <span className="text-[10px] font-normal text-slate-500">{layoutNodes.length} nodes</span>
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.2, 3))}
            className="p-1 text-slate-400 hover:text-white transition rounded"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.2, 0.3))}
            className="p-1 text-slate-400 hover:text-white transition rounded"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={fitToView}
            className="p-1 text-slate-400 hover:text-white transition rounded"
            title="Fit to view"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setHeatmapMode((h) => !h)}
            className={`p-1 transition rounded ${heatmapMode ? 'text-orange-400 bg-orange-900/30' : 'text-slate-400 hover:text-white'}`}
            title={heatmapMode ? 'Disable heatmap' : 'Trait density heatmap'}
          >
            <Flame className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${maxX} ${maxY}`}
          className="select-none"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: '0 0',
          }}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
              fill="#475569"
            >
              <polygon points="0 0, 8 3, 0 6" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((edge) => {
            const fromNode = nodeMap.get(edge.from);
            const toNode = nodeMap.get(edge.to);
            if (!fromNode || !toNode) return null;
            return (
              <line
                key={`${edge.from}-${edge.to}`}
                x1={fromNode.x + NODE_WIDTH}
                y1={fromNode.y + NODE_HEIGHT / 2}
                x2={toNode.x}
                y2={toNode.y + NODE_HEIGHT / 2}
                stroke="#475569"
                strokeWidth={1.5}
                markerEnd="url(#arrowhead)"
                className="transition-opacity"
              />
            );
          })}

          {/* Nodes */}
          {layoutNodes.map((node) => {
            const color = TYPE_COLORS[node.type] || TYPE_COLORS.default;
            const isSelected = node.id === selectedNodeId;
            return (
              <g
                key={node.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleNodeClick(node.id);
                }}
                className="cursor-pointer"
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={8}
                  ry={8}
                  fill={
                    heatmapMode
                      ? `${getHeatmapColor(node.traits.length)}22`
                      : isSelected
                        ? `${color}33`
                        : '#1e293b'
                  }
                  stroke={
                    heatmapMode
                      ? getHeatmapColor(node.traits.length)
                      : isSelected
                        ? color
                        : '#334155'
                  }
                  strokeWidth={isSelected ? 2 : heatmapMode ? 1.5 : 1}
                  className="transition-all duration-150"
                />
                {/* Color accent bar */}
                <rect
                  x={node.x}
                  y={node.y}
                  width={4}
                  height={NODE_HEIGHT}
                  rx={2}
                  fill={color}
                />
                {/* Node name */}
                <text
                  x={node.x + 14}
                  y={node.y + 20}
                  fill="#e2e8f0"
                  fontSize={12}
                  fontWeight={600}
                  fontFamily="Inter, system-ui, sans-serif"
                >
                  {node.name.length > 16 ? node.name.slice(0, 14) + '…' : node.name}
                </text>
                {/* Type label */}
                <text
                  x={node.x + 14}
                  y={node.y + 35}
                  fill={color}
                  fontSize={9}
                  fontFamily="JetBrains Mono, monospace"
                  textTransform="uppercase"
                >
                  {node.type}
                </text>
                {/* Trait badges */}
                {node.traits.slice(0, 3).map((trait, ti) => (
                  <g key={trait}>
                    <rect
                      x={node.x + 14 + ti * 38}
                      y={node.y + 40}
                      width={36}
                      height={12}
                      rx={3}
                      fill={`${color}22`}
                      stroke={`${color}44`}
                      strokeWidth={0.5}
                    />
                    <text
                      x={node.x + 16 + ti * 38}
                      y={node.y + 49}
                      fill={`${color}cc`}
                      fontSize={7}
                      fontFamily="JetBrains Mono, monospace"
                    >
                      @{trait.length > 5 ? trait.slice(0, 4) + '…' : trait}
                    </text>
                  </g>
                ))}
              </g>
            );
          })}

          {/* Empty state */}
          {layoutNodes.length === 0 && (
            <text
              x={maxX / 2}
              y={maxY / 2}
              fill="#64748b"
              fontSize={14}
              textAnchor="middle"
              fontFamily="Inter, system-ui, sans-serif"
            >
              No scene nodes — add objects to see the DAG
            </text>
          )}
        </svg>
      </div>

      {/* Heatmap legend */}
      {heatmapMode && (
        <div className="px-3 py-2 border-t border-slate-700 bg-slate-800 flex items-center gap-2">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">Trait Density</span>
          <div className="flex-1 h-2 rounded-full bg-gradient-to-r from-green-500 via-yellow-400 to-red-500 opacity-70" />
          <span className="text-[10px] text-slate-500">0</span>
          <span className="text-[10px] text-slate-500">→</span>
          <span className="text-[10px] text-slate-500">{maxTraitCount}</span>
        </div>
      )}
    </div>
  );
};
