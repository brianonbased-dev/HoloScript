/** @jsxRuntime automatic */
'use client';

/**
 * ServiceConnectorPanel — Integration Hub for External Services
 *
 * Tabbed interface for managing 5 service connectors (GitHub, Railway, VSCode,
 * App Store, Upstash). Each tab shows connection status, configuration forms,
 * and recent activity logs.
 *
 * Features:
 * - Per-service connection status indicator (green/yellow/red dot)
 * - OAuth connect flow for GitHub (device code flow)
 * - Service-specific configuration forms
 * - Recent activity log (last 10 events per service)
 * - Disconnect with confirmation dialog
 * - ARIA tab/tabpanel pattern for accessibility
 * - Real-time SSE activity stream
 *
 * Part of the Studio Integration Hub vision (W.164-W.171, P.STUDIO.01).
 */

import { useState, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import {
  X,
  // eslint-disable-next-line deprecation/deprecation -- lucide-react alias; no replacement yet
  Github as GithubIcon,
  Train,
  Code,
  Package,
  Database,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ExternalLink,
  Trash2,
  RefreshCw,
  Loader2,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import {
  useConnectorStore,
  type ServiceId as StoreServiceId,
  type ConnectionStatus as StoreConnectionStatus,
} from '@/lib/stores/connectorStore';
import { GitHubOAuthModal } from './GitHubOAuthModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceId = 'github' | 'railway' | 'vscode' | 'appstore' | 'upstash' | 'pipeline';

/** Reuse the store's ConnectionStatus so types stay in sync */
type ConnectionStatus = StoreConnectionStatus;

interface ServiceConfig {
  id: ServiceId;
  name: string;
  icon: LucideIcon;
  description: string;
  dashboardUrl: string;
  status: ConnectionStatus;
  connectedAt?: string;
  configFields: ConfigField[];
  recentActivity: ActivityEntry[];
}

interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  placeholder: string;
  value: string;
  helpText?: string;
}

interface ActivityEntry {
  timestamp: string;
  action: string;
  status: 'success' | 'error' | 'pending';
}

// ─── Service Metadata ─────────────────────────────────────────────────────────

const SERVICE_CONFIGS: Record<
  ServiceId,
  Omit<ServiceConfig, 'status' | 'configFields' | 'recentActivity' | 'connectedAt'>
> = {
  github: {
    id: 'github',
    name: 'GitHub',
    icon: GithubIcon,
    description: 'Repository sync, PR previews, Actions integration',
    dashboardUrl: 'https://github.com/settings/tokens',
  },
  railway: {
    id: 'railway',
    name: 'Railway',
    icon: Train,
    description: 'One-click deploys, environment management',
    dashboardUrl: 'https://railway.app/dashboard',
  },
  vscode: {
    id: 'vscode',
    name: 'VSCode',
    icon: Code,
    description: 'MCP integration, live preview, bidirectional sync',
    dashboardUrl: 'vscode://holoscript.holoscript-mcp',
  },
  appstore: {
    id: 'appstore',
    name: 'App Store',
    icon: Package,
    description: 'TestFlight, build upload, metadata management',
    dashboardUrl: 'https://appstoreconnect.apple.com',
  },
  upstash: {
    id: 'upstash',
    name: 'Upstash',
    icon: Database,
    description: 'Redis cache, Vector search, QStash scheduling',
    dashboardUrl: 'https://console.upstash.com',
  },
  pipeline: {
    id: 'pipeline',
    name: 'Recursive Pipeline',
    icon: RefreshCw,
    description: 'Auto-triggered improvement pipeline from absorb results',
    dashboardUrl: '#',
  },
};

// ─── Status Labels ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: 'Connected',
  connecting: 'Connecting...',
  error: 'Error',
  disconnected: 'Disconnected',
};

// ─── Status Indicator ─────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ConnectionStatus }) {
  const dotColors: Record<ConnectionStatus, string> = {
    connected: 'bg-emerald-500',
    connecting: 'bg-amber-500 animate-pulse',
    error: 'bg-rose-500',
    disconnected: 'bg-studio-muted',
  };

  const iconMap: Record<ConnectionStatus, LucideIcon> = {
    connected: CheckCircle2,
    connecting: Loader2,
    error: XCircle,
    disconnected: AlertCircle,
  };

  const iconColors: Record<ConnectionStatus, string> = {
    connected: 'text-emerald-500',
    connecting: 'text-amber-500 animate-spin',
    error: 'text-rose-500',
    disconnected: 'text-studio-muted',
  };

  const Icon = iconMap[status];

  return (
    <div className="flex items-center gap-2" role="status" aria-label={STATUS_LABELS[status]}>
      <div className={clsx('h-2 w-2 rounded-full', dotColors[status])} />
      <Icon className={clsx('h-4 w-4', iconColors[status])} />
    </div>
  );
}

