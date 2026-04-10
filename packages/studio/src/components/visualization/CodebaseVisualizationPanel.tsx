/**
 * CodebaseVisualizationPanel.tsx
 *
 * SVG force-graph panel that visualizes module communities from a CodebaseGraph.
 * Renders each detected community as a color-coded cluster of file nodes connected
 * by import edges. Used by Studio's "Codebase" inspector tab.
 *
 * No canvas/WebGL required — pure SVG for test-environment compatibility.
 */

'use client';

import React, { useMemo } from 'react';

// ─── Data types (mirrors CodebaseGraph serialized shape) ──────────────────────

export interface VisNode {
  id: string; // file path or symbol id
  label: string; // short display name
  community: number;
  degree: number; // number of connections (for sizing)
}

export interface VisEdge {
  source: string;
  target: string;
}

export interface CodebaseVisualizationData {
  nodes: VisNode[];
  edges: VisEdge[];
  communities: Record<string, number>; // filePath → communityId
  stats: {
    totalFiles: number;
    totalSymbols: number;
    totalImports: number;
  };
}

// ─── Color palette for communities (up to 12 distinct clusters) ───────────────

const COMMUNITY_COLORS = [
  '#6366f1', // indigo
  '#22d3ee', // cyan
  '#34d399', // emerald
  '#fbbf24', // amber
  '#f87171', // red
  '#a78bfa', // violet
  '#38bdf8', // sky
  '#4ade80', // green
  '#fb923c', // orange
  '#e879f9', // fuchsia
  '#2dd4bf', // teal
  '#94a3b8', // slate
];

function communityColor(c: number): string {
  return COMMUNITY_COLORS[Math.abs(c) % COMMUNITY_COLORS.length];
}

// ─── Layout: deterministic circle-of-circles layout ──────────────────────────

interface LayoutNode {
  id: string;
  label: string;
  community: number;
  x: number;
  y: number;
  r: number;
  color: string;
}

