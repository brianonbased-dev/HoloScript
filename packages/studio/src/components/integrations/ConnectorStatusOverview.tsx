'use client';

/**
 * ConnectorStatusOverview — single at-a-glance health grid for /integrations.
 *
 * Founder ask: "see all our connectors and statuses in one place; so much that
 * needs to be wired." This is the perceivable operate-surface (D.081, F.099):
 *  - Service Connectors: live status from connectorStore (the wired ones) plus
 *    built-but-unwired connectors flagged honestly (Moltbook).
 *  - Infrastructure: MCP servers pinged live via GET /api/connectors/status.
 *
 * Additive + self-contained: reads the store, does NOT mutate the ServiceId
 * union (full Moltbook connect-wiring is a tracked follow-up).
 *
 * @module integrations/ConnectorStatusOverview
 */

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  Github as GithubIcon,
  Train,
  Code,
  Package,
  Database,
  BookOpen,
  Server,
  RefreshCw,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import {
  useConnectorStore,
  type ServiceId,
  type ConnectionStatus,
} from '@/lib/stores/connectorStore';

// ─── Connector registry ─────────────────────────────────────────────────────
// The built service connectors and whether each is wired into the connect flow.
interface ConnectorMeta {
  id: ServiceId | 'moltbook';
  name: string;
  icon: LucideIcon;
  /** Surfaced in the panel AND has a /api/connectors/connect handler. */
  wired: boolean;
  note?: string;
}

const CONNECTORS: ConnectorMeta[] = [
  { id: 'github', name: 'GitHub', icon: GithubIcon, wired: true },
  { id: 'railway', name: 'Railway', icon: Train, wired: true },
  { id: 'vscode', name: 'VSCode', icon: Code, wired: true },
  { id: 'appstore', name: 'App Store', icon: Package, wired: true },
  { id: 'upstash', name: 'Upstash', icon: Database, wired: true },
  {
    id: 'moltbook',
    name: 'Moltbook',
    icon: BookOpen,
    wired: false,
    note: 'Package built (packages/connector-moltbook) — not yet wired into the connect flow',
  },
];

// ─── Infra (server-probed) ──────────────────────────────────────────────────
type InfraStatus = 'up' | 'degraded' | 'down';

interface InfraResult {
  id: string;
  name: string;
  url: string;
  kind: string;
  description: string;
  status: InfraStatus;
  httpStatus: number | null;
  latencyMs: number | null;
  error?: string;
  checkedAt: string;
}

interface StatusResponse {
  checkedAt: string;
  summary: { total: number; up: number; degraded: number; down: number };
  infra: InfraResult[];
}

const REFRESH_MS = 30_000;

// ─── Visual helpers ─────────────────────────────────────────────────────────
type Health = ConnectionStatus | InfraStatus | 'unwired';

const DOT: Record<Health, string> = {
  connected: 'bg-emerald-500',
  up: 'bg-emerald-500',
  connecting: 'bg-amber-500 animate-pulse',
  degraded: 'bg-amber-500',
  error: 'bg-rose-500',
  down: 'bg-rose-500',
  disconnected: 'bg-studio-muted',
  unwired: 'bg-studio-muted',
};

const LABEL: Record<Health, string> = {
  connected: 'Connected',
  up: 'Healthy',
  connecting: 'Connecting…',
  degraded: 'Degraded',
  error: 'Error',
  down: 'Down',
  disconnected: 'Disconnected',
  unwired: 'Not wired',
};

function StatusDot({ health }: { health: Health }) {
  return (
    <span
      className={clsx('inline-block h-2.5 w-2.5 rounded-full', DOT[health])}
      aria-hidden
    />
  );
}

// ─── Component ──────────────────────────────────────────────────────────────
export function ConnectorStatusOverview() {
  const connections = useConnectorStore((s) => s.connections);
  const [infra, setInfra] = useState<InfraResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/connectors/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as StatusResponse;
      setInfra(data.infra);
      setLastChecked(data.checkedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const connectorHealth = (c: ConnectorMeta): Health => {
    if (!c.wired) return 'unwired';
    const conn = connections[c.id as ServiceId];
    return conn ? conn.status : 'disconnected';
  };

  const connectedCount = CONNECTORS.filter((c) => connectorHealth(c) === 'connected').length;
  const unwiredCount = CONNECTORS.filter((c) => !c.wired).length;
  const infraUp = infra.filter((i) => i.status === 'up').length;
  const infraIssues = infra.filter((i) => i.status !== 'up').length;

  return (
    <section className="max-h-[42vh] overflow-y-auto border-b border-studio-border bg-studio-bg px-6 py-4">
      {/* Header + summary */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-studio-text">Connectors &amp; Status</h2>
          <p className="text-xs text-studio-muted">
            {connectedCount}/{CONNECTORS.length} connectors connected
            {unwiredCount > 0 && <> · {unwiredCount} not wired</>}
            {' · '}
            {infra.length > 0 ? `${infraUp}/${infra.length}` : '—'} infra healthy
            {infraIssues > 0 && (
              <>
                {' '}· {infraIssues} issue{infraIssues > 1 ? 's' : ''}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastChecked && (
            <span className="text-[11px] text-studio-muted">
              checked {new Date(lastChecked).toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-studio-border px-2.5 py-1 text-xs text-studio-muted transition-colors hover:text-studio-text disabled:opacity-50"
          >
            <RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Service connectors */}
      <div className="mb-3">
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-studio-muted">
          Service connectors
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {CONNECTORS.map((c) => {
            const health = connectorHealth(c);
            const Icon = c.icon;
            return (
              <div
                key={c.id}
                title={c.note ?? LABEL[health]}
                className="flex items-center gap-2 rounded-lg border border-studio-border bg-white/[0.02] px-3 py-2"
              >
                <Icon className="h-4 w-4 shrink-0 text-studio-muted" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-studio-text">{c.name}</div>
                  <div className="flex items-center gap-1.5">
                    <StatusDot health={health} />
                    <span className="text-[11px] text-studio-muted">{LABEL[health]}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Infrastructure */}
      <div>
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-studio-muted">
          Infrastructure (MCP)
        </div>
        {error ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-400">
            Status probe failed: {error}
          </div>
        ) : infra.length === 0 && loading ? (
          <div className="flex items-center gap-2 px-1 py-2 text-xs text-studio-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Probing…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {infra.map((s) => (
              <div
                key={s.id}
                title={`${s.description}\n${s.url}${s.error ? `\n${s.error}` : ''}`}
                className="flex items-center gap-2 rounded-lg border border-studio-border bg-white/[0.02] px-3 py-2"
              >
                <Server className="h-4 w-4 shrink-0 text-studio-muted" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-studio-text">{s.name}</div>
                  <div className="truncate text-[11px] text-studio-muted">{s.description}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <div className="flex items-center gap-1.5">
                    <StatusDot health={s.status} />
                    <span className="text-[11px] text-studio-muted">{LABEL[s.status]}</span>
                  </div>
                  {s.latencyMs != null && (
                    <span className="text-[10px] text-studio-muted">
                      {s.latencyMs}ms{s.httpStatus ? ` · ${s.httpStatus}` : ''}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
