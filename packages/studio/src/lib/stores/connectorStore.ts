/**
 * Connector Store — Central state management for service integrations
 *
 * Manages connection status, credentials, activity logs, and real-time
 * events for all 5 service connectors (GitHub, Railway, VSCode, App Store, Upstash).
 *
 * Part of Studio Integration Hub (W.164-W.171, P.STUDIO.01).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ServiceId = 'github' | 'railway' | 'vscode' | 'appstore' | 'upstash';
export type ConnectionStatus = 'connected' | 'error' | 'disconnected' | 'connecting';

export interface ServiceConnection {
  id: ServiceId;
  status: ConnectionStatus;
  connectedAt?: string;
  lastError?: string;
  credentials: Record<string, string>; // API tokens, OAuth tokens, etc.
  config: Record<string, string>; // Service-specific config (project IDs, repos, etc.)
}

export interface ActivityEntry {
  id: string;
  serviceId: ServiceId;
  timestamp: string;
  action: string;
  status: 'success' | 'error' | 'pending';
  metadata?: Record<string, unknown>;
}

export interface ConnectorState {
  // ── Connection Management ──────────────────────────────────────────────────
  connections: Record<ServiceId, ServiceConnection>;

  // ── Activity Log ───────────────────────────────────────────────────────────
  activities: ActivityEntry[];
  maxActivities: number;

  // ── SSE Subscription ───────────────────────────────────────────────────────
  sseConnected: boolean;
  sseEventSource: EventSource | null;

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Connect to a service with credentials */
  connect: (serviceId: ServiceId, credentials: Record<string, string>) => Promise<void>;

  /** Disconnect from a service */
  disconnect: (serviceId: ServiceId) => Promise<void>;

  /** Update service configuration */
  updateConfig: (serviceId: ServiceId, config: Record<string, string>) => void;

  /** Update connection status */
  setStatus: (serviceId: ServiceId, status: ConnectionStatus, error?: string) => void;

  /** Add activity entry */
  addActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => void;

  /** Clear activities for a service */
  clearActivities: (serviceId: ServiceId) => void;

  /** Start SSE activity stream */
  startActivityStream: () => void;

  /** Stop SSE activity stream */
  stopActivityStream: () => void;

  /** Reset all connections (logout) */
  resetAll: () => void;
}

// ─── Default State ────────────────────────────────────────────────────────────

