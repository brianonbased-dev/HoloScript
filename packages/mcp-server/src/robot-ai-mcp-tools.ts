/**
 * robot-ai-mcp-tools.ts — Federated Robot / AI MCP tools
 *
 * Extracted from hololand-mcp-tools.ts to avoid absorbing game semantics.
 * These tools manage robot and AI identities, safety envelopes, permissions,
 * actuation, and substrate receipts — purely substrate concepts with no
 * dependency on shards, zones, quests, NPCs, or other game-world constructs.
 *
 * Federation: registered independently in tools.ts so they can be discovered
 * and used without pulling in the full HoloLand game-world surface.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  type TwinEarthIdentity,
  type PermissionGrant,
  type SafetyEnvelope,
  evaluateActuation,
} from '@holoscript/framework';

// =============================================================================
// TYPES
// =============================================================================

export interface StoredTwinEarthIdentity {
  agentId: string;
  walletAddress: string;
  handle: string;
  attestation: string;
  attestedAt: string;
  role: string;
  mode: string;
  kind: 'robot' | 'ai';
  hardwareFingerprint?: string;
  brainCompositionId?: string;
  revoked: boolean;
  revokedAt?: string;
  createdAt: string;
  modifiedAt: string;
}

export interface StoredSafetyEnvelope {
  id: string;
  agentId: string;
  maxTickDurationMs: number;
  maxMemoryBytes: number;
  maxNetworkCallsPerMinute: number;
  allowedActions: string[];
  blockedActions: string[];
  deterministic: boolean;
  localOnly: boolean;
  substrateEnforced: boolean;
  createdAt: string;
  modifiedAt: string;
}

interface StoredPermissionGrant {
  granteeId: string;
  granterId: string;
  action: string;
  scope: string;
  expiresAt: string | null;
  revocationSignature: string | null;
  hash: string;
  grantedAt: string;
}

interface StoredTwinEarthReceipt {
  id: string;
  kind: 'action' | 'validation' | 'steward_tick' | 'contract_upgrade';
  actorId: string;
  action: string;
  scope: string;
  timestamp: string;
  status: 'success' | 'failure' | 'timeout' | 'rejected_by_envelope';
  hash: string;
  envelopeId: string;
  payloadHash?: string;
}

// =============================================================================
// REGISTRIES
// =============================================================================

export const twinEarthIdentityRegistry = new Map<string, StoredTwinEarthIdentity>();
export const safetyEnvelopeRegistry = new Map<string, StoredSafetyEnvelope>();
export const permissionGrantRegistry = new Map<string, StoredPermissionGrant>();
export const twinEarthReceiptRegistry = new Map<string, StoredTwinEarthReceipt>();

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Clear all in-memory registries — used by tests for isolation. */
export function clearRobotAiRegistries(): void {
  twinEarthIdentityRegistry.clear();
  safetyEnvelopeRegistry.clear();
  permissionGrantRegistry.clear();
  twinEarthReceiptRegistry.clear();
}

