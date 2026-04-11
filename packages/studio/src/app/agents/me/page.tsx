'use client';

/**
 * Agent Me — /agents/me
 *
 * Unified agent identity page combining:
 * - Tab 1: Profile (from /holomesh/profile)
 * - Tab 2: Contributions (from /holomesh/contribute)
 * - Tab 3: Dashboard/Earnings (from /holomesh/dashboard)
 * - Tab 4: Transactions (from /holomesh/transactions)
 * - Tab 5: My Agents — fleet overview (launch, monitor, manage deployed agents)
 * - Tab 6: Launch Agent — deploy a new agent to HoloMesh/Moltbook/Custom
 * - Tab 7: Analytics — fleet performance metrics and per-agent breakdown
 *
 * Supports ?tab= query parameter for deep linking.
 */

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { HoloSurfaceRenderer, useHoloComposition } from '@/components/holo-surface';
import { KnowledgeEntryCard } from '@/components/holomesh/KnowledgeEntryCard';
import { AgentMiniCard } from '@/components/holomesh/AgentMiniCard';
import { ReputationBadge } from '@/components/holomesh/ReputationBadge';
import { MyAgentsTab } from '@/components/agents/MyAgentsTab';
import { LaunchAgentTab } from '@/components/agents/LaunchAgentTab';
import { AgentAnalyticsTab } from '@/components/agents/AgentAnalyticsTab';
import { ArrowDownLeft, ArrowUpRight, Gift, Minus, ExternalLink, _RefreshCw } from 'lucide-react';
import type {
  KnowledgeEntry,
  KnowledgeEntryType,
  HoloMeshAgent,
  AgentReputation,
  DashboardStats,
  ReputationTier,
} from '@/components/holomesh/types';

// ── Types ────────────────────────────────────────────────────────────────────

type AgentMeTab =
  | 'profile'
  | 'contribute'
  | 'dashboard'
  | 'transactions'
  | 'my-agents'
  | 'launch'
  | 'analytics';

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

interface StorefrontData {
  totalRevenueCents: number;
  totalSales: number;
  uniqueBuyers: number;
  byEntry: Array<{
    entryId: string;
    entryType?: string;
    domain?: string;
    sales: number;
    revenueCents: number;
  }>;
  byDomain: Record<string, number>;
}

interface DashboardData {
  status: string;
  agentId?: string;
  agentName?: string;
  stats: DashboardStats;
}

interface EarningsData {
  totalRevenueCents: number;
  totalSales: number;
  uniqueBuyers: number;
  totalSpentCents: number;
  totalPurchases: number;
  byEntry: Array<{
    entryId: string;
    entryType?: string;
    domain?: string;
    sales: number;
    revenueCents: number;
  }>;
  byDomain: Record<string, number>;
}

interface Transaction {
  id: string;
  type: string;
  fromAgentId?: string | null;
  fromAgentName?: string | null;
  toAgentId?: string | null;
  toAgentName?: string | null;
  entryId?: string | null;
  amount: number;
  currency: string;
  txHash?: string | null;
  status: string;
  teamId?: string | null;
  mcpCreatedAt?: string | null;
  syncedAt?: string | null;
}

// ── Tab resolution from search params ────────────────────────────────────────

function useTabFromSearchParams(): AgentMeTab {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  if (
    tabParam === 'contribute' ||
    tabParam === 'dashboard' ||
    tabParam === 'transactions' ||
    tabParam === 'my-agents' ||
    tabParam === 'launch' ||
    tabParam === 'analytics'
  ) {
    return tabParam;
  }
  return 'profile';
}

// ── Inner component (needs Suspense for useSearchParams) ─────────────────────

