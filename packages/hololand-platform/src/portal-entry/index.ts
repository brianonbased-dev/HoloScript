/**
 * Portal Entry Receipt — receipt for an entity (agent or human) entering a
 * HoloScript world through a HoloTunnel portal.
 *
 * Extends `holotunnel.share-packet.v1` with portal-specific fields:
 *   - Entrant identity (who/what is entering)
 *   - Representation served (semantic-state lane vs pixel-stream lane, per W.701)
 *   - Scopes granted (spatial permissions within the world)
 *   - Entry/exit world-state rewind hashes (temporal anchors for rewind)
 *
 * The receipt IS the moat (F.058: ship receipt with the solver; SimContract unit).
 * A portal without a receipt is an uncontrolled door — the receipt proves what
 * happened, who came through, what they could do, and what the world looked like
 * when they arrived and left.
 *
 * NMoS: build-internal (HoloTunnel is sovereign; no external dependency).
 *
 * @module @holoscript/hololand-platform/portal-entry
 */

import { createHash, randomUUID } from 'node:crypto';
import type { HoloTunnelSharePacket } from '../holo-tunnel/index.js';

// ── Schema Version ──────────────────────────────────────────────────────────────

export const PORTAL_ENTRY_RECEIPT_SCHEMA_VERSION =
  'holoscript.holotunnel.portal-entry.v1' as const;

export type PortalEntryReceiptSchemaVersion =
  typeof PORTAL_ENTRY_RECEIPT_SCHEMA_VERSION;

// ── Entrant ──────────────────────────────────────────────────────────────────────

/**
 * What kind of entity is entering the portal.
 *
 * 'human-headset'   — human wearing VR/XR headset (WebXR pixel-stream lane)
 * 'human-browser'   — human in a flat browser (WebXR or fallback)
 * 'agent-semantic'  — agent receiving scene-graph + trait deltas (W.701 semantic lane)
 * 'agent-pixel'     — agent receiving pixel stream (rare; usually degraded access)
 */
export type PortalEntrantKind =
  | 'human-headset'
  | 'human-browser'
  | 'agent-semantic'
  | 'agent-pixel';

export interface PortalEntrant {
  /** Server-assigned agent ID (or stable human session ID). */
  agentId: string;
  /** Human-readable display name. */
  displayName?: string;
  /** What kind of entity is entering. */
  surfaceKind: PortalEntrantKind;
  /**
   * URI of the A2A Agent Card used at the threshold handshake.
   * Present only for agent entries; absent for human entries.
   * (W.701: A2A Agent Card at threshold for agent lane routing.)
   */
  a2aAgentCardRef?: string;
}

// ── Representation ────────────────────────────────────────────────────────────────

/**
 * Which representation lane was negotiated at the portal threshold.
 *
 * W.701: One portal URL, two representation lanes:
 *   - 'semantic-state'  — scene graph + trait deltas (agent-native)
 *   - 'pixel-stream'    — rendered WebXR frames (human/headset)
 *
 * The lane is decided by the connecting party's identity (A2A Agent Card
 * presence → semantic; human user-agent → pixel). This is the dual-
 * representation model: same world, two views.
 */
export type PortalRepresentationLane = 'semantic-state' | 'pixel-stream';

export interface PortalRepresentation {
  /** Which representation lane was served. */
  lane: PortalRepresentationLane;
  /** Content formats accepted by the entrant (e.g. 'scene-graph+trait-delta', 'webxr-frame'). */
  acceptedFormats: readonly string[];
  /** ISO 8601 timestamp of when representation negotiation completed. */
  negotiatedAt: string;
}

// ── Scopes Granted ────────────────────────────────────────────────────────────────

export type PortalSpatialPermission = 'read' | 'mutate' | 'admin';

export interface PortalScopesGranted {
  /** Spatial permissions granted to the entrant within the world. */
  spatial: readonly PortalSpatialPermission[];
  /**
   * Tool scope IDs from security/tool-scopes.ts that were activated.
   * Composes with existing per-surface x402 seat scoping (S.IDENT).
   */
  toolScopeIds: readonly string[];
  /** World ID the scopes apply to. */
  worldId: string;
  /** ISO 8601 timestamp of when scopes were granted. */
  grantedAt: string;
}

// ── World-State Anchors ───────────────────────────────────────────────────────────

/**
 * Temporal anchors for world-state rewind at portal entry and exit.
 *
 * These hashes enable deterministic replay: given the world state at entry,
 * the entrant's actions can be replayed and verified. Given the state at exit,
 * the world can be rewound to its pre-entrance state (or the entrant's
 * mutations isolated and audited).
 *
 * `exitSnapshotHash` is undefined while the entrant is still present; it is
 * populated on eviction or voluntary exit.
 */
