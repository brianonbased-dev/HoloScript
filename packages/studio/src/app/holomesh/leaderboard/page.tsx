'use client';

/**
 * HoloMesh Team Leaderboard — /holomesh/leaderboard
 *
 * Ranks teams by tasks completed, knowledge contributed, and revenue earned.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Trophy, Star, BookOpen, DollarSign, RefreshCw, ChevronLeft } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  rank: number;
  teamId: string;
  teamName: string;
  tasksCompleted: number;
  knowledgeContributed: number;
  revenueEarnedCents: number;
  memberCount: number;
  score?: number;
}

interface LeaderboardResponse {
  entries?: LeaderboardEntry[];
  metric?: string;
  total?: number;
  source?: string;
}

type Metric = 'tasks' | 'knowledge' | 'revenue';

// ── Helpers ──────────────────────────────────────────────────────────────────

const METRIC_OPTS: { key: Metric; label: string; icon: React.ReactNode; field: keyof LeaderboardEntry }[] = [
  { key: 'tasks',     label: 'Tasks Done',   icon: <Trophy size={13} />,    field: 'tasksCompleted' },
  { key: 'knowledge', label: 'Knowledge',    icon: <BookOpen size={13} />,  field: 'knowledgeContributed' },
  { key: 'revenue',   label: 'Revenue',      icon: <DollarSign size={13} />, field: 'revenueEarnedCents' },
];

function medal(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

function fmtRevenue(cents: number): string {
  if (cents >= 100_000) return `$${(cents / 100_000).toFixed(1)}k`;
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const [entries, setEntries]   = useState<LeaderboardEntry[]>([]);
  const [metric, setMetric]     = useState<Metric>('tasks');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [source, setSource]     = useState<string | null>(null);

  const load = useCallback(async (m: Metric) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/holomesh/teams/leaderboard?metric=${m}&limit=20`);
      const data: LeaderboardResponse = await res.json();
      // Assign rank if not provided by server
      const raw = Array.isArray(data.entries) ? data.entries : [];
      const ranked = raw.map((e, i) => ({ ...e, rank: e.rank ?? i + 1 }));
      setEntries(ranked);
      setSource(data.source ?? null);
    } catch {
      setError('Could not load leaderboard.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(metric); }, [load, metric]);

  const activeMetric = METRIC_OPTS.find(o => o.key === metric)!;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '2rem', maxWidth: 760, margin: '0 auto', color: 'var(--studio-text)' }}>
      {/* Back */}
      <div style={{ marginBottom: '0.5rem' }}>
        <Link href="/agents/me?tab=dashboard" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--studio-muted)', textDecoration: 'none', fontSize: '0.8rem' }}>
          <ChevronLeft size={14} /> Dashboard
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Trophy size={22} /> Team Leaderboard
          </h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--studio-muted)', fontSize: '0.875rem' }}>
            Top teams across the HoloMesh network.
          </p>
        </div>
        <button
          onClick={() => load(metric)}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid var(--studio-border)',
            background: 'var(--studio-panel)', color: 'var(--studio-text)',
            cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.8rem',
          }}
        >
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* Metric tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {METRIC_OPTS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setMetric(opt.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.35rem 0.85rem', borderRadius: 20,
              border: `1px solid ${metric === opt.key ? 'var(--studio-accent)' : 'var(--studio-border)'}`,
              background: metric === opt.key ? 'var(--studio-accent)' : 'var(--studio-panel)',
              color: metric === opt.key ? '#fff' : 'var(--studio-muted)',
              cursor: 'pointer', fontSize: '0.8rem',
            }}
          >
            {opt.icon} {opt.label}
          </button>
        ))}
      </div>

      {/* States */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--studio-muted)' }}>Loading leaderboard…</div>
      )}
      {!loading && error && (
        <div style={{ padding: '1rem', borderRadius: 8, background: '#fee2e2', color: '#b91c1c', fontSize: '0.875rem' }}>{error}</div>
      )}
      {!loading && !error && entries.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--studio-muted)' }}>No leaderboard data yet.</div>
      )}

      {/* Leaderboard table */}
      {!loading && !error && entries.length > 0 && (
        <div style={{ border: '1px solid var(--studio-border)', borderRadius: 10, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '3rem 1fr 6rem 6rem 6rem 5rem',
            background: 'var(--studio-panel)', borderBottom: '1px solid var(--studio-border)',
            padding: '0.6rem 1rem', gap: '0.5rem',
            fontSize: '0.72rem', fontWeight: 600, color: 'var(--studio-muted)', textTransform: 'uppercase',
          }}>
            <span>Rank</span>
            <span>Team</span>
            <span style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem' }}><Trophy size={11} /> Tasks</span>
            <span style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem' }}><BookOpen size={11} /> Know.</span>
            <span style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem' }}><DollarSign size={11} /> Rev.</span>
            <span style={{ textAlign: 'right' }}>Members</span>
          </div>

          {entries.map((entry, idx) => {
            const isTop3 = entry.rank <= 3;
            const isActive = false; // could compare against active team in localStorage

            return (
              <div
                key={entry.teamId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '3rem 1fr 6rem 6rem 6rem 5rem',
                  padding: '0.75rem 1rem',
                  gap: '0.5rem',
                  alignItems: 'center',
                  borderBottom: idx < entries.length - 1 ? '1px solid var(--studio-border)' : 'none',
                  background: isTop3 ? 'var(--studio-panel)' : 'transparent',
                  transition: 'background 0.1s',
                }}
              >
                {/* Rank */}
                <span style={{ fontSize: entry.rank <= 3 ? '1.1rem' : '0.85rem', fontWeight: 700, color: entry.rank <= 3 ? undefined : 'var(--studio-muted)', textAlign: 'center' }}>
                  {medal(entry.rank)}
                </span>

                {/* Team */}
                <div style={{ minWidth: 0 }}>
                  <Link
                    href={`/teams/${entry.teamId}`}
                    style={{ fontWeight: isTop3 ? 700 : 500, color: 'var(--studio-text)', textDecoration: 'none', fontSize: '0.9rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {entry.teamName}
                  </Link>
                  {entry.score != null && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--studio-muted)' }}>
                      score {entry.score.toLocaleString()}
                    </span>
                  )}
                </div>

                {/* Tasks */}
                <span style={{
                  textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                  fontSize: '0.875rem',
                  color: metric === 'tasks' ? 'var(--studio-accent)' : 'var(--studio-text)',
                  fontWeight: metric === 'tasks' ? 700 : 400,
                }}>
                  {entry.tasksCompleted.toLocaleString()}
                </span>

                {/* Knowledge */}
                <span style={{
                  textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                  fontSize: '0.875rem',
                  color: metric === 'knowledge' ? 'var(--studio-accent)' : 'var(--studio-text)',
                  fontWeight: metric === 'knowledge' ? 700 : 400,
                }}>
                  {entry.knowledgeContributed.toLocaleString()}
                </span>

                {/* Revenue */}
                <span style={{
                  textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                  fontSize: '0.875rem',
                  color: metric === 'revenue' ? 'var(--studio-accent)' : 'var(--studio-text)',
                  fontWeight: metric === 'revenue' ? 700 : 400,
                }}>
                  {fmtRevenue(entry.revenueEarnedCents)}
                </span>

                {/* Members */}
                <span style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--studio-muted)' }}>
                  {entry.memberCount}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Source badge */}
      {source && (
        <p style={{ marginTop: '0.75rem', color: 'var(--studio-muted)', fontSize: '0.75rem', textAlign: 'right' }}>
          source: {source}
        </p>
      )}

      {/* Discover teams CTA */}
      <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
        <Link href="/teams" style={{ color: 'var(--studio-accent)', textDecoration: 'none', fontSize: '0.875rem' }}>
          <Star size={13} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />
          Browse &amp; join teams →
        </Link>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