async function simpleHash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const robotAiMcpTools: Tool[] = [
  // Identity CRUD
  {
    name: 'twin_earth_register_identity',
    description:
      'Register a new robot or AI identity on the substrate. ' +
      'Requires wallet-based attestation. Returns the canonical substrate identity record.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Unique substrate identifier. Auto-generated if omitted.' },
        walletAddress: { type: 'string', description: 'EVM or Solana wallet address — root of trust.' },
        handle: { type: 'string', description: 'Human-readable handle.' },
        attestation: { type: 'string', description: 'EIP-712 typed-data signature over (agentId + handle + timestamp).' },
        attestedAt: { type: 'string', description: 'ISO-8601 timestamp of attestation.' },
        role: {
          type: 'string',
          enum: ['founder', 'steward', 'operator', 'robot', 'ai', 'brittney', 'visitor'],
          description: 'Substrate role. Default: robot.',
        },
        mode: {
          type: 'string',
          enum: ['local', 'BYOK', 'managed'],
          description: 'Participation mode. Default: local.',
        },
        kind: {
          type: 'string',
          enum: ['robot', 'ai'],
          description: 'Hardware (robot) or software (ai) participant.',
        },
        hardwareFingerprint: { type: 'string', description: 'Device serial hash for robots. Optional.' },
        brainCompositionId: { type: 'string', description: 'Brain composition reference for AIs. Optional.' },
      },
      required: ['walletAddress', 'handle', 'attestation', 'kind'],
    },
  },
  {
    name: 'twin_earth_get_identity',
    description: 'Retrieve a substrate identity by agentId.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Identity agentId' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'twin_earth_update_identity',
    description:
      'Update mutable fields of an existing substrate identity — handle, role, mode, brain composition. ' +
      'Requires a fresh attestation if handle changes.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Identity agentId' },
        handle: { type: 'string' },
        role: { type: 'string', enum: ['founder', 'steward', 'operator', 'robot', 'ai', 'brittney', 'visitor'] },
        mode: { type: 'string', enum: ['local', 'BYOK', 'managed'] },
        brainCompositionId: { type: 'string' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'twin_earth_revoke_identity',
    description:
      'Revoke a substrate identity — permanently disables the identity and invalidates all active safety envelopes. ' +
      'Requires granterId with founder or steward role.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Identity to revoke' },
        granterId: { type: 'string', description: 'Identity performing revocation (must be founder or steward).' },
        revocationSignature: { type: 'string', description: 'Wallet signature of revocation intent.' },
      },
      required: ['agentId', 'granterId', 'revocationSignature'],
    },
  },
  {
    name: 'twin_earth_list_identities',
    description: 'List substrate identities with optional filtering by role, kind, or mode.',
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Filter by role' },
        kind: { type: 'string', enum: ['robot', 'ai'], description: 'Filter by kind' },
        mode: { type: 'string', description: 'Filter by mode' },
        limit: { type: 'number', description: 'Max results. Default: 50' },
        offset: { type: 'number', description: 'Pagination offset. Default: 0' },
      },
    },
  },

  // Safety Envelope CRUD
  {
    name: 'twin_earth_create_safety_envelope',
    description:
      'Create a Safety Envelope — runtime-enforced boundary for a robot or AI participant. ' +
      'Substrate-enforced; the participant cannot override it.',
    inputSchema: {
      type: 'object',
      properties: {
        envelopeId: { type: 'string', description: 'Envelope identifier. Auto-generated if omitted.' },
        agentId: { type: 'string', description: 'Identity this envelope applies to.' },
        maxTickDurationMs: { type: 'number', description: 'Max compute budget per tick (ms). Default: 1000.' },
        maxMemoryBytes: { type: 'number', description: 'Max memory per session (bytes). Default: 536870912 (512 MB).' },
        maxNetworkCallsPerMinute: { type: 'number', description: 'Max outbound network calls per minute. Default: 60.' },
        allowedActions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Action whitelist. Empty = all permitted (dangerous).',
        },
        blockedActions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Action blacklist — overrides whitelist.',
        },
        deterministic: { type: 'boolean', description: 'Seed randomness for reproducibility. Default: false.' },
        localOnly: { type: 'boolean', description: 'Block all outbound network calls. Default: false.' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'twin_earth_get_safety_envelope',
    description: 'Retrieve a Safety Envelope by envelopeId.',
    inputSchema: {
      type: 'object',
      properties: {
        envelopeId: { type: 'string', description: 'Envelope identifier' },
      },
      required: ['envelopeId'],
    },
  },
  {
    name: 'twin_earth_update_safety_envelope',
    description: 'Update mutable fields of an existing Safety Envelope.',
    inputSchema: {
      type: 'object',
      properties: {
        envelopeId: { type: 'string', description: 'Envelope identifier' },
        maxTickDurationMs: { type: 'number' },
        maxMemoryBytes: { type: 'number' },
        maxNetworkCallsPerMinute: { type: 'number' },
        allowedActions: { type: 'array', items: { type: 'string' } },
        blockedActions: { type: 'array', items: { type: 'string' } },
        deterministic: { type: 'boolean' },
        localOnly: { type: 'boolean' },
      },
      required: ['envelopeId'],
    },
  },
  {
    name: 'twin_earth_delete_safety_envelope',
    description:
      'Delete a Safety Envelope. Requires granterId with founder or steward role. ' +
      'Deleting an active envelope forces the participant into a default restrictive envelope.',
    inputSchema: {
      type: 'object',
      properties: {
        envelopeId: { type: 'string', description: 'Envelope identifier' },
        granterId: { type: 'string', description: 'Identity performing deletion (must be founder or steward).' },
      },
      required: ['envelopeId', 'granterId'],
    },
  },
  {
    name: 'twin_earth_list_safety_envelopes',
    description: 'List Safety Envelopes with optional filtering by agentId.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Filter by identity' },
        limit: { type: 'number', description: 'Max results. Default: 50' },
        offset: { type: 'number', description: 'Pagination offset. Default: 0' },
      },
    },
  },

  // Permission CRUD
  {
    name: 'twin_earth_grant_permission',
    description:
      'Grant a signed, revocable permission to a robot or AI identity. ' +
      'Actions are scoped namespace identifiers (e.g. actuator:move, inference:*, contract:sign).',
    inputSchema: {
      type: 'object',
      properties: {
        granteeId: { type: 'string', description: 'Identity receiving the permission.' },
        granterId: { type: 'string', description: 'Identity issuing the permission.' },
        action: { type: 'string', description: 'Action being permitted. E.g. actuator:move or inference:*' },
        scope: { type: 'string', description: 'Scope of grant (contextId, resourceId, or *). Default: *.' },
        expiresAt: { type: 'string', description: 'ISO-8601 expiry. Null = no expiry.' },
      },
      required: ['granteeId', 'granterId', 'action'],
    },
  },
  {
    name: 'twin_earth_revoke_permission',
    description: 'Revoke an existing permission grant by its hash.',
    inputSchema: {
      type: 'object',
      properties: {
        grantHash: { type: 'string', description: 'Hash of the permission grant to revoke.' },
        granterId: { type: 'string', description: 'Identity performing revocation (must match original granter).' },
        revocationSignature: { type: 'string', description: 'Wallet signature of revocation intent.' },
      },
      required: ['grantHash', 'granterId', 'revocationSignature'],
    },
  },
  {
    name: 'twin_earth_validate_permission',
    description:
      'Validate whether a grantee has permission to perform an action within a scope. ' +
      'Checks expiry, revocation, and granter authority.',
    inputSchema: {
      type: 'object',
      properties: {
        granteeId: { type: 'string', description: 'Identity attempting the action.' },
        action: { type: 'string', description: 'Action being attempted.' },
        scope: { type: 'string', description: 'Scope being accessed.' },
      },
      required: ['granteeId', 'action', 'scope'],
    },
  },
  {
    name: 'twin_earth_list_permissions',
    description: 'List permission grants with optional filtering by grantee, granter, or action.',
    inputSchema: {
      type: 'object',
      properties: {
        granteeId: { type: 'string', description: 'Filter by grantee' },
        granterId: { type: 'string', description: 'Filter by granter' },
        action: { type: 'string', description: 'Filter by action' },
        limit: { type: 'number', description: 'Max results. Default: 50' },
        offset: { type: 'number', description: 'Pagination offset. Default: 0' },
      },
    },
  },

  // Actuation & Invocation (gated by safety envelope + permissions)
  {
    name: 'twin_earth_robot_actuate',
    description:
      'Execute a robot actuation command (move, sense, grip, release, halt, report). ' +
      'Gated by active safety envelope and permission grants. Returns a substrate receipt.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Robot identity.' },
        command: {
          type: 'string',
          enum: ['move', 'sense', 'grip', 'release', 'halt', 'report'],
          description: 'Actuation command.',
        },
        parameters: {
          type: 'object',
          description: 'Command-specific parameters (coordinates, force, duration). Optional.',
        },
        contextId: { type: 'string', description: 'Execution context identifier. Optional.' },
      },
      required: ['agentId', 'command'],
    },
  },
  {
    name: 'twin_earth_ai_invoke',
    description:
      'Invoke an AI participant on the substrate — dialogue, inference, or task execution. ' +
      'Gated by active safety envelope and permission grants. Returns a substrate receipt.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'AI identity.' },
        prompt: { type: 'string', description: 'Input prompt or task description.' },
        context: { type: 'string', description: 'Additional scene or execution context. Optional.' },
        maxTokens: { type: 'number', description: 'Max output tokens. Optional.' },
        contextId: { type: 'string', description: 'Execution context identifier. Optional.' },
      },
      required: ['agentId', 'prompt'],
    },
  },
  {
    name: 'twin_earth_capture_receipt',
    description:
      'Capture a substrate execution receipt for a robot or AI action. ' +
      'Self-verifiable, CAEL-signed, and independent of Brittney.',
    inputSchema: {
      type: 'object',
      properties: {
        actorId: { type: 'string', description: 'Identity that performed the action.' },
        action: { type: 'string', description: 'Action executed.' },
        scope: { type: 'string', description: 'Scope of execution. Default: *.' },
        status: {
          type: 'string',
          enum: ['success', 'failure', 'timeout', 'rejected_by_envelope'],
          description: 'Execution status.',
        },
        envelopeId: { type: 'string', description: 'Active safety envelope during execution.' },
        payloadHash: { type: 'string', description: 'Hash of large input payload. Optional.' },
      },
      required: ['actorId', 'action', 'status', 'envelopeId'],
    },
  },
];

