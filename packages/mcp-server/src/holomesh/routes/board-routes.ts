import type http from 'http';
import { createHash } from 'crypto';
import {
  teamStore,
  teamPresenceStore,
  teamCloudSessionStore,
  teamMessageStore,
  teamFeedStore,
  agentKeyStore,
  persistTeamDurable,
  reloadTeam,
} from '../state';
import {
  json,
  parseJsonBody,
  parseQuery,
  extractParam,
  getTeamMember,
  hasTeamPermission,
  requireTeamAccessFresh,
  pruneStalePresence,
  normalizePresenceSurface,
  getPresenceTtlMs,
} from '../utils';
import { hasBearerCapability, requireAuth } from '../auth-utils';
import { broadcastToTeam } from '../team-room';
import {
  extractAndVerifySigning,
  resolveCapabilityFromHeader,
} from '../identity/signing-middleware';
import {
  ROOM_PRESETS,
  claimTask,
  completeTask,
  appendFollowUpCommit,
  blockTask,
  reopenTask,
  delegateTask,
  deleteTask,
  auditDoneLog,
  createSuggestion,
  voteSuggestion,
  promoteSuggestion,
  dismissSuggestion,
  normalizeTitle,
  normalizeTaskDescription,
  generateTaskId,
  addTasksToBoard,
  type TeamTask,
  type DoneLogEntry,
  type TeamSuggestion,
  type BoardMutationProvenance,
  type SkippedTaskEntry,
  type SlotRole,
  type SuggestionCategory,
  type SubagentEvent,
  type ArtifactReceipt,
  type TaskOrchestrationAgentRef,
  type TaskPolicyEvent,
  type HoloMeshIdentityEnvelope,
} from '@holoscript/framework';
import type {
  Team,
  TeamPresenceEntry,
  HoloMeshCloudSessionLease,
  TeamMessage,
  TeamHologramFeedItem,
  TeamIntelligenceFeedItem,
  TeamFeedItem,
  RegisteredAgent,
  MeshKnowledgeEntry,
  TeamFleetSnapshotHealth,
  TeamFleetSnapshotPayload,
  TeamFleetSnapshotRecord,
  FounderApprovalRecord,
  RetiredDoneLogReceipt,
} from '../types';
import { getClient } from '../orchestrator-client';
import { mergeTeamKnowledgeWithOrchestrator } from '../entry-lookup';
import { getBoardModeFields } from '../mode-provenance';
import { deriveApprovalReversibility } from './founder-approval-policy';

const MAX_FEED_QUERY = 100;
const ROOM_DONE_LOG_ARCHIVE_SCHEMA = 'room-done-log-archive/v0.1.0';
// Env-driven so no owned-metal volume path ships as a default literal in the published package;
// operators point HOLO_DONE_LOG_ARCHIVE_DIR at their own storage.
const JETSON_DONE_LOG_ARCHIVE_DIR =
  process.env.HOLO_DONE_LOG_ARCHIVE_DIR ??
  '/var/lib/holoscript/mcp-server/room-task-archive';
const SHA256_HEX = /^[a-f0-9]{64}$/i;

type BoardProvenanceParseResult =
  | { provenance?: BoardMutationProvenance; error?: undefined }
  | { provenance?: undefined; error: string };

type DoneLogArchiveCounts = RetiredDoneLogReceipt['archiveCounts'];

type DoneLogArchiveGate =
  | {
      ok: true;
      manifest: Record<string, unknown>;
      manifestSha256: string;
      counts: DoneLogArchiveCounts;
      cutoffIso: string;
      staleEntries: DoneLogEntry[];
      hotEntries: DoneLogEntry[];
      fileHashes: RetiredDoneLogReceipt['archiveFiles'];
    }
  | { ok: false; status: number; code: string; error: string; details?: Record<string, unknown> };

type JetsonArchiveReceipt =
  | { ok: true; host?: string; directory: string; files: string[] }
  | { ok: false; code: string; error: string };

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
  return out.length > 0 ? out : undefined;
}

function cloneBoardProvenance(provenance: BoardMutationProvenance): BoardMutationProvenance {
  return {
    ...provenance,
    attribution_chain: provenance.attribution_chain ? [...provenance.attribution_chain] : undefined,
  };
}

function parseBoardMutationProvenance(
  body: Record<string, unknown>,
  caller: RegisteredAgent
): BoardProvenanceParseResult {
  const raw = isRecord(body.provenance) ? body.provenance : body;
  const originRaw = firstString(raw.surface_origin, raw.surfaceOrigin, raw.via);
  if (!originRaw) return {};

  const surfaceOrigin = originRaw.toLowerCase();
  const callerRelaySigner = caller.surfaceTag || caller.name || caller.id;
  const requestedRelaySigner = firstString(
    raw.relay_signer,
    raw.relaySigner,
    raw.signed_by,
    raw.signedBy
  );

  if (surfaceOrigin === 'mobile') {
    if (caller.surface === 'mobile') {
      return { error: 'mobile-origin board mutations must be relayed by a non-mobile signer' };
    }

    const allowedSignerNames = new Set([callerRelaySigner, caller.name, caller.id].filter(Boolean));
    if (requestedRelaySigner && !allowedSignerNames.has(requestedRelaySigner)) {
      return { error: 'relay_signer must match the authenticated caller' };
    }

    return {
      provenance: {
        surface_origin: 'mobile',
        relay_signer: callerRelaySigner,
        attribution_chain: ['mobile-drafted', 'desktop-relayed', 'desktop-signed'],
      },
    };
  }

  return {
    provenance: {
      surface_origin: surfaceOrigin,
      relay_signer: requestedRelaySigner ?? null,
      attribution_chain: stringList(raw.attribution_chain ?? raw.attributionChain),
    },
  };
}
const CLAIM_HEARTBEAT_GRACE_MS = Number(
  process.env.HOLOMESH_CLAIM_HEARTBEAT_GRACE_MS || 2 * 60 * 1000
);
const CLOUD_SESSION_LEASE_MS = Number(
  process.env.HOLOMESH_CLOUD_SESSION_LEASE_MS || 2 * 60 * 60 * 1000
);
const MAX_IDENTITY_ENVELOPE_BYTES = 16 * 1024;
const DEFAULT_FLEET_SNAPSHOT_STALE_AFTER_MS = 2 * 60 * 60 * 1000;

function normalizeVerificationEvidence(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 2000) : undefined;
}

function getFreshPresence(teamId: string, agentId: string): TeamPresenceEntry | null {
  pruneStalePresence(teamId);
  const entry = teamPresenceStore.get(teamId)?.get(agentId);
  if (!entry || entry.status === 'offline') return null;
  const lastHeartbeatMs = Date.parse(entry.lastHeartbeat);
  if (!Number.isFinite(lastHeartbeatMs)) return null;
  const expiresAtMs = entry.expiresAt ? Date.parse(entry.expiresAt) : Number.NaN;
  const effectiveExpiry = Number.isFinite(expiresAtMs)
    ? expiresAtMs
    : lastHeartbeatMs + (entry.ttlMs || CLAIM_HEARTBEAT_GRACE_MS);
  return Date.now() <= effectiveExpiry ? entry : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function normalizeIdentityEnvelope(value: unknown): HoloMeshIdentityEnvelope | undefined {
  if (!isRecord(value)) return undefined;
  try {
    const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
    if (bytes > MAX_IDENTITY_ENVELOPE_BYTES) {
      return {
        schema: typeof value.schema === 'string' ? value.schema : 'holomesh.identity-envelope.v1',
        truncated: true,
        reason: 'identity_envelope_too_large',
      } as HoloMeshIdentityEnvelope;
    }
    return cloneJsonRecord(value) as HoloMeshIdentityEnvelope;
  } catch {
    return { ...value } as HoloMeshIdentityEnvelope;
  }
}

function identityEnvelopeFromBody(body: Record<string, unknown>): HoloMeshIdentityEnvelope | undefined {
  return normalizeIdentityEnvelope(body.identity_envelope ?? body.identityEnvelope);
}

function identityString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function identityOrigin(envelope: HoloMeshIdentityEnvelope | undefined): string | undefined {
  return identityString(envelope?.session?.origin)?.toLowerCase();
}

function identitySessionId(envelope: HoloMeshIdentityEnvelope | undefined): string | undefined {
  return firstString(
    envelope?.session?.sessionId,
    (envelope?.session as Record<string, unknown> | undefined)?.id,
    envelope?.session?.windowMarker
  );
}

function isCloudIdentityEnvelope(envelope: HoloMeshIdentityEnvelope | undefined): boolean {
  const origin = identityOrigin(envelope);
  const surface = identityString(envelope?.session?.surface)?.toLowerCase();
  return Boolean(
    origin === 'cloud' ||
      origin === 'provider-cloud' ||
      origin?.includes('cloud') ||
      surface?.includes('cloud')
  );
}

function shortHash(value: string, len = 20): string {
  return createHash('sha256').update(value).digest('hex').slice(0, len);
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]));
}

function stableJsonString(value: unknown): string {
  return JSON.stringify(stableJson(value));
}

function parseArchiveCount(value: unknown): number | undefined {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

function doneEntryTimestamp(entry: DoneLogEntry): string | undefined {
  const record = entry as unknown as Record<string, unknown>;
  const task = isRecord(record.task) ? record.task : {};
  return firstString(
    record.timestamp,
    record.completedAt,
    record.completed_at,
    record.doneAt,
    record.done_at,
    record.updatedAt,
    task.timestamp,
    task.completedAt,
    task.updatedAt
  );
}

function doneEntryRawSha256(entry: DoneLogEntry): string {
  return sha256Hex(stableJsonString(entry));
}

function doneLogNdjsonSha256(entries: DoneLogEntry[]): string {
  return sha256Hex(`${entries.map((entry) => stableJsonString(entry)).join('\n')}\n`);
}

function manifestFileSha256(
  manifest: Record<string, unknown>,
  key: 'sqlite' | 'allNdjson' | 'staleNdjson'
): string | undefined {
  const files = isRecord(manifest.files) ? manifest.files : {};
  const info = isRecord(files[key]) ? files[key] : {};
  const hash = firstString(info.sha256, info.hash);
  return hash && SHA256_HEX.test(hash) ? hash.toLowerCase() : undefined;
}

function manifestCounts(manifest: Record<string, unknown>): DoneLogArchiveCounts | undefined {
  const counts = isRecord(manifest.counts) ? manifest.counts : {};
  const totalRows = parseArchiveCount(counts.totalRows);
  const archiveEligibleRows = parseArchiveCount(counts.archiveEligibleRows);
  const hotRows = parseArchiveCount(counts.hotRows);
  const missingTimestampRows = parseArchiveCount(counts.missingTimestampRows);
  if (
    totalRows === undefined ||
    archiveEligibleRows === undefined ||
    hotRows === undefined ||
    missingTimestampRows === undefined
  ) {
    return undefined;
  }
  return { totalRows, archiveEligibleRows, hotRows, missingTimestampRows };
}

function validateJetsonArchiveReceipt(body: Record<string, unknown>): JetsonArchiveReceipt {
  const archiveReceipt = isRecord(body.archiveReceipt) ? body.archiveReceipt : {};
  const candidate = body.jetson ?? body.jetsonReceipt ?? body.archiveJetson ?? archiveReceipt.jetson;
  if (!isRecord(candidate) || candidate.ok !== true) {
    return {
      ok: false,
      code: 'jetson_archive_receipt_required',
      error: 'Jetson archive receipt with ok:true is required before compacting the hot done log',
    };
  }
  const directory = firstString(candidate.directory, candidate.dir);
  if (directory !== JETSON_DONE_LOG_ARCHIVE_DIR) {
    return {
      ok: false,
      code: 'jetson_archive_directory_invalid',
      error: `Jetson archive directory must be ${JETSON_DONE_LOG_ARCHIVE_DIR}`,
    };
  }
  const files = Array.isArray(candidate.files) ? candidate.files.map(String) : [];
  const requiredFiles = [
    'room-done-log.sqlite',
    'room-done-log.ndjson',
    'room-done-log-stale.ndjson',
    'manifest.json',
  ];
  const missing = requiredFiles.filter((file) => !files.includes(file));
  if (missing.length > 0) {
    return {
      ok: false,
      code: 'jetson_archive_files_missing',
      error: `Jetson archive receipt missing files: ${missing.join(', ')}`,
    };
  }
  return {
    ok: true,
    host: firstString(candidate.host),
    directory,
    files,
  };
}

function validateDoneLogArchiveManifest(
  manifest: Record<string, unknown>,
  doneLog: DoneLogEntry[],
  suppliedManifestSha256?: string
): DoneLogArchiveGate {
  const schemaVersion = firstString(manifest.schemaVersion, manifest.schema);
  if (schemaVersion !== ROOM_DONE_LOG_ARCHIVE_SCHEMA) {
    return {
      ok: false,
      status: 400,
      code: 'archive_manifest_schema_invalid',
      error: `archive manifest schemaVersion must be ${ROOM_DONE_LOG_ARCHIVE_SCHEMA}`,
      details: { schemaVersion },
    };
  }

  const generatedAt = firstString(manifest.generatedAt);
  if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) {
    return {
      ok: false,
      status: 400,
      code: 'archive_manifest_generated_at_invalid',
      error: 'archive manifest generatedAt must be a valid ISO timestamp',
    };
  }

  const cutoffIso = firstString(manifest.cutoffIso, manifest.cutoff);
  const cutoffMs = cutoffIso ? Date.parse(cutoffIso) : Number.NaN;
  if (!cutoffIso || !Number.isFinite(cutoffMs)) {
    return {
      ok: false,
      status: 400,
      code: 'archive_manifest_cutoff_invalid',
      error: 'archive manifest cutoffIso must be a valid ISO timestamp',
    };
  }

  const counts = manifestCounts(manifest);
  if (!counts) {
    return {
      ok: false,
      status: 400,
      code: 'archive_manifest_counts_invalid',
      error:
        'archive manifest counts must include totalRows, archiveEligibleRows, hotRows, and missingTimestampRows',
    };
  }

  const liveCount = parseArchiveCount(manifest.liveCount);
  if (liveCount !== undefined && liveCount !== doneLog.length) {
    return {
      ok: false,
      status: 409,
      code: 'archive_manifest_mismatch',
      error: 'archive manifest liveCount does not match current done log',
      details: { manifestLiveCount: liveCount, currentDoneLogCount: doneLog.length },
    };
  }

  if (counts.totalRows !== doneLog.length) {
    return {
      ok: false,
      status: 409,
      code: 'archive_manifest_mismatch',
      error: 'archive manifest totalRows does not match current done log',
      details: { manifestTotalRows: counts.totalRows, currentDoneLogCount: doneLog.length },
    };
  }

  const staleEntries: DoneLogEntry[] = [];
  const hotEntries: DoneLogEntry[] = [];
  let missingTimestampRows = 0;
  for (const entry of doneLog) {
    const timestamp = doneEntryTimestamp(entry);
    const ms = timestamp ? Date.parse(timestamp) : Number.NaN;
    if (!Number.isFinite(ms)) {
      missingTimestampRows++;
      hotEntries.push(entry);
    } else if (ms < cutoffMs) {
      staleEntries.push(entry);
    } else {
      hotEntries.push(entry);
    }
  }

  const actualCounts: DoneLogArchiveCounts = {
    totalRows: doneLog.length,
    archiveEligibleRows: staleEntries.length,
    hotRows: hotEntries.length - missingTimestampRows,
    missingTimestampRows,
  };
  const countKeys: Array<keyof DoneLogArchiveCounts> = [
    'totalRows',
    'archiveEligibleRows',
    'hotRows',
    'missingTimestampRows',
  ];
  const mismatchedCount = countKeys.find((key) => counts[key] !== actualCounts[key]);
  if (mismatchedCount) {
    return {
      ok: false,
      status: 409,
      code: 'archive_manifest_mismatch',
      error: `archive manifest ${mismatchedCount} does not match current done log`,
      details: { manifestCounts: counts, actualCounts },
    };
  }

  const sqliteSha256 = manifestFileSha256(manifest, 'sqlite');
  const allNdjsonSha256 = manifestFileSha256(manifest, 'allNdjson');
  const staleNdjsonSha256 = manifestFileSha256(manifest, 'staleNdjson');
  if (!sqliteSha256 || !allNdjsonSha256 || !staleNdjsonSha256) {
    return {
      ok: false,
      status: 400,
      code: 'archive_manifest_hashes_invalid',
      error: 'archive manifest files must include sqlite, allNdjson, and staleNdjson SHA-256 hashes',
    };
  }

  const archiveOrderedEntries = [...doneLog].reverse();
  const expectedAllNdjsonSha256 = doneLogNdjsonSha256(archiveOrderedEntries);
  const expectedStaleNdjsonSha256 = doneLogNdjsonSha256(
    archiveOrderedEntries.filter((entry) => {
      const timestamp = doneEntryTimestamp(entry);
      const ms = timestamp ? Date.parse(timestamp) : Number.NaN;
      return Number.isFinite(ms) && ms < cutoffMs;
    })
  );
  if (
    allNdjsonSha256 !== expectedAllNdjsonSha256 ||
    staleNdjsonSha256 !== expectedStaleNdjsonSha256
  ) {
    return {
      ok: false,
      status: 409,
      code: 'archive_manifest_mismatch',
      error: 'archive manifest NDJSON hashes do not match current done log',
      details: {
        manifestAllNdjsonSha256: allNdjsonSha256,
        expectedAllNdjsonSha256,
        manifestStaleNdjsonSha256: staleNdjsonSha256,
        expectedStaleNdjsonSha256,
      },
    };
  }

  const manifestSha256 = sha256Hex(stableJsonString(manifest));
  if (suppliedManifestSha256 && suppliedManifestSha256.toLowerCase() !== manifestSha256) {
    return {
      ok: false,
      status: 409,
      code: 'archive_manifest_mismatch',
      error: 'supplied archive manifest hash does not match manifest body',
      details: { suppliedManifestSha256, manifestSha256 },
    };
  }

  return {
    ok: true,
    manifest,
    manifestSha256,
    counts,
    cutoffIso,
    staleEntries,
    hotEntries,
    fileHashes: { sqliteSha256, allNdjsonSha256, staleNdjsonSha256 },
  };
}

