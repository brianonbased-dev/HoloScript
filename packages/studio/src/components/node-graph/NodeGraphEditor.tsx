'use client';

/**
 * NodeGraphEditor — React Flow visual shader graph
 *
 * Features:
 *  - Custom node types: Constant, Math, UV, Time, Texture, Output
 *  - Compile graph → GLSL → paste into ShaderEditorPanel via store
 *  - Minimap + Background grid + Controls
 *  - Add node palette toolbar (top)
 *  - Reset button, Compile button with status indicator
 */

import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  BackgroundVariant,
  type Connection,
  type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useNodeGraphStore } from '@/lib/nodeGraphStore';
import type { GNode } from '@/lib/nodeGraphStore';
import { useNodeGraphHistory } from '@/hooks/useNodeGraphHistory';

import { compileNodeGraph } from '@/lib/nodeGraphCompiler';
import { SAVE_FEEDBACK_DURATION, COPY_FEEDBACK_DURATION } from '@/lib/ui-timings';
import {
  Play,
  RotateCcw,
  Plus,
  Undo2,
  Redo2,
  Code2,
  Copy,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ─── Handle color ────────────────────────────────────────────────────────────

const H = {
  out: '#6366f1',
  in: '#94a3b8',
};

// ─── Node style base ─────────────────────────────────────────────────────────

const nodeBase =
  'rounded-xl border border-studio-border bg-studio-panel px-3 py-2 text-[11px] text-studio-text shadow-lg min-w-[130px]';

const nodeLabel = 'text-[10px] font-bold uppercase tracking-widest text-studio-muted mb-1';

// ─── Custom node components ───────────────────────────────────────────────────

import { Handle, Position } from 'reactflow';

function ConstantNode({ data }: { data: { label: string; value: number } }) {
  return (
    <div className={nodeBase}>
      <div className={nodeLabel}>{data.label}</div>
      <input
        type="number"
        value={data.value}
        readOnly
        aria-label={`${data.label} constant value`}
        title={`${data.label} constant value`}
        className="w-full rounded bg-studio-surface px-2 py-0.5 text-right text-xs outline-none"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: H.out, width: 8, height: 8 }}
      />
    </div>
  );
}

function TimeNode({ data }: { data: { label: string } }) {
  return (
    <div className={nodeBase}>
      <div className={nodeLabel}>{data.label}</div>
      <span className="text-xs text-studio-accent font-mono">uTime</span>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: H.out, width: 8, height: 8 }}
      />
    </div>
  );
}

function UVNode({ data }: { data: { label: string; channel: number } }) {
  return (
    <div className={nodeBase}>
      <div className={nodeLabel}>{data.label}</div>
      <span className="text-xs text-studio-text font-mono">
        vUv.{data.channel === 0 ? 'x' : 'y'}
      </span>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: H.out, width: 8, height: 8 }}
      />
    </div>
  );
}

