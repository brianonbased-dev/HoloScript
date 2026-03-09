'use client';

/**
 * ExampleGallery — in-IDE browser for .holo example files.
 * Search, filter by category, preview code, and one-click load into editor.
 */

import { useState } from 'react';
import { BookOpen, X, Search, ChevronRight, Code, FileCode } from 'lucide-react';
import { useExamples, type ExampleFile } from '@/hooks/useExamples';
import { useSceneStore } from '@/lib/stores';

const CATEGORY_EMOJI: Record<string, string> = {
  quickstart: '🚀',
  'sample-projects': '📁',
  'real-world': '🌍',
  platforms: '📱',
  templates: '🧩',
  hololand: '🌌',
  robotics: '🤖',
  root: '📄',
};

interface ExampleGalleryProps {
  onClose: () => void;
}

export function ExampleGallery({ onClose }: ExampleGalleryProps) {
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState<ExampleFile | null>(null);
  const { examples, categories, total, activeCategory, loading, error, search } = useExamples();
  const setCode = useSceneStore((s) => s.setCode);
  const [applied, setApplied] = useState<string | null>(null);

  const applyExample = (ex: ExampleFile) => {
    setCode(ex.code);
    setApplied(ex.id);
    setTimeout(() => setApplied(null), 2000);
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <BookOpen className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Examples</span>
        <span className="ml-1 rounded-full bg-studio-surface px-1.5 py-0.5 text-[9px] text-studio-muted">
          {total}
        </span>
        <button
          onClick={onClose}
          className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* If previewing code */}
      {preview ? (
        <div className="flex flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2">
            <button
              onClick={() => setPreview(null)}
              className="text-studio-muted hover:text-studio-text text-[10px]"
            >
              ← Back
            </button>
            <span className="text-[11px] font-semibold truncate">{preview.name}</span>
          </div>
          <pre className="flex-1 overflow-auto p-3 text-[10px] leading-relaxed font-mono text-studio-text/80 bg-black/20 whitespace-pre-wrap">
            {preview.code}
          </pre>
          <div className="shrink-0 border-t border-studio-border p-2.5">
            <button
              onClick={() => applyExample(preview)}
              className={`flex w-full items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-semibold transition ${
                applied === preview.id
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-studio-accent text-white hover:brightness-110'
              }`}
            >
              {applied === preview.id ? (
                '✅ Loaded!'
              ) : (
                <>
                  <ChevronRight className="h-3 w-3" /> Use This Example
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="shrink-0 border-b border-studio-border p-2.5 space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 text-studio-muted" />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  search(e.target.value);
                }}
                placeholder="Search examples… (e.g. @physics, robot, VR)"
                className="flex-1 bg-transparent text-[11px] outline-none placeholder-studio-muted/40"
              />
            </div>
            {/* Category pills */}
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => search(q, '')}
                className={`rounded-full px-2 py-0.5 text-[9px] border transition ${
                  activeCategory === ''
                    ? 'border-studio-accent bg-studio-accent/20 text-studio-accent'
                    : 'border-studio-border bg-studio-surface text-studio-muted hover:text-studio-text'
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => search(q, cat === activeCategory ? '' : cat)}
                  className={`rounded-full px-2 py-0.5 text-[9px] border transition ${
                    activeCategory === cat
                      ? 'border-studio-accent bg-studio-accent/20 text-studio-accent'
                      : 'border-studio-border bg-studio-surface text-studio-muted hover:text-studio-text'
                  }`}
                >
                  {CATEGORY_EMOJI[cat] ?? '📁'} {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Example list */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
            {loading && (
              <p className="py-8 text-center text-[10px] text-studio-muted animate-pulse">
                Loading examples…
              </p>
            )}
            {error && <p className="py-8 text-center text-[10px] text-red-400">{error}</p>}
            {!loading && !error && examples.length === 0 && (
              <p className="py-8 text-center text-[10px] text-studio-muted">No examples found.</p>
            )}
            {examples.map((ex) => (
              <div
                key={ex.id}
                className="rounded-xl border border-studio-border bg-studio-surface p-2.5 transition hover:border-studio-accent/40"
              >
                <div className="flex items-start gap-2">
                  <FileCode className="mt-0.5 h-4 w-4 shrink-0 text-studio-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-studio-text truncate">{ex.name}</p>
                    <p className="mt-0.5 text-[9px] text-studio-muted line-clamp-2">
                      {ex.description}
                    </p>
                    <div className="mt-1 flex items-center gap-1 flex-wrap">
                      <span className="rounded bg-studio-accent/10 px-1 py-0.5 text-[8px] text-studio-accent font-medium">
                        {CATEGORY_EMOJI[ex.category] ?? '📁'} {ex.category}
                      </span>
                      <span className="text-[8px] text-studio-muted">
                        {(ex.sizeBytes / 1024).toFixed(1)}KB
                      </span>
                      {ex.traits.slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="rounded bg-studio-border/60 px-1 py-0.5 text-[8px] text-studio-muted"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex gap-1">
                  <button
                    onClick={() => setPreview(ex)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-studio-border py-1 text-[10px] text-studio-muted hover:text-studio-text hover:border-studio-accent/40 transition"
                  >
                    <Code className="h-3 w-3" /> Preview
                  </button>
                  <button
                    onClick={() => applyExample(ex)}
                    className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1 text-[10px] font-semibold transition ${
                      applied === ex.id
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-studio-accent text-white hover:brightness-110'
                    }`}
                  >
                    {applied === ex.id ? (
                      '✅ Loaded!'
                    ) : (
                      <>
                        <ChevronRight className="h-3 w-3" /> Use
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
