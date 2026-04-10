'use client';

import React, { useState } from 'react';
import { Network, Plus, Play, Save, ChevronRight, Activity, Settings2, Trash2 } from 'lucide-react';

type ChainNode = {
  id: string;
  type: 'agent' | 'connector' | 'transform';
  label: string;
  connectorId?: string;
  position: { x: number; y: number };
};

export function TaskChainingVisualizer() {
  const [nodes, setNodes] = useState<ChainNode[]>([
    { id: 'start', type: 'connector', label: 'Absorb Data', position: { x: 50, y: 150 } },
    { id: 'node_1', type: 'agent', label: 'Synthesize Schema', position: { x: 300, y: 150 } },
    { id: 'end', type: 'connector', label: 'Emit Knowledge', position: { x: 550, y: 150 } }
  ]);

  const [activeNode, setActiveNode] = useState<string | null>('node_1');

  const addNode = () => {
    const newId = `node_${Date.now()}`;
    const xBase = nodes.reduce((max, n) => Math.max(max, n.position.x), 0) + 250;
    setNodes([...nodes, {
      id: newId,
      type: 'agent',
      label: 'New Task',
      position: { x: xBase, y: 150 }
    }]);
    setActiveNode(newId);
  };

  const removeNode = (id: string) => {
    setNodes(nodes.filter(n => n.id !== id));
    if (activeNode === id) setActiveNode(null);
  };

  return (
    <div className="w-full h-full flex font-sans">
      {/* Visual Canvas Area */}
      <div className="flex-1 bg-zinc-950 relative overflow-hidden pattern-grid">
        {/* Subtle grid background */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}
        />

        {/* Toolbar */}
        <div className="absolute top-4 left-4 flex gap-2 z-10">
          <button 
            onClick={addNode}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-sm px-4 py-2 rounded-md transition-colors border border-zinc-700 shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Task
          </button>
          <button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-zinc-50 text-sm px-4 py-2 rounded-md transition-colors shadow-sm">
            <Play className="w-4 h-4" /> Execute Chain
          </button>
        </div>

        {/* Nodes layer */}
        <div className="absolute inset-0 pt-[80px]">
          <div className="relative w-full h-full min-h-[600px] min-w-[1000px]">
            {/* Draw connecting lines */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
              {nodes.map((node, i) => {
                if (i === nodes.length - 1) return null;
                const next = nodes[i + 1];
                return (
                  <g key={`edge-${node.id}`}>
                    <path
                      d={`M ${node.position.x + 180} ${node.position.y + 40} L ${next.position.x} ${next.position.y + 40}`}
                      stroke="#3f3f46"
                      strokeWidth="2"
                      fill="none"
                      markerEnd="url(#arrow)"
                    />
                  </g>
                );
              })}
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#3f3f46" />
                </marker>
              </defs>
            </svg>

            {/* Draw nodes */}
            {nodes.map((node) => (
              <div
                key={node.id}
                onClick={() => setActiveNode(node.id)}
                className={`absolute p-4 rounded-lg w-[180px] cursor-pointer transition-all border-2 z-10 shadow-lg
                  ${activeNode === node.id 
                    ? 'border-emerald-500 bg-zinc-800' 
                    : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'}
                `}
                style={{
                  left: `${node.position.x}px`,
                  top: `${node.position.y}px`
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-1.5 rounded-md ${node.type === 'connector' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                    {node.type === 'connector' ? <Network className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                  </div>
                  {activeNode === node.id && (
                    <button onClick={(e) => { e.stopPropagation(); removeNode(node.id); }} className="text-zinc-500 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="font-medium text-sm text-zinc-100 truncate">{node.label}</div>
                <div className="text-xs text-zinc-500 mt-1 capitalize">{node.type} Node</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Properties Sidebar */}
      <div className="w-80 bg-zinc-900 border-l border-zinc-800 flex flex-col z-20">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> Node Configuration
          </h2>
          <button className="text-zinc-400 hover:text-zinc-100"><Save className="w-4 h-4" /></button>
        </div>
        
        {activeNode ? (() => {
          const node = nodes.find(n => n.id === activeNode);
          if (!node) return null;
          return (
            <div className="p-4 flex-1 overflow-auto">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Node Label</label>
                  <input 
                    type="text" 
                    value={node.label}
                    onChange={(e) => {
                      setNodes(nodes.map(n => n.id === node.id ? { ...n, label: e.target.value } : n));
                    }}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Execution Core</label>
                  <select className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100">
                    <option>HoloScript Runtime (V8)</option>
                    <option>Native Orchestrator</option>
                    <option>WASM Engine Fast-Path</option>
                  </select>
                </div>
                {node.type === 'agent' && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Assigned Agent</label>
                    <div className="p-3 bg-zinc-950 border border-zinc-800 rounded flex justify-between items-center cursor-pointer hover:border-zinc-700 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center">
                          <span className="text-xs text-indigo-400 font-bold">A</span>
                        </div>
                        <span className="text-sm">Analyst Bot 3.0</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-500" />
                    </div>
                  </div>
                )}
                <div className="pt-4 border-t border-zinc-800">
                  <label className="block text-xs font-medium text-zinc-400 mb-2">Input Mapping Schema</label>
                  <div className="bg-zinc-950 p-3 rounded font-mono text-xs text-zinc-300 overflow-hidden border border-zinc-900">
                    {`{\n  "sourceContext": "$nodes[${nodes.findIndex(n => n.id === activeNode) - 1}].output",\n  "failPolicy": "halt"\n}`}
                  </div>
                </div>
              </div>
            </div>
          );
        })() : (
          <div className="p-8 text-center text-zinc-500 text-sm">
            Select a node to inspect and configure its execution parameters.
          </div>
        )}
      </div>
    </div>
  );
}
