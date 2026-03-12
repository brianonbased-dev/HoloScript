'use client';

/**
 * PluginPanelContainer - Renders a sandboxed plugin's UI within Studio.
 *
 * This component provides the DOM container element that the SandboxedPluginHost
 * uses to mount the plugin's iframe. It handles loading, error states, and
 * provides controls for managing the plugin lifecycle (reload, terminate).
 *
 * @module @holoscript/studio
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePluginHost } from '@/hooks/usePluginHost';
import { Puzzle, X, RefreshCw, AlertTriangle, Shield, Activity, Loader2 } from 'lucide-react';
type SandboxState = 'creating' | 'loading' | 'initializing' | 'ready' | 'running' | 'suspended' | 'error' | 'terminated';
type SandboxCreateOptions = any;

export interface PluginPanelContainerProps {
  /** Unique plugin ID */
  pluginId: string;
  /** URL to the plugin's entry point script */
  pluginUrl: string;
  /** Permissions requested by the plugin */
  permissions: string[];
  /** Plugin display name */
  displayName?: string;
  /** Whether the plugin has a visible UI panel */
  hasUI?: boolean;
  /** Close handler for the panel */
  onClose?: () => void;
  /** Additional manifest options */
  manifestOverrides?: Record<string, unknown>;
}

const STATE_LABELS: Record<SandboxState, { label: string; color: string }> = {
  creating: { label: 'Creating', color: 'text-studio-muted' },
  loading: { label: 'Loading', color: 'text-amber-400' },
  initializing: { label: 'Initializing', color: 'text-amber-400' },
  ready: { label: 'Ready', color: 'text-blue-400' },
  running: { label: 'Running', color: 'text-emerald-400' },
  suspended: { label: 'Suspended', color: 'text-yellow-400' },
  error: { label: 'Error', color: 'text-red-400' },
  terminated: { label: 'Terminated', color: 'text-studio-muted' },
};

export function PluginPanelContainer({
  pluginId,
  pluginUrl,
  permissions,
  displayName,
  hasUI = true,
  onClose,
  manifestOverrides,
}: PluginPanelContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { host, ready, loadPlugin, unloadPlugin, terminatePlugin, getPluginState } =
    usePluginHost();
  const [state, setState] = useState<SandboxState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ── Load plugin when the container mounts ────────────────────────────────

  const doLoad = useCallback(async () => {
    if (!ready || !host || !containerRef.current) return;

    // Don't re-load if already loaded
    if (host.isPluginLoaded(pluginId)) {
      setState(host.getPluginState(pluginId));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const options: SandboxCreateOptions = {
        pluginId,
        pluginUrl,
        manifest: {
          permissions: permissions as SandboxCreateOptions['manifest']['permissions'],
          ...manifestOverrides,
        },
        hasUI,
        container: containerRef.current,
      };

      await loadPlugin(options);
      setState(getPluginState(pluginId));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load plugin';
      setError(message);
      setState('error');
    } finally {
      setLoading(false);
    }
  }, [
    ready,
    host,
    pluginId,
    pluginUrl,
    permissions,
    hasUI,
    manifestOverrides,
    loadPlugin,
    getPluginState,
  ]);

  useEffect(() => {
    doLoad();
  }, [doLoad]);

  // ── Poll plugin state ────────────────────────────────────────────────────

  useEffect(() => {
    if (!ready) return;

    const timer = setInterval(() => {
      const s = getPluginState(pluginId);
      if (s !== null) setState(s);
    }, 2000);

    return () => clearInterval(timer);
  }, [ready, pluginId, getPluginState]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (host?.isPluginLoaded(pluginId)) {
        unloadPlugin(pluginId).catch((err) => {
          console.warn(`[PluginPanel] Error unloading plugin ${pluginId} on unmount:`, err);
        });
      }
    };
  }, [host, pluginId, unloadPlugin]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleReload = async () => {
    try {
      if (host?.isPluginLoaded(pluginId)) {
        await unloadPlugin(pluginId);
      }
      // Small delay to allow iframe cleanup
      await new Promise((r) => setTimeout(r, 200));
      await doLoad();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reload plugin';
      setError(message);
    }
  };

  const handleTerminate = () => {
    terminatePlugin(pluginId);
    setState('terminated');
  };

  const handleClose = () => {
    if (host?.isPluginLoaded(pluginId)) {
      unloadPlugin(pluginId).catch(() => {});
    }
    onClose?.();
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const stateInfo = state ? STATE_LABELS[state] : null;

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2">
        <Puzzle className="h-3.5 w-3.5 text-studio-accent" />
        <span className="flex-1 truncate text-[11px] font-semibold">{displayName ?? pluginId}</span>

        {/* State indicator */}
        {stateInfo && (
          <span className={`flex items-center gap-1 text-[9px] ${stateInfo.color}`}>
            {(state === 'loading' || state === 'initializing') && (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            )}
            {state === 'running' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
            {state === 'error' && <AlertTriangle className="h-2.5 w-2.5" />}
            {stateInfo.label}
          </span>
        )}

        {/* Permissions badge */}
        <span
          className="flex items-center gap-0.5 rounded-full bg-studio-surface px-1.5 py-0.5 text-[8px] text-studio-muted"
          title={`Permissions: ${permissions.join(', ')}`}
        >
          <Shield className="h-2.5 w-2.5" />
          {permissions.length}
        </span>

        {/* Reload */}
        <button
          onClick={handleReload}
          disabled={loading}
          className="rounded p-1 text-studio-muted transition hover:text-studio-text disabled:opacity-40"
          title="Reload plugin"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>

        {/* Close */}
        {onClose && (
          <button
            onClick={handleClose}
            className="rounded p-1 text-studio-muted transition hover:text-studio-text"
            title="Unload and close plugin"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 border-b border-red-500/20 bg-red-500/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
          <div className="flex-1">
            <p className="text-[10px] font-medium text-red-400">Plugin Error</p>
            <p className="text-[9px] text-red-300/80">{error}</p>
          </div>
          <button
            onClick={handleReload}
            className="shrink-0 rounded bg-red-500/20 px-2 py-0.5 text-[9px] text-red-300 transition hover:bg-red-500/30"
          >
            Retry
          </button>
        </div>
      )}

      {/* Plugin iframe container */}
      <div ref={containerRef} className="relative flex-1 overflow-hidden" data-plugin-id={pluginId}>
        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-studio-panel/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-studio-accent" />
              <span className="text-[10px] text-studio-muted">Loading plugin...</span>
            </div>
          </div>
        )}

        {/* Terminated state */}
        {state === 'terminated' && !loading && (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center">
              <Activity className="h-6 w-6 text-studio-muted/50" />
              <p className="text-[10px] text-studio-muted">Plugin terminated</p>
              <button
                onClick={handleReload}
                className="rounded-lg bg-studio-accent/20 px-3 py-1.5 text-[10px] text-studio-accent transition hover:bg-studio-accent/30"
              >
                Restart Plugin
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer with health info */}
      <div className="flex shrink-0 items-center justify-between border-t border-studio-border px-3 py-1.5 text-[8px] text-studio-muted">
        <span className="truncate" title={pluginUrl}>
          {pluginUrl.length > 50 ? '...' + pluginUrl.slice(-47) : pluginUrl}
        </span>
        {state === 'running' && (
          <button
            onClick={handleTerminate}
            className="shrink-0 rounded px-1.5 py-0.5 text-red-400/70 transition hover:bg-red-500/10 hover:text-red-400"
            title="Force-terminate plugin"
          >
            Terminate
          </button>
        )}
      </div>
    </div>
  );
}
