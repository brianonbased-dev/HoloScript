'use client';

/**
 * PublishModal — one-click scene publishing flow
 *
 * States: idle → publishing → done → error
 * On success: shows public URL + copy button + inline QR code (SVG-based)
 */

import { useState, useCallback } from 'react';
import { Globe, Copy, Check, Loader2, X, ExternalLink } from 'lucide-react';
import { useSceneStore, useSceneGraphStore } from '@/lib/stores';
import { useAssetStore } from '@/components/assets/useAssetStore';
import { serializeScene } from '@/lib/serializer';

// Minimal QR code via QR-SVG inline (no external dep) — redirects to URL
// We'll use a simple encoded URL placeholder approach with the qr endpoint or
// just display an iframe from a QR service. For zero-dep, use Google Charts QR.
function QRCode({ url }: { url: string }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(url)}&bgcolor=0a0a12&color=818cf8&margin=4`;
  return (
    <img
      src={src}
      alt="QR code"
      width={120}
      height={120}
      className="rounded-lg border border-studio-border"
    />
  );
}

interface PublishModalProps {
  onClose: () => void;
}

type Stage = 'idle' | 'publishing' | 'done' | 'error';

export function PublishModal({ onClose }: PublishModalProps) {
  const [stage, setStage] = useState<Stage>('idle');
  const [publishedUrl, setPublishedUrl] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const code = useSceneStore((s) => s.code);
  const metadata = useSceneStore((s) => s.metadata);
  const r3fTree = useSceneStore((s) => s.r3fTree);
  const nodes = useSceneGraphStore((s) => s.nodes);
  const assets = useAssetStore((s) => s.assets);

  const handlePublish = useCallback(async () => {
    setStage('publishing');
    try {
      // Serialize the current scene
      const scene = serializeScene(
        {
          id: metadata.id ?? '',
          name: metadata.name,
          createdAt: metadata.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        code,
        nodes,
        assets
      );

      // Attach r3fTree so the viewer can render immediately without re-compiling
      const payload = { ...scene, r3fTree };

      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Publish failed');
      }

      const data = (await res.json()) as { url: string };
      setPublishedUrl(data.url);
      setStage('done');
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setStage('error');
    }
  }, [code, metadata, r3fTree]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(publishedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [publishedUrl]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-96 rounded-2xl border border-studio-border bg-studio-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-studio-accent" />
            <span className="font-semibold text-studio-text">Publish Scene</span>
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
                public shareable URL. Anyone with the link can view your scene in read-only mode.
              </p>
              <div className="mb-4 rounded-lg border border-studio-border bg-studio-surface p-3 text-xs text-studio-muted">
                <ul className="space-y-1">
                  <li>✓ Full 3D rendering in the browser</li>
                  <li>✓ No account required to view</li>
                  <li>✓ Scene stored on this server</li>
                </ul>
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
              <p className="text-sm text-studio-muted">Publishing scene…</p>
            </div>
          )}

          {stage === 'done' && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-studio-success/20">
                <Check className="h-6 w-6 text-studio-success" />
              </div>
              <p className="text-sm font-medium text-studio-text">Scene is live!</p>

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
              <QRCode url={publishedUrl} />

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
