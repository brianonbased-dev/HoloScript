'use client';

/**
 * Paper 26 — Live Simulation Dashboard
 * sim.holoscript.studio/sim/paper26
 *
 * Public-facing production page for the 15-day multi-agent CogVM simulation.
 * Connects to /sim/paper26/api/stream for live SSE updates.
 */

import { useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types (duplicated from simStore to avoid server import in client component)
// ─────────────────────────────────────────────────────────────────────────────

interface PopulationMetrics {
  tick:             number;
  medianGamma:      number;
  p90Gamma:         number;
  meanTotalLoss:    number;
  stdTotalLoss:     number;
  meanDiversity:    number;
  lifecycleDistrib: Record<string, number>;
}

interface SimReceipt {
  tick:       number;
  hash:       string;
  signature:  string;
  issuedAt:   string;
  baseBlock?: string;
  baseTxHash?:string;
}

interface SimState {
  label:          string;
  agents:         number;
  targetTicks:    number;
  currentTick:    number;
  running:        boolean;
  startedAt:      string | null;
  lastPushAt:     string | null;
  elapsedMs:      number;
  population:     PopulationMetrics[];
  latestMetrics:  PopulationMetrics | null;
  receipts:       SimReceipt[];
  config: { innerFreq: number; latentDim: number; sycophancyFrac: number } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini SVG line chart
// ─────────────────────────────────────────────────────────────────────────────

function LineChart({ data, color, label, formatY = (v: number) => v.toFixed(3) }: {
  data: number[];
  color: string;
  label: string;
  formatY?: (v: number) => string;
}) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-24 text-mesh-dim text-xs">
        waiting for data…
      </div>
    );
  }

  const W = 400; const H = 80; const PAD = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - 2 * PAD);
    const y = H - PAD - ((v - min) / range) * (H - 2 * PAD);
    return `${x},${y}`;
  }).join(' ');

  const latest = data[data.length - 1]!;

  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-mesh-dim text-xs">{label}</span>
        <span className="font-bold text-sm" style={{ color }}>{formatY(latest)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 80 }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#2a2a4a" strokeWidth="1" />
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle bar
// ─────────────────────────────────────────────────────────────────────────────

const LIFECYCLE_COLORS: Record<string, string> = {
  init:         '#475569',
  active:       '#3b82f6',
  steady_state: '#a855f7',
  stable:       '#22c55e',
  edge_case:    '#eab308',
  shutdown:     '#ef4444',
};

