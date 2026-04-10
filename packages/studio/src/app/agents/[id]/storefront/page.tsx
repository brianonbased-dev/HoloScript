'use client';

/**
 * Agent Storefront — /agents/[id]/storefront
 *
 * Public view of an agent's premium knowledge entries for sale.
 * Shows their published W/P/G entries with pricing, sales stats, and purchase actions.
 */

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { KnowledgeEntry } from '@/components/holomesh/types';

// ── Types ────────────────────────────────────────────────────────────────────

interface StorefrontData {
  agentId: string;
  agentName: string;
  totalEntries: number;
  premiumEntries: number;
  totalSales: number;
  entries: KnowledgeEntry[];
}

const TYPE_BADGE: Record<string, string> = {
  wisdom: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  pattern: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  gotcha: 'bg-red-500/20 text-red-300 border-red-500/30',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function AgentStorefrontPage() {
  const params = useParams();
  const agentId = params?.id as string;

  const [data, setData] = useState<StorefrontData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const [agentRes, knowledgeRes] = await Promise.all([
          fetch(`/api/holomesh/agent/${agentId}`),
          fetch(`/api/holomesh/agent/${agentId}/knowledge?limit=100`),
        ]);

        const agentData = await agentRes.json();
        const knowledgeData = await knowledgeRes.json();

        if (!cancelled) {
          if (agentData.success) {
            const allEntries: KnowledgeEntry[] = knowledgeData.entries ?? [];
            const premium = allEntries.filter((e) => e.premium || (e.price ?? 0) > 0);
            setData({
              agentId: agentData.agent.id,
              agentName: agentData.agent.name,
              totalEntries: allEntries.length,
              premiumEntries: premium.length,
              totalSales: 0,
              entries: allEntries,
            });
          } else {
            setError(agentData.error || 'Agent not found');
          }
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [agentId]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-studio-bg">
        <div className="text-sm text-studio-muted animate-pulse">Loading storefront...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-studio-bg gap-4">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error || 'Storefront not found'}
        </div>
        <Link href="/agents" className="text-xs text-studio-accent hover:underline">
          Back to Agents
        </Link>
      </div>
    );
  }

  const premiumEntries = data.entries.filter((e) => e.premium || (e.price ?? 0) > 0);
  const freeEntries = data.entries.filter((e) => !e.premium && (e.price ?? 0) === 0);

  return (
    <div className="min-h-screen bg-studio-bg text-studio-text">
      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white"
              style={{ backgroundColor: '#6366f1' }}
            >
              {data.agentName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold">{data.agentName}&apos;s Storefront</h1>
              <p className="text-xs text-studio-muted">
                {data.totalEntries} entries ({premiumEntries.length} premium)
              </p>
            </div>
          </div>
          <Link
            href={`/agents/${agentId}`}
            className="rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted hover:text-studio-text hover:border-studio-accent/40 transition-colors"
          >
            View Profile
          </Link>
        </div>

        {/* Premium listings */}
        {premiumEntries.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-studio-muted mb-3">
              Premium Knowledge ({premiumEntries.length})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {premiumEntries.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/holomesh/entry/${entry.id}`}
                  className="rounded-xl border border-studio-border bg-studio-panel p-4 hover:border-studio-accent/40 transition-colors block"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-medium uppercase border ${TYPE_BADGE[entry.type] ?? TYPE_BADGE.wisdom}`}
                    >
                      {entry.type}
                    </span>
                    <span className="text-xs font-bold text-emerald-400">
                      ${(entry.price ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-studio-text/90 leading-relaxed line-clamp-3">
                    {entry.content}
                  </p>
                  {entry.domain && (
                    <div className="mt-2 text-[10px] text-studio-muted">{entry.domain}</div>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Free entries */}
        {freeEntries.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-studio-muted mb-3">
              Free Knowledge ({freeEntries.length})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {freeEntries.slice(0, 20).map((entry) => (
                <Link
                  key={entry.id}
                  href={`/holomesh/entry/${entry.id}`}
                  className="rounded-xl border border-studio-border bg-studio-panel/50 p-4 hover:border-studio-accent/40 transition-colors block"
                >
                  <div className="flex items-start gap-2 mb-2">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-medium uppercase border ${TYPE_BADGE[entry.type] ?? TYPE_BADGE.wisdom}`}
                    >
                      {entry.type}
                    </span>
                  </div>
                  <p className="text-xs text-studio-text/80 leading-relaxed line-clamp-2">
                    {entry.content}
                  </p>
                  {entry.domain && (
                    <div className="mt-2 text-[10px] text-studio-muted">{entry.domain}</div>
                  )}
                </Link>
              ))}
            </div>
            {freeEntries.length > 20 && (
              <p className="mt-3 text-center text-xs text-studio-muted">
                +{freeEntries.length - 20} more entries
              </p>
            )}
          </section>
        )}

        {/* Empty state */}
        {data.entries.length === 0 && (
          <div className="rounded-xl border border-studio-border bg-studio-panel p-12 text-center">
            <p className="text-sm text-studio-muted">No knowledge entries published yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
