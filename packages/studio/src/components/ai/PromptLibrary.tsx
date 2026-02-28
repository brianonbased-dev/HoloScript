'use client';

/**
 * PromptLibrary — curated prompt gallery for Brittney AI.
 * Browse, search, and one-click insert prompts into the AI chat.
 */

import { useState } from 'react';
import { Sparkles, X, Search, Send, BookOpen, Zap, Gamepad2, Palette, Building2, Wrench, GraduationCap } from 'lucide-react';
import { usePromptLibrary, type Prompt } from '@/hooks/usePromptLibrary';

const CATEGORY_ICON: Record<string, React.ReactNode> = {
  'Scene Building': <Building2 className="h-3 w-3" />,
  'Physics & Simulation': <Zap className="h-3 w-3" />,
  'Game Mechanics': <Gamepad2 className="h-3 w-3" />,
  'Visual Effects': <Palette className="h-3 w-3" />,
  'Architecture & Design': <Building2 className="h-3 w-3" />,
  'Modify & Enhance': <Wrench className="h-3 w-3" />,
  'Learning & Reference': <GraduationCap className="h-3 w-3" />,
};

const DIFFICULTY_COLOR: Record<string, string> = {
  beginner: 'text-green-400 bg-green-500/10 border-green-500/30',
  intermediate: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  advanced: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
};

interface PromptLibraryProps {
  onClose: () => void;
  onUsePrompt: (prompt: string) => void;
}

export function PromptLibrary({ onClose, onUsePrompt }: PromptLibraryProps) {
  const [q, setQ] = useState('');
  const { prompts, categories, total, activeCategory, loading, search } = usePromptLibrary();
  const [used, setUsed] = useState<string | null>(null);

  const handleUse = (p: Prompt) => {
    onUsePrompt(p.prompt);
    setUsed(p.id);
    setTimeout(() => setUsed(null), 2000);
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Sparkles className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Prompt Library</span>
        <span className="ml-1 rounded-full bg-studio-surface px-1.5 py-0.5 text-[9px] text-studio-muted">{total}</span>
        <button onClick={onClose} className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="shrink-0 border-b border-studio-border p-2.5 space-y-2">
        <div className="flex items-center gap-2 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-studio-muted" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); search(e.target.value); }}
            placeholder="Search prompts… (e.g. physics, fire, NPC)"
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
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] border transition ${
                activeCategory === cat
                  ? 'border-studio-accent bg-studio-accent/20 text-studio-accent'
                  : 'border-studio-border bg-studio-surface text-studio-muted hover:text-studio-text'
              }`}
            >
              {CATEGORY_ICON[cat] ?? <BookOpen className="h-3 w-3" />} {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt list */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
        {loading && <p className="py-8 text-center text-[10px] text-studio-muted animate-pulse">Loading prompts…</p>}
        {!loading && prompts.length === 0 && (
          <p className="py-8 text-center text-[10px] text-studio-muted">No prompts found.</p>
        )}
        {prompts.map((p) => (
          <div
            key={p.id}
            className="rounded-xl border border-studio-border bg-studio-surface p-2.5 transition hover:border-studio-accent/40"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] font-semibold text-studio-text truncate">{p.title}</p>
                  <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-medium ${DIFFICULTY_COLOR[p.difficulty] ?? ''}`}>
                    {p.difficulty}
                  </span>
                </div>
                <p className="mt-0.5 text-[9px] text-studio-muted">{p.description}</p>
              </div>
            </div>
            {/* Prompt text */}
            <div className="mt-1.5 rounded-lg bg-black/20 px-2 py-1.5">
              <p className="text-[10px] leading-relaxed text-studio-text/70 italic">&ldquo;{p.prompt}&rdquo;</p>
            </div>
            {/* Tags + Use button */}
            <div className="mt-1.5 flex items-center gap-1">
              <div className="flex flex-1 flex-wrap gap-1">
                {p.tags.slice(0, 4).map((t) => (
                  <span key={t} className="rounded bg-studio-border/60 px-1 py-0.5 text-[8px] text-studio-muted">{t}</span>
                ))}
              </div>
              <button
                onClick={() => handleUse(p)}
                className={`flex shrink-0 items-center gap-1 rounded-lg px-3 py-1 text-[10px] font-semibold transition ${
                  used === p.id
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-studio-accent text-white hover:brightness-110'
                }`}
              >
                {used === p.id ? '✅ Sent!' : <><Send className="h-3 w-3" /> Use</>}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
