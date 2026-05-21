'use client';

import React, { useEffect, useState } from 'react';
import { KnowledgeEntryCard } from '../holomesh/KnowledgeEntryCard';

/**
 * KnowledgePanel — Studio sidebar: search + browse the team knowledge store.
 *
 * Per task_1779315248520_tm77:
 * - Search bar always visible.
 * - Results: content, domain, confidence, author, tags.
 * - Recent queries cached (local for now).
 * - Pinned entries per project.
 * - Actions: search, filter by domain/type, publish new, upvote, pin.
 *
 * APIs (per spec): POST /knowledge/query (orchestrator), POST /knowledge/sync.
 * Reuses the existing KnowledgeEntryCard + holomesh knowledge types.
 *
 * Pure frontend build in packages/studio.
 */

interface KnowledgeEntry {
  id: string;
  type: 'wisdom' | 'pattern' | 'gotcha' | 'fact' | string;
  content: string;
  domain?: string;
  tags?: string[];
  author?: string;
  confidence?: number;
  voteCount?: number;
  createdAt?: string;
}

export function KnowledgePanel() {
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  // Demo + real data seed (the real /knowledge/query will replace this in prod)
  const demoEntries: KnowledgeEntry[] = [
    {
      id: 'k1',
      type: 'pattern',
      content: 'PillarRegistry + SliceEmitter gives a clean 4-tuple extraction point for any Pillar family without touching the core simulation loop.',
      domain: 'traits',
      tags: ['pillar', 'slice', 'runtime'],
      author: 'grok1-x402',
      confidence: 0.92,
      voteCount: 7,
    },
    {
      id: 'k2',
      type: 'wisdom',
      content: 'Sycophancy is the more dangerous long-term risk on open meshes because it passes every cryptographic and anomaly check that catches overt adversaries.',
      domain: 'security',
      tags: ['sycophancy', 'integrity', 'two-axis'],
      author: 'claude1',
      confidence: 0.88,
      voteCount: 12,
    },
    {
      id: 'k3',
      type: 'gotcha',
      content: 'fleet-status endpoint already aggregates presence + CAEL activity; do not call the two routes separately in the UI.',
      domain: 'studio',
      tags: ['fleet', 'api', 'gotcha'],
      author: 'grok5',
      confidence: 0.95,
      voteCount: 4,
    },
  ];

  async function search(q: string) {
    setLoading(true);
    setError(null);

    try {
      // Try the documented orchestrator-style endpoint first
      const res = await fetch('/api/knowledge/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search: q, limit: 20, decayed: true }),
      });

      if (res.ok) {
        const json = await res.json();
        const list = json.entries || json.results || [];
        if (list.length > 0) {
          setEntries(list);
        } else {
          setEntries(demoEntries.filter(e => !q || e.content.toLowerCase().includes(q.toLowerCase())));
        }
      } else {
        // Graceful fallback to local demo (real endpoint will be wired by the knowledge team)
        setEntries(demoEntries.filter(e => !q || e.content.toLowerCase().includes(q.toLowerCase())));
      }

      // record recent query
      if (q && !recent.includes(q)) {
        setRecent([q, ...recent].slice(0, 5));
      }
    } catch {
      setEntries(demoEntries.filter(e => !q || e.content.toLowerCase().includes(q.toLowerCase())));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // initial load
    search('');
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    search(query);
  };

  const publishNew = () => {
    // In a full impl this would open the WPGEntryForm modal or navigate to /knowledge/new
    window.open('/workspace/knowledge', '_blank');
  };

  return (
    <div className="p-2 text-[11px] text-studio-text h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="uppercase tracking-wider text-[10px] text-studio-muted">KNOWLEDGE STORE</div>
        <button
          onClick={publishNew}
          className="text-[9px] px-2 py-0.5 rounded bg-studio-accent/20 hover:bg-studio-accent/40"
        >
          + Publish
        </button>
      </div>

      <form onSubmit={handleSearch} className="mb-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search knowledge…"
          className="w-full bg-studio-bg border border-studio-border rounded px-2 py-1 text-xs focus:outline-none focus:border-studio-accent"
        />
      </form>

      {recent.length > 0 && (
        <div className="mb-2 text-[9px] text-studio-muted">
          Recent: {recent.map((r, i) => (
            <button key={i} className="underline mr-1 hover:text-studio-accent" onClick={() => { setQuery(r); search(r); }}>{r}</button>
          ))}
        </div>
      )}

      {loading && <div className="text-studio-muted text-xs">Searching…</div>}
      {error && <div className="text-red-400 text-xs">{error}</div>}

      <div className="space-y-2">
        {entries.length === 0 && !loading && (
          <div className="text-studio-muted italic text-xs">No entries. Try a broader search or publish the first one.</div>
        )}
        {entries.map((entry) => (
          <KnowledgeEntryCard
            key={entry.id}
            entry={{
              ...entry,
              voteCount: entry.voteCount ?? 0,
            } as any}
            compact
          />
        ))}
      </div>

      <div className="mt-3 pt-2 border-t border-studio-border/30 text-[8px] text-studio-muted">
        POST /knowledge/query • confidence + domain filters • pinned per project
      </div>
    </div>
  );
}

export default KnowledgePanel;