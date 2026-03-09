'use client';

/**
 * usePluginHost - React hook and context for managing the SandboxedPluginHost.
 *
 * Provides a singleton SandboxedPluginHost instance to the entire Studio,
 * wiring the sandbox orchestrator into Studio's lifecycle (mount, unmount,
 * event broadcasting, and health monitoring).
 *
 * Usage:
 *   1. Wrap your app in <PluginHostProvider> (done in providers.tsx)
 *   2. Call usePluginHost() from any component to access the host
 *
 * @module @holoscript/studio
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  SandboxedPluginHost,
  type SandboxedPluginHostOptions,
  type SandboxCreateOptions,
  type PluginHostHealthSummary,
  type SandboxState,
} from '@holoscript/studio-plugin-sdk/sandbox';

// ── Context Types ──────────────────────────────────────────────────────────

export interface PluginHostContextValue {
  /** The singleton SandboxedPluginHost instance (null before initialization) */
  host: SandboxedPluginHost | null;

  /** Whether the host is initialized and ready */
  ready: boolean;

  /** Load a sandboxed plugin by its configuration */
  loadPlugin: (options: SandboxCreateOptions) => Promise<void>;

  /** Unload a plugin by ID */
  unloadPlugin: (pluginId: string) => Promise<void>;

  /** Forcefully terminate a misbehaving plugin */
  terminatePlugin: (pluginId: string) => void;

  /** Get the list of currently loaded plugin IDs */
  loadedPlugins: string[];

  /** Get the state of a specific plugin */
  getPluginState: (pluginId: string) => SandboxState | null;

  /** Broadcast an event to all running plugins */
  broadcastEvent: (namespace: string, event: string, data: unknown) => void;

  /** Get health summary for all plugins */
  getHealthSummary: () => PluginHostHealthSummary | null;

  /** Current health summary (refreshed on an interval) */
  healthSummary: PluginHostHealthSummary | null;
}

const PluginHostContext = createContext<PluginHostContextValue>({
  host: null,
  ready: false,
  loadPlugin: async () => {},
  unloadPlugin: async () => {},
  terminatePlugin: () => {},
  loadedPlugins: [],
  getPluginState: () => null,
  broadcastEvent: () => {},
  getHealthSummary: () => null,
  healthSummary: null,
});

// ── Provider ───────────────────────────────────────────────────────────────

export interface PluginHostProviderProps {
  children: ReactNode;
  /** Override default host options */
  hostOptions?: Partial<SandboxedPluginHostOptions>;
  /** Health summary refresh interval in ms (default: 10000) */
  healthRefreshInterval?: number;
}

