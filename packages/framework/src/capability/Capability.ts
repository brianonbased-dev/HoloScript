/**
 * Unified Capability Schema — Canonical Base + Context Extensions
 *
 * Addresses fragmentation across the HoloScript framework:
 *   - agents/AgentManifest.ts    :: AgentCapability (rich, 12 fields)
 *   - mesh/index.ts              :: AgentCapability (minimal, 3 fields) — NAME COLLISION
 *   - board/agent-steward.ts     :: StewardCapability
 *   - holoshell-human-os-frontier :: .hsplus capability blocks (no TS type)
 *
 * Design: single base Capability interface that all domains extend.
 * Eliminates the AgentCapability name collision by renaming the mesh
 * minimal shape to MeshCapability.
 *
 * Phase 1: canonical type definitions + validators + tests.
 * Phase 2: refactor existing modules to extend these types (migration).
 */

import type {
  TrustLevel,
  ResourceCost,
  LatencyProfile,
  CapabilityType,
  CapabilityDomain,
} from '../agents/AgentManifest';

// Re-export the dependency types so consumers can pull everything from
// @holoscript/framework/capability without reaching into agents/.
export type { TrustLevel, ResourceCost, LatencyProfile };

// ============================================================================
// BASE CAPABILITY
// ============================================================================

/** Canonical capability kind — contexts narrow this to their own enums. */
export type CapabilityKind = string;

/**
 * Every capability in the HoloScript ecosystem shares this spine.
 *
 * Contexts extend this interface and narrow `kind` to their own enums.
 * The base intentionally omits operational/runtime fields (cost, latency,
 * permissions, receipt expectations) — those live in extensions.
 */
