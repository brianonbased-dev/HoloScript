// TARGET: packages/studio/src/components/ai/CalibrationUncertaintyIndicator.tsx
'use client';

/**
 * CalibrationUncertaintyIndicator -- Displays AI agent confidence levels
 * with color-coded indicators, progress bars, and calibration metrics.
 *
 * Features:
 *  - Multi-level confidence display (0-100%) with semantic labels
 *  - Color gradient from red (low) through amber (medium) to green (high)
 *  - Animated progress bar with glow effect
 *  - Calibration score showing how well-calibrated the agent's predictions are
 *  - Historical confidence trend mini-chart
 *  - Breakdown by domain (reasoning, factual, creative, code)
 *  - Tooltip with detailed uncertainty decomposition
 */

import { useState, useMemo } from 'react';
import {
  Gauge,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Shield,
  ChevronDown,
  Info,
} from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export interface ConfidenceEntry {
  domain: string;
  confidence: number; // 0-1
  samples: number;
  trend: 'up' | 'down' | 'stable';
}

export interface CalibrationData {
  /** Overall confidence 0-1 */
  overall: number;
  /** How well-calibrated: 0 = random, 1 = perfectly calibrated */
  calibrationScore: number;
  /** Per-domain breakdown */
  domains: ConfidenceEntry[];
  /** Recent confidence history (last N readings) */
  history: number[];
  /** Agent identifier */
  agentId?: string;
  /** Timestamp of last update */
  lastUpdated?: string;
}

// =============================================================================
// Defaults & Constants
// =============================================================================

const DEFAULT_DATA: CalibrationData = {
  overall: 0.78,
  calibrationScore: 0.85,
  domains: [
    { domain: 'Reasoning', confidence: 0.82, samples: 1240, trend: 'up' },
    { domain: 'Factual', confidence: 0.91, samples: 3400, trend: 'stable' },
    { domain: 'Creative', confidence: 0.65, samples: 890, trend: 'down' },
    { domain: 'Code', confidence: 0.88, samples: 2100, trend: 'up' },
    { domain: 'Spatial', confidence: 0.72, samples: 560, trend: 'stable' },
  ],
  history: [0.71, 0.73, 0.74, 0.72, 0.75, 0.77, 0.76, 0.78, 0.79, 0.78, 0.80, 0.78],
  agentId: 'brittney-v3',
  lastUpdated: new Date().toISOString(),
};

function getConfidenceColor(value: number): string {
  if (value >= 0.85) return '#22c55e'; // green
  if (value >= 0.70) return '#84cc16'; // lime
  if (value >= 0.55) return '#f59e0b'; // amber
  if (value >= 0.40) return '#f97316'; // orange
  return '#ef4444'; // red
}

function getConfidenceLevel(value: number): string {
  if (value >= 0.90) return 'Very High';
  if (value >= 0.75) return 'High';
  if (value >= 0.60) return 'Moderate';
  if (value >= 0.40) return 'Low';
  return 'Very Low';
}

function getConfidenceTailwindBg(value: number): string {
  if (value >= 0.85) return 'bg-green-900/30';
  if (value >= 0.70) return 'bg-lime-900/30';
  if (value >= 0.55) return 'bg-amber-900/30';
  if (value >= 0.40) return 'bg-orange-900/30';
  return 'bg-red-900/30';
}

function getCalibrationLabel(score: number): string {
  if (score >= 0.90) return 'Excellent';
  if (score >= 0.75) return 'Good';
  if (score >= 0.60) return 'Fair';
  if (score >= 0.40) return 'Poor';
  return 'Unreliable';
}

const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
  switch (trend) {
    case 'up':
      return <TrendingUp className="h-3 w-3 text-green-400" />;
    case 'down':
      return <TrendingDown className="h-3 w-3 text-red-400" />;
    case 'stable':
      return <Minus className="h-3 w-3 text-studio-muted" />;
  }
};

// =============================================================================
// Mini Sparkline Chart
// =============================================================================