export function PluginHostProvider({
  children,
  hostOptions,
  healthRefreshInterval = 10_000,
}: PluginHostProviderProps) {
  const hostRef = useRef<SandboxedPluginHost | null>(null);
  const [ready, setReady] = useState(false);
  const [loadedPlugins, setLoadedPlugins] = useState<string[]>([]);
  const [healthSummary, setHealthSummary] = useState<PluginHostHealthSummary | null>(null);

  // ── Initialize the host on mount ─────────────────────────────────────────

  useEffect(() => {
    const options: SandboxedPluginHostOptions = {
      // Default handlers that integrate with Studio's systems
      onAPICall: async (pluginId, namespace, method, args) => {
        // Dispatch to Studio API surface
        // This will be expanded as Studio APIs grow
        console.info(`[PluginHost] API call from ${pluginId}: ${namespace}.${method}`, args);
        throw new Error(`API ${namespace}.${method} is not yet implemented`);
      },

      onStorage: async (pluginId, scope, operation, key, value) => {
        // Plugin-scoped storage using localStorage with namespace isolation
        const storageKey = `holoscript-plugin:${pluginId}:${scope}:${key}`;
        switch (operation) {
          case 'get':
            return key ? JSON.parse(localStorage.getItem(storageKey) ?? 'null') : null;
          case 'set':
            if (key) localStorage.setItem(storageKey, JSON.stringify(value));
            return undefined;
          case 'delete':
            if (key) localStorage.removeItem(storageKey);
            return undefined;
          case 'keys': {
            const prefix = `holoscript-plugin:${pluginId}:${scope}:`;
            const keys: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k?.startsWith(prefix)) keys.push(k.slice(prefix.length));
            }
            return keys;
          }
        }
      },

      onFetch: async (pluginId, url, opts) => {
        // Proxied fetch for sandboxed plugins (domain validation happens in PluginBridge)
        const res = await fetch(url, {
          method: opts?.method,
          headers: opts?.headers,
          body: opts?.body,
        });
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          headers[k] = v;
        });
        return { status: res.status, headers, body: await res.text() };
      },

      onRegister: async (pluginId, kind, descriptor) => {
        // Plugin registration events (panels, toolbar buttons, etc.)
        console.info(`[PluginHost] Registration from ${pluginId}: ${kind}`, descriptor);
        // Future: integrate with Studio's panel/toolbar registration system
      },

      onLog: (pluginId, level, message, data) => {
        const prefix = `[Plugin:${pluginId}]`;
        switch (level) {
          case 'debug':
            console.debug(prefix, message, data ?? '');
            break;
          case 'info':
            console.info(prefix, message, data ?? '');
            break;
          case 'warn':
            console.warn(prefix, message, data ?? '');
            break;
          case 'error':
            console.error(prefix, message, data ?? '');
            break;
          default:
            console.log(prefix, `[${level}]`, message, data ?? '');
        }
      },

      onError: (pluginId, code, message, stack) => {
        console.error(`[Plugin:${pluginId}] Error ${code}: ${message}`, stack ?? '');
      },

      debug: process.env.NODE_ENV === 'development',

      // Apply caller overrides
      ...hostOptions,
    };

    const host = new SandboxedPluginHost(options);
    hostRef.current = host;
    setReady(true);

    // Cleanup: gracefully shut down all plugins when Studio unmounts
    return () => {
      setReady(false);
      host.shutdown().catch((err) => {
        console.error('[PluginHost] Error during shutdown:', err);
      });
      hostRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Health monitoring ────────────────────────────────────────────────────

  useEffect(() => {
    if (!ready || healthRefreshInterval <= 0) return;

    const timer = setInterval(() => {
      if (hostRef.current) {
        setHealthSummary(hostRef.current.getHealthSummary());
        setLoadedPlugins(hostRef.current.getLoadedPlugins());
      }
    }, healthRefreshInterval);

    return () => clearInterval(timer);
  }, [ready, healthRefreshInterval]);

  // ── Stable callbacks ─────────────────────────────────────────────────────

  const loadPlugin = useCallback(async (options: SandboxCreateOptions) => {
    if (!hostRef.current) throw new Error('PluginHost not initialized');
    await hostRef.current.loadPlugin(options);
    setLoadedPlugins(hostRef.current.getLoadedPlugins());
    setHealthSummary(hostRef.current.getHealthSummary());
  }, []);

  const unloadPlugin = useCallback(async (pluginId: string) => {
    if (!hostRef.current) throw new Error('PluginHost not initialized');
    await hostRef.current.unloadPlugin(pluginId);
    setLoadedPlugins(hostRef.current.getLoadedPlugins());
    setHealthSummary(hostRef.current.getHealthSummary());
  }, []);

  const terminatePlugin = useCallback((pluginId: string) => {
    if (!hostRef.current) return;
    hostRef.current.terminatePlugin(pluginId);
    setLoadedPlugins(hostRef.current.getLoadedPlugins());
    setHealthSummary(hostRef.current.getHealthSummary());
  }, []);

  const getPluginState = useCallback((pluginId: string): SandboxState | null => {
    return hostRef.current?.getPluginState(pluginId) ?? null;
  }, []);

  const broadcastEvent = useCallback((namespace: string, event: string, data: unknown) => {
    hostRef.current?.broadcastEvent(namespace, event, data);
  }, []);

  const getHealthSummary = useCallback((): PluginHostHealthSummary | null => {
    return hostRef.current?.getHealthSummary() ?? null;
  }, []);

  // ── Context value ────────────────────────────────────────────────────────

  const value: PluginHostContextValue = {
    host: hostRef.current,
    ready,
    loadPlugin,
    unloadPlugin,
    terminatePlugin,
    loadedPlugins,
    getPluginState,
    broadcastEvent,
    getHealthSummary,
    healthSummary,
  };

  return <PluginHostContext.Provider value={value}>{children}</PluginHostContext.Provider>;
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Access the SandboxedPluginHost from any component within PluginHostProvider.
 *
 * @example
 * ```tsx
 * const { loadPlugin, loadedPlugins, broadcastEvent } = usePluginHost();
 *
 * // Load a plugin
 * await loadPlugin({
 *   pluginId: 'analytics-dashboard',
 *   pluginUrl: 'https://cdn.holoscript.dev/plugins/analytics/1.0.0/index.js',
 *   manifest: { permissions: ['scene:read', 'ui:panel'] },
 *   hasUI: true,
 *   container: panelRef.current!,
 * });
 *
 * // Broadcast scene events to all plugins
 * broadcastEvent('scene', 'nodesChanged', { changedNodeIds: ['node-1'] });
 * ```
 */
export function usePluginHost(): PluginHostContextValue {
  return useContext(PluginHostContext);
}