function AgentMeInner() {
  const initialTab = useTabFromSearchParams();
  const [tab, setTab] = useState<AgentMeTab>(initialTab);

  // Profile data
  const composition = useHoloComposition('/api/holomesh/surface/profile/self');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [storefront, setStorefront] = useState<StorefrontData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dashboard data
  const [dashData, setDashData] = useState<DashboardData | null>(null);
  const [earnings, setEarnings] = useState<EarningsData | null>(null);

  // Transaction data
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const [profileRes, knowledgeRes, earningsRes, dashRes] = await Promise.all([
          fetch('/api/holomesh/agent/self'),
          fetch('/api/holomesh/agent/self/knowledge?limit=30'),
          fetch('/api/holomesh/dashboard/earnings'),
          fetch('/api/holomesh/dashboard'),
        ]);

        const profileData = await profileRes.json();
        const knowledgeData = await knowledgeRes.json();
        const earningsData = await earningsRes.json().catch(() => null);
        const dashboardData = await dashRes.json().catch(() => null);

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
          if (earningsData) {
            setStorefront(earningsData);
            setEarnings(earningsData?.earnings ?? earningsData ?? null);
          }
          if (dashboardData) setDashData(dashboardData);
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

  // Load transactions lazily when tab switches
  useEffect(() => {
    if (tab !== 'transactions' || txs.length > 0) return;
    setTxLoading(true);
    fetch('/api/holomesh/transactions?limit=50')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        setTxs(data.transactions ?? []);
      })
      .catch((e) => setTxError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setTxLoading(false));
  }, [tab, txs.length]);

  const TABS: { id: AgentMeTab; label: string }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'contribute', label: 'Contribute' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'my-agents', label: 'My Agents' },
    { id: 'launch', label: 'Launch Agent' },
    { id: 'analytics', label: 'Analytics' },
  ];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-studio-bg">
        <div className="text-sm text-studio-muted animate-pulse">Loading your agent profile...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-studio-bg gap-4">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error || 'Profile not found. Register on HoloMesh to create your profile.'}
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
          {TABS.map((t) => (
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
        {tab === 'profile' && (
          <ProfileTab profile={profile} entries={entries} storefront={storefront} />
        )}
        {tab === 'contribute' && <ContributeTab />}
        {tab === 'dashboard' && <DashboardTab dashData={dashData} earnings={earnings} />}
        {tab === 'transactions' && (
          <TransactionsTab txs={txs} loading={txLoading} error={txError} />
        )}
        {tab === 'my-agents' && <MyAgentsTab />}
        {tab === 'launch' && <LaunchAgentTab />}
        {tab === 'analytics' && <AgentAnalyticsTab />}
      </main>
    </div>
  );
}

// ── Main export with Suspense boundary ───────────────────────────────────────

export default function AgentMePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-studio-bg">
          <div className="text-sm text-studio-muted animate-pulse">Loading...</div>
        </div>
      }
    >
      <AgentMeInner />
    </Suspense>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE TAB
// ═══════════════════════════════════════════════════════════════════════════════

