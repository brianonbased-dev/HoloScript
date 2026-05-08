'use client';

/**
 * PublishModal — one-click scene publishing to WebXR
 *
 * Publishes the current HoloScript source to /api/share and returns a
 * WebXR-capable public URL (/w/<id> short URL or custom domain).
 *
 * Features:
 *   - QR code for phone/headset scanning
 *   - Copy + external link
 *   - Optional custom domain
 *   - No-app launch: works on phone, desktop, and VR headset
 */

import { useState, useCallback } from 'react';
import { Globe, Copy, Check, Loader2, X, ExternalLink } from 'lucide-react';
import { QRCodeImage } from '@/components/QRCodeImage';
import { useSceneStore } from '@/lib/stores';
import { SAVE_FEEDBACK_DURATION } from '@/lib/ui-timings';

interface PublishModalProps {
  onClose: () => void;
}

type Stage = 'idle' | 'publishing' | 'done' | 'error';

export function PublishModal({ onClose }: PublishModalProps) {
  const [stage, setStage] = useState<Stage>('idle');
  const [publishedUrl, setPublishedUrl] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const code = useSceneStore((s) => s.code);
  const metadata = useSceneStore((s) => s.metadata);

  const handlePublish = useCallback(async () => {
    setStage('publishing');
    try {
      const payload: Record<string, string> = {
        name: metadata.name || 'Untitled Scene',
        code,
        author: 'Anonymous',
      };
      const domain = customDomain.trim();
      if (domain) {
        payload.customDomain = domain;
      }

      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { id: string; url: string; customUrl?: string };
      const base = window.location.origin;
      // Prefer short /w/<id> URL; fall back to /shared/<id>; use custom domain if provided
      const url = data.customUrl ?? `${base}/w/${data.id}`;
      setPublishedUrl(url);
      setStage('done');
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setStage('error');
    }
  }, [code, customDomain, metadata.name]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(publishedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), SAVE_FEEDBACK_DURATION);
    });
  }, [publishedUrl]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-96 rounded-2xl border border-studio-border bg-studio-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-studio-accent" />
            <span className="font-semibold text-studio-text">Publish to WebXR</span>
          </div>
          <button onClick={onClose} className="text-studio-muted hover:text-studio-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {stage === 'idle' && (
            <>
              <p className="mb-4 text-sm text-studio-muted">
                Publish <span className="font-medium text-studio-text">{metadata.name}</span> to a
                public WebXR URL. Anyone with the link can view your scene — no app install
                required.
              </p>
              <div className="mb-4 rounded-lg border border-studio-border bg-studio-surface p-3 text-xs text-studio-muted">
                <ul className="space-y-1">
                  <li>✓ Full 3D rendering in the browser</li>
                  <li>✓ Enter VR on Quest, Vision Pro, and WebXR headsets</li>
                  <li>✓ Launch from phone, desktop, or headset — no app store</li>
                  <li>✓ Auto-enters VR when opened in Oculus Browser</li>
                </ul>
              </div>

              {/* Custom domain */}
              <div className="mb-4 flex flex-col gap-1.5">
                <label className="text-[10px] font-medium text-studio-muted uppercase tracking-widest">
                  Custom domain (optional)
                </label>
                <input
                  type="text"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder="e.g. my-experience.com"
                  className="rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-xs text-studio-text placeholder:text-studio-muted outline-none focus:border-studio-accent"
                />
                <p className="text-[10px] text-studio-muted">
                  Configure a CNAME to studio.holoscript.net
                </p>
              </div>

              <button
                onClick={handlePublish}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-studio-accent py-2.5 text-sm font-medium text-white transition hover:bg-studio-accent/80"
              >
                <Globe className="h-4 w-4" />
                Publish Now
              </button>
            </>
          )}

          {stage === 'publishing' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-8 w-8 animate-spin text-studio-accent" />
              <p className="text-sm text-studio-muted">Publishing scene to WebXR…</p>
            </div>
          )}

          {stage === 'done' && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-studio-success/20">
                <Check className="h-6 w-6 text-studio-success" />
              </div>
              <p className="text-sm font-medium text-studio-text">Scene is live on WebXR!</p>

              {/* URL bar */}
              <div className="flex w-full items-center gap-2 rounded-lg border border-studio-border bg-studio-surface px-3 py-2">
                <span className="flex-1 truncate text-xs text-studio-muted">{publishedUrl}</span>
                <button
                  onClick={handleCopy}
                  className="shrink-0 text-studio-muted hover:text-studio-accent transition"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-studio-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <a
                  href={publishedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-studio-muted hover:text-studio-accent transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>

              {/* QR Code */}
              <QRCodeImage
                url={publishedUrl}
                size={120}
                className="rounded-lg border border-studio-border"
              />

              <p className="text-[11px] text-studio-muted text-center">
                Scan this QR code with your phone or Quest to launch instantly.
              </p>

              <button
                onClick={onClose}
                className="w-full rounded-xl bg-studio-surface py-2 text-sm text-studio-muted transition hover:bg-studio-border"
              >
                Done
              </button>
            </div>
          )}

          {stage === 'error' && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <p className="text-sm text-studio-error">{errMsg}</p>
              <button
                onClick={() => setStage('idle')}
                className="rounded-lg bg-studio-surface px-4 py-2 text-sm text-studio-muted hover:bg-studio-border"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
