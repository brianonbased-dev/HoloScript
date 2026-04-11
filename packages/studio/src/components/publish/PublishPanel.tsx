'use client';

/**
 * PublishPanel — Two-step publish flow: Extract -> Review -> Publish
 *
 * Step 1 (Extract): Calls POST /api/extract to preview traits, content hash,
 *   and revenue distribution before the user commits to publishing.
 * Step 2 (Publish): Calls POST /api/publish to register the scene in the
 *   protocol, store it, and return a public URL.
 *
 * Wires Studio to the HoloScript Publishing Protocol:
 *   ProtocolRegistry (Zora 1155) -> RevenueSplitter -> Public Scene URL
 */

import { useState, useCallback } from 'react';
import {
  X,
  Globe,
  Lock,
  Link,
  Check,
  Sparkles,
  Upload,
  Loader2,
  Eye,
  Hash,
  Code2,
  Layers,
  DollarSign,
  AlertCircle,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { useSceneStore } from '@/lib/stores';
import { SAVE_FEEDBACK_DURATION } from '@/lib/ui-timings';

interface PublishPanelProps {
  onClose: () => void;
}

type Visibility = 'public' | 'private' | 'unlisted';
type Stage = 'form' | 'extracting' | 'preview' | 'publishing' | 'done' | 'error';

interface ExtractionResult {
  contentHash: string;
  traits: string[];
  objectCount: number;
  importCount: number;
  codeLength: number;
  alreadyPublished: boolean;
  existingUrl: string | null;
  revenue: {
    totalPrice: string;
    flows: Array<{ recipient: string; amount: string; reason: string; bps: number }>;
  } | null;
}

interface PublishResult {
  url: string;
  sceneId: string;
  contentHash: string;
  embedUrl: string;
  traits: string[];
  visibility: string;
  revenue: Record<string, unknown> | null;
}

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
  const code = useSceneStore((s) => s.code);
  const metadata = useSceneStore((s) => s.metadata);

  const [title, setTitle] = useState(metadata.name || 'My World');
  const [desc, setDesc] = useState('');
  const [author, setAuthor] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [price, _setPrice] = useState('0');

  const [stage, setStage] = useState<Stage>('form');
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [errMsg, setErrMsg] = useState('');
  const [copying, setCopying] = useState(false);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  // Step 1: Extract traits and preview before publishing
  const handleExtract = useCallback(async () => {
    setStage('extracting');
    setErrMsg('');
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          author: author || 'anonymous',
          price: price !== '0' ? price : '0',
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `Extract failed (${res.status})`);
      }
      const data = (await res.json()) as ExtractionResult;
      setExtraction(data);
      setStage('preview');
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setStage('error');
    }
  }, [code, author, price]);

  // Step 2: Publish to protocol
  const handlePublish = useCallback(async () => {
    setStage('publishing');
    setErrMsg('');
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          title,
          author: author || 'anonymous',
          license: 'free',
          price: price !== '0' ? price : '0',
          visibility,
          tags: [...selectedTags],
          metadata: { name: title, description: desc },
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `Publish failed (${res.status})`);
      }
      const data = (await res.json()) as PublishResult;
      setPublishResult(data);
      setStage('done');
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setStage('error');
    }
  }, [code, title, desc, author, price, visibility, selectedTags]);

  const handleCopy = useCallback(() => {
    if (!publishResult?.url) return;
    navigator.clipboard.writeText(publishResult.url).then(() => {
      setCopying(true);
      setTimeout(() => setCopying(false), SAVE_FEEDBACK_DURATION);
    });
  }, [publishResult]);

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
      <div className="relative w-full max-w-md rounded-2xl border border-studio-border bg-studio-panel shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-studio-border bg-studio-panel px-6 py-4">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-studio-accent" />
            <p className="text-sm font-semibold text-studio-text">
              {stage === 'done'
                ? 'Published!'
                : stage === 'preview'
                  ? 'Review & Publish'
                  : 'Publish to HoloScript Protocol'}
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
          {/* ─── FORM STAGE ─── */}
          {stage === 'form' && (
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
                  placeholder="Describe what players will experience..."
                />
              </div>

              {/* Author */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-studio-muted">
                  Author <span className="text-studio-muted/50">(optional)</span>
                </label>
                <input
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="w-full rounded-lg border border-studio-border bg-black/20 px-3 py-2 text-sm text-studio-text outline-none focus:border-studio-accent"
                  placeholder="Your name or wallet address"
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

              {/* Extract + Preview button */}
              <button
                onClick={handleExtract}
                disabled={!title.trim() || !code.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-studio-accent py-2.5 text-sm font-semibold text-white shadow-lg shadow-studio-accent/30 transition hover:bg-studio-accent/80 disabled:opacity-40"
              >
                <Eye className="h-4 w-4" />
                Preview & Extract
              </button>
            </>
          )}

          {/* ─── EXTRACTING STAGE ─── */}
          {stage === 'extracting' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-studio-accent" />
              <p className="text-sm text-studio-muted">Extracting traits & provenance...</p>
            </div>
          )}

          {/* ─── PREVIEW STAGE ─── */}
          {stage === 'preview' && extraction && (
            <>
              {/* Already published warning */}
              {extraction.alreadyPublished && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-amber-300">Already Published</p>
                    <p className="text-[10px] text-amber-400/80">
                      This exact code has been published before.{' '}
                      {extraction.existingUrl && (
                        <a
                          href={extraction.existingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:text-amber-300"
                        >
                          View existing
                        </a>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* Content hash */}
              <div className="rounded-lg border border-studio-border bg-black/20 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Hash className="h-3.5 w-3.5 text-studio-accent" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-studio-muted">
                    Content Hash (SHA-256)
                  </span>
                </div>
                <p className="font-mono text-[10px] text-studio-text/70 break-all">
                  {extraction.contentHash}
                </p>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-studio-border bg-black/20 p-2.5 text-center">
                  <Code2 className="mx-auto h-4 w-4 text-studio-accent mb-1" />
                  <p className="text-lg font-bold text-studio-text">{extraction.traits.length}</p>
                  <p className="text-[9px] text-studio-muted">Traits</p>
                </div>
                <div className="rounded-lg border border-studio-border bg-black/20 p-2.5 text-center">
                  <Layers className="mx-auto h-4 w-4 text-studio-accent mb-1" />
                  <p className="text-lg font-bold text-studio-text">{extraction.objectCount}</p>
                  <p className="text-[9px] text-studio-muted">Objects</p>
                </div>
                <div className="rounded-lg border border-studio-border bg-black/20 p-2.5 text-center">
                  <DollarSign className="mx-auto h-4 w-4 text-studio-accent mb-1" />
                  <p className="text-lg font-bold text-studio-text">
                    {extraction.codeLength.toLocaleString()}
                  </p>
                  <p className="text-[9px] text-studio-muted">Chars</p>
                </div>
              </div>

              {/* Trait list */}
              {extraction.traits.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-studio-muted">
                    Detected Traits
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {extraction.traits.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-studio-accent/10 border border-studio-accent/20 px-2 py-0.5 text-[10px] font-mono text-studio-accent"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Revenue preview */}
              {extraction.revenue && (
                <div className="rounded-lg border border-studio-border bg-black/20 p-3">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-studio-muted">
                    Revenue Distribution
                  </p>
                  <div className="space-y-1">
                    {extraction.revenue.flows.map((flow, i) => (
                      <div key={i} className="flex justify-between text-[10px]">
                        <span className="text-studio-muted">{flow.reason}</span>
                        <span className="text-studio-text font-mono">
                          {flow.amount} ({(flow.bps / 100).toFixed(1)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => setStage('form')}
                  className="flex-1 rounded-xl border border-studio-border py-2.5 text-sm text-studio-muted hover:text-studio-text hover:bg-white/5 transition"
                >
                  Back
                </button>
                <button
                  onClick={handlePublish}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-studio-accent py-2.5 text-sm font-semibold text-white shadow-lg shadow-studio-accent/30 transition hover:bg-studio-accent/80"
                >
                  <Sparkles className="h-4 w-4" />
                  Publish
                </button>
              </div>
            </>
          )}

          {/* ─── PUBLISHING STAGE ─── */}
          {stage === 'publishing' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-studio-accent" />
              <p className="text-sm text-studio-muted">Publishing to protocol...</p>
            </div>
          )}

          {/* ─── DONE STAGE ─── */}
          {stage === 'done' && publishResult && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
                <Check className="h-8 w-8 text-emerald-400" />
              </div>
              <div>
                <p className="text-base font-semibold text-studio-text">
                  &quot;{title}&quot; is live!
                </p>
                <p className="mt-1 text-xs text-studio-muted">
                  {visibility === 'public'
                    ? 'Anyone can view and interact with your scene'
                    : 'Share the link with anyone you want'}
                </p>
              </div>

              {/* Content hash */}
              <div className="w-full rounded-lg border border-studio-border bg-black/20 px-3 py-2">
                <p className="mb-0.5 text-[9px] text-studio-muted">Content Hash</p>
                <p className="font-mono text-[10px] text-studio-text/60 truncate">
                  {publishResult.contentHash}
                </p>
              </div>

              {/* Share URL */}
              <div className="w-full rounded-lg border border-studio-border bg-black/20 px-3 py-2">
                <p className="mb-1 text-[10px] text-studio-muted">Share Link</p>
                <div className="flex items-center gap-2">
                  <p className="flex-1 truncate font-mono text-xs text-studio-accent">
                    {publishResult.url}
                  </p>
                  <button
                    onClick={handleCopy}
                    className="rounded-md bg-studio-accent/20 px-2.5 py-1 text-xs font-medium text-studio-accent transition hover:bg-studio-accent/30"
                  >
                    {copying ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </button>
                  <a
                    href={publishResult.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md bg-studio-accent/20 px-2.5 py-1 text-xs font-medium text-studio-accent transition hover:bg-studio-accent/30"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>

              {/* Embed URL */}
              {publishResult.embedUrl && (
                <div className="w-full rounded-lg border border-studio-border bg-black/20 px-3 py-2">
                  <p className="mb-1 text-[10px] text-studio-muted">Embed URL</p>
                  <p className="font-mono text-[10px] text-studio-text/60 truncate">
                    {publishResult.embedUrl}
                  </p>
                </div>
              )}

              {/* Traits */}
              {publishResult.traits.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1">
                  {publishResult.traits.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-mono text-emerald-400"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}

              <button
                onClick={onClose}
                className="text-xs text-studio-muted transition hover:text-studio-text"
              >
                Back to Studio
              </button>
            </div>
          )}

          {/* ─── ERROR STAGE ─── */}
          {stage === 'error' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
                <AlertCircle className="h-6 w-6 text-red-400" />
              </div>
              <p className="text-sm text-red-400">{errMsg}</p>
              <button
                onClick={() => setStage('form')}
                className="rounded-lg bg-studio-surface px-4 py-2 text-sm text-studio-muted hover:bg-studio-border transition"
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
