'use client';

/**
 * ExportModal — MP4 Export Dialog for TikTok/Social
 *
 * MEME-008: Export clip as MP4 with progress tracking
 */

import { useState } from 'react';
import { Download, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { ExportProgress, ExportResult } from '@/lib/videoExporter';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: ExportOptions) => Promise<void>;
  progress: ExportProgress | null;
  result: ExportResult | null;
  error: Error | null;
  exporting: boolean;
}

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  duration: number;
  format: 'mp4' | 'webm';
  codec: 'h264' | 'vp9' | 'av1';
  transparent: boolean;
}

const PRESETS = {
  tiktok: { width: 1080, height: 1080, label: 'TikTok Square (1080x1080)' },
  instagram: { width: 1080, height: 1350, label: 'Instagram Story (1080x1350)' },
  twitter: { width: 1280, height: 720, label: 'Twitter 16:9 (1280x720)' },
  youtube: { width: 1920, height: 1080, label: 'YouTube 1080p (1920x1080)' },
  custom: { width: 1080, height: 1080, label: 'Custom' },
};

export function ExportModal({
  isOpen,
  onClose,
  onExport,
  progress,
  result,
  error,
  exporting,
}: ExportModalProps) {
  const [preset, setPreset] = useState<keyof typeof PRESETS>('tiktok');
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1080);
  const [fps, setFps] = useState(30);
  const [duration, setDuration] = useState(3000); // 3 seconds default
  const [format, setFormat] = useState<'mp4' | 'webm'>('mp4');
  const [codec, setCodec] = useState<'h264' | 'vp9' | 'av1'>('h264');
  const [transparent, setTransparent] = useState(false);

  if (!isOpen) return null;

  const handlePresetChange = (newPreset: keyof typeof PRESETS) => {
    setPreset(newPreset);
    if (newPreset !== 'custom') {
      setWidth(PRESETS[newPreset].width);
      setHeight(PRESETS[newPreset].height);
    }
  };

  const handleExport = async () => {
    await onExport({
      width,
      height,
      fps,
      duration,
      format,
      codec,
      transparent,
    });
  };

  const handleDownload = () => {
    if (!result) return;

    const a = document.createElement('a');
    a.href = result.url;
    a.download = `meme-character-${Date.now()}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const stageLabels: Record<ExportProgress['stage'], string> = {
    preparing: 'Preparing canvas...',
    rendering: 'Rendering frames...',
    encoding: 'Encoding video...',
    complete: 'Export complete!',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-2xl border border-purple-500/30 bg-studio-panel p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/20 text-2xl">
              🎬
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Export to MP4</h2>
              <p className="text-xs text-studio-muted">Ready for TikTok, Instagram, Twitter</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-studio-muted transition-colors hover:bg-white/5 hover:text-white"
            disabled={exporting}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Export Settings */}
        {!exporting && !result && (
          <div className="space-y-4">
            {/* Preset */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-white">Platform</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(PRESETS).map(([key, { label }]) => (
                  <button
                    key={key}
                    onClick={() => handlePresetChange(key as keyof typeof PRESETS)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                      preset === key
                        ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                        : 'border-studio-border bg-black/20 text-studio-muted hover:border-purple-500/40'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Resolution */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Width</label>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                  disabled={preset !== 'custom'}
                  className="w-full rounded-lg border border-studio-border bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-purple-500 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Height</label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  disabled={preset !== 'custom'}
                  className="w-full rounded-lg border border-studio-border bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-purple-500 disabled:opacity-50"
                />
              </div>
            </div>

            {/* Duration & FPS */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">
                  Duration (seconds)
                </label>
                <input
                  type="number"
                  value={duration / 1000}
                  onChange={(e) => setDuration(Number(e.target.value) * 1000)}
                  min="0.5"
                  max="60"
                  step="0.5"
                  className="w-full rounded-lg border border-studio-border bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">FPS</label>
                <select
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                  className="w-full rounded-lg border border-studio-border bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                >
                  <option value="24">24 fps (Cinema)</option>
                  <option value="30">30 fps (Standard)</option>
                  <option value="60">60 fps (Smooth)</option>
                </select>
              </div>
            </div>

            {/* Format & Codec */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Format</label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as 'mp4' | 'webm')}
                  className="w-full rounded-lg border border-studio-border bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                >
                  <option value="mp4">MP4 (Best compatibility)</option>
                  <option value="webm">WebM (Better quality)</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Codec</label>
                <select
                  value={codec}
                  onChange={(e) => setCodec(e.target.value as 'h264' | 'vp9' | 'av1')}
                  className="w-full rounded-lg border border-studio-border bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                >
                  <option value="h264">H.264 (Best compatibility)</option>
                  <option value="vp9">VP9 (Better quality)</option>
                  <option value="av1">AV1 (Best quality, limited support)</option>
                </select>
              </div>
            </div>

            {/* Transparent background */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="transparent"
                checked={transparent}
                onChange={(e) => setTransparent(e.target.checked)}
                disabled={format !== 'webm'}
                className="h-4 w-4 rounded border-studio-border bg-black/40 text-purple-500 focus:ring-purple-500 disabled:opacity-50"
              />
              <label htmlFor="transparent" className="text-sm text-studio-muted">
                Transparent background (WebM only)
              </label>
            </div>

            {/* Export Button */}
            <button
              onClick={handleExport}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-500 px-6 py-3 font-semibold text-white transition-all hover:bg-purple-600 active:scale-95"
            >
              <Download className="h-5 w-5" />
              Export Video
            </button>
          </div>
        )}

        {/* Progress */}
        {exporting && progress && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
              <span className="text-sm font-semibold text-white">
                {stageLabels[progress.stage]}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-3 overflow-hidden rounded-full bg-gray-800">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                style={{ width: `${progress.progress * 100}%` }}
              />
            </div>

            {/* Stats */}
            <div className="flex items-center justify-between text-xs text-studio-muted">
              <span>
                Frame {progress.currentFrame} / {progress.totalFrames}
              </span>
              <span>{(progress.progress * 100).toFixed(0)}%</span>
              <span>{(progress.timeElapsed / 1000).toFixed(1)}s elapsed</span>
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
              <CheckCircle2 className="h-6 w-6 text-green-400" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-green-300">Export successful!</p>
                <p className="text-xs text-green-400/60">
                  {(result.size / 1024 / 1024).toFixed(2)} MB • {result.resolution.width}x
                  {result.resolution.height} • {result.format}
                </p>
              </div>
            </div>

            <button
              onClick={handleDownload}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-500 px-6 py-3 font-semibold text-white transition-all hover:bg-green-600 active:scale-95"
            >
              <Download className="h-5 w-5" />
              Download Video
            </button>

            <button
              onClick={onClose}
              className="w-full rounded-lg border border-studio-border bg-black/20 px-6 py-3 font-semibold text-studio-muted transition-colors hover:bg-white/5 hover:text-white"
            >
              Close
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <AlertCircle className="h-6 w-6 text-red-400" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-300">Export failed</p>
                <p className="text-xs text-red-400/60">{error.message}</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full rounded-lg border border-studio-border bg-black/20 px-6 py-3 font-semibold text-studio-muted transition-colors hover:bg-white/5 hover:text-white"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
