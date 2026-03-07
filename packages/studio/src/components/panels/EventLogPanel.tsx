'use client';
/**
 * EventLogPanel — Real-time event log for debugging panel communication
 *
 * Shows chronological log of StudioBus events with timestamps and payloads.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useStudioBus } from '../../hooks/useStudioBus';

export function EventLogPanel() {
  const { on, getHistory } = useStudioBus();
  const [entries, setEntries] = useState<{ ts: number; channel: string; summary: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const allChannels = [
      'terrain:changed', 'lighting:changed', 'camera:moved', 'lod:updated',
      'viewport:entity-added', 'viewport:entity-removed', 'viewport:invalidate',
      'compile:done', 'state:changed', 'physics:stepped', 'viewport:camera-sync',
    ];
    const unsubs = allChannels.map(ch =>
      on(ch, (data) => {
        const summary = typeof data === 'object' && data ? Object.keys(data as object).join(', ') : String(data ?? '');
        setEntries(prev => [...prev.slice(-200), { ts: Date.now(), channel: ch, summary }]);
      })
    );
    // Seed from history
    const hist = getHistory();
    if (hist.length) {
      setEntries(hist.map(h => ({
        ts: h.timestamp,
        channel: h.channel,
        summary: typeof h.data === 'object' && h.data ? Object.keys(h.data as object).join(', ') : '',
      })));
    }
    return () => unsubs.forEach(u => u());
  }, [on, getHistory]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [entries]);

  return (
    <div className="p-3 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">📋 Event Log</h3>
        <button onClick={() => setEntries([])} className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400">Clear</button>
      </div>

      <div ref={scrollRef} className="space-y-0.5 max-h-[300px] overflow-y-auto font-mono text-[9px]">
        {entries.length === 0 && <p className="text-studio-muted text-center py-6">Waiting for events...</p>}
        {entries.map((e, i) => (
          <div key={i} className="flex gap-1.5 px-1 py-0.5 bg-studio-panel/15 rounded">
            <span className="text-studio-muted flex-shrink-0">
              {new Date(e.ts).toLocaleTimeString('en', { hour12: false })}
            </span>
            <span className="text-studio-accent flex-shrink-0">{e.channel}</span>
            {e.summary && <span className="text-studio-muted truncate">({e.summary})</span>}
          </div>
        ))}
      </div>

      <div className="text-[9px] text-studio-muted text-center">{entries.length} log entries</div>
    </div>
  );
}
