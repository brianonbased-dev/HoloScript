'use client';
/**
 * BusPanel — Unified event bus monitor + log
 *
 * Merges BusMonitorPanel and EventLogPanel into a single panel
 * with two views: Stream (live filtered events) and Log (chronological).
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
  'character:changed': '#f472b6',
  'template:applied': '#14b8a6',
  'viewport:camera-sync': '#60a5fa',
};

interface BusEvent {
  channel: string;
  data: unknown;
  timestamp: number;
}

type ViewMode = 'stream' | 'log';

export function BusPanel() {
  const { on, getHistory } = useStudioBus();
  const [events, setEvents] = useState<BusEvent[]>([]);
  const [filter, setFilter] = useState('');
  const [paused, setPaused] = useState(false);
  const [view, setView] = useState<ViewMode>('stream');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to all channels
  useEffect(() => {
    if (paused) return;
    const channels = Object.keys(CHANNEL_COLORS);
    const unsubs = channels.map(ch =>
      on(ch, (data) => {
        setEvents(prev => [...prev, { channel: ch, data, timestamp: Date.now() }].slice(-100));
      })
    );
    const hist = getHistory();
    if (hist.length > 0 && events.length === 0) setEvents(hist);
    return () => unsubs.forEach(u => u());
  }, [on, getHistory, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [events]);

  const filtered = filter ? events.filter(e => e.channel.includes(filter)) : events;

  const channelCounts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.channel] = (acc[e.channel] || 0) + 1;
    return acc;
  }, {});

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="p-3 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">📡 Event Bus</h3>
        <div className="flex gap-1">
          {/* View toggle */}
          <button onClick={() => setView('stream')}
            className={`px-1.5 py-0.5 rounded text-[10px] ${view === 'stream' ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted'}`}>
            Stream
          </button>
          <button onClick={() => setView('log')}
            className={`px-1.5 py-0.5 rounded text-[10px] ${view === 'log' ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted'}`}>
            Log
          </button>
          <div className="w-px h-3 bg-studio-border/30 mx-0.5 self-center" />
          <button onClick={() => setPaused(!paused)}
            className={`px-1.5 py-0.5 rounded text-[10px] ${paused ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            {paused ? '⏸' : '⏵'}
          </button>
          <button onClick={() => setEvents([])} className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400">✕</button>
        </div>
      </div>

      {/* Filter */}
      <input type="text" placeholder="Filter channels..." value={filter} onChange={e => setFilter(e.target.value)}
        className="w-full px-2 py-1 bg-studio-panel/40 rounded text-[10px] text-studio-text placeholder-studio-muted border border-studio-border/20 focus:border-studio-accent/40 outline-none" />

      {/* Stream view: channel badges + filtered events */}
      {view === 'stream' && (
        <>
          <div className="flex gap-1 flex-wrap">
            {Object.entries(channelCounts).map(([ch, count]) => (
              <button key={ch} onClick={() => setFilter(ch === filter ? '' : ch)}
                className={`px-1.5 py-0.5 rounded text-[9px] transition ${filter === ch ? 'ring-1 ring-white/30' : ''}`}
                style={{ backgroundColor: `${CHANNEL_COLORS[ch] || '#666'}33`, color: CHANNEL_COLORS[ch] || '#999' }}>
                {ch.split(':')[1]} ({count})
              </button>
            ))}
          </div>
          <div ref={scrollRef} className="space-y-0.5 max-h-[200px] overflow-y-auto font-mono">
            {filtered.length === 0 && <p className="text-studio-muted text-center py-4">No events. Interact with panels.</p>}
            {filtered.map((e, i) => (
              <div key={i} className="flex items-center gap-1.5 px-1.5 py-0.5 bg-studio-panel/20 rounded text-[9px]">
                <span className="text-studio-muted w-14 flex-shrink-0">{formatTime(e.timestamp)}</span>
                <span className="flex-shrink-0 px-1 rounded" style={{ backgroundColor: `${CHANNEL_COLORS[e.channel] || '#666'}22`, color: CHANNEL_COLORS[e.channel] || '#999' }}>
                  {e.channel}
                </span>
                <span className="text-studio-muted truncate">
                  {typeof e.data === 'object' ? JSON.stringify(e.data).slice(0, 50) : String(e.data)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Log view: compact chronological list */}
      {view === 'log' && (
        <div ref={scrollRef} className="space-y-0.5 max-h-[280px] overflow-y-auto font-mono text-[9px]">
          {filtered.length === 0 && <p className="text-studio-muted text-center py-6">Waiting for events...</p>}
          {filtered.map((e, i) => (
            <div key={i} className="flex gap-1.5 px-1 py-0.5 bg-studio-panel/15 rounded">
              <span className="text-studio-muted flex-shrink-0">{formatTime(e.timestamp)}</span>
              <span className="text-studio-accent flex-shrink-0">{e.channel}</span>
              <span className="text-studio-muted truncate">
                {typeof e.data === 'object' && e.data ? `(${Object.keys(e.data as object).join(', ')})` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="text-[9px] text-studio-muted text-center">
        {events.length} events · {Object.keys(channelCounts).length} channels · {view}
      </div>
    </div>
  );
}
