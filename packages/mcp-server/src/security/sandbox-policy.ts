/**
 * Sandbox Policy — Unified security policy for forked/untrusted HoloScript code,
 * MCP tools, runtime adapters, and generated plugins.
 *
 * Required checks (per canary task_1778618757735_zpt5):
 *   1. Capability manifest
 *   2. Least-privilege permissions
 *   3. Network/file limits
 *   4. Timeout/resource ceilings
 *   5. Denial receipts
 *
 * Authority: W.GOLD.035, W.GOLD.039, W.GOLD.193
 */

// ── Capability Manifest ──────────────────────────────────────────────────────

export interface CapabilityAttestation {
  /** SHA-256 of the canonical manifest body */
  manifestHash: string;
  /** Signer identity (wallet, agent handle, or key fingerprint) */
  signer: string;
  /** Trust tier at admission time */
  trustTier: 'founder' | 'diamond' | 'platinum' | 'gold' | 'verified' | 'unverified';
  /** ISO-8601 timestamp */
  attestedAt: string;
  /** Optional Ed25519 signature over the canonical manifest block */
  signature?: string;
}

export interface CapabilityManifest {
  /** Protocol version */
  protocol: 'holomesh.tool_manifest.v1' | 'holoscript.capability.v1';
  /** Declared capabilities (e.g. 'compile', 'actuate:robot', 'inference:*') */
  declaredCapabilities: string[];
  /** Attestation proving the manifest was reviewed */
  attestation?: CapabilityAttestation;
  /** Source code hash (SHA-256 of canonical source tree) for code subjects */
  sourceHash?: string;
  /** Compiler version that produced the artifact */
  compilerVersion?: string;
  /** Runtime version required */
  runtimeVersion?: string;
}

// ── Sandbox Policy ───────────────────────────────────────────────────────────

export interface PermissionRequirements {
  /** OAuth 2.1 scopes required to invoke this subject */
  requiredScopes: string[];
  /** Minimum trust tier of the signer/attestation */
  minTrustTier: CapabilityAttestation['trustTier'];
  /** Whether the subject is allowed to run in anonymous/open-dev mode */
  allowAnonymous: boolean;
}

export interface NetworkLimits {
  allowNetwork: boolean;
  /** Allowed hostnames (exact or wildcard suffix, e.g. '*.holoscript.net') */
  allowedHosts: string[];
  /** Max outbound calls per minute */
  maxCallsPerMinute: number;
  /** Max total bytes transferred per execution */
  maxTransferBytes: number;
}

export interface FileLimits {
  allowFsWrites: boolean;
  /** Allowed path prefixes (relative to rootDir) */
  allowedPaths: string[];
  /** Max bytes for any single file operation */
  maxFileBytes: number;
  /** Block path-traversal patterns */
  blockTraversal: boolean;
}

export interface ResourceCeilings {
  /** Max execution time per invocation (ms) */
  maxExecutionTimeMs: number;
  /** Max memory per invocation (bytes) */
  maxMemoryBytes: number;
  /** Max CPU percent (0-100) — enforced via scheduler where available */
  maxCpuPercent: number;
  /** Max nested calls (recursion depth) */
  maxNestedCalls: number;
}

export interface DenialReceiptConfig {
  /** Emit a structured receipt on denial */
  emitReceipt: boolean;
  /** TTL for receipt retention (ms) */
  receiptTTLMs: number;
  /** Include full subject payload in receipt (false = hash only) */
  includePayload: boolean;
}

export interface SandboxPolicy {
  /** Unique policy identifier */
  policyId: string;
  /** Human-readable description */
  description: string;
  /** Capability manifest requirements */
  capabilityManifest: {
    /** Must have a manifest for non-canonical sources */
    required: boolean;
    /** Must have attestation for non-canonical sources */
    attestationRequired: boolean;
    /** Minimum trust tier for attestation */
    minAttestationTier: CapabilityAttestation['trustTier'];
  };
  permissions: PermissionRequirements;
  network: NetworkLimits;
  file: FileLimits;
  resources: ResourceCeilings;
  receipt: DenialReceiptConfig;
  /** Default trust posture when source provenance is unknown */
  defaultPosture: 'hostile' | 'benign';
}

// ── Sandbox Subject ──────────────────────────────────────────────────────────

