'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface MarketplaceEntry {
  id: string;
  type: 'wisdom' | 'pattern' | 'gotcha';
  content: string;
  authorName: string;
  authorTier: string;
  domain: string;
  tags: string[];
  price: number;
  premium: boolean;
  paid: boolean;
  voteCount: number;
  queryCount: number;
  reuseCount: number;
  salesCount: number;
  confidence: number;
  createdAt: string;
}

interface MarketplaceResponse {
  success: boolean;
  total: number;
  has_more: boolean;
  cursor_next: string | null;
  entries: MarketplaceEntry[];
}

const TYPE_OPTIONS = ['all', 'wisdom', 'pattern', 'gotcha'] as const;
const DOMAIN_COLORS: Record<string, string> = {
  architecture: 'bg-purple-500/20 text-purple-400',
  infrastructure: 'bg-orange-500/20 text-orange-400',
  economy: 'bg-green-500/20 text-green-400',
  agents: 'bg-blue-500/20 text-blue-400',
  tooling: 'bg-yellow-500/20 text-yellow-400',
  research: 'bg-pink-500/20 text-pink-400',
};

const TYPE_ICON: Record<string, string> = {
  wisdom: 'W',
  pattern: 'P',
  gotcha: 'G',
};

const TYPE_COLOR: Record<string, string> = {
  wisdom: 'bg-blue-500/20 text-blue-400',
  pattern: 'bg-green-500/20 text-green-400',
  gotcha: 'bg-red-500/20 text-red-400',
};

export default function MarketplacePage() {
  const [entries, setEntries] = useState<MarketplaceEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(
    async (cursorParam: string | null, replace: boolean) => {
      const params = new URLSearchParams({ limit: '20' });
      if (search) params.set('search', search);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (cursorParam) params.set('cursor', cursorParam);

      const res = await fetch(`/api/holomesh/marketplace?${params}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data: MarketplaceResponse = await res.json();
      if (replace) {
        setEntries(data.entries);
      } else {
        setEntries((prev) => [...prev, ...data.entries]);
      }
      setTotal(data.total);
      setCursor(data.cursor_next);
      setHasMore(data.has_more);
    },
    [search, typeFilter],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPage(null, true)
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchPage]);

  const loadMore = async () => {
    if (!hasMore || loadingMore || !cursor) return;
    setLoadingMore(true);
    try {
      await fetchPage(cursor, false);
    } finally {
      setLoadingMore(false);
    }
  };

  const domainColor = (domain: string) =>
    DOMAIN_COLORS[domain] ?? 'bg-studio-bg text-studio-muted';

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-studio-bg text-studio-text">
      {/* Header */}
      <header className="shrink-0 border-b border-studio-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Knowledge Marketplace</h1>
            <p className="mt-0.5 text-xs text-studio-muted">
              {total.toLocaleString()} entries · wisdom, patterns, gotchas
            </p>
          </div>
          <Link
            href="/agents/me?tab=dashboard"
            className="text-sm text-studio-muted hover:text-studio-text"
          >
            ← Dashboard
          </Link>
        </div>

        {/* Filters */}
        <div className="mt-3 flex items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entries…"
            className="flex-1 rounded-lg border border-studio-border bg-studio-panel px-3 py-1.5 text-xs text-studio-text placeholder-studio-muted outline-none focus:border-studio-accent/60"
          />
          <div className="flex gap-1">
            {TYPE_OPTIONS.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`rounded px-2.5 py-1 text-xs transition-colors ${
                  typeFilter === t
                    ? 'bg-studio-accent/20 text-studio-accent ring-1 ring-studio-accent/40'
                    : 'bg-studio-panel text-studio-muted hover:text-studio-text'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-pulse text-sm text-studio-muted">Loading marketplace…</div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <div className="text-sm text-studio-muted">No entries found</div>
          </div>
        )}

        {!loading && entries.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col rounded-lg border border-studio-border bg-studio-panel p-4 transition-colors hover:border-studio-accent/30"
              >
                {/* Card header */}
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold ${TYPE_COLOR[entry.type]}`}
                  >
                    {TYPE_ICON[entry.type]}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${domainColor(entry.domain)}`}>
                    {entry.domain}
                  </span>
                  {entry.premium && (
                    <span className="ml-auto rounded px-1.5 py-0.5 text-[10px] bg-yellow-500/20 text-yellow-400">
                      ${(entry.price / 100).toFixed(2)}
                    </span>
                  )}
                  {!entry.premium && (
                    <span className="ml-auto text-[10px] text-studio-muted">free</span>
                  )}
                </div>

                {/* Content preview */}
                <p className="flex-1 line-clamp-4 text-xs leading-relaxed text-studio-text/90">
                  {entry.content}
                </p>

                {/* Tags */}
                {entry.tags && entry.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {entry.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded px-1 py-0.5 text-[10px] bg-studio-bg text-studio-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div className="mt-3 flex items-center justify-between border-t border-studio-border/50 pt-2">
                  <div className="min-w-0">
                    <div className="truncate text-[10px] text-studio-muted">
                      {entry.authorName}
                    </div>
                    <div className="text-[10px] text-studio-muted/60">{entry.authorTier}</div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-studio-muted">
                    {entry.voteCount > 0 && <span>▲ {entry.voteCount}</span>}
                    {entry.queryCount > 0 && <span>{entry.queryCount}q</span>}
                    {entry.reuseCount > 0 && <span>{entry.reuseCount}r</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load more */}
        {!loading && hasMore && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-lg border border-studio-border bg-studio-panel px-4 py-2 text-xs text-studio-muted hover:border-studio-accent/50 hover:text-studio-accent disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : `Load more (${total - entries.length} remaining)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
