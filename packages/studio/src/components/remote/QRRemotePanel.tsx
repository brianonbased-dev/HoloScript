'use client';

/**
 * QRRemotePanel — right-rail panel for mobile remote session.
 *
 * Shows a QR code that the user scans on their phone to open
 * /remote/[token], which gives them touch controls for the viewport.
 */

import { useState, useEffect } from 'react';
import { Smartphone, X, Loader2, RefreshCw, Wifi, WifiOff, Joystick } from 'lucide-react';
import { useMobileRemote } from '@/hooks/useMobileRemote';
import { SAVE_FEEDBACK_DURATION } from '@/lib/ui-timings';

// Lightweight QR SVG generated via Google Charts API (no npm dep)
function QRCodeImage({ url }: { url: string }) {
  const encoded = encodeURIComponent(url);
  const src = `https://chart.googleapis.com/chart?chs=180x180&cht=qr&chl=${encoded}&choe=UTF-8`;
  return (
    <img
      src={src}
      alt="QR code for mobile remote"
      width={180}
      height={180}
      className="rounded-xl border border-studio-border"
    />
  );
}

interface QRRemotePanelProps {
  onClose: () => void;
}

const STATUS_CONFIG = {
  idle: { color: 'text-studio-muted', icon: WifiOff, label: 'Not connected' },
  active: { color: 'text-green-400', icon: Wifi, label: 'Active' },
  expired: { color: 'text-yellow-400', icon: WifiOff, label: 'Session expired' },
  error: { color: 'text-red-400', icon: WifiOff, label: 'Error' },
};

export function QRRemotePanel({ onClose }: QRRemotePanelProps) {
  const { token, remoteUrl, status, commandCount, createSession, endSession } = useMobileRemote();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Auto-create session on mount
  useEffect(() => {
    handleCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    setLoading(true);
    try {
      await createSession();
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!remoteUrl) return;
    navigator.clipboard.writeText(remoteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), SAVE_FEEDBACK_DURATION);
    });
  };

  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Smartphone className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Mobile Remote</span>
        <button
          onClick={onClose}
          className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center gap-4 overflow-y-auto p-4">
        {/* Status */}
        <div className={`flex items-center gap-1.5 text-[11px] ${cfg.color}`}>
          <Icon className="h-3.5 w-3.5" />
          {cfg.label}
          {status === 'active' && commandCount > 0 && (
            <span className="ml-1 text-studio-muted">· {commandCount} cmds</span>
          )}
        </div>

        {/* QR Code */}
        {loading ? (
          <div className="flex h-[180px] w-[180px] items-center justify-center rounded-xl border border-studio-border">
            <Loader2 className="h-6 w-6 animate-spin text-studio-muted" />
          </div>
        ) : remoteUrl ? (
          <QRCodeImage url={remoteUrl} />
        ) : (
          <div className="flex h-[180px] w-[180px] items-center justify-center rounded-xl border border-studio-border text-[11px] text-studio-muted">
            Scan QR to connect
          </div>
        )}

        {/* Instructions */}
        <div className="w-full rounded-xl bg-studio-surface p-3 text-[11px] text-studio-muted space-y-1.5">
          <p className="font-semibold text-studio-text">How to use</p>
          <p>1. Scan the QR code with your phone</p>
          <p>2. Use the virtual joystick to orbit the scene</p>
          <p>3. Pinch to zoom, two-finger drag to pan</p>
          <p>4. Tap Reset to home the camera</p>
        </div>

        {/* Copy link */}
        {remoteUrl && (
          <button
            onClick={handleCopyLink}
            className="w-full rounded-xl border border-studio-border bg-studio-surface py-2 text-[11px] text-studio-muted transition hover:text-studio-text"
          >
            {copied ? '✓ Copied!' : 'Copy link'}
          </button>
        )}

        {/* Controls */}
        <div className="flex w-full gap-2">
          <button
            onClick={handleCreate}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-studio-border py-2 text-[11px] text-studio-muted transition hover:text-studio-accent disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> New session
          </button>
          {status === 'active' && (
            <button
              onClick={endSession}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-studio-border py-2 text-[11px] text-red-400 transition hover:border-red-400/30"
            >
              End session
            </button>
          )}
        </div>

        {/* Token display */}
        {token && <p className="text-[9px] text-studio-muted/50 font-mono">{token}</p>}
      </div>
    </div>
  );
}
