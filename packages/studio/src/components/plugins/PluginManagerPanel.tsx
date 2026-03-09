/**
 * Plugin Manager Panel
 * Browse, install, enable/disable, and configure plugins
 */

'use client';

import { useState } from 'react';
import {
  X,
  Search,
  Download,
  Settings,
  ToggleLeft,
  ToggleRight,
  Trash2,
  ExternalLink,
  Package,
  Check,
  AlertCircle,
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { usePluginManager } from '@/lib/plugins/pluginManager';
import type { PluginRegistryEntry } from '@/lib/plugins/types';

interface PluginManagerPanelProps {
  onClose: () => void;
}

export function PluginManagerPanel({ onClose }: PluginManagerPanelProps) {
  const { plugins, loading, error, enablePlugin, disablePlugin, uninstallPlugin } =
    usePluginManager();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const pluginsList = Array.from(plugins.values());
  const filteredPlugins = pluginsList.filter(
    (entry) =>
      entry.plugin.metadata.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.plugin.metadata.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.plugin.metadata.keywords?.some((k) =>
        k.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      if (enabled) {
        await disablePlugin(id);
      } else {
        await enablePlugin(id);
      }
    } catch (err) {
      console.error('Failed to toggle plugin:', err);
    }
  };

  const handleUninstall = async (id: string) => {
    if (!confirm('Are you sure you want to uninstall this plugin?')) {
      return;
    }

    try {
      await uninstallPlugin(id);
    } catch (err) {
      console.error('Failed to uninstall plugin:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl border border-studio-border bg-studio-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-500/20 p-2">
              <Package className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-studio-text">Plugin Manager</h2>
              <p className="text-[10px] text-studio-muted">
                {pluginsList.length} plugins installed •{' '}
                {pluginsList.filter((p) => p.enabled).length} enabled
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-studio-muted transition hover:bg-studio-surface hover:text-studio-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-studio-border px-6 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-studio-muted" />
            <input
              type="text"
              placeholder="Search plugins..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-studio-border bg-studio-surface py-2 pl-9 pr-3 text-sm text-studio-text placeholder-studio-muted focus:border-studio-accent focus:outline-none focus:ring-1 focus:ring-studio-accent"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex h-[calc(90vh-180px)] overflow-hidden">
          {/* Plugin List */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading && (
              <div className="flex h-full items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-studio-accent border-t-transparent" />
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-400">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {!loading && !error && filteredPlugins.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <Package className="h-16 w-16 text-studio-muted opacity-50" />
                <p className="mt-4 text-sm font-medium text-studio-text">No plugins found</p>
                <p className="mt-1 text-xs text-studio-muted">
                  {searchQuery
                    ? 'Try a different search term'
                    : 'Install plugins to extend HoloScript Studio'}
                </p>
              </div>
            )}

            <div className="space-y-3">
              {filteredPlugins.map((entry) => (
                <PluginCard
                  key={entry.plugin.metadata.id}
                  entry={entry}
                  selected={selectedPlugin === entry.plugin.metadata.id}
                  onSelect={() => setSelectedPlugin(entry.plugin.metadata.id)}
                  onToggle={() => handleToggle(entry.plugin.metadata.id, entry.enabled)}
                  onUninstall={() => handleUninstall(entry.plugin.metadata.id)}
                  onSettings={() => {
                    setSelectedPlugin(entry.plugin.metadata.id);
                    setShowSettings(true);
                  }}
                />
              ))}
            </div>
          </div>

          {/* Plugin Details */}
          {selectedPlugin && (
            <div className="w-80 border-l border-studio-border bg-studio-surface p-6">
              <PluginDetails
                entry={plugins.get(selectedPlugin)!}
                showSettings={showSettings}
                onCloseSettings={() => setShowSettings(false)}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-studio-border px-6 py-4">
          <p className="text-xs text-studio-muted">
            Plugin SDK:{' '}
            <a
              href="https://holoscript.net/docs/plugins"
              target="_blank"
              rel="noopener noreferrer"
              className="text-studio-accent hover:underline"
            >
              Documentation
            </a>
          </p>
          <button className="flex items-center gap-2 rounded-lg bg-studio-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-studio-accent/90">
            <Download className="h-4 w-4" />
            Install Plugin
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Plugin Card Component ─────────────────────────────────────────────────

interface PluginCardProps {
  entry: PluginRegistryEntry;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onUninstall: () => void;
  onSettings: () => void;
}

function PluginCard({
  entry,
  selected,
  onSelect,
  onToggle,
  onUninstall,
  onSettings,
}: PluginCardProps) {
  const { plugin, enabled } = entry;
  const { metadata } = plugin;
  const IconComponent = metadata.icon ? (LucideIcons as any)[metadata.icon] || Package : Package;

  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-lg border p-4 transition ${
        selected
          ? 'border-studio-accent bg-studio-accent/10'
          : 'border-studio-border bg-studio-surface hover:border-studio-accent/40'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`rounded-lg p-2 ${enabled ? 'bg-emerald-500/20' : 'bg-studio-border/50'}`}>
          <IconComponent
            className={`h-5 w-5 ${enabled ? 'text-emerald-400' : 'text-studio-muted'}`}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-studio-text truncate">{metadata.name}</h3>
            {enabled && (
              <span className="flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                <Check className="h-3 w-3" />
                Enabled
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-studio-muted line-clamp-2">{metadata.description}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {metadata.keywords?.slice(0, 3).map((keyword) => (
              <span
                key={keyword}
                className="rounded bg-studio-border/50 px-1.5 py-0.5 text-[10px] text-studio-muted"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={`rounded-lg p-2 transition ${
              enabled
                ? 'text-emerald-400 hover:bg-emerald-500/20'
                : 'text-studio-muted hover:bg-studio-border'
            }`}
            title={enabled ? 'Disable plugin' : 'Enable plugin'}
          >
            {enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSettings();
            }}
            className="rounded-lg p-2 text-studio-muted transition hover:bg-studio-border hover:text-studio-text"
            title="Plugin settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUninstall();
            }}
            className="rounded-lg p-2 text-studio-muted transition hover:bg-red-500/20 hover:text-red-400"
            title="Uninstall plugin"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Plugin Details Component ──────────────────────────────────────────────

interface PluginDetailsProps {
  entry: PluginRegistryEntry;
  showSettings: boolean;
  onCloseSettings: () => void;
}

function PluginDetails({ entry, showSettings, onCloseSettings }: PluginDetailsProps) {
  const { plugin } = entry;
  const { metadata } = plugin;

  if (showSettings && plugin.settingsSchema) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-studio-text">Settings</h3>
          <button
            onClick={onCloseSettings}
            className="rounded-lg p-1 text-studio-muted hover:text-studio-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          {plugin.settingsSchema.map((field) => (
            <div key={field.key}>
              <label className="mb-1 block text-xs font-medium text-studio-muted">
                {field.label}
                {field.required && <span className="text-red-400"> *</span>}
              </label>
              {field.type === 'boolean' ? (
                <input
                  type="checkbox"
                  defaultChecked={plugin.settings?.[field.key] ?? field.defaultValue}
                  className="rounded border-studio-border"
                />
              ) : field.type === 'select' ? (
                <select className="w-full rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-sm">
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type === 'number' ? 'number' : 'text'}
                  defaultValue={plugin.settings?.[field.key] ?? field.defaultValue}
                  className="w-full rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-sm"
                />
              )}
              {field.description && (
                <p className="mt-1 text-[10px] text-studio-muted">{field.description}</p>
              )}
            </div>
          ))}
        </div>

        <button className="w-full rounded-lg bg-studio-accent px-4 py-2 text-sm font-medium text-white">
          Save Settings
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-studio-text">{metadata.name}</h3>
        <p className="mt-1 text-xs text-studio-muted">v{metadata.version}</p>
      </div>

      <p className="text-sm text-studio-text">{metadata.description}</p>

      {metadata.author && (
        <div>
          <p className="text-xs font-medium text-studio-muted">Author</p>
          <p className="mt-1 text-sm text-studio-text">{metadata.author.name}</p>
          {metadata.author.email && (
            <a
              href={`mailto:${metadata.author.email}`}
              className="mt-0.5 text-xs text-studio-accent hover:underline"
            >
              {metadata.author.email}
            </a>
          )}
        </div>
      )}

      {metadata.license && (
        <div>
          <p className="text-xs font-medium text-studio-muted">License</p>
          <p className="mt-1 text-sm text-studio-text">{metadata.license}</p>
        </div>
      )}

      {metadata.homepage && (
        <a
          href={metadata.homepage}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-studio-accent hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          Homepage
        </a>
      )}

      <div className="space-y-2 pt-4 border-t border-studio-border">
        <p className="text-xs font-medium text-studio-muted">Provides</p>
        {plugin.nodeTypes && (
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded bg-blue-500/20 px-2 py-1 text-blue-400">
              {(plugin.nodeTypes.workflow?.length || 0) +
                (plugin.nodeTypes.behaviorTree?.length || 0)}{' '}
              custom nodes
            </span>
          </div>
        )}
        {plugin.panels && (
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded bg-purple-500/20 px-2 py-1 text-purple-400">
              {plugin.panels.length} custom panels
            </span>
          </div>
        )}
        {plugin.toolbarButtons && (
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded bg-green-500/20 px-2 py-1 text-green-400">
              {plugin.toolbarButtons.length} toolbar buttons
            </span>
          </div>
        )}
        {plugin.keyboardShortcuts && (
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded bg-yellow-500/20 px-2 py-1 text-yellow-400">
              {plugin.keyboardShortcuts.length} keyboard shortcuts
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
