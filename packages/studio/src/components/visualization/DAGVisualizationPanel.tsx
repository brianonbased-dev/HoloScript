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
 *   - Trait badges on each node (clickable for live editing)
 *   - Color-coded by node type (mesh, light, group, etc.)
 *   - Real-time updates when scene graph changes
 *   - Trait density heatmap overlay
 *   - Search/filter nodes by name or trait
 *   - SVG/PNG export
 *   - Minimap overview navigation
 *   - Trait dependency edges (shared-trait connections)
 */

'use client';

import React, { useMemo, useCallback, useState, useRef } from 'react';
import { useSceneGraphStore } from '@/lib/stores/sceneGraphStore';
import { useEditorStore } from '@/lib/stores/editorStore';
import type { SceneNode } from '@/lib/stores';
import { COPY_FEEDBACK_DURATION } from '@/lib/ui-timings';
import {
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Flame,
  Search,
  Download,
  Map as MapIcon,
  Link2,
  Edit3,
} from 'lucide-react';

// ── Layout constants ────────────────────────────────────────────────────────
const NODE_WIDTH = 160;
const NODE_HEIGHT = 56;
const LAYER_GAP_X = 200;
const NODE_GAP_Y = 72;
const PADDING = 40;

// ── Node type colors ────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  mesh: '#6366f1', // indigo
  light: '#f59e0b', // amber
  group: '#10b981', // emerald
  camera: '#3b82f6', // blue
  audio: '#ec4899', // pink
  environment: '#8b5cf6', // violet
  default: '#64748b', // slate
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

