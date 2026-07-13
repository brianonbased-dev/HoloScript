'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

const SETTINGS_KEY = 'fleet-dispatch-settings';

/**
 * FleetPanel — Studio sidebar: full compute estate (agents + GPUs + hardware).
 *
 * Per task_1779315631445_clf7:
 * - AGENTS: online/offline, surface tag (claude1 etc.), current claimed task, last heartbeat.
 *   Click → open HoloRoom on HoloMesh.net. Ping → DM to inbox.
 * - HARDWARE: GPUs (RTX 4090, Adreno, etc.), WASM workers, CPU cores.
 *   Shows device, VRAM/memory, utilization, which agent using it, solver jobs.
 *
 * Data:
 * - Agents: /api/holomesh/team/:id/room/presence + /api/holomesh/agents
 * - Hardware: sync_hardware_loop MCP + holo_get_dev_dashboard_state (or fleet-status composite).
 * - Fleet-status endpoint already exists and aggregates presence + CAEL activity.
 *
 * Unified view: software agents + physical/hardware compute.
 */

interface AgentEntry {
  handle: string;
  online: boolean;
  last_heartbeat: string | null;
  status?: string;
  current_task?: string;
  surface_tag?: string;
}

export interface HardwareEntry {
  device_id: string;
  type: 'gpu' | 'wasm' | 'cpu';
  name: string;
  vram_or_memory?: string;
  utilization?: number;
  cpu_utilization?: number;
  memory_used_gb?: number;
  disk_used_gb?: number;
  disk_capacity_gb?: number;
  listed_compute_dph_usd?: number;
  listed_storage_dph_usd?: number;
  listed_total_dph_usd?: number;
  effective_compute_dph_usd?: number;
  effective_storage_dph_usd?: number;
  effective_total_dph_usd?: number;
  storage_dph_usd?: number;
  effective_dph_usd?: number;
  effective_cost_mode?: string;
  runtime_cost_estimate_usd?: number;
  cost_so_far_usd?: number;
  used_by_agent?: string;
  jobs?: string[];
}

export interface ResourceFlowSummary {
  providerLabel: string;
  providerAttributionAvailable: boolean;
  utilized: {
    instanceCount: number;
    activeComputeCount: number;
    retainedStorageCount: number;
    effectiveDphUsd: number;
    projected24hUsd: number;
  };
  produced: {
    activeManifestCount: number;
    outputContractCount: number;
    verifiedProductCount: number;
    verifiedArtifactCount: number;
    verifiedReceiptCount: number;
    declaredOnlyOutputCount: number;
    unverifiedEvidenceOutputCount: number;
    outputAwareLaneCount: number;
    productiveCount: number;
    workInProgressCount: number;
    artifactCount: number;
    inferenceOutputTokens: number;
    providerUnattributedContractCount: number;
    fleetCatalog: {
      activeManifestCount: number;
      outputContractCount: number;
      verifiedProductCount: number;
      verifiedArtifactCount: number;
      verifiedReceiptCount: number;
      declaredOnlyOutputCount: number;
      unverifiedEvidenceOutputCount: number;
    };
  };
  stored: {
    volumeCount: number;
    usedGb: number;
    capacityGb: number;
    artifactLocationCount: number;
    evidenceBackedLocationCount: number;
    verifiedArtifactLocationCount: number;
    verifiedReceiptLocationCount: number;
    projected24hUsd: number;
    fleetCatalog: {
      evidenceBackedLocationCount: number;
      verifiedArtifactLocationCount: number;
      verifiedReceiptLocationCount: number;
    };
  };
  consumed: {
    currentPhysicalConsumerCount: number;
    declaredOrHistoricalManifestConsumerCount: number;
    consumerCount: number;
    manifestAttributedCount: number;
    runtimeRequests: number;
    computeBearingRequests: number;
    lastConsumedAtUtc?: string;
    runtimeMetricsAgeMs?: number;
    fleetCatalogDeclaredOrHistoricalManifestConsumerCount: number;
  };
  visibility: {
    gapCount: number;
    gaps: string[];
  };
}