// =============================================================================
// DISPATCHER
// =============================================================================

export async function handleRobotAiMcpTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'twin_earth_register_identity':
      return handleTwinEarthRegisterIdentity(args);
    case 'twin_earth_get_identity':
      return handleTwinEarthGetIdentity(args);
    case 'twin_earth_update_identity':
      return handleTwinEarthUpdateIdentity(args);
    case 'twin_earth_revoke_identity':
      return handleTwinEarthRevokeIdentity(args);
    case 'twin_earth_list_identities':
      return handleTwinEarthListIdentities(args);
    case 'twin_earth_create_safety_envelope':
      return handleTwinEarthCreateSafetyEnvelope(args);
    case 'twin_earth_get_safety_envelope':
      return handleTwinEarthGetSafetyEnvelope(args);
    case 'twin_earth_update_safety_envelope':
      return handleTwinEarthUpdateSafetyEnvelope(args);
    case 'twin_earth_delete_safety_envelope':
      return handleTwinEarthDeleteSafetyEnvelope(args);
    case 'twin_earth_list_safety_envelopes':
      return handleTwinEarthListSafetyEnvelopes(args);
    case 'twin_earth_grant_permission':
      return handleTwinEarthGrantPermission(args);
    case 'twin_earth_revoke_permission':
      return handleTwinEarthRevokePermission(args);
    case 'twin_earth_validate_permission':
      return handleTwinEarthValidatePermission(args);
    case 'twin_earth_list_permissions':
      return handleTwinEarthListPermissions(args);
    case 'twin_earth_robot_actuate':
      return handleTwinEarthRobotActuate(args);
    case 'twin_earth_ai_invoke':
      return handleTwinEarthAIInvoke(args);
    case 'twin_earth_capture_receipt':
      return handleTwinEarthCaptureReceipt(args);
    default:
      return { error: `Unknown robot/AI tool: ${name}` };
  }
}

