/**
 * Amazon Bedrock AgentCore adapter contract (CG-025).
 *
 * HoloScript does not treat AWS as the source of truth for agent identity,
 * memory, or policy. This module defines the STATIC MAPPING between a
 * HoloScript-native agent (HoloMesh identity + x402 seat + CAEL evidence) and
 * the AgentCore operational surface (runtime, memory, MCP gateway, identity,
 * policy, evaluations, registry) so a bridge adapter can be built later
 * without making AgentCore primitives sovereign-owned.
 *
 * Scope of this file: contract + dry-run receipt generator only. No network
 * calls, no AWS SDK dependency, no secrets. `buildAgentCoreAdapterDryRun`
 * takes a fixture agent description and returns a fully redacted receipt
 * naming every field the real adapter would populate, so the acceptance
 * criterion ("no-secret dry run emits one redacted AgentCore adapter receipt
 * for a fixture agent") is satisfiable without AWS credentials.
 *
 * Primitive classification (per docs/strategy/competitor-gap-matrix.json
 * CG-025 engagementCalibration): each AgentCore primitive is marked either
 * `sovereign` (HoloScript already owns an equivalent — CAEL, x402, HoloMesh)
 * or `bridge-only` (AWS-substrate feature — IAM, KMS, VPC isolation — that
 * HoloScript maps to but does not attempt to replicate).
 */

export const AGENTCORE_ADAPTER_CONTRACT_SCHEMA_VERSION =
  'holoscript.agentcore-adapter-contract.v1' as const;

export type AgentCoreAdapterContractSchema = typeof AGENTCORE_ADAPTER_CONTRACT_SCHEMA_VERSION;

/** Whether HoloScript already owns an equivalent primitive, or only bridges to AWS's. */
export type AgentCorePrimitiveOwnership = 'sovereign' | 'bridge-only';

export interface AgentCorePrimitiveMapping {
  /** AgentCore service/primitive name, e.g. "Runtime", "Memory", "Gateway". */
  agentCorePrimitive: string;
  /** HoloScript-native concept this maps to, e.g. "HoloMesh board claim". */
  holoscriptEquivalent: string;
  ownership: AgentCorePrimitiveOwnership;
  /** One-line justification for the ownership classification. */
  rationale: string;
}

/**
 * The seven AgentCore primitives named in CG-025's competitorAdvantage text
 * (runtime, memory, MCP gateway, identity, policy, evaluations, registry —
 * code interpreter/browser/observability are AWS-substrate-only and out of
 * scope for a first adapter pass).
 */
export const AGENTCORE_PRIMITIVE_MAPPINGS: readonly AgentCorePrimitiveMapping[] = [
  {
    agentCorePrimitive: 'Runtime',
    holoscriptEquivalent: 'HoloMesh board claim + x402 seat execution',
    ownership: 'sovereign',
    rationale: 'Agent execution lifecycle (claim/work/done) is HoloMesh-native today.',
  },
  {
    agentCorePrimitive: 'Memory',
    holoscriptEquivalent: 'MEMORY.md / knowledge store / GOLD vault tiering',
    ownership: 'sovereign',
    rationale: 'Four-tier memory pipeline already exists; adapter maps shape, not storage.',
  },
  {
    agentCorePrimitive: 'Gateway (MCP)',
    holoscriptEquivalent: 'mcp.holoscript.net tool manifest (holo_*, holomesh_*)',
    ownership: 'sovereign',
    rationale: 'HoloScript already exposes an MCP surface; gateway mapping is a re-projection.',
  },
  {
    agentCorePrimitive: 'Identity / IAM',
    holoscriptEquivalent: 'HoloKey wallet-keyed identity + EIP-712 signing',
    ownership: 'bridge-only',
    rationale:
      'AWS IAM/KMS/VPC isolation is AWS-substrate; HoloScript bridges via signed envelopes, does not replicate IAM.',
  },
  {
    agentCorePrimitive: 'Policy (Cedar-equivalent)',
    holoscriptEquivalent:
      'StdlibPolicy + active-rail admission + exact-four authority and specialist/prohibited routing',
    ownership: 'sovereign',
    rationale:
      'Decision points distinguish routine active-cap execution, exact-four Joseph review, specialist review, platform controls, and prohibited replanning; the adapter maps those points to a PolicyPack shape without adopting Cedar.',
  },
  {
    agentCorePrimitive: 'Evaluations',
    holoscriptEquivalent: 'CAEL trace + verify_cael_trace / verify-cael HTTP path',
    ownership: 'sovereign',
    rationale:
      'CAEL hash-chain + deterministic-replay verdict is a stronger evaluation receipt than a vendor eval score.',
  },
  {
    agentCorePrimitive: 'Registry',
    holoscriptEquivalent: 'HoloMesh team/board + agent-family-registry.json (HOLOFAM)',
    ownership: 'bridge-only',
    rationale:
      'AWS Bedrock model/agent registry is AWS-catalog-specific; HoloScript registry metadata bridges name/version only, does not mirror the AWS catalog schema.',
  },
] as const;

