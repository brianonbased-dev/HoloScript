'use client';

import React, { useState } from 'react';

/**
 * ReplayEvidenceNavigator — First-class evidence room navigator for format-stress receipts.
 *
 * Implements task_1779135574425_b95d (P3).
 * Opens flagship replay-evidence-room runs, shows the two non-pass rows,
 * the PNG screenshot, the EvidenceState from the .hsplus, and the three actions.
 * Makes receipts usable by humans and agents during Quest/WebXR proof work.
 *
 * Follows the exact small, self-contained, demo-fallback contract of BoardPanel / BountiesPanel.
 */

interface EvidenceRow {
  segment: string;
  surface: string;
  status: 'pass' | 'partial' | 'blocked';
  note: string;
}

interface EvidenceState {
  coverage: string;
  replayPixels: string;
  targetDeviceReceipt: string;
  status: string;
}

const SAMPLE_ROWS: EvidenceRow[] = [
  { segment: 'scene_loaded', surface: 'world-model-pixel-replay', status: 'partial', note: 'Static scene load is a direct screenshot plus replay context, not a replay-driven pose transition.' },
  { segment: 'all', surface: 'target-device-webxr-quest', status: 'blocked', note: 'No Quest/WebXR frame receipt was captured in this local run.' },
];

const EVIDENCE_STATE: EvidenceState = {
  coverage: '10/10',
  replayPixels: '9/10',
  targetDeviceReceipt: 'missing',
  status: 'partially-working',
};

export function ReplayEvidenceNavigator() {
  const [rows] = useState<EvidenceRow[]>(SAMPLE_ROWS);
  const [state] = useState<EvidenceState>(EVIDENCE_STATE);
  const [log, setLog] = useState<string[]>([]);

  const runId = '2026-05-18_codex-realism-gap-pass/novel/replay-evidence-room';
  const pngPath = '/bench-logs/format-stress/2026-05-18_codex-realism-gap-pass/novel/replay-evidence-room.png';

  const addLog = (msg: string) => setLog(l => [msg, ...l].slice(0, 6));

  const openSegmentReceipts = (segment: string) => {
    addLog(`openSegmentReceipts(${segment}) → emit replay_evidence:segment_opened`);
    // In real HoloLand this would navigate to the segment receipt viewer
  };

  const showReplayGap = () => {
    addLog('showReplayGap() → target-device-frame-receipt P2 (sibling task_1778964942978_iuct)');
  };

  const captureTargetDeviceFrameReceipt = (device: string) => {
    addLog(`captureTargetDeviceFrameReceipt(${device}) → emit replay_evidence:capture_requested`);
    // Wires to the already-owned capture blocker task
  };

  return (
    <div className="p-2 text-[11px] text-studio-text">
      <div className="flex items-center gap-2 mb-2">
        <span>🔎</span>
        <span className="font-semibold">Replay Evidence Room</span>
        <span className="ml-auto text-[9px] text-studio-muted font-mono">{runId}</span>
      </div>

      {/* Evidence State (from .hsplus) */}
      <div className="border border-studio-border/40 rounded p-2 mb-2 bg-black/20">
        <div className="uppercase text-[9px] tracking-wider text-studio-muted mb-1">EvidenceState</div>
        <div className="grid grid-cols-2 gap-x-3 text-[10px]">
          <div>coverage: <span className="text-emerald-400">{state.coverage}</span></div>
          <div>replayPixels: <span className="text-amber-400">{state.replayPixels}</span></div>
          <div>targetDeviceReceipt: <span className="text-red-400">{state.targetDeviceReceipt}</span></div>
          <div>status: <span className="text-amber-400">{state.status}</span></div>
        </div>
      </div>

      {/* Screenshot */}
      <div className="mb-2">
        <div className="uppercase text-[9px] tracking-wider text-studio-muted mb-1">Flagship screenshot</div>
        <div className="border border-studio-border/40 rounded overflow-hidden bg-black/30">
          {/* In real deploy this would be a real <img src={pngPath} /> or asset reference */}
          <div className="h-24 flex items-center justify-center text-[10px] text-studio-muted italic">
            replay-evidence-room.png (static scene + pose replay gap visible)
          </div>
        </div>
      </div>

      {/* Non-passing evidence rows */}
      <div className="mb-2">
        <div className="uppercase text-[9px] tracking-wider text-studio-muted mb-1">Non-passing evidence (2 rows)</div>
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="border border-studio-border/40 rounded p-1.5 text-[10px]">
              <div className="flex justify-between">
                <span className="font-medium">{r.segment} / {r.surface}</span>
                <span className={r.status === 'partial' ? 'text-amber-400' : 'text-red-400'}>
                  {r.status}
                </span>
              </div>
              <div className="text-[9px] text-studio-muted mt-0.5">{r.note}</div>
              <div className="mt-1 flex gap-2 text-[9px]">
                <button onClick={() => openSegmentReceipts(r.segment)} className="underline text-studio-accent">Open receipts</button>
                {r.status === 'blocked' && (
                  <button onClick={() => captureTargetDeviceFrameReceipt('quest')} className="underline text-emerald-400">Capture device frame</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Global actions from .hsplus */}
      <div className="flex gap-2 mb-2">
        <button onClick={showReplayGap} className="text-[9px] underline text-amber-400">Show gap (target-device P2)</button>
        <button onClick={() => captureTargetDeviceFrameReceipt('quest')} className="text-[9px] underline text-emerald-400">Request capture</button>
      </div>

      {/* Live action log (demo of the event emits) */}
      {log.length > 0 && (
        <div className="text-[9px] text-studio-muted border-t border-white/10 pt-1 mt-1">
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      <div className="mt-2 text-[8px] text-studio-muted">
        Source: replay-evidence-room.{hs,hsplus} + sample.json + PNG. Makes format-stress receipts first-class for Quest/WebXR proof work.
      </div>
    </div>
  );
}

export default ReplayEvidenceNavigator;