function MathNode({ data }: { data: { label: string; op: string } }) {
  return (
    <div className={nodeBase}>
      <div className={nodeLabel}>{data.label}</div>
      <span className="font-mono text-xs text-studio-accent">{data.op}()</span>
      <Handle
        type="target"
        position={Position.Left}
        id="a"
        style={{ top: '40%', background: H.in, width: 8, height: 8 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="b"
        style={{ top: '65%', background: H.in, width: 8, height: 8 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: H.out, width: 8, height: 8 }}
      />
    </div>
  );
}

function OutputNode({ data }: { data: { label: string; outputType: string } }) {
  return (
    <div className={`${nodeBase} border-studio-accent/50`}>
      <div className={nodeLabel}>Output</div>
      <span className="text-xs text-studio-accent">{data.outputType}</span>
      <Handle
        type="target"
        position={Position.Left}
        id="rgb"
        style={{ top: '40%', background: H.in, width: 8, height: 8 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="alpha"
        style={{ top: '65%', background: H.in, width: 8, height: 8 }}
      />
    </div>
  );
}

const NODE_TYPES: NodeTypes = {
  constantNode: ConstantNode,
  timeNode: TimeNode,
  uvNode: UVNode,
  mathNode: MathNode,
  outputNode: OutputNode,
};

// ─── Palette items ────────────────────────────────────────────────────────────

const PALETTE = [
  { label: 'Time', type: 'timeNode', data: { type: 'time', label: 'Time' } },
  { label: 'UV', type: 'uvNode', data: { type: 'uv', label: 'UV', channel: 0 } },
  {
    label: 'Constant',
    type: 'constantNode',
    data: { type: 'constant', label: 'Value', value: 1.0 },
  },
  { label: 'Sin', type: 'mathNode', data: { type: 'math', label: 'Sin', op: 'sin' } },
  { label: 'Cos', type: 'mathNode', data: { type: 'math', label: 'Cos', op: 'cos' } },
  { label: 'Mul', type: 'mathNode', data: { type: 'math', label: 'Multiply', op: 'mul' } },
  { label: 'Add', type: 'mathNode', data: { type: 'math', label: 'Add', op: 'add' } },
  { label: 'Mix', type: 'mathNode', data: { type: 'math', label: 'Mix', op: 'mix' } },
  {
    label: 'Output',
    type: 'outputNode',
    data: { type: 'output', label: 'Output', outputType: 'fragColor' },
  },
];

// ─── Main editor ──────────────────────────────────────────────────────────────

interface NodeGraphEditorProps {
  /** If provided, compiled GLSL is also pushed here for ShaderEditorPanel */
  onCompile?: (glsl: string) => void;
}

let nodeSeq = 10;

export function NodeGraphEditor({ onCompile }: NodeGraphEditorProps) {
  const nodes = useNodeGraphStore((s) => s.nodes);
  const edges = useNodeGraphStore((s) => s.edges);
  const setNodes = useNodeGraphStore((s) => s.setNodes);
  const setEdges = useNodeGraphStore((s) => s.setEdges);
  const setCompiledGLSL = useNodeGraphStore((s) => s.setCompiledGLSL);
  const compiledGLSL = useNodeGraphStore((s) => s.compiledGLSL);
  const reset = useNodeGraphStore((s) => s.reset);

  const { canUndo, canRedo, record, undo, redo, clear } = useNodeGraphHistory();
  const [showGLSL, setShowGLSL] = useState(false);
  const [copied, setCopied] = useState(false);

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const snap = undo({ nodes, edges });
        if (snap) {
          setNodes(snap.nodes);
          setEdges(snap.edges);
        }
      } else if (e.key === 'Z' || (e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        const snap = redo({ nodes, edges });
        if (snap) {
          setNodes(snap.nodes);
          setEdges(snap.edges);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [nodes, edges, undo, redo, setNodes, setEdges]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const onConnect = useCallback(
    (connection: Connection) => {
      record(nodes, edges);
      setEdges((eds) => addEdge({ ...connection, animated: true }, eds));
    },
    [setEdges, record, nodes, edges]
  );

  const handleCompile = useCallback(() => {
    const result = compileNodeGraph(nodes, edges);
    if (result.ok) {
      setCompiledGLSL(result.glsl);
      onCompile?.(result.glsl);
    }
  }, [nodes, edges, setCompiledGLSL, onCompile]);

  // ─── Auto-compile (debounced, position-skip) ──────────────────────────────

  const autoCompileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable signature: edge topology + node types (NOT positions)
  const graphSignature = useMemo(() => {
    const nodeKey = nodes.map((n) => `${n.id}:${n.type}:${JSON.stringify(n.data)}`).join('|');
    const edgeKey = edges
      .map((e) => `${e.source}>${e.sourceHandle}->${e.target}>${e.targetHandle}`)
      .join('|');
    return `${nodeKey}\n${edgeKey}`;
  }, [nodes, edges]);

  const lastCompiledSig = useRef<string>('');
  const [autoCompileStatus, setAutoCompileStatus] = useState<'idle' | 'ok' | 'err'>('idle');
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (graphSignature === lastCompiledSig.current) return;
    if (autoCompileTimer.current) clearTimeout(autoCompileTimer.current);
    autoCompileTimer.current = setTimeout(() => {
      const result = compileNodeGraph(nodes, edges);
      if (result.ok) {
        setCompiledGLSL(result.glsl);
        onCompile?.(result.glsl);
        lastCompiledSig.current = graphSignature;
        setAutoCompileStatus('ok');
      } else {
        setAutoCompileStatus('err');
      }
      if (statusTimer.current) clearTimeout(statusTimer.current);
      statusTimer.current = setTimeout(() => setAutoCompileStatus('idle'), SAVE_FEEDBACK_DURATION);
    }, 600);
    return () => {
      if (autoCompileTimer.current) clearTimeout(autoCompileTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphSignature]);

  const handleUndo = useCallback(() => {
    const snap = undo({ nodes, edges });
    if (snap) {
      setNodes(snap.nodes);
      setEdges(snap.edges);
    }
  }, [nodes, edges, undo, setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    const snap = redo({ nodes, edges });
    if (snap) {
      setNodes(snap.nodes);
      setEdges(snap.edges);
    }
  }, [nodes, edges, redo, setNodes, setEdges]);

  const handleReset = useCallback(() => {
    clear();
    reset();
  }, [clear, reset]);

  const addNodeFromPalette = useCallback(
    (item: (typeof PALETTE)[0]) => {
      record(nodes, edges);
      const id = `node_${++nodeSeq}`;
      setNodes(
        (ns) =>
          [
            ...ns,
            {
              id,
              type: item.type,
              position: { x: 200 + Math.random() * 100, y: 100 + Math.random() * 200 },
              data: { ...item.data },
            },
          ] as GNode[]
      );
    },
    [setNodes, record, nodes, edges]
  );

  const nodeTypes = useMemo(() => NODE_TYPES, []);

  return (
    <div className="flex h-full flex-col bg-[#0a0a12]">
      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-studio-border px-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-studio-muted mr-2">
          Add Node:
        </span>
        {PALETTE.map((item) => (
          <button
            key={`${item.type}-${item.label}`}
            onClick={() => addNodeFromPalette(item)}
            className="rounded bg-studio-surface px-2 py-1 text-[10px] text-studio-text transition hover:bg-studio-border"
          >
            <Plus className="inline h-2.5 w-2.5 mr-0.5" />
            {item.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1">
          {/* Undo / Redo */}
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-studio-muted hover:bg-studio-border disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <Undo2 className="h-3 w-3" />
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-studio-muted hover:bg-studio-border disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <Redo2 className="h-3 w-3" />
          </button>

          <div className="mx-1 h-4 w-px bg-studio-border" aria-hidden="true" />

          {/* Auto-compile status badge */}
          {autoCompileStatus !== 'idle' && (
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition-opacity ${
                autoCompileStatus === 'ok'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {autoCompileStatus === 'ok' ? '✓ compiled' : '✗ error'}
            </span>
          )}

          <button
            onClick={handleReset}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-studio-muted hover:bg-studio-border"
            title="Reset graph to default"
            aria-label="Reset node graph"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
          <button
            onClick={handleCompile}
            className="flex items-center gap-1 rounded bg-studio-accent px-3 py-1 text-[10px] font-medium text-white transition hover:bg-studio-accent/80"
            title="Compile graph → GLSL"
            aria-label="Compile node graph to GLSL"
          >
            <Play className="h-3 w-3" /> Compile GLSL
          </button>
        </div>
      </div>

      {/* React Flow canvas */}
      <div className="flex-1 overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={(changes) => {
            const hasRemove = changes.some((c) => c.type === 'remove');
            if (hasRemove) record(nodes, edges);
            setNodes(
              (ns) =>
                ns
                  .map((n) => {
                    const change = changes.find((c) => c.type === 'position' && c.id === n.id);
                    if (change && change.type === 'position' && change.position) {
                      return { ...n, position: change.position };
                    }
                    const rem = changes.find((c) => c.type === 'remove' && c.id === n.id);
                    if (rem) return null;
                    return n;
                  })
                  .filter(Boolean) as typeof ns
            );
          }}
          onEdgesChange={(changes) => {
            const hasRemove = changes.some((c) => c.type === 'remove');
            if (hasRemove) record(nodes, edges);
            setEdges((es) =>
              es.filter((e) => !changes.some((c) => c.type === 'remove' && c.id === e.id))
            );
          }}
          onConnect={onConnect}
          fitView
          attributionPosition="bottom-right"
        >
          <Background color="#1e1e2e" variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls className="!bg-studio-panel !border-studio-border !text-studio-text" />
          <MiniMap
            nodeColor="#6366f1"
            maskColor="rgba(10,10,18,0.8)"
            className="!bg-studio-panel !border !border-studio-border"
          />
        </ReactFlow>
      </div>

      {/* GLSL Preview Panel */}
      <div className="shrink-0 border-t border-studio-border">
        <button
          onClick={() => setShowGLSL(!showGLSL)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-studio-muted hover:bg-white/5 transition"
        >
          <Code2 className="h-3 w-3" />
          GLSL Output
          {showGLSL ? (
            <ChevronDown className="h-3 w-3 ml-auto" />
          ) : (
            <ChevronUp className="h-3 w-3 ml-auto" />
          )}
        </button>
        {showGLSL && (
          <div className="relative max-h-40 overflow-auto bg-black/50 px-3 py-2">
            <button
              onClick={() => {
                if (compiledGLSL) {
                  navigator.clipboard.writeText(compiledGLSL);
                  setCopied(true);COPY_FEEDBACK_DURATION
                  setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION);
                }
              }}
              className="absolute top-2 right-2 rounded bg-studio-surface px-2 py-0.5 text-[9px] text-studio-muted hover:bg-studio-border transition"
              title="Copy GLSL"
            >
              {copied ? '✓ Copied' : <Copy className="h-3 w-3" />}
            </button>
            <pre className="text-[11px] leading-relaxed font-mono text-emerald-300/80 whitespace-pre-wrap">
              {compiledGLSL || '// Connect nodes and compile to see GLSL output'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