function Sparkline({ data, width = 120, height = 24 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 0.01;
  const padding = 2;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((v - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  });

  const lastValue = data[data.length - 1];
  const color = getConfidenceColor(lastValue);

  return (
    <svg width={width} height={height} className="block">
      {/* Fill area */}
      <polygon
        points={`${padding},${height - padding} ${points.join(' ')} ${width - padding},${height - padding}`}
        fill={color}
        fillOpacity={0.1}
      />
      {/* Line */}
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      {data.length > 0 && (
        <circle
          cx={width - padding}
          cy={height - padding - ((lastValue - min) / range) * (height - 2 * padding)}
          r={2.5}
          fill={color}
        />
      )}
    </svg>
  );
}

// =============================================================================
// Circular Gauge
// =============================================================================

function CircularGauge({ value, size = 80, strokeWidth = 6 }: { value: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value);
  const color = getConfidenceColor(value);
  const center = size / 2;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        {/* Value ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
          style={{
            filter: `drop-shadow(0 0 4px ${color}50)`,
          }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-studio-text" style={{ color }}>
          {Math.round(value * 100)}
        </span>
        <span className="text-[7px] text-studio-muted uppercase tracking-wider">
          {getConfidenceLevel(value)}
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

interface CalibrationUncertaintyIndicatorProps {
  data?: CalibrationData;
  compact?: boolean;
}

export function CalibrationUncertaintyIndicator({
  data = DEFAULT_DATA,
  compact = false,
}: CalibrationUncertaintyIndicatorProps) {
  const [showDetails, setShowDetails] = useState(!compact);
  const [hoveredDomain, setHoveredDomain] = useState<string | null>(null);

  const overallColor = useMemo(() => getConfidenceColor(data.overall), [data.overall]);
  const calibColor = useMemo(() => getConfidenceColor(data.calibrationScore), [data.calibrationScore]);

  // Sort domains by confidence descending
  const sortedDomains = useMemo(
    () => [...data.domains].sort((a, b) => b.confidence - a.confidence),
    [data.domains]
  );

  const totalSamples = useMemo(
    () => data.domains.reduce((sum, d) => sum + d.samples, 0),
    [data.domains]
  );

  // ── Compact mode ──
  if (compact) {
    return (
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`inline-flex items-center gap-2 rounded-lg border border-studio-border px-2.5 py-1.5 transition hover:bg-studio-panel ${getConfidenceTailwindBg(data.overall)}`}
        title={`Confidence: ${Math.round(data.overall * 100)}% (${getConfidenceLevel(data.overall)})`}
      >
        <Gauge className="h-3.5 w-3.5" style={{ color: overallColor }} />
        <span className="text-[11px] font-mono font-bold" style={{ color: overallColor }}>
          {Math.round(data.overall * 100)}%
        </span>
        {data.calibrationScore < 0.6 && (
          <AlertTriangle className="h-3 w-3 text-amber-400" />
        )}
      </button>
    );
  }

  // ── Full mode ──
  return (
    <div className="flex flex-col rounded-lg border border-studio-border bg-studio-panel overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
        <Gauge className="h-4 w-4" style={{ color: overallColor }} />
        <span className="text-[12px] font-semibold text-studio-text">Confidence & Calibration</span>
        {data.agentId && (
          <span className="text-[9px] text-studio-muted ml-auto font-mono">{data.agentId}</span>
        )}
      </div>

      {/* Main gauge + sparkline */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-studio-border">
        <CircularGauge value={data.overall} />

        <div className="flex-1 flex flex-col gap-2">
          {/* Calibration score */}
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5" style={{ color: calibColor }} />
            <span className="text-[10px] text-studio-muted">Calibration:</span>
            <span className="text-[11px] font-bold font-mono" style={{ color: calibColor }}>
              {getCalibrationLabel(data.calibrationScore)} ({Math.round(data.calibrationScore * 100)}%)
            </span>
          </div>

          {/* Sparkline */}
          {data.history.length > 0 && (
            <div>
              <span className="text-[8px] text-studio-muted uppercase tracking-wider">Recent trend</span>
              <Sparkline data={data.history} width={140} height={28} />
            </div>
          )}

          {/* Sample count */}
          <span className="text-[9px] text-studio-muted">
            {totalSamples.toLocaleString()} total samples
          </span>
        </div>
      </div>

      {/* Domain breakdown */}
      <div className="border-b border-studio-border">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex w-full items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-studio-muted hover:text-studio-text"
        >
          Domain Breakdown
          <ChevronDown className={`h-3 w-3 transition ${showDetails ? 'rotate-180' : ''}`} />
        </button>

        {showDetails && (
          <div className="flex flex-col gap-1 px-3 pb-3">
            {sortedDomains.map((entry) => {
              const color = getConfidenceColor(entry.confidence);
              const pct = Math.round(entry.confidence * 100);
              const isHovered = hoveredDomain === entry.domain;

              return (
                <div
                  key={entry.domain}
                  className={`rounded-lg px-2.5 py-1.5 transition cursor-default ${
                    isHovered ? 'bg-studio-panel-hover' : ''
                  }`}
                  onMouseEnter={() => setHoveredDomain(entry.domain)}
                  onMouseLeave={() => setHoveredDomain(null)}
                >
                  {/* Label row */}
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-semibold text-studio-text flex-1">
                      {entry.domain}
                    </span>
                    <TrendIcon trend={entry.trend} />
                    <span className="text-[10px] font-mono font-bold" style={{ color }}>
                      {pct}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1.5 w-full rounded-full bg-studio-bg">
                    <div
                      className="h-1.5 rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: color,
                        boxShadow: isHovered ? `0 0 8px ${color}40` : undefined,
                      }}
                    />
                  </div>

                  {/* Samples */}
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[8px] text-studio-muted">
                      {entry.samples.toLocaleString()} samples
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer - warnings */}
      {data.calibrationScore < 0.6 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-950/20">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
          <span className="text-[9px] text-amber-300">
            Calibration is below threshold. Agent confidence scores may not accurately reflect true
            probability of correctness.
          </span>
        </div>
      )}

      {data.overall < 0.5 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-950/20">
          <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
          <span className="text-[9px] text-red-300">
            Overall confidence is critically low. Consider reviewing agent training data or switching models.
          </span>
        </div>
      )}

      {/* Tooltip info */}
      <div className="flex items-center gap-1 px-3 py-1.5 text-[8px] text-studio-muted/60">
        <Info className="h-2.5 w-2.5" />
        Confidence measures predicted accuracy. Calibration measures prediction reliability.
      </div>
    </div>
  );
}
