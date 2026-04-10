import React, { useState, useEffect, useRef } from 'react';
import { LogEntry, LogLevel } from './types';
import { LEVEL_COLORS } from './hooks';

export interface ErrorLogViewerProps {
  logs: LogEntry[];
  filter: LogLevel | 'all';
  onFilterChange: (filter: LogLevel | 'all') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClear: () => void;
  counts: Record<LogLevel, number>;
}

export function ErrorLogViewer({
  logs,
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  onClear,
  counts,
}: ErrorLogViewerProps) {
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  }, [logs, autoScroll]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return (
      d.toLocaleTimeString('en-US', { hour12: false }) +
      '.' +
      String(d.getMilliseconds()).padStart(3, '0')
    );
  };

  return (
    <div className="space-y-2">
      {/* Controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {(['all', 'error', 'warning', 'info', 'debug'] as const).map((level) => (
            <button
              key={level}
              onClick={() => onFilterChange(level)}
              className={`px-1.5 py-0.5 rounded text-[10px] transition ${
                filter === level
                  ? level === 'all'
                    ? 'bg-studio-accent/20 text-studio-accent'
                    : LEVEL_COLORS[level as LogLevel]
                  : 'bg-studio-panel/40 text-studio-muted hover:text-studio-text'
              }`}
            >
              {level === 'all' ? 'All' : `${level} (${counts[level as LogLevel]})`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-1 text-[10px] text-studio-muted">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="h-3 w-3"
            />
            Auto-scroll
          </label>
          <button
            onClick={onClear}
            className="px-2 py-0.5 text-[10px] bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search logs..."
        className="w-full px-2 py-1 text-[11px] bg-studio-panel/60 border border-studio-border/50 rounded text-studio-text placeholder:text-studio-muted/50 focus:outline-none focus:ring-1 focus:ring-studio-accent/40"
      />

      {/* Log stream */}
      <div
        ref={logContainerRef}
        className="max-h-[250px] overflow-y-auto space-y-0.5 font-mono text-[10px]"
      >
        {logs.length === 0 && (
          <div className="text-center text-studio-muted py-4">
            No log entries match current filters.
          </div>
        )}
        {logs.map((entry) => (
          <div
            key={entry.id}
            className={`flex flex-col rounded px-2 py-0.5 cursor-pointer transition hover:brightness-110 ${LEVEL_COLORS[entry.level]}`}
            onClick={() => setExpandedLog(expandedLog === entry.id ? null : entry.id)}
          >
            <div className="flex items-center gap-2">
              <span className="text-[9px] opacity-60 shrink-0 w-[80px]">
                {formatTime(entry.timestamp)}
              </span>
              <span className="text-[9px] opacity-70 shrink-0 w-[70px] truncate">
                [{entry.source}]
              </span>
              <span className="truncate flex-1">{entry.message}</span>
              {entry.file && (
                <span className="text-[8px] opacity-50 shrink-0">
                  {entry.file}
                  {entry.line ? `:${entry.line}` : ''}
                </span>
              )}
            </div>
            {expandedLog === entry.id && entry.details && (
              <div className="mt-1 ml-[152px] text-[9px] opacity-70 whitespace-pre-wrap">
                {entry.details}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
