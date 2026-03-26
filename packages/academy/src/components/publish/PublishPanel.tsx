'use client';

import { useState } from 'react';
import { X, Globe, Lock, Link, Check, Sparkles, Upload } from 'lucide-react';
import { useSceneStore } from '@/lib/stores';

interface PublishPanelProps {
  onClose: () => void;
}

type Visibility = 'public' | 'private' | 'unlisted';

const TAGS = [
  'Game',
  'Social',
  'Art',
  'D&D',
  'Sci-Fi',
  'Medieval',
  'Horror',
  'Racing',
  'Parkour',
  'Chill',
];

export function PublishPanel({ onClose }: PublishPanelProps) {
  const metadata = useSceneStore((s) => s.metadata);
  const [title, setTitle] = useState(metadata.name || 'My World');
  const [desc, setDesc] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [published, setPublished] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [copying, setCopying] = useState(false);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const handlePublish = () => {
    // Generate a stub share URL
    const id = Math.random().toString(36).substring(2, 10);
    const url = `https://hololand.app/worlds/${id}`;
    setShareUrl(url);
    setPublished(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        `published-${id}`,
        JSON.stringify({ title, desc, visibility, tags: [...selectedTags] })
      );
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopying(true);
      setTimeout(() => setCopying(false), 2000);
    });
  };

  const VISIBILITY_OPTIONS: {
    id: Visibility;
    label: string;
    icon: React.ReactNode;
    desc: string;
  }[] = [
    {
      id: 'public',
      label: 'Public',
      icon: <Globe className="h-4 w-4" />,
      desc: 'Anyone can find and play it',
    },
    {
      id: 'unlisted',
      label: 'Unlisted',
      icon: <Link className="h-4 w-4" />,
      desc: 'Only people with the link',
    },
    {
      id: 'private',
      label: 'Private',
      icon: <Lock className="h-4 w-4" />,
      desc: 'Only you can see it',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-studio-border bg-studio-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-studio-accent" />
            <p className="text-sm font-semibold text-studio-text">
              {published ? '🎉 Published!' : 'Publish to Hololand'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-studio-muted hover:bg-white/10 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {!published ? (
            <>
              {/* Title */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-studio-muted">
                  World Name
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-studio-border bg-black/20 px-3 py-2 text-sm text-studio-text outline-none focus:border-studio-accent"
                  placeholder="My Awesome World"
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-studio-muted">
                  Description <span className="text-studio-muted/50">(optional)</span>
                </label>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-studio-border bg-black/20 px-3 py-2 text-sm text-studio-text outline-none focus:border-studio-accent"
                  placeholder="Describe what players will experience…"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-studio-muted">
                  Tags
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {TAGS.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
                        selectedTags.has(tag)
                          ? 'border-studio-accent/60 bg-studio-accent/15 text-studio-accent'
                          : 'border-studio-border bg-black/20 text-studio-muted hover:text-studio-text'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Visibility */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-studio-muted">
                  Visibility
                </label>
                <div className="flex flex-col gap-1.5">
                  {VISIBILITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setVisibility(opt.id)}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all ${
                        visibility === opt.id
                          ? 'border-studio-accent/60 bg-studio-accent/10'
                          : 'border-studio-border bg-black/20 hover:bg-white/5'
                      }`}
                    >
                      <span
                        className={
                          visibility === opt.id ? 'text-studio-accent' : 'text-studio-muted'
                        }
                      >
                        {opt.icon}
                      </span>
                      <div>
                        <p className="text-xs font-medium text-studio-text">{opt.label}</p>
                        <p className="text-[10px] text-studio-muted">{opt.desc}</p>
                      </div>
                      {visibility === opt.id && (
                        <Check className="ml-auto h-4 w-4 text-studio-accent shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Publish button */}
              <button
                onClick={handlePublish}
                disabled={!title.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-studio-accent py-2.5 text-sm font-semibold text-white shadow-lg shadow-studio-accent/30 transition hover:bg-studio-accent/80 disabled:opacity-40"
              >
                <Sparkles className="h-4 w-4" />
                Publish World
              </button>
            </>
          ) : (
            /* Success state */
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-4xl">
                🎉
              </div>
              <div>
                <p className="text-base font-semibold text-studio-text">"{title}" is live!</p>
                <p className="mt-1 text-xs text-studio-muted">
                  {visibility === 'public'
                    ? 'Players can discover it on Hololand'
                    : 'Share the link with friends'}
                </p>
              </div>

              {/* Share URL */}
              <div className="w-full rounded-lg border border-studio-border bg-black/20 px-3 py-2">
                <p className="mb-1 text-[10px] text-studio-muted">Share Link</p>
                <div className="flex items-center gap-2">
                  <p className="flex-1 truncate font-mono text-xs text-studio-accent">{shareUrl}</p>
                  <button
                    onClick={handleCopy}
                    className="rounded-md bg-studio-accent/20 px-2.5 py-1 text-xs font-medium text-studio-accent transition hover:bg-studio-accent/30"
                  >
                    {copying ? <Check className="h-3 w-3" /> : 'Copy'}
                  </button>
                </div>
              </div>

              <button
                onClick={onClose}
                className="text-xs text-studio-muted transition hover:text-studio-text"
              >
                Back to Studio
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
