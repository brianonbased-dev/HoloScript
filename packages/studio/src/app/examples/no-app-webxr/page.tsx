'use client';

/**
 * /examples/no-app-webxr — Public demonstration of no-app WebXR launch.
 *
 * A self-contained page with a hardcoded HoloScript scene rendered via
 * ImmersiveViewer. Shows how a published scene launches on phone,
 * desktop, and headset without any app installation.
 *
 * See: competitor-gap CG-006 (8th Wall no-app WebAR activation bar)
 */

import { useState } from 'react';
import { Smartphone, Monitor, Headset, QrCode, Globe, Share2, Copy, Check } from 'lucide-react';
import { QRCodeImage } from '@/components/QRCodeImage';
import { ImmersiveViewer } from '@/app/shared/[id]/ImmersiveViewer.client';
import { COPY_FEEDBACK_DURATION } from '@/lib/ui-timings';

const DEMO_SCENE = `composition "No-App WebXR Demo" {
  object "RedSphere" {
    type: "sphere"
    position: [0, 1.5, 0]
    scale: [1, 1, 1]
    color: "#ff3366"
  }
  object "BlueCube" {
    type: "cube"
    position: [-1.5, 0.5, 0]
    scale: [0.8, 0.8, 0.8]
    color: "#3366ff"
  }
  object "GreenCylinder" {
    type: "cylinder"
    position: [1.5, 0.5, 0]
    scale: [0.6, 1, 0.6]
    color: "#33ff66"
  }
  object "YellowTorus" {
    type: "torus"
    position: [0, 2.2, -1]
    scale: [0.5, 0.5, 0.5]
    color: "#ffcc00"
  }
  object "PurpleCapsule" {
    type: "capsule"
    position: [0, 0.6, 1.5]
    scale: [0.5, 0.8, 0.5]
    color: "#a855f7"
  }
}`;

export default function NoAppWebXRExamplePage() {
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!pageUrl) return;
    navigator.clipboard.writeText(pageUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION);
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a12] text-studio-text">
      {/* Header */}
      <header className="border-b border-studio-border bg-studio-panel/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4">
          <a
            href="/"
            className="flex items-center gap-2 text-studio-muted transition hover:text-studio-text"
          >
            <Globe className="h-5 w-5 text-studio-accent" />
            <span className="font-bold tracking-tight">HoloScript Studio</span>
          </a>
          <span className="text-studio-border">/</span>
          <span className="text-studio-muted">Examples</span>
          <span className="text-studio-border">/</span>
          <span className="truncate text-studio-text font-medium">No-App WebXR</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {/* Hero */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">No-App WebXR Launch</h1>
          <p className="mt-2 text-sm text-studio-muted">
            Open this page on any device — phone, desktop, or VR headset — and enter
            immersive mode with zero installation.
          </p>
        </div>

        {/* Device grid */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-studio-border bg-studio-panel p-4">
            <div className="mb-2 flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-studio-accent" />
              <span className="text-sm font-semibold">Phone</span>
            </div>
            <p className="text-[11px] text-studio-muted">
              Tap the 3D preview to orbit. On Android, tap “Enter VR” to launch
              Cardboard or Daydream mode.
            </p>
          </div>
          <div className="rounded-xl border border-studio-border bg-studio-panel p-4">
            <div className="mb-2 flex items-center gap-2">
              <Monitor className="h-4 w-4 text-studio-accent" />
              <span className="text-sm font-semibold">Desktop</span>
            </div>
            <p className="text-[11px] text-studio-muted">
              Click and drag to rotate. Click “Enter VR” to start a SteamVR or
              OpenXR session via the browser.
            </p>
          </div>
          <div className="rounded-xl border border-studio-border bg-studio-panel p-4">
            <div className="mb-2 flex items-center gap-2">
              <Headset className="h-4 w-4 text-studio-accent" />
              <span className="text-sm font-semibold">Headset</span>
            </div>
            <p className="text-[11px] text-studio-muted">
              Open in Quest Browser or Safari on Vision Pro. Auto-enters immersive
              VR within 2 seconds — no sideloading required.
            </p>
          </div>
        </div>

        {/* 3D Preview + WebXR */}
        <div className="mb-8">
          <ImmersiveViewer code={DEMO_SCENE} name="No-App WebXR Demo" />
        </div>

        {/* Share section */}
        <div className="flex flex-col items-center gap-4 rounded-xl border border-studio-border bg-studio-panel p-6">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-studio-accent" />
            <span className="text-sm font-semibold">Share this example</span>
          </div>

          <div className="flex w-full max-w-md items-center gap-2 rounded-lg border border-studio-border bg-studio-surface px-3 py-2">
            <span className="flex-1 truncate text-xs text-studio-muted">{pageUrl || 'Loading…'}</span>
            <button
              onClick={handleCopy}
              className="shrink-0 text-studio-muted hover:text-studio-accent transition"
              disabled={!pageUrl}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-studio-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {pageUrl && (
            <QRCodeImage
              url={pageUrl}
              size={140}
              className="rounded-lg border border-studio-border"
            />
          )}

          <p className="text-[11px] text-studio-muted text-center">
            Scan to open on your phone or headset.
          </p>
        </div>

        {/* How it works */}
        <div className="mt-8 rounded-xl border border-studio-border bg-studio-panel p-6">
          <h2 className="mb-3 text-sm font-semibold">How it works</h2>
          <ol className="list-decimal space-y-2 pl-4 text-[11px] text-studio-muted">
            <li>
              The scene is authored in HoloScript Studio and published to a
              shareable URL via <code className="rounded bg-studio-surface px-1 py-0.5 text-studio-text">/api/share</code>.
            </li>
            <li>
              The <code className="rounded bg-studio-surface px-1 py-0.5 text-studio-text">/shared/&lt;id&gt;</code> page uses <code className="rounded bg-studio-surface px-1 py-0.5 text-studio-text">ImmersiveViewer</code>, which
              compiles the HoloScript source client-side with
              <code className="rounded bg-studio-surface px-1 py-0.5 text-studio-text">@holoscript/core</code> and renders it with three.js.
            </li>
            <li>
              On Quest Browser, the viewer auto-detects WebXR support and
              auto-enters <code className="rounded bg-studio-surface px-1 py-0.5 text-studio-text">immersive-vr</code> within 1.5 seconds. On other
              devices, the user taps “Enter VR” or “Enter AR”.
            </li>
            <li>
              Inside VR, the scene includes a 3D “Publish” button. Pointing
              at it with a controller generates a QR code with the share URL,
              so another user can scan it with their phone to join.
            </li>
            <li>
              No app store, no download, no install — just a URL that works
              everywhere WebXR is supported.
            </li>
          </ol>
        </div>

        {/* CTA */}
        <div className="mt-8 text-center">
          <a
            href="/create"
            className="inline-flex items-center gap-2 rounded-xl bg-studio-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            <Globe className="h-4 w-4" />
            Create your own scene →
          </a>
        </div>
      </main>
    </div>
  );
}
