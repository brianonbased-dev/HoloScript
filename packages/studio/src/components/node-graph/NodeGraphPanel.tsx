'use client';

/**
 * NodeGraphPanel — visual node graph editor with drag-canvas, node cards, and SVG edges.
 */

import { useState, useRef, useEffect } from 'react';
import { Network, X, Search, Plus, RotateCcw, Play, ChevronDown, UploadCloud } from 'lucide-react';
import { useNodeGraph, type GraphNode, type NodeDef } from '@/hooks/useNodeGraph';
import {
  executeStudioGraph,
  formatExecutionResult,
  type StudioGraphExecutionResult,
} from '@/lib/nodeGraphExecutionBridge';
import { logger } from '@/lib/logger';

interface NodeGraphPanelProps {
  onClose: () => void;
  onExecutionResult?: (result: StudioGraphExecutionResult) => void;
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
          title="Remove node"
          aria-label="Remove node"
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

export function NodeGraphPanel({ onClose, onExecutionResult }: NodeGraphPanelProps) {
  const { nodes, edges, selected, setSelected, addNode, removeNode, moveNode, clearGraph } =
    useNodeGraph();
  const [catalog, setCatalog] = useState<NodeDef[]>([]);
  const [q, setQ] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [execResult, setExecResult] = useState<StudioGraphExecutionResult | null>(null);
  const [execError, setExecError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<{ message: string; status?: number } | null>(null);
  const [showResults, setShowResults] = useState(false);
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

  const handleRunGraph = async () => {
    setIsExecuting(true);
    setExecError(null);
    try {
      const result = await executeStudioGraph(nodes, edges);
      setExecResult(result);
      setShowResults(true);
      onExecutionResult?.(result);
      if (!result.success) {
        setExecError(result.errorMessage || 'Execution failed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setExecError(msg);
    } finally {
      setIsExecuting(false);
    }
  };

  const handlePublishGist = async () => {
    setIsPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch('/api/publication/gist-manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: 'studio_preview_scene',
          loroDocVersion: { '1': 100 }, // Stubbed for headless CRDT sync
          xrMetrics: { hitTestCount: 42, occlusionProofAcquired: true }, // Emulated WebXR
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPublishError({ message: data.error || 'Failed to publish gist', status: res.status });
        return;
      }
      setPublishError({ message: 'Success! Written to .holoscript/gist-publication.manifest.json', status: 200 });
    } catch (err) {
      setPublishError({ message: err instanceof Error ? err.message : String(err), status: 500 });
    } finally {
      setIsPublishing(false);
    }
  };

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
            onClick={handleRunGraph}
            disabled={nodes.length === 0 || isExecuting}
            className="flex items-center gap-1.5 rounded-lg bg-green-600/20 hover:bg-green-600/30 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1 text-[10px] font-semibold text-green-400 transition-colors"
            title="Execute the node graph and show results"
          >
            <Play className="h-3 w-3" />
            {isExecuting ? 'Running...' : 'Run Graph'}
          </button>
          <button
            onClick={handlePublishGist}
            disabled={isPublishing}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1 text-[10px] font-semibold text-blue-400 transition-colors"
            title="Publish Sovereign Origination Gist"
          >
            <UploadCloud className="h-3 w-3" />
            {isPublishing ? 'Publishing...' : 'Publish'}
          </button>
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-studio-border px-2 py-1 text-[9px] text-studio-muted hover:text-studio-text"
          >
            <Plus className="h-2.5 w-2.5" /> Add
          </button>
          <button
            onClick={clearGraph}
            title="Clear graph"
            aria-label="Clear graph"
            className="rounded-lg border border-studio-border p-1 text-studio-muted hover:text-studio-text"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
          <button
            onClick={onClose}
            title="Close node graph"
            aria-label="Close node graph"
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

        {/* Global publish error modal/toast overlay */}
        {publishError && (
          <div className="absolute top-4 right-4 z-50 p-3 rounded border border-studio-border bg-studio-surface/95 shadow-xl max-w-sm">
            <div className="flex justify-between items-start mb-1">
              <span className={`text-[11px] font-bold ${publishError.status === 200 ? 'text-green-400' : 'text-red-400'}`}>
                {publishError.status === 402 ? 'Economic Anchor Required' : 'Publication Status'}
              </span>
              <button onClick={() => setPublishError(null)} className="text-white/40 hover:text-white">
                <X className="h-3 w-3" />
              </button>
            </div>
            <p className="text-[10px] text-white/70 mb-2">{publishError.message}</p>
            {publishError.status === 402 && (
              <a href="/marketplace/x402" className="inline-block text-[10px] text-blue-400 hover:text-blue-300 underline">
                Procure an x402 Receipt to satisfy GIST_MANIFEST_REQUIRE_X402 →
              </a>
            )}
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

      {execResult && (
        <div className="shrink-0 border-t border-studio-border bg-[#0a0a18]/80">
          <button
            onClick={() => setShowResults((v) => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-studio-surface/30 transition-colors"
          >
            <ChevronDown
              className="h-3 w-3 transition-transform"
              style={{ transform: showResults ? 'rotate(0deg)' : 'rotate(-90deg)' }}
            />
            <span
              className={`text-[10px] font-semibold ${execResult.success ? 'text-green-400' : 'text-red-400'}`}
            >
              {formatExecutionResult(execResult).summary}
            </span>
          </button>

          {showResults && (
            <div className="px-3 py-2 border-t border-studio-border/50 max-h-48 overflow-y-auto text-[8px] text-studio-muted space-y-1.5">
              <div className="text-studio-text/70">{formatExecutionResult(execResult).details}</div>

              {execResult.nodeOrder.length > 0 && (
                <div>
                  <span className="text-studio-accent">Execution order:</span>
                  <div className="ml-2 text-studio-text/60">{execResult.nodeOrder.join(' → ')}</div>
                </div>
              )}

              {Object.keys(execResult.outputs).length > 0 && (
                <div>
                  <span className="text-studio-accent">Outputs:</span>
                  <div className="ml-2 space-y-0.5">
                    {Object.entries(execResult.outputs)
                      .slice(0, 10)
                      .map(([key, val]) => {
                        const serialized = JSON.stringify(val);
                        return (
                          <div key={key} className="text-studio-text/60">
                            {key}: {serialized.slice(0, 72)}
                            {serialized.length > 72 ? '…' : ''}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {execResult.emittedEvents.length > 0 && (
                <div>
                  <span className="text-studio-accent">Events ({execResult.emittedEvents.length}):</span>
                  <div className="ml-2 space-y-0.5">
                    {execResult.emittedEvents.slice(0, 8).map((evt, i) => (
                      <div key={`${evt.nodeId}-${evt.event}-${i}`} className="text-studio-text/60">
                        {evt.nodeId}: {evt.event}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {execError && (
                <div className="rounded-lg bg-red-900/20 border border-red-700/30 p-1.5 text-red-400">
                  {execError}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
