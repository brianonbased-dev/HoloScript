'use client';

import { useEffect, useMemo, useState } from 'react';
import { QrCode, Smartphone, Camera, RefreshCw, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { QRCodeImage } from '@/components/QRCodeImage';
import { AcceptanceVideoInspector } from './AcceptanceVideoInspector';
import { HoloMapScanViewer } from './HoloMapScanViewer';
import {
  clearStoredScanSession,
  readStoredScanSession,
  writeStoredScanSession,
  type ScanSessionResponse,
} from '@/lib/reconstruction-scan-session-client';
import type { HoloMapScanRenderAsset } from '@/lib/holomap-scan-render';

interface ScanSessionState {
  token: string;
  status: 'pending-phone' | 'phone-connected' | 'capturing' | 'uploaded' | 'processing' | 'done' | 'error';
  weightStrategy: 'distill' | 'fine-tune' | 'from-scratch';
  frameCount?: number;
  videoBytes?: number;
  videoHash?: string;
  replayFingerprint?: string;
  manifest?: { version: string; replayHash: string; simulationContract: { replayFingerprint: string } };
  renderAsset?: HoloMapScanRenderAsset;
  lastError?: string;
}

const statusLabel: Record<ScanSessionState['status'], string> = {
  'pending-phone': 'Waiting for phone scan',
  'phone-connected': 'Phone connected · waiting for camera',
  capturing: 'Camera linked · sensing room',
  uploaded: 'Capture uploaded',
  processing: 'Processing reconstruction',
  done: 'Reconstruction complete',
  error: 'Capture failed',
};

export function ReconstructionPanel() {
  const [strategy, setStrategy] = useState<'distill' | 'fine-tune' | 'from-scratch'>('distill');
  const [session, setSession] = useState<ScanSessionResponse | null>(null);
  const [state, setState] = useState<ScanSessionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const expiresIn = useMemo(() => {
    if (!session?.expiresAt) return null;
    const ms = new Date(session.expiresAt).getTime() - Date.now();
    return Math.max(0, Math.floor(ms / 1000));
  }, [session?.expiresAt]);
  const mobileUrlSupportsLiveCamera = useMemo(
    () => session?.mobileUrl.startsWith('https://') ?? false,
    [session?.mobileUrl],
  );

  const createSession = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reconstruction/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weightStrategy: strategy }),
      });
      const data = (await res.json()) as ScanSessionResponse;
      setSession(data);
      setState(null);
      setSessionError(null);
      writeStoredScanSession(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const stored = readStoredScanSession();
    if (stored) {
      setSession(stored);
      setSessionError(null);
    }
  }, []);

  useEffect(() => {
    if (!session?.token) return;

    let isCurrent = true;
    let isRefreshing = false;
    const refreshSessionState = async () => {
      if (isRefreshing) return;
      isRefreshing = true;
      try {
        const res = await fetch(`/api/reconstruction/session?t=${encodeURIComponent(session.token)}`);
        if (!isCurrent) return;

        if (res.status === 404) {
          clearStoredScanSession();
          setSessionError('This scan session expired or the Studio server restarted. Start a new QR.');
          return;
        }

        if (!res.ok) {
          setSessionError(`Session polling failed (${res.status}).`);
          return;
        }

        const data = (await res.json()) as ScanSessionState;
        setSessionError(null);
        setState(data);
      } catch (e) {
        if (!isCurrent) return;
        setSessionError(e instanceof Error ? e.message : 'Session polling failed.');
      } finally {
        isRefreshing = false;
      }
    };

    void refreshSessionState();
    const interval = window.setInterval(() => void refreshSessionState(), 1200);
    return () => {
      isCurrent = false;
      window.clearInterval(interval);
    };
  }, [session?.token]);

  return (
    <div className="rounded-2xl border border-studio-border bg-studio-panel p-5 text-studio-text">
      <div className="mb-4 flex items-center gap-2">
        <Camera className="h-4 w-4 text-indigo-400" />
        <h2 className="text-sm font-semibold">Room Scan (Desktop → Phone)</h2>
      </div>

      <p className="mb-4 text-xs text-studio-muted">
        Login on desktop with GitHub, scan this QR from your phone, capture your room, and feed reconstruction back into Studio.
      </p>

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <button
          onClick={() => setStrategy('distill')}
          className={`rounded-lg border px-3 py-2 text-xs ${strategy === 'distill' ? 'border-indigo-400/50 text-indigo-300' : 'border-studio-border text-studio-muted'}`}
        >
          Distill (fast MVP)
        </button>
        <button
          onClick={() => setStrategy('fine-tune')}
          className={`rounded-lg border px-3 py-2 text-xs ${strategy === 'fine-tune' ? 'border-indigo-400/50 text-indigo-300' : 'border-studio-border text-studio-muted'}`}
        >
          Fine-tune (balanced)
        </button>
        <button
          onClick={() => setStrategy('from-scratch')}
          className={`rounded-lg border px-3 py-2 text-xs ${strategy === 'from-scratch' ? 'border-indigo-400/50 text-indigo-300' : 'border-studio-border text-studio-muted'}`}
        >
          From-scratch (max quality)
        </button>
      </div>

      {!session ? (
        <button
          onClick={createSession}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-studio-border px-4 py-2 text-xs text-studio-muted hover:text-studio-text disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
          Start mobile scan session
        </button>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <div className="space-y-3">
            <QRCodeImage url={session.mobileUrl} size={200} alt="Scan-room mobile QR" />
            <div
              className={`rounded-lg border px-3 py-2 text-[11px] leading-4 ${
                mobileUrlSupportsLiveCamera
                  ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-yellow-400/30 bg-yellow-500/10 text-yellow-100'
              }`}
            >
              {mobileUrlSupportsLiveCamera ? (
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Studio camera overlays enabled
                </span>
              ) : (
                <span className="inline-flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Use an HTTPS Studio URL for live phone overlays.
                </span>
              )}
            </div>
            <button
              onClick={createSession}
              className="inline-flex items-center gap-2 rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted hover:text-studio-text"
            >
              <RefreshCw className="h-3.5 w-3.5" /> New QR
            </button>
          </div>

          <div className="rounded-xl border border-studio-border bg-studio-surface p-3 text-xs">
            <div className="mb-2 flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-indigo-300" />
              <span className="font-medium">Session status</span>
            </div>
            <p className="text-studio-muted">{state ? statusLabel[state.status] : 'Initializing session…'}</p>
            {state && state.status !== 'pending-phone' && state.status !== 'error' && (
              <div
                data-testid="scan-phone-connected"
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-300"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Phone is connected
              </div>
            )}
            {state?.status === 'capturing' && (
              <div
                data-testid="scan-camera-linked"
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-indigo-500/10 px-2 py-1 text-indigo-300"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Camera stream linked
              </div>
            )}
            {sessionError && <p className="mt-1 text-red-400">{sessionError}</p>}
            {state?.frameCount !== undefined && <p className="mt-1 text-studio-muted">Frames: {state.frameCount}</p>}
            {state?.videoBytes !== undefined && <p className="text-studio-muted">Upload: {(state.videoBytes / 1024 / 1024).toFixed(2)} MB</p>}
            {expiresIn !== null && <p className="mt-2 text-studio-muted">Expires in ~{expiresIn}s</p>}
            {state?.status === 'done' && (
              <div className="mt-3 space-y-2">
                <div className="inline-flex items-center gap-1.5 rounded-md bg-green-500/10 px-2 py-1 text-green-300">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Ready to reconstruct in Studio
                </div>
                {state.manifest && (
                  <AcceptanceVideoInspector
                    manifest={state.manifest}
                    videoHash={state.videoHash}
                    frameCount={state.frameCount}
                    videoBytes={state.videoBytes}
                    replayFingerprint={state.replayFingerprint}
                  />
                )}
                {state.renderAsset && <HoloMapScanViewer renderAsset={state.renderAsset} />}
              </div>
            )}
            {state?.lastError && <p className="mt-2 text-red-400">Error: {state.lastError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
