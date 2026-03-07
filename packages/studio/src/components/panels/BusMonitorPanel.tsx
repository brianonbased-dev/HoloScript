'use client';
/**
 * BusMonitorPanel — Real-time Studio event bus monitor
 *
 * Shows live event stream from useStudioBus with channel filtering,
 * event counts, and payload inspection.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useStudioBus } from '../../hooks/useStudioBus';

const CHANNEL_COLORS: Record<string, string> = {
  'terrain:changed': '#22c55e',
  'lighting:changed': '#eab308',
  'camera:moved': '#3b82f6',
  'lod:updated': '#a855f7',
  'viewport:entity-added': '#06b6d4',
  'viewport:entity-removed': '#ef4444',
  'viewport:invalidate': '#f97316',
  'compile:done': '#10b981',
  'state:changed': '#8b5cf6',
  'physics:stepped': '#ec4899',
};

interface BusEvent {
  channel: string;
  data: unknown;
  timestamp: number;
}

export function BusMonitorPanel() {
  const { on, getHistory } = useStudioBus();
  const [events, setEvents] = useState<BusEvent[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to all known channels
  useEffect(() => {
    if (paused) return;
    const channels = Object.keys(CHANNEL_COLORS);
    const unsubs = channels.map(ch =>
      on(ch, (data) => {
        setEvents(prev => {
          const next = [...prev, { channel: ch, data, timestamp: Date.now() }];
          return next.slice(-100); // Keep last 100
        });
      })
    );
    // Load history on mount
    const hist = getHistory();
    if (hist.length > 0) setEvents(hist);
    return () => unsubs.forEach(u => u());
  }, [on, getHistory, paused]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [events]);

  const filtered = filter
    ? events.filter(e => e.channel.includes(filter))
    : events;

  const channelCounts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.channel] = (acc[e.channel] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-3 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">📡 Event Bus</h3>
        <div className="flex gap-1">
          <button onClick={() => setPaused(!paused)}
            className={`px-1.5 py-0.5 rounded text-[10px] ${paused ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            {paused ? '⏸ Paused' : '⏵ Live'}
          </button>
          <button onClick={() => setEvents([])}
            className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400">Clear</button>
        </div>
      </div>

      {/* Filter */}
      <input
        type="text"
        placeholder="Filter channels..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="w-full px-2 py-1 bg-studio-panel/40 rounded text-[10px] text-studio-text placeholder-studio-muted border border-studio-border/20 focus:border-studio-accent/40 outline-none"
      />

      {/* Channel counts */}
      <div className="flex gap-1 flex-wrap">
        {Object.entries(channelCounts).map(([ch, count]) => (
          <button key={ch} onClick={() => setFilter(ch === filter ? '' : ch)}
            className={`px-1.5 py-0.5 rounded text-[9px] transition ${filter === ch ? 'ring-1 ring-white/30' : ''}`}
            style={{ backgroundColor: `${CHANNEL_COLORS[ch] || '#666'}33`, color: CHANNEL_COLORS[ch] || '#999' }}>
            {ch.split(':')[1]} ({count})
          </button>
        ))}
      </div>

      {/* Event stream */}
      <div ref={scrollRef} className="space-y-0.5 max-h-[200px] overflow-y-auto font-mono">
        {filtered.length === 0 && <p className="text-studio-muted text-center py-4">No events yet. Interact with panels to see events.</p>}
        {filtered.map((e, i) => (
          <div key={i} className="flex items-center gap-1.5 px-1.5 py-0.5 bg-studio-panel/20 rounded text-[9px]">
            <span className="text-studio-muted w-14 flex-shrink-0">
              {new Date(e.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="flex-shrink-0 px-1 rounded" style={{ backgroundColor: `${CHANNEL_COLORS[e.channel] || '#666'}22`, color: CHANNEL_COLORS[e.channel] || '#999' }}>
              {e.channel}
            </span>
            <span className="text-studio-muted truncate">
              {typeof e.data === 'object' ? JSON.stringify(e.data).slice(0, 60) : String(e.data)}
            </span>
          </div>
        ))}
      </div>

      <div className="text-[9px] text-studio-muted text-center">
        {events.length} events · {Object.keys(channelCounts).length} channels
      </div>
    </div>
  );
}
