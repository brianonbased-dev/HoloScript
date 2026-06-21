/**
 * CollaborativeWorldTrait
 *
 * Declares transform-level collaboration semantics for 3D world authoring:
 * entity selection locks, scene-space presence cursors, Lamport-ordered
 * transform operations, and an Unreal Concert bridge descriptor.
 */

import type { TraitContext, TraitEvent, TraitHandler, HSPlusNode } from './TraitTypes';

export type CollaborativeTransformField = 'position' | 'rotation' | 'scale';
export type CollaborativeConflictResolution =
  | 'lock_required'
  | 'lamport_merge'
  | 'last_write_wins'
  | 'reject_remote';
export type CollaborativeLockMode = 'selection' | 'transform' | 'exclusive';
export type CollaborativeCursorFrame = 'world' | 'viewport';

export type SpatialVec3 = [number, number, number];

export interface CollaborativeTransform {
  position?: SpatialVec3;
  rotation?: SpatialVec3;
  scale?: SpatialVec3;
  version?: number;
  updatedBy?: string;
  updatedAt?: number;
}

export interface CollaborativeTransformOp {
  type: 'transform';
  entityId: string;
  actorId: string;
  field: CollaborativeTransformField;
  value: SpatialVec3;
  lamport: number;
  timestamp: number;
  baseVersion?: number;
  lockId?: string;
}

export interface CollaborativeSelectionLock {
  entityId: string;
  ownerId: string;
  lockId: string;
  mode: CollaborativeLockMode;
  acquiredAt: number;
  expiresAt: number;
  version: number;
}

export interface CollaborativePresenceCursor {
  actorId: string;
  displayName?: string;
  color?: string;
  position: SpatialVec3;
  direction?: SpatialVec3;
  selectedEntityId?: string | null;
  lastSeen: number;
}

export interface CollaborativeWorldTraitConfig {
  roomName?: string;
  syncRateHz?: number;
  transformFields?: CollaborativeTransformField[];
  conflictResolution?: CollaborativeConflictResolution;
  selectionLocks?: boolean;
  lockTtlMs?: number;
  presenceCursors?: boolean;
  cursorFrame?: CollaborativeCursorFrame;
  presenceTimeoutMs?: number;
  concertBridge?: boolean;
  debugGhosts?: boolean;
  opLogLimit?: number;
}

export type ResolvedCollaborativeWorldTraitConfig = Required<CollaborativeWorldTraitConfig>;

export interface CollaborativeWorldState {
  config: ResolvedCollaborativeWorldTraitConfig;
  locks: Map<string, CollaborativeSelectionLock>;
  presence: Map<string, CollaborativePresenceCursor>;
  transforms: Map<string, CollaborativeTransform>;
  opLog: CollaborativeTransformOp[];
}

export interface TransformOpDecision {
  status: 'applied' | 'conflict' | 'rejected';
  reason?: string;
  blockingLock?: CollaborativeSelectionLock;
}

export class CollaborativeWorldTraitValidationError extends Error {
  constructor(
    public readonly field: string,
    public readonly reason: string
  ) {
    super(`@collaborative-world validation error in "${field}": ${reason}`);
    this.name = 'CollaborativeWorldTraitValidationError';
  }
}

export const COLLABORATIVE_WORLD_TRAIT_DEFAULTS: ResolvedCollaborativeWorldTraitConfig = {
  roomName: 'Untitled Collaborative World',
  syncRateHz: 60,
  transformFields: ['position', 'rotation', 'scale'],
  conflictResolution: 'lock_required',
  selectionLocks: true,
  lockTtlMs: 3000,
  presenceCursors: true,
  cursorFrame: 'world',
  presenceTimeoutMs: 5000,
  concertBridge: true,
  debugGhosts: true,
  opLogLimit: 2048,
};

const VALID_TRANSFORM_FIELDS: CollaborativeTransformField[] = ['position', 'rotation', 'scale'];
const VALID_CONFLICT_RESOLUTION: CollaborativeConflictResolution[] = [
  'lock_required',
  'lamport_merge',
  'last_write_wins',
  'reject_remote',
];

function boolFromUnknown(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  return Boolean(value);
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(String);
}