export interface Capability {
  /** Stable identifier. Recommended: `<context>:<kind>:<name>` e.g. `agent:render:visual-synth`. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Longer description (keep under ~200 chars by convention). */
  description?: string;
  /** Semantic version of this capability definition. */
  version?: string;
  /** Capability kind — domain-specific enum or free-form string. */
  kind: CapabilityKind;
  /** Optional cross-cutting domain label (e.g. 'vision', 'nlp', 'spatial'). */
  domain?: string;
  /** Arbitrary extensibility. */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// AGENT EXTENSION
// ============================================================================

/**
 * Rich agent capability — extends base with runtime/operational metadata.
 *
 * Replaces the 12-field AgentCapability from agents/AgentManifest.ts.
 * In Phase 2, agents/AgentManifest.ts will import and re-export this shape
 * (or extend it) so there is a single source of truth.
 */
export interface AgentCapability extends Capability {
  kind: CapabilityType | string;
  domain: CapabilityDomain | string;
  /** Resource cost profile (0–100 scale per axis, plus optional token budget). */
  cost?: Partial<ResourceCost>;
  /** Expected latency bucket. */
  latency?: LatencyProfile;
  /** MIME types or schema names the capability accepts. */
  inputs?: string[];
  /** MIME type or schema name the capability produces. */
  output?: string;
  /** Whether the capability is currently online/available. */
  available?: boolean;
  /** Priority for conflict resolution (higher = preferred). */
  priority?: number;
}

/** Convenience union for agent-kind literals (re-exported from AgentManifest). */
export { CapabilityType as AgentCapabilityType, CapabilityDomain as AgentCapabilityDomain };

// ============================================================================
// STEWARD EXTENSION
// ============================================================================

/** Steward capability kinds — verbs a steward is willing to take responsibility for. */
export type StewardCapabilityKind =
  | 'spawn-encounter'
  | 'gate-quest'
  | 'reward-issue'
  | 'mod-action'
  | 'economy-tune'
  | 'world-event'
  | 'governance-vote'
  | 'capability-other';

/**
 * HoloLand steward capability — extends base with governance metadata.
 *
 * Replaces the StewardCapability from board/agent-steward.ts.
 */
export interface StewardCapability extends Capability {
  kind: StewardCapabilityKind;
  /** Free-form label when kind is capability-other. */
  label?: string;
  /** Skill ids (from frontier-shard.ts) that gate this capability. */
  requiredSkillIds?: string[];
}

// ============================================================================
// HOLOSHELL EXTENSION
// ============================================================================

/** UCAN-style permission slice for HoloShell legacy-app absorption. */
export interface ShellPermission {
  /** Resource URI the permission applies to. */
  with: string;
  /** Action permitted on the resource. */
  can: string;
  /** Non-negotiable constraints (UCAN `nb`). */
  nb?: Record<string, unknown>;
}

/** Receipt expectation contract for a HoloShell capability. */
export interface ReceiptExpectation {
  /** Schema version. */
  schema: string;
  /** Artifact keys that must be present in the receipt. */
  requiredArtifacts: string[];
  /** Ordered lifecycle stages. */
  lifecycle: string[];
  /** Condition string that triggers automatic rollback. */
  rollbackTrigger?: string;
  /** Minimum confidence for vision/UIA fallbacks. */
  confidenceThreshold?: number;
  /** Whether human approval is required before committing. */
  humanApprovalGate?: boolean;
}

/**
 * HoloShell legacy-app absorption capability — extends base with trust,
 * permissions, receipt contract, and sovereign replacement roadmap.
 *
 * This is the TypeScript counterpart to the `.hsplus` capability blocks
 * described in experiments/holoshell-human-os-frontier/legacy-absorption-paths.md.
 * Previously had no canonical TS type.
 */
export interface ShellCapability extends Capability {
  /** Where the capability comes from. */
  agentSource: 'native-api' | 'cli' | 'browser' | 'ui-automation';
  /** Trust floor for this absorption path. */
  trustState: TrustLevel;
  /** UCAN permission grants. */
  permissions: ShellPermission[];
  /** Receipt contract. */
  receiptExpectation: ReceiptExpectation;
  /** Sovereign HoloScript primitive that will eventually replace this. */
  replacementPath?: string;
}

// ============================================================================
// MESH / A2A EXTENSION
// ============================================================================

/**
 * Minimal capability descriptor for A2A agent-card interoperability.
 *
 * Replaces the 3-field `AgentCapability` in mesh/index.ts that collided
 * with the 12-field `AgentCapability` in agents/AgentManifest.ts.
 * The collision is resolved by renaming the mesh shape to MeshCapability.
 */
export interface MeshCapability extends Capability {
  /** Optional tags for mesh discovery filtering. */
  tags?: string[];
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

const STEWARD_KINDS: readonly string[] = [
  'spawn-encounter',
  'gate-quest',
  'reward-issue',
  'mod-action',
  'economy-tune',
  'world-event',
  'governance-vote',
  'capability-other',
];

const SHELL_SOURCES: readonly string[] = ['native-api', 'cli', 'browser', 'ui-automation'];

export function isAgentCapability(cap: Capability): cap is AgentCapability {
  return 'cost' in cap || 'latency' in cap || 'inputs' in cap || 'output' in cap;
}

export function isStewardCapability(cap: Capability): cap is StewardCapability {
  return STEWARD_KINDS.includes(cap.kind);
}

export function isShellCapability(cap: Capability): cap is ShellCapability {
  return 'agentSource' in cap && 'permissions' in cap && 'receiptExpectation' in cap;
}

export function isMeshCapability(cap: Capability): cap is MeshCapability {
  // Mesh is the minimal extension — only positive if it lacks fields from richer extensions
  return !isAgentCapability(cap) && !isStewardCapability(cap) && !isShellCapability(cap);
}

// ============================================================================
// VALIDATORS
// ============================================================================

export function validateCapability(cap: Capability): string[] {
  const errors: string[] = [];
  if (!cap.id) errors.push('Capability.id is required.');
  if (!cap.name) errors.push(`Capability ${cap.id ?? '<unknown>'}.name is required.`);
  if (!cap.kind) errors.push(`Capability ${cap.id ?? '<unknown>'}.kind is required.`);
  return errors;
}

export function validateAgentCapability(cap: AgentCapability): string[] {
  const errors = validateCapability(cap);
  if (!cap.domain) errors.push(`AgentCapability ${cap.id}.domain is required.`);
  if (cap.cost) {
    if (typeof cap.cost.compute !== 'number')
      errors.push(`AgentCapability ${cap.id}.cost.compute must be a number.`);
    if (typeof cap.cost.memory !== 'number')
      errors.push(`AgentCapability ${cap.id}.cost.memory must be a number.`);
    if (typeof cap.cost.network !== 'number')
      errors.push(`AgentCapability ${cap.id}.cost.network must be a number.`);
  }
  if (cap.latency && !['instant', 'fast', 'medium', 'slow', 'background'].includes(cap.latency)) {
    errors.push(`AgentCapability ${cap.id}.latency is unsupported: ${cap.latency}.`);
  }
  return errors;
}

export function validateStewardCapability(cap: StewardCapability): string[] {
  const errors = validateCapability(cap);
  if (!STEWARD_KINDS.includes(cap.kind)) {
    errors.push(`StewardCapability ${cap.id}.kind is unsupported: ${cap.kind}.`);
  }
  if (cap.kind === 'capability-other' && !cap.label) {
    errors.push(`StewardCapability ${cap.id} kind=capability-other requires label.`);
  }
  return errors;
}

export function validateShellPermission(p: ShellPermission): string[] {
  const errors: string[] = [];
  if (!p.with) errors.push('ShellPermission.with is required.');
  if (!p.can) errors.push('ShellPermission.can is required.');
  return errors;
}

export function validateReceiptExpectation(r: ReceiptExpectation): string[] {
  const errors: string[] = [];
  if (!r.schema) errors.push('ReceiptExpectation.schema is required.');
  if (!Array.isArray(r.requiredArtifacts) || r.requiredArtifacts.length === 0) {
    errors.push('ReceiptExpectation.requiredArtifacts must be a non-empty array.');
  }
  if (!Array.isArray(r.lifecycle) || r.lifecycle.length === 0) {
    errors.push('ReceiptExpectation.lifecycle must be a non-empty array.');
  }
  return errors;
}

export function validateShellCapability(cap: ShellCapability): string[] {
  const errors = validateCapability(cap);
  if (!SHELL_SOURCES.includes(cap.agentSource)) {
    errors.push(`ShellCapability ${cap.id}.agentSource is unsupported: ${cap.agentSource}.`);
  }
  const levels: readonly string[] = ['local', 'verified', 'known', 'external', 'untrusted'];
  if (!levels.includes(cap.trustState)) {
    errors.push(`ShellCapability ${cap.id}.trustState is unsupported: ${cap.trustState}.`);
  }
  if (!Array.isArray(cap.permissions) || cap.permissions.length === 0) {
    errors.push(`ShellCapability ${cap.id}.permissions must be a non-empty array.`);
  } else {
    for (let i = 0; i < cap.permissions.length; i++) {
      for (const e of validateShellPermission(cap.permissions[i])) {
        errors.push(`ShellCapability ${cap.id}.permissions[${i}]: ${e}`);
      }
    }
  }
  if (!cap.receiptExpectation) {
    errors.push(`ShellCapability ${cap.id}.receiptExpectation is required.`);
  } else {
    for (const e of validateReceiptExpectation(cap.receiptExpectation)) {
      errors.push(`ShellCapability ${cap.id}.receiptExpectation: ${e}`);
    }
  }
  return errors;
}

export function validateMeshCapability(cap: MeshCapability): string[] {
  return validateCapability(cap);
}

// ============================================================================
// CLONING
// ============================================================================

export function cloneCapability<T extends Capability>(cap: T): T {
  return {
    ...cap,
    metadata: cap.metadata ? { ...cap.metadata } : undefined,
  } as T;
}

export function cloneAgentCapability(cap: AgentCapability): AgentCapability {
  return {
    ...cloneCapability(cap),
    cost: cap.cost ? { ...cap.cost } : undefined,
    inputs: cap.inputs ? [...cap.inputs] : undefined,
  };
}

export function cloneStewardCapability(cap: StewardCapability): StewardCapability {
  return {
    ...cloneCapability(cap),
    requiredSkillIds: cap.requiredSkillIds ? [...cap.requiredSkillIds] : undefined,
  };
}

export function cloneShellPermission(p: ShellPermission): ShellPermission {
  return {
    ...p,
    nb: p.nb ? { ...p.nb } : undefined,
  };
}

export function cloneReceiptExpectation(r: ReceiptExpectation): ReceiptExpectation {
  return {
    ...r,
    requiredArtifacts: [...r.requiredArtifacts],
    lifecycle: [...r.lifecycle],
  };
}

export function cloneShellCapability(cap: ShellCapability): ShellCapability {
  return {
    ...cloneCapability(cap),
    permissions: cap.permissions.map(cloneShellPermission),
    receiptExpectation: cloneReceiptExpectation(cap.receiptExpectation),
  };
}

export function cloneMeshCapability(cap: MeshCapability): MeshCapability {
  return {
    ...cloneCapability(cap),
    tags: cap.tags ? [...cap.tags] : undefined,
  };
}
