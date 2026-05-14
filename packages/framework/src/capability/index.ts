/**
 * @holoscript/framework/capability
 *
 * Unified Capability Schema — canonical base + context extensions.
 *
 * See research/2026-05-14_reusable-capability-schema-proposal.md for
 * design rationale and migration path.
 */

export type { TrustLevel, ResourceCost, LatencyProfile } from '../agents/AgentManifest';

export {
  CapabilityType as AgentCapabilityType,
  CapabilityDomain as AgentCapabilityDomain,
} from '../agents/AgentManifest';

export type {
  CapabilityKind,
  Capability,
  AgentCapability,
  StewardCapability,
  StewardCapabilityKind,
  ShellPermission,
  ReceiptExpectation,
  ShellCapability,
  MeshCapability,
} from './Capability';

export {
  isAgentCapability,
  isStewardCapability,
  isShellCapability,
  isMeshCapability,
  validateCapability,
  validateAgentCapability,
  validateStewardCapability,
  validateShellPermission,
  validateReceiptExpectation,
  validateShellCapability,
  validateMeshCapability,
  cloneCapability,
  cloneAgentCapability,
  cloneStewardCapability,
  cloneShellPermission,
  cloneReceiptExpectation,
  cloneShellCapability,
  cloneMeshCapability,
} from './Capability';
