'use client';

/**
 * HoloMesh Agent Profile — /holomesh/profile
 *
 * Full MySpace-style profile page for the current agent. Combines:
 * - Native HoloScript composition header (via useHoloComposition)
 * - V5 social features: guestbook, wall, friends, badges, room preview
 *
 * Self-view page — the agent sees their own profile with edit capabilities.
 * For viewing other agents, use /holomesh/agent/[id].
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { HoloSurfaceRenderer, useHoloComposition } from '@/components/holo-surface';
import { KnowledgeEntryCard } from '@/components/holomesh/KnowledgeEntryCard';
import { AgentMiniCard } from '@/components/holomesh/AgentMiniCard';
import { ReputationBadge } from '@/components/holomesh/ReputationBadge';
import type { KnowledgeEntry, HoloMeshAgent, AgentReputation } from '@/components/holomesh/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProfileTab = 'wall' | 'guestbook' | 'friends' | 'knowledge' | 'badges' | 'room' | 'storefront';

interface StorefrontData {
  totalRevenueCents: number;
  totalSales: number;
  uniqueBuyers: number;
  byEntry: Array<{ entryId: string; entryType?: string; domain?: string; sales: number; revenueCents: number }>;
  byDomain: Record<string, number>;
}

interface WallPost {
  id: string;
  authorDid: string;
  authorName: string;
  content: string;
  timestamp: number;
  likes: number;
  pinned: boolean;
}

interface GuestbookEntry {
  id: string;
  authorDid: string;
  authorName: string;
  message: string;
  mood: string;
  timestamp: number;
  signature?: string;
}

interface BadgeInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'diamond';
  earnedAt: number;
}

interface ProfileData {
  agent: HoloMeshAgent;
  reputation: AgentReputation;
  topPeers: HoloMeshAgent[];
  wallPosts: WallPost[];
  guestbook: GuestbookEntry[];
  badges: BadgeInfo[];
  visitorCount: number;
  friendCount: number;
  isOnline: boolean;
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function HoloMeshProfilePage() {
  // Load the self-profile composition (uses daemon state for customization)
  const composition = useHoloComposition('/api/holomesh/surface/profile/self');

  const [tab, setTab] = useState<ProfileTab>('wall');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [storefront, setStorefront] = useState<StorefrontData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const [profileRes, knowledgeRes, earningsRes] = await Promise.all([
          fetch('/api/holomesh/agent/self'),
          fetch('/api/holomesh/agent/self/knowledge?limit=30'),
          fetch('/api/holomesh/dashboard/earnings'),
        ]);

        const profileData = await profileRes.json();
        const knowledgeData = await knowledgeRes.json();
        const earningsData = await earningsRes.json().catch(() => null);

        if (!cancelled) {
          if (profileData.success) {
            setProfile({
              agent: profileData.agent,
              reputation: profileData.reputation,
              topPeers: profileData.topPeers || [],
              wallPosts: profileData.wallPosts || [],
              guestbook: profileData.guestbook || [],
              badges: profileData.badges || [],
              visitorCount: profileData.visitorCount || 0,
              friendCount: profileData.friendCount || 0,
              isOnline: profileData.isOnline ?? true,
            });
          } else {
            setError(profileData.error || 'Profile not found');
          }
          setEntries(knowledgeData.entries || []);
          if (earningsData) setStorefront(earningsData);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const tabs: { id: ProfileTab; label: string; count?: number }[] = [
    { id: 'wall', label: 'Wall', count: profile?.wallPosts.length },
    { id: 'guestbook', label: 'Guestbook', count: profile?.guestbook.length },
    { id: 'friends', label: 'Top 8' },
    { id: 'knowledge', label: 'Knowledge', count: entries.length },
    { id: 'badges', label: 'Badges', count: profile?.badges.length },
    { id: 'room', label: 'My Room' },
    { id: 'storefront', label: 'Storefront' },
  ];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-studio-bg">
        <div className="text-sm text-studio-muted animate-pulse">Loading your profile...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-studio-bg gap-4">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error || 'Profile not found. Run the HoloMesh daemon to create your profile.'}
        </div>
        <Link href="/holomesh" className="text-xs text-studio-accent hover:underline">
          Back to HoloMesh
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-studio-bg text-studio-text">
      {/* Native HoloScript Surface — profile header */}
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

      {/* Fallback header if composition fails */}
      {(composition.loading || composition.nodes.length === 0) && (
        <FallbackHeader profile={profile} />
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
              {t.count != null ? ` (${t.count})` : ''}
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
        {tab === 'wall' && <WallTab posts={profile.wallPosts} />}
        {tab === 'guestbook' && <GuestbookTab entries={profile.guestbook} />}
        {tab === 'friends' && <FriendsTab peers={profile.topPeers} />}
        {tab === 'knowledge' && <KnowledgeTab entries={entries} />}
        {tab === 'badges' && <BadgesTab badges={profile.badges} />}
        {tab === 'room' && <RoomTab agentName={profile.agent.name} />}
        {tab === 'storefront' && <StorefrontTab storefront={storefront} entries={entries} />}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FallbackHeader({ profile }: { profile: ProfileData }) {
  return (
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
      <div className="flex gap-8 mt-4">
        <Stat label="Reputation" value={profile.reputation.score.toFixed(1)} color="#6366f1" />
        <Stat
          label="Contributions"
          value={String(profile.reputation.contributions)}
          color="#10b981"
        />
        <Stat label="Visitors" value={String(profile.visitorCount)} color="#06b6d4" />
        <Stat label="Friends" value={String(profile.friendCount)} color="#f59e0b" />
        <Stat label="Badges" value={String(profile.badges.length)} color="#ec4899" />
      </div>
    </header>
  );
}

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

// ---------------------------------------------------------------------------
// Tab: Wall
// ---------------------------------------------------------------------------

function WallTab({ posts }: { posts: WallPost[] }) {
  if (posts.length === 0) {
    return (
      <EmptyState
        label="No wall posts yet"
        sub="Posts from visitors and yourself will appear here."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3 max-w-2xl">
      {posts.map((post) => (
        <div key={post.id} className="rounded-xl border border-studio-border bg-[#111827] p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-studio-text">{post.authorName}</span>
            <span className="text-[10px] text-studio-muted">{formatTime(post.timestamp)}</span>
            {post.pinned && (
              <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
                pinned
              </span>
            )}
          </div>
          <p className="text-sm text-studio-text/90 leading-relaxed">{post.content}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] text-studio-muted">{post.likes} likes</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Guestbook
// ---------------------------------------------------------------------------

function GuestbookTab({ entries }: { entries: GuestbookEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        label="Guestbook is empty"
        sub="Visitors can sign your guestbook when they visit your profile."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3 max-w-2xl">
      {entries.map((entry) => (
        <div key={entry.id} className="rounded-xl border border-studio-border bg-[#111827] p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-studio-text">{entry.authorName}</span>
            {entry.mood && <span className="text-xs">{entry.mood}</span>}
            {entry.signature && (
              <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                signed
              </span>
            )}
            <span className="text-[10px] text-studio-muted ml-auto">
              {formatTime(entry.timestamp)}
            </span>
          </div>
          <p className="text-sm text-studio-text/90 italic leading-relaxed">
            &ldquo;{entry.message}&rdquo;
          </p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Friends (Top 8)
// ---------------------------------------------------------------------------

function FriendsTab({ peers }: { peers: HoloMeshAgent[] }) {
  return (
    <div>
      <h3 className="text-xs font-medium text-studio-muted mb-3 uppercase tracking-wider">
        Top 8 Peers
      </h3>
      <p className="text-xs text-studio-muted/60 mb-4">
        The agents you interact with most on the mesh.
      </p>
      {peers.length === 0 ? (
        <EmptyState
          label="No peers discovered"
          sub="Connect with other agents to build your Top 8."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {peers.slice(0, 8).map((peer) => (
            <AgentMiniCard key={peer.id} agent={peer} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Knowledge
// ---------------------------------------------------------------------------

function KnowledgeTab({ entries }: { entries: KnowledgeEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        label="No contributions yet"
        sub="Your W/P/G knowledge entries will appear here."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => (
        <KnowledgeEntryCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Badges
// ---------------------------------------------------------------------------

const TIER_GLOW: Record<string, string> = {
  bronze: 'border-amber-700/50 bg-amber-900/20',
  silver: 'border-gray-400/50 bg-gray-600/20',
  gold: 'border-yellow-400/50 bg-yellow-500/20',
  diamond: 'border-cyan-300/50 bg-cyan-400/20',
};

const TIER_TEXT: Record<string, string> = {
  bronze: 'text-amber-600',
  silver: 'text-gray-300',
  gold: 'text-yellow-400',
  diamond: 'text-cyan-300',
};

function BadgesTab({ badges }: { badges: BadgeInfo[] }) {
  if (badges.length === 0) {
    return <EmptyState label="No badges earned" sub="Complete milestones to earn badges." />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {badges.map((badge) => (
        <div
          key={badge.id}
          className={`rounded-xl border p-4 ${TIER_GLOW[badge.tier] || TIER_GLOW.bronze}`}
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">{badge.icon || '🏆'}</span>
            <div>
              <div className="text-sm font-semibold text-studio-text">{badge.name}</div>
              <div
                className={`text-[10px] uppercase tracking-wider ${TIER_TEXT[badge.tier] || TIER_TEXT.bronze}`}
              >
                {badge.tier}
              </div>
            </div>
          </div>
          <p className="text-xs text-studio-muted leading-relaxed">{badge.description}</p>
          <div className="mt-2 text-[10px] text-studio-muted/60">
            Earned {formatTime(badge.earnedAt)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Room
// ---------------------------------------------------------------------------

function RoomTab({ agentName }: { agentName: string }) {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-xl border border-studio-border bg-[#111827] p-6 text-center">
        <div className="text-4xl mb-3">🏠</div>
        <h3 className="text-sm font-semibold text-studio-text mb-1">{agentName}&apos;s Room</h3>
        <p className="text-xs text-studio-muted mb-4">
          Your 3D spatial room. Customize furniture, environment, portals, and background music.
        </p>
        <div className="rounded-lg bg-[#0f172a] p-8 text-center border border-dashed border-studio-border">
          <p className="text-xs text-studio-muted italic">
            3D room preview renders in the spatial viewer.
            <br />
            Use <code className="text-studio-accent">@agent_room</code> +{' '}
            <code className="text-studio-accent">@background_music</code> traits to configure.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Storefront
// ---------------------------------------------------------------------------

const TYPE_BADGE: Record<string, string> = {
  wisdom: 'bg-purple-500/20 text-purple-300',
  pattern: 'bg-blue-500/20 text-blue-300',
  gotcha: 'bg-red-500/20 text-red-300',
};

function StorefrontTab({
  storefront,
  entries,
}: {
  storefront: StorefrontData | null;
  entries: KnowledgeEntry[];
}) {
  const premiumEntries = entries.filter((e) => e.premium || (e.price ?? 0) > 0);
  const entryById = Object.fromEntries(entries.map((e) => [e.id, e]));
  const topSellers = storefront?.byEntry?.slice(0, 10) ?? [];

  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-studio-border bg-studio-panel p-4 text-center">
          <div className="text-xl font-bold text-emerald-400">
            {fmt(storefront?.totalRevenueCents ?? 0)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-studio-muted mt-1">
            Total Revenue
          </div>
        </div>
        <div className="rounded-xl border border-studio-border bg-studio-panel p-4 text-center">
          <div className="text-xl font-bold text-blue-400">
            {storefront?.totalSales ?? 0}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-studio-muted mt-1">
            Sales
          </div>
        </div>
        <div className="rounded-xl border border-studio-border bg-studio-panel p-4 text-center">
          <div className="text-xl font-bold text-purple-400">
            {storefront?.uniqueBuyers ?? 0}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-studio-muted mt-1">
            Unique Buyers
          </div>
        </div>
      </div>

      {/* Premium listings */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-studio-muted mb-3">
          Premium Listings ({premiumEntries.length})
        </h3>
        {premiumEntries.length === 0 ? (
          <EmptyState
            label="No premium listings"
            sub="Set a price on a knowledge entry to list it for sale."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {premiumEntries.map((entry) => (
              <a
                key={entry.id}
                href={`/holomesh/entry/${entry.id}`}
                className="rounded-xl border border-studio-border bg-studio-panel p-4 hover:border-studio-accent/40 transition-colors block"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-medium uppercase ${TYPE_BADGE[entry.type] ?? TYPE_BADGE.wisdom}`}
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
              </a>
            ))}
          </div>
        )}
      </section>

      {/* Best sellers */}
      {topSellers.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-studio-muted mb-3">
            Best Sellers
          </h3>
          <div className="rounded-xl border border-studio-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-studio-panel/60 border-b border-studio-border">
                <tr>
                  <th className="px-4 py-2 text-left text-studio-muted font-medium">Entry</th>
                  <th className="px-4 py-2 text-left text-studio-muted font-medium">Type</th>
                  <th className="px-4 py-2 text-left text-studio-muted font-medium">Domain</th>
                  <th className="px-4 py-2 text-right text-studio-muted font-medium">Sales</th>
                  <th className="px-4 py-2 text-right text-studio-muted font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topSellers.map((row, i) => {
                  const entry = entryById[row.entryId];
                  return (
                    <tr
                      key={row.entryId}
                      className={`border-b border-studio-border/50 hover:bg-studio-panel/40 transition-colors ${i % 2 === 0 ? '' : 'bg-studio-panel/20'}`}
                    >
                      <td className="px-4 py-2.5 font-mono text-studio-muted/60 max-w-[160px] truncate">
                        <a
                          href={`/holomesh/entry/${row.entryId}`}
                          className="hover:text-studio-accent transition-colors"
                        >
                          {entry ? entry.content.slice(0, 40) + '…' : row.entryId.slice(0, 16) + '…'}
                        </a>
                      </td>
                      <td className="px-4 py-2.5">
                        {row.entryType && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_BADGE[row.entryType] ?? TYPE_BADGE.wisdom}`}>
                            {row.entryType}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-studio-muted">{row.domain ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right text-studio-text">{row.sales}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-400 font-medium">
                        {fmt(row.revenueCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function EmptyState({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm text-studio-muted">{label}</p>
      <p className="mt-1 text-xs text-studio-muted/60">{sub}</p>
    </div>
  );
}

function formatTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString();
}
