'use client';

/**
 * AgentMarketplaceTab - Browse and install uAA2++ agent templates
 *
 * Fetches agent templates from the MCPMe orchestrator via the
 * MarketplaceClient and displays them with install/review capabilities.
 * Designed to sit alongside the existing MarketplacePanel content tabs.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Bot,
  Search,
  Star,
  Download,
  Shield,
  Zap,
  Brain,
  Eye,
  Globe,
  Cpu,
  Lock,
  Sparkles,
  Workflow,
  BarChart3,
  Wrench,
  CheckCircle2,
  Loader2,
  ChevronDown,
  Crown,
  X,
} from 'lucide-react';
import { getMarketplaceClient } from '@/lib/marketplace/client';
import { DEBOUNCE_INPUT } from '@/lib/ui-timings';

// ── Category config ─────────────────────────────────────────────────────────

const AGENT_CATEGORY_CONFIG: Record<string, { icon: typeof Bot; color: string; label: string }> = {
  utility: { icon: Wrench, color: 'text-gray-400 bg-gray-500/20', label: 'Utility' },
  guardian: { icon: Shield, color: 'text-red-400 bg-red-500/20', label: 'Guardian' },
  guide: { icon: Eye, color: 'text-blue-400 bg-blue-500/20', label: 'Guide' },
  builder: { icon: Cpu, color: 'text-orange-400 bg-orange-500/20', label: 'Builder' },
  trader: { icon: BarChart3, color: 'text-green-400 bg-green-500/20', label: 'Trader' },
  creative: { icon: Sparkles, color: 'text-purple-400 bg-purple-500/20', label: 'Creative' },
  npc: { icon: Bot, color: 'text-cyan-400 bg-cyan-500/20', label: 'NPC' },
  analytics: { icon: BarChart3, color: 'text-teal-400 bg-teal-500/20', label: 'Analytics' },
};

const TIER_BADGE: Record<string, { label: string; color: string; icon: typeof Star }> = {
  free: { label: 'Free', color: 'bg-gray-600/30 text-gray-300', icon: Star },
  starter: { label: 'Starter', color: 'bg-blue-500/20 text-blue-400', icon: Zap },
  pro: { label: 'Pro', color: 'bg-purple-500/20 text-purple-400', icon: Brain },
  enterprise: { label: 'Enterprise', color: 'bg-amber-500/20 text-amber-400', icon: Crown },
};

// ── Types ───────────────────────────────────────────────────────────────────

interface AgentTemplate {
  id: string;
  name: string;
  slug: string;
  description: string;
  author: string;
  category: string;
  tier: string;
  tags: string[];
  capabilities: string[];
  installs: number;
  rating: number;
  ratingCount: number;
  official: boolean;
  priceCents?: number;
}

interface AgentMarketplaceTabProps {
  /** Optional: fired when an agent is installed, with the uAAL program */
  onAgentInstalled?: (result: {
    templateId: string;
    templateName: string;
    program: string;
    programType: 'intent' | 'bytecode';
    config: { cognitiveHz: number; capabilities: string[] };
  }) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function AgentMarketplaceTab({ onAgentInstalled }: AgentMarketplaceTabProps) {
  const [agents, setAgents] = useState<AgentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'popular' | 'recent' | 'rating'>('popular');
  const [categories, setCategories] = useState<Array<{ category: string; count: number }>>([]);
  const [stats, setStats] = useState<{
    total: number;
    totalInstalls: number;
    avgRating: number;
  } | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const client = getMarketplaceClient();

  // ── Data loading ────────────────────────────────────────────────────────

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.searchAgents({
        query: searchQuery || undefined,
        category: selectedCategory || undefined,
        tier: selectedTier || undefined,
        sort: sortBy,
        limit: 50,
      });
      setAgents(result.templates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
      // Fallback to empty
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCategory, selectedTier, sortBy]);

  const loadMeta = useCallback(async () => {
    try {
      const [catData, statsData] = await Promise.all([
        client.getAgentCategories(),
        client.getAgentMarketplaceStats(),
      ]);
      setCategories(catData.categories || []);
      setStats(statsData);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  // Debounced search
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), DEBOUNCE_INPUT);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    loadAgents();
  }, [debouncedQuery, selectedCategory, selectedTier, sortBy]);

  // ── Install handler ─────────────────────────────────────────────────────

  const handleInstall = useCallback(
    async (agent: AgentTemplate) => {
      setInstallingId(agent.id);
      setSuccessMessage(null);
      setError(null);
      try {
        const result = await client.installAgent(agent.id);
        if (result.success && result.program) {
          setInstalledIds((prev) => new Set(prev).add(agent.id));
          
          if (result.revenueSplit) {
            setSuccessMessage(`x402 Settlement Complete: Paid ${result.revenueSplit.total} USDC via ${result.revenueSplit.x402?.network}`);
            setTimeout(() => setSuccessMessage(null), 5000);
          }

          onAgentInstalled?.({
            templateId: result.templateId!,
            templateName: result.templateName!,
            program: result.program,
            programType: result.programType || 'intent',
            config: result.config || { cognitiveHz: 4, capabilities: [] },
          });
        } else {
          setError(result.error || 'Install failed');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Install failed');
      } finally {
        setInstallingId(null);
      }
    },
    [onAgentInstalled]
  );

  // ── Render helpers ──────────────────────────────────────────────────────

  const renderStars = (rating: number) => {
    const full = Math.floor(rating);
    const half = rating - full >= 0.5;
    return (
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-3 w-3 ${
              i < full
                ? 'fill-amber-400 text-amber-400'
                : i === full && half
                  ? 'fill-amber-400/50 text-amber-400'
                  : 'text-gray-600'
            }`}
          />
        ))}
      </div>
    );
  };

  const getCategoryConfig = (cat: string) =>
    AGENT_CATEGORY_CONFIG[cat] || AGENT_CATEGORY_CONFIG.utility;

  const getTierBadge = (tier: string) => TIER_BADGE[tier] || TIER_BADGE.free;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Stats bar */}
      {stats && (
        <div className="flex items-center gap-4 px-4 py-2 border-b border-studio-border text-[10px] text-studio-muted">
          <span className="flex items-center gap-1">
            <Bot className="h-3 w-3" />
            {stats.total} agents
          </span>
          <span className="flex items-center gap-1">
            <Download className="h-3 w-3" />
            {stats.totalInstalls.toLocaleString()} installs
          </span>
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            {stats.avgRating.toFixed(1)} avg
          </span>
        </div>
      )}

      {/* Search + filters */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-studio-border">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-studio-muted" />
          <input
            type="text"
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-studio-border bg-studio-surface py-1.5 pl-8 pr-3 text-xs text-studio-text placeholder-studio-muted focus:border-studio-accent focus:outline-none"
          />
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="rounded-md border border-studio-border bg-studio-surface px-2 py-1.5 text-xs text-studio-text focus:border-studio-accent focus:outline-none"
        >
          <option value="popular">Popular</option>
          <option value="recent">Recent</option>
          <option value="rating">Rating</option>
        </select>

        <select
          value={selectedTier || ''}
          onChange={(e) => setSelectedTier(e.target.value || null)}
          className="rounded-md border border-studio-border bg-studio-surface px-2 py-1.5 text-xs text-studio-text focus:border-studio-accent focus:outline-none"
        >
          <option value="">All Tiers</option>
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>

      {/* Category pills */}
      {categories.length > 0 && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-studio-border overflow-x-auto">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium transition ${
              !selectedCategory
                ? 'bg-studio-accent text-white'
                : 'bg-studio-surface text-studio-muted hover:text-studio-text'
            }`}
          >
            All
          </button>
          {categories.map((cat) => {
            const config = getCategoryConfig(cat.category);
            return (
              <button
                key={cat.category}
                onClick={() =>
                  setSelectedCategory(selectedCategory === cat.category ? null : cat.category)
                }
                className={`shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition ${
                  selectedCategory === cat.category
                    ? 'bg-studio-accent text-white'
                    : 'bg-studio-surface text-studio-muted hover:text-studio-text'
                }`}
              >
                {config.label}
                <span className="opacity-60">({cat.count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Agent cards */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">
              dismiss
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-400 flex items-center justify-between transition-all">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {successMessage}
            </span>
            <button onClick={() => setSuccessMessage(null)} className="opacity-70 hover:opacity-100">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-studio-accent" />
          </div>
        )}

        {!loading && agents.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
            <Bot className="h-10 w-10 text-studio-muted" />
            <p className="text-sm text-studio-muted">No agents found</p>
            <p className="text-[10px] text-studio-muted/70">Try adjusting your search or filters</p>
          </div>
        )}

        {!loading && agents.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {agents.map((agent) => {
              const catConfig = getCategoryConfig(agent.category);
              const tierBadge = getTierBadge(agent.tier);
              const CatIcon = catConfig.icon;
              const TierIcon = tierBadge.icon;
              const isInstalled = installedIds.has(agent.id);
              const isInstalling = installingId === agent.id;
              const hasPrice = agent.priceCents && agent.priceCents > 0;
              const formattedPrice = hasPrice ? `USDC ${(agent.priceCents! / 100).toFixed(2)}` : 'Install';

              return (
                <div
                  key={agent.id}
                  className="group rounded-xl border border-studio-border bg-studio-panel p-4 hover:border-studio-accent/50 transition-all hover:shadow-lg hover:shadow-studio-accent/5"
                >
                  {/* Header */}
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${catConfig.color}`}
                    >
                      <CatIcon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-semibold text-studio-text truncate">
                          {agent.name}
                        </h3>
                        {agent.official && (
                          <span title="Official">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-studio-muted">by {agent.author}</p>
                    </div>
                    <span
                      className={`shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${tierBadge.color}`}
                    >
                      <TierIcon className="h-2.5 w-2.5" />
                      {tierBadge.label}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-[11px] text-studio-muted mb-3 line-clamp-2">
                    {agent.description}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {agent.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-studio-surface px-1.5 py-0.5 text-[9px] text-studio-muted"
                      >
                        {tag}
                      </span>
                    ))}
                    {agent.tags.length > 3 && (
                      <span className="text-[9px] text-studio-muted/50">
                        +{agent.tags.length - 3}
                      </span>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-studio-border/50">
                    <div className="flex items-center gap-3 text-[10px] text-studio-muted">
                      <span className="flex items-center gap-1">
                        {renderStars(agent.rating)}
                        <span className="ml-0.5">{agent.rating.toFixed(1)}</span>
                        <span className="opacity-50">({agent.ratingCount})</span>
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Download className="h-3 w-3" />
                        {agent.installs.toLocaleString()}
                      </span>
                    </div>

                    <button
                      onClick={() => handleInstall(agent)}
                      disabled={isInstalling || isInstalled}
                      className={`flex items-center gap-1 rounded-md px-3 py-1 text-[10px] font-semibold transition ${
                        isInstalled
                          ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                          : isInstalling
                            ? 'bg-studio-accent/20 text-studio-accent cursor-wait'
                            : 'bg-studio-accent/20 text-studio-accent hover:bg-studio-accent hover:text-white'
                      }`}
                    >
                      {isInstalled ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" />
                          Installed
                        </>
                      ) : isInstalling ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Purchasing...
                        </>
                      ) : (
                        <>
                          {hasPrice ? <Lock className="h-3 w-3" /> : <Download className="h-3 w-3" />}
                          {formattedPrice}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