/** Required manifest fields the adapter must emit for any agent (redaction-safe). */
export interface AgentCoreManifestFields {
  agentId: string;
  agentName: string;
  runtimeSurface: string;
  capabilityTags: string[];
  manifestVersion: string;
}

/** MCP Gateway exposure shape — which tools are surfaced, not how they authenticate. */
export interface AgentCoreGatewayExposure {
  gatewayEndpoint: string;
  exposedToolCount: number;
  exposedToolNames: string[];
  transport: 'jsonrpc' | 'rest' | 'sse';
}

/** Memory/provenance mapping — tier names only, never content. */
export interface AgentCoreMemoryMapping {
  tiers: string[];
  provenanceScheme: string;
  redacted: true;
}

/** Identity/IAM boundary notes — classification only, no keys/secrets. */
export interface AgentCoreIdentityBoundary {
  identityScheme: string;
  custodyNode: string;
  awsIamBridged: boolean;
  secretsIncluded: false;
}

/** PolicyPack decision points — names of gates, not their live thresholds. */
export interface AgentCorePolicyPack {
  policyPackVersion: string;
  decisionPoints: string[];
  cedarEquivalent: false;
}

/** Registry metadata — name/version/status only. */
export interface AgentCoreRegistryMetadata {
  registrySource: string;
  registeredName: string;
  registeredVersion: string;
  status: 'draft' | 'active' | 'deprecated';
}

/** CAEL-bound evaluation receipt reference — pointer only, no trace payload. */
export interface AgentCoreEvaluationReceiptRef {
  receiptSchema: string;
  verifyUrlPattern: string;
  hashAlgorithm: string;
}

export interface AgentCoreAdapterReceiptInput {
  fixtureAgentId: string;
  fixtureAgentName: string;
  capabilityTags: string[];
  exposedToolNames: string[];
}

export interface AgentCoreAdapterReceipt {
  schemaVersion: AgentCoreAdapterContractSchema;
  type: 'AgentCoreAdapterDryRunReceipt';
  createdAt: string;
  noSecretDryRun: true;
  manifest: AgentCoreManifestFields;
  gateway: AgentCoreGatewayExposure;
  memory: AgentCoreMemoryMapping;
  identity: AgentCoreIdentityBoundary;
  policy: AgentCorePolicyPack;
  registry: AgentCoreRegistryMetadata;
  evaluation: AgentCoreEvaluationReceiptRef;
  primitiveMappings: readonly AgentCorePrimitiveMapping[];
}

export interface AgentCoreAdapterReceiptValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Build a fully redacted AgentCore adapter dry-run receipt for a fixture
 * agent. No network I/O, no AWS SDK, no credentials — every field is either a
 * static contract name or derived from the caller-supplied fixture
 * description. Satisfies the CG-025 acceptance criterion.
 */
export function buildAgentCoreAdapterDryRun(
  input: AgentCoreAdapterReceiptInput
): AgentCoreAdapterReceipt {
  return {
    schemaVersion: AGENTCORE_ADAPTER_CONTRACT_SCHEMA_VERSION,
    type: 'AgentCoreAdapterDryRunReceipt',
    createdAt: new Date().toISOString(),
    noSecretDryRun: true,
    manifest: {
      agentId: input.fixtureAgentId,
      agentName: input.fixtureAgentName,
      runtimeSurface: 'holomesh-board',
      capabilityTags: [...input.capabilityTags],
      manifestVersion: AGENTCORE_ADAPTER_CONTRACT_SCHEMA_VERSION,
    },
    gateway: {
      gatewayEndpoint: 'mcp.holoscript.net/mcp',
      exposedToolCount: input.exposedToolNames.length,
      exposedToolNames: [...input.exposedToolNames],
      transport: 'jsonrpc',
    },
    memory: {
      tiers: ['MEMORY.md', 'room-knowledge', 'workspace-knowledge', 'gold-vault'],
      provenanceScheme: 'holoscript.knowledge-provenance.v1',
      redacted: true,
    },
    identity: {
      identityScheme: 'holokey-wallet-eip712',
      custodyNode: 'redacted',
      awsIamBridged: false,
      secretsIncluded: false,
    },
    policy: {
      policyPackVersion: 'holoscript.stdlib-policy.v1',
      decisionPoints: [
        'active-rail-cap-admission',
        'joseph-exact-four-boundary',
        'specialist-review-route',
        'platform-control-route',
        'prohibited-operation-replan',
        'circuit-breaker',
      ],
      cedarEquivalent: false,
    },
    registry: {
      registrySource: 'holomesh-team-board',
      registeredName: input.fixtureAgentName,
      registeredVersion: '0.0.0-dry-run',
      status: 'draft',
    },
    evaluation: {
      receiptSchema: 'holoscript.domain-simulation-receipt.v0.1.0',
      verifyUrlPattern: 'https://mcp.holoscript.net/verify-cael?traceId={traceId}',
      hashAlgorithm: 'fnv1a32',
    },
    primitiveMappings: AGENTCORE_PRIMITIVE_MAPPINGS,
  };
}