interface FleetData {
  team_id: string;
  snapshot_iso: string;
  online_count: number;
  agents: AgentEntry[];
  hardware: HardwareEntry[];
  fleet_health?: string;
  fleet_reasons?: string[];
  resource_flow?: ResourceFlowSummary;
  by_handle?: Record<string, any>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function numberOrZero(value: unknown): number {
  return finiteNumber(value) ?? 0;
}

export function toHardwareEntry(
  entry: Record<string, unknown>,
  index: number,
  orphan = false
): HardwareEntry {
  const handle = stringValue(entry.handle) || (orphan ? 'orphan' : 'unassigned');
  const instanceId = entry.instance_id ?? entry.id ?? `${handle}-${index}`;
  const state = entry.actual_status || entry.cur_state || entry.status;
  const jobs = [state, entry.warning].filter(Boolean).map(String);
  const gpuName = stringValue(entry.gpu_name);
  const vramGb = finiteNumber(entry.vram_gb);
  return {
    device_id: String(instanceId),
    type: 'gpu',
    name: gpuName ? `${gpuName} (${handle})` : handle,
    vram_or_memory: vramGb !== undefined ? `${vramGb}GB` : undefined,
    utilization: finiteNumber(entry.gpu_util, entry.gpu_util_percent),
    cpu_utilization: finiteNumber(entry.cpu_util, entry.cpu_util_percent),
    memory_used_gb: finiteNumber(entry.mem_usage_gb, entry.memory_usage_gb),
    disk_used_gb: finiteNumber(entry.disk_usage_gb),
    disk_capacity_gb: finiteNumber(entry.disk_space_gb),
    listed_compute_dph_usd: finiteNumber(entry.listed_compute_dph_usd),
    listed_storage_dph_usd: finiteNumber(entry.listed_storage_dph_usd),
    listed_total_dph_usd: finiteNumber(entry.listed_total_dph_usd),
    effective_compute_dph_usd: finiteNumber(entry.effective_compute_dph_usd),
    effective_storage_dph_usd: finiteNumber(entry.effective_storage_dph_usd),
    effective_total_dph_usd: finiteNumber(entry.effective_total_dph_usd),
    storage_dph_usd: finiteNumber(entry.storage_dph_usd),
    effective_dph_usd: finiteNumber(entry.effective_dph_usd, entry.dph_usd),
    effective_cost_mode: stringValue(entry.effective_cost_mode),
    runtime_cost_estimate_usd: finiteNumber(entry.runtime_cost_estimate_usd, entry.cost_so_far_usd),
    cost_so_far_usd: finiteNumber(entry.cost_so_far_usd),
    used_by_agent: orphan ? undefined : stringValue(entry.handle),
    jobs,
  };
}

export function summarizeResourceFlow(value: unknown): ResourceFlowSummary | undefined {
  if (!isRecord(value)) return undefined;
  const utilized = isRecord(value.utilized) ? value.utilized : {};
  const produced = isRecord(value.produced) ? value.produced : {};
  const providerAttributed = isRecord(produced.provider_attributed)
    ? produced.provider_attributed
    : {};
  const producedFleetCatalog = isRecord(produced.fleet_catalog) ? produced.fleet_catalog : {};
  const stored = isRecord(value.stored) ? value.stored : {};
  const storedFleetCatalog = isRecord(stored.fleet_catalog) ? stored.fleet_catalog : {};
  const consumed = isRecord(value.consumed) ? value.consumed : {};
  const visibility = isRecord(value.visibility) ? value.visibility : {};
  const gaps = Array.isArray(visibility.gaps)
    ? visibility.gaps.filter((gap): gap is string => typeof gap === 'string' && gap.length > 0)
    : [];
  const providerAttributionAvailable =
    isRecord(produced.provider_attributed) ||
    isRecord(produced.fleet_catalog) ||
    finiteNumber(
      produced.provider_attributed_contract_count,
      produced.catalog_output_contract_count,
      stored.catalog_evidence_backed_output_location_count,
      consumed.catalog_declared_or_historical_manifest_consumer_count
    ) !== undefined;
  const providerName =
    stringValue(providerAttributed.provider) || stringValue(value.provider) || 'provider';
  const providerLabel = providerName.toLowerCase() === 'vast.ai' ? 'Vast' : providerName;
  const verifiedArtifactCount =
    finiteNumber(produced.verified_artifact_count, providerAttributed.verified_artifact_count) ??
    Math.max(arrayLength(produced.artifacts), arrayLength(providerAttributed.verified_artifacts));
  const verifiedReceiptCount =
    finiteNumber(produced.verified_receipt_count, providerAttributed.verified_receipt_count) ??
    Math.max(arrayLength(produced.receipts), arrayLength(providerAttributed.verified_receipts));
  const activeManifestCount =
    finiteNumber(produced.active_manifest_count, providerAttributed.active_manifest_count) ??
    Math.max(
      arrayLength(produced.active_manifests),
      arrayLength(providerAttributed.active_manifests)
    );
  const outputContractCount =
    finiteNumber(
      produced.output_contract_count,
      providerAttributed.output_contract_count,
      produced.output_aware_lane_count
    ) ??
    Math.max(
      arrayLength(produced.output_contracts),
      arrayLength(providerAttributed.output_contracts)
    );
  const verifiedProductCount = numberOrZero(
    finiteNumber(
      produced.verified_product_count,
      providerAttributed.verified_product_count,
      produced.evidence_backed_output_count
    )
  );
  const evidenceBackedLocationCount =
    finiteNumber(
      stored.evidence_backed_output_location_count,
      stored.locally_present_output_location_count
    ) ?? arrayLength(stored.artifact_locations);
  const verifiedArtifactLocationCount =
    finiteNumber(stored.verified_artifact_location_count) ?? arrayLength(stored.artifact_locations);
  const verifiedReceiptLocationCount =
    finiteNumber(stored.verified_receipt_location_count) ?? arrayLength(stored.receipt_locations);
  const catalogActiveManifestCount =
    finiteNumber(
      producedFleetCatalog.active_manifest_count,
      produced.catalog_active_manifest_count
    ) ?? activeManifestCount;
  const catalogOutputContractCount =
    finiteNumber(
      producedFleetCatalog.output_contract_count,
      produced.catalog_output_contract_count
    ) ?? outputContractCount;
  const catalogVerifiedProductCount =
    finiteNumber(
      producedFleetCatalog.verified_product_count,
      produced.catalog_verified_product_count
    ) ?? verifiedProductCount;
  const catalogVerifiedArtifactCount =
    finiteNumber(
      producedFleetCatalog.verified_artifact_count,
      produced.catalog_verified_artifact_count
    ) ?? verifiedArtifactCount;
  const catalogVerifiedReceiptCount =
    finiteNumber(
      producedFleetCatalog.verified_receipt_count,
      produced.catalog_verified_receipt_count
    ) ?? verifiedReceiptCount;
  const catalogDeclaredOnlyOutputCount =
    finiteNumber(produced.catalog_declared_only_output_count) ??
    numberOrZero(produced.declared_only_output_count);
  const catalogUnverifiedEvidenceOutputCount =
    finiteNumber(produced.catalog_unverified_evidence_output_count) ??
    numberOrZero(produced.unverified_evidence_output_count);
  const providerUnattributedContractCount =
    finiteNumber(
      produced.provider_unattributed_contract_count,
      producedFleetCatalog.provider_unattributed_contract_count
    ) ?? Math.max(0, catalogOutputContractCount - outputContractCount);
  const catalogEvidenceBackedLocationCount =
    finiteNumber(
      storedFleetCatalog.evidence_backed_output_location_count,
      stored.catalog_evidence_backed_output_location_count
    ) ?? evidenceBackedLocationCount;
  const catalogVerifiedArtifactLocationCount =
    finiteNumber(
      storedFleetCatalog.verified_artifact_location_count,
      stored.catalog_verified_artifact_location_count
    ) ?? verifiedArtifactLocationCount;
  const catalogVerifiedReceiptLocationCount =
    finiteNumber(
      storedFleetCatalog.verified_receipt_location_count,
      stored.catalog_verified_receipt_location_count
    ) ?? verifiedReceiptLocationCount;
  const providerManifestConsumerCount =
    finiteNumber(consumed.declared_or_historical_manifest_consumer_count) ??
    arrayLength(consumed.declared_or_historical_manifest_consumers);
  const catalogManifestConsumerCount =
    finiteNumber(consumed.catalog_declared_or_historical_manifest_consumer_count) ??
    (providerAttributionAvailable
      ? arrayLength(consumed.catalog_declared_or_historical_manifest_consumers) ||
        providerManifestConsumerCount
      : providerManifestConsumerCount);

  return {
    providerLabel,
    providerAttributionAvailable,
    utilized: {
      instanceCount: numberOrZero(utilized.instance_count),
      activeComputeCount: numberOrZero(utilized.active_compute_count),
      retainedStorageCount: numberOrZero(utilized.retained_storage_count),
      effectiveDphUsd: numberOrZero(utilized.effective_dph_usd),
      projected24hUsd: numberOrZero(utilized.projected_24h_usd),
    },
    produced: {
      activeManifestCount,
      outputContractCount,
      verifiedProductCount,
      verifiedArtifactCount,
      verifiedReceiptCount,
      declaredOnlyOutputCount: numberOrZero(produced.declared_only_output_count),
      unverifiedEvidenceOutputCount: numberOrZero(produced.unverified_evidence_output_count),
      outputAwareLaneCount: numberOrZero(produced.output_aware_lane_count),
      productiveCount: numberOrZero(produced.productive_count),
      workInProgressCount: numberOrZero(produced.work_in_progress_count),
      artifactCount: verifiedArtifactCount,
      inferenceOutputTokens: numberOrZero(produced.inference_output_tokens),
      providerUnattributedContractCount,
      fleetCatalog: {
        activeManifestCount: catalogActiveManifestCount,
        outputContractCount: catalogOutputContractCount,
        verifiedProductCount: catalogVerifiedProductCount,
        verifiedArtifactCount: catalogVerifiedArtifactCount,
        verifiedReceiptCount: catalogVerifiedReceiptCount,
        declaredOnlyOutputCount: catalogDeclaredOnlyOutputCount,
        unverifiedEvidenceOutputCount: catalogUnverifiedEvidenceOutputCount,
      },
    },
    stored: {
      volumeCount: numberOrZero(stored.instance_volume_count),
      usedGb: numberOrZero(stored.total_used_gb),
      capacityGb: numberOrZero(stored.total_capacity_gb),
      artifactLocationCount: evidenceBackedLocationCount,
      evidenceBackedLocationCount,
      verifiedArtifactLocationCount,
      verifiedReceiptLocationCount,
      projected24hUsd: numberOrZero(stored.projected_storage_24h_usd),
      fleetCatalog: {
        evidenceBackedLocationCount: catalogEvidenceBackedLocationCount,
        verifiedArtifactLocationCount: catalogVerifiedArtifactLocationCount,
        verifiedReceiptLocationCount: catalogVerifiedReceiptLocationCount,
      },
    },
    consumed: {
      currentPhysicalConsumerCount:
        finiteNumber(consumed.current_physical_consumer_count, consumed.consumer_count) ??
        arrayLength(consumed.current_physical_consumers),
      declaredOrHistoricalManifestConsumerCount: providerManifestConsumerCount,
      consumerCount: numberOrZero(consumed.consumer_count),
      manifestAttributedCount: numberOrZero(consumed.manifest_attributed_count),
      runtimeRequests: numberOrZero(consumed.runtime_requests),
      computeBearingRequests: numberOrZero(consumed.compute_bearing_requests),
      lastConsumedAtUtc: stringValue(consumed.last_consumed_at_utc),
      runtimeMetricsAgeMs: finiteNumber(consumed.runtime_metrics_age_ms),
      fleetCatalogDeclaredOrHistoricalManifestConsumerCount: catalogManifestConsumerCount,
    },
    visibility: {
      gapCount: finiteNumber(visibility.gap_count) ?? gaps.length,
      gaps,
    },
  };
}

function formatMetric(value: number | undefined, maximumFractionDigits = 1): string {
  return value === undefined ? '—' : value.toLocaleString(undefined, { maximumFractionDigits });
}

function formatUsd(value: number | undefined): string {
  return value === undefined ? '—' : `$${value.toFixed(4)}`;
}

function formatAgeMs(value: number | undefined): string {
  if (value === undefined) return 'age unknown';
  const hours = value / 3_600_000;
  if (hours < 1) return `${Math.max(0, Math.round(value / 60_000))}m old`;
  if (hours < 48) return `${Math.round(hours)}h old`;
  return `${Math.round(hours / 24)}d old`;
}

// ─── Dispatch config persisted to localStorage ───────────────────────────────

interface DispatchSettings {
  teamId: string;
  capUsd: number;
  maxDispatches: number;
  dryRun: boolean;
  executeAfterClaim: boolean;
}

const DEFAULT_SETTINGS: DispatchSettings = {
  teamId: 'team_1777834718247_unr35n',
  capUsd: 25,
  maxDispatches: 1,
  dryRun: true,
  executeAfterClaim: false,
};

function loadSettings(): DispatchSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<DispatchSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: DispatchSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// ─── Dispatch result types ───────────────────────────────────────────────────

interface DispatchDecision {
  taskId: string;
  taskTitle: string;
  agentId: string;
  agentHandle: string;
  score: number;
  estimatedSpendUsd: number;
  reason: string;
  success?: boolean;
  error?: string;
}

interface DispatchedItem extends DispatchDecision {
  success: boolean;
  error?: string;
  executionRecord?: string;
}

interface DispatchResult {
  dryRun: boolean;
  teamId: string;
  plan?: { decisions: DispatchDecision[]; unassigned: string[]; capReached: boolean };
  dispatched?: DispatchedItem[];
  spend?: { dayKey: string; spentUsd: number; capUsd: number; remainingUsd: number };
  agentCount?: number;
  taskCount?: number;
  executorEnabled?: boolean;
  executorNote?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FleetPanel() {
  const [data, setData] = useState<FleetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dispatch settings — persisted
  const [settings, setSettings] = useState<DispatchSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<DispatchResult | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const settingsLoaded = useRef(false);

  // Server-side config (caps, executor status)
  const [serverConfig, setServerConfig] = useState<{
    executorEnabled: boolean;
    spend: { capUsd: number; spentUsd: number; remainingUsd: number };
  } | null>(null);

  // Mission schedules from /api/agents/fleet/schedules
  interface MissionSchedule {
    id: string;
    name: string;
    description: string;
    skills: string[];
    schedules: string[];
  }
  const [missionSchedules, setMissionSchedules] = useState<MissionSchedule[]>([]);
  const [schedulesOpen, setSchedulesOpen] = useState(false);

  const refreshServerConfig = useCallback(() => {
    fetch('/api/agents/fleet/dispatch')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setServerConfig(d);
      })
      .catch(() => {});
  }, []);