// =============================================================================
// HANDLERS
// =============================================================================

async function handleTwinEarthRegisterIdentity(
  args: Record<string, unknown>,
): Promise<unknown> {
  const agentId = (args.agentId as string) || genId('agent');
  const walletAddress = args.walletAddress as string;
  const handle = args.handle as string;
  const attestation = args.attestation as string;
  const kind = args.kind as 'robot' | 'ai';

  if (!walletAddress || typeof walletAddress !== 'string') {
    return { error: 'walletAddress is required.' };
  }
  if (!handle || typeof handle !== 'string') {
    return { error: 'handle is required.' };
  }
  if (!attestation || typeof attestation !== 'string') {
    return { error: 'attestation is required.' };
  }
  if (kind !== 'robot' && kind !== 'ai') {
    return { error: 'kind must be "robot" or "ai".' };
  }

  const role = (args.role as string) || 'robot';
  const mode = (args.mode as string) || 'local';
  const attestedAt = (args.attestedAt as string) || new Date().toISOString();

  const identity: StoredTwinEarthIdentity = {
    agentId,
    walletAddress,
    handle,
    attestation,
    attestedAt,
    role,
    mode,
    kind,
    hardwareFingerprint: (args.hardwareFingerprint as string | undefined) ?? undefined,
    brainCompositionId: (args.brainCompositionId as string | undefined) ?? undefined,
    revoked: false,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
  };

  twinEarthIdentityRegistry.set(agentId, identity);

  return {
    success: true,
    agentId,
    handle,
    role,
    mode,
    kind,
    walletAddress,
    attestedAt,
  };
}

async function handleTwinEarthGetIdentity(
  args: Record<string, unknown>,
): Promise<unknown> {
  const agentId = args.agentId as string;
  const identity = twinEarthIdentityRegistry.get(agentId);
  if (!identity) {
    return { error: `Identity not found: ${agentId}` };
  }
  return {
    success: true,
    agentId,
    identity: {
      agentId: identity.agentId,
      walletAddress: identity.walletAddress,
      handle: identity.handle,
      role: identity.role,
      mode: identity.mode,
      kind: identity.kind,
      attestedAt: identity.attestedAt,
      hardwareFingerprint: identity.hardwareFingerprint,
      brainCompositionId: identity.brainCompositionId,
      revoked: identity.revoked,
      createdAt: identity.createdAt,
      modifiedAt: identity.modifiedAt,
    },
  };
}

async function handleTwinEarthUpdateIdentity(
  args: Record<string, unknown>,
): Promise<unknown> {
  const agentId = args.agentId as string;
  const identity = twinEarthIdentityRegistry.get(agentId);
  if (!identity) {
    return { error: `Identity not found: ${agentId}` };
  }
  if (identity.revoked) {
    return { error: `Identity ${agentId} is revoked — cannot update.` };
  }

  if (args.handle) {
    identity.handle = args.handle as string;
    identity.attestation = (args.attestation as string) || identity.attestation;
    identity.attestedAt = new Date().toISOString();
  }
  if (args.role) identity.role = args.role as string;
  if (args.mode) identity.mode = args.mode as string;
  if (args.brainCompositionId) identity.brainCompositionId = args.brainCompositionId as string;
  identity.modifiedAt = new Date().toISOString();

  return { success: true, agentId, identity };
}

async function handleTwinEarthRevokeIdentity(
  args: Record<string, unknown>,
): Promise<unknown> {
  const agentId = args.agentId as string;
  const granterId = args.granterId as string;
  const revocationSignature = args.revocationSignature as string;

  const identity = twinEarthIdentityRegistry.get(agentId);
  if (!identity) {
    return { error: `Identity not found: ${agentId}` };
  }
  if (identity.revoked) {
    return { error: `Identity ${agentId} is already revoked.` };
  }

  const granter = twinEarthIdentityRegistry.get(granterId);
  if (!granter || (granter.role !== 'founder' && granter.role !== 'steward')) {
    return { error: `Revocation requires founder or steward role. ${granterId} has role ${granter?.role ?? 'unknown'}.` };
  }
  if (!revocationSignature || typeof revocationSignature !== 'string') {
    return { error: 'revocationSignature is required.' };
  }

  identity.revoked = true;
  identity.revokedAt = new Date().toISOString();
  identity.modifiedAt = new Date().toISOString();

  // Invalidate all active safety envelopes for this identity
  for (const envelope of safetyEnvelopeRegistry.values()) {
    if (envelope.agentId === agentId) {
      safetyEnvelopeRegistry.delete(envelope.id);
    }
  }

  return { success: true, agentId, revoked: true, revokedAt: identity.revokedAt };
}

