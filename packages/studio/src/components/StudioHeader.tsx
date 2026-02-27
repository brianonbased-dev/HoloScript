'use client';

<<<<<<< HEAD
import { ArrowLeft, Glasses, Upload, Zap, BarChart2, X } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAIStore, useSceneStore, useEditorStore } from '@/lib/store';
import { SaveBar } from '@/components/SaveBar';
import { CollabBar } from '@/components/collaboration/CollabBar';
import { xrStore } from '@/components/vr/VREditSession';
import { StudioModeSwitcher } from '@/components/StudioModeSwitcher';
import dynamic from 'next/dynamic';
import { useGlobalHotkeys } from '@/hooks/useGlobalHotkeys';

const PublishPanel = dynamic(() => import('@/components/publish/PublishPanel').then((m) => ({ default: m.PublishPanel })), { ssr: false });
const BenchmarkScene = dynamic(() => import('@/components/perf/BenchmarkScene'), { ssr: false });

export function StudioHeader() {
  const ollamaStatus = useAIStore((s) => s.ollamaStatus);
  const metadata = useSceneStore((s) => s.metadata);
  const isDirty = useSceneStore((s) => s.isDirty);
  const setMetadata = useSceneStore((s) => s.setMetadata);

  const studioMode = useEditorStore((s) => s.studioMode);
  const showBenchmark = useEditorStore((s) => s.showBenchmark);
  const showPerfOverlay = useEditorStore((s) => s.showPerfOverlay);
  const setShowBenchmark = useEditorStore((s) => s.setShowBenchmark);
  const togglePerfOverlay = useEditorStore((s) => s.togglePerfOverlay);

  const [xrSupported, setXrSupported] = useState(false);
  const [xrActive, setXrActive] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [hotkeyOverlayOpen, setHotkeyOverlayOpen] = useState(false);

  // ── Global keyboard shortcuts ───────────────────────────────────────────────
  useGlobalHotkeys({ onOpenHelp: () => setHotkeyOverlayOpen((v) => !v) });

  const isExpert = studioMode === 'expert';

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'xr' in navigator) {
      navigator.xr?.isSessionSupported('immersive-vr').then((ok) => setXrSupported(ok));
    }
  }, []);

  const toggleVR = () => {
    if (xrActive) {
      xrStore.getState().session?.end();
      setXrActive(false);
    } else {
      xrStore.enterVR().then(() => setXrActive(true)).catch(() => {});
    }
  };

  return (
    <>
      <header className="grid h-12 grid-cols-[1fr_auto_1fr] items-center border-b border-studio-border bg-studio-panel px-4 gap-2">
      {/* Left: back link + scene name */}
      <div className="flex items-center gap-3 min-w-0">
        <Link href="/" className="text-studio-muted transition hover:text-studio-text shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-sm font-semibold hidden sm:inline shrink-0">
          HoloScript <span className="text-studio-accent">Studio</span>
        </span>
        <span className="text-xs text-studio-muted hidden sm:inline shrink-0">|</span>
=======
import { Save, Download, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useAIStore, useSceneStore } from '@/lib/store';
import { saveProject } from '@/lib/storage';
import { generateId } from '@/lib/storage';
import { useCallback, useState } from 'react';

export function StudioHeader() {
  const ollamaStatus = useAIStore((s) => s.ollamaStatus);
  const code = useSceneStore((s) => s.code);
  const metadata = useSceneStore((s) => s.metadata);
  const isDirty = useSceneStore((s) => s.isDirty);
  const markClean = useSceneStore((s) => s.markClean);
  const setMetadata = useSceneStore((s) => s.setMetadata);
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!code) return;
    setSaving(true);
    const id = metadata.id || generateId();
    if (!metadata.id) setMetadata({ id });
    await saveProject({
      id,
      name: metadata.name,
      code,
      metadata: { ...metadata, id, updatedAt: new Date().toISOString() },
    });
    markClean();
    setSaving(false);
  }, [code, metadata, markClean, setMetadata]);

  const handleDownload = useCallback(() => {
    if (!code) return;
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metadata.name.replace(/\s+/g, '-').toLowerCase()}.holo`;
    a.click();
    URL.revokeObjectURL(url);
  }, [code, metadata.name]);

  return (
    <header className="flex h-12 items-center justify-between border-b border-studio-border bg-studio-panel px-4">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-studio-muted transition hover:text-studio-text">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-sm font-semibold">
          HoloScript <span className="text-studio-accent">Studio</span>
        </span>
        <span className="text-xs text-studio-muted">|</span>
>>>>>>> feature/docs-examples-misc
        <input
          type="text"
          value={metadata.name}
          onChange={(e) => setMetadata({ name: e.target.value })}
<<<<<<< HEAD
          className="min-w-0 w-28 bg-transparent text-sm text-studio-text outline-none truncate"
          placeholder="Untitled Scene"
        />
        {isDirty && (
          <span className="h-2 w-2 rounded-full bg-studio-warning shrink-0" title="Unsaved changes" />
        )}
      </div>

      {/* Center: Studio Mode Switcher */}
      <div className="flex justify-center">
        <StudioModeSwitcher />
      </div>

      {/* Right: status + Expert tools + VR + collab + save */}
      <div className="flex items-center justify-end gap-3">
        {/* Ollama status */}
        <div className="flex items-center gap-1.5 text-xs text-studio-muted">
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${
=======
          className="bg-transparent text-sm text-studio-text outline-none"
          placeholder="Untitled Scene"
        />
        {isDirty && (
          <span className="h-2 w-2 rounded-full bg-studio-warning" title="Unsaved changes" />
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Ollama status */}
        <div className="flex items-center gap-1.5 text-xs text-studio-muted">
          <span
            className={`h-2 w-2 rounded-full ${
>>>>>>> feature/docs-examples-misc
              ollamaStatus === 'connected'
                ? 'bg-studio-success'
                : ollamaStatus === 'checking'
                  ? 'bg-studio-warning animate-pulse'
                  : 'bg-studio-error'
            }`}
          />
<<<<<<< HEAD
          <span className="hidden lg:inline">
            {ollamaStatus === 'connected'
              ? 'AI Ready'
              : ollamaStatus === 'checking'
                ? 'Checking...'
                : 'AI Offline'}
          </span>
        </div>

        {/* ── Expert-only tools ─────────────────────────────────── */}
        {isExpert && (
          <>
            {/* Perf Overlay toggle */}
            <button
              onClick={togglePerfOverlay}
              title={showPerfOverlay ? 'Hide FPS overlay' : 'Show FPS overlay'}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                showPerfOverlay
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                  : 'border border-studio-border bg-studio-surface text-studio-muted hover:border-violet-500/40 hover:text-violet-400'
              }`}
            >
              <BarChart2 className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Perf</span>
            </button>

            {/* Benchmark */}
            <button
              onClick={() => setShowBenchmark(true)}
              title="Open Performance Benchmark"
              className="flex items-center gap-1.5 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1 text-xs font-medium text-studio-muted transition hover:border-amber-500/40 hover:text-amber-400"
            >
              <Zap className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Benchmark</span>
            </button>
          </>
        )}

        {/* Enter VR */}
        {xrSupported && (
          <button
            onClick={toggleVR}
            title={xrActive ? 'Exit VR' : 'Enter VR'}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              xrActive
                ? 'bg-studio-accent text-white shadow-lg shadow-studio-accent/30'
                : 'border border-studio-border bg-studio-surface text-studio-muted hover:border-studio-accent/40 hover:text-studio-accent'
            }`}
          >
            <Glasses className="h-3.5 w-3.5" />
            {xrActive ? 'Exit VR' : 'Enter VR'}
          </button>
        )}

        {/* Collaboration */}
        <CollabBar />

        {/* Publish button */}
        <button
          onClick={() => setPublishOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/30"
        >
          <Upload className="h-3.5 w-3.5" />
          Publish
        </button>

        {/* Save / Open / Share / Export */}
        <SaveBar />
      </div>
    </header>

    {publishOpen && <PublishPanel onClose={() => setPublishOpen(false)} />}

    {/* ── Benchmark drawer (full-screen overlay, Expert mode) ───── */}
    {showBenchmark && (
      <div className="fixed inset-0 z-50 flex flex-col bg-studio-bg/95 backdrop-blur-sm">
        {/* Drawer header */}
        <div className="flex h-10 items-center justify-between border-b border-studio-border bg-studio-panel px-4">
          <span className="text-sm font-semibold text-studio-text">⚡ Performance Benchmark</span>
          <button
            onClick={() => setShowBenchmark(false)}
            className="rounded p-1 text-studio-muted transition hover:bg-studio-surface hover:text-studio-text"
            title="Close benchmark"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Benchmark content */}
        <div className="flex-1 overflow-hidden">
          <BenchmarkScene />
        </div>
      </div>
    )}
  </>
=======
          {ollamaStatus === 'connected'
            ? 'AI Ready'
            : ollamaStatus === 'checking'
              ? 'Checking...'
              : 'AI Offline'}
        </div>

        {/* Actions */}
        <button
          onClick={handleSave}
          disabled={!code || saving}
          className="flex items-center gap-1.5 rounded-md bg-studio-surface px-3 py-1.5 text-xs text-studio-text transition hover:bg-studio-border disabled:opacity-30"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={handleDownload}
          disabled={!code}
          className="flex items-center gap-1.5 rounded-md bg-studio-surface px-3 py-1.5 text-xs text-studio-text transition hover:bg-studio-border disabled:opacity-30"
        >
          <Download className="h-3.5 w-3.5" />
          .holo
        </button>
      </div>
    </header>
>>>>>>> feature/docs-examples-misc
  );
}