function getCloudSessionMap(teamId: string): Map<string, HoloMeshCloudSessionLease> {
  let map = teamCloudSessionStore.get(teamId);
  if (!map) {
    map = new Map();
    teamCloudSessionStore.set(teamId, map);
  }
  return map;
}

function pruneCloudSessionLeases(teamId: string, nowMs = Date.now()): void {
  const leases = teamCloudSessionStore.get(teamId);
  if (!leases) return;
  for (const lease of leases.values()) {
    if (lease.status !== 'active') continue;
    const expiresAtMs = Date.parse(lease.expiresAt);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
      lease.status = 'expired';
    }
  }
}

function upsertCloudSessionLease(
  teamId: string,
  caller: RegisteredAgent,
  envelope: HoloMeshIdentityEnvelope | undefined,
  heartbeatIso = new Date().toISOString()
): HoloMeshCloudSessionLease | null {
  if (!isCloudIdentityEnvelope(envelope)) return null;
  const rawSessionId = identitySessionId(envelope);
  const sessionId = rawSessionId || `cloud:${shortHash(`${teamId}|${caller.id}|${heartbeatIso}`)}`;
  const leaseId = `cloud_${shortHash(`${teamId}|${caller.id}|${sessionId}`)}`;
  const nowMs = Date.parse(heartbeatIso);
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const leases = getCloudSessionMap(teamId);
  const previous = leases.get(leaseId);
  const lease: HoloMeshCloudSessionLease = {
    leaseId,
    teamId,
    agentId: caller.id,
    agentName: caller.name,
    status: 'active',
    sessionId,
    origin: identityOrigin(envelope) || 'cloud',
    surface:
      identityString(envelope?.session?.surface) ||
      caller.surfaceTag ||
      caller.surface ||
      caller.ideType,
    family: identityString(envelope?.session?.family),
    handle: identityString(envelope?.signer?.handle),
    createdAt: previous?.createdAt || heartbeatIso,
    lastHeartbeat: heartbeatIso,
    expiresAt: new Date(safeNowMs + CLOUD_SESSION_LEASE_MS).toISOString(),
    identityEnvelope: normalizeIdentityEnvelope(envelope),
  };
  leases.set(leaseId, lease);
  return lease;
}

function endCloudSessionLeasesForAgent(
  teamId: string,
  agentId: string,
  envelope: HoloMeshIdentityEnvelope | undefined,
  endedAt = new Date().toISOString()
): void {
  const leases = teamCloudSessionStore.get(teamId);
  if (!leases) return;
  const sessionId = identitySessionId(envelope);
  for (const lease of leases.values()) {
    if (lease.agentId !== agentId) continue;
    if (sessionId && lease.sessionId !== sessionId) continue;
    lease.status = 'ended';
    lease.lastHeartbeat = endedAt;
    lease.expiresAt = endedAt;
  }
}

function getActiveCloudSessionLease(
  teamId: string,
  leaseId: string | undefined
): HoloMeshCloudSessionLease | null {
  if (!leaseId) return null;
  pruneCloudSessionLeases(teamId);
  const lease = teamCloudSessionStore.get(teamId)?.get(leaseId);
  if (!lease || lease.status !== 'active') return null;
  const expiresAtMs = Date.parse(lease.expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now() ? lease : null;
}

function validateCloudClaimLeaseForDone(
  teamId: string,
  caller: RegisteredAgent,
  task: TeamTask | undefined
): { ok: true } | { ok: false; status: number; code: string; error: string; leaseId?: string } {
  if (!task?.claimIdentity || !isCloudIdentityEnvelope(task.claimIdentity)) return { ok: true };
  if (!task.claimLeaseId) {
    return {
      ok: false,
      status: 409,
      code: 'cloud_claim_missing_lease',
      error: 'Cloud-claimed task is missing a server cloud-session lease; reclaim it before marking done.',
    };
  }
  const lease = getActiveCloudSessionLease(teamId, task.claimLeaseId);
  if (!lease) {
    const persistedExpiresAtMs = Date.parse(task.claimLeaseExpiresAt || '');
    if (
      task.claimedBy === caller.id &&
      Number.isFinite(persistedExpiresAtMs) &&
      persistedExpiresAtMs > Date.now()
    ) {
      return { ok: true };
    }
    return {
      ok: false,
      status: 409,
      code: 'cloud_claim_session_expired',
      error: 'Cloud-claimed task session expired; reclaim it before marking done.',
      leaseId: task.claimLeaseId,
    };
  }
  if (lease.agentId !== caller.id) {
    return {
      ok: false,
      status: 403,
      code: 'cloud_claim_session_mismatch',
      error: 'Cloud-claimed task must be completed by the same active cloud session owner.',
      leaseId: task.claimLeaseId,
    };
  }
  return { ok: true };
}

function numericCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function getFleetSnapshotStaleAfterMs(): number {
  const raw = Number(
    process.env.HOLOMESH_FLEET_STALE_THRESHOLD_MS || process.env.STALE_THRESHOLD_MS
  );
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_FLEET_SNAPSHOT_STALE_AFTER_MS;
}

function normalizeFleetSource(value: unknown): string {
  if (typeof value !== 'string') return 'fleet-status-live.mjs';
  const source = value.trim();
  return source ? source.slice(0, 120) : 'fleet-status-live.mjs';
}

function normalizeFleetSnapshotPayload(
  body: Record<string, unknown>
): TeamFleetSnapshotPayload | null {
  const candidate = isRecord(body.snapshot) ? body.snapshot : body;
  if (!isRecord(candidate)) return null;
  return { ...candidate } as TeamFleetSnapshotPayload;
}

function evaluateFleetSnapshotHealth(
  snapshot: TeamFleetSnapshotPayload,
  publishedAt: string,
  nowMs = Date.now()
): TeamFleetSnapshotHealth {
  const staleAfterMs = getFleetSnapshotStaleAfterMs();
  const reasons: string[] = [];
  const publishedMs = Date.parse(publishedAt);
  const ageMs = Number.isFinite(publishedMs) ? Math.max(0, nowMs - publishedMs) : null;

  if (ageMs === null) {
    reasons.push('invalid_publishedAt');
  } else if (ageMs > staleAfterMs) {
    reasons.push(`snapshot_age_ms>${staleAfterMs}`);
  }

  if (typeof snapshot.error === 'string' && snapshot.error.trim()) {
    reasons.push('snapshot_error');
  }
  if (typeof snapshot.warning === 'string' && snapshot.warning.trim()) {
    reasons.push('snapshot_warning');
  }

  const summary = isRecord(snapshot.summary) ? snapshot.summary : {};
  const orphanCount = numericCount(summary.orphan_count);
  const noInstanceCount = numericCount(summary.no_instance_count);
  if (orphanCount > 0) reasons.push(`orphan_count=${orphanCount}`);
  if (noInstanceCount > 0) reasons.push(`no_instance_count=${noInstanceCount}`);

  let status: TeamFleetSnapshotHealth['status'] = 'ok';
  if (reasons.includes('invalid_publishedAt') || reasons.includes('snapshot_error')) {
    status = 'down';
  } else if (ageMs !== null && ageMs > staleAfterMs) {
    status = 'stale';
  } else if (reasons.length > 0) {
    status = 'degraded';
  }

  return { status, reasons, ageMs, staleAfterMs };
}

function fleetSnapshotResponse(
  teamId: string,
  record?: TeamFleetSnapshotRecord
): Record<string, unknown> {
  if (!record) {
    return {
      success: true,
      teamId,
      snapshot: null,
      fleet: null,
      source: null,
      publishedAt: null,
      publishedBy: null,
      health: {
        status: 'missing',
        reasons: ['no_snapshot_published'],
        ageMs: null,
        staleAfterMs: getFleetSnapshotStaleAfterMs(),
      } satisfies TeamFleetSnapshotHealth,
    };
  }

  const health = evaluateFleetSnapshotHealth(record.snapshot, record.publishedAt);
  return {
    success: true,
    teamId,
    snapshot: record.snapshot,
    fleet: record.snapshot,
    source: record.source,
    publishedAt: record.publishedAt,
    publishedBy: {
      agentId: record.publishedByAgentId,
      name: record.publishedByName,
    },
    health,
  };
}

function validateHologramFeedInput(hash: string, shareUrl: string): string | null {
  if (!/^[a-zA-Z0-9._-]{6,128}$/.test(hash)) {
    return 'hash must be 6–128 url-safe characters';
  }
  let u: URL;
  try {
    u = new URL(shareUrl);
  } catch {
    return 'shareUrl must be a valid URL';
  }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && u.hostname === 'localhost')) {
    return 'shareUrl must be https (or http://localhost for dev)';
  }
  const host = u.hostname.toLowerCase();
  if (host !== 'localhost' && !host.endsWith('holoscript.net') && !host.endsWith('railway.app')) {
    return 'shareUrl host must be holoscript.net, railway.app, or localhost';
  }
  return null;
}

/**
 * Handle all board, task, and presence routes for HoloMesh teams.
 */
