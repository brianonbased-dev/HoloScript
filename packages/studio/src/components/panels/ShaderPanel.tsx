'use client';
/** ShaderPanel — Visual shader graph editor */
import React from 'react';
import { useShaderGraph } from '../../hooks/useShaderGraph';

const NODE_COLORS: Record<string, string> = {
  Color: 'bg-pink-500/20 text-pink-400',
  Texture: 'bg-cyan-500/20 text-cyan-400',
  Noise: 'bg-emerald-500/20 text-emerald-400',
  Mix: 'bg-amber-500/20 text-amber-400',
  Normal: 'bg-violet-500/20 text-violet-400',
  Fresnel: 'bg-blue-500/20 text-blue-400',
  Math: 'bg-slate-500/20 text-slate-400',
  Output: 'bg-red-500/20 text-red-400',
};

export function ShaderPanel() {
  const {
    nodes,
    connections,
    compiled,
    nodeTypes,
    addNode,
    removeNode,
    compile,
    buildDemo,
    clear,
  } = useShaderGraph();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">✨ Shader Graph</h3>
        <span className="text-[10px] text-studio-muted">
          {nodes.length} nodes · {connections.length} links
        </span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={buildDemo}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          🎨 Demo
        </button>
        <button
          onClick={compile}
          className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
        >
          ⚡ Compile
        </button>
        <button
          onClick={clear}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺
        </button>
      </div>

      {/* Add node buttons */}
      <div className="grid grid-cols-4 gap-1">
        {nodeTypes.map((t) => (
          <button
            key={t}
            onClick={() => addNode(t)}
            className={`px-1.5 py-1 rounded text-[10px] transition hover:opacity-80 ${NODE_COLORS[t] || 'bg-studio-panel text-studio-muted'}`}
          >
            +{t}
          </button>
        ))}
      </div>

      {/* Node list */}
      <div className="space-y-1 max-h-[120px] overflow-y-auto">
        {nodes.map((n) => (
          <div
            key={n.id}
            className={`flex items-center justify-between rounded px-2 py-1 ${NODE_COLORS[n.type] || 'bg-studio-panel/30'}`}
          >
            <span className="font-mono text-[10px]">
              {n.type} <span className="text-studio-muted">#{n.id}</span>
            </span>
            <button onClick={() => removeNode(n.id)} className="text-red-400 text-[10px]">
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Compiled output */}
      {compiled && (
        <div className="bg-studio-panel/50 rounded-lg p-2 space-y-1">
          <h4 className="text-studio-muted font-medium">Compiled GLSL</h4>
          <div className="text-[10px] text-studio-text font-mono bg-black/30 rounded p-1.5 max-h-[80px] overflow-auto whitespace-pre">
            {compiled.fragmentCode.slice(0, 300)}
            {compiled.fragmentCode.length > 300 ? '...' : ''}
          </div>
          <div className="flex gap-3 text-[10px] text-studio-muted">
            <span>{compiled.nodeCount} nodes</span>
            <span>{compiled.connectionCount} connections</span>
            <span>{compiled.uniforms.length} uniforms</span>
          </div>
        </div>
      )}
    </div>
  );
}
