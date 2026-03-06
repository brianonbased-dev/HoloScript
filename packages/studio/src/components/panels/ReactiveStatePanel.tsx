'use client';
/** ReactiveStatePanel — Reactive state with undo/redo */
import React, { useState } from 'react';
import { useReactiveState } from '../../hooks/useReactiveState';

export function ReactiveStatePanel() {
  const { state, changes, set, undo, redo, buildDemo, reset } = useReactiveState();
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');

  const handleAdd = () => {
    if (!newKey) return;
    const parsed = Number(newVal);
    set(newKey, isNaN(parsed) ? newVal : parsed);
    setNewKey(''); setNewVal('');
  };

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">⚡ State</h3>
        <span className="text-[10px] text-studio-muted">{Object.keys(state).length} keys · {changes} changes</span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button onClick={buildDemo} className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition">⚡ Demo</button>
        <button onClick={undo} className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">↩ Undo</button>
        <button onClick={redo} className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition">↪ Redo</button>
        <button onClick={reset} className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition">↺</button>
      </div>

      {/* State entries */}
      <div className="space-y-0.5 max-h-[100px] overflow-y-auto">
        {Object.keys(state).length === 0 && <p className="text-studio-muted text-center py-2">Load demo or add keys below.</p>}
        {Object.entries(state).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between bg-studio-panel/30 rounded px-2 py-0.5">
            <span className="text-studio-accent font-mono text-[10px]">{k}</span>
            <span className="text-studio-text font-mono text-[10px]">{String(v)}</span>
          </div>
        ))}
      </div>

      {/* Add / edit */}
      <div className="flex gap-1">
        <input type="text" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="key" className="flex-1 bg-studio-panel/30 text-studio-text rounded px-1.5 py-0.5 text-[10px] outline-none" />
        <input type="text" value={newVal} onChange={e => setNewVal(e.target.value)} placeholder="value" className="flex-1 bg-studio-panel/30 text-studio-text rounded px-1.5 py-0.5 text-[10px] outline-none" />
        <button onClick={handleAdd} className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition text-[10px]">+</button>
      </div>
    </div>
  );
}