export interface PortalWorldStateAnchors {
  /** SHA-256 hash of the world state at the moment of entry. */
  entrySnapshotHash: string;
  /**
   * SHA-256 hash of the world state at the moment of exit.
   * Undefined while the entrant is still present in the world.
   */
  exitSnapshotHash?: string;
  /** ISO 8601 timestamp of entry. */
  entryTimestamp: string;
  /** ISO 8601 timestamp of exit. Undefined while still present. */
  exitTimestamp?: string;
  /** Whether temporal rewind is available for this entry session. */
  rewindAvailable: boolean;
}

// ── Provenance ────────────────────────────────────────────────────────────────────

export interface PortalEntryProvenance {
  /** HoloTunnel tunnel ID the entry occurred through. */
  tunnelId: string;
  /** World ID the entry occurred into. */
  worldId: string;
  /** Git commit hash of the HoloScript build serving the portal. */
  commit?: string;
  /** Zone ID within the world, if zone-scoped entry. */
  zoneId?: string;
}

// ── Receipt ────────────────────────────────────────────────────────────────────────

export type PortalEntryStatus = 'admitted' | 'denied' | 'evicted';

/**
 * Portal Entry Receipt — the complete record of an entity entering a
 * HoloScript world through a portal.
 *
 * Extends `holotunnel.share-packet.v1` with portal-specific identity,
 * representation, scope, and temporal-anchor fields.
 */
export interface PortalEntryReceipt {
  readonly schemaVersion: PortalEntryReceiptSchemaVersion;
  /** Deterministic receipt ID derived from receipt content. */
  readonly receiptId: string;
  /** ISO 8601 timestamp of receipt creation. */
  readonly createdAt: string;
  /** Package that generated this receipt. */
  readonly generatedBy: '@holoscript/hololand-platform/portal-entry';

  // ── Base: share-packet.v1 (extended) ──
  /** The HoloTunnel share packet describing the tunnel used for entry. */
  readonly sharePacket: HoloTunnelSharePacket;

  // ── Portal-specific fields ──
  /** Identity of the entity entering the portal. */
  readonly entrant: PortalEntrant;
  /** Representation lane served at the portal threshold. */
  readonly representation: PortalRepresentation;
  /** Scopes granted to the entrant within the world. */
  readonly scopesGranted: PortalScopesGranted;
  /** World-state temporal anchors for entry/exit rewind. */
  readonly worldStateAnchors: PortalWorldStateAnchors;
  /** Provenance: tunnel, world, build, zone. */
  readonly provenance: PortalEntryProvenance;

  /** Overall status of the portal entry attempt. */
  readonly overallStatus: PortalEntryStatus;
}

// ── Validation ────────────────────────────────────────────────────────────────────

export interface PortalEntryReceiptValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireText(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[]
): void {
  if (!hasText(record[key])) {
    errors.push(`Missing ${path}.${key}`);
  }
}

function requireObject(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[]
): Record<string, unknown> | null {
  const value = record[key];
  if (!isRecord(value)) {
    errors.push(`Missing ${path}.${key}`);
    return null;
  }
  return value;
}

function requireArray(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[]
): readonly unknown[] | null {
  const value = record[key];
  if (!Array.isArray(value)) {
    errors.push(`Missing ${path}.${key}`);
    return null;
  }
  return value;
}

const VALID_ENTRANT_KINDS = new Set<PortalEntrantKind>([
  'human-headset',
  'human-browser',
  'agent-semantic',
  'agent-pixel',
]);

const VALID_REPRESENTATION_LANES = new Set<PortalRepresentationLane>([
  'semantic-state',
  'pixel-stream',
]);

const VALID_SPATIAL_PERMISSIONS = new Set<PortalSpatialPermission>([
  'read',
  'mutate',
  'admin',
]);

const VALID_STATUSES = new Set<PortalEntryStatus>(['admitted', 'denied', 'evicted']);

/**
 * Validate a Portal Entry Receipt.
 *
 * Checks:
 *   - schemaVersion matches
 *   - receiptId present
 *   - entrant.agentId, entrant.surfaceKind valid
 *   - representation.lane valid, acceptedFormats non-empty, negotiatedAt parseable
 *   - scopesGranted.spatial valid entries, worldId present, grantedAt parseable
 *   - worldStateAnchors.entrySnapshotHash present, entryTimestamp parseable
 *   - provenance.tunnelId, provenance.worldId present
 *   - overallStatus valid
 */
