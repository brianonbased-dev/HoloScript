'use client';
/** ScriptingPanel — HoloScript REPL console */
import React, { useState } from 'react';
import { useScripting } from '../../hooks/useScripting';

export function ScriptingPanel() {
  const { history, variables, evaluate, clearHistory, reset } = useScripting();
  const [input, setInput] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    await evaluate(input);
    setInput('');
  };

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">📝 Scripting</h3>
        <span className="text-[10px] text-studio-muted">{history.length} entries</span>
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={clearHistory}
          className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
        >
          Clear
        </button>
        <button
          onClick={reset}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺ Reset
        </button>
      </div>

      {/* REPL output */}
      <div className="bg-black/30 rounded-lg p-2 font-mono text-[11px] max-h-[140px] overflow-y-auto space-y-1">
        {history.length === 0 && (
          <span className="text-studio-muted">// Enter HoloScript expressions below</span>
        )}
        {history.map((entry) => (
          <div key={entry.id}>
            <div className="text-studio-accent">❯ {entry.input}</div>
            <div className={entry.success ? 'text-emerald-400' : 'text-red-400'}>
              {entry.output}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-1">
        <span className="text-studio-accent font-mono text-sm self-center">❯</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="expression..."
          className="flex-1 bg-black/30 text-studio-text rounded px-2 py-1 font-mono text-[11px] border border-studio-border/30 focus:border-studio-accent/50 outline-none"
        />
        <button
          type="submit"
          className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
        >
          ⏎
        </button>
      </form>

      {/* Quick expressions */}
      <div className="flex gap-1 flex-wrap">
        {['1 + 1', '"Hello".length', 'Math.PI', '[1,2,3].map(x => x * 2)'].map((expr) => (
          <button
            key={expr}
            onClick={() => {
              setInput(expr);
              evaluate(expr);
            }}
            className="px-1.5 py-0.5 bg-studio-panel/40 text-studio-muted rounded text-[10px] hover:text-studio-text transition font-mono"
          >
            {expr}
          </button>
        ))}
      </div>

      {/* Variables */}
      {variables.length > 0 && (
        <div>
          <h4 className="text-studio-muted font-medium mb-1">Variables</h4>
          <div className="space-y-0.5">
            {variables.map((v) => (
              <div
                key={v.name}
                className="flex items-center justify-between bg-studio-panel/20 rounded px-2 py-0.5"
              >
                <span className="text-studio-accent font-mono text-[10px]">{v.name}</span>
                <span className="text-studio-text font-mono text-[10px] truncate max-w-[150px]">
                  {v.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