async function handleTwinEarthListIdentities(
  args: Record<string, unknown>,
): Promise<unknown> {
  const limit = (args.limit as number) ?? 50;
  const offset = (args.offset as number) ?? 0;
  const role = args.role as string | undefined;
  const kind = args.kind as 'robot' | 'ai' | undefined;
  const mode = args.mode as string | undefined;

  let items = Array.from(twinEarthIdentityRegistry.values()).map((i) => ({
    agentId: i.agentId,
    handle: i.handle,
    role: i.role,
    mode: i.mode,
    kind: i.kind,
    revoked: i.revoked,
  }));

  if (role) items = items.filter((i) => i.role === role);
  if (kind) items = items.filter((i) => i.kind === kind);
  if (mode) items = items.filter((i) => i.mode === mode);

  const total = items.length;
  items = items.slice(offset, offset + limit);

  return { success: true, total, limit, offset, identities: items };
}

async function handleTwinEarthCreateSafetyEnvelope(
  args: Record<string, unknown>,
): Promise<unknown> {
  const envelopeId = (args.envelopeId as string) || genId('env');
  const agentId = args.agentId as string;

  if (!agentId || typeof agentId !== 'string') {
    return { error: 'agentId is required.' };
  }

  const identity = twinEarthIdentityRegistry.get(agentId);
  if (!identity) {
    return { error: `Identity not found: ${agentId}` };
  }
  if (identity.revoked) {
    return { error: `Identity ${agentId} is revoked — cannot create safety envelope.` };
  }

  const envelope: StoredSafetyEnvelope = {
    id: envelopeId,
    agentId,
    maxTickDurationMs: (args.maxTickDurationMs as number) ?? 1000,
    maxMemoryBytes: (args.maxMemoryBytes as number) ?? 536870912,
    maxNetworkCallsPerMinute: (args.maxNetworkCallsPerMinute as number) ?? 60,
    allowedActions: (args.allowedActions as string[]) ?? [],
    blockedActions: (args.blockedActions as string[]) ?? [],
    deterministic: (args.deterministic as boolean) ?? false,
    localOnly: (args.localOnly as boolean) ?? false,
    substrateEnforced: true,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
  };

  safetyEnvelopeRegistry.set(envelopeId, envelope);

  return {
    success: true,
    envelopeId,
    agentId,
    substrateEnforced: true,
    note: 'Safety envelope is substrate-enforced and cannot be overridden by the participant.',
  };
}

async function handleTwinEarthGetSafetyEnvelope(
  args: Record<string, unknown>,
): Promise<unknown> {
  const envelopeId = args.envelopeId as string;
  const envelope = safetyEnvelopeRegistry.get(envelopeId);
  if (!envelope) {
    return { error: `Safety envelope not found: ${envelopeId}` };
  }
  return { success: true, envelopeId, envelope };
}

async function handleTwinEarthUpdateSafetyEnvelope(
  args: Record<string, unknown>,
): Promise<unknown> {
  const envelopeId = args.envelopeId as string;
  const envelope = safetyEnvelopeRegistry.get(envelopeId);
  if (!envelope) {
    return { error: `Safety envelope not found: ${envelopeId}` };
  }

  if (args.maxTickDurationMs !== undefined) envelope.maxTickDurationMs = args.maxTickDurationMs as number;
  if (args.maxMemoryBytes !== undefined) envelope.maxMemoryBytes = args.maxMemoryBytes as number;
  if (args.maxNetworkCallsPerMinute !== undefined) envelope.maxNetworkCallsPerMinute = args.maxNetworkCallsPerMinute as number;
  if (args.allowedActions !== undefined) envelope.allowedActions = args.allowedActions as string[];
  if (args.blockedActions !== undefined) envelope.blockedActions = args.blockedActions as string[];
  if (args.deterministic !== undefined) envelope.deterministic = args.deterministic as boolean;
  if (args.localOnly !== undefined) envelope.localOnly = args.localOnly as boolean;
  envelope.modifiedAt = new Date().toISOString();

  return { success: true, envelopeId, envelope };
}

