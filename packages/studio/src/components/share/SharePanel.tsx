'use client';

/**
 * SharePanel — publish the current scene and browse the community gallery.
 */

import { useState, useCallback } from 'react';
import { Share2, Globe, Loader2, Copy, Check, RefreshCw, Clock, X } from 'lucide-react';
import { QRCodeImage } from '@/components/QRCodeImage';
import { worldQrUrl } from '@/lib/worldQrUrl';
import { useSceneShare } from '@/hooks/useSceneShare';
import { useSceneStore } from '@/lib/stores';
import { COPY_FEEDBACK_DURATION } from '@/lib/ui-timings';

interface SharePanelProps {
  onClose: () => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function SharePanel({ onClose }: SharePanelProps) {
  const code = useSceneStore((s) => s.code);
  const sceneMetadata = useSceneStore((s) => s.metadata);

  const [authorName, setAuthorName] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'publish' | 'gallery'>('publish');

  const {
    publish,
    gallery,
    loadGallery,
    shareUrl,
    publishing,
    loadingGallery,
    galleryRequiresSignIn,
    error,
    reset,
  } = useSceneShare();

  const handlePublish = useCallback(async () => {
    await publish({
      name: sceneMetadata.name || 'Untitled',
      code,
      author: authorName.trim() || 'Anonymous',
    });
  }, [publish, code, sceneMetadata.name, authorName]);

  const copyUrl = useCallback(async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION);
  }, [shareUrl]);

  // What the QR encodes is NOT the link we show people, and the difference is
  // the whole reason this panel could not be scanned.
  //
  // /w/:id is a real short link — next.config.js:123 rewrites it to /shared/:id —
  // so it is correct for a human to copy. But HoloQR pattern-matches
  // "https://holoscript.studio/w/" as a WORLD PORTAL link (WorldPortal.kt:21),
  // then demands hs_manifest + hs_signature + hs_key_id and checks them against
  // a trusted-key list that ships EMPTY (WorldTrust.kt:31). So every /w/ QR is
  // refused on the headset with "World blocked: signed-parameter-cardinality".
  //
  // /shared/:id is in none of its link patterns, so it falls through to the
  // ordinary-URL path and "Open" launches the Quest Browser, where the WebXR
  // viewer at app/shared/[id] renders the scene. Same destination, and the one
  // spelling the scanner will actually admit. The transform lives in one helper
  // (lib/worldQrUrl) shared with PublishModal, anchored to the pathname.
  const qrUrl = shareUrl ? worldQrUrl(shareUrl) : null;


  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Share2 className="h-4 w-4 text-studio-accent" />
        <span className="flex-1 text-[12px] font-semibold">Share Scene</span>
        <button onClick={onClose} className="rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tab strip */}
      <div className="flex shrink-0 border-b border-studio-border">
        {(['publish', 'gallery'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-[11px] font-medium capitalize transition ${
              activeTab === tab
                ? 'border-b-2 border-studio-accent text-studio-text'
                : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            {tab === 'gallery' ? (
              <>
                <Globe className="mr-1 inline h-3 w-3" />
                Gallery
              </>
            ) : (
              tab
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-auto p-3">
        {/* ── Publish tab ── */}
        {activeTab === 'publish' && (
          <>
            <div className="rounded-lg border border-studio-border bg-studio-surface p-2.5 text-[10px] text-studio-muted">
              Publishing "{sceneMetadata.name || 'Untitled'}" — {code.split('\n').length} lines of
              HoloScript
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-medium text-studio-muted uppercase tracking-widest">
                Your name (optional)
              </label>
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Anonymous"
                className="rounded-lg border border-studio-border bg-studio-surface px-3 py-1.5 text-[12px] text-studio-text placeholder:text-studio-muted outline-none focus:border-studio-accent"
              />
            </div>

            {!shareUrl ? (
              <button
                onClick={handlePublish}
                disabled={publishing || !code}
                className="flex items-center justify-center gap-2 rounded-lg bg-studio-accent px-4 py-2 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {publishing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Publishing…
                  </>
                ) : (
                  <>
                    <Share2 className="h-4 w-4" /> Publish Scene
                  </>
                )}
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-2.5">
                  <p className="mb-1.5 text-[11px] font-medium text-green-400">
                    ✓ Scene published!
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-studio-surface px-2 py-1 text-[10px] text-studio-text font-mono">
                      {shareUrl}
                    </code>
                    <button
                      onClick={copyUrl}
                      className="shrink-0 rounded p-1.5 text-studio-muted hover:text-studio-text"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
                {qrUrl && (
                  <div className="flex flex-col items-center gap-1.5 rounded-lg border border-studio-border bg-studio-surface p-3">
                    <QRCodeImage
                      url={qrUrl}
                      size={120}
                      className="rounded-lg border border-studio-border"
                    />
                    <p className="text-[10px] text-studio-muted text-center">
                      Scan with HoloQR on your headset to walk into this scene.
                    </p>
                  </div>
                )}
                <button
                  onClick={reset}
                  className="text-[10px] text-studio-muted hover:text-studio-text"
                >
                  Publish another
                </button>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-400">
                {error}
              </div>
            )}
          </>
        )}

        {/* ── Gallery tab ── */}
        {activeTab === 'gallery' && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-studio-muted">
                {galleryRequiresSignIn ? 'Community gallery' : `${gallery.length} scenes shared`}
              </p>
              {!galleryRequiresSignIn && (
                <button
                  onClick={loadGallery}
                  disabled={loadingGallery}
                  className="flex items-center gap-1 text-[10px] text-studio-muted hover:text-studio-text"
                >
                  <RefreshCw className={`h-3 w-3 ${loadingGallery ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              )}
            </div>

            {loadingGallery && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-studio-muted" />
              </div>
            )}

            {/*
             * Signed out is not an error and not an empty world.
             *
             * Browsing the gallery lists other people's shares, so it needs an
             * account; publishing does not. Saying both in one sentence is the
             * difference between a visitor who signs in and one who thinks the
             * panel is broken. The old branch could only say "No scenes shared
             * yet — be the first!", which was a false claim about the world.
             */}
            {!loadingGallery && galleryRequiresSignIn && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Globe className="h-8 w-8 text-studio-muted/40" />
                <p className="text-[11px] text-studio-muted">
                  Sign in to browse scenes other people have shared.
                </p>
                <p className="text-[10px] text-studio-muted/70">
                  Publishing your own scene works without an account — use the Publish tab.
                </p>
              </div>
            )}

            {!loadingGallery && !galleryRequiresSignIn && gallery.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Globe className="h-8 w-8 text-studio-muted/40" />
                <p className="text-[11px] text-studio-muted">
                  No scenes shared yet — be the first!
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {gallery.map((scene) => (
                <a
                  key={scene.id}
                  href={`/shared/${scene.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex rounded-lg border border-studio-border bg-studio-surface p-2.5 text-left transition hover:border-studio-accent hover:bg-studio-surface/80"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[11px] font-medium text-studio-text">
                      {scene.name}
                    </p>
                    <p className="text-[10px] text-studio-muted">by {scene.author}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="text-[9px] text-studio-muted flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" /> {timeAgo(scene.createdAt)}
                    </span>
                    <span className="text-[9px] text-studio-muted">{scene.views} views</span>
                  </div>
                </a>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
