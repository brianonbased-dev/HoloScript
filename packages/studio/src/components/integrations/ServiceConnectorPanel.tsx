/** @jsxRuntime automatic */
'use client';

/**
 * ServiceConnectorPanel — Integration Hub for External Services
 *
 * Tabbed interface for managing 5 service connectors (GitHub, Railway, VSCode,
 * App Store, Upstash). Each tab shows connection status, configuration forms,
 * and recent activity logs.
 *
 * Part of the Studio Integration Hub vision (W.164-W.171, P.STUDIO.01).
 */

import { useState, useEffect } from 'react';
import clsx from 'clsx';
import {
  X,
  Github,
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
  type LucideIcon,
} from 'lucide-react';
import { useConnectorStore, type ServiceId as StoreServiceId } from '@/lib/stores/connectorStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceId = 'github' | 'railway' | 'vscode' | 'appstore' | 'upstash' | 'pipeline';

type ConnectionStatus = 'connected' | 'error' | 'disconnected';

interface ServiceConfig {
  id: ServiceId;
  name: string;
  icon: LucideIcon;
  description: string;
  status: ConnectionStatus;
  configFields: ConfigField[];
  recentActivity: ActivityEntry[];
}

interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  placeholder: string;
  value: string;
}

interface ActivityEntry {
  timestamp: string;
  action: string;
  status: 'success' | 'error' | 'pending';
}

// ─── Service Metadata ─────────────────────────────────────────────────────────

const SERVICE_CONFIGS: Record<ServiceId, Omit<ServiceConfig, 'status' | 'configFields' | 'recentActivity'>> = {
  github: {
    id: 'github',
    name: 'GitHub',
    icon: Github,
    description: 'Repository sync, PR previews, Actions integration',
  },
  railway: {
    id: 'railway',
    name: 'Railway',
    icon: Train,
    description: 'One-click deploys, environment management',
  },
  vscode: {
    id: 'vscode',
    name: 'VSCode',
    icon: Code,
    description: 'MCP integration, live preview, bidirectional sync',
  },
  appstore: {
    id: 'appstore',
    name: 'App Store',
    icon: Package,
    description: 'TestFlight, build upload, metadata management',
  },
  upstash: {
    id: 'upstash',
    name: 'Upstash',
    icon: Database,
    description: 'Redis cache, Vector search, QStash scheduling',
  },
  pipeline: {
    id: 'pipeline',
    name: 'Recursive Pipeline',
    icon: RefreshCw,
    description: 'Auto-triggered improvement pipeline from absorb results',
  },
};