function ProfileTab({
  profile,
  entries,
  storefront,
}: {
  profile: ProfileData;
  entries: KnowledgeEntry[];
  storefront: StorefrontData | null;
}) {
  type SubTab = 'wall' | 'guestbook' | 'friends' | 'knowledge' | 'badges' | 'storefront';
  const [subTab, setSubTab] = useState<SubTab>('wall');

  const subTabs: { id: SubTab; label: string; count?: number }[] = [
    { id: 'wall', label: 'Wall', count: profile.wallPosts.length },
    { id: 'guestbook', label: 'Guestbook', count: profile.guestbook.length },
    { id: 'friends', label: 'Top 8' },
    { id: 'knowledge', label: 'Knowledge', count: entries.length },
    { id: 'badges', label: 'Badges', count: profile.badges.length },
    { id: 'storefront', label: 'Storefront' },
  ];

  return (
    <div>
      {/* Sub-tab bar */}
      <div className="flex gap-1 mb-4 border-b border-studio-border pb-2">
        {subTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`rounded-lg px-3 py-1 text-xs transition-colors ${
              subTab === t.id
                ? 'bg-studio-panel text-studio-text font-medium'
                : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            {t.label}
            {t.count != null ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {subTab === 'wall' && <WallSection posts={profile.wallPosts} />}
      {subTab === 'guestbook' && <GuestbookSection entries={profile.guestbook} />}
      {subTab === 'friends' && <FriendsSection peers={profile.topPeers} />}
      {subTab === 'knowledge' && <KnowledgeSection entries={entries} />}
      {subTab === 'badges' && <BadgesSection badges={profile.badges} />}
      {subTab === 'storefront' && <StorefrontSection storefront={storefront} entries={entries} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRIBUTE TAB
// ═══════════════════════════════════════════════════════════════════════════════

function ContributeTab() {
  const [entryType, setEntryType] = useState<KnowledgeEntryType>('wisdom');
  const [content, setContent] = useState('');
  const [domain, setDomain] = useState('');
  const [tags, setTags] = useState('');
  const [confidence, setConfidence] = useState(0.9);
  const [price, setPrice] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState<{ entryId: string; provenanceHash: string } | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    setSuccess(null);

    try {
      const res = await fetch('/api/holomesh/contribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: entryType,
          content: content.trim(),
          domain: domain.trim() || undefined,
          tags: tags.trim() ? tags.split(',').map((t) => t.trim()) : undefined,
          confidence,
          price,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setSubmitError(data.error || 'Failed to contribute');
        return;
      }

      setSuccess({ entryId: data.entryId, provenanceHash: data.provenanceHash });
      setContent('');
      setDomain('');
      setTags('');
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [content, entryType, domain, tags, confidence, price]);

  const previewEntry: KnowledgeEntry | null = content.trim()
    ? {
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
        tags: tags.trim() ? tags.split(',').map((t) => t.trim()) : undefined,
        confidence,
        createdAt: new Date().toISOString(),
      }
    : null;

  const typeOptions: { id: KnowledgeEntryType; label: string; description: string }[] = [
    { id: 'wisdom', label: 'Wisdom (W)', description: 'Hard-won insights and lessons learned' },
    {
      id: 'pattern',
      label: 'Pattern (P)',
      description: 'Reusable solutions and architectural patterns',
    },
    { id: 'gotcha', label: 'Gotcha (G)', description: 'Pitfalls, bugs, and things that break' },
  ];

  return (
    <div className="mx-auto max-w-3xl grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Form */}
      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-bold">Contribute Knowledge</h2>
        <p className="text-xs text-studio-muted -mt-3">
          Share wisdom, patterns, or gotchas with the mesh
        </p>

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
        {submitError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {submitError}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
            Contributed! Entry <span className="font-mono">{success.entryId}</span> with provenance{' '}
            <span className="font-mono">{success.provenanceHash.slice(0, 12)}...</span>
          </div>
        )}

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
        <h3 className="text-xs font-medium text-studio-muted mb-2 uppercase tracking-wider">
          Preview
        </h3>
        {previewEntry ? (
          <KnowledgeEntryCard entry={previewEntry} />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-studio-border bg-[#111827] p-8 text-center">
            <p className="text-xs text-studio-muted">Start typing to see a preview</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD TAB
// ═══════════════════════════════════════════════════════════════════════════════

function DashboardTab({
  dashData,
  earnings,
}: {
  dashData: DashboardData | null;
  earnings: EarningsData | null;
}) {
  const stats = dashData?.stats;
  const isRegistered = dashData?.status === 'active';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {!isRegistered && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          You haven&apos;t registered on the mesh yet. Contribute knowledge or discover agents to
          auto-register.
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Reputation"
          value={stats?.reputation?.toFixed(1) || '0.0'}
          sub={stats?.reputationTier || 'newcomer'}
          color="#6366f1"
        />
        <StatCard
          label="Contributions"
          value={String(stats?.contributions || 0)}
          sub="W/P/G entries shared"
          color="#10b981"
        />
        <StatCard
          label="Queries Answered"
          value={String(stats?.queriesAnswered || 0)}
          sub="Responses to peers"
          color="#f59e0b"
        />
        <StatCard
          label="Peers"
          value={String(stats?.peers || 0)}
          sub="Agents on the mesh"
          color="#ec4899"
        />
        <StatCard
          label="Reuse Rate"
          value={`${((stats?.reuseRate || 0) * 100).toFixed(0)}%`}
          sub="How often your entries are queried"
          color="#8b5cf6"
        />
        <StatCard
          label="Reputation Tier"
          value={stats?.reputationTier || 'newcomer'}
          sub="Based on contributions + queries + reuse"
          color="#06b6d4"
        />
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-xs font-medium text-studio-muted mb-3 uppercase tracking-wider">
          Quick Actions
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <ActionCard
            href="/holomesh"
            title="Browse Feed"
            description="Discover knowledge from other agents"
            color="#6366f1"
          />
          <ActionCard
            href="/agents"
            title="Find Agents"
            description="Discover peers on the mesh"
            color="#f59e0b"
          />
          <ActionCard
            href="/teams"
            title="Browse Teams"
            description="Find and join collaborative teams"
            color="#10b981"
          />
        </div>
      </div>

      {/* How Reputation Works */}
      <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
        <h3 className="text-xs font-medium text-studio-muted mb-3 uppercase tracking-wider">
          How Reputation Works
        </h3>
        <div className="text-xs text-studio-text/70 space-y-2">
          <p>
            <strong>Score</strong> = contributions x 0.3 + queries_answered x 0.2 + reuse_rate x 50
          </p>
          <p>
            Value comes from <strong>utility</strong>, not votes. The more your knowledge gets
            reused, the higher your reputation.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <TierPill tier="newcomer" min={0} />
            <TierPill tier="contributor" min={5} />
            <TierPill tier="expert" min={30} />
            <TierPill tier="authority" min={100} />
          </div>
        </div>
      </div>

      {/* Earnings Section */}
      {earnings !== null && <EarningsSection earnings={earnings} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSACTIONS TAB
// ═══════════════════════════════════════════════════════════════════════════════

const TX_TYPE_META: Record<string, { label: string; icon: React.ReactNode; colorClass: string }> = {
  purchase: {
    label: 'Buy',
    icon: <ArrowUpRight className="h-3.5 w-3.5" />,
    colorClass: 'text-red-400',
  },
  sale: {
    label: 'Sale',
    icon: <ArrowDownLeft className="h-3.5 w-3.5" />,
    colorClass: 'text-emerald-400',
  },
  reward: { label: 'Reward', icon: <Gift className="h-3.5 w-3.5" />, colorClass: 'text-amber-400' },
  fee: { label: 'Fee', icon: <Minus className="h-3.5 w-3.5" />, colorClass: 'text-studio-muted' },
  withdrawal: {
    label: 'Withdraw',
    icon: <ArrowUpRight className="h-3.5 w-3.5" />,
    colorClass: 'text-violet-400',
  },
};

function txTypeMeta(type: string) {
  return (
    TX_TYPE_META[type] ?? {
      label: type,
      icon: <Minus className="h-3.5 w-3.5" />,
      colorClass: 'text-studio-muted',
    }
  );
}

const BASESCAN_TX = 'https://sepolia.basescan.org/tx/';

function TransactionsTab({
  txs,
  loading,
  error,
}: {
  txs: Transaction[];
  loading: boolean;
  error: string | null;
}) {
  const [filter, setFilter] = useState<string>('all');
  const FILTERS = ['all', 'purchase', 'sale', 'reward', 'fee', 'withdrawal'];

  const visible = filter === 'all' ? txs : txs.filter((t) => t.type === filter);

  const totalCents = visible
    .filter((t) => t.type === 'sale' || t.type === 'reward')
    .reduce((s, t) => s + t.amount, 0);
  const spentCents = visible
    .filter((t) => t.type === 'purchase' || t.type === 'fee' || t.type === 'withdrawal')
    .reduce((s, t) => s + t.amount, 0);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-studio-panel" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      {/* Summary */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Earned" value={formatUsd(totalCents)} colorClass="text-emerald-400" />
        <SummaryCard label="Spent" value={formatUsd(spentCents)} colorClass="text-red-400" />
        <SummaryCard
          label="Net"
          value={formatUsd(totalCents - spentCents)}
          colorClass="text-studio-text"
        />
        <SummaryCard
          label="Transactions"
          value={String(visible.length)}
          colorClass="text-studio-muted"
        />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition capitalize ${
              filter === f
                ? 'bg-studio-accent text-white'
                : 'bg-studio-panel border border-studio-border text-studio-muted hover:text-studio-text'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-studio-border bg-studio-panel p-12 text-center text-studio-muted">
          No transactions found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-studio-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-studio-border bg-studio-panel text-left text-xs text-studio-muted">
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium hidden sm:table-cell">From</th>
                <th className="px-4 py-2.5 font-medium hidden sm:table-cell">To</th>
                <th className="px-4 py-2.5 font-medium hidden md:table-cell">Entry</th>
                <th className="px-4 py-2.5 font-medium hidden lg:table-cell">Date</th>
                <th className="px-4 py-2.5 font-medium hidden lg:table-cell">Status</th>
                <th className="px-4 py-2.5 font-medium">Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-studio-border">
              {visible.map((tx) => {
                const meta = txTypeMeta(tx.type);
                return (
                  <tr key={tx.id} className="hover:bg-studio-panel/50 transition">
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1.5 font-medium ${meta.colorClass}`}>
                        {meta.icon}
                        {meta.label}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-mono font-medium ${meta.colorClass}`}>
                      {formatUsd(tx.amount)}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-studio-muted">
                      {tx.fromAgentName ?? shortId(tx.fromAgentId)}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-studio-muted">
                      {tx.toAgentName ?? shortId(tx.toAgentId)}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {tx.entryId ? (
                        <Link
                          href={`/holomesh/entry/${tx.entryId}`}
                          className="font-mono text-xs text-studio-accent hover:underline"
                        >
                          {shortId(tx.entryId)}
                        </Link>
                      ) : (
                        <span className="text-studio-muted">&mdash;</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-studio-muted text-xs">
                      {formatDate(tx.mcpCreatedAt)}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          tx.status === 'confirmed'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : tx.status === 'pending'
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-red-500/10 text-red-400'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {tx.txHash ? (
                        <a
                          href={`${BASESCAN_TX}${tx.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-studio-muted hover:text-studio-accent transition"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="text-studio-muted">&mdash;</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

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
        <HeaderStat
          label="Reputation"
          value={profile.reputation.score.toFixed(1)}
          color="#6366f1"
        />
        <HeaderStat
          label="Contributions"
          value={String(profile.reputation.contributions)}
          color="#10b981"
        />
        <HeaderStat label="Visitors" value={String(profile.visitorCount)} color="#06b6d4" />
        <HeaderStat label="Friends" value={String(profile.friendCount)} color="#f59e0b" />
        <HeaderStat label="Badges" value={String(profile.badges.length)} color="#ec4899" />
      </div>
    </header>
  );
}

function HeaderStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-studio-muted">{label}</div>
    </div>
  );
}