export async function handleBoardRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  url: string
): Promise<boolean> {
  // GET /api/holomesh/team/:id/board
  //
  // Counter invariant (task_1776986320321_xvv6): `done_count` here MUST read
  // the same `team.doneLog.length` that `/board/done` below returns as
  // `count`. They are the same number derived from the same in-memory
  // array — do not introduce a separate cache, aggregate, or write-time
  // counter. Any divergence observed in prod is a deploy / replication
  // concern (stale snapshot on one replica), not a code concern.
  // Regression: http-routes.test.ts → counter-parity test.
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board$/) && method === 'GET') {
    // Pattern Gamma read-path fix (2026-05-04): GET /board must reload from
    // postgres so writes that landed on a different Railway replica are visible.
    // Sync requireTeamAccess returned stale local cache, producing the
    // "board wiped" symptom (W.128 / W.131 / W.133 residual).
    const access = await requireTeamAccessFresh(req, res, url);
    if (!access) return true;
    const { teamId } = access;
    const team = teamStore.get(teamId)!;

    json(res, 200, {
      success: true,
      teamId,
      name: team.name,
      tasks: team.taskBoard || [],
      done_count: team.doneLog?.length || 0,
      mode: team.mode || 'general',
      objective: team.roomConfig?.objective || '',
      communicationStyle: team.roomConfig?.communicationStyle || 'task_first',
      ...getBoardModeFields(team),
    });
    return true;
  }

  // GET /api/holomesh/team/:id/fleet — latest locally-published fleet snapshot
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/fleet$/) && method === 'GET') {
    const access = await requireTeamAccessFresh(req, res, url, 'board:read');
    if (!access) return true;
    const { teamId } = access;
    const team = teamStore.get(teamId)!;
    json(res, 200, fleetSnapshotResponse(teamId, team.fleetSnapshot));
    return true;
  }

  // POST /api/holomesh/team/:id/fleet — publish local GPU/Vast fleet data
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/fleet$/) && method === 'POST') {
    const access = await requireTeamAccessFresh(req, res, url, 'board:write');
    if (!access) return true;
    const { caller, teamId } = access;
    const team = teamStore.get(teamId)!;

    const rawBody = await parseJsonBody(req);
    const { effectiveBody, ctx: signingCtx } = await extractAndVerifySigning(rawBody, {
      bypassSigning: caller?.isFounder ?? false,
    });
    if (!signingCtx.signingValid) {
      json(res, 401, { error: 'signing-rejected', reason: signingCtx.signingReason });
      return true;
    }
    if (!isRecord(effectiveBody)) {
      json(res, 400, { error: 'JSON object body required' });
      return true;
    }

    const snapshot = normalizeFleetSnapshotPayload(effectiveBody);
    if (!snapshot) {
      json(res, 400, { error: 'fleet snapshot object required (body or body.snapshot)' });
      return true;
    }

    const publishedAt = new Date().toISOString();
    const record: TeamFleetSnapshotRecord = {
      source: normalizeFleetSource(effectiveBody.source),
      publishedAt,
      publishedByAgentId: caller.id,
      publishedByName: caller.name,
      snapshot,
      health: evaluateFleetSnapshotHealth(snapshot, publishedAt),
    };
    team.fleetSnapshot = record;
    await persistTeamDurable(teamId);

    broadcastToTeam(teamId, {
      type: 'fleet:snapshot' as any,
      agent: caller.name,
      data: {
        source: record.source,
        publishedAt: record.publishedAt,
        health: record.health.status,
      },
    });

    json(res, 200, {
      ...fleetSnapshotResponse(teamId, record),
      stored: true,
    });
    return true;
  }

  // GET /api/holomesh/team/:id/mobile-brief — one-shot aggregated brief for mobile surfaces
  // Replaces the multi-step board-reader hook chain that mobile clients cannot run locally.
  // S-7 pilot: accepts capability tokens (Authorization: Bearer <tokenId>:<tokenSecret>)
  // with mesh:read scope. Invalid capability tokens fail closed; legacy Bearer API keys
  // accepted as fallback during transition.
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/mobile-brief$/) && method === 'GET') {
    const capResult = resolveCapabilityFromHeader(req, 'mesh:read');
    let teamId: string;
    if (capResult.token) {
      teamId = extractParam(url, '/api/holomesh/team/');
      await reloadTeam(teamId);
      const team = teamStore.get(teamId);
      if (!team) {
        json(res, 404, { error: 'Team not found' });
        return true;
      }
    } else if (capResult.error) {
      json(res, 401, { error: 'Invalid capability token', reason: capResult.error });
      return true;
    } else {
      const access = await requireTeamAccessFresh(req, res, url);
      if (!access) return true;
      teamId = access.teamId;
    }
    const team = teamStore.get(teamId)!;

    // Tasks — urgency-first (lower priority number = more urgent)
    const flatTasks = team.taskBoard || [];
    const open = flatTasks
      .filter((t) => t.status === 'open')
      .sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5))
      .slice(0, 8);
    const claimed = flatTasks.filter((t) => t.status === 'claimed').slice(0, 5);

    // Inbox (DMs, handoffs, reviews) — newest first
    const messages = teamMessageStore.get(teamId) || [];
    const inbox = messages
      .filter((m) => ['dm', 'handoff', 'review-request'].includes(m.messageType))
      .slice(-10)
      .reverse();

    // Knowledge — orchestrator + local mirror, newest first, quality-gated
    let knowledge: MeshKnowledgeEntry[] = [];
    try {
      const workspaceId = `team:${teamId}`;
      const fromOrch = await getClient().queryKnowledge('', { workspaceId, limit: 15 });
      knowledge = mergeTeamKnowledgeWithOrchestrator(fromOrch, team.knowledge);
    } catch {
      knowledge = team.knowledge || [];
    }
    const recentKnowledge = knowledge
      .filter((e) => e.content !== '[deleted]' && !(e.tags || []).includes('tombstone'))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 5);

    // Suggestions — open only, highest score first
    const suggestions = (team as Team & { suggestions?: TeamSuggestion[] }).suggestions || [];
    const openSuggestions = suggestions
      .filter((s) => s.status === 'open')
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 5);

    // Presence — pruned, capped
    pruneStalePresence(teamId);
    const presenceMap = teamPresenceStore.get(teamId);
    const online = presenceMap ? Array.from(presenceMap.values()).slice(0, 10) : [];

    json(res, 200, {
      success: true,
      teamId,
      mode: team.mode || 'build',
      objective: team.roomConfig?.objective || '',
      communicationStyle: team.roomConfig?.communicationStyle || 'task_first',
      openTasks: open,
      claimedTasks: claimed,
      doneCount: team.doneLog?.length || 0,
      inbox,
      recentKnowledge: recentKnowledge.map((k) => ({
        id: k.id,
        type: k.type,
        domain: k.domain || 'general',
        content: (k.content || '').slice(0, 150),
        authorName: k.authorName,
        createdAt: k.createdAt,
      })),
      openSuggestions: openSuggestions.map((s) => ({
        id: s.id,
        title: s.title,
        category: s.category,
        score: s.score,
      })),
      presence: online.map((p) => ({
        agentId: p.agentId,
        agentName: p.agentName,
        ideType: p.ideType,
        status: p.status,
        surfaceTag: p.surfaceTag,
        lastHeartbeat: p.lastHeartbeat,
        identityEnvelope: p.identityEnvelope,
        brainIdentity: p.identityEnvelope?.brain ?? p.identityEnvelope?.principal,
        cloudSessionLeaseId: p.cloudSessionLeaseId,
        sessionId: p.sessionId,
        sessionOrigin: p.sessionOrigin,
        sessionExpiresAt: p.sessionExpiresAt,
      })),
    });
    return true;
  }

  // GET /api/holomesh/team/:id/board/done — done log (peer verification / F.022)
  //
  // Pagination: returns entries newest-first. `limit` caps per-page size
  // (default 30, hard max 200 to keep responses under response-size guards).
  // `offset` walks backward through history — offset=0 is the newest entry,
  // offset=N skips the N newest. Response includes `returned`/`offset`/
  // `hasMore` so clients can page without re-deriving bounds. `count` is
  // the total log size (unchanged for backward compat).
  //
  // Bug fix (task_1776981805111_pllv): prior implementation had no offset,
  // so a team with 753+ done entries was forever limited to the last 200 —
  // no way to enumerate the full history. Pagination closes that gap.
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board\/done$/) && method === 'GET') {
    // Pattern Gamma read-path coverage (2026-05-04, follow-up to 29e9a8da7):
    // same cross-replica staleness issue as GET /board — done-log reads on a
    // replica that hasn't seen the latest /board done-action would return a
    // truncated history.
    const access = await requireTeamAccessFresh(req, res, url);
    if (!access) return true;
    const { teamId } = access;
    const team = teamStore.get(teamId)!;
    const log = team.doneLog || [];
    const total = log.length;
    const q = parseQuery(url);

    const rawLimit = parseInt(String(q.get('limit') || '30'), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(1000, Math.max(1, rawLimit)) : 30;

    const rawOffset = parseInt(String(q.get('offset') || '0'), 10);
    const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;

    // log is oldest-first append order; recency rank k is at log[total-1-k].
    // We want ranks [offset .. offset+limit).
    const startRank = offset;
    const endRank = Math.min(total, offset + limit);
    const entries: typeof log = [];
    for (let k = startRank; k < endRank; k++) {
      entries.push(log[total - 1 - k]);
    }

    json(res, 200, {
      success: true,
      teamId,
      count: total,
      returned: entries.length,
      offset,
      limit,
      hasMore: endRank < total,
      entries,
    });
    return true;
  }

  // POST /api/holomesh/team/:id/board/done/compact - retire archived stale rows
  if (
    pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board\/done\/compact$/) &&
    method === 'POST'
  ) {
    const access = await requireTeamAccessFresh(req, res, url, 'config:write');
    if (!access) return true;
    const { caller, teamId } = access;
    const team = teamStore.get(teamId)!;
    if (!team.doneLog) team.doneLog = [];

    const rawBody = await parseJsonBody(req);
    const { effectiveBody, ctx: signingCtx } = await extractAndVerifySigning(rawBody, {
      bypassSigning: caller?.isFounder ?? false,
    });
    if (!signingCtx.signingValid) {
      json(res, 401, { error: 'signing-rejected', reason: signingCtx.signingReason });
      return true;
    }
    if (!isRecord(effectiveBody)) {
      json(res, 400, { error: 'JSON object body required' });
      return true;
    }

    const body = effectiveBody;
    const dryRun = body.dryRun === true || body.dry_run === true;
    const manifestCandidate = body.manifest ?? body.archiveManifest ?? body.archive_manifest;
    if (!isRecord(manifestCandidate)) {
      json(res, 400, {
        error: 'archive manifest required',
        code: 'archive_manifest_required',
      });
      return true;
    }

    const suppliedManifestSha256 = firstString(
      body.manifestSha256,
      body.archiveManifestSha256,
      body.archive_manifest_sha256
    );
    if (suppliedManifestSha256 && !SHA256_HEX.test(suppliedManifestSha256)) {
      json(res, 400, {
        error: 'archive manifest hash must be a SHA-256 hex string',
        code: 'archive_manifest_hash_invalid',
      });
      return true;
    }

    const jetsonReceipt = validateJetsonArchiveReceipt(body);
    if (!dryRun && !jetsonReceipt.ok) {
      json(res, 400, {
        error: jetsonReceipt.error,
        code: jetsonReceipt.code,
      });
      return true;
    }

    const gate = validateDoneLogArchiveManifest(
      manifestCandidate,
      team.doneLog,
      suppliedManifestSha256?.toLowerCase()
    );
    if (!gate.ok) {
      json(res, gate.status, {
        error: gate.error,
        code: gate.code,
        details: gate.details,
      });
      return true;
    }

    const retiredAt = new Date().toISOString();
    const receipts: RetiredDoneLogReceipt[] = gate.staleEntries.map((entry) => ({
      taskId: entry.taskId,
      title: entry.title,
      completedAt: doneEntryTimestamp(entry),
      rawSha256: doneEntryRawSha256(entry),
      retiredAt,
      retiredByAgentId: caller.id,
      retiredByName: caller.name,
      archiveManifestSha256: gate.manifestSha256,
      archiveManifestGeneratedAt: String(gate.manifest.generatedAt),
      archiveSchemaVersion: ROOM_DONE_LOG_ARCHIVE_SCHEMA,
      archiveCutoffIso: gate.cutoffIso,
      archiveCounts: gate.counts,
      archiveFiles: gate.fileHashes,
    }));

    if (!dryRun) {
      team.doneLog = gate.hotEntries;
      team.retiredDoneLog = [...(team.retiredDoneLog || []), ...receipts];
      await persistTeamDurable(teamId);
      broadcastToTeam(teamId, {
        type: 'board:done_compacted' as any,
        agent: caller.name,
        data: {
          compacted: receipts.length,
          retained: gate.hotEntries.length,
          archiveManifestSha256: gate.manifestSha256,
        },
      });
    }

    json(res, 200, {
      success: true,
      teamId,
      dryRun,
      archiveManifestSha256: gate.manifestSha256,
      archiveCounts: gate.counts,
      compacted: receipts.length,
      retained: gate.hotEntries.length,
      jetsonArchive: jetsonReceipt.ok ? jetsonReceipt : undefined,
      retiredTaskIds: receipts.map((receipt) => receipt.taskId),
      retiredReceipts: receipts,
    });
    return true;
  }

  // GET /api/holomesh/team/:id/suggestions - list improvement suggestions (MCP: holomesh_suggest_list)
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/suggestions$/) && method === 'GET') {
    // Pattern Gamma read-path coverage (follow-up to 29e9a8da7): suggestions
    // posted on another replica must be visible without waiting for cache
    // bleed-through.
    const access = await requireTeamAccessFresh(req, res, url);
    if (!access) return true;
    const { teamId } = access;
    const team = teamStore.get(teamId)!;
    if (!(team as Team & { suggestions?: TeamSuggestion[] }).suggestions) {
      (team as Team & { suggestions?: TeamSuggestion[] }).suggestions = [];
    }
    const suggestions = (team as Team & { suggestions: TeamSuggestion[] }).suggestions;
    const q = parseQuery(url);
    const st = (q.get('status') || '').trim();
    const statusOk = st === 'open' || st === 'promoted' || st === 'dismissed';
    const filtered = statusOk ? suggestions.filter((s) => s.status === st) : suggestions;
    json(res, 200, {
      success: true,
      teamId,
      open: suggestions.filter((s) => s.status === 'open').length,
      promoted: suggestions.filter((s) => s.status === 'promoted').length,
      dismissed: suggestions.filter((s) => s.status === 'dismissed').length,
      suggestions: filtered,
    });
    return true;
  }

  // POST /api/holomesh/team/:id/suggestions — propose (MCP: holomesh_suggest)
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/suggestions$/) && method === 'POST') {
    // Pattern Gamma write-path coverage (follow-up to 29e9a8da7): same
    // cross-replica /join visibility issue as POST /board — caller may have
    // joined on a different replica seconds ago.
    const access = await requireTeamAccessFresh(req, res, url);
    if (!access) return true;
    const { caller, teamId } = access;
    const team = teamStore.get(teamId)!;
    if (!(team as Team & { suggestions?: TeamSuggestion[] }).suggestions) {
      (team as Team & { suggestions?: TeamSuggestion[] }).suggestions = [];
    }
    if (!team.taskBoard) team.taskBoard = [];
    const sug = (team as Team & { suggestions: TeamSuggestion[] }).suggestions;
    const rawBody = await parseJsonBody(req);
    const { effectiveBody, ctx: signingCtx } = await extractAndVerifySigning(rawBody, {
      bypassSigning: caller?.isFounder ?? false,
    });
    if (!signingCtx.signingValid) {
      json(res, 401, { error: 'signing-rejected', reason: signingCtx.signingReason });
      return true;
    }
    const body: Record<string, unknown> = effectiveBody as Record<string, unknown>;
    const title = typeof body.title === 'string' ? body.title : '';
    const result = createSuggestion(sug, {
      title,
      description: typeof body.description === 'string' ? body.description : undefined,
      category: body.category as SuggestionCategory | undefined,
      evidence: typeof body.evidence === 'string' ? body.evidence : undefined,
      proposedBy: caller.id,
      proposedByName: caller.name,
    });
    if (!result.success) {
      json(res, 400, { error: result.error || 'create failed' });
      return true;
    }
    await persistTeamDurable(teamId);
    json(res, 201, { success: true, suggestion: result.suggestion });
    return true;
  }

  // POST /api/holomesh/team/:id/suggestions/:suggestionId/vote (MCP: holomesh_suggest_vote)
  if (
    pathname.match(/^\/api\/holomesh\/team\/[^/]+\/suggestions\/[^/]+\/vote$/) &&
    method === 'POST'
  ) {
    // Pattern Gamma write-path coverage (follow-up to 29e9a8da7): voting
    // mutates the suggestions array; must reload before the membership check
    // so cross-replica /joins are visible.
    const access = await requireTeamAccessFresh(req, res, url);
    if (!access) return true;
    const { caller, teamId } = access;
    const m = pathname.match(/^\/api\/holomesh\/team\/[^/]+\/suggestions\/([^/]+)\/vote$/);
    const suggestionId = m?.[1] || '';
    if (!suggestionId) {
      json(res, 400, { error: 'suggestionId required' });
      return true;
    }
    const team = teamStore.get(teamId)!;
    if (!(team as Team & { suggestions?: TeamSuggestion[] }).suggestions) {
      (team as Team & { suggestions?: TeamSuggestion[] }).suggestions = [];
    }
    if (!team.taskBoard) team.taskBoard = [];
    const suggestions = (team as Team & { suggestions: TeamSuggestion[] }).suggestions;
    const rawBody = await parseJsonBody(req);
    const { effectiveBody, ctx: signingCtx } = await extractAndVerifySigning(rawBody, {
      bypassSigning: caller?.isFounder ?? false,
    });
    if (!signingCtx.signingValid) {
      json(res, 401, { error: 'signing-rejected', reason: signingCtx.signingReason });
      return true;
    }
    const body: Record<string, unknown> = effectiveBody as Record<string, unknown>;
    const value = body.value as number;
    if (value !== 1 && value !== -1) {
      json(res, 400, { error: '"value" must be 1 or -1' });
      return true;
    }
    const reason = typeof body.reason === 'string' ? body.reason : undefined;
    const result = voteSuggestion(
      suggestions,
      team.taskBoard,
      suggestionId,
      caller.id,
      caller.name,
      value as 1 | -1,
      team.maxSlots,
      reason
    );
    if (!result.success) {
      json(res, 400, { error: result.error || 'vote failed' });
      return true;
    }
    if (result.promotedTask) {
      broadcastToTeam(teamId, {
        type: 'board:added' as any,
        agent: caller.name,
        data: {
          taskId: result.promotedTask.id,
          title: result.promotedTask.title,
          agent: caller.name,
        },
      });
    }
    await persistTeamDurable(teamId);
    json(res, 200, {
      success: true,
      suggestion: result.suggestion,
      promotedTask: result.promotedTask,
    });
    return true;
  }

  // POST /api/holomesh/team/:id/board — Add tasks
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board$/) && method === 'POST') {
    // Pattern Gamma residual fix: requireTeamAccessFresh reloads from postgres
    // BEFORE the membership check so cross-replica writes (peer just /joined
    // on another replica) are visible. Sync requireTeamAccess used to fire 403
    // here even though the caller had successfully joined seconds earlier.
    const access = await requireTeamAccessFresh(req, res, url, 'board:write');
    if (!access) return true;
    const { caller, teamId } = access;
    const team = teamStore.get(teamId)!;

    const rawBody = await parseJsonBody(req);
    const { effectiveBody, ctx: signingCtx } = await extractAndVerifySigning(rawBody, {
      bypassSigning: caller?.isFounder ?? false,
    });
    if (!signingCtx.signingValid) {
      json(res, 401, { error: 'signing-rejected', reason: signingCtx.signingReason });
      return true;
    }
    const body: any = effectiveBody;
    const tasksBody = body.tasks || body;
    if (!tasksBody || !Array.isArray(tasksBody) || tasksBody.length === 0) {
      json(res, 400, { error: 'Expected an array of tasks' });
      return true;
    }

    if (!team.taskBoard) team.taskBoard = [];
    if (!team.doneLog) team.doneLog = [];

    // Dedup mode: caller can opt into exact-string title matching to escape the
    // legacy 60-char prefix collapse that silently drops semantically distinct
    // tasks (e.g. "Execute Research Cycle 9 - Affective Causality" vs cycle 12).
    // Accept from `?dedup=exact` query OR `body.dedup` field. Defaults to
    // 'normalized' (legacy). Closes task_1776981805111_4fg3 [BOARD-BUG].
    const dedupParam = (
      new URL(url, 'http://localhost').searchParams.get('dedup') ??
      body.dedup ??
      ''
    )
      .toString()
      .toLowerCase();
    const dedupMode: 'exact' | 'normalized' = dedupParam === 'exact' ? 'exact' : 'normalized';

    // Add tasks (framework signature: board, doneLog, tasks)
    // doneLog types differ between mcp-server (TeamTask[]) and framework (DoneLogEntry[])
    // but only .title is used for dedup, which both have
    const tasksWithCreator = tasksBody.map((t: any) => ({ ...t, createdBy: caller.id }));
    const result = addTasksToBoard(team.taskBoard, team.doneLog || [], tasksWithCreator, {
      dedupMode,
    });
    const normalizationWarnings = Array.isArray((result as any).warnings)
      ? (result as any).warnings
      : (tasksBody as Array<{ title?: string; description?: string }>).flatMap((t) => {
          const raw = String(t.description || '');
          // Kept in sync with board-ops.ts:300 cap (W.085 fix raised 1000→2000).
          if (raw.length <= 2000) return [];
          return [
            {
              title: String(t.title || '').slice(0, 200),
              reason: 'description_truncated' as const,
              originalLength: raw.length,
              keptLength: 2000,
            },
          ];
        });
    team.taskBoard = result.updatedBoard;
    await persistTeamDurable(teamId);

    for (const task of result.added) {
      broadcastToTeam(teamId, {
        type: 'board:added' as any,
        agent: caller.name,
        data: { taskId: task.id, title: task.title, agent: caller.name },
      });
    }

    // `skipped` explains rows that did not become tasks (e.g. duplicate title vs open/done).
    // `dedupMode` echoed so callers know which mode was applied (helps debug silent Added:0).
    json(res, 201, {
      success: true,
      added: result.added.length,
      tasks: result.added,
      skipped: result.skipped,
      warnings: normalizationWarnings,
      dedupMode,
    });
    return true;
  }

  // POST /api/holomesh/team/:id/board/scout — Scout tasks
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board\/scout$/) && method === 'POST') {
    // Pattern Gamma residual fix — see board POST handler above.
    const access = await requireTeamAccessFresh(req, res, url, 'board:write');
    if (!access) return true;
    const { caller, teamId } = access;
    const team = teamStore.get(teamId)!;

    const rawBody = await parseJsonBody(req);
    const { effectiveBody, ctx: signingCtx } = await extractAndVerifySigning(rawBody, {
      bypassSigning: caller?.isFounder ?? false,
    });
    if (!signingCtx.signingValid) {
      json(res, 401, { error: 'signing-rejected', reason: signingCtx.signingReason });
      return true;
    }
    const body: any = effectiveBody;
    const todoContent = body.todo_content as string;

    if (!team.taskBoard) team.taskBoard = [];

    let addedTasks: any[] = [];
    let skippedTasks: SkippedTaskEntry[] = [];
    let warnings: {
      title: string;
      reason: 'description_truncated';
      originalLength: number;
      keptLength: number;
    }[] = [];
    if (todoContent && todoContent.length > 0) {
      // Mock scout from todos based on expected format
      // Skip the scanner's own implementation files, code-gen templates,
      // and test/spec files to prevent self-derivation.
      const SCOUT_SKIP_RE =
        /\b(?:board-routes|team-routes|board-tools|refactor-codegen-tools)\.ts[:#]|(?:__tests__[/\\]|\.test\.ts[:#]|\.spec\.ts[:#])/;
      const tasksBody = todoContent
        .split('\n')
        .filter((l) => !SCOUT_SKIP_RE.test(l))
        .filter((l) => l.includes('TODO:') || l.includes('FIXME:'))
        .map((l, i) => ({
          title: l.substring(l.indexOf(l.includes('TODO:') ? 'TODO:' : 'FIXME:')).trim(),
          description: `Generated from source grep: \n\n${l}`,
          source: 'scout:todo-scan',
          priority: l.includes('FIXME:') ? 2 : 1,
          createdBy: caller.id,
        }));
      if (tasksBody.length > 0) {
        const scopedTasksBody = tasksBody.slice(0, body.max_tasks || 50);
        const result = addTasksToBoard(team.taskBoard, team.doneLog || [], scopedTasksBody);
        addedTasks = result.added;
        skippedTasks = result.skipped;
        warnings = Array.isArray((result as any).warnings)
          ? (result as any).warnings
          : scopedTasksBody.flatMap((t: { title?: string; description?: string }) => {
              const raw = String(t.description || '');
              if (raw.length <= 1000) return [];
              return [
                {
                  title: String(t.title || '').slice(0, 200),
                  reason: 'description_truncated' as const,
                  originalLength: raw.length,
                  keptLength: 1000,
                },
              ];
            });
        team.taskBoard = result.updatedBoard;
      }
    } else if (team.taskBoard.length === 0) {
      // Empty board auto-hint task
      const result = addTasksToBoard(team.taskBoard, team.doneLog || [], [
        {
          title: 'Run /room scout to find actionable work in this repository',
          description:
            'Your project board is empty. Run /room scout with todo_content populated or use it directly in terminal.',
          source: 'scout:auto-hint',
          priority: 1,
        },
      ]);
      addedTasks = result.added;
      skippedTasks = result.skipped;
      warnings = Array.isArray((result as any).warnings) ? (result as any).warnings : [];
      team.taskBoard = result.updatedBoard;
    }

    if (addedTasks.length > 0) {
      await persistTeamDurable(teamId);
      for (const task of addedTasks) {
        broadcastToTeam(teamId, {
          type: 'board:added' as any,
          agent: 'Scout',
          data: { taskId: task.id, title: task.title, agent: 'Scout' },
        });
      }
    }

    json(res, 201, {
      success: true,
      tasks_added: addedTasks.length,
      tasks: addedTasks,
      skipped: skippedTasks,
      warnings,
    });
    return true;
  }

  // GET /api/holomesh/team/:id/board/:taskId — direct task lookup
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board\/[^/]+$/) && method === 'GET') {
    // Same freshness contract as GET /board: task-detail probes commonly run
    // immediately after POST /board and must see writes from any Railway replica.
    const access = await requireTeamAccessFresh(req, res, url, 'board:read');
    if (!access) return true;
    const { teamId } = access;
    const team = teamStore.get(teamId)!;
    const m = pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board\/([^/]+)$/);
    const taskId = decodeURIComponent(m?.[1] || '');

    const task = (team.taskBoard || []).find((t) => t.id === taskId);
    if (task) {
      json(res, 200, { success: true, teamId, task });
      return true;
    }

    const doneEntry = (team.doneLog || []).find((entry) => entry.taskId === taskId);
    if (doneEntry) {
      json(res, 200, { success: true, teamId, task: doneEntry, done: true });
      return true;
    }

    json(res, 404, { error: 'Task not found', taskId });
    return true;
  }

  // PATCH /api/holomesh/team/:id/board/:taskId — claim/done/block/reopen/delegate/delete
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board\/[^/]+$/) && method === 'PATCH') {
    // Pattern Gamma residual fix — fresh variant reloads from postgres before
    // membership check so claim/done from a peer replica are visible.
    const access = await requireTeamAccessFresh(req, res, url);
    if (!access) return true;
    const { caller, teamId } = access;
    const team = teamStore.get(teamId)!;
    if (!team.taskBoard) team.taskBoard = [];
    if (!team.doneLog) team.doneLog = [];

    const parts = pathname.split('/');
    const taskId = parts[parts.length - 1];
    const rawBody = await parseJsonBody(req);
    const { effectiveBody, ctx: signingCtx } = await extractAndVerifySigning(rawBody, {
      bypassSigning: caller?.isFounder ?? false,
    });
    if (!signingCtx.signingValid) {
      json(res, 401, { error: 'signing-rejected', reason: signingCtx.signingReason });
      return true;
    }
    const body: any = effectiveBody;
    const requestIdentityEnvelope = identityEnvelopeFromBody(body);
    const rawAction = body.action as string;
    // Alias normalization: `remove` and `archive` map to `delete` so the
    // known-404 responses from `delete|remove|archive` in W.073 all resolve.
    // `cancel`/`skip`/`drop` intentionally stay unknown — their semantics
    // (reopen vs delete vs defer) are ambiguous and picking wrong silently
    // loses work. An explicit client choice is safer.
    const action = rawAction === 'remove' || rawAction === 'archive' ? 'delete' : rawAction;
    const boardMutationActions = new Set([
      'claim',
      'done',
      'append_commit',
      'block',
      'reopen',
      'delegate',
      'delete',
      'update',
    ]);

    if (boardMutationActions.has(action)) {
      if (caller.surface === 'mobile') {
        json(res, 403, {
          error:
            action === 'claim'
              ? 'Mobile bearers are assistant surfaces and cannot claim board tasks'
              : 'Mobile bearers are assistant surfaces and cannot mutate board tasks',
          code:
            action === 'claim'
              ? 'mobile_claim_denied'
              : action === 'done'
                ? 'mobile_done_denied'
                : 'mobile_board_mutation_denied',
          surface: caller.surface,
          required_capability: 'claim',
        });
        return true;
      }

      if (!hasBearerCapability(caller, 'claim')) {
        json(res, 403, {
          error: 'Bearer lacks required capability: claim',
          code: 'capability_denied',
          required_capability: 'claim',
          capabilities: caller.capabilities || [],
        });
        return true;
      }
    }

    let result: any;
    let eventType: string = '';

    // Surface-attribution tags. With W.087 vertex C (01424bcd6) + vertex B
    // (51558fa) live, `caller.surfaceTag` is the server-stored snapshot from
    // /register time and is the authoritative source. The caller is also the
    // actor for claim/done/delete — the tag must describe their own surface,
    // not an arbitrary string chosen per-request.
    //
    // Body-declared tags are fallback-only for legacy agents that registered
    // before `surfaceTag` was persisted on `RegisteredAgent`. A caller with a
    // server-stored surfaceTag CANNOT override it via body — defense-in-depth
    // against surface impersonation in the done-log / board UI.
    //
    // Still advisory in the sense that caller.id/caller.name remain the
    // authoritative identity; what changed is that the tag field can no
    // longer be arbitrarily reassigned per-request.
    const claimedByTag =
      caller.surfaceTag ?? (typeof body.claimedByTag === 'string' ? body.claimedByTag : undefined);
    const completedByTag =
      caller.surfaceTag ??
      (typeof body.completedByTag === 'string' ? body.completedByTag : undefined);
    const deleterTag =
      caller.surfaceTag ?? (typeof body.deleterTag === 'string' ? body.deleterTag : undefined);
    const deleteReason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : undefined;
    const provenanceResult = parseBoardMutationProvenance(body, caller);
    if (provenanceResult.error) {
      json(res, 400, {
        error: provenanceResult.error,
        code: 'invalid_board_provenance',
      });
      return true;
    }
    const mutationProvenance = provenanceResult.provenance;
    let reviewRequest: TeamMessage | undefined;

    switch (action) {
      case 'claim':
        if (caller.surface === 'mobile') {
          json(res, 403, {
            error: 'Mobile bearers are assistant surfaces and cannot claim board tasks',
            code: 'mobile_claim_denied',
            surface: caller.surface,
            required_capability: 'claim',
          });
          return true;
        }
        if (!hasBearerCapability(caller, 'claim')) {
          json(res, 403, {
            error: 'Bearer lacks required capability: claim',
            code: 'capability_denied',
            required_capability: 'claim',
            capabilities: caller.capabilities || [],
          });
          return true;
        }
        // Fleet orchestrators (dispatch route, scheduler-tick) supply body.agentId to claim
        // on behalf of the planned execution agent. Direct claims use caller.id (bearer identity).
        const effectiveAgentId =
          typeof body.agentId === 'string' && body.agentId.trim()
            ? body.agentId.trim()
            : caller.id;
        const effectiveAgentName =
          typeof body.agentName === 'string' && body.agentName.trim()
            ? body.agentName.trim()
            : caller.name;

        let claimPresence: TeamPresenceEntry | null = null;
        if (effectiveAgentId !== team.ownerId) {
          claimPresence = getFreshPresence(teamId, effectiveAgentId);
          if (!claimPresence) {
            json(res, 403, {
              error: 'Fresh heartbeat required before claiming a board task',
              code: 'heartbeat_required',
              required_endpoint: `/api/holomesh/team/${teamId}/presence`,
              grace_ms: CLAIM_HEARTBEAT_GRACE_MS,
            });
            return true;
          }
        } else {
          claimPresence = getFreshPresence(teamId, effectiveAgentId);
        }

        // required_tags enforcement: if the task declares required_tags, the claiming
        // agent must have ALL of them in their presence capabilityTags.
        const claimTarget = team.taskBoard.find((t) => t.id === taskId);
        if (claimTarget?.required_tags && claimTarget.required_tags.length > 0) {
          const agentPresence = claimPresence ?? getFreshPresence(teamId, effectiveAgentId);
          const agentCaps = (agentPresence?.capabilityTags ?? []).map((c) => c.toLowerCase());
          const missing = claimTarget.required_tags.filter(
            (r) => !agentCaps.includes(r.toLowerCase())
          );
          if (missing.length > 0) {
            json(res, 403, {
              error: 'Capability mismatch: agent lacks required tags for this task',
              code: 'capability_mismatch',
              required_tags: claimTarget.required_tags,
              missing_tags: missing,
              agent_capability_tags: agentPresence?.capabilityTags ?? [],
            });
            return true;
          }
        }

        // Fleet auto-join (task_1779315733346_9e0g): usage (claim) ⇒ team membership.
        // Dynamic roster: whoever actually claims/dispatches/hardware-runs for the team is on the team.
        const existingMember = team.members.find((m) => m.agentId === effectiveAgentId);
        if (!existingMember) {
          const memberType =
            (caller.surface && caller.surface.includes('hardware')) || caller.ideType === 'hardware'
              ? 'hardware'
              : 'agent';
          team.members.push({
            agentId: effectiveAgentId,
            agentName: effectiveAgentName,
            role: 'member',
            joinedAt: new Date().toISOString(),
            surfaceTag: caller.surfaceTag || caller.surface,
            walletAddress: caller.walletAddress,
            x402Verified: caller.x402Verified,
            type: memberType,
          });
        } else if (!existingMember.type) {
          // Backfill type for legacy members
          existingMember.type =
            (caller.surface && caller.surface.includes('hardware')) || caller.ideType === 'hardware'
              ? 'hardware'
              : 'agent';
        }

        const claimIdentity = claimPresence?.identityEnvelope || requestIdentityEnvelope;
        const claimLeaseActor = claimPresence
          ? ({ ...caller, id: effectiveAgentId, name: effectiveAgentName } as RegisteredAgent)
          : caller;
        const directClaimLease = claimPresence?.cloudSessionLeaseId
          ? null
          : upsertCloudSessionLease(teamId, claimLeaseActor, claimIdentity);
        result = claimTask(
          team.taskBoard,
          taskId,
          effectiveAgentId,
          effectiveAgentName,
          claimedByTag,
          {
            claimIdentity,
            claimLeaseId: claimPresence?.cloudSessionLeaseId || directClaimLease?.leaseId,
            claimLeaseExpiresAt: claimPresence?.sessionExpiresAt || directClaimLease?.expiresAt,
            claimSessionId: claimPresence?.sessionId || identitySessionId(claimIdentity),
          }
        );
        if (result.success && result.task && mutationProvenance) {
          result.task.provenance = cloneBoardProvenance(mutationProvenance);
        }
        eventType = 'board:claimed';
        break;
      case 'done': {
        const verificationEvidence = normalizeVerificationEvidence(
          body.verification_evidence ?? body.verificationEvidence
        );
        if (!verificationEvidence) {
          json(res, 400, {
            error: 'verification_evidence is required before marking a task done',
            code: 'verification_evidence_required',
          });
          return true;
        }
        const doneTarget = team.taskBoard.find((t) => t.id === taskId);
        const leaseCheck = validateCloudClaimLeaseForDone(teamId, caller, doneTarget);
        if (!leaseCheck.ok) {
          json(res, leaseCheck.status, {
            error: leaseCheck.error,
            code: leaseCheck.code,
            taskId,
            leaseId: leaseCheck.leaseId,
          });
          return true;
        }
        const completionPresence = getFreshPresence(teamId, caller.id);
        const completionIdentity = completionPresence?.identityEnvelope || requestIdentityEnvelope;
        const directCompletionLease = completionPresence?.cloudSessionLeaseId
          ? null
          : upsertCloudSessionLease(teamId, caller, completionIdentity);
        const wrap = completeTask(team.taskBoard, taskId, caller.name, {
          summary: body.summary as string,
          commit: body.commit as string | undefined,
          verificationEvidence,
          completedByTag,
          completedIdentity: completionIdentity,
          completionLeaseId: completionPresence?.cloudSessionLeaseId || directCompletionLease?.leaseId,
          provenance: mutationProvenance,
        });
        result = wrap.result;
        team.taskBoard = wrap.updatedBoard;
        if (result.doneEntry) {
          team.doneLog.push(result.doneEntry);
          reviewRequest = {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            teamId,
            fromAgentId: caller.id,
            fromAgentName: caller.name,
            content: [
              `Review verification_evidence on task ${taskId} marked done by ${caller.name}${completedByTag ? ` (${completedByTag})` : ''}.`,
              `Title: ${result.task?.title || taskId}`,
              body.commit ? `Commit: ${String(body.commit).slice(0, 80)}` : 'Commit: none supplied',
              `Evidence: ${verificationEvidence}`,
            ].join('\n'),
            messageType: 'review-request',
            createdAt: new Date().toISOString(),
          };
          const messages = teamMessageStore.get(teamId) || [];
          messages.push(reviewRequest);
          teamMessageStore.set(teamId, messages.slice(-500));
        }
        eventType = 'board:completed';
        break;
      }
      case 'append_commit': {
        const commit = (body.commit as string | undefined)?.trim();
        if (!commit) {
          json(res, 400, { error: 'commit hash required' });
          return true;
        }
        const wrap = appendFollowUpCommit(
          (team.doneLog || []) as unknown as import('@holoscript/framework').DoneLogEntry[],
          taskId,
          commit,
          body.summary as string | undefined
        );
        if (!wrap.success) {
          json(res, 404, { error: wrap.error || 'Entry not found' });
          return true;
        }
        eventType = 'board:commit_appended';
        result = { success: true, task: { id: taskId, title: wrap.entry?.title } };
        break;
      }
      case 'block':
        result = blockTask(team.taskBoard, taskId);
        eventType = 'board:blocked';
        break;
      case 'reopen':
        result = reopenTask(team.taskBoard as any, taskId);
        eventType = 'board:reopened';
        break;
      case 'delegate': {
        const targetTeamId = (body.to_team_id as string) || teamId;
        const targetTeam = teamStore.get(targetTeamId);
        if (!targetTeam) {
          json(res, 404, { error: 'Target team not found' });
          return true;
        }
        if (!targetTeam.taskBoard) targetTeam.taskBoard = [];

        const wrap = delegateTask(team.taskBoard, targetTeam.taskBoard, taskId);
        result = wrap.result;
        team.taskBoard = wrap.updatedSource;
        targetTeam.taskBoard = wrap.updatedTarget;
        eventType = 'board:delegated';
        break;
      }
      case 'delete': {
        // Owner-only gate: we don't track task creator explicitly (only the
        // `source` string), so "creator or owner" collapses to owner-only.
        // `config:write` is owner-only per TEAM_ROLE_PERMISSIONS (types.ts:523)
        // plus adminRoom members inherit full permissions.
        if (!hasTeamPermission(team, caller.id, 'config:write')) {
          json(res, 403, {
            error: 'Permission denied: only team owners can delete tasks (config:write required)',
          });
          return true;
        }
        const wrap = deleteTask(team.taskBoard, taskId, caller.id, caller.name, {
          deleterTag,
          reason: deleteReason,
        });
        result = wrap.result;
        team.taskBoard = wrap.updatedBoard;
        // Tombstone the deletion in doneLog so /board/done preserves history.
        if (result.tombstone) team.doneLog.push(result.tombstone);
        eventType = 'board:deleted';
        break;
      }
      case 'update': {
        // Permission gate: owner (config:write) OR task creator with board:write.
        // createdBy is populated since 2026-05-13; old tasks without it still require
        // owner intervention — agents should comment-not-patch for legacy tasks.
        const taskIndex = (team.taskBoard as any[]).findIndex((t: any) => t.id === taskId);
        if (taskIndex === -1) {
          json(res, 404, { error: 'Task not found' });
          return true;
        }
        const task: any = team.taskBoard[taskIndex];
        const canUpdate =
          hasTeamPermission(team, caller.id, 'config:write') ||
          (hasTeamPermission(team, caller.id, 'board:write') && task.createdBy === caller.id);
        if (!canUpdate) {
          json(res, 403, {
            error: 'Permission denied: only team owners or the task creator can update tasks',
          });
          return true;
        }
        const updates: Record<string, unknown> = {};
        if (typeof body.title === 'string') {
          updates.title = body.title.slice(0, 500);
        }
        if (typeof body.description === 'string') {
          // Preserve previous description for audit before overwriting.
          if (task.description !== body.description) {
            updates._prevDescription =
              String(task.description ?? '').slice(0, 500) +
              (String(task.description ?? '').length > 500 ? '…' : '');
          }
          updates.description = normalizeTaskDescription(body.description, 2000);
        }
        if (body.priority !== undefined) {
          updates.priority = body.priority;
        }
        if (Array.isArray(body.tags)) {
          updates.tags = (body.tags as unknown[]).slice(0, 50).map((t) => String(t).slice(0, 100));
        }
        if (Object.keys(updates).filter((k) => k !== '_prevDescription').length === 0) {
          json(res, 400, {
            error: 'No updatable fields provided: supply title, description, priority, and/or tags',
          });
          return true;
        }
        updates.updatedAt = new Date().toISOString();
        updates.updatedBy = caller.name;
        Object.assign(task, updates);
        result = { success: true, task };
        eventType = 'board:updated';
        break;
      }
      default:
        json(res, 400, {
          error:
            'Unknown action — supported: claim|done|append_commit|block|reopen|delegate|delete|update (aliases: remove, archive → delete)',
        });
        return true;
    }

    if (!result.success) {
      json(res, 400, { error: result.error || 'Action failed' });
      return true;
    }

    await persistTeamDurable(teamId);

    // Real-time broadcast
    broadcastToTeam(teamId, {
      type: eventType as any,
      agent: caller.name,
      data: { taskId, title: result.task?.title || taskId, agent: caller.name },
    });
    if (reviewRequest) {
      broadcastToTeam(teamId, {
        type: 'message:new',
        agent: caller.name,
        data: {
          id: reviewRequest.id,
          from: caller.name,
          content: reviewRequest.content.slice(0, 200),
        },
      });
    }

    // Clients must attribute claims to the authenticated agent (Bearer), not body.agentName.
    const payload: Record<string, unknown> = { success: true, task: result.task };
    if (action === 'claim') {
      payload.claimedAs = { id: caller.id, name: caller.name };
      if (claimedByTag) (payload.claimedAs as Record<string, unknown>).surfaceTag = claimedByTag;
      if (result.task?.claimIdentity) {
        (payload.claimedAs as Record<string, unknown>).identityEnvelope = result.task.claimIdentity;
      }
      if (result.task?.claimLeaseId) {
        (payload.claimedAs as Record<string, unknown>).cloudSessionLeaseId =
          result.task.claimLeaseId;
      }
    }
    if (action === 'done' && completedByTag) {
      payload.completedAs = { id: caller.id, name: caller.name, surfaceTag: completedByTag };
    }
    if (action === 'done' && result.task?.completedIdentity) {
      payload.completedAs = {
        ...(isRecord(payload.completedAs) ? payload.completedAs : { id: caller.id, name: caller.name }),
        identityEnvelope: result.task.completedIdentity,
        cloudSessionLeaseId: result.task.completionLeaseId,
      };
    }
    if (action === 'done' && reviewRequest) {
      payload.reviewRequest = reviewRequest;
    }
    if (action === 'delete') {
      payload.deleted = true;
      payload.deletedAs = { id: caller.id, name: caller.name };
      if (deleterTag) (payload.deletedAs as Record<string, unknown>).surfaceTag = deleterTag;
      if (deleteReason) payload.reason = deleteReason;
      if (result.tombstone) payload.tombstone = result.tombstone;
    }
    json(res, 200, payload);
    return true;
  }

  // POST /api/holomesh/team/:id/presence — Heartbeat
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/presence$/) && method === 'POST') {
    // Pattern Gamma write-path coverage (follow-up to 29e9a8da7): heartbeats
    // are the load-bearing identity check — when a fresh /join lands on
    // replica A and the heartbeat hits replica B, the sync access check 403s
    // on stale cache. W.133 documented this as the read-only verdict trigger.
    const access = await requireTeamAccessFresh(req, res, url);
    if (!access) return true;
    const { caller, teamId } = access;
    const team = teamStore.get(teamId)!;

    const rawBody = await parseJsonBody(req);
    const { effectiveBody, ctx: signingCtx } = await extractAndVerifySigning(rawBody, {
      bypassSigning: caller?.isFounder ?? false,
    });
    if (!signingCtx.signingValid) {
      json(res, 401, { error: 'signing-rejected', reason: signingCtx.signingReason });
      return true;
    }
    const body: any = effectiveBody;
    const requestIdentityEnvelope = identityEnvelopeFromBody(body);
    let presenceMap = teamPresenceStore.get(teamId);
    if (!presenceMap) {
      presenceMap = new Map();
      teamPresenceStore.set(teamId, presenceMap);
    }

    const isFirst = !presenceMap.has(caller.id);
    // Carry wallet + x402 verification + surface tag on every heartbeat so
    // GET /presence distinguishes per-surface x402 seats.
    //
    // Surface tag precedence (defense-in-depth against spoofing):
    //   1. caller.surfaceTag   — server-stored, snapshotted at /register
    //   2. teamMember.surfaceTag — snapshot from the join record
    //   3. body.surface_tag    — only for legacy agents that predate (1)
    //
    // Once an agent is registered with a surface, subsequent heartbeats
    // cannot reassign it via request body. Body is fallback-only.
    const teamMember = team.members.find((m) => m.agentId === caller.id);
    const declaredSurfaceTag =
      typeof body.surface_tag === 'string' ? (body.surface_tag as string) : undefined;
    const declaredSurface = normalizePresenceSurface(
      body.surface ?? new URL(url, 'http://localhost').searchParams.get('surface')
    );
    const resolvedSurfaceTag = caller.surfaceTag ?? teamMember?.surfaceTag ?? declaredSurfaceTag;
    // Aliveness fix (task_1777939860298_m9ep, layer b): explicit teardown.
    // body.status==='offline' is the Stop hook's "I'm leaving" signal — the
    // server must DELETE the row, not stamp it offline and let it expire
    // naturally over the PRESENCE_TTL_MS window. Without this we get the
    // cursor-claude-x402 ghost: closed IDE, fresh-looking heartbeat, agent
    // still online for ~2 minutes after the window closed.
    //
    // We accept both `status` and `body.status` casings for safety; the
    // legacy code path used the same `body.status` field. Idempotent —
    // posting offline with no row reports removed=false.
    const declaredStatus = (body.status as string) || 'active';
    if (declaredStatus === 'offline') {
      endCloudSessionLeasesForAgent(teamId, caller.id, requestIdentityEnvelope);
      const had = presenceMap.has(caller.id);
      presenceMap.delete(caller.id);
      if (had) {
        broadcastToTeam(teamId, {
          type: 'presence:leave',
          agent: caller.name,
          data: { agentId: caller.id, agentName: caller.name, reason: 'explicit-teardown' },
        });
      }
      pruneStalePresence(teamId);
      const online = Array.from(presenceMap.values());
      json(res, 200, { success: true, removed: had, online, online_count: online.length });
      return true;
    }
    const lastHeartbeat = new Date().toISOString();
    const ttlMs = getPresenceTtlMs({ surface: declaredSurface });
    const cloudLease = upsertCloudSessionLease(
      teamId,
      caller,
      requestIdentityEnvelope,
      lastHeartbeat
    );
    const entry: TeamPresenceEntry = {
      agentId: caller.id,
      agentName: caller.name,
      ideType: body.ide_type as string,
      status: (body.status as TeamPresenceEntry['status']) || 'active',
      lastHeartbeat,
      surface: declaredSurface,
      expiresAt: new Date(Date.parse(lastHeartbeat) + ttlMs).toISOString(),
      ttlMs,
      walletAddress: caller.walletAddress,
      x402Verified: caller.x402Verified === true,
      surfaceTag: resolvedSurfaceTag,
      capabilityTags: Array.isArray(body.capability_tags)
        ? (body.capability_tags as unknown[]).map(String)
        : undefined,
      identityEnvelope: requestIdentityEnvelope,
      cloudSessionLeaseId: cloudLease?.leaseId,
      sessionId: identitySessionId(requestIdentityEnvelope),
      sessionOrigin: identityOrigin(requestIdentityEnvelope),
      sessionExpiresAt: cloudLease?.expiresAt,
    };
    presenceMap.set(caller.id, entry);

    if (isFirst) {
      broadcastToTeam(teamId, {
        type: 'presence:join',
        agent: caller.name,
        data: { agentId: caller.id, agentName: caller.name, ide: entry.ideType },
      });
    }

    pruneStalePresence(teamId);
    const online = Array.from(presenceMap.values());

    json(res, 200, { success: true, online, presence: entry, online_count: online.length });
    return true;
  }

  // GET /api/holomesh/team/:id/members — W.087 vertex C
  //
  // Membership listing with wallet / x402 / surface attribution. Ships as the
  // canonical "who is on this team" endpoint so agents can disambiguate
  // per-surface x402 seats from the shared founder key (which was the
  // blind-spot that drove F.022 and S.IDENT Dim-1 open for weeks).
  //
  // Response fields per member (all required keys present even when empty):
  //   - agentId, agentName, role, joinedAt — always set (from TeamMember)
  //   - walletAddress — backfilled from agentKeyStore when the TeamMember
  //     snapshot is missing it (legacy members joined before types.ts shipped
  //     these fields in this commit)
  //   - x402Verified — ditto (inferred from RegisteredAgent.x402Verified)
  //   - surfaceTag — from TeamMember snapshot or, when absent, the last
  //     observed presence entry's surfaceTag (heartbeats declare this)
  //
  // Auth: team membership (same gate as GET /presence). Non-members 403.
  // GET /api/holomesh/team/:id/sessions - cloud-session lease inventory.
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/sessions$/) && method === 'GET') {
    const access = await requireTeamAccessFresh(req, res, url);
    if (!access) return true;
    const { teamId } = access;
    pruneCloudSessionLeases(teamId);
    const status = new URL(url, 'http://localhost').searchParams.get('status');
    const sessions = Array.from(teamCloudSessionStore.get(teamId)?.values() || [])
      .filter((lease) => !status || lease.status === status)
      .sort(
        (a, b) =>
          b.lastHeartbeat.localeCompare(a.lastHeartbeat) || a.leaseId.localeCompare(b.leaseId)
      );
    json(res, 200, {
      success: true,
      teamId,
      leaseMs: CLOUD_SESSION_LEASE_MS,
      count: sessions.length,
      sessions,
    });
    return true;
  }

  // POST /api/holomesh/team/:id/session/start - open or renew a cloud-session lease.
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/session\/start$/) && method === 'POST') {
    const access = await requireTeamAccessFresh(req, res, url);
    if (!access) return true;
    const { caller, teamId } = access;
    const rawBody = await parseJsonBody(req);
    const { effectiveBody, ctx: signingCtx } = await extractAndVerifySigning(rawBody, {
      bypassSigning: caller?.isFounder ?? false,
    });
    if (!signingCtx.signingValid) {
      json(res, 401, { error: 'signing-rejected', reason: signingCtx.signingReason });
      return true;
    }
    const body = (effectiveBody || {}) as Record<string, unknown>;
    const envelope = identityEnvelopeFromBody(body);
    const lease = upsertCloudSessionLease(teamId, caller, envelope);
    if (!lease) {
      json(res, 400, {
        error: 'identity_envelope must describe a cloud session',
        code: 'identity_envelope_not_cloud',
      });
      return true;
    }
    json(res, 201, { success: true, lease });
    return true;
  }

  // POST /api/holomesh/team/:id/session/:leaseId/heartbeat - renew a cloud lease.
  if (
    pathname.match(/^\/api\/holomesh\/team\/[^/]+\/session\/[^/]+\/heartbeat$/) &&
    method === 'POST'
  ) {
    const access = await requireTeamAccessFresh(req, res, url);
    if (!access) return true;
    const { caller, teamId } = access;
    const parts = pathname.split('/');
    const leaseId = parts[parts.length - 2];
    const rawBody = await parseJsonBody(req);
    const { effectiveBody, ctx: signingCtx } = await extractAndVerifySigning(rawBody, {
      bypassSigning: caller?.isFounder ?? false,
    });
    if (!signingCtx.signingValid) {
      json(res, 401, { error: 'signing-rejected', reason: signingCtx.signingReason });
      return true;
    }
    pruneCloudSessionLeases(teamId);
    const lease = teamCloudSessionStore.get(teamId)?.get(leaseId);
    if (!lease) {
      json(res, 404, { error: 'cloud session lease not found', code: 'cloud_session_not_found' });
      return true;
    }
    if (lease.agentId !== caller.id) {
      json(res, 403, {
        error: 'cloud session lease belongs to another agent',
        code: 'cloud_session_owner_mismatch',
      });
      return true;
    }
    if (lease.status === 'ended') {
      json(res, 409, { error: 'cloud session lease is ended', code: 'cloud_session_ended' });
      return true;
    }
    const body = (effectiveBody || {}) as Record<string, unknown>;
    const envelope = identityEnvelopeFromBody(body);
    const envelopeSessionId = identitySessionId(envelope);
    if (envelopeSessionId && envelopeSessionId !== lease.sessionId) {
      json(res, 409, {
        error: 'identity_envelope session does not match lease',
        code: 'cloud_session_id_mismatch',
        leaseSessionId: lease.sessionId,
        envelopeSessionId,
      });
      return true;
    }
    const heartbeatAt = new Date().toISOString();
    lease.status = 'active';
    lease.lastHeartbeat = heartbeatAt;
    lease.expiresAt = new Date(Date.parse(heartbeatAt) + CLOUD_SESSION_LEASE_MS).toISOString();
    if (envelope) lease.identityEnvelope = envelope;
    json(res, 200, { success: true, lease });
    return true;
  }

  // POST /api/holomesh/team/:id/session/:leaseId/finish - end a cloud lease.
  if (
    pathname.match(/^\/api\/holomesh\/team\/[^/]+\/session\/[^/]+\/finish$/) &&
    method === 'POST'
  ) {
    const access = await requireTeamAccessFresh(req, res, url);
    if (!access) return true;
    const { caller, teamId } = access;
    const parts = pathname.split('/');
    const leaseId = parts[parts.length - 2];
    const rawBody = await parseJsonBody(req);
    const { ctx: signingCtx } = await extractAndVerifySigning(rawBody, {
      bypassSigning: caller?.isFounder ?? false,
    });
    if (!signingCtx.signingValid) {
      json(res, 401, { error: 'signing-rejected', reason: signingCtx.signingReason });
      return true;
    }
    const lease = teamCloudSessionStore.get(teamId)?.get(leaseId);
    if (!lease) {
      json(res, 404, { error: 'cloud session lease not found', code: 'cloud_session_not_found' });
      return true;
    }
    if (lease.agentId !== caller.id) {
      json(res, 403, {
        error: 'cloud session lease belongs to another agent',
        code: 'cloud_session_owner_mismatch',
      });
      return true;
    }
    const finishedAt = new Date().toISOString();
    lease.status = 'ended';
    lease.lastHeartbeat = finishedAt;
    lease.expiresAt = finishedAt;
    json(res, 200, { success: true, lease });
    return true;
  }

  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/members$/) && method === 'GET') {
    // Pattern Gamma read-path coverage (follow-up to 29e9a8da7): the W.087
    // vertex-C disambiguation endpoint must reflect the latest membership;
    // stale cache here breaks per-surface seat enumeration.
    const access = await requireTeamAccessFresh(req, res, url);
    if (!access) return true;
    const { teamId } = access;
    const team = teamStore.get(teamId)!;

    pruneStalePresence(teamId);
    const presenceMap = teamPresenceStore.get(teamId);

    // Build an agentId → RegisteredAgent backfill index (by id, not apiKey).
    const byAgentId = new Map<string, RegisteredAgent>();
    for (const a of agentKeyStore.values()) {
      byAgentId.set(a.id, a);
    }

    const members = team.members.map((m) => {
      const registered = byAgentId.get(m.agentId);
      const presence = presenceMap?.get(m.agentId);
      const walletAddress = m.walletAddress ?? registered?.walletAddress;
      const x402Verified = m.x402Verified ?? registered?.x402Verified === true;
      const surfaceTag = m.surfaceTag ?? presence?.surfaceTag;
      return {
        agentId: m.agentId,
        agentName: m.agentName,
        role: m.role,
        joinedAt: m.joinedAt,
        walletAddress,
        x402Verified,
        surfaceTag,
        online: Boolean(presence),
        lastHeartbeat: presence?.lastHeartbeat,
        identityEnvelope: presence?.identityEnvelope,
        brainIdentity: presence?.identityEnvelope?.brain ?? presence?.identityEnvelope?.principal,
        cloudSessionLeaseId: presence?.cloudSessionLeaseId,
        sessionId: presence?.sessionId,
        sessionOrigin: presence?.sessionOrigin,
        sessionExpiresAt: presence?.sessionExpiresAt,
      };
    });

    json(res, 200, {
      success: true,
      teamId,
      count: members.length,
      members,
    });
    return true;
  }

  // GET /api/holomesh/team/:id/slots
  //
  // Public-user parity surface for local HoloMesh operators. The MCP tool layer
  // exposes slot roles through holomesh_board_list / holomesh_slot_assign, and
  // the sovereign service contract probes an HTTP slot surface directly. Keep
  // this read-only and membership-gated like /members so external users can
  // inspect capacity without needing founder access.
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/slots$/) && method === 'GET') {
    const access = await requireTeamAccessFresh(req, res, url);
    if (!access) return true;
    const { teamId } = access;
    const team = teamStore.get(teamId)!;

    pruneStalePresence(teamId);
    const presenceMap = teamPresenceStore.get(teamId);
    const slotRoles = team.roomConfig?.slotRoles || [];
    const maxSlots = Number.isFinite(team.maxSlots) ? Math.max(0, Math.floor(team.maxSlots)) : 0;
    const members = team.members || [];

    const slots = Array.from({ length: maxSlots }, (_, index) => {
      const member = members[index];
      const presence = member ? presenceMap?.get(member.agentId) : undefined;
      return {
        index,
        role: slotRoles[index] || 'flex',
        occupied: Boolean(member),
        agentId: member?.agentId || null,
        agentName: member?.agentName || null,
        memberRole: member?.role || null,
        online: Boolean(presence),
        lastHeartbeat: presence?.lastHeartbeat || null,
        identityEnvelope: presence?.identityEnvelope,
        brainIdentity: presence?.identityEnvelope?.brain ?? presence?.identityEnvelope?.principal,
        cloudSessionLeaseId: presence?.cloudSessionLeaseId || null,
        sessionOrigin: presence?.sessionOrigin || null,
        sessionExpiresAt: presence?.sessionExpiresAt || null,
      };
    });

    json(res, 200, {
      success: true,
      teamId,
      maxSlots,
      memberCount: members.length,
      openSlots: Math.max(0, maxSlots - members.length),
      slotRoles,
      slots,
    });
    return true;
  }

  // POST /api/holomesh/team/:id/message
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/message$/) && method === 'POST') {
    // Pattern Gamma residual fix — see board POST handler above.
    const access = await requireTeamAccessFresh(req, res, url, 'messages:write');
    if (!access) return true;
    const { caller, teamId } = access;
    if (!hasBearerCapability(caller, 'message')) {
      json(res, 403, {
        error: 'Bearer lacks required capability: message',
        code: 'capability_denied',
        required_capability: 'message',
        capabilities: caller.capabilities || [],
      });
      return true;
    }

    const rawBody = await parseJsonBody(req);
    const { effectiveBody, ctx: signingCtx } = await extractAndVerifySigning(rawBody, {
      bypassSigning: caller?.isFounder ?? false,
    });
    if (!signingCtx.signingValid) {
      json(res, 401, { error: 'signing-rejected', reason: signingCtx.signingReason });
      return true;
    }
    const body: any = effectiveBody;
    const content = body.content as string;
    if (!content) {
      json(res, 400, { error: 'Missing content' });
      return true;
    }

    const message: TeamMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      teamId,
      fromAgentId: caller.id,
      fromAgentName: caller.name,
      content,
      messageType: (body.type as any) || 'text',
      createdAt: new Date().toISOString(),
    };

    const messages = teamMessageStore.get(teamId) || [];
    messages.push(message);
    teamMessageStore.set(teamId, messages.slice(-500));
    await persistTeamDurable(teamId);

    broadcastToTeam(teamId, {
      type: 'message:new',
      agent: caller.name,
      data: { id: message.id, from: caller.name, content: content.slice(0, 200) },
    });

    json(res, 201, { success: true, message });
    return true;
  }

  // GET /api/holomesh/team/:id/messages
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/messages$/) && method === 'GET') {
    // Pattern Gamma read-path coverage (follow-up to 29e9a8da7): handoff DMs
    // landing on a different replica must be visible to the next agent's
    // session-start inbox read.
    const access = await requireTeamAccessFresh(req, res, url, 'messages:read');
    if (!access) return true;
    const { teamId } = access;

    const messages = teamMessageStore.get(teamId) || [];
    json(res, 200, { success: true, messages });
    return true;
  }

  // POST /api/holomesh/team/:id/messages/:messageId/read|mark-read
  {
    const readMatch = pathname.match(
      /^\/api\/holomesh\/team\/([^/]+)\/messages\/([^/]+)\/(?:read|mark-read)$/
    );
    if (readMatch && method === 'POST') {
      const access = await requireTeamAccessFresh(req, res, url, 'messages:read');
      if (!access) return true;
      const { caller, teamId } = access;
      const messageId = decodeURIComponent(readMatch[2]);
      const messages = teamMessageStore.get(teamId) || [];
      const message = messages.find((m) => m.id === messageId);
      if (!message) {
        json(res, 404, { error: 'Message not found', messageId });
        return true;
      }

      const readBy = new Set(message.readBy || []);
      readBy.add(caller.id);
      message.readBy = Array.from(readBy);
      message.readAt = new Date().toISOString();
      teamMessageStore.set(teamId, messages.slice(-500));
      await persistTeamDurable(teamId);

      json(res, 200, {
        success: true,
        messageId,
        read: true,
        readBy: message.readBy,
        readAt: message.readAt,
      });
      return true;
    }
  }

  // GET /api/holomesh/team/:id/feed — team activity feed (hologram publishes, etc.)
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/feed$/) && method === 'GET') {
    // Pattern Gamma read-path coverage (follow-up to 29e9a8da7): feed
    // publishes via POST /feed already use Fresh; the read side must match
    // or the feed silently lags by one cross-replica round-trip.
    const access = await requireTeamAccessFresh(req, res, url, 'messages:read');
    if (!access) return true;
    const { teamId } = access;
    const limitParam = new URL(url, 'http://localhost').searchParams.get('limit');
    const limit = Math.min(
      MAX_FEED_QUERY,
      Math.max(1, limitParam ? parseInt(limitParam, 10) || 30 : 30)
    );
    const items = teamFeedStore.get(teamId) || [];
    const slice = items.slice(-limit);
    json(res, 200, { success: true, items: slice, count: slice.length });
    return true;
  }

  // POST /api/holomesh/team/:id/feed — append feed item (poster identity from auth only)
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/feed$/) && method === 'POST') {
    // Pattern Gamma residual fix — see board POST handler above.
    const access = await requireTeamAccessFresh(req, res, url, 'messages:write');
    if (!access) return true;
    const { teamId, caller } = access;
    const rawBody = await parseJsonBody(req);
    const { effectiveBody, ctx: signingCtx } = await extractAndVerifySigning(rawBody, {
      bypassSigning: caller?.isFounder ?? false,
    });
    if (!signingCtx.signingValid) {
      json(res, 401, { error: 'signing-rejected', reason: signingCtx.signingReason });
      return true;
    }
    const body: any = effectiveBody;
    const kind = body.kind as string;
    const posterIdBody = typeof body.posterAgentId === 'string' ? body.posterAgentId.trim() : '';
    if (posterIdBody && posterIdBody !== caller.id) {
      json(res, 403, { error: 'posterAgentId must match authenticated agent' });
      return true;
    }

    let item: TeamFeedItem;
    if (kind === 'hologram') {
      const hash = typeof body.hash === 'string' ? body.hash.trim() : '';
      const shareUrl = typeof body.shareUrl === 'string' ? body.shareUrl.trim() : '';
      const err = validateHologramFeedInput(hash, shareUrl);
      if (err) {
        json(res, 400, { error: err });
        return true;
      }
      item = {
        id: `feed_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        teamId,
        kind: 'hologram',
        posterAgentId: caller.id,
        posterAgentName: caller.name,
        hash,
        shareUrl,
        createdAt: new Date().toISOString(),
      };
      broadcastToTeam(teamId, {
        type: 'feed:hologram' as any,
        agent: caller.name,
        data: { id: item.id, hash, shareUrl, posterAgentId: caller.id },
      });
    } else if (kind === 'intelligence') {
      const content = typeof body.content === 'string' ? body.content.trim() : '';
      if (!content) {
        json(res, 400, { error: 'Missing content for intelligence feed item' });
        return true;
      }
      const scope = body.scope === 'public' ? 'public' : 'team';
      item = {
        id: `feed_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        teamId,
        kind: 'intelligence',
        posterAgentId: caller.id,
        posterAgentName: caller.name,
        content,
        scope,
        createdAt: new Date().toISOString(),
      };
      broadcastToTeam(teamId, {
        type: 'feed:intelligence' as any,
        agent: caller.name,
        data: { id: item.id, content: content.slice(0, 200), scope, posterAgentId: caller.id },
      });
    } else {
      json(res, 400, { error: 'Only kind "hologram" or "intelligence" is supported' });
      return true;
    }

    const list = teamFeedStore.get(teamId) || [];
    list.push(item);
    const cap = 200;
    const trimmed = list.length > cap ? list.slice(-cap) : list;
    teamFeedStore.set(teamId, trimmed);
    await persistTeamDurable(teamId);

    json(res, 201, { success: true, item });
    return true;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Founder-approval (N3 signed-write path).
  //
  // Separates APPROVAL (low-stakes founder intent, recorded here, Bearer-authed)
  // from EXECUTION (the real mutation, performed later by a signing agent with
  // its own x402 envelope). This route is intentionally NOT x402-gated: it
  // records intent and mutates nothing privileged. The custody line (F.002) is
  // never crossed — no signing key lives in the browser. The one-tap safety
  // gate (D.044) is enforced server-side: only REVERSIBLE intents are admitted;
  // irreversible / spend / custody intents are 403'd and stay on explicit review.
  // ──────────────────────────────────────────────────────────────────────────

  // POST /api/holomesh/team/:id/founder-approval — record a one-tap approval
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/founder-approval$/) && method === 'POST') {
    const access = await requireTeamAccessFresh(req, res, url, 'board:write');
    if (!access) return true;
    const { teamId, caller } = access;
    const team = teamStore.get(teamId)!;

    const body = (await parseJsonBody(req)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      json(res, 400, { error: 'JSON object body required' });
      return true;
    }
    const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : '';
    if (!taskId) {
      json(res, 400, { error: 'taskId is required' });
      return true;
    }

    // Re-derive reversibility from the SERVER's copy of the task title — never
    // trust a client-sent reversible flag. Fall back to the client intent string
    // only when the task is not on the board (e.g. just-closed); still gated.
    const task = (team.taskBoard || []).find((t) => t.id === taskId);
    const clientIntent = typeof body.intent === 'string' ? body.intent.trim() : '';
    const intent = (task?.title || clientIntent || '').slice(0, 400);
    if (!intent) {
      json(res, 400, { error: 'no task found for taskId and no intent provided' });
      return true;
    }

    const { actionType, reversible, reason } = deriveApprovalReversibility(intent);
    if (!reversible) {
      // 403 — irreversible/spend/custody intents are not one-tap. The Console
      // keeps these on the explicit navigate-to-review path.
      json(res, 403, {
        error: 'intent is not one-tap eligible',
        reason,
        actionType,
        taskId,
        requiresExplicitReview: true,
      });
      return true;
    }

    const record: FounderApprovalRecord = {
      id: `approval_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      taskId,
      intent,
      actionType,
      approvedByAgentId: caller.id,
      approvedByName: caller.name,
      status: 'approved',
      createdAt: new Date().toISOString(),
    };
    const list = team.founderApprovals || [];
    list.push(record);
    const cap = 200;
    team.founderApprovals = list.length > cap ? list.slice(-cap) : list;
    await persistTeamDurable(teamId);

    broadcastToTeam(teamId, {
      type: 'founder:approval' as any,
      agent: caller.name,
      data: { id: record.id, taskId, actionType, intent: intent.slice(0, 120) },
    });

    json(res, 201, { success: true, approval: record });
    return true;
  }

  // GET /api/holomesh/team/:id/founder-approval[?status=approved] — poll approvals
  // The signing agent's consume loop polls this with ?status=approved.
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/founder-approval$/) && method === 'GET') {
    const access = await requireTeamAccessFresh(req, res, url, 'board:read');
    if (!access) return true;
    const { teamId } = access;
    const team = teamStore.get(teamId)!;
    const statusFilter = new URL(url, 'http://localhost').searchParams.get('status');
    let approvals = team.founderApprovals || [];
    if (statusFilter) {
      approvals = approvals.filter((a) => a.status === statusFilter);
    }
    json(res, 200, { success: true, approvals, count: approvals.length });
    return true;
  }

  // PATCH /api/holomesh/team/:id/founder-approval/:approvalId — signing agent
  // updates lifecycle: approved → executing → executed | failed (+ resultRef).
  if (
    pathname.match(/^\/api\/holomesh\/team\/[^/]+\/founder-approval\/[^/]+$/) &&
    method === 'PATCH'
  ) {
    const access = await requireTeamAccessFresh(req, res, url, 'board:write');
    if (!access) return true;
    const { teamId, caller } = access;
    const team = teamStore.get(teamId)!;
    const approvalId = pathname.split('/').pop() as string;

    const body = (await parseJsonBody(req)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      json(res, 400, { error: 'JSON object body required' });
      return true;
    }
    const nextStatus = body.status as FounderApprovalRecord['status'] | undefined;
    const allowed: FounderApprovalRecord['status'][] = ['executing', 'executed', 'failed'];
    if (!nextStatus || !allowed.includes(nextStatus)) {
      json(res, 400, { error: `status must be one of ${allowed.join(', ')}` });
      return true;
    }
    const record = (team.founderApprovals || []).find((a) => a.id === approvalId);
    if (!record) {
      json(res, 404, { error: 'approval not found' });
      return true;
    }
    record.status = nextStatus;
    if (nextStatus === 'executing') {
      record.claimedByAgentId = caller.id;
      record.claimedByName = caller.name;
    }
    if (nextStatus === 'executed' || nextStatus === 'failed') {
      record.executedAt = new Date().toISOString();
    }
    if (typeof body.resultRef === 'string') {
      record.resultRef = body.resultRef.slice(0, 500);
    }
    await persistTeamDurable(teamId);

    broadcastToTeam(teamId, {
      type: 'founder:approval:update' as any,
      agent: caller.name,
      data: { id: record.id, status: record.status, resultRef: record.resultRef },
    });

    json(res, 200, { success: true, approval: record });
    return true;
  }

  // GET /api/holomesh/team/:id/trace — unified multiagent trace timeline
  if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/trace$/) && method === 'GET') {
    const access = await requireTeamAccessFresh(req, res, url);
    if (!access) return true;
    const { teamId } = access;
    const team = teamStore.get(teamId)!;

    interface TraceTimelineEntry {
      id: string;
      timestamp: string;
      kind:
        | 'task_created'
        | 'task_claimed'
        | 'task_done'
        | 'task_blocked'
        | 'message'
        | 'mode_change'
        | 'feed'
        | 'subagent'
        | 'policy'
        | 'artifact'
        | 'presence'
        | 'suggestion';
      agentId?: string;
      agentName?: string;
      surfaceTag?: string;
      taskId?: string;
      taskTitle?: string;
      taskStatus?: 'open' | 'claimed' | 'done' | 'blocked';
      taskPriority?: number;
      parentTaskId?: string;
      childTaskIds?: string[];
      commitHash?: string;
      messageType?: string;
      content?: string;
      fromMode?: string;
      toMode?: string;
      source?: string;
      feedKind?: string;
      hash?: string;
      shareUrl?: string;
      eventType?: string;
      actor?: TaskOrchestrationAgentRef;
      target?: TaskOrchestrationAgentRef;
      wave?: number;
      childTaskId?: string;
      policyDecision?: string;
      policyActionKind?: string;
      artifact?: ArtifactReceipt;
      model?: string;
      provider?: string;
      ideType?: string;
      status?: string;
      title?: string;
      category?: string;
      score?: number;
      modeChange?: { previousMode: string; newMode: string; source: string; reason?: string };
      verificationEvidence?: string;
      identityEnvelope?: HoloMeshIdentityEnvelope;
      brainIdentity?: HoloMeshIdentityEnvelope['brain'] | HoloMeshIdentityEnvelope['principal'];
      cloudSessionLeaseId?: string;
      sessionOrigin?: string;
      sessionExpiresAt?: string;
    }

    const entries: TraceTimelineEntry[] = [];

    function pushTaskTrace(task: TeamTask) {
      const base: TraceTimelineEntry = {
        id: `${task.id}_task`,
        timestamp: task.createdAt,
        kind: 'task_created',
        taskId: task.id,
        taskTitle: task.title,
        taskStatus: task.status,
        taskPriority: task.priority,
        parentTaskId: task.parentTaskId,
        childTaskIds: task.childTaskIds,
      };
      entries.push(base);
      if (task.status === 'claimed' && task.claimedBy) {
        entries.push({
          ...base,
          id: `${task.id}_claimed`,
          kind: 'task_claimed',
          timestamp: task.createdAt,
          agentId: task.claimedBy,
          agentName: task.claimedByName,
          surfaceTag: task.claimedByTag,
          identityEnvelope: task.claimIdentity,
          brainIdentity: task.claimIdentity?.brain ?? task.claimIdentity?.principal,
          cloudSessionLeaseId: task.claimLeaseId,
          sessionOrigin: identityOrigin(task.claimIdentity),
          sessionExpiresAt: task.claimLeaseExpiresAt,
        });
      }
      if (task.status === 'done' && task.completedAt) {
        entries.push({
          ...base,
          id: `${task.id}_done`,
          kind: 'task_done',
          timestamp: task.completedAt,
          agentId: task.completedBy,
          agentName: task.claimedByName,
          surfaceTag: task.completedByTag,
          commitHash: task.commitHash,
          identityEnvelope: task.completedIdentity,
          brainIdentity: task.completedIdentity?.brain ?? task.completedIdentity?.principal,
          cloudSessionLeaseId: task.completionLeaseId,
          sessionOrigin: identityOrigin(task.completedIdentity),
        });
      }
      if (task.status === 'blocked') {
        entries.push({
          ...base,
          id: `${task.id}_blocked`,
          kind: 'task_blocked',
          timestamp: task.createdAt,
        });
      }
    }

    function pushSubagentTrace(ev: SubagentEvent) {
      entries.push({
        id: ev.id,
        timestamp: ev.timestamp,
        kind: 'subagent',
        eventType: ev.type,
        taskId: ev.taskId,
        parentTaskId: ev.parentTaskId,
        childTaskId: ev.childTaskId,
        wave: ev.wave,
        actor: ev.actor,
        target: ev.target,
        agentId: ev.actor?.agentId,
        agentName: ev.actor?.agentName,
        surfaceTag: ev.actor?.handle,
        model: ev.actor?.model,
        provider: ev.actor?.provider,
        status: ev.status,
        content: ev.summary,
      });
    }

    function pushPolicyTrace(ev: TaskPolicyEvent) {
      entries.push({
        id: ev.id || `policy_${ev.timestamp}_${ev.taskId || 'unknown'}`,
        timestamp: ev.timestamp,
        kind: 'policy',
        taskId: ev.taskId,
        policyDecision: ev.decision,
        policyActionKind: ev.actionKind,
        agentId: ev.agent,
        content: ev.reasons?.join('; '),
      });
    }

    function pushArtifactTrace(art: ArtifactReceipt, taskId: string, timestamp: string) {
      entries.push({
        id: `artifact_${art.id}_${taskId}`,
        timestamp,
        kind: 'artifact',
        taskId,
        artifact: art,
        agentName: art.producer,
        content: `${art.type}: ${art.path || art.uri || art.id}`,
      });
    }

    function pushDoneTrace(entry: DoneLogEntry) {
      entries.push({
        id: `${entry.taskId}_done`,
        timestamp: entry.timestamp,
        kind: 'task_done',
        taskId: entry.taskId,
        taskTitle: entry.title,
        taskStatus: 'done',
        agentId: entry.completedBy,
        surfaceTag: entry.completedByTag,
        commitHash: entry.commitHash,
        verificationEvidence: entry.verificationEvidence,
        identityEnvelope: entry.completedIdentity ?? entry.claimIdentity,
        brainIdentity:
          entry.completedIdentity?.brain ??
          entry.completedIdentity?.principal ??
          entry.claimIdentity?.brain ??
          entry.claimIdentity?.principal,
        cloudSessionLeaseId: entry.completionLeaseId ?? entry.claimLeaseId,
        sessionOrigin: identityOrigin(entry.completedIdentity ?? entry.claimIdentity),
        sessionExpiresAt: entry.claimLeaseExpiresAt,
        parentTaskId: entry.parentTaskId,
        childTaskIds: entry.childTaskIds,
        content: entry.summary,
      });
    }

    // 1. Live board tasks
    for (const task of team.taskBoard || []) {
      pushTaskTrace(task);
      for (const ev of task.subagentEvents || []) pushSubagentTrace(ev);
      for (const ev of task.policyEvents || []) pushPolicyTrace(ev);
      for (const art of task.artifacts || []) {
        pushArtifactTrace(art, task.id, task.completedAt ?? task.createdAt);
      }
    }

    // 2. Done log
    for (const entry of team.doneLog || []) {
      pushDoneTrace(entry);
      for (const ev of entry.subagentEvents || []) pushSubagentTrace(ev);
      for (const ev of entry.policyEvents || []) pushPolicyTrace(ev);
      for (const art of entry.artifacts || [])
        pushArtifactTrace(art, entry.taskId, entry.timestamp);
    }

    // 3. Messages
    for (const msg of teamMessageStore.get(teamId) || []) {
      entries.push({
        id: msg.id,
        timestamp: msg.createdAt,
        kind: 'message',
        agentId: msg.fromAgentId,
        agentName: msg.fromAgentName,
        messageType: msg.messageType,
        content: msg.content,
        modeChange: msg.modeChange,
      });
    }

    // 4. Feed
    for (const item of teamFeedStore.get(teamId) || []) {
      if (item.kind === 'mode_change') {
        entries.push({
          id: item.id,
          timestamp: item.createdAt,
          kind: 'mode_change',
          agentId: item.actorAgentId,
          agentName: item.actorAgentName,
          fromMode: item.fromMode,
          toMode: item.toMode,
          source: item.source,
        });
      } else if (item.kind === 'hologram') {
        entries.push({
          id: item.id,
          timestamp: item.createdAt,
          kind: 'feed',
          feedKind: 'hologram',
          agentId: item.posterAgentId,
          agentName: item.posterAgentName,
          hash: item.hash,
          shareUrl: item.shareUrl,
        });
      }
    }

    // 5. Presence (latest per agent only)
    const presenceMap = teamPresenceStore.get(teamId);
    const presence = presenceMap ? Array.from(presenceMap.values()) : [];
    const latestPresence = new Map<string, TeamPresenceEntry>();
    for (const p of presence) {
      const existing = latestPresence.get(p.agentId);
      if (!existing || p.lastHeartbeat > existing.lastHeartbeat) {
        latestPresence.set(p.agentId, p);
      }
    }
    for (const p of latestPresence.values()) {
      entries.push({
        id: `presence_${p.agentId}`,
        timestamp: p.lastHeartbeat,
        kind: 'presence',
        agentId: p.agentId,
        agentName: p.agentName,
        surfaceTag: p.surfaceTag,
        ideType: p.ideType,
        status: p.status,
        identityEnvelope: p.identityEnvelope,
        brainIdentity: p.identityEnvelope?.brain ?? p.identityEnvelope?.principal,
        cloudSessionLeaseId: p.cloudSessionLeaseId,
        sessionOrigin: p.sessionOrigin,
        sessionExpiresAt: p.sessionExpiresAt,
      });
    }

    // 6. Suggestions
    const suggestions = (team as Team & { suggestions?: TeamSuggestion[] }).suggestions || [];
    for (const sug of suggestions) {
      entries.push({
        id: sug.id,
        timestamp: sug.createdAt,
        kind: 'suggestion',
        agentId: sug.proposedBy,
        agentName: sug.proposedByName,
        title: sug.title,
        category: sug.category,
        score: sug.score,
        status: sug.status,
      });
    }

    // Sort newest first
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp) || a.id.localeCompare(b.id));

    json(res, 200, { success: true, teamId, entries });
    return true;
  }

  return false;
}