const DEFAULT_CONNECTIONS: Record<ServiceId, ServiceConnection> = {
  github: {
    id: 'github',
    status: 'disconnected',
    credentials: {},
    config: {},
  },
  railway: {
    id: 'railway',
    status: 'disconnected',
    credentials: {},
    config: {},
  },
  vscode: {
    id: 'vscode',
    status: 'disconnected',
    credentials: {},
    config: {},
  },
  appstore: {
    id: 'appstore',
    status: 'disconnected',
    credentials: {},
    config: {},
  },
  upstash: {
    id: 'upstash',
    status: 'disconnected',
    credentials: {},
    config: {},
  },
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useConnectorStore = create<ConnectorState>()(
  persist(
    (set, get) => ({
      connections: DEFAULT_CONNECTIONS,
      activities: [],
      maxActivities: 50,
      sseConnected: false,
      sseEventSource: null,

      // ── Connect ──────────────────────────────────────────────────────────────
      connect: async (serviceId, credentials) => {
        set((state) => ({
          connections: {
            ...state.connections,
            [serviceId]: {
              ...state.connections[serviceId],
              status: 'connecting',
              lastError: undefined,
            },
          },
        }));

        try {
          // Call backend to establish connection
          const response = await fetch('/api/connectors/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serviceId, credentials }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: response.statusText }));
            throw new Error(errorData.error || `HTTP ${response.status}`);
          }

          const data = await response.json();

          set((state) => ({
            connections: {
              ...state.connections,
              [serviceId]: {
                ...state.connections[serviceId],
                status: 'connected',
                connectedAt: new Date().toISOString(),
                credentials,
                config: data.config || {},
              },
            },
          }));

          // Add success activity
          get().addActivity({
            serviceId,
            action: `Connected to ${serviceId}`,
            status: 'success',
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);

          set((state) => ({
            connections: {
              ...state.connections,
              [serviceId]: {
                ...state.connections[serviceId],
                status: 'error',
                lastError: errorMessage,
              },
            },
          }));

          // Add error activity
          get().addActivity({
            serviceId,
            action: `Failed to connect to ${serviceId}: ${errorMessage}`,
            status: 'error',
          });

          throw err;
        }
      },

      // ── Disconnect ───────────────────────────────────────────────────────────
      disconnect: async (serviceId) => {
        try {
          await fetch('/api/connectors/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serviceId }),
          });

          set((state) => ({
            connections: {
              ...state.connections,
              [serviceId]: {
                ...DEFAULT_CONNECTIONS[serviceId],
              },
            },
          }));

          get().addActivity({
            serviceId,
            action: `Disconnected from ${serviceId}`,
            status: 'success',
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);

          get().addActivity({
            serviceId,
            action: `Failed to disconnect from ${serviceId}: ${errorMessage}`,
            status: 'error',
          });

          throw err;
        }
      },

      // ── Update Config ────────────────────────────────────────────────────────
      updateConfig: (serviceId, config) => {
        set((state) => ({
          connections: {
            ...state.connections,
            [serviceId]: {
              ...state.connections[serviceId],
              config: { ...state.connections[serviceId].config, ...config },
            },
          },
        }));
      },

      // ── Set Status ───────────────────────────────────────────────────────────
      setStatus: (serviceId, status, error) => {
        set((state) => ({
          connections: {
            ...state.connections,
            [serviceId]: {
              ...state.connections[serviceId],
              status,
              lastError: error,
            },
          },
        }));
      },

      // ── Add Activity ─────────────────────────────────────────────────────────
      addActivity: (entry) => {
        const newActivity: ActivityEntry = {
          ...entry,
          id: `${entry.serviceId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          timestamp: new Date().toISOString(),
        };

        set((state) => {
          const updatedActivities = [newActivity, ...state.activities].slice(0, state.maxActivities);
          return { activities: updatedActivities };
        });
      },

      // ── Clear Activities ─────────────────────────────────────────────────────
      clearActivities: (serviceId) => {
        set((state) => ({
          activities: state.activities.filter((a) => a.serviceId !== serviceId),
        }));
      },

      // ── Start Activity Stream ────────────────────────────────────────────────
      startActivityStream: () => {
        const { sseEventSource, sseConnected } = get();

        // Already connected
        if (sseConnected && sseEventSource) return;

        // Create new EventSource
        const eventSource = new EventSource('/api/connectors/activity');

        eventSource.onopen = () => {
          set({ sseConnected: true });
          console.log('[ConnectorStore] Activity stream connected');
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as Omit<ActivityEntry, 'id' | 'timestamp'>;
            get().addActivity(data);
          } catch (err) {
            console.warn('[ConnectorStore] Failed to parse activity event:', err);
          }
        };

        eventSource.onerror = () => {
          console.warn('[ConnectorStore] Activity stream error');
          set({ sseConnected: false });
          eventSource.close();
        };

        set({ sseEventSource: eventSource, sseConnected: true });
      },

      // ── Stop Activity Stream ─────────────────────────────────────────────────
      stopActivityStream: () => {
        const { sseEventSource } = get();
        if (sseEventSource) {
          sseEventSource.close();
          set({ sseEventSource: null, sseConnected: false });
          console.log('[ConnectorStore] Activity stream closed');
        }
      },

      // ── Reset All ────────────────────────────────────────────────────────────
      resetAll: () => {
        get().stopActivityStream();
        set({
          connections: DEFAULT_CONNECTIONS,
          activities: [],
        });
      },
    }),
    {
      name: 'holoscript-connectors',
      // Only persist connections and config, not activities or SSE state
      partialize: (state) => ({
        connections: Object.fromEntries(
          Object.entries(state.connections).map(([id, conn]) => [
            id,
            {
              ...conn,
              // Don't persist sensitive credentials
              credentials: {},
              // Only persist non-sensitive config
              status: 'disconnected',
              lastError: undefined,
              connectedAt: undefined,
            },
          ])
        ),
      }),
    }
  )
);
