'use client';

/**
 * AgentEventMonitorPanel - Live agent communication debugger
 *
 * Displays agent events from AgentEventBus with filtering and replay.
 * Optimized with virtual scrolling for handling 1000+ events smoothly.
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Activity, X, Pause, Play, RotateCcw, Filter } from 'lucide-react';
import { useOrchestrationStore } from '@/lib/orchestrationStore';
import {
  trackEventMonitorOpened,
  trackEventMonitorFiltered,
  trackEventMonitorCleared,
  trackPanelClosed,
  recordPanelOpenTime,
  getPanelDuration,
} from '@/lib/analytics/orchestration';

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 });
}

interface AgentEventMonitorPanelProps {
  onClose: () => void;
}

export function AgentEventMonitorPanel({ onClose }: AgentEventMonitorPanelProps) {
  const events = useOrchestrationStore((s) => s.events);
  const eventFilter = useOrchestrationStore((s) => s.eventFilter);
  const _setEventFilter = useOrchestrationStore((s) => s.setEventFilter);
  const clearEvents = useOrchestrationStore((s) => s.clearEvents);

  const [paused, setPaused] = useState(false);
  const [topicFilter, setTopicFilter] = useState('');

  // Track panel open/close
  useEffect(() => {
    recordPanelOpenTime('event_monitor');
    trackEventMonitorOpened(events.length);

    return () => {
      const duration = getPanelDuration('event_monitor');
      trackPanelClosed('event_monitor', duration);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track filter changes
  useEffect(() => {
    if (topicFilter) {
      trackEventMonitorFiltered('topic', topicFilter);
    }
  }, [topicFilter]);

  const filteredEvents = useMemo(() => {
    let filtered = events;

    if (eventFilter.topic) {
      filtered = filtered.filter((e) => e.topic.includes(eventFilter.topic!));
    }

    if (eventFilter.senderId) {
      filtered = filtered.filter((e) => e.senderId.includes(eventFilter.senderId!));
    }

    if (topicFilter) {
      filtered = filtered.filter((e) => e.topic.toLowerCase().includes(topicFilter.toLowerCase()));
    }

    return filtered.reverse(); // Show newest first, virtualizer handles large lists
  }, [events, eventFilter, topicFilter]);

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: filteredEvents.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50, // Estimated row height
    overscan: 10, // Render 10 extra items above/below viewport
  });

  return (
    <div className="flex h-full flex-col bg-studio-panel">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Activity className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Agent Event Monitor</span>
        <span className="text-[9px] text-studio-muted">({filteredEvents.length} events)</span>

        <button
          onClick={() => setPaused(!paused)}
          className="ml-auto rounded bg-studio-surface px-2 py-1 text-[9px] hover:bg-studio-border"
        >
          {paused ? <Play className="inline h-3 w-3" /> : <Pause className="inline h-3 w-3" />}
        </button>
        <button
          onClick={() => {
            const eventCount = events.length;
            clearEvents();
            trackEventMonitorCleared(eventCount);
          }}
          className="rounded bg-studio-surface px-2 py-1 text-[9px] hover:bg-studio-border"
        >
          <RotateCcw className="inline h-3 w-3 mr-1" />
          Clear
        </button>
        <button onClick={onClose} className="rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Filter */}
      <div className="shrink-0 px-3 py-2 border-b border-studio-border">
        <div className="flex items-center gap-2 bg-studio-surface rounded px-2 py-1.5">
          <Filter className="h-3 w-3 text-studio-muted" />
          <input
            type="text"
            placeholder="Filter by topic..."
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            className="flex-1 bg-transparent text-[10px] text-studio-text outline-none placeholder-studio-muted"
          />
        </div>
      </div>

      {/* Event List (Virtualized) */}
      <div ref={parentRef} className="flex-1 overflow-y-auto p-3">
        {filteredEvents.length === 0 && (
          <div className="text-center text-studio-muted text-[10px] py-6">
            No events {paused ? '(paused)' : ''}
          </div>
        )}

        {filteredEvents.length > 0 && (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const event = filteredEvents[virtualRow.index];
              return (
                <div
                  key={event.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="flex items-start gap-2 text-[10px] border-b border-studio-border/30 pb-1 mb-1"
                >
                  <span className="text-studio-muted font-mono text-[9px] w-20 shrink-0">
                    {formatTime(event.timestamp)}
                  </span>
                  <span className="font-mono text-studio-accent font-semibold min-w-[80px] shrink-0">
                    {event.topic}
                  </span>
                  <span className="text-studio-muted text-[9px]">
                    {event.senderId} → {event.receivedBy.join(', ') || 'none'}
                  </span>
                  <pre className="text-[8px] text-studio-text/70 flex-1 overflow-x-auto">
                    {JSON.stringify(event.payload).slice(0, 100)}...
                  </pre>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