export function parseCollaborativeWorldTraitConfig(
  raw: Record<string, unknown>
): CollaborativeWorldTraitConfig {
  const config: CollaborativeWorldTraitConfig = {};

  if (raw.roomName !== undefined) config.roomName = String(raw.roomName);
  if (raw.syncRateHz !== undefined) config.syncRateHz = Number(raw.syncRateHz);
  if (raw.transformFields !== undefined) {
    config.transformFields = stringArray(raw.transformFields) as CollaborativeTransformField[];
  }
  if (raw.conflictResolution !== undefined) {
    config.conflictResolution = String(raw.conflictResolution) as CollaborativeConflictResolution;
  }
  if (raw.selectionLocks !== undefined) config.selectionLocks = boolFromUnknown(raw.selectionLocks);
  if (raw.lockTtlMs !== undefined) config.lockTtlMs = Number(raw.lockTtlMs);
  if (raw.presenceCursors !== undefined) config.presenceCursors = boolFromUnknown(raw.presenceCursors);
  if (raw.cursorFrame !== undefined) config.cursorFrame = String(raw.cursorFrame) as CollaborativeCursorFrame;
  if (raw.presenceTimeoutMs !== undefined) config.presenceTimeoutMs = Number(raw.presenceTimeoutMs);
  if (raw.concertBridge !== undefined) config.concertBridge = boolFromUnknown(raw.concertBridge);
  if (raw.debugGhosts !== undefined) config.debugGhosts = boolFromUnknown(raw.debugGhosts);
  if (raw.opLogLimit !== undefined) config.opLogLimit = Number(raw.opLogLimit);

  return config;
}

export function validateCollaborativeWorldTraitConfig(
  config: CollaborativeWorldTraitConfig
): void {
  if (config.syncRateHz !== undefined && (config.syncRateHz < 1 || config.syncRateHz > 120)) {
    throw new CollaborativeWorldTraitValidationError('syncRateHz', 'Must be between 1 and 120 Hz');
  }
  if (config.lockTtlMs !== undefined && (config.lockTtlMs < 250 || config.lockTtlMs > 60_000)) {
    throw new CollaborativeWorldTraitValidationError(
      'lockTtlMs',
      'Must be between 250 and 60000 ms'
    );
  }
  if (
    config.presenceTimeoutMs !== undefined &&
    (config.presenceTimeoutMs < 1000 || config.presenceTimeoutMs > 120_000)
  ) {
    throw new CollaborativeWorldTraitValidationError(
      'presenceTimeoutMs',
      'Must be between 1000 and 120000 ms'
    );
  }
  if (config.opLogLimit !== undefined && (!Number.isInteger(config.opLogLimit) || config.opLogLimit < 1)) {
    throw new CollaborativeWorldTraitValidationError('opLogLimit', 'Must be a positive integer');
  }
  if (
    config.conflictResolution !== undefined &&
    !VALID_CONFLICT_RESOLUTION.includes(config.conflictResolution)
  ) {
    throw new CollaborativeWorldTraitValidationError(
      'conflictResolution',
      `Must be one of: ${VALID_CONFLICT_RESOLUTION.join(', ')}`
    );
  }
  if (config.cursorFrame !== undefined && config.cursorFrame !== 'world' && config.cursorFrame !== 'viewport') {
    throw new CollaborativeWorldTraitValidationError('cursorFrame', 'Must be "world" or "viewport"');
  }
  if (config.transformFields) {
    for (const field of config.transformFields) {
      if (!VALID_TRANSFORM_FIELDS.includes(field)) {
        throw new CollaborativeWorldTraitValidationError(
          'transformFields',
          `Unsupported transform field: ${field}`
        );
      }
    }
  }
}

