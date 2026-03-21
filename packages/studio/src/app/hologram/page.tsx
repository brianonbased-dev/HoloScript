'use client';

/**
 * Hologram — /hologram
 *
 * Drag-and-drop media-to-hologram converter page. Drop images, GIFs, or videos
 * to generate HoloScript composition code with depth estimation traits.
 * Previews the generated code and allows copying to clipboard.
 *
 * @module hologram/page
 */

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { Layers, Copy, Check, ArrowLeft } from 'lucide-react';
import { HologramDropZone } from '@/components/hologram/HologramDropZone';

export default function HologramPage() {
  const [compositionCode, setCompositionCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCompositionGenerated = useCallback((code: string) => {
    setCompositionCode(code);
    setCopied(false);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!compositionCode) return;
    try {
      await navigator.clipboard.writeText(compositionCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }, [compositionCode]);

  const handleReset = useCallback(() => {
    setCompositionCode(null);
    setCopied(false);
  }, []);

  return (
    <div className="min-h-screen bg-studio-bg text-studio-text">
      {/* Header */}
      <div className="border-b border-studio-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-studio-muted hover:text-studio-text transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Studio
          </Link>
          <span className="text-studio-border">/</span>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-purple-400" />
            <h1 className="text-lg font-semibold">Hologram Creator</h1>
          </div>
        </div>
        <p className="mt-1 text-sm text-studio-muted">
          Drop photos, GIFs, or videos to generate 3D hologram compositions
        </p>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-6 py-8">
        {compositionCode ? (
          <div className="flex flex-col gap-4">
            {/* Generated Code Preview */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-studio-text">Generated Composition</h2>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 rounded-md border border-studio-border px-3 py-1.5 text-xs font-medium text-studio-muted hover:text-studio-text transition"
                >
                  {copied ? (
                    <><Check className="h-3.5 w-3.5 text-green-400" /> Copied</>
                  ) : (
                    <><Copy className="h-3.5 w-3.5" /> Copy Code</>
                  )}
                </button>
                <button
                  onClick={handleReset}
                  className="rounded-md border border-studio-border px-3 py-1.5 text-xs font-medium text-studio-muted hover:text-studio-text transition"
                >
                  New Hologram
                </button>
              </div>
            </div>
            <pre className="overflow-auto rounded-lg border border-studio-border bg-black/40 p-4 text-xs leading-relaxed text-purple-300/90 font-mono">
              {compositionCode}
            </pre>
          </div>
        ) : (
          <HologramDropZone onCompositionGenerated={handleCompositionGenerated} />
        )}
      </div>
    </div>
  );
}