interface TraitEdge {
  from: string;
  to: string;
  trait: string;
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
        traits: node.traits
          .map((t) => t.name)
          .filter(Boolean)
          .slice(0, 4),
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

// ── Compute trait dependency edges (nodes sharing the same trait) ────────
function computeTraitEdges(nodes: LayoutNode[]): TraitEdge[] {
  const traitToNodes = new Map<string, string[]>();
  for (const node of nodes) {
    for (const trait of node.traits) {
      if (!traitToNodes.has(trait)) traitToNodes.set(trait, []);
      traitToNodes.get(trait)!.push(node.id);
    }
  }

  const edges: TraitEdge[] = [];
  for (const [trait, nodeIds] of traitToNodes) {
    if (nodeIds.length < 2) continue;
    // Connect pairs (limit to avoid explosion)
    for (let i = 0; i < Math.min(nodeIds.length, 5); i++) {
      for (let j = i + 1; j < Math.min(nodeIds.length, 5); j++) {
        edges.push({ from: nodeIds[i], to: nodeIds[j], trait });
      }
    }
  }
  return edges;
}

export const DAGVisualizationPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const sceneNodes = useSceneGraphStore((s) => s.nodes);
  const selectNode = useEditorStore((s: any) => s.setSelectedObjectId);
  const selectedNodeId = useEditorStore((s: any) => s.selectedObjectId);
  const setTraitProperty = useSceneGraphStore((s) => s.setTraitProperty);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  const [showTraitEdges, setShowTraitEdges] = useState(false);
  const [editingTrait, setEditingTrait] = useState<{ nodeId: string; trait: string } | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Layout (must come before anything that uses layoutNodes)
  const { nodes: layoutNodes, edges } = useMemo(() => layoutDAG(sceneNodes), [sceneNodes]);

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
        const g = 200;
        const r = Math.round(ratio * 2 * 255);
        return `rgb(${r}, ${g}, 50)`;
      }
      const r = 255;
      const g = Math.round((1 - (ratio - 0.5) * 2) * 200);
      return `rgb(${r}, ${g}, 50)`;
    },
    [maxTraitCount]
  );

  // Trait dependency edges
  const traitEdges = useMemo(
    () => (showTraitEdges ? computeTraitEdges(layoutNodes) : []),
    [layoutNodes, showTraitEdges]
  );

  // Search filter
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return new Set(layoutNodes.map((n) => n.id));
    const q = searchQuery.toLowerCase();
    return new Set(
      layoutNodes
        .filter(
          (n) =>
            n.name.toLowerCase().includes(q) ||
            n.traits.some((t) => t.toLowerCase().includes(q)) ||
            n.type.toLowerCase().includes(q)
        )
        .map((n) => n.id)
    );
  }, [layoutNodes, searchQuery]);

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

  // ── SVG/PNG Export ──────────────────────────────────────────────────────
  const exportSVG = useCallback(() => {
    if (!svgRef.current) return;
    const svgClone = svgRef.current.cloneNode(true) as SVGSVGElement;
    svgClone.removeAttribute('style');
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgClone.setAttribute('width', String(maxX));
    svgClone.setAttribute('height', String(maxY));
    // Add dark background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', '#0f172a');
    svgClone.insertBefore(bg, svgClone.firstChild);

    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgClone);
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'holoscript-dag.svg';
    a.click();
    URL.revokeObjectURL(url);
  }, [maxX, maxY]);

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
            onClick={() => setShowSearch((s) => !s)}
            className={`p-1 transition rounded ${showSearch ? 'text-blue-400 bg-blue-900/30' : 'text-slate-400 hover:text-white'}`}
            title="Search nodes"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setHeatmapMode((h) => !h)}
            className={`p-1 transition rounded ${heatmapMode ? 'text-orange-400 bg-orange-900/30' : 'text-slate-400 hover:text-white'}`}
            title={heatmapMode ? 'Disable heatmap' : 'Trait density heatmap'}
          >
            <Flame className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowTraitEdges((t) => !t)}
            className={`p-1 transition rounded ${showTraitEdges ? 'text-emerald-400 bg-emerald-900/30' : 'text-slate-400 hover:text-white'}`}
            title={showTraitEdges ? 'Hide trait edges' : 'Show trait dependency edges'}
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowMinimap((m) => !m)}
            className={`p-1 transition rounded ${showMinimap ? 'text-cyan-400 bg-cyan-900/30' : 'text-slate-400 hover:text-white'}`}
            title={showMinimap ? 'Hide minimap' : 'Show minimap'}
          >
            <MapIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={exportSVG}
            className="p-1 text-slate-400 hover:text-white transition rounded"
            title="Export SVG"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="px-3 py-2 border-b border-slate-700 bg-slate-800/50">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter nodes by name, type, or trait..."
            className="w-full px-2 py-1 text-xs bg-slate-900 border border-slate-600 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            autoFocus
          />
          {searchQuery && (
            <div className="mt-1 text-[10px] text-slate-500">
              {filteredNodes.size}/{layoutNodes.length} nodes match
            </div>
          )}
        </div>
      )}

      {/* SVG Canvas */}
      <div
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing relative"
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
            <marker
              id="arrowhead-trait"
              markerWidth="6"
              markerHeight="4"
              refX="6"
              refY="2"
              orient="auto"
              fill="#10b981"
            >
              <polygon points="0 0, 6 2, 0 4" />
            </marker>
          </defs>

          {/* Parent-child edges */}
          {edges.map((edge) => {
            const fromNode = nodeMap.get(edge.from);
            const toNode = nodeMap.get(edge.to);
            if (!fromNode || !toNode) return null;
            const isFiltered = filteredNodes.has(edge.from) && filteredNodes.has(edge.to);
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
                opacity={isFiltered ? 1 : 0.15}
                className="transition-opacity"
              />
            );
          })}

          {/* Trait dependency edges (dashed, green) */}
          {traitEdges.map((edge, i) => {
            const fromNode = nodeMap.get(edge.from);
            const toNode = nodeMap.get(edge.to);
            if (!fromNode || !toNode) return null;
            return (
              <line
                key={`trait-${i}`}
                x1={fromNode.x + NODE_WIDTH / 2}
                y1={fromNode.y + NODE_HEIGHT}
                x2={toNode.x + NODE_WIDTH / 2}
                y2={toNode.y}
                stroke="#10b98166"
                strokeWidth={1}
                strokeDasharray="4 3"
                markerEnd="url(#arrowhead-trait)"
              >
                <title>@{edge.trait}</title>
              </line>
            );
          })}

          {/* Nodes */}
          {layoutNodes.map((node) => {
            const color = TYPE_COLORS[node.type] || TYPE_COLORS.default;
            const isSelected = node.id === selectedNodeId;
            const isVisible = filteredNodes.has(node.id);
            return (
              <g
                key={node.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleNodeClick(node.id);
                }}
                className="cursor-pointer"
                opacity={isVisible ? 1 : 0.15}
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
                <rect x={node.x} y={node.y} width={4} height={NODE_HEIGHT} rx={2} fill={color} />
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
                  style={{ textTransform: 'uppercase' }}
                >
                  {node.type}
                </text>
                {/* Trait badges (clickable for live editing) */}
                {node.traits.slice(0, 3).map((trait, ti) => (
                  <g
                    key={trait}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingTrait({ nodeId: node.id, trait });
                    }}
                    className="cursor-pointer"
                  >
                    <rect
                      x={node.x + 14 + ti * 38}
                      y={node.y + 40}
                      width={36}
                      height={12}
                      rx={3}
                      fill={
                        editingTrait?.nodeId === node.id && editingTrait?.trait === trait
                          ? `${color}55`
                          : `${color}22`
                      }
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

        {/* Minimap overlay */}
        {showMinimap && layoutNodes.length > 0 && (
          <div className="absolute bottom-2 right-2 w-32 h-24 bg-slate-800/90 border border-slate-600 rounded overflow-hidden">
            <svg viewBox={`0 0 ${maxX} ${maxY}`} width="100%" height="100%">
              <rect width="100%" height="100%" fill="#0f172a" />
              {layoutNodes.map((node) => (
                <rect
                  key={`mini-${node.id}`}
                  x={node.x}
                  y={node.y}
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={4}
                  fill={node.id === selectedNodeId ? '#6366f1' : '#334155'}
                  stroke="none"
                />
              ))}
              {edges.map((edge) => {
                const from = nodeMap.get(edge.from);
                const to = nodeMap.get(edge.to);
                if (!from || !to) return null;
                return (
                  <line
                    key={`mini-e-${edge.from}-${edge.to}`}
                    x1={from.x + NODE_WIDTH}
                    y1={from.y + NODE_HEIGHT / 2}
                    x2={to.x}
                    y2={to.y + NODE_HEIGHT / 2}
                    stroke="#47556944"
                    strokeWidth={2}
                  />
                );
              })}
              {/* Viewport indicator */}
              <rect
                x={-pan.x / zoom}
                y={-pan.y / zoom}
                width={maxX / zoom}
                height={maxY / zoom}
                fill="none"
                stroke="#6366f1"
                strokeWidth={4}
                rx={2}
              />
            </svg>
          </div>
        )}
      </div>

      {/* Live trait editor */}
      {editingTrait && (
        <div className="px-3 py-2 border-t border-slate-700 bg-slate-800 flex items-center gap-2">
          <Edit3 className="w-3 h-3 text-indigo-400 flex-shrink-0" />
          <span className="text-[10px] text-slate-400 truncate">
            <span className="text-indigo-300">@{editingTrait.trait}</span>
            {' on '}
            <span className="text-slate-200">
              {nodeMap.get(editingTrait.nodeId)?.name || editingTrait.nodeId}
            </span>
          </span>
          <input
            type="text"
            defaultValue=""
            placeholder="key: value (Enter to apply)"
            list={`trait-props-${editingTrait.nodeId}`}
            className="flex-1 px-1.5 py-0.5 text-[10px] bg-slate-900 border border-slate-600 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && editingTrait) {
                const input = (e.target as HTMLInputElement).value.trim();
                const colonIdx = input.indexOf(':');
                if (colonIdx > 0) {
                  const key = input.substring(0, colonIdx).trim();
                  const rawValue = input.substring(colonIdx + 1).trim();
                  let value: unknown = rawValue;
                  if (rawValue === 'true') value = true;
                  else if (rawValue === 'false') value = false;
                  else if (!isNaN(Number(rawValue)) && rawValue !== '') value = Number(rawValue);
                  setTraitProperty(editingTrait.nodeId, editingTrait.trait, key, value);
                  (e.target as HTMLInputElement).value = '';
                  setFlashMessage(`✓ ${key} applied`);
                  setTimeout(() => setFlashMessage(null), COPY_FEEDBACK_DURATION);
                }
              }
            }}
          />
          {/* Autocomplete datalist: existing props + common suggestions */}
          <datalist id={`trait-props-${editingTrait.nodeId}`}>
            {(() => {
              const node = sceneNodes.find((n) => n.id === editingTrait.nodeId);
              const trait = node?.traits.find((t) => t.name === editingTrait.trait);
              const existingKeys = trait ? Object.keys(trait.properties) : [];
              const commonKeys = [
                'speed',
                'radius',
                'enabled',
                'color',
                'intensity',
                'mass',
                'friction',
                'damping',
                'force',
                'range',
                'delay',
                'duration',
                'volume',
                'opacity',
                'threshold',
              ];
              const allKeys = [...new Set([...existingKeys, ...commonKeys])];
              return allKeys.map((k) => <option key={k} value={`${k}: `} />);
            })()}
          </datalist>
          {flashMessage && (
            <span className="text-[10px] text-emerald-400 animate-pulse whitespace-nowrap">
              {flashMessage}
            </span>
          )}
          <button
            onClick={() => setEditingTrait(null)}
            className="text-[10px] text-slate-500 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

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