export function validatePortalEntryReceipt(
  receipt: unknown
): PortalEntryReceiptValidation {
  const errors: string[] = [];

  if (!isRecord(receipt)) {
    return { valid: false, errors: ['Portal entry receipt must be an object'] };
  }

  if (receipt.schemaVersion !== PORTAL_ENTRY_RECEIPT_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be ${PORTAL_ENTRY_RECEIPT_SCHEMA_VERSION}`
    );
  }

  requireText(receipt, 'receiptId', 'receipt', errors);
  requireText(receipt, 'createdAt', 'receipt', errors);

  if (receipt.generatedBy !== '@holoscript/hololand-platform/portal-entry') {
    errors.push('generatedBy must be @holoscript/hololand-platform/portal-entry');
  }

  // sharePacket
  const sharePacket = requireObject(receipt, 'sharePacket', 'receipt', errors);
  if (sharePacket) {
    if (sharePacket.schemaVersion !== 'holoscript.holotunnel.share-packet.v1') {
      errors.push('sharePacket.schemaVersion must be holoscript.holotunnel.share-packet.v1');
    }
  }

  // entrant
  const entrant = requireObject(receipt, 'entrant', 'receipt', errors);
  if (entrant) {
    requireText(entrant, 'agentId', 'entrant', errors);
    if (!VALID_ENTRANT_KINDS.has(entrant.surfaceKind as PortalEntrantKind)) {
      errors.push(`entrant.surfaceKind must be one of: ${[...VALID_ENTRANT_KINDS].join(', ')}`);
    }
    // a2aAgentCardRef is required for agent entries
    if (
      (entrant.surfaceKind === 'agent-semantic' || entrant.surfaceKind === 'agent-pixel') &&
      !hasText(entrant.a2aAgentCardRef)
    ) {
      errors.push('entrant.a2aAgentCardRef is required for agent entries');
    }
  }

  // representation
  const representation = requireObject(receipt, 'representation', 'receipt', errors);
  if (representation) {
    if (!VALID_REPRESENTATION_LANES.has(representation.lane as PortalRepresentationLane)) {
      errors.push(`representation.lane must be one of: ${[...VALID_REPRESENTATION_LANES].join(', ')}`);
    }
    const formats = requireArray(representation, 'acceptedFormats', 'representation', errors);
    if (formats && formats.length === 0) {
      errors.push('representation.acceptedFormats must include at least one format');
    }
    if (!hasText(representation.negotiatedAt) || Number.isNaN(Date.parse(String(representation.negotiatedAt)))) {
      errors.push('representation.negotiatedAt must be a valid ISO 8601 timestamp');
    }
  }

  // scopesGranted
  const scopesGranted = requireObject(receipt, 'scopesGranted', 'receipt', errors);
  if (scopesGranted) {
    const spatial = requireArray(scopesGranted, 'spatial', 'scopesGranted', errors);
    if (spatial) {
      for (const [i, perm] of spatial.entries()) {
        if (!VALID_SPATIAL_PERMISSIONS.has(perm as PortalSpatialPermission)) {
          errors.push(`scopesGranted.spatial[${i}] must be one of: ${[...VALID_SPATIAL_PERMISSIONS].join(', ')}`);
        }
      }
      if (spatial.length === 0) {
        errors.push('scopesGranted.spatial must include at least one permission');
      }
    }
    requireText(scopesGranted, 'worldId', 'scopesGranted', errors);
    if (!hasText(scopesGranted.grantedAt) || Number.isNaN(Date.parse(String(scopesGranted.grantedAt)))) {
      errors.push('scopesGranted.grantedAt must be a valid ISO 8601 timestamp');
    }
  }

  // worldStateAnchors
  const worldStateAnchors = requireObject(receipt, 'worldStateAnchors', 'receipt', errors);
  if (worldStateAnchors) {
    requireText(worldStateAnchors, 'entrySnapshotHash', 'worldStateAnchors', errors);
    if (!hasText(worldStateAnchors.entryTimestamp) || Number.isNaN(Date.parse(String(worldStateAnchors.entryTimestamp)))) {
      errors.push('worldStateAnchors.entryTimestamp must be a valid ISO 8601 timestamp');
    }
    // exitSnapshotHash + exitTimestamp are optional; but if one is present, both should be
    const hasExitHash = hasText(worldStateAnchors.exitSnapshotHash);
    const hasExitTs = hasText(worldStateAnchors.exitTimestamp);
    if (hasExitHash && !hasExitTs) {
      errors.push('worldStateAnchors.exitTimestamp is required when exitSnapshotHash is present');
    }
    if (!hasExitHash && hasExitTs) {
      errors.push('worldStateAnchors.exitSnapshotHash is required when exitTimestamp is present');
    }
  }

  // provenance
  const provenance = requireObject(receipt, 'provenance', 'receipt', errors);
  if (provenance) {
    requireText(provenance, 'tunnelId', 'provenance', errors);
    requireText(provenance, 'worldId', 'provenance', errors);
  }

  // overallStatus
  if (!VALID_STATUSES.has(receipt.overallStatus as PortalEntryStatus)) {
    errors.push(`overallStatus must be one of: ${[...VALID_STATUSES].join(', ')}`);
  }

  // Cross-field: representation lane consistency with entrant kind
  if (entrant && representation) {
    const kind = entrant.surfaceKind as string;
    const lane = representation.lane as string;
    if (kind === 'agent-semantic' && lane !== 'semantic-state') {
      errors.push('agent-semantic entrant must receive semantic-state representation lane');
    }
    if (kind === 'human-headset' && lane !== 'pixel-stream') {
      errors.push('human-headset entrant must receive pixel-stream representation lane');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Type guard for PortalEntryReceipt.
 */
export function isPortalEntryReceipt(
  receipt: unknown
): receipt is PortalEntryReceipt {
  return validatePortalEntryReceipt(receipt).valid;
}

// ── Builder ────────────────────────────────────────────────────────────────────────

export interface PortalEntryReceiptBuildOptions {
  /** The HoloTunnel share packet for the tunnel used. */
  sharePacket: HoloTunnelSharePacket;
  /** Entrant identity. */
  entrant: PortalEntrant;
  /** Representation lane served. */
  representation: Omit<PortalRepresentation, 'negotiatedAt'> & { negotiatedAt?: string };
  /** Scopes granted. */
  scopesGranted: Omit<PortalScopesGranted, 'grantedAt'> & { grantedAt?: string };
  /** World-state anchors. */
  worldStateAnchors: Omit<PortalWorldStateAnchors, 'entryTimestamp'> & { entryTimestamp?: string };
  /** Provenance. */
  provenance: PortalEntryProvenance;
  /** Overall status. Default: 'admitted'. */
  overallStatus?: PortalEntryStatus;
  /** ISO 8601 now override for testing. */
  now?: string;
}

/**
 * Build a Portal Entry Receipt.
 *
 * Produces a deterministic receipt ID via SHA-256 of the canonical receipt
 * content (same pattern as HeadsetShareReceipt).
 */
export function buildPortalEntryReceipt(
  options: PortalEntryReceiptBuildOptions
): PortalEntryReceipt {
  const now = options.now ?? new Date().toISOString();

  const receiptBase: Omit<PortalEntryReceipt, 'receiptId'> = {
    schemaVersion: PORTAL_ENTRY_RECEIPT_SCHEMA_VERSION,
    createdAt: now,
    generatedBy: '@holoscript/hololand-platform/portal-entry',
    sharePacket: options.sharePacket,
    entrant: options.entrant,
    representation: {
      lane: options.representation.lane,
      acceptedFormats: options.representation.acceptedFormats,
      negotiatedAt: options.representation.negotiatedAt ?? now,
    },
    scopesGranted: {
      spatial: options.scopesGranted.spatial,
      toolScopeIds: options.scopesGranted.toolScopeIds,
      worldId: options.scopesGranted.worldId,
      grantedAt: options.scopesGranted.grantedAt ?? now,
    },
    worldStateAnchors: {
      entrySnapshotHash: options.worldStateAnchors.entrySnapshotHash,
      exitSnapshotHash: options.worldStateAnchors.exitSnapshotHash,
      entryTimestamp: options.worldStateAnchors.entryTimestamp ?? now,
      exitTimestamp: options.worldStateAnchors.exitTimestamp,
      rewindAvailable: options.worldStateAnchors.rewindAvailable,
    },
    provenance: options.provenance,
    overallStatus: options.overallStatus ?? 'admitted',
  };

  const digest = sha256Canonical(receiptBase);
  return {
    receiptId: `pentry_${digest.slice(0, 16)}`,
    ...receiptBase,
  };
}

// ── Utility ─────────────────────────────────────────────────────────────────────────

function sha256Canonical(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)), 'utf8')
    .digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const v = record[key];
    if (v !== undefined) out[key] = canonicalize(v);
  }
  return out;
}

/**
 * Generate a unique portal entry ID.
 */
export function generatePortalEntryId(): string {
  return `pentry_${randomUUID().slice(0, 12)}`;
}

/**
 * Determine the default representation lane for a given entrant kind.
 * W.701: agents get semantic-state; humans on headsets get pixel-stream.
 */
export function defaultRepresentationLaneFor(
  entrantKind: PortalEntrantKind
): PortalRepresentationLane {
  switch (entrantKind) {
    case 'agent-semantic':
    case 'agent-pixel':
      return 'semantic-state';
    case 'human-headset':
    case 'human-browser':
      return 'pixel-stream';
  }
}

/**
 * Determine the default accepted formats for a given representation lane.
 */
export function defaultAcceptedFormatsFor(
  lane: PortalRepresentationLane
): string[] {
  switch (lane) {
    case 'semantic-state':
      return ['scene-graph+trait-delta', 'authoritative-state-snapshot'];
    case 'pixel-stream':
      return ['webxr-frame', 'av1-stream'];
  }
}