  // Load from localStorage + server config once
  useEffect(() => {
    if (!settingsLoaded.current) {
      settingsLoaded.current = true;
      setSettings(loadSettings());
    }
    refreshServerConfig();
    fetch('/api/agents/fleet/schedules')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.schedules) setMissionSchedules(d.schedules);
      })
      .catch(() => {});
  }, [refreshServerConfig]);

  const updateSettings = useCallback((patch: Partial<DispatchSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const teamId = settings.teamId;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [membersRes, fleetRes] = await Promise.all([
          fetch(`/api/holomesh/team/${teamId}/members`),
          fetch(`/api/holomesh/team/${teamId}/fleet`),
        ]);
        if (!membersRes.ok) throw new Error(`members ${membersRes.status}`);
        if (!fleetRes.ok) throw new Error(`fleet ${fleetRes.status}`);

        const membersJson = await membersRes.json();
        const fleetJson = await fleetRes.json();
        const members = Array.isArray(membersJson.members) ? membersJson.members : [];
        const snapshot = fleetJson.snapshot || fleetJson.fleet || null;
        const matched = Array.isArray(snapshot?.matched) ? snapshot.matched : [];
        const orphans = Array.isArray(snapshot?.orphans) ? snapshot.orphans : [];

        const agents: AgentEntry[] = members.map((member: any) => ({
          handle: member.agentName || member.agentId,
          online: !!member.online,
          last_heartbeat: member.lastHeartbeat || null,
          status: member.online ? 'active' : 'offline',
          current_task: null,
          surface_tag: member.surfaceTag || member.role,
        }));

        const hardware: HardwareEntry[] = [
          ...matched.map((entry: any, index: number) => toHardwareEntry(entry, index)),
          ...orphans.map((entry: any, index: number) => toHardwareEntry(entry, index, true)),
        ];
        const health = fleetJson.health || {};
        const snapshotIso =
          fleetJson.publishedAt ||
          snapshot?.captured_at ||
          snapshot?.summary?.captured_at ||
          new Date().toISOString();

        if (!cancelled) {
          setData({
            team_id: fleetJson.teamId || membersJson.teamId || teamId,
            snapshot_iso: snapshotIso,
            online_count: membersJson.online_count || agents.filter((a) => a.online).length,
            agents,
            hardware,
            fleet_health: health.status,
            fleet_reasons: Array.isArray(health.reasons) ? health.reasons : [],
            resource_flow: summarizeResourceFlow(snapshot?.resource_flow),
            by_handle: Object.fromEntries(agents.map((agent) => [agent.handle, agent])),
          });
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load fleet');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, 15000); // live refresh
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [teamId]);

  const runDispatch = useCallback(
    async (overrideDryRun?: boolean) => {
      setDispatching(true);
      setDispatchResult(null);
      setDispatchError(null);
      const isDry = overrideDryRun ?? settings.dryRun;
      try {
        const res = await fetch('/api/agents/fleet/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teamId: settings.teamId,
            maxDispatches: settings.maxDispatches,
            capUsd: settings.capUsd,
            dryRun: isDry,
            executeAfterClaim: !isDry && settings.executeAfterClaim,
          }),
        });
        const json = (await res.json()) as DispatchResult;
        if (!res.ok) {
          setDispatchError((json as unknown as { error?: string }).error ?? `HTTP ${res.status}`);
        } else {
          setDispatchResult(json);
        }
      } catch (e: unknown) {
        setDispatchError(e instanceof Error ? e.message : String(e));
      } finally {
        setDispatching(false);
        refreshServerConfig();
      }
    },
    [settings, refreshServerConfig]
  );

  if (loading && !data) return <div className="p-3 text-xs text-studio-muted">Loading fleet…</div>;
  if (error) return <div className="p-3 text-xs text-red-400">Error: {error}</div>;
  if (!data) return null;

  return (
    <div className="p-2 text-[11px] text-studio-text space-y-3 overflow-y-auto h-full">
      <div className="text-[10px] uppercase tracking-wider text-studio-muted flex items-center justify-between">
        <span>FLEET • {data.online_count} online</span>
        <span className="text-[8px]">{new Date(data.snapshot_iso).toLocaleTimeString()}</span>
      </div>
      {data.fleet_health && data.fleet_health !== 'ok' && (
        <div className="rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-1 text-[9px] text-amber-200">
          Fleet health: {data.fleet_health}
          {data.fleet_reasons?.length ? ` (${data.fleet_reasons.join(', ')})` : ''}
        </div>
      )}

      {data.resource_flow && (
        <div>
          <div className="font-semibold mb-1 flex items-center justify-between gap-1">
            <span>RESOURCE FLOW</span>
            <span
              className={`text-[8px] ${data.resource_flow.visibility.gapCount > 0 ? 'text-amber-300' : 'text-emerald-400'}`}
            >
              {data.resource_flow.visibility.gapCount > 0
                ? `${data.resource_flow.visibility.gapCount} gaps`
                : 'complete'}
            </span>
          </div>
          <div className="space-y-0.5 rounded border border-studio-border/40 bg-studio-panel/30 px-1.5 py-1 text-[8px]">
            <div className="flex justify-between gap-2">
              <span className="text-studio-muted">Utilized</span>
              <span className="text-right">
                {data.resource_flow.utilized.activeComputeCount}/
                {data.resource_flow.utilized.instanceCount} active ·{' '}
                {data.resource_flow.utilized.retainedStorageCount} retained ·{' '}
                {formatUsd(data.resource_flow.utilized.effectiveDphUsd)}/h ·{' '}
                {formatUsd(data.resource_flow.utilized.projected24hUsd)}/24h
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-studio-muted">
                Produced (
                {data.resource_flow.providerAttributionAvailable
                  ? data.resource_flow.providerLabel
                  : 'legacy aggregate'}
                )
              </span>
              <span className="text-right">
                {data.resource_flow.produced.outputContractCount} contracts ·{' '}
                {data.resource_flow.produced.verifiedProductCount} products verified ·{' '}
                {data.resource_flow.produced.verifiedArtifactCount} artifacts +{' '}
                {data.resource_flow.produced.verifiedReceiptCount} receipts verified ·{' '}
                {data.resource_flow.produced.declaredOnlyOutputCount} declared-only ·{' '}
                {data.resource_flow.produced.unverifiedEvidenceOutputCount} evidence unverified ·{' '}
                {data.resource_flow.produced.inferenceOutputTokens.toLocaleString()} tokens
              </span>
            </div>
            {data.resource_flow.providerAttributionAvailable && (
              <div className="flex justify-between gap-2">
                <span className="text-studio-muted">Produced (Fleet catalog)</span>
                <span className="text-right">
                  {data.resource_flow.produced.fleetCatalog.outputContractCount} contracts ·{' '}
                  {data.resource_flow.produced.fleetCatalog.verifiedProductCount} products verified
                  · {data.resource_flow.produced.fleetCatalog.verifiedArtifactCount} artifacts +{' '}
                  {data.resource_flow.produced.fleetCatalog.verifiedReceiptCount} receipts verified
                  · {data.resource_flow.produced.providerUnattributedContractCount} provider unknown
                </span>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <span className="text-studio-muted">
                Stored (
                {data.resource_flow.providerAttributionAvailable
                  ? data.resource_flow.providerLabel
                  : 'legacy aggregate'}
                )
              </span>
              <span className="text-right">
                {data.resource_flow.stored.volumeCount} volumes ·{' '}
                {formatMetric(data.resource_flow.stored.usedGb)}/
                {formatMetric(data.resource_flow.stored.capacityGb)}GB ·{' '}
                {data.resource_flow.stored.evidenceBackedLocationCount} evidence-backed locations (
                {data.resource_flow.stored.verifiedArtifactLocationCount} artifacts +{' '}
                {data.resource_flow.stored.verifiedReceiptLocationCount} receipts) ·{' '}
                {formatUsd(data.resource_flow.stored.projected24hUsd)}/24h
              </span>
            </div>
            {data.resource_flow.providerAttributionAvailable && (
              <div className="flex justify-between gap-2">
                <span className="text-studio-muted">Stored (Fleet catalog)</span>
                <span className="text-right">
                  {data.resource_flow.stored.fleetCatalog.evidenceBackedLocationCount}{' '}
                  evidence-backed locations (
                  {data.resource_flow.stored.fleetCatalog.verifiedArtifactLocationCount} artifacts +{' '}
                  {data.resource_flow.stored.fleetCatalog.verifiedReceiptLocationCount} receipts)
                </span>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <span className="text-studio-muted">
                Consumed (
                {data.resource_flow.providerAttributionAvailable
                  ? data.resource_flow.providerLabel
                  : 'legacy aggregate'}
                )
              </span>
              <span className="text-right">
                {data.resource_flow.consumed.currentPhysicalConsumerCount} current physical
                consumers · {data.resource_flow.consumed.declaredOrHistoricalManifestConsumerCount}{' '}
                declared/historical manifest consumers ·{' '}
                {data.resource_flow.consumed.computeBearingRequests.toLocaleString()}/
                {data.resource_flow.consumed.runtimeRequests.toLocaleString()} compute requests
              </span>
            </div>
            {data.resource_flow.providerAttributionAvailable && (
              <div className="flex justify-between gap-2">
                <span className="text-studio-muted">Consumed (Fleet catalog)</span>
                <span className="text-right">
                  {
                    data.resource_flow.consumed
                      .fleetCatalogDeclaredOrHistoricalManifestConsumerCount
                  }{' '}
                  declared/historical manifest consumers
                </span>
              </div>
            )}
            {!data.resource_flow.providerAttributionAvailable && (
              <div className="border-t border-studio-border/30 pt-0.5 text-right text-studio-muted">
                Provider attribution unavailable for this legacy snapshot
              </div>
            )}
            {(data.resource_flow.consumed.lastConsumedAtUtc ||
              data.resource_flow.consumed.runtimeMetricsAgeMs !== undefined) && (
              <div className="text-right text-studio-muted">
                Last consumed {data.resource_flow.consumed.lastConsumedAtUtc || 'unknown'} ·
                telemetry {formatAgeMs(data.resource_flow.consumed.runtimeMetricsAgeMs)}
              </div>
            )}
            {data.resource_flow.visibility.gaps.length > 0 && (
              <div className="border-t border-amber-400/20 pt-0.5 text-amber-200">
                Visibility gaps:{' '}
                {data.resource_flow.visibility.gaps
                  .map((gap) => gap.replaceAll('_', ' '))
                  .join(', ')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AGENTS SECTION */}
      <div>
        <div className="font-semibold mb-1 flex items-center gap-1">
          <span>🧠 AGENTS</span>
          <span className="text-[9px] text-studio-muted">({data.agents.length})</span>
        </div>
        <div className="space-y-1">
          {data.agents.length === 0 && (
            <div className="text-studio-muted italic">No agents reported</div>
          )}
          {data.agents.map((a) => (
            <div
              key={a.handle}
              className="border border-studio-border/40 rounded px-1.5 py-0.5 bg-studio-panel/30"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className={a.online ? 'text-emerald-400' : 'text-red-400'}>●</span>
                  <span className="font-mono text-[10px]">{a.handle}</span>
                  {a.surface_tag && (
                    <span className="text-[8px] bg-studio-border/30 px-0.5 rounded">
                      {a.surface_tag}
                    </span>
                  )}
                </div>
                <div className="text-[8px] text-studio-muted">
                  {a.last_heartbeat ? new Date(a.last_heartbeat).toLocaleTimeString() : '—'}
                </div>
              </div>
              {a.current_task && (
                <div className="text-[9px] text-studio-accent truncate">→ {a.current_task}</div>
              )}
              <div className="flex gap-1 mt-0.5">
                <button
                  className="text-[8px] underline hover:text-studio-accent"
                  onClick={() =>
                    window.open(
                      `https://holomesh.net/room/${data.team_id}?agent=${a.handle}`,
                      '_blank'
                    )
                  }
                >
                  HoloRoom
                </button>
                <button
                  className="text-[8px] underline hover:text-studio-accent"
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/holomesh/team/${data.team_id}/message`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          type: 'dm',
                          content: `Ping from Studio Fleet panel at ${new Date().toISOString()} — please check current board / claimed work.`,
                          to: a.handle,
                        }),
                      });
                      if (res.ok) {
                        alert(`Ping sent to ${a.handle} (check their inbox)`);
                      } else {
                        alert(`Ping failed: ${res.status}`);
                      }
                    } catch (e: any) {
                      alert(`Ping error: ${e.message}`);
                    }
                  }}
                >
                  Ping
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* HARDWARE SECTION */}
      <div>
        <div className="font-semibold mb-1 flex items-center gap-1">
          <span>🖥️ HARDWARE (GPUs + WASM + CPU)</span>
        </div>
        <div className="space-y-1">
          {data.hardware.length === 0 && (
            <div className="text-studio-muted italic">
              No hardware telemetry yet (sync_hardware_loop)
            </div>
          )}
          {data.hardware.map((h) => (
            <div
              key={h.device_id}
              className="border border-studio-border/40 rounded px-1.5 py-0.5 bg-studio-panel/30"
            >
              <div className="flex justify-between">
                <span className="font-mono text-[10px]">{h.name}</span>
                <span className="text-[9px]">GPU {formatMetric(h.utilization)}%</span>
              </div>
              <div className="text-[9px] text-studio-muted">
                {h.vram_or_memory || ''} • used by {h.used_by_agent || 'idle'}
              </div>
              <div className="text-[8px] text-studio-muted">
                CPU {formatMetric(h.cpu_utilization)}% · memory {formatMetric(h.memory_used_gb)}GB ·
                disk {formatMetric(h.disk_used_gb)}/{formatMetric(h.disk_capacity_gb)}GB
              </div>
              {(h.effective_dph_usd !== undefined ||
                h.listed_compute_dph_usd !== undefined ||
                h.storage_dph_usd !== undefined ||
                h.cost_so_far_usd !== undefined) && (
                <div className="text-[8px] text-studio-muted">
                  effective {formatUsd(h.effective_dph_usd)}/h
                  {h.effective_cost_mode ? ` (${h.effective_cost_mode})` : ''} · compute{' '}
                  {formatUsd(h.listed_compute_dph_usd)}/h · storage{' '}
                  {formatUsd(h.listed_storage_dph_usd ?? h.storage_dph_usd)}/h · listed total{' '}
                  {formatUsd(h.listed_total_dph_usd)}/h · runtime est.{' '}
                  {formatUsd(h.runtime_cost_estimate_usd)}
                </div>
              )}
              {h.jobs && h.jobs.length > 0 && (
                <div className="text-[8px] text-studio-accent truncate">
                  jobs: {h.jobs.join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="text-[8px] text-studio-muted mt-1">Source: latest team fleet snapshot</div>
      </div>

      {/* SCHEDULES SECTION */}
      {missionSchedules.length > 0 && (
        <div className="border-t border-studio-border/40 pt-2">
          <button
            className="w-full flex items-center justify-between text-[10px] font-semibold mb-1 hover:text-studio-accent"
            onClick={() => setSchedulesOpen((v) => !v)}
          >
            <span>🗓 SCHEDULES</span>
            <span className="text-[8px] text-studio-muted">
              {schedulesOpen ? '▲' : '▼'} {missionSchedules.length} missions
            </span>
          </button>
          {schedulesOpen && (
            <div className="space-y-1">
              {missionSchedules.map((m) => (
                <div
                  key={m.id}
                  className="border border-studio-border/30 rounded px-1.5 py-0.5 bg-studio-panel/20"
                >
                  <div className="flex justify-between items-start">
                    <span className="font-medium text-[9px]">{m.name}</span>
                    <span className="text-[8px] text-studio-muted ml-1 shrink-0">
                      {m.schedules.join(', ')}
                    </span>
                  </div>
                  <div className="text-[8px] text-studio-muted truncate">{m.description}</div>
                  <div className="text-[7px] text-studio-muted/70 mt-0.5">
                    {m.skills.join(' · ')}
                  </div>
                </div>
              ))}
              <div className="text-[7px] text-studio-muted">
                Schedules execute via HoloShell Team registry → board tasks → daemon claim
              </div>
            </div>
          )}
        </div>
      )}

      {/* DISPATCH SECTION */}
      <div className="border-t border-studio-border/40 pt-2">
        <button
          className="w-full flex items-center justify-between text-[10px] font-semibold mb-1 hover:text-studio-accent"
          onClick={() => setSettingsOpen((v) => !v)}
        >
          <span>⚡ DISPATCH</span>
          <span className="text-[8px] text-studio-muted">{settingsOpen ? '▲' : '▼'} settings</span>
        </button>

        {/* Persistent spend bar — always visible */}
        {serverConfig &&
          (() => {
            const spend = dispatchResult?.spend ?? serverConfig.spend;
            const pct = Math.min(100, (spend.spentUsd / spend.capUsd) * 100);
            const color = pct >= 90 ? 'bg-red-400' : pct >= 60 ? 'bg-amber-400' : 'bg-emerald-400';
            return (
              <div className="mb-2">
                <div className="flex justify-between text-[8px] text-studio-muted mb-0.5">
                  <span>Spend today</span>
                  <span>
                    ${spend.spentUsd.toFixed(2)} / ${spend.capUsd}
                    {serverConfig.executorEnabled ? (
                      <span className="ml-1 text-emerald-400">• executor ON</span>
                    ) : (
                      <span className="ml-1 text-studio-muted/60">• claim only</span>
                    )}
                  </span>
                </div>
                <div className="h-1 w-full rounded-full bg-studio-border/30 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${color}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })()}

        {settingsOpen && (
          <div className="space-y-1.5 mb-2 bg-studio-panel/40 rounded p-1.5 border border-studio-border/30">
            <label className="flex flex-col gap-0.5">
              <span className="text-[8px] text-studio-muted uppercase tracking-wider">Team ID</span>
              <input
                className="bg-studio-panel border border-studio-border/50 rounded px-1 py-0.5 text-[9px] font-mono w-full"
                value={settings.teamId}
                onChange={(e) => updateSettings({ teamId: e.target.value.trim() })}
                spellCheck={false}
              />
            </label>
            <div className="flex gap-2">
              <label className="flex flex-col gap-0.5 flex-1">
                <span className="text-[8px] text-studio-muted uppercase tracking-wider">
                  Daily cap ($)
                </span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  step={5}
                  className="bg-studio-panel border border-studio-border/50 rounded px-1 py-0.5 text-[9px] w-full"
                  value={settings.capUsd}
                  onChange={(e) => updateSettings({ capUsd: Math.max(1, Number(e.target.value)) })}
                />
              </label>
              <label className="flex flex-col gap-0.5 flex-1">
                <span className="text-[8px] text-studio-muted uppercase tracking-wider">
                  Max tasks
                </span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="bg-studio-panel border border-studio-border/50 rounded px-1 py-0.5 text-[9px] w-full"
                  value={settings.maxDispatches}
                  onChange={(e) =>
                    updateSettings({
                      maxDispatches: Math.min(10, Math.max(1, Number(e.target.value))),
                    })
                  }
                />
              </label>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.dryRun}
                onChange={(e) => updateSettings({ dryRun: e.target.checked })}
                className="accent-studio-accent"
              />
              <span className="text-[9px]">Dry run (preview only — no claim)</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.executeAfterClaim}
                onChange={(e) => updateSettings({ executeAfterClaim: e.target.checked })}
                className="accent-studio-accent"
                disabled={settings.dryRun}
              />
              <span className={`text-[9px] ${settings.dryRun ? 'opacity-40' : ''}`}>
                Execute after claim (LLM works the task)
                {serverConfig?.executorEnabled && (
                  <span className="ml-1 text-emerald-400">• server ON</span>
                )}
              </span>
            </label>
          </div>
        )}

        <div className="flex gap-1.5">
          <button
            disabled={dispatching}
            onClick={() => runDispatch(true)}
            className="flex-1 text-[9px] border border-studio-border/50 rounded px-2 py-1 hover:bg-studio-panel/60 disabled:opacity-40"
          >
            {dispatching && settings.dryRun ? '…' : 'Plan'}
          </button>
          <button
            disabled={dispatching}
            onClick={() => runDispatch(false)}
            className="flex-1 text-[9px] border border-studio-accent/50 bg-studio-accent/10 rounded px-2 py-1 hover:bg-studio-accent/20 disabled:opacity-40 text-studio-accent font-medium"
          >
            {dispatching && !settings.dryRun ? '…' : 'Dispatch'}
          </button>
        </div>

        {dispatchError && (
          <div className="mt-1 text-[8px] text-red-400 border border-red-400/20 rounded px-1.5 py-1">
            {dispatchError}
          </div>
        )}

        {dispatchResult && (
          <div className="mt-1.5 space-y-1">
            <div className="text-[8px] text-studio-muted flex justify-between">
              <span>
                {dispatchResult.dryRun ? 'Plan (dry run)' : 'Dispatched'} • {dispatchResult.teamId}
              </span>
              {dispatchResult.spend && (
                <span>
                  ${dispatchResult.spend.spentUsd.toFixed(2)} / ${dispatchResult.spend.capUsd} today
                </span>
              )}
            </div>

            {/* Plan decisions */}
            {(dispatchResult.plan?.decisions ?? []).map((d, i) => (
              <div
                key={i}
                className="border border-studio-border/30 rounded px-1.5 py-0.5 bg-studio-panel/20"
              >
                <div className="flex justify-between">
                  <span className="font-medium text-[9px] truncate max-w-[140px]">
                    {d.taskTitle}
                  </span>
                  <span className="text-[8px] text-studio-muted">
                    ${d.estimatedSpendUsd.toFixed(2)}
                  </span>
                </div>
                <div className="text-[8px] text-studio-muted">
                  → {d.agentHandle} • {d.reason}
                </div>
              </div>
            ))}

            {/* Executed dispatches */}
            {(dispatchResult.dispatched ?? []).map((d, i) => (
              <div
                key={i}
                className={`border rounded px-1.5 py-0.5 ${d.success ? 'border-emerald-400/30 bg-emerald-400/5' : 'border-red-400/30 bg-red-400/5'}`}
              >
                <div className="flex justify-between">
                  <span className="font-medium text-[9px] truncate max-w-[140px]">
                    {d.taskTitle}
                  </span>
                  <span className={`text-[8px] ${d.success ? 'text-emerald-400' : 'text-red-400'}`}>
                    {d.success ? 'claimed' : 'failed'}
                  </span>
                </div>
                <div className="text-[8px] text-studio-muted">→ {d.agentHandle}</div>
                {d.error && <div className="text-[8px] text-red-400">{d.error}</div>}
                {d.executionRecord && (
                  <details className="mt-0.5">
                    <summary className="text-[8px] text-studio-muted cursor-pointer">
                      execution record ▶
                    </summary>
                    <pre className="text-[7px] text-studio-muted whitespace-pre-wrap mt-0.5 max-h-24 overflow-y-auto">
                      {d.executionRecord}
                    </pre>
                  </details>
                )}
              </div>
            ))}

            {dispatchResult.plan?.unassigned?.length ? (
              <div className="text-[8px] text-studio-muted">
                {dispatchResult.plan.unassigned.length} task(s) unassigned (no eligible agent)
              </div>
            ) : null}
            {dispatchResult.plan?.capReached && (
              <div className="text-[8px] text-amber-400">
                Daily cap reached — raise cap to dispatch more
              </div>
            )}
            {dispatchResult.taskCount !== undefined && (
              <div className="text-[8px] text-studio-muted">
                {dispatchResult.taskCount} board tasks • {dispatchResult.agentCount} agents
              </div>
            )}
          </div>
        )}
      </div>

      <div className="text-[8px] text-studio-muted border-t border-studio-border/30 pt-1">
        Unified fleet view • click agent → HoloRoom • hardware from live sync
      </div>
    </div>
  );
}

export default FleetPanel;
