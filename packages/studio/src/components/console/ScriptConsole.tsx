'use client';

/**
 * ScriptConsole — Runtime console with log levels, filtering, timestamps.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Terminal, Trash2, Filter, _ChevronDown, Copy, _Download } from 'lucide-react';

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  id: number;
  level: LogLevel;
  message: string;
  timestamp: number;
  source?: string;
  count: number;
}

const LEVEL_STYLES: Record<LogLevel, { color: string; bg: string; label: string }> = {
  log: { color: 'text-studio-text', bg: '', label: 'LOG' },
  info: { color: 'text-blue-400', bg: 'bg-blue-500/5', label: 'INF' },
  warn: { color: 'text-amber-400', bg: 'bg-amber-500/5', label: 'WRN' },
  error: { color: 'text-red-400', bg: 'bg-red-500/5', label: 'ERR' },
  debug: { color: 'text-purple-400', bg: 'bg-purple-500/5', label: 'DBG' },
};

let nextId = 0;

export function ScriptConsole() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState<Set<LogLevel>>(
    new Set(['log', 'info', 'warn', 'error', 'debug'])
  );
  const [input, setInput] = useState('');
  const [collapsed, _setCollapsed] = useState(true);
  const [showFilter, setShowFilter] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const addEntry = useCallback(
    (level: LogLevel, message: string, source?: string) => {
      setEntries((prev) => {
        // Collapse duplicates
        if (collapsed && prev.length > 0) {
          const last = prev[prev.length - 1];
          if (last.message === message && last.level === level) {
            const nextArr = [
              ...prev.slice(0, -1),
              { ...last, count: last.count + 1, timestamp: Date.now() },
            ];
            return nextArr.slice(-1000);
          }
        }
        return [...prev, { id: nextId++, level, message, timestamp: Date.now(), source, count: 1 }].slice(-1000);
      });
    },
    [collapsed]
  );

  const handleExec = useCallback(() => {
    if (!input.trim()) return;
    addEntry('log', `> ${input}`, 'repl');
    try {
      // eslint-disable-next-line no-eval
      const result = String(eval(input));
      addEntry('info', result, 'eval');
    } catch (e: unknown) {
      addEntry('error', e instanceof Error ? e.message : String(e), 'eval');
    }
    setInput('');
  }, [input, addEntry]);

  const filtered = entries.filter(
    (e) =>
      levelFilter.has(e.level) &&
      (!filter || e.message.toLowerCase().includes(filter.toLowerCase()))
  );

  const counts = { log: 0, info: 0, warn: 0, error: 0, debug: 0 };
  entries.forEach((e) => counts[e.level]++);

  const exportLogs = useCallback(() => {
    const text = entries
      .map(
        (e) => `[${new Date(e.timestamp).toISOString()}] [${e.level.toUpperCase()}] ${e.message}`
      )
      .join('\n');
    navigator.clipboard?.writeText(text);
  }, [entries]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-studio-border px-2 py-1">
        <Terminal className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-xs font-semibold text-studio-text">Console</span>
        <div className="flex-1" />
        {/* Level badges */}
        {(Object.entries(counts) as [LogLevel, number][])
          .filter(([, c]) => c > 0)
          .map(([level, count]) => (
            <button
              key={level}
              onClick={() => {
                const s = new Set(levelFilter);
                s.has(level) ? s.delete(level) : s.add(level);
                setLevelFilter(s);
              }}
              className={`rounded px-1 text-[9px] font-mono ${levelFilter.has(level) ? LEVEL_STYLES[level].color : 'text-studio-muted/30'}`}
            >
              {count}
            </button>
          ))}
        <button
          onClick={() => setShowFilter(!showFilter)}
          className="text-studio-muted hover:text-studio-text"
        >
          <Filter className="h-3 w-3" />
        </button>
        <button onClick={exportLogs} className="text-studio-muted hover:text-studio-text">
          <Copy className="h-3 w-3" />
        </button>
        <button onClick={() => setEntries([])} className="text-studio-muted hover:text-red-400">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {showFilter && (
        <div className="flex items-center gap-1 border-b border-studio-border px-2 py-1">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter..."
            className="flex-1 bg-transparent text-xs text-studio-text outline-none"
          />
          <div className="flex gap-0.5">
            {(['log', 'info', 'warn', 'error', 'debug'] as LogLevel[]).map((l) => (
              <button
                key={l}
                onClick={() => {
                  const s = new Set(levelFilter);
                  s.has(l) ? s.delete(l) : s.add(l);
                  setLevelFilter(s);
                }}
                className={`rounded px-1 py-0.5 text-[8px] ${levelFilter.has(l) ? LEVEL_STYLES[l].color + ' bg-studio-panel' : 'text-studio-muted/30'}`}
              >
                {LEVEL_STYLES[l].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto font-mono text-[11px]">
        {filtered.length === 0 && (
          <div className="p-4 text-center text-studio-muted text-xs">No log entries</div>
        )}
        {filtered.map((entry) => (
          <div
            key={entry.id}
            className={`flex items-start gap-1.5 px-2 py-0.5 border-b border-studio-border/20 ${LEVEL_STYLES[entry.level].bg}`}
          >
            <span className="shrink-0 text-studio-muted/40 text-[9px] tabular-nums">
              {formatTime(entry.timestamp)}
            </span>
            <span className={`shrink-0 text-[9px] font-bold ${LEVEL_STYLES[entry.level].color}`}>
              {LEVEL_STYLES[entry.level].label}
            </span>
            <span className={`flex-1 break-all ${LEVEL_STYLES[entry.level].color}`}>
              {entry.message}
            </span>
            {entry.count > 1 && (
              <span className="shrink-0 rounded-full bg-studio-accent/20 px-1.5 text-[9px] text-studio-accent">
                {entry.count}
              </span>
            )}
            {entry.source && (
              <span className="shrink-0 text-[8px] text-studio-muted/40">{entry.source}</span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-center border-t border-studio-border px-2 py-1">
        <span className="text-emerald-400 text-xs mr-1">&gt;</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleExec()}
          placeholder="Execute expression..."
          className="flex-1 bg-transparent text-xs text-studio-text outline-none font-mono"
        />
      </div>
    </div>
  );
}
