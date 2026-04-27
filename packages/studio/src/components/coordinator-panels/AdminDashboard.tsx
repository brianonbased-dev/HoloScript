'use client';
/**
 * AdminDashboard — Studio downstream consumer of SecurityEventBus.
 *
 * Closes the W.081 "wire through ONE real consumer" requirement at the
 * Studio surface for the SecurityEventBus. Renders aggregate counts
 * across all 6 security domains (sessions / agents / tenants / quotas /
 * audit / forget) plus the last N audit-log entries (live, rolling).
 *
 * Designed for embedding in an admin/ops surface — does NOT expose
 * mutation controls; consumers wanting to revoke / suspend should call
 * the matching trait events directly.
 */
import type { TraitRuntimeIntegration } from '@holoscript/engine/runtime/TraitRuntimeIntegration';
import { useSecurityPresence } from './TraitRuntimeContext';

export interface AdminDashboardProps {
  runtime?: TraitRuntimeIntegration | null;
  /** Max audit-log rows to render. Defaults to 20 (newest at top). */
  maxAuditRows?: number;
}

export function AdminDashboard({ runtime, maxAuditRows = 20 }: AdminDashboardProps) {
  const view = useSecurityPresence(runtime);
  const { stats, auditLog } = view;
  const recent = auditLog.slice(-maxAuditRows).reverse();

  return (
    <div
      data-testid="admin-dashboard"
      style={{
        padding: 16,
        background: '#0f172a',
        color: '#e2e8f0',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        minHeight: 320,
      }}
    >
      <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Security & compliance</h2>

      <div
        data-testid="admin-stat-grid"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}
      >
        <StatCell
          testid="stat-sessions-active"
          label="Sessions"
          primary={stats.sessions.authenticated}
          secondary={`${stats.sessions.expired} expired · ${stats.sessions.revoked} revoked`}
        />
        <StatCell
          testid="stat-agents"
          label="Agents tracked"
          primary={stats.agents.tracked}
          secondary="RBAC scope"
        />
        <StatCell
          testid="stat-tenants"
          label="Tenants active"
          primary={stats.tenants.active}
          secondary={`${stats.tenants.suspended} suspended · ${stats.tenants.decommissioned} decom.`}
        />
        <StatCell
          testid="stat-quotas-exceeded"
          label="Quotas exceeded"
          primary={stats.quotas.exceeded}
          secondary={`${stats.quotas.grace} in grace · ${stats.quotas.tracked} tracked`}
          accent={stats.quotas.exceeded > 0 ? '#f87171' : undefined}
        />
      </div>

      <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#cbd5e1' }}>
        Recent audit ({auditLog.length}/{stats.auditLog.capacity})
      </h3>
      {recent.length === 0 ? (
        <div data-testid="admin-audit-empty" style={{ color: '#64748b', fontStyle: 'italic' }}>
          No audit events observed yet.
        </div>
      ) : (
        <div data-testid="admin-audit-list" style={{ maxHeight: 240, overflowY: 'auto' }}>
          {recent.map((entry, i) => (
            <div
              key={`${entry.observedAt}-${i}`}
              data-testid={`admin-audit-row-${i}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '110px 1fr 1fr 80px',
                gap: 6,
                padding: '4px 0',
                borderBottom: '1px solid #1e293b',
                fontSize: 12,
              }}
            >
              <span style={{ color: '#94a3b8' }}>{entry.event}</span>
              <span>{entry.action ?? '—'}</span>
              <span style={{ color: '#cbd5e1' }}>{entry.actor ?? '—'}</span>
              <span
                style={{
                  color:
                    entry.outcome === 'denied' || entry.outcome === 'error'
                      ? '#f87171'
                      : entry.outcome === 'success'
                        ? '#4ade80'
                        : '#64748b',
                  textAlign: 'right',
                }}
              >
                {entry.outcome ?? ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCell({
  testid,
  label,
  primary,
  secondary,
  accent,
}: {
  testid: string;
  label: string;
  primary: number;
  secondary: string;
  accent?: string;
}) {
  return (
    <div
      data-testid={testid}
      style={{
        background: '#1e293b',
        padding: 10,
        borderRadius: 6,
        borderLeft: `3px solid ${accent ?? '#38bdf8'}`,
      }}
    >
      <div style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: accent ?? '#e2e8f0' }}>{primary}</div>
      <div style={{ color: '#64748b', fontSize: 11 }}>{secondary}</div>
    </div>
  );
}