// ─── Activity Log ─────────────────────────────────────────────────────────────

function ActivityLog({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-studio-muted">
        No recent activity
      </div>
    );
  }

  return (
    <ul className="space-y-1" aria-label="Recent activity log">
      {entries.slice(0, 10).map((entry, i) => (
        <li
          key={`${entry.timestamp}-${i}`}
          className="flex items-center gap-2 border-b border-studio-border/50 px-3 py-2 text-xs last:border-b-0"
        >
          {/* Status icon */}
          {entry.status === 'success' && (
            <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" aria-hidden="true" />
          )}
          {entry.status === 'error' && (
            <XCircle className="h-3 w-3 shrink-0 text-rose-400" aria-hidden="true" />
          )}
          {entry.status === 'pending' && (
            <RefreshCw className="h-3 w-3 shrink-0 animate-spin text-sky-400" aria-hidden="true" />
          )}

          {/* Timestamp */}
          <span className="shrink-0 font-mono text-studio-muted">
            <time>{entry.timestamp}</time>
          </span>

          {/* Action */}
          <span className="flex-1 truncate text-studio-text/80">{entry.action}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── Service Tab Content ──────────────────────────────────────────────────────

function ServiceTabContent({ service }: { service: ServiceConfig }) {
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [showGitHubOAuth, setShowGitHubOAuth] = useState(false);
  const connect = useConnectorStore((s) => s.connect);
  const disconnect = useConnectorStore((s) => s.disconnect);
  const updateConfig = useConnectorStore((s) => s.updateConfig);

  const isConnecting = service.status === 'connecting';

  const handleConnect = useCallback(async () => {
    try {
      // Collect credentials from config fields
      const credentials: Record<string, string> = {};
      service.configFields.forEach((field) => {
        if (field.value) {
          credentials[field.key] = field.value;
        }
      });

      await connect(service.id as StoreServiceId, credentials);
    } catch (err) {
      console.error(`[ServiceConnectorPanel] Connect failed:`, err);
    }
  }, [connect, service.id, service.configFields]);

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect(service.id as StoreServiceId);
      setShowDisconnectConfirm(false);
    } catch (err) {
      console.error(`[ServiceConnectorPanel] Disconnect failed:`, err);
    }
  }, [disconnect, service.id]);

  const handleOAuthSuccess = useCallback(
    async (accessToken: string) => {
      try {
        // Connect using the OAuth token
        await connect(service.id as StoreServiceId, { token: accessToken });
        setShowGitHubOAuth(false);
      } catch (err) {
        console.error(`[ServiceConnectorPanel] OAuth connect failed:`, err);
      }
    },
    [connect, service.id]
  );

  return (
    <div
      className="flex flex-col gap-4 p-4 animate-fade-in"
      role="tabpanel"
      id={`tabpanel-${service.id}`}
      aria-labelledby={`tab-${service.id}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-studio-accent/10 p-2">
            <service.icon className="h-6 w-6 text-studio-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-studio-text">{service.name}</h3>
            <p className="text-xs text-studio-muted">{service.description}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusDot status={service.status} />
          <span className="text-[10px] font-medium text-studio-muted">
            {STATUS_LABELS[service.status]}
          </span>
        </div>
      </div>

      {/* Connected-at timestamp */}
      {service.connectedAt && service.status === 'connected' && (
        <div className="flex items-center gap-1.5 rounded border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-400">
          <Clock className="h-3 w-3" aria-hidden="true" />
          Connected since{' '}
          <time dateTime={service.connectedAt}>
            {new Date(service.connectedAt).toLocaleString()}
          </time>
        </div>
      )}

      {/* Configuration Form */}
      <fieldset className="space-y-3" disabled={isConnecting}>
        <legend className="text-xs font-semibold uppercase tracking-wide text-studio-muted">
          Configuration
        </legend>
        {service.configFields.map((field) => (
          <div key={field.key} className="flex flex-col gap-1">
            <label
              className="text-xs font-medium text-studio-text/90"
              htmlFor={`${service.id}-${field.key}`}
            >
              {field.label}
            </label>
            <input
              id={`${service.id}-${field.key}`}
              type={field.type}
              placeholder={field.placeholder}
              value={field.value}
              onChange={(e) => {
                updateConfig(service.id as StoreServiceId, { [field.key]: e.target.value });
              }}
              className="rounded border border-studio-border bg-studio-bg-muted px-3 py-2 text-xs text-studio-text placeholder-studio-muted focus:border-studio-accent focus:outline-none focus:ring-1 focus:ring-studio-accent/30 disabled:opacity-50"
              autoComplete="off"
            />
            {field.helpText && <p className="text-[10px] text-studio-muted">{field.helpText}</p>}
          </div>
        ))}
      </fieldset>

      {/* Actions */}
      <div className="flex gap-2">
        {service.status === 'disconnected' ? (
          <>
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="flex flex-1 items-center justify-center gap-2 rounded bg-studio-accent px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-studio-accent/90 disabled:opacity-50"
            >
              Connect
            </button>
            {/* GitHub OAuth button */}
            {service.id === 'github' && (
              <button
                onClick={() => setShowGitHubOAuth(true)}
                className="rounded border border-indigo-500/50 bg-indigo-500/10 px-4 py-2 text-xs font-semibold text-indigo-300 transition-colors hover:bg-indigo-500/20"
              >
                OAuth
              </button>
            )}
          </>
        ) : service.status === 'connecting' ? (
          <button
            disabled
            className="flex flex-1 items-center justify-center gap-2 rounded bg-studio-accent/50 px-4 py-2 text-xs font-semibold text-white"
          >
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            Connecting...
          </button>
        ) : (
          <>
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="flex items-center gap-2 rounded border border-studio-border px-4 py-2 text-xs font-medium text-studio-text transition-colors hover:bg-studio-bg-muted disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Reconnect
            </button>
            {showDisconnectConfirm ? (
              <div className="flex flex-1 items-center gap-2">
                <button
                  onClick={handleDisconnect}
                  className="flex-1 rounded bg-rose-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-600"
                >
                  Confirm Disconnect
                </button>
                <button
                  onClick={() => setShowDisconnectConfirm(false)}
                  className="rounded border border-studio-border px-3 py-2 text-xs font-medium text-studio-text transition-colors hover:bg-studio-bg-muted"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDisconnectConfirm(true)}
                className="flex items-center gap-2 rounded border border-rose-500/50 px-4 py-2 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/10"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
                Disconnect
              </button>
            )}
          </>
        )}
      </div>

      {/* Recent Activity */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-studio-muted">
          Recent Activity
        </h4>
        <div className="rounded border border-studio-border bg-studio-bg-muted/50">
          <ActivityLog entries={service.recentActivity} />
        </div>
      </div>

      {/* External Link */}
      <a
        href={service.dashboardUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-xs text-studio-accent transition-colors hover:text-studio-accent/80"
      >
        Open {service.name} Dashboard
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>

      {/* GitHub OAuth Modal */}
      {showGitHubOAuth && service.id === 'github' && (
        <GitHubOAuthModal
          onSuccess={handleOAuthSuccess}
          onClose={() => setShowGitHubOAuth(false)}
        />
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export interface ServiceConnectorPanelProps {
  onClose: () => void;
}

export function ServiceConnectorPanel({ onClose }: ServiceConnectorPanelProps) {
  const [activeTab, setActiveTab] = useState<ServiceId>('github');

  // Pull data from store
  const connections = useConnectorStore((s) => s.connections);
  const activities = useConnectorStore((s) => s.activities);
  const startActivityStream = useConnectorStore((s) => s.startActivityStream);
  const stopActivityStream = useConnectorStore((s) => s.stopActivityStream);

  // Start SSE activity stream on mount
  useEffect(() => {
    startActivityStream();
    return () => {
      stopActivityStream();
    };
  }, [startActivityStream, stopActivityStream]);

  // Build service configs from store data
  const services: ServiceConfig[] = Object.values(SERVICE_CONFIGS)
    .filter((config) => config.id !== 'pipeline') // Exclude pipeline from connectors
    .map((config) => {
      const connection = connections[config.id as StoreServiceId];
      const serviceActivities = activities
        .filter((a) => a.serviceId === config.id)
        .map((a) => ({
          timestamp: new Date(a.timestamp).toLocaleTimeString(),
          action: a.action,
          status: a.status,
        }));

      // Define config fields per service
      const configFields: ConfigField[] =
        config.id === 'github'
          ? [
              {
                key: 'token',
                label: 'Personal Access Token',
                type: 'password' as const,
                placeholder:
                  'ghp_\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022',
                value: connection?.config?.token || '',
                helpText: 'Requires repo, read:org, and workflow scopes',
              },
              {
                key: 'repo',
                label: 'Default Repository',
                type: 'text' as const,
                placeholder: 'username/repository',
                value: connection?.config?.repo || '',
              },
            ]
          : config.id === 'railway'
            ? [
                {
                  key: 'token',
                  label: 'Railway API Token',
                  type: 'password' as const,
                  placeholder:
                    '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022',
                  value: connection?.config?.token || '',
                  helpText: 'Generate at railway.app/account/tokens',
                },
                {
                  key: 'project',
                  label: 'Default Project ID',
                  type: 'text' as const,
                  placeholder: 'proj_\u2022\u2022\u2022\u2022\u2022\u2022',
                  value: connection?.config?.project || '',
                },
              ]
            : config.id === 'vscode'
              ? [
                  {
                    key: 'mcpServerUrl',
                    label: 'MCP Server URL',
                    type: 'url' as const,
                    placeholder: 'https://mcp.holoscript.net',
                    value: connection?.config?.mcpServerUrl || '',
                    helpText: 'The HoloScript MCP endpoint for VS Code to connect to',
                  },
                  {
                    key: 'token',
                    label: 'Extension Auth Token',
                    type: 'password' as const,
                    placeholder: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022',
                    value: connection?.config?.token || '',
                    helpText: 'Used for bidirectional sync between Studio and VS Code',
                  },
                ]
              : config.id === 'appstore'
                ? [
                    {
                      key: 'appleKey',
                      label: 'Apple API Key ID',
                      type: 'password' as const,
                      placeholder: 'ABCD1234EF',
                      value: connection?.config?.appleKey || '',
                      helpText: 'App Store Connect API key for TestFlight and submissions',
                    },
                    {
                      key: 'googleKey',
                      label: 'Google Service Account JSON',
                      type: 'password' as const,
                      placeholder: '{"type":"service_account"...}',
                      value: connection?.config?.googleKey || '',
                      helpText: 'Service account with Play Developer API access',
                    },
                  ]
                : config.id === 'upstash'
                  ? [
                      {
                        key: 'redisUrl',
                        label: 'Redis REST URL',
                        type: 'url' as const,
                        placeholder: 'https://\u2022\u2022\u2022.upstash.io',
                        value: connection?.config?.redisUrl || '',
                        helpText: 'REST endpoint from Upstash console',
                      },
                      {
                        key: 'token',
                        label: 'REST Token',
                        type: 'password' as const,
                        placeholder: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022',
                        value: connection?.config?.token || '',
                      },
                    ]
                  : [
                      {
                        key: 'token',
                        label: 'API Token / Key',
                        type: 'password' as const,
                        placeholder:
                          '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022',
                        value: connection?.config?.token || '',
                      },
                    ];

      return {
        ...config,
        status: (connection?.status || 'disconnected') as ConnectionStatus,
        connectedAt: connection?.connectedAt,
        configFields,
        recentActivity: serviceActivities,
      };
    });

  const activeService = services.find((s) => s.id === activeTab);

  // Count connected services for header summary
  const connectedCount = services.filter((s) => s.status === 'connected').length;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-studio-bg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-studio-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-studio-text">Service Integrations</h2>
          <p className="text-xs text-studio-muted">
            {connectedCount > 0
              ? `${connectedCount}/${services.length} services connected`
              : 'Connect external services to unlock deployment, testing, and collaboration'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1.5 text-studio-muted transition-colors hover:bg-studio-bg-muted hover:text-studio-text"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div
        className="flex border-b border-studio-border"
        role="tablist"
        aria-label="Service connectors"
      >
        {services.map((service) => {
          const Icon = service.icon;
          const isActive = activeTab === service.id;
          return (
            <button
              key={service.id}
              id={`tab-${service.id}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${service.id}`}
              onClick={() => setActiveTab(service.id)}
              className={clsx(
                'flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-3 text-xs font-medium transition-colors',
                isActive
                  ? 'border-studio-accent text-studio-accent'
                  : 'border-transparent text-studio-muted hover:bg-studio-bg-muted hover:text-studio-text'
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{service.name}</span>
              <StatusDot status={service.status} />
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeService && <ServiceTabContent service={activeService} />}
      </div>
    </div>
  );
}