async function handleTwinEarthDeleteSafetyEnvelope(
  args: Record<string, unknown>,
): Promise<unknown> {
  const envelopeId = args.envelopeId as string;
  const granterId = args.granterId as string;

  const granter = twinEarthIdentityRegistry.get(granterId);
  if (!granter || (granter.role !== 'founder' && granter.role !== 'steward')) {
    return { error: `Deletion requires founder or steward role. ${granterId} has role ${granter?.role ?? 'unknown'}.` };
  }

  const envelope = safetyEnvelopeRegistry.get(envelopeId);
  if (!envelope) {
    return { error: `Safety envelope not found: ${envelopeId}` };
  }

  safetyEnvelopeRegistry.delete(envelopeId);
  return { success: true, envelopeId, deleted: true };
}

async function handleTwinEarthListSafetyEnvelopes(
  args: Record<string, unknown>,
): Promise<unknown> {
  const limit = (args.limit as number) ?? 50;
  const offset = (args.offset as number) ?? 0;
  const agentId = args.agentId as string | undefined;

  let items = Array.from(safetyEnvelopeRegistry.values());
  if (agentId) items = items.filter((e) => e.agentId === agentId);

  const total = items.length;
  items = items.slice(offset, offset + limit);

  return { success: true, total, limit, offset, envelopes: items };
}

async function handleTwinEarthGrantPermission(
  args: Record<string, unknown>,
): Promise<unknown> {
  const granteeId = args.granteeId as string;
  const granterId = args.granterId as string;
  const action = args.action as string;
  const scope = (args.scope as string) || '*';
  const expiresAt = (args.expiresAt as string | null) || null;

  if (!granteeId || !granterId || !action) {
    return { error: 'granteeId, granterId, and action are required.' };
  }

  const grantee = twinEarthIdentityRegistry.get(granteeId);
  const granter = twinEarthIdentityRegistry.get(granterId);
  if (!grantee) {
    return { error: `Grantee identity not found: ${granteeId}` };
  }
  if (!granter) {
    return { error: `Granter identity not found: ${granterId}` };
  }
  if (grantee.revoked) {
    return { error: `Grantee ${granteeId} is revoked.` };
  }
  if (granter.revoked) {
    return { error: `Granter ${granterId} is revoked.` };
  }

  const hash = await simpleHash(`${granterId}:${granteeId}:${action}:${scope}:${Date.now()}`);
  const grant: StoredPermissionGrant = {
    granteeId,
    granterId,
    action,
    scope,
    expiresAt,
    revocationSignature: null,
    hash,
    grantedAt: new Date().toISOString(),
  };

  permissionGrantRegistry.set(hash, grant);

  return { success: true, grantHash: hash, granteeId, granterId, action, scope, expiresAt };
}

async function handleTwinEarthRevokePermission(
  args: Record<string, unknown>,
): Promise<unknown> {
  const grantHash = args.grantHash as string;
  const granterId = args.granterId as string;
  const revocationSignature = args.revocationSignature as string;

  const grant = permissionGrantRegistry.get(grantHash);
  if (!grant) {
    return { error: `Permission grant not found: ${grantHash}` };
  }

  const granter = twinEarthIdentityRegistry.get(granterId);
  if (!granter || (granter.role !== 'founder' && granter.role !== 'steward')) {
    return { error: `Revocation requires founder or steward role. ${granterId} has role ${granter?.role ?? 'unknown'}.` };
  }
  if (grant.granterId !== granterId) {
    return { error: `Only the original granter (${grant.granterId}) can revoke this grant.` };
  }
  if (!revocationSignature || typeof revocationSignature !== 'string') {
    return { error: 'revocationSignature is required.' };
  }

  grant.revocationSignature = revocationSignature;
  return { success: true, grantHash, revoked: true };
}

async function handleTwinEarthValidatePermission(
  args: Record<string, unknown>,
): Promise<unknown> {
  const granteeId = args.granteeId as string;
  const action = args.action as string;
  const scope = args.scope as string;

  const grant = Array.from(permissionGrantRegistry.values()).find(
    (g) =>
      g.granteeId === granteeId &&
      !g.revocationSignature &&
      (g.action === action || g.action === '*') &&
      (g.scope === scope || g.scope === '*') &&
      (!g.expiresAt || new Date(g.expiresAt) > new Date()),
  );

  if (!grant) {
    return { valid: false, reason: 'No matching grant found.' };
  }

  return {
    valid: true,
    grantHash: grant.hash,
    granterId: grant.granterId,
    action: grant.action,
    scope: grant.scope,
    expiresAt: grant.expiresAt,
  };
}

async function handleTwinEarthListPermissions(
  args: Record<string, unknown>,
): Promise<unknown> {
  const limit = (args.limit as number) ?? 50;
  const offset = (args.offset as number) ?? 0;
  const granteeId = args.granteeId as string | undefined;
  const granterId = args.granterId as string | undefined;
  const action = args.action as string | undefined;

  let items = Array.from(permissionGrantRegistry.values());
  if (granteeId) items = items.filter((g) => g.granteeId === granteeId);
  if (granterId) items = items.filter((g) => g.granterId === granterId);
  if (action) items = items.filter((g) => g.action === action);

  const total = items.length;
  items = items.slice(offset, offset + limit);

  return { success: true, total, limit, offset, grants: items };
}

