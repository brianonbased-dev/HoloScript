'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { absorbFetch } from '@/lib/absorb/fetchWithAuth';
import { logger } from '@/lib/logger';
import {
  Users,
  FolderGit2,
  Bot,
  BarChart3,
  Activity,
  StopCircle,
  RefreshCw,
  Shield,
  DollarSign,
  MessageSquare,
  ThumbsUp,
  Zap,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PlatformStats {
  totalUsers: number;
  totalProjects: number;
  totalAgents: number;
  activeAgents: number;
  totalPosts: number;
  totalComments: number;
  totalUpvotesGiven: number;
  totalLlmSpentCents: number;
  timestamp: string;
}

interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: string;
  githubId: string | null;
  projectCount: number;
}

interface AdminProject {
  id: string;
  name: string;
  userId: string;
  sourceType: string;
  status: string;
  createdAt: string;
}

interface AdminAgent {
  id: string;
  agentName: string;
  userId: string;
  heartbeatEnabled: boolean;
  totalPostsGenerated: number;
  totalCommentsGenerated: number;
  totalUpvotesGiven: number;
  totalLlmSpentCents: number;
  moltbookApiKey: string;
  createdAt: string;
}

interface HealthNode {
  service: string;
  status: string;
  latencyMs: number;
  statusCode?: number;
  error?: string;
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color = 'blue',
}: {
  label: string;
  value: string | number;
  icon: any;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-400 bg-blue-500/10',
    green: 'text-green-400 bg-green-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
    red: 'text-red-400 bg-red-500/10',
    cyan: 'text-cyan-400 bg-cyan-500/10',
  };
  return (
    <div className="rounded-xl border border-[#2a2a3e] bg-[#111827] p-5">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${colorMap[color] || colorMap.blue}`}>
          <Icon size={18} />
        </div>
        <div>
          <p className="text-xs text-[#71717a]">{label}</p>
          <p className="text-lg font-bold text-[#e4e4e7]">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Names ──────────────────────────────────────────────────────────────

type Tab = 'overview' | 'users' | 'projects' | 'agents' | 'health';

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [agents, setAgents] = useState<AdminAgent[]>([]);
  const [health, setHealth] = useState<HealthNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (endpoint: string) => {
    const res = await absorbFetch(`/api/admin/${endpoint}`);
    if (!res.ok) {
      if (res.status === 403)
        throw new Error('Admin access required. Connect your GitHub account first.');
      throw new Error(`Failed to fetch ${endpoint} (${res.status})`);
    }
    return res.json();
  }, []);

  const loadTab = useCallback(
    async (t: Tab) => {
      setLoading(true);
      setError(null);
      try {
        switch (t) {
          case 'overview': {
            const data = await fetchData('stats');
            setStats(data);
            break;
          }
          case 'users': {
            const data = await fetchData('users?limit=100');
            setUsers(data.users);
            break;
          }
          case 'projects': {
            const data = await fetchData('projects?limit=100');
            setProjects(data.projects);
            break;
          }
          case 'agents': {
            const data = await fetchData('agents?limit=100');
            setAgents(data.agents);
            break;
          }
          case 'health': {
            const data = await fetchData('health-matrix');
            setHealth(data.matrix);
            break;
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Request failed');
      } finally {
        setLoading(false);
      }
    },
    [fetchData]
  );

  useEffect(() => {
    loadTab(tab);
  }, [tab, loadTab]);

  const forceStop = async (agentId: string, agentName: string) => {
    if (!confirm(`Force stop agent "${agentName}"?`)) return;
    try {
      const res = await absorbFetch(`/api/admin/agents/${agentId}/force-stop`, { method: 'POST' });
      if (res.ok) {
        setAgents((prev) =>
          prev.map((a) => (a.id === agentId ? { ...a, heartbeatEnabled: false } : a))
        );
      }
    } catch (err) { logger.warn('[AdminPage] force-stop agent failed:', err); }
  };

  if (!session?.user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#050510] text-[#71717a]">
        <p>Sign in to access the admin panel.</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'overview', label: 'Overview', icon: BarChart3 },
    { key: 'users', label: 'Users', icon: Users },
    { key: 'projects', label: 'Projects', icon: FolderGit2 },
    { key: 'agents', label: 'Agents', icon: Bot },
    { key: 'health', label: 'Health', icon: Activity },
  ];

  return (
    <div className="flex h-screen flex-col bg-[#050510] text-[#e4e4e7]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[#2a2a3e] bg-[#0d0d14] px-6 py-4">
        <div className="flex items-center gap-3">
          <Shield size={20} className="text-purple-400" />
          <h1 className="text-lg font-bold">Platform Admin</h1>
        </div>
        <button
          onClick={() => loadTab(tab)}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-[#2a2a3e] px-3 py-1.5 text-xs text-[#71717a] hover:text-[#e4e4e7] transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </header>

      {/* Tab Bar */}
      <div className="border-b border-[#2a2a3e] bg-[#0d0d14] px-6 py-2">
        <div className="flex gap-1">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${
                tab === key
                  ? 'bg-[#3b82f6] text-white'
                  : 'text-[#71717a] hover:text-[#e4e4e7] hover:bg-[#1f2937]'
              }`}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Overview Tab */}
        {tab === 'overview' && stats && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            <StatCard label="Total Users" value={stats.totalUsers} icon={Users} color="blue" />
            <StatCard
              label="Total Projects"
              value={stats.totalProjects}
              icon={FolderGit2}
              color="green"
            />
            <StatCard label="Total Agents" value={stats.totalAgents} icon={Bot} color="purple" />
            <StatCard
              label="Active Agents"
              value={stats.activeAgents}
              icon={Activity}
              color="cyan"
            />
            <StatCard label="Total Posts" value={stats.totalPosts} icon={Zap} color="amber" />
            <StatCard
              label="Total Comments"
              value={stats.totalComments}
              icon={MessageSquare}
              color="blue"
            />
            <StatCard
              label="Total Upvotes"
              value={stats.totalUpvotesGiven}
              icon={ThumbsUp}
              color="green"
            />
            <StatCard
              label="LLM Spend"
              value={`$${(stats.totalLlmSpentCents / 100).toFixed(2)}`}
              icon={DollarSign}
              color="red"
            />
          </div>
        )}

        {/* Users Tab */}
        {tab === 'users' && (
          <div className="space-y-2">
            <p className="mb-3 text-xs text-[#71717a]">{users.length} users</p>
            <div className="rounded-xl border border-[#2a2a3e] overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-[#111827] text-[#71717a]">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Name</th>
                    <th className="px-4 py-2.5 text-left font-medium">Email</th>
                    <th className="px-4 py-2.5 text-left font-medium">GitHub ID</th>
                    <th className="px-4 py-2.5 text-right font-medium">Projects</th>
                    <th className="px-4 py-2.5 text-left font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2a3e]">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-[#111827]/50">
                      <td className="px-4 py-2.5 font-medium">{u.name || '—'}</td>
                      <td className="px-4 py-2.5 text-[#71717a]">{u.email || '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-[#71717a]">{u.githubId || '—'}</td>
                      <td className="px-4 py-2.5 text-right">{u.projectCount}</td>
                      <td className="px-4 py-2.5 text-[#71717a]">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Projects Tab */}
        {tab === 'projects' && (
          <div className="space-y-2">
            <p className="mb-3 text-xs text-[#71717a]">{projects.length} projects</p>
            <div className="rounded-xl border border-[#2a2a3e] overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-[#111827] text-[#71717a]">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Name</th>
                    <th className="px-4 py-2.5 text-left font-medium">Source</th>
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium">User ID</th>
                    <th className="px-4 py-2.5 text-left font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2a3e]">
                  {projects.map((p) => (
                    <tr key={p.id} className="hover:bg-[#111827]/50">
                      <td className="px-4 py-2.5 font-medium">{p.name}</td>
                      <td className="px-4 py-2.5 text-[#71717a]">{p.sourceType}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            p.status === 'active'
                              ? 'bg-green-500/10 text-green-400'
                              : 'bg-[#1f2937] text-[#71717a]'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[#71717a] truncate max-w-[120px]">
                        {p.userId.slice(0, 8)}...
                      </td>
                      <td className="px-4 py-2.5 text-[#71717a]">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Agents Tab */}
        {tab === 'agents' && (
          <div className="space-y-2">
            <p className="mb-3 text-xs text-[#71717a]">{agents.length} agents</p>
            <div className="space-y-3">
              {agents.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-xl border border-[#2a2a3e] bg-[#111827] p-4"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`h-2 w-2 rounded-full ${a.heartbeatEnabled ? 'bg-green-500 shadow-[0_0_6px_#22c55e]' : 'bg-[#71717a]'}`}
                    />
                    <div>
                      <p className="text-sm font-bold">{a.agentName}</p>
                      <p className="text-[10px] font-mono text-[#71717a]">
                        ID: {a.id.slice(0, 12)}... | Key: {a.moltbookApiKey}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-xs text-[#71717a]">
                    <span>{a.totalPostsGenerated} posts</span>
                    <span>{a.totalCommentsGenerated} comments</span>
                    <span>{a.totalUpvotesGiven} upvotes</span>
                    <span>${(a.totalLlmSpentCents / 100).toFixed(2)}</span>
                    {a.heartbeatEnabled && (
                      <button
                        onClick={() => forceStop(a.id, a.agentName)}
                        className="flex items-center gap-1 rounded-lg bg-red-500/10 px-3 py-1.5 text-red-400 hover:bg-red-500/20 transition-colors"
                      >
                        <StopCircle size={12} />
                        Stop
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {agents.length === 0 && !loading && (
                <p className="py-8 text-center text-sm text-[#71717a]">No agents found. Agents appear after registering via <a href="/agents/me" className="text-blue-400 hover:underline">HoloMesh onboard</a>.</p>
              )}
            </div>
          </div>
        )}

        {/* Health Tab */}
        {tab === 'health' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {health.map((node, i) => {
              const online = node.status === 'ONLINE';
              return (
                <div
                  key={i}
                  className={`rounded-xl border p-5 ${online ? 'border-[#2a2a3e] bg-[#111827]' : 'border-red-500/30 bg-red-500/5'}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold truncate" title={node.service}>
                      {node.service}
                    </h3>
                    <span
                      className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-mono ${
                        online ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}
                      />
                      {node.status}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-[#71717a]">
                    <p>Latency: {node.latencyMs >= 0 ? `${node.latencyMs}ms` : 'N/A'}</p>
                    {node.statusCode && <p>HTTP {node.statusCode}</p>}
                    {node.error && (
                      <p className="text-red-400 truncate" title={node.error}>
                        {node.error}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {health.length === 0 && !loading && (
              <p className="col-span-full py-8 text-center text-sm text-[#71717a]">
                No health data available. Health checks run automatically when services are registered.
              </p>
            )}
          </div>
        )}

        {loading && !stats && !error && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={20} className="animate-spin text-[#71717a]" />
          </div>
        )}
      </main>
    </div>
  );
}
