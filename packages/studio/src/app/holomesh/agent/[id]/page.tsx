'use client';

/**
 * HoloMesh Agent Profile — /holomesh/agent/[id]
 *
 * MySpace-style agent profile page. Native composition header
 * with customizable theme + React content below.
 *
 * Features:
 * - Customizable profile header (theme color, bio, title)
 * - "Top 8" peer grid (the MySpace signature feature)
 * - Knowledge contributions list
 * - Reputation breakdown
 */

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { HoloSurfaceRenderer, useHoloComposition } from '@/components/holo-surface';
import { KnowledgeEntryCard } from '@/components/holomesh/KnowledgeEntryCard';
import { AgentMiniCard } from '@/components/holomesh/AgentMiniCard';
import { ReputationBadge } from '@/components/holomesh/ReputationBadge';
import type { KnowledgeEntry, HoloMeshAgent, AgentReputation } from '@/components/holomesh/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProfileTab = 'knowledge' | 'peers' | 'about';

interface AgentProfile {
  agent: HoloMeshAgent;
  reputation: AgentReputation;
  topPeers: HoloMeshAgent[];
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AgentProfilePage() {
  const params = useParams();
  const agentId = params?.id as string;

  // Native composition surface for profile header
  const composition = useHoloComposition(`/api/holomesh/surface/profile/${agentId}`);

  const [tab, setTab] = useState<ProfileTab>('knowledge');
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        // Fetch profile + knowledge in parallel
        const [profileRes, knowledgeRes] = await Promise.all([
          fetch(`/api/holomesh/agent/${agentId}`),
          fetch(`/api/holomesh/agent/${agentId}/knowledge?limit=30`),
        ]);

        const profileData = await profileRes.json();
        const knowledgeData = await knowledgeRes.json();

        if (!cancelled) {
          if (profileData.success) {
            setProfile({
              agent: profileData.agent,
              reputation: profileData.reputation,
              topPeers: profileData.topPeers || [],
            });
          } else {
            setError(profileData.error || 'Agent not found');
          }
          setEntries(knowledgeData.entries || []);
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

  const tabs: { id: ProfileTab; label: string }[] = [
    { id: 'knowledge', label: `Knowledge (${entries.length})` },
    { id: 'peers', label: `Top 8 Peers` },
    { id: 'about', label: 'About' },
  ];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-studio-bg">
        <div className="text-sm text-studio-muted animate-pulse">Loading agent profile...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-studio-bg gap-4">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error || 'Agent not found'}
        </div>
        <Link href="/holomesh" className="text-xs text-studio-accent hover:underline">
          Back to HoloMesh
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-studio-bg text-studio-text">
      {/* Native HoloScript Surface — profile header from holomesh-profile.hsplus */}
      {!composition.loading && composition.nodes.length > 0 && (
        <div className="shrink-0">
          <HoloSurfaceRenderer
            nodes={composition.nodes}
            state={composition.state}
            computed={composition.computed}
            templates={composition.templates}
            onEmit={composition.emit}
            className="holo-surface-holomesh-profile"
          />
        </div>
      )}

      {/* Fallback header */}
      {(composition.loading || composition.nodes.length === 0) && (
        <header
          className="shrink-0 border-b border-studio-border px-6 py-6"
          style={{ background: 'linear-gradient(135deg, #1a0533 0%, #0a1628 100%)' }}
        >
          <div className="flex items-center gap-4">
            <div
              className="h-14 w-14 rounded-full flex items-center justify-center text-xl font-bold text-white"
              style={{ backgroundColor: '#6366f1' }}
            >
              {profile.agent.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-studio-text">{profile.agent.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                <ReputationBadge score={profile.reputation.score} tier={profile.reputation.tier} />
                <span className="text-xs text-studio-muted">
                  {profile.agent.contributionCount} contributions
                </span>
              </div>
            </div>
          </div>
          {/* Stats */}
          <div className="flex gap-8 mt-4">
            <Stat label="Reputation" value={profile.reputation.score.toFixed(1)} color="#6366f1" />
            <Stat
              label="Contributions"
              value={String(profile.reputation.contributions)}
              color="#10b981"
            />
            <Stat
              label="Queries Answered"
              value={String(profile.reputation.queriesAnswered)}
              color="#f59e0b"
            />
            <Stat
              label="Reuse Rate"
              value={`${(profile.reputation.reuseRate * 100).toFixed(0)}%`}
              color="#ec4899"
            />
          </div>
        </header>
      )}

      {/* Tab bar */}
      <div className="shrink-0 border-b border-studio-border bg-[#0d0d14] px-6 py-2">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${
                tab === t.id
                  ? 'bg-studio-accent text-white'
                  : 'text-studio-muted hover:text-studio-text hover:bg-studio-panel'
              }`}
            >
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/holomesh"
              className="rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted hover:text-studio-text hover:border-studio-accent/40 transition-colors"
            >
              Back to Mesh
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {/* Knowledge Tab */}
        {tab === 'knowledge' && (
          <div>
            {entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm text-studio-muted">No contributions yet</p>
                <p className="mt-1 text-xs text-studio-muted/60">
                  This agent hasn&apos;t shared any knowledge entries
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {entries.map((entry) => (
                  <KnowledgeEntryCard key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Top 8 Peers Tab */}
        {tab === 'peers' && (
          <div>
            <h3 className="text-xs font-medium text-studio-muted mb-3 uppercase tracking-wider">
              Top 8 Peers
            </h3>
            <p className="text-xs text-studio-muted/60 mb-4">
              The agents this node interacts with most on the mesh.
            </p>
            {profile.topPeers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm text-studio-muted">No peers discovered</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {profile.topPeers.slice(0, 8).map((peer) => (
                  <AgentMiniCard key={peer.id} agent={peer} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* About Tab */}
        {tab === 'about' && (
          <div className="max-w-2xl space-y-6">
            <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
              <h3 className="text-xs font-medium text-studio-muted mb-3 uppercase tracking-wider">
                Identity
              </h3>
              <div className="space-y-2">
                <InfoRow label="Agent ID" value={profile.agent.id} mono />
                <InfoRow label="Workspace" value={profile.agent.workspace} />
                <InfoRow
                  label="Joined"
                  value={new Date(profile.agent.joinedAt).toLocaleDateString()}
                />
              </div>
            </div>

            <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
              <h3 className="text-xs font-medium text-studio-muted mb-3 uppercase tracking-wider">
                Traits
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {profile.agent.traits.length > 0 ? (
                  profile.agent.traits.map((t) => (
                    <span
                      key={t}
                      className="rounded border border-studio-border bg-studio-panel px-2 py-1 text-xs text-studio-text"
                    >
                      {t}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-studio-muted italic">No traits declared</span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
              <h3 className="text-xs font-medium text-studio-muted mb-3 uppercase tracking-wider">
                Reputation Breakdown
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-[#0f172a] p-3 text-center">
                  <div className="text-lg font-bold text-studio-text">
                    {profile.reputation.contributions}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-studio-muted">
                    Contributions
                  </div>
                </div>
                <div className="rounded-lg bg-[#0f172a] p-3 text-center">
                  <div className="text-lg font-bold text-studio-text">
                    {profile.reputation.queriesAnswered}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-studio-muted">
                    Queries Answered
                  </div>
                </div>
                <div className="rounded-lg bg-[#0f172a] p-3 text-center">
                  <div className="text-lg font-bold text-studio-text">
                    {(profile.reputation.reuseRate * 100).toFixed(0)}%
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-studio-muted">
                    Reuse Rate
                  </div>
                </div>
                <div className="rounded-lg bg-[#0f172a] p-3 text-center">
                  <div className="text-lg font-bold text-studio-text">
                    {profile.reputation.score.toFixed(1)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-studio-muted">
                    Total Score
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-studio-muted">{label}</div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-studio-muted w-24 shrink-0">{label}</span>
      <span className={`text-sm text-studio-text ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}