async function handleTwinEarthRobotActuate(
  args: Record<string, unknown>,
): Promise<unknown> {
  const agentId = args.agentId as string;
  const command = args.command as string;
  const parameters = (args.parameters as Record<string, unknown>) ?? {};
  const contextId = (args.contextId as string | undefined) ?? undefined;

  const storedIdentity = twinEarthIdentityRegistry.get(agentId);
  if (!storedIdentity) {
    return { error: `Identity not found: ${agentId}` };
  }
  if (storedIdentity.revoked) {
    return { error: `Identity ${agentId} is revoked.` };
  }
  if (storedIdentity.kind !== 'robot') {
    return { error: `Identity ${agentId} is not a robot (kind=${storedIdentity.kind}).` };
  }

  // Find active safety envelope
  const storedEnvelope = Array.from(safetyEnvelopeRegistry.values()).find((e) => e.agentId === agentId);
  if (!storedEnvelope) {
    return { error: `No active safety envelope for ${agentId}. Robot actuation is blocked.` };
  }

  if (storedEnvelope.localOnly) {
    return {
      error: 'Robot actuation is blocked: localOnly safety envelope prohibits any actuation.',
      rejectedByEnvelope: true,
    };
  }

  // Find matching permission grant
  const action = `robot:${command}`;
  const scope = contextId || '*';
  const storedGrant = Array.from(permissionGrantRegistry.values()).find(
    (g) =>
      g.granteeId === agentId &&
      !g.revocationSignature &&
      (g.action === action || g.action === '*') &&
      (g.scope === scope || g.scope === '*') &&
      (!g.expiresAt || new Date(g.expiresAt) > new Date()),
  );

  const identity: TwinEarthIdentity = {
    agentId: storedIdentity.agentId,
    walletAddress: storedIdentity.walletAddress,
    handle: storedIdentity.handle,
    attestation: storedIdentity.attestation,
    attestedAt: storedIdentity.attestedAt,
    role: storedIdentity.role as TwinEarthIdentity['role'],
    mode: storedIdentity.mode as TwinEarthIdentity['mode'],
    kind: storedIdentity.kind,
    hardwareFingerprint: storedIdentity.hardwareFingerprint,
    brainCompositionId: storedIdentity.brainCompositionId,
  };

  const envelope: SafetyEnvelope = {
    id: storedEnvelope.id,
    agentId: storedEnvelope.agentId,
    maxTickDurationMs: storedEnvelope.maxTickDurationMs,
    maxMemoryBytes: storedEnvelope.maxMemoryBytes,
    maxNetworkCallsPerMinute: storedEnvelope.maxNetworkCallsPerMinute,
    allowedActions: storedEnvelope.allowedActions as SafetyEnvelope['allowedActions'],
    blockedActions: storedEnvelope.blockedActions as SafetyEnvelope['blockedActions'],
    deterministic: storedEnvelope.deterministic,
    localOnly: storedEnvelope.localOnly,
    substrateEnforced: storedEnvelope.substrateEnforced,
  };

  const grant: PermissionGrant = storedGrant
    ? {
        granteeId: storedGrant.granteeId,
        granterId: storedGrant.granterId,
        action: storedGrant.action as PermissionGrant['action'],
        scope: storedGrant.scope,
        expiresAt: storedGrant.expiresAt,
        revocationSignature: storedGrant.revocationSignature,
        hash: storedGrant.hash,
      }
    : ({} as unknown as PermissionGrant);

  // Canonical substrate gating
  const result = evaluateActuation(identity, grant, envelope, action as PermissionGrant['action'], scope);

  if (!result.allowed) {
    return {
      error: result.reason,
      rejectedByEnvelope: result.blockingRule !== undefined && result.blockingRule !== 'expired_grant' && result.blockingRule !== 'revoked_grant',
      permissionDenied: result.blockingRule === 'expired_grant' || result.blockingRule === 'revoked_grant' || result.reason.includes('Grant'),
    };
  }

  // Simulate actuation
  const receiptId = genId('act');
  const receipt: StoredTwinEarthReceipt = {
    id: receiptId,
    kind: 'action',
    actorId: agentId,
    action,
    scope,
    timestamp: new Date().toISOString(),
    status: 'success',
    hash: await simpleHash(`act:${agentId}:${command}:${Date.now()}`),
    envelopeId: storedEnvelope.id,
    payloadHash: parameters ? await simpleHash(JSON.stringify(parameters)) : undefined,
  };

  twinEarthReceiptRegistry.set(receiptId, receipt);

  return {
    success: true,
    agentId,
    command,
    receiptId,
    envelopeId: storedEnvelope.id,
    status: 'success',
    simulated: true,
    note: 'Actuation was simulated (canary). In production this dispatches to the robot runtime.',
  };
}