export type SandboxSubjectKind =
  | 'holoscript_code'
  | 'mcp_tool'
  | 'runtime_adapter'
  | 'generated_plugin';

export type SandboxSubjectSource = 'canonical' | 'fork' | 'generated' | 'unknown';

export interface SandboxSubject {
  kind: SandboxSubjectKind;
  source: SandboxSubjectSource;
  /** Unique subject identifier */
  subjectId: string;
  /** The actual payload: code string, tool args, adapter config, or plugin manifest */
  payload: string | Record<string, unknown>;
  /** Optional explicit capability manifest supplied by the caller */
  manifest?: CapabilityManifest;
  /** Provenance chain (hashes of upstream artifacts) */
  provenance?: string[];
}

// ── Denial Receipt ───────────────────────────────────────────────────────────

export interface DenialReceipt {
  receiptId: string;
  timestamp: string;
  policyId: string;
  subject: {
    kind: SandboxSubjectKind;
    subjectId: string;
    source: SandboxSubjectSource;
    /** SHA-256 of payload (always present) */
    payloadHash: string;
    /** Full payload only when receipt.includePayload is true */
    payload?: string | Record<string, unknown>;
  };
  /** Which check failed */
  failedCheck: string;
  /** Human-readable reason */
  reason: string;
  /** Structured details per check */
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
  /** Suggested remediation */
  remediation: string;
}

// ── Gate Result ──────────────────────────────────────────────────────────────

export interface SandboxGateResult {
  allowed: boolean;
  /** Present when allowed === false */
  receipt?: DenialReceipt;
  /** The policy that was applied */
  appliedPolicy: SandboxPolicy;
  /** Per-check results */
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
}

// ── Default Policies ─────────────────────────────────────────────────────────

export const DEFAULT_SENSITIVE_POLICY: SandboxPolicy = {
  policyId: 'holoscript-sensitive-default-v1',
  description:
    'Default policy for subjects that may touch HoloLand worlds, robot/AI substrate, payments, or player-impacting state. Treats forked/untrusted sources as hostile.',
  capabilityManifest: {
    required: true,
    attestationRequired: true,
    minAttestationTier: 'verified',
  },
  permissions: {
    requiredScopes: ['tools:write'],
    minTrustTier: 'verified',
    allowAnonymous: false,
  },
  network: {
    allowNetwork: true,
    allowedHosts: ['mcp.holoscript.net', 'holoscript.net', 'localhost'],
    maxCallsPerMinute: 60,
    maxTransferBytes: 10 * 1024 * 1024,
  },
  file: {
    allowFsWrites: false,
    allowedPaths: ['compositions', 'data', 'src', 'packages', 'examples'],
    maxFileBytes: 5 * 1024 * 1024,
    blockTraversal: true,
  },
  resources: {
    maxExecutionTimeMs: 5000,
    maxMemoryBytes: 128 * 1024 * 1024,
    maxCpuPercent: 80,
    maxNestedCalls: 10,
  },
  receipt: {
    emitReceipt: true,
    receiptTTLMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    includePayload: false,
  },
  defaultPosture: 'hostile',
};

export const DEFAULT_BENIGN_POLICY: SandboxPolicy = {
  ...DEFAULT_SENSITIVE_POLICY,
  policyId: 'holoscript-benign-default-v1',
  description: 'Relaxed policy for read-only or computation-only subjects with no sensitive-state access.',
  capabilityManifest: {
    required: false,
    attestationRequired: false,
    minAttestationTier: 'unverified',
  },
  permissions: {
    requiredScopes: ['tools:read'],
    minTrustTier: 'unverified',
    allowAnonymous: true,
  },
  network: {
    allowNetwork: false,
    allowedHosts: [],
    maxCallsPerMinute: 0,
    maxTransferBytes: 0,
  },
  file: {
    allowFsWrites: false,
    allowedPaths: [],
    maxFileBytes: 0,
    blockTraversal: true,
  },
  resources: {
    maxExecutionTimeMs: 3000,
    maxMemoryBytes: 64 * 1024 * 1024,
    maxCpuPercent: 50,
    maxNestedCalls: 5,
  },
  defaultPosture: 'benign',
};

// ── Policy Resolution ──────────────────────────────────────────────────────