/**
 * Verify a receipt carries every required key by schema, not by convention.
 * This is the "verifies required keys by schema or script" half of the
 * CG-025 acceptance criterion.
 */
export function validateAgentCoreAdapterReceipt(
  receipt: unknown
): AgentCoreAdapterReceiptValidation {
  const errors: string[] = [];
  if (!isRecord(receipt)) {
    return { valid: false, errors: ['receipt must be an object'] };
  }

  if (receipt.schemaVersion !== AGENTCORE_ADAPTER_CONTRACT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${AGENTCORE_ADAPTER_CONTRACT_SCHEMA_VERSION}`);
  }
  if (receipt.type !== 'AgentCoreAdapterDryRunReceipt') {
    errors.push('type must be "AgentCoreAdapterDryRunReceipt"');
  }
  if (receipt.noSecretDryRun !== true) {
    errors.push('noSecretDryRun must be true — this contract never carries live credentials');
  }

  requireRecord(
    receipt,
    'manifest',
    ['agentId', 'agentName', 'runtimeSurface', 'capabilityTags', 'manifestVersion'],
    errors
  );
  requireRecord(
    receipt,
    'gateway',
    ['gatewayEndpoint', 'exposedToolCount', 'exposedToolNames', 'transport'],
    errors
  );
  requireRecord(receipt, 'memory', ['tiers', 'provenanceScheme', 'redacted'], errors);
  requireRecord(
    receipt,
    'identity',
    ['identityScheme', 'custodyNode', 'awsIamBridged', 'secretsIncluded'],
    errors
  );
  requireRecord(
    receipt,
    'policy',
    ['policyPackVersion', 'decisionPoints', 'cedarEquivalent'],
    errors
  );
  requireRecord(
    receipt,
    'registry',
    ['registrySource', 'registeredName', 'registeredVersion', 'status'],
    errors
  );
  requireRecord(
    receipt,
    'evaluation',
    ['receiptSchema', 'verifyUrlPattern', 'hashAlgorithm'],
    errors
  );

  if (isRecord(receipt.identity) && receipt.identity.secretsIncluded !== false) {
    errors.push('identity.secretsIncluded must be false — CG-025 dry run must be no-secret');
  }
  if (isRecord(receipt.memory) && receipt.memory.redacted !== true) {
    errors.push('memory.redacted must be true — memory contents must never appear in the receipt');
  }

  if (!Array.isArray(receipt.primitiveMappings) || receipt.primitiveMappings.length === 0) {
    errors.push('primitiveMappings must be a non-empty array');
  } else {
    receipt.primitiveMappings.forEach((mapping, index) => {
      if (!isRecord(mapping)) {
        errors.push(`primitiveMappings[${index}] must be an object`);
        return;
      }
      if (mapping.ownership !== 'sovereign' && mapping.ownership !== 'bridge-only') {
        errors.push(`primitiveMappings[${index}].ownership must be "sovereign" or "bridge-only"`);
      }
      if (!hasText(mapping.agentCorePrimitive)) {
        errors.push(`primitiveMappings[${index}].agentCorePrimitive is required`);
      }
      if (!hasText(mapping.holoscriptEquivalent)) {
        errors.push(`primitiveMappings[${index}].holoscriptEquivalent is required`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

function requireRecord(
  parent: Record<string, unknown>,
  key: string,
  requiredFields: string[],
  errors: string[]
): void {
  const value = parent[key];
  if (!isRecord(value)) {
    errors.push(`${key} must be an object`);
    return;
  }
  for (const field of requiredFields) {
    if (!(field in value)) {
      errors.push(`${key}.${field} is required`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
