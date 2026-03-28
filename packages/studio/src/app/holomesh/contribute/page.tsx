'use client';

/**
 * HoloMesh Contribute — /holomesh/contribute
 *
 * Form to submit new W/P/G knowledge entries to the mesh.
 * Follows HoloClaw's CreateSkillPanel pattern.
 */

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { KnowledgeEntryCard } from '@/components/holomesh/KnowledgeEntryCard';
import type { KnowledgeEntry, KnowledgeEntryType } from '@/components/holomesh/types';

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ContributePage() {
  const [entryType, setEntryType] = useState<KnowledgeEntryType>('wisdom');
  const [content, setContent] = useState('');
  const [domain, setDomain] = useState('');
  const [tags, setTags] = useState('');
  const [confidence, setConfidence] = useState(0.9);
  const [price, setPrice] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ entryId: string; provenanceHash: string } | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    setError('');
    setSuccess(null);

    try {
      const res = await fetch('/api/holomesh/contribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: entryType,
          content: content.trim(),
          domain: domain.trim() || undefined,
          tags: tags.trim() ? tags.split(',').map(t => t.trim()) : undefined,
          confidence,
          price,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'Failed to contribute');
        return;
      }

      setSuccess({ entryId: data.entryId, provenanceHash: data.provenanceHash });
      setContent('');
      setDomain('');
      setTags('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [content, entryType, domain, tags, confidence, price]);

  // Build preview entry
  const previewEntry: KnowledgeEntry | null = content.trim() ? {
    id: 'preview',
    workspaceId: 'ai-ecosystem',
    type: entryType,
    content: content.trim(),
    provenanceHash: '0'.repeat(64),
    authorId: 'you',
    authorName: 'You',
    price,
    queryCount: 0,
    reuseCount: 0,
    domain: domain.trim() || undefined,
    tags: tags.trim() ? tags.split(',').map(t => t.trim()) : undefined,
    confidence,
    createdAt: new Date().toISOString(),
  } : null;

  const typeOptions: { id: KnowledgeEntryType; label: string; description: string }[] = [
    { id: 'wisdom', label: 'Wisdom (W)', description: 'Hard-won insights and lessons learned' },
    { id: 'pattern', label: 'Pattern (P)', description: 'Reusable solutions and architectural patterns' },
    { id: 'gotcha', label: 'Gotcha (G)', description: 'Pitfalls, bugs, and things that break' },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-studio-bg text-studio-text">
      {/* Header */}
      <header className="shrink-0 border-b border-studio-border bg-[#0d0d14] px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/holomesh" className="text-studio-muted hover:text-studio-text transition-colors">
            &larr;
          </Link>
          <div>
            <h1 className="text-lg font-bold">Contribute Knowledge</h1>
            <p className="text-xs text-studio-muted">Share wisdom, patterns, or gotchas with the mesh</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Form */}
          <div className="flex flex-col gap-4">
            {/* Type selector */}
            <div>
              <h3 className="text-xs font-medium text-studio-muted mb-2">Entry Type</h3>
              <div className="grid grid-cols-3 gap-2">
                {typeOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setEntryType(opt.id)}
                    className={`rounded-lg border p-3 text-left transition-all ${
                      entryType === opt.id
                        ? 'border-studio-accent bg-studio-accent/10'
                        : 'border-studio-border bg-[#111827] hover:border-studio-accent/40'
                    }`}
                  >
                    <div className="text-sm font-medium text-studio-text">{opt.label}</div>
                    <div className="mt-1 text-[10px] text-studio-muted">{opt.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <label className="text-xs font-medium text-studio-muted">
              Content
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                placeholder="Write your knowledge entry..."
                className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none resize-y"
              />
            </label>

            {/* Domain + Tags */}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-studio-muted">
                Domain
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="e.g., security, rendering"
                  className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none"
                />
              </label>
              <label className="text-xs font-medium text-studio-muted">
                Tags (comma-separated)
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="e.g., mcp, vitest, safety"
                  className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none"
                />
              </label>
            </div>

            {/* Confidence + Price */}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-studio-muted">
                Confidence ({Math.round(confidence * 100)}%)
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={confidence}
                  onChange={(e) => setConfidence(parseFloat(e.target.value))}
                  className="mt-2 block w-full"
                />
              </label>
              <label className="text-xs font-medium text-studio-muted">
                Price (USD, 0 = free)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                  className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text focus:border-studio-accent focus:outline-none"
                />
              </label>
            </div>

            {/* Error / Success */}
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
            )}
            {success && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                Contributed! Entry <span className="font-mono">{success.entryId}</span> with provenance{' '}
                <span className="font-mono">{success.provenanceHash.slice(0, 12)}...</span>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={submitting || !content.trim()}
              className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              {submitting ? 'Contributing...' : 'Contribute to Mesh'}
            </button>
          </div>

          {/* Preview */}
          <div className="hidden lg:block">
            <h3 className="text-xs font-medium text-studio-muted mb-2 uppercase tracking-wider">Preview</h3>
            {previewEntry ? (
              <KnowledgeEntryCard entry={previewEntry} />
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-studio-border bg-[#111827] p-8 text-center">
                <p className="text-xs text-studio-muted">Start typing to see a preview</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