/** Tools that can touch sensitive state (HoloLand, robot/AI, payments, player-impacting) */
export const SENSITIVE_TOOL_PATTERNS = [
  // HoloLand world CRUD
  /^generate_world$/,
  /^create_world$/,
  /^update_world$/,
  /^delete_world$/,
  /^create_shard$/,
  /^update_shard$/,
  /^delete_shard$/,
  /^create_zone$/,
  /^update_zone$/,
  /^delete_zone$/,
  /^create_place$/,
  /^update_place$/,
  /^delete_place$/,
  /^create_location_quest$/,
  /^update_location_quest$/,
  /^delete_location_quest$/,
  /^hololand_publish_zone$/,
  /^hololand_create_geo_anchor$/,
  /^hololand_steward_tick$/,
  /^hololand_capture_runtime_receipt$/,
  /^hololand_create_npc$/,
  /^hololand_update_npc$/,
  /^hololand_delete_npc$/,
  // Robot / AI substrate
  /^twin_earth_register_identity$/,
  /^twin_earth_revoke_identity$/,
  /^twin_earth_create_safety_envelope$/,
  /^twin_earth_delete_safety_envelope$/,
  /^twin_earth_grant_permission$/,
  /^twin_earth_revoke_permission$/,
  /^twin_earth_robot_actuate$/,
  /^twin_earth_ai_invoke$/,
  /^twin_earth_capture_receipt$/,
  // Payments / economy
  /^holo_protocol_/,
  /^check_agent_budget$/,
  /^get_creator_earnings$/,
  /^optimize_scene_budget$/,
  /^validate_marketplace_pricing$/,
  // Plugin management (plugins can inject arbitrary code)
  /^install_plugin$/,
  /^install_domain_plugin$/,
  /^manage_plugin$/,
  // Code generation / compilation (may produce forked-looking code)
  /^compile_holoscript$/,
  /^compile_pipeline$/,
  /^compile_to_/,
  /^generate_object$/,
  /^generate_scene$/,
  /^generate_semantic_ui$/,
  /^generate_3d_object$/,
  /^edit_holo$/,
  /^convert_format$/,
];

export function isSensitiveTool(toolName: string): boolean {
  return SENSITIVE_TOOL_PATTERNS.some((pattern) => pattern.test(toolName));
}

/** Resolve the appropriate policy for a subject based on kind, source, and target tool. */
export function resolvePolicy(
  subject: Pick<SandboxSubject, 'kind' | 'source'>,
  toolName?: string
): SandboxPolicy {
  // Sensitive tools always get sensitive policy regardless of source
  if (toolName && isSensitiveTool(toolName)) {
    return DEFAULT_SENSITIVE_POLICY;
  }
  // Forked or generated sources get sensitive policy (heuristics may upgrade source)
  if (subject.source === 'fork' || subject.source === 'generated') {
    return DEFAULT_SENSITIVE_POLICY;
  }
  // Everything else (canonical, unknown without sensitive tool) gets benign
  return DEFAULT_BENIGN_POLICY;
}

// ── Payload Hashing ──────────────────────────────────────────────────────────

export async function hashPayload(payload: string | Record<string, unknown>): Promise<string> {
  const { createHash } = await import('crypto');
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return createHash('sha256').update(data).digest('hex');
}

// ── Receipt Store (in-memory with TTL) ───────────────────────────────────────

class ReceiptStore {
  private store = new Map<string, { receipt: DenialReceipt; expiresAt: number }>();

  add(receipt: DenialReceipt, ttlMs: number): void {
    this.store.set(receipt.receiptId, {
      receipt,
      expiresAt: Date.now() + ttlMs,
    });
  }

  get(receiptId: string): DenialReceipt | undefined {
    const entry = this.store.get(receiptId);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(receiptId);
      return undefined;
    }
    return entry.receipt;
  }

  purgeExpired(): number {
    const now = Date.now();
    let count = 0;
    for (const [id, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(id);
        count++;
      }
    }
    return count;
  }

  size(): number {
    return this.store.size;
  }
}

export const globalReceiptStore = new ReceiptStore();

// Periodic cleanup every 5 minutes
setInterval(() => globalReceiptStore.purgeExpired(), 5 * 60 * 1000);