export function resolveCollaborativeWorldTraitConfig(
  parsed: CollaborativeWorldTraitConfig
): ResolvedCollaborativeWorldTraitConfig {
  return {
    roomName: parsed.roomName ?? COLLABORATIVE_WORLD_TRAIT_DEFAULTS.roomName,
    syncRateHz: parsed.syncRateHz ?? COLLABORATIVE_WORLD_TRAIT_DEFAULTS.syncRateHz,
    transformFields:
      parsed.transformFields ?? COLLABORATIVE_WORLD_TRAIT_DEFAULTS.transformFields,
    conflictResolution:
      parsed.conflictResolution ?? COLLABORATIVE_WORLD_TRAIT_DEFAULTS.conflictResolution,
    selectionLocks: parsed.selectionLocks ?? COLLABORATIVE_WORLD_TRAIT_DEFAULTS.selectionLocks,
    lockTtlMs: parsed.lockTtlMs ?? COLLABORATIVE_WORLD_TRAIT_DEFAULTS.lockTtlMs,
    presenceCursors:
      parsed.presenceCursors ?? COLLABORATIVE_WORLD_TRAIT_DEFAULTS.presenceCursors,
    cursorFrame: parsed.cursorFrame ?? COLLABORATIVE_WORLD_TRAIT_DEFAULTS.cursorFrame,
    presenceTimeoutMs:
      parsed.presenceTimeoutMs ?? COLLABORATIVE_WORLD_TRAIT_DEFAULTS.presenceTimeoutMs,
    concertBridge: parsed.concertBridge ?? COLLABORATIVE_WORLD_TRAIT_DEFAULTS.concertBridge,
    debugGhosts: parsed.debugGhosts ?? COLLABORATIVE_WORLD_TRAIT_DEFAULTS.debugGhosts,
    opLogLimit: parsed.opLogLimit ?? COLLABORATIVE_WORLD_TRAIT_DEFAULTS.opLogLimit,
  };
}

export function createCollaborativeWorldTraitConfig(
  rawConfig: Record<string, unknown>
): ResolvedCollaborativeWorldTraitConfig {
  const parsed = parseCollaborativeWorldTraitConfig(rawConfig);
  validateCollaborativeWorldTraitConfig(parsed);
  return resolveCollaborativeWorldTraitConfig(parsed);
}

export function createSelectionLock(
  entityId: string,
  ownerId: string,
  options: Partial<Pick<CollaborativeSelectionLock, 'lockId' | 'mode' | 'acquiredAt' | 'expiresAt' | 'version'>> & {
    ttlMs?: number;
  } = {}
): CollaborativeSelectionLock {
  const acquiredAt = options.acquiredAt ?? Date.now();
  const ttlMs = options.ttlMs ?? COLLABORATIVE_WORLD_TRAIT_DEFAULTS.lockTtlMs;
  return {
    entityId,
    ownerId,
    lockId: options.lockId ?? `${ownerId}:${entityId}:${acquiredAt}`,
    mode: options.mode ?? 'transform',
    acquiredAt,
    expiresAt: options.expiresAt ?? acquiredAt + ttlMs,
    version: options.version ?? 0,
  };
}

export function isSelectionLockActive(lock: CollaborativeSelectionLock, now = Date.now()): boolean {
  return lock.expiresAt > now;
}

export function decideTransformOp(
  op: CollaborativeTransformOp,
  locks: Iterable<CollaborativeSelectionLock>,
  config: Pick<ResolvedCollaborativeWorldTraitConfig, 'selectionLocks' | 'conflictResolution'>,
  now = Date.now()
): TransformOpDecision {
  if (!config.selectionLocks) {
    return { status: 'applied' };
  }

  const activeLock = Array.from(locks).find(
    (lock) => lock.entityId === op.entityId && isSelectionLockActive(lock, now)
  );

  if (!activeLock) {
    return config.conflictResolution === 'lock_required'
      ? { status: 'rejected', reason: 'missing_selection_lock' }
      : { status: 'applied' };
  }

  if (activeLock.ownerId === op.actorId || activeLock.lockId === op.lockId) {
    return { status: 'applied' };
  }

  if (config.conflictResolution === 'lamport_merge') {
    return { status: 'conflict', reason: 'remote_lock_present', blockingLock: activeLock };
  }

  return { status: 'rejected', reason: 'locked_by_another_actor', blockingLock: activeLock };
}

export function applyTransformOp(
  current: CollaborativeTransform,
  op: CollaborativeTransformOp
): CollaborativeTransform {
  return {
    ...current,
    [op.field]: op.value,
    version: Math.max(current.version ?? 0, op.baseVersion ?? 0) + 1,
    updatedBy: op.actorId,
    updatedAt: op.timestamp,
  };
}

export function pruneCollaborativePresence(
  presence: Iterable<CollaborativePresenceCursor>,
  now: number,
  timeoutMs: number
): CollaborativePresenceCursor[] {
  return Array.from(presence).filter((cursor) => now - cursor.lastSeen <= timeoutMs);
}