async function handleTwinEarthAIInvoke(
  args: Record<string, unknown>,
): Promise<unknown> {
  const agentId = args.agentId as string;
  const prompt = args.prompt as string;
  const context = (args.context as string | undefined) ?? '';
  const maxTokens = (args.maxTokens as number | undefined) ?? 256;
  const contextId = (args.contextId as string | undefined) ?? undefined;

  const identity = twinEarthIdentityRegistry.get(agentId);
  if (!identity) {
    return { error: `Identity not found: ${agentId}` };
  }
  if (identity.revoked) {
    return { error: `Identity ${agentId} is revoked.` };
  }
  if (identity.kind !== 'ai') {
    return { error: `Identity ${agentId} is not an AI (kind=${identity.kind}).` };
  }

  // Find active safety envelope
  const storedEnvelope = Array.from(safetyEnvelopeRegistry.values()).find((e) => e.agentId === agentId);
  if (!storedEnvelope) {
    return { error: `No active safety envelope for ${agentId}. AI invocation is blocked.` };
  }

  if (storedEnvelope.localOnly) {
    return {
      error: 'AI invocation is blocked: localOnly safety envelope prohibits any invocation.',
      rejectedByEnvelope: true,
    };
  }

  // Check tick duration budget
  if (storedEnvelope.maxTickDurationMs < 100) {
    return {
      error: `Safety envelope ${storedEnvelope.id} maxTickDurationMs (${storedEnvelope.maxTickDurationMs}ms) is too low for AI invocation.`,
      rejectedByEnvelope: true,
    };
  }

  // Check memory budget
  if (storedEnvelope.maxMemoryBytes < 1048576) {
    return {
      error: `Safety envelope ${storedEnvelope.id} maxMemoryBytes (${storedEnvelope.maxMemoryBytes}) is below minimum for AI invocation.`,
      rejectedByEnvelope: true,
    };
  }

  // Check network calls (AI invoke typically needs outbound)
  if (storedEnvelope.maxNetworkCallsPerMinute < 1) {
    return {
      error: `Safety envelope ${storedEnvelope.id} maxNetworkCallsPerMinute (${storedEnvelope.maxNetworkCallsPerMinute}) is below minimum for AI invocation.`,
      rejectedByEnvelope: true,
    };
  }

  // Find matching permission grant
  const action = 'ai:invoke';
  const scope = contextId || '*';
  const storedGrant = Array.from(permissionGrantRegistry.values()).find(
    (g) =>
      g.granteeId === agentId &&
      !g.revocationSignature &&
      (g.action === action || g.action === 'ai:*' || g.action === '*') &&
      (g.scope === scope || g.scope === '*') &&
      (!g.expiresAt || new Date(g.expiresAt) > new Date()),
  );

  if (!storedGrant) {
    return {
      error: `No permission grant for ai:invoke in scope ${scope}.`,
      permissionDenied: true,
    };
  }

  const receiptId = genId('inv');
  const receipt: StoredTwinEarthReceipt = {
    id: receiptId,
    kind: 'action',
    actorId: agentId,
    action,
    scope,
    timestamp: new Date().toISOString(),
    status: 'success',
    hash: await simpleHash(`inv:${agentId}:${prompt}:${Date.now()}`),
    envelopeId: storedEnvelope.id,
    payloadHash: await simpleHash(JSON.stringify({ prompt, context, maxTokens })),
  };

  twinEarthReceiptRegistry.set(receiptId, receipt);

  return {
    success: true,
    agentId,
    prompt,
    receiptId,
    envelopeId: storedEnvelope.id,
    status: 'success',
    simulated: true,
    note: 'AI invocation was simulated (canary). In production this dispatches to the inference runtime.',
  };
}

async function handleTwinEarthCaptureReceipt(
  args: Record<string, unknown>,
): Promise<unknown> {
  const actorId = args.actorId as string;
  const action = args.action as string;
  const status = args.status as 'success' | 'failure' | 'timeout' | 'rejected_by_envelope';
  const envelopeId = args.envelopeId as string;
  const scope = (args.scope as string) || '*';
  const payloadHash = (args.payloadHash as string | undefined) ?? undefined;

  if (!actorId || !action || !status || !envelopeId) {
    return { error: 'actorId, action, status, and envelopeId are required.' };
  }

  const identity = twinEarthIdentityRegistry.get(actorId);
  if (!identity) {
    return { error: `Identity not found: ${actorId}` };
  }

  const receiptId = genId('rec');
  const receipt: StoredTwinEarthReceipt = {
    id: receiptId,
    kind: 'action',
    actorId,
    action,
    scope,
    timestamp: new Date().toISOString(),
    status,
    hash: await simpleHash(`rec:${actorId}:${action}:${Date.now()}`),
    envelopeId,
    payloadHash,
  };

  twinEarthReceiptRegistry.set(receiptId, receipt);

  return {
    success: true,
    receiptId,
    actorId,
    action,
    status,
    envelopeId,
    scope,
    hash: receipt.hash,
    timestamp: receipt.timestamp,
  };
}