function layoutNodes(nodes: VisNode[], width: number, height: number): LayoutNode[] {
  // Group by community
  const groups = new Map<number, VisNode[]>();
  for (const n of nodes) {
    if (!groups.has(n.community)) groups.set(n.community, []);
    groups.get(n.community)!.push(n);
  }

  const communityIds = Array.from(groups.keys());
  const cx = width / 2;
  const cy = height / 2;
  const outerR = Math.min(cx, cy) * 0.75;
  const result: LayoutNode[] = [];

  communityIds.forEach((communityId, gIdx) => {
    const members = groups.get(communityId)!;
    const angle = (gIdx / communityIds.length) * 2 * Math.PI - Math.PI / 2;
    const gcx = cx + outerR * Math.cos(angle);
    const gcy = cy + outerR * Math.sin(angle);
    const innerR = Math.max(40, Math.min(80, members.length * 8));

    members.forEach((node, nIdx) => {
      const nAngle = (nIdx / members.length) * 2 * Math.PI;
      const nodeR = Math.min(6, Math.max(3, 2 + node.degree / 2));
      result.push({
        id: node.id,
        label: node.label,
        community: node.community,
        x: gcx + innerR * Math.cos(nAngle),
        y: gcy + innerR * Math.sin(nAngle),
        r: nodeR,
        color: communityColor(communityId),
      });
    });
  });

  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CodebaseVisualizationPanelProps {
  data: CodebaseVisualizationData;
  width?: number;
  height?: number;
  onNodeClick?: (nodeId: string) => void;
}

export const CodebaseVisualizationPanel: React.FC<CodebaseVisualizationPanelProps> = ({
  data,
  width = 600,
  height = 480,
  onNodeClick,
}) => {
  const layouted = useMemo(
    () => layoutNodes(data.nodes, width, height),
    [data.nodes, width, height]
  );

  const nodeMap = useMemo(() => {
    const m = new Map<string, LayoutNode>();
    for (const n of layouted) m.set(n.id, n);
    return m;
  }, [layouted]);

  const communityIds = useMemo(
    () => Array.from(new Set(layouted.map((n) => n.community))).sort((a, b) => a - b),
    [layouted]
  );

  return (
    <div
      className="flex flex-col h-full bg-slate-900 text-slate-200 select-none"
      data-testid="codebase-visualization-panel"
    >
      {/* Header */}
      <div className="p-3 border-b border-slate-700 bg-slate-800 flex justify-between items-center">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-100 flex items-center gap-2">
          <span className="text-indigo-400">◈</span> Module Communities
        </h3>
        <span className="text-xs text-slate-400">
          {data.stats.totalFiles} files · {communityIds.length} clusters
        </span>
      </div>

      {/* SVG canvas */}
      <div className="flex-1 overflow-hidden relative">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full"
          data-testid="visualization-svg"
        >
          {/* Edges */}
          <g className="edges" opacity={0.25}>
            {data.edges.map((edge, i) => {
              const s = nodeMap.get(edge.source);
              const t = nodeMap.get(edge.target);
              if (!s || !t) return null;
              return (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke="#94a3b8"
                  strokeWidth={0.5}
                />
              );
            })}
          </g>

          {/* Community halos */}
          {communityIds.map((cId) => {
            const members = layouted.filter((n) => n.community === cId);
            if (!members.length) return null;
            const avgX = members.reduce((s, n) => s + n.x, 0) / members.length;
            const avgY = members.reduce((s, n) => s + n.y, 0) / members.length;
            const maxDist = Math.max(
              ...members.map((n) => Math.sqrt((n.x - avgX) ** 2 + (n.y - avgY) ** 2))
            );
            return (
              <circle
                key={`halo-${cId}`}
                cx={avgX}
                cy={avgY}
                r={maxDist + 18}
                fill={communityColor(cId)}
                opacity={0.06}
                data-community={cId}
              />
            );
          })}

          {/* Nodes */}
          <g className="nodes">
            {layouted.map((node) => (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                onClick={() => onNodeClick?.(node.id)}
                style={{ cursor: onNodeClick ? 'pointer' : 'default' }}
                data-testid={`vis-node-${node.id}`}
              >
                <circle r={node.r} fill={node.color} stroke="rgba(0,0,0,0.4)" strokeWidth={0.5} />
                {node.r >= 5 && (
                  <text
                    x={node.r + 3}
                    y={4}
                    fontSize={7}
                    fill="#e2e8f0"
                    className="pointer-events-none"
                  >
                    {node.label.length > 16 ? node.label.slice(0, 14) + '…' : node.label}
                  </text>
                )}
              </g>
            ))}
          </g>
        </svg>
      </div>

      {/* Legend */}
      <div className="p-2 border-t border-slate-700 bg-slate-800/60 flex flex-wrap gap-2">
        {communityIds.map((cId) => (
          <div key={cId} className="flex items-center gap-1 text-xs text-slate-400">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: communityColor(cId) }}
            />
            Cluster {cId}
          </div>
        ))}
      </div>

      {/* Stats bar */}
      <div className="px-3 py-1.5 border-t border-slate-700 bg-slate-800 text-[10px] text-slate-500 flex gap-4">
        <span>{data.stats.totalFiles} files</span>
        <span>{data.stats.totalSymbols} symbols</span>
        <span>{data.stats.totalImports} imports</span>
      </div>
    </div>
  );
};

export default CodebaseVisualizationPanel;

// ─── Helper: convert CodebaseGraph serialized JSON → VisualizationData ────────

export interface SerializedFileEntry {
  path: string;
  language?: string;
  symbols?: Array<{ name: string; kind: string }>;
  imports?: string[];
  calls?: string[];
}

export function graphToVisualizationData(serialized: {
  version: number;
  rootDir: string;
  files: SerializedFileEntry[];
  communities?: Record<string, number>;
}): CodebaseVisualizationData {
  const communityMap = serialized.communities ?? {};
  const nodes: VisNode[] = serialized.files.map((f) => {
    const imports = f.imports ?? [];
    return {
      id: f.path,
      label: f.path.split(/[/\\]/).pop() ?? f.path,
      community: communityMap[f.path] ?? 0,
      degree: imports.length,
    };
  });

  const edges: VisEdge[] = [];
  const fileSet = new Set(serialized.files.map((f) => f.path));
  for (const f of serialized.files) {
    for (const imp of f.imports ?? []) {
      if (fileSet.has(imp)) {
        edges.push({ source: f.path, target: imp });
      }
    }
  }

  const totalSymbols = serialized.files.reduce((acc, f) => acc + (f.symbols?.length ?? 0), 0);

  return {
    nodes,
    edges,
    communities: communityMap,
    stats: {
      totalFiles: serialized.files.length,
      totalSymbols,
      totalImports: edges.length,
    },
  };
}