export function toUnrealConcertDescriptor(config: ResolvedCollaborativeWorldTraitConfig): Record<string, unknown> {
  return {
    protocol: 'unreal-concert-compatible',
    syncRateHz: config.syncRateHz,
    transactionStream: 'TransformDelta',
    selectionLockPolicy: config.selectionLocks ? config.conflictResolution : 'disabled',
    presence: {
      enabled: config.presenceCursors,
      frame: config.cursorFrame,
      timeoutMs: config.presenceTimeoutMs,
    },
    transformFields: config.transformFields,
    debugGhosts: config.debugGhosts,
  };
}

export const collaborativeWorldHandler: TraitHandler<CollaborativeWorldTraitConfig> = {
  name: 'collaborative_world',
  defaultConfig: COLLABORATIVE_WORLD_TRAIT_DEFAULTS,

  onAttach(node: HSPlusNode, config: CollaborativeWorldTraitConfig, context: TraitContext): void {
    const resolved = createCollaborativeWorldTraitConfig(config as Record<string, unknown>);
    const state: CollaborativeWorldState = {
      config: resolved,
      locks: new Map(),
      presence: new Map(),
      transforms: new Map(),
      opLog: [],
    };
    node.__collaborativeWorldState = state;
    context.emit?.('collaborative_world_init', {
      node,
      config: resolved,
      concert: toUnrealConcertDescriptor(resolved),
    });
  },

  onDetach(node: HSPlusNode, _config: CollaborativeWorldTraitConfig, context: TraitContext): void {
    context.emit?.('collaborative_world_detached', { node });
    delete node.__collaborativeWorldState;
  },

  onEvent(node: HSPlusNode, _config: CollaborativeWorldTraitConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__collaborativeWorldState as CollaborativeWorldState | undefined;
    if (!state) return;

    if (event.type === 'collaborative_world_acquire_lock') {
      const payload = event.payload as Record<string, unknown> | undefined;
      const entityId = String(payload?.entityId ?? '');
      const ownerId = String(payload?.ownerId ?? '');
      if (!entityId || !ownerId) return;
      const lock = createSelectionLock(entityId, ownerId, {
        mode: (payload?.mode as CollaborativeLockMode | undefined) ?? 'transform',
        ttlMs: state.config.lockTtlMs,
      });
      state.locks.set(entityId, lock);
      context.emit?.('collaborative_world_lock_acquired', { node, lock });
    } else if (event.type === 'collaborative_world_release_lock') {
      const payload = event.payload as Record<string, unknown> | undefined;
      const entityId = String(payload?.entityId ?? '');
      state.locks.delete(entityId);
      context.emit?.('collaborative_world_lock_released', { node, entityId });
    } else if (event.type === 'collaborative_world_presence_cursor') {
      const cursor = event.payload as CollaborativePresenceCursor | undefined;
      if (cursor?.actorId) {
        state.presence.set(cursor.actorId, cursor);
        context.emit?.('collaborative_world_presence_updated', { node, cursor });
      }
    } else if (event.type === 'collaborative_world_transform_op') {
      const op = event.payload as CollaborativeTransformOp | undefined;
      if (!op?.entityId || !op.actorId) return;
      const decision = decideTransformOp(op, state.locks.values(), state.config);
      if (decision.status === 'applied') {
        const current = state.transforms.get(op.entityId) ?? {};
        state.transforms.set(op.entityId, applyTransformOp(current, op));
        state.opLog.push(op);
        if (state.opLog.length > state.config.opLogLimit) {
          state.opLog.splice(0, state.opLog.length - state.config.opLogLimit);
        }
      }
      context.emit?.('collaborative_world_transform_decision', { node, op, decision });
    }
  },
};

export default {
  COLLABORATIVE_WORLD_TRAIT_DEFAULTS,
  parseCollaborativeWorldTraitConfig,
  validateCollaborativeWorldTraitConfig,
  resolveCollaborativeWorldTraitConfig,
  createCollaborativeWorldTraitConfig,
  createSelectionLock,
  isSelectionLockActive,
  decideTransformOp,
  applyTransformOp,
  pruneCollaborativePresence,
  toUnrealConcertDescriptor,
  collaborativeWorldHandler,
};