function LifecycleBar({ distrib }: { distrib: Record<string, number> }) {
  const entries = Object.entries(distrib).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-1">
      {entries.map(([state, frac]) => (
        <div key={state} className="flex items-center gap-2 text-xs">
          <span className="text-mesh-dim w-24 shrink-0">{state}</span>
          <div className="flex-1 bg-mesh-card rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(frac * 100).toFixed(1)}%`, backgroundColor: LIFECYCLE_COLORS[state] ?? '#475569' }}
            />
          </div>
          <span className="text-mesh-muted w-10 text-right">{(frac * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark table (static — live proof context)
// ─────────────────────────────────────────────────────────────────────────────

function BenchmarkTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-mesh-dim border-b border-mesh-border">
            <th className="text-left py-2 pr-4 font-normal">Corpus</th>
            <th className="text-right py-2 px-3 font-normal">HoloGraph µs</th>
            <th className="text-right py-2 px-3 font-normal">Embedding µs</th>
            <th className="text-right py-2 px-3 font-normal">Speedup</th>
            <th className="text-right py-2 px-3 font-normal">HG recall</th>
            <th className="text-right py-2 px-3 font-normal">Emb recall</th>
          </tr>
        </thead>
        <tbody className="text-mesh-text">
          {[
            ['50 sym / 10 events',   '0.79', '287.7',  '364×',  '100%', '12.5%'],
            ['500 sym / 50 events',  '3.63', '2,114',  '583×',  '100%', '2.5%' ],
            ['2000 sym / 100 events','14.0', '8,400',  '~600×', '100%', '<1%'  ],
          ].map(([corpus, hg, emb, spd, hgr, embr]) => (
            <tr key={corpus as string} className="border-b border-mesh-border/40 hover:bg-mesh-surface/50">
              <td className="py-2 pr-4 text-mesh-muted">{corpus}</td>
              <td className="py-2 px-3 text-right text-mesh-cyan-bright">{hg}</td>
              <td className="py-2 px-3 text-right">{emb}</td>
              <td className="py-2 px-3 text-right text-mesh-yellow font-bold">{spd}</td>
              <td className="py-2 px-3 text-right text-mesh-green font-bold">{hgr}</td>
              <td className="py-2 px-3 text-right text-mesh-dim">{embr}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-mesh-dim text-xs mt-2">
        HoloGraph = O(1) EventEdge traversal. Embedding = cosine scan over dense vectors (Xenova all-MiniLM-L6-v2 / StructuralEmbeddingProvider).
        Both embedding providers achieve identical recall — semantic training adds nothing for structural code queries.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Receipt strip
// ─────────────────────────────────────────────────────────────────────────────

function ReceiptStrip({ receipts }: { receipts: SimReceipt[] }) {
  const latest = receipts[receipts.length - 1];
  if (!latest) return null;

  return (
    <div className="bg-mesh-card border border-mesh-border rounded-lg p-3 space-y-1 text-xs font-mono">
      <div className="flex items-center gap-2">
        <span className="text-mesh-green">✓</span>
        <span className="text-mesh-muted">Checkpoint tick {latest.tick} — signed</span>
        {latest.baseBlock && (
          <span className="text-mesh-cyan ml-auto">Base block {latest.baseBlock}</span>
        )}
      </div>
      <div className="text-mesh-dim truncate">
        <span className="text-mesh-muted">SHA-256 </span>
        {latest.hash}
      </div>
      {latest.baseTxHash && (
        <div className="text-mesh-dim truncate">
          <span className="text-mesh-muted">tx </span>
          {latest.baseTxHash}
        </div>
      )}
      <div className="text-mesh-dim">
        {receipts.length} receipt{receipts.length !== 1 ? 's' : ''} issued
        {' · '}
        {receipts.filter(r => r.baseBlock).length} anchored to Base
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function Paper26SimPage() {
  const [state, setState] = useState<SimState | null>(null);
  const [connected, setConnected] = useState(false);
  const gammaHistory    = useRef<number[]>([]);
  const lossHistory     = useRef<number[]>([]);
  const diversityHistory= useRef<number[]>([]);
  const [chartTick, setChartTick] = useState(0); // forces re-render

  // Load initial state
  useEffect(() => {
    fetch('/sim/paper26/api/status')
      .then(r => r.json())
      .then((s: SimState) => {
        setState(s);
        gammaHistory.current     = s.population.map(p => p.medianGamma);
        lossHistory.current      = s.population.map(p => p.meanTotalLoss);
        diversityHistory.current = s.population.map(p => p.meanDiversity);
        setChartTick(t => t + 1);
      })
      .catch(() => {});
  }, []);

  // SSE live updates
  useEffect(() => {
    const es = new EventSource('/sim/paper26/api/stream');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const { metrics, receipt } = JSON.parse(e.data) as {
          metrics: PopulationMetrics;
          receipt: SimReceipt;
        };
        gammaHistory.current.push(metrics.medianGamma);
        lossHistory.current.push(metrics.meanTotalLoss);
        diversityHistory.current.push(metrics.meanDiversity);
        // Keep last 500 points
        if (gammaHistory.current.length > 500) {
          gammaHistory.current     = gammaHistory.current.slice(-500);
          lossHistory.current      = lossHistory.current.slice(-500);
          diversityHistory.current = diversityHistory.current.slice(-500);
        }
        setState(prev => prev ? {
          ...prev,
          currentTick:   metrics.tick,
          running:       true,
          latestMetrics: metrics,
          receipts:      [...(prev.receipts.slice(-199)), receipt],
        } : prev);
        setChartTick(t => t + 1);
      } catch { /* ignore malformed */ }
    };
    return () => es.close();
  }, []);

  const pm = state?.latestMetrics;
  const progress = state ? Math.min(1, state.currentTick / state.targetTicks) : 0;
  const pct = (progress * 100).toFixed(1);

  return (
    <div className="space-y-8 max-w-5xl">

      {/* ── Hero ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-mesh-purple-bright text-glow-purple">
            Paper 26 — Live Simulation
          </h1>
          <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${
            state?.running
              ? 'border-mesh-green text-mesh-green'
              : state?.currentTick === 0
                ? 'border-mesh-dim text-mesh-dim'
                : 'border-mesh-muted text-mesh-muted'
          }`}>
            {state?.running ? '● RUNNING' : state?.currentTick === 0 ? '○ AWAITING' : '◼ COMPLETE'}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${
            connected ? 'border-mesh-cyan text-mesh-cyan' : 'border-mesh-dim text-mesh-dim'
          }`}>
            {connected ? 'LIVE' : 'CONNECTING…'}
          </span>
        </div>

        <p className="text-mesh-muted text-sm max-w-2xl">
          100 uAAL agents running the Pillar-Slice dual-loop cognitive architecture
          ({state?.config?.innerFreq ?? 10} inner ticks per outer tick, latent dim {state?.config?.latentDim ?? 32}).
          Target: {state?.targetTicks ?? 1000} outer ticks. Every checkpoint is signed
          and anchored to Base.{' '}
          <a
            href="https://holoscript.net"
            target="_blank"
            rel="noopener noreferrer"
            className="text-mesh-purple hover:text-mesh-purple-bright transition-colors"
          >
            What is HoloScript? ↗
          </a>
        </p>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-mesh-dim">
            <span>tick {state?.currentTick ?? 0} / {state?.targetTicks ?? 1000}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 bg-mesh-card rounded-full overflow-hidden">
            <div
              className="h-full bg-mesh-purple-bright rounded-full transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Live metrics ── */}
      {pm ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'γ median', value: (pm.medianGamma * 100).toFixed(1) + '%', color: '#a855f7', note: 'hemisphere agreement' },
            { label: 'γ p90',    value: (pm.p90Gamma    * 100).toFixed(1) + '%', color: '#22d3ee', note: 'top 10% agents' },
            { label: 'loss',     value: pm.meanTotalLoss.toFixed(4),              color: '#f87171', note: 'mean total loss' },
            { label: 'diversity',value: (pm.meanDiversity * 100).toFixed(1) + '%',color: '#22c55e', note: 'slice diversity ρ' },
          ].map(({ label, value, color, note }) => (
            <div key={label} className="bg-mesh-card border border-mesh-border rounded-lg p-3">
              <div className="text-mesh-dim text-xs mb-1">{label}</div>
              <div className="text-xl font-bold" style={{ color }}>{value}</div>
              <div className="text-mesh-dim text-xs mt-1">{note}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-mesh-card border border-mesh-border rounded-lg p-8 text-center text-mesh-dim text-sm">
          Waiting for first simulation push…
        </div>
      )}

      {/* ── Charts ── */}
      <div className="grid md:grid-cols-3 gap-4">
        {[
          { data: gammaHistory.current,     color: '#a855f7', label: 'Hemisphere Agreement γ', formatY: (v: number) => (v*100).toFixed(1)+'%' },
          { data: lossHistory.current,      color: '#f87171', label: 'Total Loss',              formatY: (v: number) => v.toFixed(4) },
          { data: diversityHistory.current, color: '#22c55e', label: 'Slice Diversity ρ',       formatY: (v: number) => (v*100).toFixed(1)+'%' },
        ].map(({ data, color, label, formatY }) => (
          <div key={label} className="bg-mesh-card border border-mesh-border rounded-lg p-4">
            <LineChart data={data} color={color} label={label} formatY={formatY} key={chartTick} />
          </div>
        ))}
      </div>

      {/* ── Lifecycle distribution ── */}
      {pm && Object.keys(pm.lifecycleDistrib).length > 0 && (
        <div className="bg-mesh-card border border-mesh-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-bold text-mesh-text">Agent Lifecycle Distribution</h2>
          <LifecycleBar distrib={pm.lifecycleDistrib} />
          <p className="text-mesh-dim text-xs">
            Distribution shifts init → stable as agents converge (Paper 26 M4 metric).
          </p>
        </div>
      )}

      {/* ── Benchmark context ── */}
      <div className="bg-mesh-card border border-mesh-border rounded-lg p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-mesh-text">
            Why this matters — HoloGraph vs Embeddings
          </h2>
          <span className="text-xs text-mesh-dim">Table 1 · Paper 26 §7.1</span>
        </div>
        <BenchmarkTable />
      </div>

      {/* ── Receipts ── */}
      {state && state.receipts.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-mesh-text">Verifiable Checkpoints</h2>
          <p className="text-mesh-dim text-xs">
            Every metric snapshot is signed with ECDSA P-256 and anchored to Base mainnet.
            Claims are not self-reported — they are cryptographically timestamped.
          </p>
          <ReceiptStrip receipts={state.receipts} />
        </div>
      )}

      {/* ── Footer context ── */}
      <div className="border-t border-mesh-border pt-6 text-xs text-mesh-dim space-y-1">
        <p>
          <span className="text-mesh-muted">Paper 26</span> — Pillar-Slice Framework for
          uAAL Cognitive VMs · ICLR 2027 target ·{' '}
          <a
            href="https://arxiv.org/abs/2604.25917"
            target="_blank"
            rel="noopener noreferrer"
            className="text-mesh-purple hover:text-mesh-purple-bright transition-colors"
          >
            RecursiveMAS (arxiv:2604.25917) ↗
          </a>
        </p>
        <p>
          Simulation runs on Vast.ai · checkpoints anchored to Base mainnet ·
          source in <code className="text-mesh-cyan">@holoscript/core</code> (open source)
        </p>
        {state?.startedAt && (
          <p>Started {new Date(state.startedAt).toUTCString()}</p>
        )}
      </div>
    </div>
  );
}
