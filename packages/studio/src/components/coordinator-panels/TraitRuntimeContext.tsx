'use client';
/**
 * TraitRuntimeContext — shared access to the engine's TraitRuntimeIntegration.
 *
 * Pattern: the app shell instantiates exactly one TraitRuntimeIntegration
 * (typically on scene load), wraps the React tree in
 * `<TraitRuntimeProvider runtime={instance}>`, and downstream panels
 * subscribe to its 4 consumer-buses via the dedicated hooks below
 * (useAssetLoadStates / useSecurityPresence / useGenerativeJobs /
 * useSessionPresence).
 *
 * Each hook subscribes once on mount, sets state on every event, and
 * unsubscribes on unmount. All 4 subscriptions are mediated by the
 * runtime's bus-discipline contract — a thrown listener cannot crash
 * other consumers.
 *
 * Closes the W.081 "wire through ONE real consumer" requirement at the
 * Studio surface for all 4 buses landed in this session
 * (task_1777281302813_eezs).
 */
import { createContext, useContext, type ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { TraitRuntimeIntegration } from '@holoscript/engine/runtime/TraitRuntimeIntegration';
import type {
  AssetLoadState,
  SecurityStats,
  AuditLogEntry,
  GenerativeJobState,
  GenerativeJobStats,
  SessionPresenceStats,
  SharePlaySessionState,
  HeartbeatState,
  MessagingConnectionState,
  SpatialVoiceState,
} from '@holoscript/core/coordinators';

/** Context — null until the app shell installs a runtime instance. */
const TraitRuntimeContextImpl = createContext<TraitRuntimeIntegration | null>(null);

export interface TraitRuntimeProviderProps {
  runtime: TraitRuntimeIntegration | null;
  children: ReactNode;
}

export function TraitRuntimeProvider({ runtime, children }: TraitRuntimeProviderProps) {
  return <TraitRuntimeContextImpl.Provider value={runtime}>{children}</TraitRuntimeContextImpl.Provider>;
}

/**
 * Read the current runtime. Returns null when the panel is rendered
 * outside a provider — panels handle this by rendering an empty / idle
 * state (no runtime = nothing to subscribe to).
 */
export function useTraitRuntime(): TraitRuntimeIntegration | null {
  return useContext(TraitRuntimeContextImpl);
}

// =============================================================================
// AssetLoadCoordinator hook
// =============================================================================

/**
 * Subscribe to AssetLoadCoordinator state. Returns the current snapshot
 * of all tracked assets, refreshed on every state change.
 */
export function useAssetLoadStates(runtimeOverride?: TraitRuntimeIntegration | null): AssetLoadState[] {
  const ctxRuntime = useTraitRuntime();
  const runtime = runtimeOverride ?? ctxRuntime;
  const [states, setStates] = useState<AssetLoadState[]>(() =>
    runtime ? runtime.assetLoadCoordinator.getAllStates() : []
  );

  useEffect(() => {
    if (!runtime) {
      setStates([]);
      return;
    }
    // Seed from current state (e.g. assets loaded before the panel mounted).
    setStates(runtime.assetLoadCoordinator.getAllStates());
    const unsub = runtime.assetLoadCoordinator.subscribe(() => {
      // Pull a fresh snapshot — getAllStates returns a copy each call.
      setStates(runtime.assetLoadCoordinator.getAllStates());
    });
    return unsub;
  }, [runtime]);

  return states;
}

// =============================================================================
// SecurityEventBus hook
// =============================================================================

export interface SecurityViewState {
  stats: SecurityStats;
  auditLog: AuditLogEntry[];
}

const EMPTY_SECURITY: SecurityViewState = {
  stats: {
    sessions: { authenticated: 0, expired: 0, revoked: 0 },
    agents: { tracked: 0 },
    tenants: { active: 0, suspended: 0, decommissioned: 0 },
    quotas: { tracked: 0, exceeded: 0, grace: 0 },
    auditLog: { entries: 0, capacity: 0 },
  },
  auditLog: [],
};

/**
 * Subscribe to SecurityEventBus. Returns aggregate stats + the rolling
 * audit-log buffer. The bus already coalesces per-domain state; this
 * hook just snapshots both on every observed envelope.
 */
export function useSecurityPresence(runtimeOverride?: TraitRuntimeIntegration | null): SecurityViewState {
  const ctxRuntime = useTraitRuntime();
  const runtime = runtimeOverride ?? ctxRuntime;
  const [view, setView] = useState<SecurityViewState>(() =>
    runtime
      ? { stats: runtime.securityEventBus.getStats(), auditLog: runtime.securityEventBus.getAuditLog() }
      : EMPTY_SECURITY
  );

  useEffect(() => {
    if (!runtime) {
      setView(EMPTY_SECURITY);
      return;
    }
    setView({
      stats: runtime.securityEventBus.getStats(),
      auditLog: runtime.securityEventBus.getAuditLog(),
    });
    const unsub = runtime.securityEventBus.subscribe(() => {
      setView({
        stats: runtime.securityEventBus.getStats(),
        auditLog: runtime.securityEventBus.getAuditLog(),
      });
    });
    return unsub;
  }, [runtime]);

  return view;
}

// =============================================================================
// GenerativeJobMonitor hook
// =============================================================================

export interface GenerativeJobsView {
  stats: GenerativeJobStats;
  jobs: GenerativeJobState[];
}

const EMPTY_JOBS: GenerativeJobsView = {
  stats: {
    total: 0,
    byKind: {
      inpainting: { queued: 0, running: 0, completed: 0, cancelled: 0, errored: 0, meanLatencyMs: 0 },
      texture_gen: { queued: 0, running: 0, completed: 0, cancelled: 0, errored: 0, meanLatencyMs: 0 },
      controlnet: { queued: 0, running: 0, completed: 0, cancelled: 0, errored: 0, meanLatencyMs: 0 },
      diffusion_rt: { queued: 0, running: 0, completed: 0, cancelled: 0, errored: 0, meanLatencyMs: 0 },
    },
    anyReady: false,
  },
  jobs: [],
};

export function useGenerativeJobs(runtimeOverride?: TraitRuntimeIntegration | null): GenerativeJobsView {
  const ctxRuntime = useTraitRuntime();
  const runtime = runtimeOverride ?? ctxRuntime;
  const [view, setView] = useState<GenerativeJobsView>(() =>
    runtime
      ? { stats: runtime.generativeJobMonitor.getStats(), jobs: runtime.generativeJobMonitor.getAllJobs() }
      : EMPTY_JOBS
  );

  useEffect(() => {
    if (!runtime) {
      setView(EMPTY_JOBS);
      return;
    }
    setView({
      stats: runtime.generativeJobMonitor.getStats(),
      jobs: runtime.generativeJobMonitor.getAllJobs(),
    });
    const unsub = runtime.generativeJobMonitor.subscribe(() => {
      setView({
        stats: runtime.generativeJobMonitor.getStats(),
        jobs: runtime.generativeJobMonitor.getAllJobs(),
      });
    });
    return unsub;
  }, [runtime]);

  return view;
}

// =============================================================================
// SessionPresenceCoordinator hook
// =============================================================================

export interface SessionPresenceView {
  stats: SessionPresenceStats;
  sessions: SharePlaySessionState[];
  voice: SpatialVoiceState[];
  messaging: MessagingConnectionState[];
  heartbeats: HeartbeatState[];
}

const EMPTY_PRESENCE: SessionPresenceView = {
  stats: {
    sessions: { active: 0, ended: 0, participants: 0 },
    voice: { nodes: 0, peers: 0, muted: 0 },
    messaging: { connections: 0, connected: 0, errored: 0 },
    heartbeat: { tracked: 0, alive: 0, failover: 0, errored: 0 },
  },
  sessions: [],
  voice: [],
  messaging: [],
  heartbeats: [],
};

export function useSessionPresence(runtimeOverride?: TraitRuntimeIntegration | null): SessionPresenceView {
  const ctxRuntime = useTraitRuntime();
  const runtime = runtimeOverride ?? ctxRuntime;
  const [view, setView] = useState<SessionPresenceView>(() =>
    runtime
      ? {
          stats: runtime.sessionPresenceCoordinator.getStats(),
          sessions: runtime.sessionPresenceCoordinator.getAllSessions(),
          voice: runtime.sessionPresenceCoordinator.getAllVoiceNodes(),
          messaging: runtime.sessionPresenceCoordinator.getAllMessagingConnections(),
          heartbeats: runtime.sessionPresenceCoordinator.getAllHeartbeats(),
        }
      : EMPTY_PRESENCE
  );

  useEffect(() => {
    if (!runtime) {
      setView(EMPTY_PRESENCE);
      return;
    }
    const refresh = () => {
      setView({
        stats: runtime.sessionPresenceCoordinator.getStats(),
        sessions: runtime.sessionPresenceCoordinator.getAllSessions(),
        voice: runtime.sessionPresenceCoordinator.getAllVoiceNodes(),
        messaging: runtime.sessionPresenceCoordinator.getAllMessagingConnections(),
        heartbeats: runtime.sessionPresenceCoordinator.getAllHeartbeats(),
      });
    };
    refresh();
    const unsub = runtime.sessionPresenceCoordinator.subscribe(refresh);
    return unsub;
  }, [runtime]);

  return view;
}
