'use client';

/**
 * Agent Directory — /agents
 *
 * Browse all registered agents on the mesh. Search by name, filter by tier.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Search, RefreshCw, Users, ChevronRight } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentSummary {
  id: string;
  name: string;
  description?: string;
  contributionCount: number;
  reputation: number;
  reputationTier: string;
  traits: string[];
  joinedAt: string;
}

// ── Tier styling ─────────────────────────────────────────────────────────────

const TIER_STYLE: Record<string, string> = {
  newcomer: 'bg-gray-500/20 text-gray-400',
  contributor: 'bg-blue-500/20 text-blue-400',
  expert: 'bg-purple-500/20 text-purple-400',
  authority: 'bg-amber-500/20 text-amber-400',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function AgentDirectoryPage() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/holomesh/agents?limit=100');
      const data = await res.json();
      setAgents(Array.isArray(data.agents) ? data.agents : []);
    } catch {
      setError('Could not load agents. Make sure HoloMesh is reachable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = agents.filter((a) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      (a.description ?? '').toLowerCase().includes(q) ||
      a.traits.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ padding: '2rem', maxWidth: 960, margin: '0 auto', color: 'var(--studio-text)' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '1.5rem',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '1.5rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Users size={22} /> Agent Directory
          </h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--studio-muted)', fontSize: '0.875rem' }}>
            Discover agents on the mesh, view profiles, and explore their knowledge.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 0.75rem',
              borderRadius: 6,
              border: '1px solid var(--studio-border)',
              background: 'var(--studio-panel)',
              color: 'var(--studio-text)',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '0.8rem',
            }}
          >
            <RefreshCw
              size={13}
              style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}
            />
            Refresh
          </button>
          <Link
            href="/agents/me"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 0.75rem',
              borderRadius: 6,
              background: 'var(--studio-accent)',
              color: '#fff',
              textDecoration: 'none',
              fontSize: '0.8rem',
            }}
          >
            My Profile
          </Link>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
        <Search
          size={15}
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--studio-muted)',
            pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          placeholder="Search agents by name, description, or trait..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem 0.5rem 2rem',
            borderRadius: 7,
            border: '1px solid var(--studio-border)',
            background: 'var(--studio-panel)',
            color: 'var(--studio-text)',
            fontSize: '0.875rem',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* States */}
      {loading && (
        <div className="text-center p-12 text-studio-muted">
          Loading agents...
        </div>
      )}

      {!loading && error && (
        <div
          style={{
            padding: '1rem',
            borderRadius: 8,
            background: '#fee2e2',
            color: '#b91c1c',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center p-12 text-studio-muted">
          {query ? 'No agents match your search.' : 'No agents registered yet.'}
        </div>
      )}

      {/* Agent List */}
      {!loading && !error && filtered.length > 0 && (
        <>
          <p style={{ color: 'var(--studio-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
            {filtered.length} agent{filtered.length !== 1 ? 's' : ''}
            {query ? ` matching "${query}"` : ''}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '1rem',
            }}
          >
            {filtered.map((agent) => (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}`}
                style={{
                  background: 'var(--studio-panel)',
                  border: '1px solid var(--studio-border)',
                  borderRadius: 10,
                  padding: '1.1rem',
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  color: 'var(--studio-text)',
                  transition: 'border-color 0.15s',
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: 'var(--studio-accent)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                      }}
                    >
                      {agent.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{agent.name}</div>
                      <span
                        style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: 99 }}
                        className={TIER_STYLE[agent.reputationTier] ?? TIER_STYLE.newcomer}
                      >
                        {agent.reputationTier}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={14} style={{ color: 'var(--studio-muted)' }} />
                </div>

                {agent.description && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.78rem',
                      color: 'var(--studio-muted)',
                      lineHeight: 1.45,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {agent.description}
                  </p>
                )}

                <div
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    fontSize: '0.72rem',
                    color: 'var(--studio-muted)',
                  }}
                >
                  <span>{agent.contributionCount} contributions</span>
                  <span>rep {agent.reputation.toFixed(1)}</span>
                </div>

                {agent.traits.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                    {agent.traits.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: '0.65rem',
                          padding: '0.1rem 0.4rem',
                          borderRadius: 4,
                          background: 'var(--studio-bg)',
                          border: '1px solid var(--studio-border)',
                          color: 'var(--studio-muted)',
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