// ─── Status Indicator ─────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ConnectionStatus }) {
  const colors: Record<ConnectionStatus, string> = {
    connected: 'bg-emerald-500',
    error: 'bg-rose-500',
    disconnected: 'bg-studio-muted',
  };

  const icons: Record<ConnectionStatus, typeof CheckCircle2> = {
    connected: CheckCircle2,
    error: XCircle,
    disconnected: AlertCircle,
  };

  const Icon = icons[status];

  return (
    <div className="flex items-center gap-2">
      <div className={clsx('h-2 w-2 rounded-full', colors[status])} />
      <Icon className={clsx('h-4 w-4', colors[status].replace('bg-', 'text-'))} />
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
    <div className="space-y-1">
      {entries.slice(0, 10).map((entry, i) => (
        <div
          key={i}
          className="flex items-center gap-2 border-b border-studio-border/50 px-3 py-2 text-xs"
        >
          {/* Status icon */}
          {entry.status === 'success' && (
            <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
          )}
          {entry.status === 'error' && (
            <XCircle className="h-3 w-3 shrink-0 text-rose-400" />
          )}
          {entry.status === 'pending' && (
            <RefreshCw className="h-3 w-3 shrink-0 animate-spin text-sky-400" />
          )}

          {/* Timestamp */}
          <span className="shrink-0 font-mono text-studio-muted">{entry.timestamp}</span>

          {/* Action */}
          <span className="flex-1 truncate text-studio-text/80">{entry.action}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Service Tab Content ──────────────────────────────────────────────────────

function ServiceTabContent({ service }: { service: ServiceConfig }) {
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const connect = useConnectorStore((s) => s.connect);
  const disconnect = useConnectorStore((s) => s.disconnect);
  const updateConfig = useConnectorStore((s) => s.updateConfig);

  const handleConnect = async () => {
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
  };

  const handleDisconnect = async () => {
    try {
      await disconnect(service.id as StoreServiceId);
      setShowDisconnectConfirm(false);
    } catch (err) {
      console.error(`[ServiceConnectorPanel] Disconnect failed:`, err);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <service.icon className="h-6 w-6 text-studio-accent" />
          <div>
            <h3 className="text-sm font-semibold text-studio-text">{service.name}</h3>
            <p className="text-xs text-studio-muted">{service.description}</p>
          </div>
        </div>
        <StatusDot status={service.status} />
      </div>

      {/* Configuration Form */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-studio-muted">
          Configuration
        </h4>
        {service.configFields.map((field) => (
          <div key={field.key} className="flex flex-col gap-1">
            <label className="text-xs font-medium text-studio-text/90" htmlFor={field.key}>
              {field.label}
            </label>
            <input
              id={field.key}
              type={field.type}
              placeholder={field.placeholder}
              value={field.value}
              onChange={(e) => {
                // Update config in store
                updateConfig(service.id as StoreServiceId, { [field.key]: e.target.value });
              }}
              className="rounded border border-studio-border bg-studio-bg-muted px-3 py-2 text-xs text-studio-text placeholder-studio-muted focus:border-studio-accent focus:outline-none focus:ring-1 focus:ring-studio-accent/30"
            />
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {service.status === 'disconnected' ? (
          <button
            onClick={handleConnect}
            className="flex-1 rounded bg-studio-accent px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-studio-accent/90"
          >
            Connect
          </button>
        ) : (
          <>
            <button
              onClick={handleConnect}
              className="flex items-center gap-2 rounded border border-studio-border px-4 py-2 text-xs font-medium text-studio-text transition-colors hover:bg-studio-bg-muted"
            >
              <RefreshCw className="h-3 w-3" />
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
                <Trash2 className="h-3 w-3" />
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
        href="#"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-xs text-studio-accent transition-colors hover:text-studio-accent/80"
      >
        Open {service.name} Dashboard
        <ExternalLink className="h-3 w-3" />
      </a>
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
                placeholder: 'ghp_••••••••••••••••',
                value: connection?.config?.token || '',
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
                  placeholder: '••••••••••••••••',
                  value: connection?.config?.token || '',
                },
                {
                  key: 'project',
                  label: 'Default Project ID',
                  type: 'text' as const,
                  placeholder: 'proj_••••••',
                  value: connection?.config?.project || '',
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
                  },
                  {
                    key: 'googleKey',
                    label: 'Google Service Account JSON',
                    type: 'password' as const,
                    placeholder: '{"type":"service_account"...}',
                    value: connection?.config?.googleKey || '',
                  },
                ]
              : config.id === 'upstash'
                ? [
                    {
                      key: 'redisUrl',
                      label: 'Redis REST URL',
                      type: 'url' as const,
                      placeholder: 'https://•••.upstash.io',
                      value: connection?.config?.redisUrl || '',
                    },
                    {
                      key: 'token',
                      label: 'REST Token',
                      type: 'password' as const,
                      placeholder: '••••••••',
                      value: connection?.config?.token || '',
                    },
                  ]
                : [
                    {
                      key: 'token',
                      label: 'API Token / Key',
                      type: 'password' as const,
                      placeholder: '••••••••••••••••',
                      value: connection?.config?.token || '',
                    },
                  ];

      return {
        ...config,
        status: connection?.status || 'disconnected',
        configFields,
        recentActivity: serviceActivities,
      };
    });

  const activeService = services.find((s) => s.id === activeTab);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-studio-bg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-studio-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-studio-text">Service Integrations</h2>
          <p className="text-xs text-studio-muted">
            Connect external services to unlock deployment, testing, and collaboration
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
      <div className="flex border-b border-studio-border">
        {services.map((service) => {
          const Icon = service.icon;
          return (
            <button
              key={service.id}
              onClick={() => setActiveTab(service.id)}
              className={clsx(
                'flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-3 text-xs font-medium transition-colors',
                activeTab === service.id
                  ? 'border-studio-accent text-studio-accent'
                  : 'border-transparent text-studio-muted hover:bg-studio-bg-muted hover:text-studio-text'
              )}
            >
              <Icon className="h-4 w-4" />
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
