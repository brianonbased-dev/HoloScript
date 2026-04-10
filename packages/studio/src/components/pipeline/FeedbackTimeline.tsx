'use client';

/**
 * FeedbackTimeline — Vertical timeline showing feedback signals flowing
 * between pipeline layers.
 */

import React, { useRef, useEffect } from 'react';
import type { FeedbackSignal, FeedbackSignalType } from '@/lib/recursive/types';

interface FeedbackTimelineProps {
  signals: FeedbackSignal[];
  maxVisible?: number;
}

const SIGNAL_ICONS: Record<FeedbackSignalType, string> = {
  quality_trend: '\uD83D\uDCC8', // chart
  focus_effectiveness: '\uD83C\uDFAF', // target
  failure_pattern: '\u26A0\uFE0F', // warning
  cost_efficiency: '\uD83D\uDCB2', // dollar
  skill_gap: '\uD83E\uDDE9', // puzzle
  plateau_detected: '\u23F8\uFE0F', // pause
};

const SIGNAL_COLORS: Record<FeedbackSignalType, string> = {
  quality_trend: 'border-green-500',
  focus_effectiveness: 'border-blue-500',
  failure_pattern: 'border-red-500',
  cost_efficiency: 'border-amber-500',
  skill_gap: 'border-purple-500',
  plateau_detected: 'border-yellow-500',
};

function formatTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return timestamp;
  }
}

function formatSignalData(signal: FeedbackSignal): string {
  const data = signal.data;
  switch (signal.signalType) {
    case 'quality_trend': {
      const delta = data.delta as number;
      return `Quality ${delta >= 0 ? '+' : ''}${delta?.toFixed(4) ?? '?'}`;
    }
    case 'focus_effectiveness':
      return `Focus: ${data.focus} (delta: ${(data.delta as number)?.toFixed(4) ?? '?'})`;
    case 'plateau_detected':
      return `Plateau detected (delta: ${(data.delta as number)?.toFixed(4) ?? '<0.01'})`;
    case 'cost_efficiency':
      return `$${(data.costPerPoint as number)?.toFixed(2) ?? '?'}/point`;
    case 'failure_pattern':
      return `Failure in cycle ${data.cycleId ?? '?'}`;
    case 'skill_gap':
      return `Skill gap: ${data.area ?? 'unspecified'}`;
    default:
      return JSON.stringify(data).slice(0, 80);
  }
}

export function FeedbackTimeline({ signals, maxVisible = 50 }: FeedbackTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const visibleSignals = signals.slice(-maxVisible);

  // Auto-scroll to latest
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [signals.length]);

  if (visibleSignals.length === 0) {
    return (
      <div className="text-center text-studio-muted text-sm py-6">
        No feedback signals yet. Start the pipeline to see data flow between layers.
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
      {visibleSignals.map((signal, i) => (
        <div
          key={`${signal.timestamp}-${i}`}
          className={`flex items-start gap-2 p-2 rounded border-l-2 bg-studio-bg ${SIGNAL_COLORS[signal.signalType]}`}
        >
          <span className="text-sm flex-shrink-0">{SIGNAL_ICONS[signal.signalType]}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-studio-muted">L{signal.sourceLayer}</span>
              <span className="text-xs text-studio-muted">{formatTime(signal.timestamp)}</span>
            </div>
            <div className="text-xs text-studio-text truncate">{formatSignalData(signal)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
