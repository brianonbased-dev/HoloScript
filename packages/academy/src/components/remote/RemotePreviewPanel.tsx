'use client';

/**
 * RemotePreviewPanel — share a live scene preview link to mobile/VR devices.
 */

import { useEffect, useState } from 'react';
import { Smartphone, X, Copy, CheckCircle2, Wifi, WifiOff, RefreshCw, QrCode } from 'lucide-react';
import { useSceneStore } from '@/lib/stores';
import type { RemoteSession, ConnectedDevice } from '@/app/api/remote-session/route';

interface RemotePreviewPanelProps {
  onClose: () => void;
}

const PLATFORM_EMOJI: Record<string, string> = {
  mobile: '📱',
  vr: '🥽',
  desktop: '🖥️',
  unknown: '❓',
};

/** Minimal QR-code-like visual using a grid of colored blocks (ASCII art approach). */
function QRDisplay({ data }: { data: string }) {
  // Produce a deterministic 9×9 grid from the URL string
  const bits = Array.from({ length: 81 }, (_, i) => {
    const c = data.charCodeAt(i % data.length);
    return ((c ^ (i * 7)) & 1) === 1;
  });
  return (
    <div className="mx-auto grid grid-cols-9 gap-px rounded-lg border border-studio-border bg-white p-2.5 w-32 h-32">
      {bits.map((on, i) => (
        <div key={i} className={`${on ? 'bg-black' : 'bg-white'}`} />
      ))}
    </div>
  );
}

export function RemotePreviewPanel({ onClose }: RemotePreviewPanelProps) {
  const code = useSceneStore((s) => s.code) ?? '';
  const [session, setSession] = useState<RemoteSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Simple scene hash for session stability
  const sceneHash = Buffer.from(code.slice(0, 200)).toString('base64url').slice(0, 12);

  const fetchSession = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/remote-session?hash=${sceneHash}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: RemoteSession = await r.json();
      setSession(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const copyLink = async () => {
    if (!session) return;
    await navigator.clipboard.writeText(session.previewUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const isConnected = (session?.devices.length ?? 0) > 0;

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Smartphone className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Remote Preview</span>
        {session && (
          <span
            className={`flex items-center gap-1 ml-1 rounded-full px-1.5 py-0.5 text-[7px] ${isConnected ? 'bg-green-900/30 text-green-400' : 'bg-studio-surface text-studio-muted'}`}
          >
            {isConnected ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
            {isConnected
              ? `${session.devices.length} device${session.devices.length !== 1 ? 's' : ''}`
              : 'No devices'}
          </span>
        )}
        <button
          onClick={fetchSession}
          className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text"
          title="Refresh session"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={onClose} className="rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {error && (
          <div className="rounded-xl border border-red-700/30 bg-red-900/10 p-3 text-[9px] text-red-400">
            {error}
          </div>
        )}

        {loading && !session && (
          <div className="flex items-center justify-center py-10">
            <RefreshCw className="h-5 w-5 animate-spin text-studio-muted" />
          </div>
        )}

        {session && (
          <>
            {/* QR Code area */}
            <div className="flex flex-col items-center gap-3 rounded-xl border border-studio-border bg-studio-surface p-4">
              <div className="flex items-center gap-2 text-[9px] text-studio-muted">
                <QrCode className="h-3.5 w-3.5" />
                <span>Scan to open on any device</span>
              </div>
              <QRDisplay data={session.qrData} />
              <p className="text-center text-[7px] text-studio-muted/60 max-w-[160px] break-all">
                {session.previewUrl}
              </p>
            </div>

            {/* Copy link */}
            <button
              onClick={copyLink}
              className={`flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-[10px] font-semibold transition ${copied ? 'border-green-600 bg-green-900/20 text-green-400' : 'border-studio-border bg-studio-surface hover:bg-studio-surface/80 text-studio-text'}`}
            >
              {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy Preview Link'}
            </button>

            {/* Session details */}
            <div className="rounded-xl border border-studio-border bg-studio-surface p-3 space-y-1.5 text-[8px]">
              <div className="flex justify-between">
                <span className="text-studio-muted">Session token</span>
                <span className="font-mono text-studio-text">{session.token}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-studio-muted">Expires</span>
                <span className="text-studio-text">
                  {new Date(session.expiresAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-studio-muted">WebSocket</span>
                <span className="font-mono text-[7px] text-studio-muted/70 max-w-[120px] truncate">
                  {session.wsUrl}
                </span>
              </div>
            </div>

            {/* Connected Devices */}
            <div>
              <p className="mb-2 text-[9px] uppercase tracking-widest text-studio-muted">
                Connected Devices
              </p>
              {session.devices.length === 0 ? (
                <div className="rounded-xl border border-studio-border bg-studio-surface/40 p-4 text-center text-[9px] text-studio-muted">
                  <Smartphone className="mx-auto mb-2 h-6 w-6 text-studio-muted/20" />
                  Open the preview URL on a mobile device or VR headset to connect
                </div>
              ) : (
                <div className="space-y-1.5">
                  {session.devices.map((d: ConnectedDevice) => (
                    <div
                      key={d.id}
                      className="flex items-center gap-2 rounded-xl border border-studio-border bg-studio-surface p-2.5"
                    >
                      <span>{PLATFORM_EMOJI[d.platform]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-semibold truncate">{d.label}</p>
                        <p className="text-[7px] text-studio-muted">
                          {d.latencyMs != null ? `${d.latencyMs}ms` : 'connecting…'}
                        </p>
                      </div>
                      <div className="h-2 w-2 rounded-full bg-green-400" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
