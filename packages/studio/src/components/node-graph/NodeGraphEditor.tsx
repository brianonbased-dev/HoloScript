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

import { useCallback, useMemo } from 'react';
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
import { compileNodeGraph } from '@/lib/nodeGraphCompiler';
import { Play, RotateCcw, Plus } from 'lucide-react';

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
        className="w-full rounded bg-studio-surface px-2 py-0.5 text-right text-xs outline-none"
      />
      <Handle type="source" position={Position.Right} id="out" style={{ background: H.out, width: 8, height: 8 }} />
    </div>
  );
}

function TimeNode({ data }: { data: { label: string } }) {
  return (
    <div className={nodeBase}>
      <div className={nodeLabel}>{data.label}</div>
      <span className="text-xs text-studio-accent font-mono">uTime</span>
      <Handle type="source" position={Position.Right} id="out" style={{ background: H.out, width: 8, height: 8 }} />
    </div>
  );
}

function UVNode({ data }: { data: { label: string; channel: number } }) {
  return (
    <div className={nodeBase}>
      <div className={nodeLabel}>{data.label}</div>
      <span className="text-xs text-studio-text font-mono">vUv.{data.channel === 0 ? 'x' : 'y'}</span>
      <Handle type="source" position={Position.Right} id="out" style={{ background: H.out, width: 8, height: 8 }} />
    </div>
  );
}

function MathNode({ data }: { data: { label: string; op: string } }) {
  return (
    <div className={nodeBase}>
      <div className={nodeLabel}>{data.label}</div>
      <span className="font-mono text-xs text-studio-accent">{data.op}()</span>
      <Handle type="target" position={Position.Left} id="a" style={{ top: '40%', background: H.in, width: 8, height: 8 }} />
      <Handle type="target" position={Position.Left} id="b" style={{ top: '65%', background: H.in, width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} id="out" style={{ background: H.out, width: 8, height: 8 }} />
    </div>
  );
}

function OutputNode({ data }: { data: { label: string; outputType: string } }) {
  return (
    <div className={`${nodeBase} border-studio-accent/50`}>
      <div className={nodeLabel}>Output</div>
      <span className="text-xs text-studio-accent">{data.outputType}</span>
      <Handle type="target" position={Position.Left} id="rgb" style={{ top: '40%', background: H.in, width: 8, height: 8 }} />
      <Handle type="target" position={Position.Left} id="alpha" style={{ top: '65%', background: H.in, width: 8, height: 8 }} />
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
  { label: 'Time',     type: 'timeNode',     data: { type: 'time',     label: 'Time' } },
  { label: 'UV',       type: 'uvNode',        data: { type: 'uv',       label: 'UV',      channel: 0 } },
  { label: 'Constant', type: 'constantNode',  data: { type: 'constant', label: 'Value',   value: 1.0 } },
  { label: 'Sin',      type: 'mathNode',      data: { type: 'math',     label: 'Sin',     op: 'sin' } },
  { label: 'Cos',      type: 'mathNode',      data: { type: 'math',     label: 'Cos',     op: 'cos' } },
  { label: 'Mul',      type: 'mathNode',      data: { type: 'math',     label: 'Multiply', op: 'mul' } },
  { label: 'Add',      type: 'mathNode',      data: { type: 'math',     label: 'Add',     op: 'add' } },
  { label: 'Mix',      type: 'mathNode',      data: { type: 'math',     label: 'Mix',     op: 'mix' } },
  { label: 'Output',   type: 'outputNode',    data: { type: 'output',   label: 'Output',  outputType: 'fragColor' } },
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
  const reset = useNodeGraphStore((s) => s.reset);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) => addEdge({ ...connection, animated: true }, eds)),
    [setEdges]
  );

  const handleCompile = useCallback(() => {
    const result = compileNodeGraph(nodes, edges);
    if (result.ok) {
      setCompiledGLSL(result.glsl);
      onCompile?.(result.glsl);
    }
  }, [nodes, edges, setCompiledGLSL, onCompile]);

  const addNodeFromPalette = useCallback(
    (item: typeof PALETTE[0]) => {
      const id = `node_${++nodeSeq}`;
      setNodes((ns) => [
        ...ns,
        {
          id,
          type: item.type,
          position: { x: 200 + Math.random() * 100, y: 100 + Math.random() * 200 },
          data: { ...item.data },
        },
      ]);
    },
    [setNodes]
  );

  const nodeTypes = useMemo(() => NODE_TYPES, []);

  return (
    <div className="flex h-full flex-col bg-[#0a0a12]">
      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-studio-border px-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-studio-muted mr-2">Add Node:</span>
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
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={reset}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-studio-muted hover:bg-studio-border"
            title="Reset graph to default"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
          <button
            onClick={handleCompile}
            className="flex items-center gap-1 rounded bg-studio-accent px-3 py-1 text-[10px] font-medium text-white transition hover:bg-studio-accent/80"
            title="Compile graph → GLSL"
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
            // Apply position changes
            setNodes((ns) =>
              ns.map((n) => {
                const change = changes.find((c) => c.type === 'position' && c.id === n.id);
                if (change && change.type === 'position' && change.position) {
                  return { ...n, position: change.position };
                }
                const rem = changes.find((c) => c.type === 'remove' && c.id === n.id);
                if (rem) return null;
                return n;
              }).filter(Boolean) as typeof ns
            );
          }}
          onEdgesChange={(changes) => {
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
    </div>
  );
}
