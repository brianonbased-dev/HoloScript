'use client';

/**
 * NodeGraphPanel — visual node graph editor with drag-canvas, node cards, and SVG edges.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Network, X, Search, Plus, Trash2, RotateCcw } from 'lucide-react';
import { useNodeGraph, type GraphNode, type NodeDef } from '@/hooks/useNodeGraph';
import { logger } from '@/lib/logger';

const CATEGORY_COLOR: Record<string, string> = {
  input: '#4488ff',
  utility: '#888899',
  transform: '#44bb88',
  material: '#cc6644',
  geometry: '#8855cc',
  light: '#eeaa22',
  output: '#ff4466',
};

interface NodeGraphPanelProps {
  onClose: () => void;
}

function NodeCard({
  node,
  selected,
  onSelect,
  onRemove,
  onDragEnd,
}: {
  node: GraphNode;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDragEnd: (dx: number, dy: number) => void;
}) {
  const dragStart = useRef<{ mx: number; my: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
    dragStart.current = { mx: e.clientX, my: e.clientY };
    const onMove = (me: MouseEvent) => {
      if (!dragStart.current) return;
      onDragEnd(me.clientX - dragStart.current.mx, me.clientY - dragStart.current.my);
      dragStart.current = { mx: me.clientX, my: me.clientY };
    };
    const onUp = () => {
      dragStart.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{ left: node.x, top: node.y, borderColor: selected ? '#fff' : node.color }}
      className="absolute cursor-grab select-none rounded-xl border-2 bg-[#1a1a2e]/95 backdrop-blur-sm shadow-xl min-w-[140px]"
    >
      {/* Header */}
      <div
        className="flex items-center gap-1.5 rounded-t-xl px-2.5 py-1.5"
        style={{ backgroundColor: node.color + '33' }}
      >
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: node.color }} />
        <span className="flex-1 text-[10px] font-semibold text-white truncate">{node.label}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-white/40 hover:text-white"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </div>
      {/* Ports */}
      <div className="flex gap-4 px-2 py-1.5">
        {/* Inputs */}
        <div className="space-y-1">
          {node.inputs.map((p) => (
            <div key={p.id} className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full border border-white/40 bg-studio-surface" />
              <span className="text-[8px] text-white/60">{p.label}</span>
            </div>
          ))}
        </div>
        {/* Outputs */}
        {node.outputs.length > 0 && (
          <div className="ml-auto space-y-1">
            {node.outputs.map((p) => (
              <div key={p.id} className="flex items-center gap-1">
                <span className="text-[8px] text-white/60">{p.label}</span>
                <div className="h-2 w-2 rounded-full border border-white/40 bg-studio-surface" />
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Category badge */}
      <div className="px-2 pb-1.5">
        <span
          className="rounded-full border px-1 py-0.5 text-[7px]"
          style={{ borderColor: node.color + '66', color: node.color }}
        >
          {node.category}
        </span>
      </div>
    </div>
  );
}

export function NodeGraphPanel({ onClose }: NodeGraphPanelProps) {
  const { nodes, edges, selected, setSelected, addNode, removeNode, moveNode, clearGraph } =
    useNodeGraph();
  const [catalog, setCatalog] = useState<NodeDef[]>([]);
  const [q, setQ] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/nodes')
      .then((r) => r.json())
      .then((d: { nodes: NodeDef[] }) => setCatalog(d.nodes))
      .catch((err) => logger.warn('Swallowed error caught:', err));
  }, []);

  const filteredCatalog = catalog.filter(
    (n) =>
      !q ||
      n.label.toLowerCase().includes(q.toLowerCase()) ||
      n.category.toLowerCase().includes(q.toLowerCase())
  );

  const handleCanvasClick = () => setSelected(null);

  // Simple edge SVG lines (straight)
  const edgeLines = edges.map((e) => {
    const from = nodes.find((n) => n.id === e.fromNodeId);
    const to = nodes.find((n) => n.id === e.toNodeId);
    if (!from || !to) return null;
    const x1 = from.x + 140;
    const y1 = from.y + 30;
    const x2 = to.x;
    const y2 = to.y + 30;
    const cx = (x1 + x2) / 2;
    return (
      <path
        key={e.id}
        d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
        fill="none"
        stroke="#4488ff66"
        strokeWidth={1.5}
      />
    );
  });

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Network className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Node Graph</span>
        <div className="ml-auto flex gap-1">
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-studio-border px-2 py-1 text-[9px] text-studio-muted hover:text-studio-text"
          >
            <Plus className="h-2.5 w-2.5" /> Add
          </button>
          <button
            onClick={clearGraph}
            className="rounded-lg border border-studio-border p-1 text-studio-muted hover:text-studio-text"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-studio-border p-1 text-studio-muted hover:text-studio-text"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Node picker dropdown */}
      {showPicker && (
        <div className="shrink-0 border-b border-studio-border p-2 space-y-1.5 max-h-48 overflow-y-auto">
          <div className="flex items-center gap-2 rounded-lg border border-studio-border bg-studio-surface px-2 py-1">
            <Search className="h-3 w-3 text-studio-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search nodes…"
              className="flex-1 bg-transparent text-[10px] outline-none placeholder-studio-muted/40"
              autoFocus
            />
          </div>
          {filteredCatalog.map((n) => (
            <button
              key={n.type}
              onClick={() => {
                addNode(n);
                setShowPicker(false);
                setQ('');
              }}
              className="flex w-full items-center gap-2 rounded-lg border border-studio-border bg-studio-surface px-2 py-1 text-left hover:border-studio-accent/50"
            >
              <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: n.color }} />
              <span className="text-[10px] text-studio-text">{n.label}</span>
              <span className="ml-auto text-[8px] text-studio-muted">{n.category}</span>
            </button>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="relative flex-1 overflow-hidden bg-[#0a0a18]"
        style={{
          backgroundImage: 'radial-gradient(circle, #1a1a3a 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
        onClick={handleCanvasClick}
      >
        {/* SVG edges */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full">{edgeLines}</svg>
        {/* Node cards */}
        {nodes.map((node) => (
          <NodeCard
            key={node.id}
            node={node}
            selected={selected === node.id}
            onSelect={() => setSelected(node.id)}
            onRemove={() => removeNode(node.id)}
            onDragEnd={(dx, dy) => moveNode(node.id, dx, dy)}
          />
        ))}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-studio-muted">
            <Network className="h-8 w-8 opacity-20" />
            <p className="text-[10px] opacity-40">Click + Add to place nodes</p>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="shrink-0 border-t border-studio-border px-3 py-1 flex items-center gap-3 text-[8px] text-studio-muted">
        <span>{nodes.length} nodes</span>
        <span>{edges.length} edges</span>
        {selected && (
          <span className="text-studio-accent">
            Selected: {nodes.find((n) => n.id === selected)?.label}
          </span>
        )}
      </div>
    </div>
  );
}