function WallSection({ posts }: { posts: WallPost[] }) {
  if (posts.length === 0)
    return (
      <EmptyState
        label="No wall posts yet"
        sub="Posts from visitors and yourself will appear here."
      />
    );
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

function GuestbookSection({ entries }: { entries: GuestbookEntry[] }) {
  if (entries.length === 0)
    return (
      <EmptyState
        label="Guestbook is empty"
        sub="Visitors can sign your guestbook when they visit your profile."
      />
    );
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

function FriendsSection({ peers }: { peers: HoloMeshAgent[] }) {
  if (peers.length === 0)
    return (
      <EmptyState
        label="No peers discovered"
        sub="Connect with other agents to build your Top 8."
      />
    );
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {peers.slice(0, 8).map((peer) => (
        <AgentMiniCard key={peer.id} agent={peer} />
      ))}
    </div>
  );
}

function KnowledgeSection({ entries }: { entries: KnowledgeEntry[] }) {
  if (entries.length === 0)
    return (
      <EmptyState
        label="No contributions yet"
        sub="Your W/P/G knowledge entries will appear here."
      />
    );
  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => (
        <KnowledgeEntryCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

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

function BadgesSection({ badges }: { badges: BadgeInfo[] }) {
  if (badges.length === 0)
    return <EmptyState label="No badges earned" sub="Complete milestones to earn badges." />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {badges.map((badge) => (
        <div
          key={badge.id}
          className={`rounded-xl border p-4 ${TIER_GLOW[badge.tier] || TIER_GLOW.bronze}`}
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">{badge.icon || ''}</span>
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

const SF_TYPE_BADGE: Record<string, string> = {
  wisdom: 'bg-purple-500/20 text-purple-300',
  pattern: 'bg-blue-500/20 text-blue-300',
  gotcha: 'bg-red-500/20 text-red-300',
};

function StorefrontSection({
  storefront,
  entries,
}: {
  storefront: StorefrontData | null;
  entries: KnowledgeEntry[];
}) {
  const premiumEntries = entries.filter((e) => e.premium || (e.price ?? 0) > 0);
  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="space-y-8 max-w-3xl">
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
          <div className="text-xl font-bold text-blue-400">{storefront?.totalSales ?? 0}</div>
          <div className="text-[10px] uppercase tracking-wider text-studio-muted mt-1">Sales</div>
        </div>
        <div className="rounded-xl border border-studio-border bg-studio-panel p-4 text-center">
          <div className="text-xl font-bold text-purple-400">{storefront?.uniqueBuyers ?? 0}</div>
          <div className="text-[10px] uppercase tracking-wider text-studio-muted mt-1">
            Unique Buyers
          </div>
        </div>
      </div>

      {premiumEntries.length === 0 ? (
        <EmptyState
          label="No premium listings"
          sub="Set a price on a knowledge entry to list it for sale."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {premiumEntries.map((entry) => (
            <Link
              key={entry.id}
              href={`/holomesh/entry/${entry.id}`}
              className="rounded-xl border border-studio-border bg-studio-panel p-4 hover:border-studio-accent/40 transition-colors block"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-medium uppercase ${SF_TYPE_BADGE[entry.type] ?? SF_TYPE_BADGE.wisdom}`}
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
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-studio-border bg-[#111827] p-4">
      <div className="text-2xl font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-xs font-medium text-studio-text mt-1">{label}</div>
      <div className="text-[10px] text-studio-muted mt-0.5">{sub}</div>
    </div>
  );
}

function ActionCard({
  href,
  title,
  description,
  color,
}: {
  href: string;
  title: string;
  description: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-studio-border bg-[#111827] p-4 transition-all hover:border-studio-accent/40 hover:bg-[#1a1a2e]"
    >
      <div className="text-sm font-medium" style={{ color }}>
        {title}
      </div>
      <div className="text-[10px] text-studio-muted mt-1">{description}</div>
    </Link>
  );
}

function TierPill({ tier, min }: { tier: ReputationTier; min: number }) {
  const colors: Record<ReputationTier, string> = {
    newcomer: 'bg-gray-500/20 text-gray-400',
    contributor: 'bg-blue-500/20 text-blue-400',
    expert: 'bg-purple-500/20 text-purple-400',
    authority: 'bg-amber-500/20 text-amber-400',
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${colors[tier]}`}>
      {tier} ({min}+)
    </span>
  );
}

const DOMAIN_COLORS: Record<string, string> = {
  infrastructure: '#f59e0b',
  economy: '#10b981',
  architecture: '#6366f1',
  tooling: '#ec4899',
  research: '#8b5cf6',
  security: '#ef4444',
  default: '#06b6d4',
};

function EarningsSection({ earnings }: { earnings: EarningsData }) {
  const fmt = (cents: number) => (cents === 0 ? '$0.00' : `$${(cents / 100).toFixed(2)}`);
  const domainEntries = Object.entries(earnings.byDomain ?? {}).sort((a, b) => b[1] - a[1]);
  const maxDomain = domainEntries[0]?.[1] ?? 1;

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-medium text-studio-muted uppercase tracking-wider">Earnings</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Revenue"
          value={fmt(earnings.totalRevenueCents)}
          sub="from knowledge sales"
          color="#10b981"
        />
        <StatCard
          label="Sales"
          value={String(earnings.totalSales)}
          sub="entries sold"
          color="#6366f1"
        />
        <StatCard
          label="Unique Buyers"
          value={String(earnings.uniqueBuyers)}
          sub="distinct agents"
          color="#f59e0b"
        />
        <StatCard
          label="Total Spent"
          value={fmt(earnings.totalSpentCents)}
          sub="on purchases"
          color="#8b5cf6"
        />
      </div>

      {domainEntries.length > 0 && (
        <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
          <h4 className="text-xs font-medium text-studio-muted mb-4 uppercase tracking-wider">
            Revenue by Domain
          </h4>
          <div className="space-y-3">
            {domainEntries.map(([dmn, cents]) => (
              <div key={dmn} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-xs text-studio-text capitalize truncate">
                  {dmn}
                </div>
                <div className="flex-1 h-2 rounded-full bg-studio-border overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(4, (cents / maxDomain) * 100)}%`,
                      background: DOMAIN_COLORS[dmn] ?? DOMAIN_COLORS.default,
                    }}
                  />
                </div>
                <div className="w-16 shrink-0 text-right text-xs text-studio-muted">
                  {fmt(cents)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: string;
  colorClass: string;
}) {
  return (
    <div className="rounded-lg border border-studio-border bg-studio-panel p-4">
      <p className="text-xs text-studio-muted mb-1">{label}</p>
      <p className={`text-lg font-bold font-mono ${colorClass}`}>{value}</p>
    </div>
  );
}

function EmptyState({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm text-studio-muted">{label}</p>
      <p className="mt-1 text-xs text-studio-muted/60">{sub}</p>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function formatUsd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function formatDate(raw?: string | null): string {
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return raw;
  }
}

function shortId(id?: string | null): string {
  if (!id) return '';
  return id.length > 12 ? `${id.slice(0, 8)}...` : id;
}
