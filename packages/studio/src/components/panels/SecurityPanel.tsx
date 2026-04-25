'use client';
/** SecurityPanel — Sandbox execution and security analysis */
import React, { useState } from 'react';
import { useSecurity, DEMO_SNIPPETS } from '../../hooks/useSecurity';

export function SecurityPanel() {
  const {
    sandbox,
    results,
    isRunning,
    createNewSandbox,
    executeCode,
    destroyCurrentSandbox,
    runDemo,
    clearResults,
  } = useSecurity();
  const [code, setCode] = useState('Math.sqrt(144) + 1;');

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">🔒 Security</h3>
        <span
          className={`text-[10px] font-medium ${sandbox ? 'text-emerald-400' : 'text-studio-muted'}`}
        >
          {sandbox ? `🟢 ${sandbox.state}` : '⚫ No sandbox'}
        </span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={createNewSandbox}
          className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
        >
          🔒 Create
        </button>
        <button
          onClick={runDemo}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
        >
          🎯 Demo
        </button>
        <button
          onClick={destroyCurrentSandbox}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          💣 Destroy
        </button>
        <button
          onClick={clearResults}
          className="px-2 py-1 bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
        >
          ↺
        </button>
      </div>

      {/* Code input */}
      <div className="space-y-1">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full bg-black/30 text-studio-text rounded p-2 font-mono text-[11px] resize-none border border-studio-border/30 focus:border-studio-accent/50 outline-none"
          rows={3}
          placeholder="Enter code to execute in sandbox..."
        />
        <div className="flex gap-1">
          <button
            onClick={() => executeCode(code)}
            disabled={isRunning}
            className="flex-1 px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition disabled:opacity-50"
          >
            {isRunning ? '⏳ Running...' : '▶ Execute'}
          </button>
          {DEMO_SNIPPETS.map((s) => (
            <button
              key={s.label}
              onClick={() => setCode(s.code)}
              className="px-1.5 py-1 bg-studio-panel/40 text-studio-muted rounded text-[10px] hover:text-studio-text transition"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="space-y-1 max-h-[120px] overflow-y-auto">
        {results.map((r, i) => (
          <div
            key={i}
            className={`rounded p-1.5 text-[10px] ${r.success ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className={r.success ? 'text-emerald-400' : 'text-red-400'}>
                {r.success ? '✓' : '✗'}
              </span>
              <span className="text-studio-muted">
                {Number(r.cpuTimeUsed ?? 0).toFixed(1)}ms ·{' '}
                {(Number(r.memoryUsed ?? 0) / 1024).toFixed(1)}KB
              </span>
            </div>
            <div className="font-mono text-studio-text truncate">
              {r.success ? String(r.result ?? '') : String(r.error ?? '')}
            </div>
          </div>
        ))}
      </div>

      {/* Sandbox info */}
      {sandbox && (
        <div className="grid grid-cols-2 gap-2 text-[10px] bg-studio-panel/30 rounded-lg p-2">
          <div>
            <span className="text-studio-muted">Memory</span>
            <br />
            <span className="text-studio-text font-mono">
              {(Number(sandbox.memoryUsed ?? 0) / 1024).toFixed(1)}KB
            </span>
          </div>
          <div>
            <span className="text-studio-muted">CPU Time</span>
            <br />
            <span className="text-studio-text font-mono">
              {Number(sandbox.cpuTimeUsed ?? 0).toFixed(1)}ms
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
