'use client';

/**
 * SandboxedPluginsPanel - Manages and renders all active sandboxed plugins.
 *
 * This panel provides a tabbed interface for switching between loaded sandboxed
 * plugins, each rendered in their own PluginPanelContainer with full iframe
 * isolation. It also includes a health dashboard and quick-access controls.
 *
 * @module @holoscript/studio
 */

import { useState } from 'react';
import { usePluginHost } from '@/hooks/usePluginHost';
import { PluginPanelContainer } from './PluginPanelContainer';
import { Puzzle, X, Shield, Activity, ChevronDown, Plus } from 'lucide-react';
import type { SandboxState } from '@holoscript/studio-plugin-sdk/sandbox';

interface SandboxedPluginsPanelProps {
  onClose: () => void;
  /** Callback to open the marketplace to install new plugins */
  onOpenMarketplace?: () => void;
}

const STATE_DOT: Record<SandboxState, string> = {
  creating: 'bg-gray-400',
  loading: 'bg-amber-400 animate-pulse',
  initializing: 'bg-amber-400 animate-pulse',
  ready: 'bg-blue-400',
  running: 'bg-emerald-400',
  suspended: 'bg-yellow-400',
  error: 'bg-red-400',
  terminated: 'bg-gray-500',
};

export function SandboxedPluginsPanel({ onClose, onOpenMarketplace }: SandboxedPluginsPanelProps) {
  const { loadedPlugins, getPluginState, healthSummary, ready } = usePluginHost();
  const [activePluginId, setActivePluginId] = useState<string | null>(
    loadedPlugins.length > 0 ? loadedPlugins[0] : null
  );
  const [showHealth, setShowHealth] = useState(false);

  // If the active plugin was unloaded, switch to the first one
  if (activePluginId && !loadedPlugins.includes(activePluginId)) {
    const next = loadedPlugins.length > 0 ? loadedPlugins[0] : null;
    if (next !== activePluginId) setActivePluginId(next);
  }

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Puzzle className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Sandboxed Plugins</span>
        {loadedPlugins.length > 0 && (
          <span className="rounded-full bg-studio-accent/15 px-1.5 py-0.5 text-[9px] text-studio-accent">
            {loadedPlugins.length} active
          </span>
        )}

        {/* Health toggle */}
        <button
          onClick={() => setShowHealth((v) => !v)}
          className={`ml-auto rounded p-1 transition ${
            showHealth ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
          }`}
          title="Plugin health dashboard"
        >
          <Activity className="h-3.5 w-3.5" />
        </button>

        {/* Close */}
        <button onClick={onClose} className="rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Health dashboard (collapsible) */}
      {showHealth && healthSummary && (
        <div className="shrink-0 border-b border-studio-border bg-studio-surface/50 px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-2 text-[9px]">
            <Shield className="h-3 w-3 text-studio-muted" />
            <span className="text-studio-muted">Health Summary</span>
            <button onClick={() => setShowHealth(false)} className="ml-auto">
              <ChevronDown className="h-3 w-3 text-studio-muted" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2 text-[8px]">
            <div className="rounded bg-studio-panel px-2 py-1">
              <span className="text-studio-muted">Total</span>
              <p className="font-semibold">{healthSummary.totalPlugins}</p>
            </div>
            <div className="rounded bg-studio-panel px-2 py-1">
              <span className="text-studio-muted">Running</span>
              <p className="font-semibold text-emerald-400">{healthSummary.byState.running}</p>
            </div>
            <div className="rounded bg-studio-panel px-2 py-1">
              <span className="text-studio-muted">Errors</span>
              <p className="font-semibold text-red-400">{healthSummary.byState.error}</p>
            </div>
            <div className="rounded bg-studio-panel px-2 py-1">
              <span className="text-studio-muted">Violations</span>
              <p className="font-semibold text-amber-400">
                {healthSummary.pluginsWithViolations.length}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Plugin tabs */}
      {loadedPlugins.length > 0 && (
        <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-studio-border px-2 py-1">
          {loadedPlugins.map((id) => {
            const pluginState = getPluginState(id);
            const isActive = id === activePluginId;
            return (
              <button
                key={id}
                onClick={() => setActivePluginId(id)}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] transition ${
                  isActive
                    ? 'bg-studio-accent/15 text-studio-accent font-medium'
                    : 'text-studio-muted hover:bg-studio-surface hover:text-studio-text'
                }`}
              >
                {pluginState && (
                  <span className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[pluginState]}`} />
                )}
                <span className="max-w-[80px] truncate">{id}</span>
              </button>
            );
          })}

          {/* Add plugin button */}
          {onOpenMarketplace && (
            <button
              onClick={onOpenMarketplace}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-studio-muted transition hover:bg-studio-surface hover:text-studio-text"
              title="Install more plugins"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Active plugin content */}
      <div className="flex-1 overflow-hidden">
        {!ready ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-[10px] text-studio-muted animate-pulse">
              Initializing plugin host...
            </p>
          </div>
        ) : loadedPlugins.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <Puzzle className="h-8 w-8 text-studio-muted/30" />
            <p className="text-[11px] text-studio-muted">No sandboxed plugins loaded</p>
            <p className="text-[9px] text-studio-muted/70">
              Install plugins from the Marketplace to extend Studio with custom panels, node types,
              and integrations - all running safely in isolated sandboxes.
            </p>
            {onOpenMarketplace && (
              <button
                onClick={onOpenMarketplace}
                className="mt-2 rounded-lg bg-studio-accent/20 px-4 py-2 text-[10px] font-medium text-studio-accent transition hover:bg-studio-accent/30"
              >
                <Plus className="mr-1 inline h-3 w-3" />
                Browse Plugins
              </button>
            )}
          </div>
        ) : activePluginId ? (
          <PluginPanelContainer
            key={activePluginId}
            pluginId={activePluginId}
            pluginUrl={`/plugins/${activePluginId}/index.js`}
            permissions={['scene:read', 'ui:panel']}
            displayName={activePluginId}
            hasUI={true}
            onClose={() => {
              setActivePluginId(loadedPlugins.filter((id) => id !== activePluginId)[0] ?? null);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
