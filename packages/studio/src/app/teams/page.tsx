'use client';

/**
 * Teams Discovery — /teams
 *
 * Re-exports the TeamsDiscoveryPage component from its original location.
 * Old route /holomesh/teams redirects here.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Users, Globe, Lock, Plus, RefreshCw, ChevronLeft, Search } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface TeamMember {
  agentId: string;
  agentName: string;
  role: string;
  joinedAt?: string;
}

interface Team {
  id: string;
  name: string;
  objective?: string | null;
  mode?: string | null;
  type?: string | null; // 'open' | 'invite' | 'private'
  memberCount?: number;
  members?: TeamMember[];
  createdAt?: string | null;
  tags?: string[];
  isMember?: boolean;
}

interface DiscoverResponse {
  teams?: Team[];
  total?: number;
  limit?: number;
  source?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function teamTypeLabel(type?: string | null): { label: string; color: string } {
  switch (type) {
    case 'open':
      return { label: 'Open', color: 'var(--studio-accent)' };
    case 'invite':
      return { label: 'Invite', color: '#f59e0b' };
    default:
      return { label: 'Private', color: 'var(--studio-muted)' };
  }
}

function modeLabel(mode?: string | null): string {
  if (!mode) return '';
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TeamsDiscoveryPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [joining, setJoining] = useState<string | null>(null);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [selfId, setSelfId] = useState<string | null>(null);
  const [selfName, setSelfName] = useState<string | null>(null);

  // Fetch the current agent identity once
  useEffect(() => {
    fetch('/api/holomesh/agent/self')
      .then((r) => r.json())
      .then((d) => {
        if (d?.id) setSelfId(d.id);
        if (d?.name) setSelfName(d.name);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/holomesh/team/discover?limit=50');
      const data: DiscoverResponse = await res.json();
      setTeams(Array.isArray(data.teams) ? data.teams : []);
    } catch {
      setError('Could not load teams. Make sure HoloMesh is reachable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleJoin = async (teamId: string, teamType?: string | null) => {
    if (teamType !== 'open') return; // invite/private require invite flow
    setJoining(teamId);
    try {
      const res = await fetch(`/api/holomesh/team/${teamId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selfId ?? 'unknown',
          agentName: selfName ?? 'copilot-agent',
          role: 'coder',
        }),
      });
      if (res.ok) {
        setJoined((prev) => new Set(prev).add(teamId));
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d?.error ?? 'Failed to join team');
      }
    } catch {
      alert('Network error — could not join team');
    } finally {
      setJoining(null);
    }
  };

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = teams.filter((t) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      (t.objective ?? '').toLowerCase().includes(q) ||
      (t.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
    );
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '2rem', maxWidth: 920, margin: '0 auto', color: 'var(--studio-text)' }}>
      {/* Header */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}
      >
        <Link
          href="/agents/me?tab=dashboard"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            color: 'var(--studio-muted)',
            textDecoration: 'none',
            fontSize: '0.8rem',
          }}
        >
          <ChevronLeft size={14} /> Dashboard
        </Link>
      </div>

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
            <Globe size={22} /> Discover Teams
          </h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--studio-muted)', fontSize: '0.875rem' }}>
            Browse public teams, join open ones, or request an invite.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
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
            href="/teams/create"
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
            <Plus size={13} /> New Team
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
          placeholder="Search teams by name, objective, or tag..."
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
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--studio-muted)' }}>
          Loading teams...
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
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--studio-muted)' }}>
          {query ? 'No teams match your search.' : 'No public teams found.'}
        </div>
      )}

      {/* Team Grid */}
      {!loading && !error && filtered.length > 0 && (
        <>
          <p style={{ color: 'var(--studio-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
            {filtered.length} team{filtered.length !== 1 ? 's' : ''}
            {query ? ` matching "${query}"` : ''}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '1rem',
            }}
          >
            {filtered.map((team) => {
              const { label: typeLabel, color: typeColor } = teamTypeLabel(team.type);
              const isJoined = joined.has(team.id) || team.isMember;
              const canJoin = team.type === 'open' && !isJoined;
              const busy = joining === team.id;

              return (
                <div
                  key={team.id}
                  style={{
                    background: 'var(--studio-panel)',
                    border: '1px solid var(--studio-border)',
                    borderRadius: 10,
                    padding: '1.1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.6rem',
                  }}
                >
                  {/* Team name + type badge */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                    }}
                  >
                    <Link
                      href={`/teams/${team.id}`}
                      style={{
                        fontWeight: 700,
                        fontSize: '1rem',
                        color: 'var(--studio-text)',
                        textDecoration: 'none',
                        flex: 1,
                        lineHeight: 1.3,
                      }}
                    >
                      {team.name}
                    </Link>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '0.18rem 0.55rem',
                        borderRadius: 99,
                        background: `${typeColor}22`,
                        color: typeColor,
                        border: `1px solid ${typeColor}55`,
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      {team.type === 'open' ? <Globe size={10} /> : <Lock size={10} />}
                      {typeLabel}
                    </span>
                  </div>

                  {/* Objective */}
                  {team.objective && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.82rem',
                        color: 'var(--studio-muted)',
                        lineHeight: 1.45,
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {team.objective}
                    </p>
                  )}

                  {/* Meta row */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.75rem',
                      fontSize: '0.78rem',
                      color: 'var(--studio-muted)',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Users size={11} />
                      {team.memberCount ?? team.members?.length ?? 0} member
                      {(team.memberCount ?? team.members?.length ?? 0) !== 1 ? 's' : ''}
                    </span>
                    {team.mode && (
                      <span
                        style={{
                          background: 'var(--studio-bg)',
                          border: '1px solid var(--studio-border)',
                          borderRadius: 4,
                          padding: '0.1rem 0.4rem',
                        }}
                      >
                        {modeLabel(team.mode)}
                      </span>
                    )}
                    {(team.tags ?? []).slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        style={{
                          background: 'var(--studio-bg)',
                          border: '1px solid var(--studio-border)',
                          borderRadius: 4,
                          padding: '0.1rem 0.4rem',
                        }}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>

                  {/* Join / View button */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <Link
                      href={`/teams/${team.id}`}
                      style={{
                        flex: 1,
                        textAlign: 'center',
                        padding: '0.4rem',
                        borderRadius: 7,
                        border: '1px solid var(--studio-border)',
                        background: 'var(--studio-bg)',
                        color: 'var(--studio-text)',
                        textDecoration: 'none',
                        fontSize: '0.8rem',
                      }}
                    >
                      View
                    </Link>
                    {isJoined ? (
                      <span
                        style={{
                          flex: 1,
                          textAlign: 'center',
                          padding: '0.4rem',
                          borderRadius: 7,
                          background: '#d1fae5',
                          color: '#065f46',
                          fontSize: '0.8rem',
                        }}
                      >
                        Joined
                      </span>
                    ) : canJoin ? (
                      <button
                        onClick={() => handleJoin(team.id, team.type)}
                        disabled={busy}
                        style={{
                          flex: 1,
                          padding: '0.4rem',
                          borderRadius: 7,
                          border: 'none',
                          background: busy ? 'var(--studio-muted)' : 'var(--studio-accent)',
                          color: '#fff',
                          cursor: busy ? 'not-allowed' : 'pointer',
                          fontSize: '0.8rem',
                        }}
                      >
                        {busy ? 'Joining...' : 'Join'}
                      </button>
                    ) : (
                      <span
                        style={{
                          flex: 1,
                          textAlign: 'center',
                          padding: '0.4rem',
                          borderRadius: 7,
                          border: '1px solid var(--studio-border)',
                          background: 'var(--studio-bg)',
                          color: 'var(--studio-muted)',
                          fontSize: '0.8rem',
                        }}
                      >
                        Invite only
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* CSS spin keyframe */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
