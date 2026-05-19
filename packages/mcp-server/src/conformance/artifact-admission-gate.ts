/**
 * Artifact Admission Gate — Official HoloScript Conformance Validator
 *
 * Validates artifacts before admission to the HoloScript ecosystem.
 * Covers worlds, shards, zones, NPCs, Twin Earth identities, and packages.
 *
 * Version: 1.0.0
 * Authority: W.GOLD.035, W.GOLD.193
 */

import {
  type Shard,
  type Zone,
  validateShard,
  validateZone,
} from '@holoscript/framework';
import { type WorldDefinition } from '../../../core/src/hololand/WorldDefinitionSchema';

import { type StoredNPC } from '../hololand-mcp-tools';
import {
  type StoredTwinEarthIdentity,
  type StoredSafetyEnvelope,
} from '../robot-ai-mcp-tools';

// ═════════════════════════════════════════════════════════════════════════════
// CONFORMANCE RULES
// ═════════════════════════════════════════════════════════════════════════════

export type ArtifactKind = 'world' | 'shard' | 'zone' | 'npc' | 'identity' | 'package' | 'receipt';

export type ConformanceSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface ConformanceFinding {
  ruleId: string;
  severity: ConformanceSeverity;
  message: string;
  field?: string;
  expected?: string;
  actual?: string;
  remediation: string;
}

export interface ConformanceReport {
  artifactKind: ArtifactKind;
  artifactId: string;
  passed: boolean;
  findings: ConformanceFinding[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  checkedAt: string;
  gateVersion: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// PACKAGE PROVENANCE
// ═════════════════════════════════════════════════════════════════════════════

export interface PackageProvenance {
  /** Source code hash (SHA-256 of canonical source tree). */
  sourceHash: string;
  /** Package identifier (npm scope + name, or internal package id). */
  packageId: string;
  /** Package version (semver). */
  version: string;
  /** Signer identity — wallet address, agent handle, or key fingerprint. */
  signer: string;
  /** Trust tier of the signer at admission time. */
  trustTier: 'founder' | 'diamond' | 'platinum' | 'gold' | 'verified' | 'unverified';
  /** Compiler version that produced the artifact (if compiled). */
  compilerVersion?: string;
  /** Runtime version required to execute the artifact. */
  runtimeVersion?: string;
  /** Admission decision from the conformance gate. */
  admissionDecision: 'admitted' | 'rejected' | 'pending';
  /** ISO-8601 timestamp of the admission check. */
  checkedAt: string;
  /** Optional Ed25519 signature over the canonical provenance block. */
  signature?: string;
  /** Public key fingerprint for signature verification. */
  keyFingerprint?: string;
}

export function validatePackageAdmission(pkg: PackageProvenance): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];

  if (!pkg.sourceHash || pkg.sourceHash.length !== 64) {
    findings.push({
      ruleId: 'PACKAGE-001',
      severity: 'critical',
      message: 'Package sourceHash is missing or not a valid SHA-256 hex string (64 chars).',
      field: 'sourceHash',
      actual: pkg.sourceHash,
      remediation: 'Compute SHA-256 of the canonical source tree and provide a 64-character hex string.',
    });
  }

  if (!pkg.packageId || pkg.packageId.trim().length === 0) {
    findings.push({
      ruleId: 'PACKAGE-002',
      severity: 'critical',
      message: 'Package packageId is missing.',
      field: 'packageId',
      remediation: 'Provide a valid package identifier (e.g., @holoscript/core).',
    });
  }

  if (!pkg.version || !/^\d+\.\d+\.\d+/.test(pkg.version)) {
    findings.push({
      ruleId: 'PACKAGE-003',
      severity: 'high',
      message: `Package version '${pkg.version}' is not valid semver.`,
      field: 'version',
      actual: pkg.version,
      remediation: 'Use semantic versioning (e.g., 7.0.0).',
    });
  }

  if (!pkg.signer || pkg.signer.trim().length === 0) {
    findings.push({
      ruleId: 'PACKAGE-004',
      severity: 'critical',
      message: 'Package signer is missing.',
      field: 'signer',
      remediation: 'Provide the identity (wallet address, agent handle, or key fingerprint) of the signer.',
    });
  }

  const validTiers = ['founder', 'diamond', 'platinum', 'gold', 'verified', 'unverified'];
  if (!validTiers.includes(pkg.trustTier)) {
    findings.push({
      ruleId: 'PACKAGE-005',
      severity: 'high',
      message: `Package trustTier '${pkg.trustTier}' is not recognized.`,
      field: 'trustTier',
      actual: pkg.trustTier,
      expected: validTiers.join(', '),
      remediation: 'Use a recognized trust tier.',
    });
  }

  if (pkg.trustTier === 'unverified' && pkg.admissionDecision === 'admitted') {
    findings.push({
      ruleId: 'PACKAGE-006',
      severity: 'high',
      message: 'Package with unverified signer is being admitted.',
      field: 'trustTier + admissionDecision',
      actual: 'unverified + admitted',
      remediation: 'Require at least "verified" tier for admission, or elevate signer trust.',
    });
  }

  if (!pkg.admissionDecision || !['admitted', 'rejected', 'pending'].includes(pkg.admissionDecision)) {
    findings.push({
      ruleId: 'PACKAGE-007',
      severity: 'critical',
      message: `Package admissionDecision '${pkg.admissionDecision}' is invalid.`,
      field: 'admissionDecision',
      actual: pkg.admissionDecision,
      expected: 'admitted | rejected | pending',
      remediation: 'Set admissionDecision to admitted, rejected, or pending.',
    });
  }

  if (!pkg.checkedAt || Number.isNaN(Date.parse(pkg.checkedAt))) {
    findings.push({
      ruleId: 'PACKAGE-008',
      severity: 'medium',
      message: 'Package checkedAt timestamp is missing or invalid.',
      field: 'checkedAt',
      actual: pkg.checkedAt,
      remediation: 'Provide a valid ISO-8601 timestamp.',
    });
  }

  // Signature presence check (not cryptographic verification — that's the verifier's job)
  if (!pkg.signature) {
    findings.push({
      ruleId: 'PACKAGE-009',
      severity: 'medium',
      message: 'Package provenance lacks a signature.',
      field: 'signature',
      remediation: 'Sign the canonical provenance block with the signer Ed25519 key.',
    });
  }

  if (pkg.signature && !pkg.keyFingerprint) {
    findings.push({
      ruleId: 'PACKAGE-010',
      severity: 'medium',
      message: 'Package has a signature but no keyFingerprint for verification.',
      field: 'keyFingerprint',
      remediation: 'Include the public key fingerprint so verifiers can locate the trust store entry.',
    });
  }

  return findings;
}

// ═════════════════════════════════════════════════════════════════════════════
// RECEIPT VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

export interface ArtifactReceiptBody {
  /** Receipt type discriminator. */
  kind: 'validation' | 'compilation' | 'runtime' | 'provenance' | 'other';
  /** Unique receipt id. */
  id: string;
  /** Artifact this receipt is about. */
  artifactId: string;
  /** SHA-256 hash of the canonical receipt body. */
  hash: string;
  /** Hash algorithm. */
  hashAlgorithm: 'sha256' | 'git-blob' | 'cid' | 'custom';
  /** ISO-8601 timestamp when the receipt was issued. */
  issuedAt: string;
  /** Provenance link back to task/commit. */
  provenance?: { taskId?: string; commitHash?: string; source?: string };
  /** Verification commands. */
  verificationCommands?: Array<{ command: string; status?: string; artifactIds?: string[] }>;
}

export function validateReceiptAdmission(receipt: ArtifactReceiptBody): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];

  if (!receipt.id || receipt.id.trim().length === 0) {
    findings.push({
      ruleId: 'RECEIPT-001',
      severity: 'critical',
      message: 'Receipt id is missing.',
      field: 'id',
      remediation: 'Assign a unique receipt identifier.',
    });
  }

  const validKinds = ['validation', 'compilation', 'runtime', 'provenance', 'other'];
  if (!validKinds.includes(receipt.kind)) {
    findings.push({
      ruleId: 'RECEIPT-002',
      severity: 'critical',
      message: `Receipt kind '${receipt.kind}' is not recognized.`,
      field: 'kind',
      actual: receipt.kind,
      expected: validKinds.join(', '),
      remediation: 'Use a recognized receipt kind.',
    });
  }

  if (!receipt.artifactId || receipt.artifactId.trim().length === 0) {
    findings.push({
      ruleId: 'RECEIPT-003',
      severity: 'critical',
      message: 'Receipt artifactId is missing.',
      field: 'artifactId',
      remediation: 'Bind the receipt to the artifact it certifies.',
    });
  }

  if (!receipt.hash || receipt.hash.length === 0) {
    findings.push({
      ruleId: 'RECEIPT-004',
      severity: 'critical',
      message: 'Receipt hash is missing.',
      field: 'hash',
      remediation: 'Compute a hash over the canonical receipt body.',
    });
  }

  if (!receipt.hashAlgorithm || !['sha256', 'git-blob', 'cid', 'custom'].includes(receipt.hashAlgorithm)) {
    findings.push({
      ruleId: 'RECEIPT-005',
      severity: 'high',
      message: `Receipt hashAlgorithm '${receipt.hashAlgorithm}' is not supported.`,
      field: 'hashAlgorithm',
      actual: receipt.hashAlgorithm,
      expected: 'sha256 | git-blob | cid | custom',
      remediation: 'Use a supported hash algorithm.',
    });
  }

  if (!receipt.issuedAt || Number.isNaN(Date.parse(receipt.issuedAt))) {
    findings.push({
      ruleId: 'RECEIPT-006',
      severity: 'high',
      message: 'Receipt issuedAt timestamp is missing or invalid.',
      field: 'issuedAt',
      actual: receipt.issuedAt,
      remediation: 'Provide a valid ISO-8601 timestamp.',
    });
  }

  for (const command of receipt.verificationCommands ?? []) {
    if (!command.command || command.command.trim().length === 0) {
      findings.push({
        ruleId: 'RECEIPT-007',
        severity: 'medium',
        message: `Receipt ${receipt.id} has a verification command without command text.`,
        field: 'verificationCommands[].command',
        remediation: 'Provide the shell command or test invocation that reproduces the receipt.',
      });
    }
  }

  return findings;
}

// ═════════════════════════════════════════════════════════════════════════════
// WORLD VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

export function validateWorldAdmission(world: WorldDefinition): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];

  if (!world.metadata?.id) {
    findings.push({
      ruleId: 'WORLD-001',
      severity: 'critical',
      message: 'World metadata.id is required.',
      field: 'metadata.id',
      remediation: 'Assign a unique world identifier before admission.',
    });
  }

  if (!world.metadata?.name || world.metadata.name.trim().length === 0) {
    findings.push({
      ruleId: 'WORLD-002',
      severity: 'critical',
      message: 'World metadata.name is empty.',
      field: 'metadata.name',
      remediation: 'Provide a non-empty display name.',
    });
  }

  if (!world.config) {
    findings.push({
      ruleId: 'WORLD-003',
      severity: 'critical',
      message: 'World config block is missing.',
      field: 'config',
      remediation: 'Include a config block with maxUsers, bounds, physics, rendering, networking.',
    });
  } else {
    if ((world.config.maxUsers ?? 0) <= 0) {
      findings.push({
        ruleId: 'WORLD-004',
        severity: 'high',
        message: 'World config.maxUsers must be positive.',
        field: 'config.maxUsers',
        actual: String(world.config.maxUsers),
        remediation: 'Set maxUsers to a positive integer (default: 50).',
      });
    }

    if (!world.config.bounds) {
      findings.push({
        ruleId: 'WORLD-005',
        severity: 'medium',
        message: 'World config.bounds is missing.',
        field: 'config.bounds',
        remediation: 'Define spatial bounds for the world.',
      });
    }
  }

  if (!world.spawnPoints || world.spawnPoints.length === 0) {
    findings.push({
      ruleId: 'WORLD-006',
      severity: 'medium',
      message: 'World has no spawn points.',
      field: 'spawnPoints',
      remediation: 'Add at least one spawn point for player entry.',
    });
  }

  if (!world.zones || world.zones.length === 0) {
    findings.push({
      ruleId: 'WORLD-007',
      severity: 'info',
      message: 'World has no zones.',
      field: 'zones',
      remediation: 'Add zones for spatial partitioning and encounter placement.',
    });
  }

  return findings;
}

// ═════════════════════════════════════════════════════════════════════════════
// SHARD VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

export function validateShardAdmission(shard: Shard): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];

  // Structural validation via framework validator
  const structuralErrors = validateShard(shard);
  for (const err of structuralErrors) {
    findings.push({
      ruleId: 'SHARD-001',
      severity: 'critical',
      message: err,
      remediation: 'Fix the structural error before admission.',
    });
  }

  // Cross-reference integrity
  const zoneIds = new Set(shard.zones.map((z) => z.id));
  const encounterIds = new Set(shard.encounters.map((e) => e.id));
  const itemIds = new Set(shard.items.map((i) => i.id));
  const skillIds = new Set(shard.skills.map((s) => s.id));
  const lootTableIds = new Set(shard.lootTables.map((t) => t.id));

  for (const encounter of shard.encounters) {
    if (encounter.zoneId && !zoneIds.has(encounter.zoneId)) {
      findings.push({
        ruleId: 'SHARD-002',
        severity: 'high',
        message: `Encounter '${encounter.id}' references unknown zone '${encounter.zoneId}'.`,
        field: 'encounters.zoneId',
        actual: encounter.zoneId,
        remediation: 'Create the referenced zone or remove the encounter binding.',
      });
    }
    if (encounter.lootTableId && !lootTableIds.has(encounter.lootTableId)) {
      findings.push({
        ruleId: 'SHARD-003',
        severity: 'high',
        message: `Encounter '${encounter.id}' references unknown loot table '${encounter.lootTableId}'.`,
        field: 'encounters.lootTableId',
        actual: encounter.lootTableId,
        remediation: 'Create the referenced loot table or remove the binding.',
      });
    }
  }

  for (const table of shard.lootTables) {
    for (const entry of table.entries ?? []) {
      if (entry.itemId && !itemIds.has(entry.itemId)) {
        findings.push({
          ruleId: 'SHARD-004',
          severity: 'high',
          message: `LootTable '${table.id}' entry references unknown item '${entry.itemId}'.`,
          field: 'lootTables.entries.itemId',
          actual: entry.itemId,
          remediation: 'Create the referenced item or remove the loot table entry.',
        });
      }
      if (entry.skillId && !skillIds.has(entry.skillId)) {
        findings.push({
          ruleId: 'SHARD-005',
          severity: 'high',
          message: `LootTable '${table.id}' entry references unknown skill '${entry.skillId}'.`,
          field: 'lootTables.entries.skillId',
          actual: entry.skillId,
          remediation: 'Create the referenced skill or remove the loot table entry.',
        });
      }
    }
  }

  for (const quest of shard.quests) {
    for (const step of quest.steps ?? []) {
      if (step.objective && step.objective.length === 0) {
        findings.push({
          ruleId: 'SHARD-006',
          severity: 'medium',
          message: `Quest '${quest.id}' step has empty objective.`,
          field: 'quests.steps.objective',
          remediation: 'Provide a non-empty objective for each quest step.',
        });
      }
    }
  }

  // Minimum content policy
  if (shard.zones.length === 0) {
    findings.push({
      ruleId: 'SHARD-007',
      severity: 'medium',
      message: 'Shard has no zones.',
      field: 'zones',
      remediation: 'Add at least one zone to the shard.',
    });
  }

  return findings;
}

// ═════════════════════════════════════════════════════════════════════════════
// ZONE VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

export function validateZoneAdmission(zone: Zone): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];

  const structuralErrors = validateZone(zone);
  for (const err of structuralErrors) {
    findings.push({
      ruleId: 'ZONE-001',
      severity: 'critical',
      message: err,
      remediation: 'Fix the structural error before admission.',
    });
  }

  const validBiomes = ['urban', 'wilderness', 'underground', 'aquatic', 'aerial', 'liminal', 'biome-other'];
  if (!validBiomes.includes(zone.biome)) {
    findings.push({
      ruleId: 'ZONE-002',
      severity: 'high',
      message: `Zone biome '${zone.biome}' is not recognized.`,
      field: 'biome',
      actual: zone.biome,
      expected: validBiomes.join(', '),
      remediation: 'Use a recognized biome or set biome to "biome-other" with a biomeLabel.',
    });
  }

  if (zone.biome === 'biome-other' && (!zone.biomeLabel || zone.biomeLabel.trim().length === 0)) {
    findings.push({
      ruleId: 'ZONE-003',
      severity: 'high',
      message: 'Zone with biome "biome-other" requires biomeLabel.',
      field: 'biomeLabel',
      remediation: 'Provide a biomeLabel when using biome-other.',
    });
  }

  return findings;
}

// ═════════════════════════════════════════════════════════════════════════════
// NPC VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

export function validateNPCAdmission(npc: StoredNPC): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];

  if (!npc.name || npc.name.trim().length === 0) {
    findings.push({
      ruleId: 'NPC-001',
      severity: 'critical',
      message: 'NPC name is empty.',
      field: 'name',
      remediation: 'Provide a non-empty display name.',
    });
  }

  const validRoles = ['merchant', 'guide', 'quest_giver', 'enemy', 'companion', 'ambient', 'brittney'];
  if (!validRoles.includes(npc.role)) {
    findings.push({
      ruleId: 'NPC-002',
      severity: 'high',
      message: `NPC role '${npc.role}' is not recognized.`,
      field: 'role',
      actual: npc.role,
      expected: validRoles.join(', '),
      remediation: 'Use a recognized role.',
    });
  }

  const validProviders = ['cloud', 'local', 'sovereign'];
  if (!validProviders.includes(npc.modelProvider)) {
    findings.push({
      ruleId: 'NPC-003',
      severity: 'high',
      message: `NPC modelProvider '${npc.modelProvider}' is not recognized.`,
      field: 'modelProvider',
      actual: npc.modelProvider,
      expected: validProviders.join(', '),
      remediation: 'Use cloud, local, or sovereign.',
    });
  }

  if (npc.position && npc.position.length !== 3) {
    findings.push({
      ruleId: 'NPC-004',
      severity: 'medium',
      message: 'NPC position must be [x, y, z] with 3 elements.',
      field: 'position',
      actual: String(npc.position?.length),
      expected: '3',
      remediation: 'Provide a 3-element position array.',
    });
  }

  if (npc.modelProvider === 'sovereign' && !npc.dialogueTree && !npc.systemPrompt) {
    findings.push({
      ruleId: 'NPC-005',
      severity: 'low',
      message: 'Sovereign NPC lacks dialogueTree or systemPrompt.',
      field: 'dialogueTree',
      remediation: 'Provide a dialogueTree or systemPrompt for deterministic behavior.',
    });
  }

  return findings;
}

// ═════════════════════════════════════════════════════════════════════════════
// TWIN EARTH IDENTITY VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

export function validateIdentityAdmission(identity: StoredTwinEarthIdentity): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];

  if (!identity.agentId || identity.agentId.trim().length === 0) {
    findings.push({
      ruleId: 'IDENTITY-001',
      severity: 'critical',
      message: 'Identity agentId is missing.',
      field: 'agentId',
      remediation: 'Assign a unique agentId derived from wallet public key.',
    });
  }

  if (!identity.walletAddress || identity.walletAddress.trim().length === 0) {
    findings.push({
      ruleId: 'IDENTITY-002',
      severity: 'critical',
      message: 'Identity walletAddress is missing.',
      field: 'walletAddress',
      remediation: 'Provide an EVM or Solana wallet address.',
    });
  }

  if (!identity.attestation || identity.attestation.trim().length === 0) {
    findings.push({
      ruleId: 'IDENTITY-003',
      severity: 'critical',
      message: 'Identity attestation is missing.',
      field: 'attestation',
      remediation: 'Provide an EIP-712 typed-data signature.',
    });
  }

  if (!identity.handle || identity.handle.trim().length === 0) {
    findings.push({
      ruleId: 'IDENTITY-004',
      severity: 'high',
      message: 'Identity handle is empty.',
      field: 'handle',
      remediation: 'Provide a non-empty human-readable handle.',
    });
  }

  if (identity.kind !== 'robot' && identity.kind !== 'ai') {
    findings.push({
      ruleId: 'IDENTITY-005',
      severity: 'high',
      message: `Identity kind '${identity.kind}' is invalid.`,
      field: 'kind',
      actual: identity.kind,
      expected: 'robot | ai',
      remediation: 'Set kind to "robot" or "ai".',
    });
  }

  if (identity.revoked) {
    findings.push({
      ruleId: 'IDENTITY-006',
      severity: 'critical',
      message: 'Identity is revoked.',
      field: 'revoked',
      actual: 'true',
      expected: 'false',
      remediation: 'Re-register a new identity — revoked identities cannot be admitted.',
    });
  }

  // Attestation age check (90-day TTL)
  const attestedAt = new Date(identity.attestedAt).getTime();
  const now = Date.now();
  const ttlMs = 90 * 24 * 60 * 60 * 1000;
  if (Number.isNaN(attestedAt)) {
    findings.push({
      ruleId: 'IDENTITY-007',
      severity: 'high',
      message: 'Identity attestedAt is not a valid ISO-8601 timestamp.',
      field: 'attestedAt',
      actual: identity.attestedAt,
      remediation: 'Provide a valid ISO-8601 timestamp.',
    });
  } else if (now - attestedAt > ttlMs) {
    findings.push({
      ruleId: 'IDENTITY-008',
      severity: 'high',
      message: 'Identity attestation has expired (>90 days).',
      field: 'attestedAt',
      actual: identity.attestedAt,
      remediation: 'Renew the attestation with a fresh EIP-712 signature.',
    });
  }

  return findings;
}

// ═════════════════════════════════════════════════════════════════════════════
// SAFETY ENVELOPE VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

export function validateSafetyEnvelopeAdmission(envelope: StoredSafetyEnvelope): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];

  if (!envelope.id || envelope.id.trim().length === 0) {
    findings.push({
      ruleId: 'ENVELOPE-001',
      severity: 'critical',
      message: 'Safety envelope id is missing.',
      field: 'id',
      remediation: 'Assign a unique envelope identifier.',
    });
  }

  if (!envelope.agentId || envelope.agentId.trim().length === 0) {
    findings.push({
      ruleId: 'ENVELOPE-002',
      severity: 'critical',
      message: 'Safety envelope agentId is missing.',
      field: 'agentId',
      remediation: 'Bind the envelope to an existing Twin Earth identity.',
    });
  }

  if (!envelope.substrateEnforced) {
    findings.push({
      ruleId: 'ENVELOPE-003',
      severity: 'critical',
      message: 'Safety envelope substrateEnforced is false.',
      field: 'substrateEnforced',
      actual: 'false',
      expected: 'true',
      remediation: 'Set substrateEnforced=true — participants cannot override their own envelopes.',
    });
  }

  if (envelope.maxTickDurationMs < 0) {
    findings.push({
      ruleId: 'ENVELOPE-004',
      severity: 'high',
      message: 'Safety envelope maxTickDurationMs is negative.',
      field: 'maxTickDurationMs',
      actual: String(envelope.maxTickDurationMs),
      remediation: 'Set maxTickDurationMs to a non-negative number.',
    });
  }

  if (envelope.maxMemoryBytes < 0) {
    findings.push({
      ruleId: 'ENVELOPE-005',
      severity: 'high',
      message: 'Safety envelope maxMemoryBytes is negative.',
      field: 'maxMemoryBytes',
      actual: String(envelope.maxMemoryBytes),
      remediation: 'Set maxMemoryBytes to a non-negative number.',
    });
  }

  if (envelope.maxNetworkCallsPerMinute < 0) {
    findings.push({
      ruleId: 'ENVELOPE-006',
      severity: 'high',
      message: 'Safety envelope maxNetworkCallsPerMinute is negative.',
      field: 'maxNetworkCallsPerMinute',
      actual: String(envelope.maxNetworkCallsPerMinute),
      remediation: 'Set maxNetworkCallsPerMinute to a non-negative number.',
    });
  }

  // Dangerous whitelist check
  if (envelope.allowedActions.length === 0 && envelope.blockedActions.length === 0) {
    findings.push({
      ruleId: 'ENVELOPE-007',
      severity: 'info',
      message: 'Safety envelope has no allowedActions or blockedActions — all actions permitted.',
      field: 'allowedActions',
      remediation: 'Consider setting an allowedActions whitelist for defense in depth.',
    });
  }

  return findings;
}

// ═════════════════════════════════════════════════════════════════════════════
// ADMISSION GATE
// ═════════════════════════════════════════════════════════════════════════════

export interface AdmissionGateInput {
  artifactKind: ArtifactKind;
  artifactId: string;
  artifact: unknown;
}

export function runAdmissionGate(input: AdmissionGateInput): ConformanceReport {
  let findings: ConformanceFinding[] = [];

  switch (input.artifactKind) {
    case 'world':
      findings = validateWorldAdmission(input.artifact as WorldDefinition);
      break;
    case 'shard':
      findings = validateShardAdmission(input.artifact as Shard);
      break;
    case 'zone':
      findings = validateZoneAdmission(input.artifact as Zone);
      break;
    case 'npc':
      findings = validateNPCAdmission(input.artifact as StoredNPC);
      break;
    case 'identity':
      findings = validateIdentityAdmission(input.artifact as StoredTwinEarthIdentity);
      break;
    case 'package':
      findings = validatePackageAdmission(input.artifact as PackageProvenance);
      break;
    case 'receipt': {
      findings = validateReceiptAdmission(input.artifact as ArtifactReceiptBody);
      break;
    }
    default:
      findings.push({
        ruleId: 'GATE-001',
        severity: 'medium',
        message: `Artifact kind '${input.artifactKind}' has no dedicated admission validator.`,
        remediation: 'Extend the admission gate with a validator for this artifact kind.',
      });
  }

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const mediumCount = findings.filter((f) => f.severity === 'medium').length;
  const lowCount = findings.filter((f) => f.severity === 'low').length;
  const infoCount = findings.filter((f) => f.severity === 'info').length;

  return {
    artifactKind: input.artifactKind,
    artifactId: input.artifactId,
    passed: criticalCount === 0 && highCount === 0,
    findings,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    infoCount,
    checkedAt: new Date().toISOString(),
    gateVersion: '1.0.0',
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// RULE CATALOG
// ═════════════════════════════════════════════════════════════════════════════

export interface ConformanceRule {
  ruleId: string;
  artifactKind: ArtifactKind;
  severity: ConformanceSeverity;
  description: string;
  remediation: string;
}

export function getConformanceRules(): ConformanceRule[] {
  return [
    { ruleId: 'WORLD-001', artifactKind: 'world', severity: 'critical', description: 'World metadata.id is required.', remediation: 'Assign a unique world identifier.' },
    { ruleId: 'WORLD-002', artifactKind: 'world', severity: 'critical', description: 'World metadata.name is empty.', remediation: 'Provide a non-empty display name.' },
    { ruleId: 'WORLD-003', artifactKind: 'world', severity: 'critical', description: 'World config block is missing.', remediation: 'Include a config block.' },
    { ruleId: 'WORLD-004', artifactKind: 'world', severity: 'high', description: 'World config.maxUsers must be positive.', remediation: 'Set maxUsers > 0.' },
    { ruleId: 'WORLD-005', artifactKind: 'world', severity: 'medium', description: 'World config.bounds is missing.', remediation: 'Define spatial bounds.' },
    { ruleId: 'WORLD-006', artifactKind: 'world', severity: 'medium', description: 'World has no spawn points.', remediation: 'Add at least one spawn point.' },
    { ruleId: 'WORLD-007', artifactKind: 'world', severity: 'info', description: 'World has no zones.', remediation: 'Add zones for spatial partitioning.' },
    { ruleId: 'SHARD-001', artifactKind: 'shard', severity: 'critical', description: 'Shard structural validation failed.', remediation: 'Fix structural errors.' },
    { ruleId: 'SHARD-002', artifactKind: 'shard', severity: 'high', description: 'Encounter references unknown zone.', remediation: 'Create the zone or remove the binding.' },
    { ruleId: 'SHARD-003', artifactKind: 'shard', severity: 'high', description: 'Encounter references unknown loot table.', remediation: 'Create the loot table or remove the binding.' },
    { ruleId: 'SHARD-004', artifactKind: 'shard', severity: 'high', description: 'LootTable entry references unknown item.', remediation: 'Create the item or remove the entry.' },
    { ruleId: 'SHARD-005', artifactKind: 'shard', severity: 'high', description: 'LootTable entry references unknown skill.', remediation: 'Create the skill or remove the entry.' },
    { ruleId: 'SHARD-006', artifactKind: 'shard', severity: 'medium', description: 'Quest step has empty objective.', remediation: 'Provide a non-empty objective.' },
    { ruleId: 'SHARD-007', artifactKind: 'shard', severity: 'medium', description: 'Shard has no zones.', remediation: 'Add at least one zone.' },
    { ruleId: 'ZONE-001', artifactKind: 'zone', severity: 'critical', description: 'Zone structural validation failed.', remediation: 'Fix structural errors.' },
    { ruleId: 'ZONE-002', artifactKind: 'zone', severity: 'high', description: 'Zone biome is not recognized.', remediation: 'Use a recognized biome.' },
    { ruleId: 'ZONE-003', artifactKind: 'zone', severity: 'high', description: 'Zone biome-other requires biomeLabel.', remediation: 'Provide a biomeLabel.' },
    { ruleId: 'NPC-001', artifactKind: 'npc', severity: 'critical', description: 'NPC name is empty.', remediation: 'Provide a non-empty display name.' },
    { ruleId: 'NPC-002', artifactKind: 'npc', severity: 'high', description: 'NPC role is not recognized.', remediation: 'Use a recognized role.' },
    { ruleId: 'NPC-003', artifactKind: 'npc', severity: 'high', description: 'NPC modelProvider is not recognized.', remediation: 'Use cloud, local, or sovereign.' },
    { ruleId: 'NPC-004', artifactKind: 'npc', severity: 'medium', description: 'NPC position must be [x, y, z].', remediation: 'Provide a 3-element array.' },
    { ruleId: 'NPC-005', artifactKind: 'npc', severity: 'low', description: 'Sovereign NPC lacks dialogueTree or systemPrompt.', remediation: 'Provide deterministic behavior config.' },
    { ruleId: 'IDENTITY-001', artifactKind: 'identity', severity: 'critical', description: 'Identity agentId is missing.', remediation: 'Assign a unique agentId.' },
    { ruleId: 'IDENTITY-002', artifactKind: 'identity', severity: 'critical', description: 'Identity walletAddress is missing.', remediation: 'Provide a wallet address.' },
    { ruleId: 'IDENTITY-003', artifactKind: 'identity', severity: 'critical', description: 'Identity attestation is missing.', remediation: 'Provide an EIP-712 signature.' },
    { ruleId: 'IDENTITY-004', artifactKind: 'identity', severity: 'high', description: 'Identity handle is empty.', remediation: 'Provide a non-empty handle.' },
    { ruleId: 'IDENTITY-005', artifactKind: 'identity', severity: 'high', description: 'Identity kind is invalid.', remediation: 'Set kind to robot or ai.' },
    { ruleId: 'IDENTITY-006', artifactKind: 'identity', severity: 'critical', description: 'Identity is revoked.', remediation: 'Re-register a new identity.' },
    { ruleId: 'IDENTITY-007', artifactKind: 'identity', severity: 'high', description: 'Identity attestedAt is invalid.', remediation: 'Provide a valid ISO-8601 timestamp.' },
    { ruleId: 'IDENTITY-008', artifactKind: 'identity', severity: 'high', description: 'Identity attestation has expired.', remediation: 'Renew the attestation.' },
    { ruleId: 'ENVELOPE-001', artifactKind: 'identity', severity: 'critical', description: 'Safety envelope id is missing.', remediation: 'Assign a unique envelope id.' },
    { ruleId: 'ENVELOPE-002', artifactKind: 'identity', severity: 'critical', description: 'Safety envelope agentId is missing.', remediation: 'Bind to an existing identity.' },
    { ruleId: 'ENVELOPE-003', artifactKind: 'identity', severity: 'critical', description: 'Safety envelope substrateEnforced is false.', remediation: 'Set substrateEnforced=true.' },
    { ruleId: 'ENVELOPE-004', artifactKind: 'identity', severity: 'high', description: 'Safety envelope maxTickDurationMs is negative.', remediation: 'Set to non-negative.' },
    { ruleId: 'ENVELOPE-005', artifactKind: 'identity', severity: 'high', description: 'Safety envelope maxMemoryBytes is negative.', remediation: 'Set to non-negative.' },
    { ruleId: 'ENVELOPE-006', artifactKind: 'identity', severity: 'high', description: 'Safety envelope maxNetworkCallsPerMinute is negative.', remediation: 'Set to non-negative.' },
    { ruleId: 'ENVELOPE-007', artifactKind: 'identity', severity: 'info', description: 'Safety envelope has no action restrictions.', remediation: 'Consider adding allowedActions whitelist.' },
    // Package provenance rules
    { ruleId: 'PACKAGE-001', artifactKind: 'package', severity: 'critical', description: 'Package sourceHash is missing or invalid.', remediation: 'Compute SHA-256 of canonical source tree.' },
    { ruleId: 'PACKAGE-002', artifactKind: 'package', severity: 'critical', description: 'Package packageId is missing.', remediation: 'Provide a valid package identifier.' },
    { ruleId: 'PACKAGE-003', artifactKind: 'package', severity: 'high', description: 'Package version is not valid semver.', remediation: 'Use semantic versioning (e.g., 7.0.0).' },
    { ruleId: 'PACKAGE-004', artifactKind: 'package', severity: 'critical', description: 'Package signer is missing.', remediation: 'Provide signer identity.' },
    { ruleId: 'PACKAGE-005', artifactKind: 'package', severity: 'high', description: 'Package trustTier is not recognized.', remediation: 'Use a recognized trust tier.' },
    { ruleId: 'PACKAGE-006', artifactKind: 'package', severity: 'high', description: 'Package with unverified signer is being admitted.', remediation: 'Require at least "verified" tier for admission.' },
    { ruleId: 'PACKAGE-007', artifactKind: 'package', severity: 'critical', description: 'Package admissionDecision is invalid.', remediation: 'Set to admitted, rejected, or pending.' },
    { ruleId: 'PACKAGE-008', artifactKind: 'package', severity: 'medium', description: 'Package checkedAt timestamp is invalid.', remediation: 'Provide a valid ISO-8601 timestamp.' },
    { ruleId: 'PACKAGE-009', artifactKind: 'package', severity: 'medium', description: 'Package provenance lacks a signature.', remediation: 'Sign the canonical provenance block with Ed25519.' },
    { ruleId: 'PACKAGE-010', artifactKind: 'package', severity: 'medium', description: 'Package has signature but no keyFingerprint.', remediation: 'Include the public key fingerprint.' },
    // Receipt rules
    { ruleId: 'RECEIPT-001', artifactKind: 'receipt', severity: 'critical', description: 'Receipt id is missing.', remediation: 'Assign a unique receipt identifier.' },
    { ruleId: 'RECEIPT-002', artifactKind: 'receipt', severity: 'critical', description: 'Receipt kind is not recognized.', remediation: 'Use a recognized receipt kind.' },
    { ruleId: 'RECEIPT-003', artifactKind: 'receipt', severity: 'critical', description: 'Receipt artifactId is missing.', remediation: 'Bind the receipt to the artifact it certifies.' },
    { ruleId: 'RECEIPT-004', artifactKind: 'receipt', severity: 'critical', description: 'Receipt hash is missing.', remediation: 'Compute a hash over the canonical receipt body.' },
    { ruleId: 'RECEIPT-005', artifactKind: 'receipt', severity: 'high', description: 'Receipt hashAlgorithm is not supported.', remediation: 'Use a supported hash algorithm.' },
    { ruleId: 'RECEIPT-006', artifactKind: 'receipt', severity: 'high', description: 'Receipt issuedAt timestamp is invalid.', remediation: 'Provide a valid ISO-8601 timestamp.' },
    { ruleId: 'RECEIPT-007', artifactKind: 'receipt', severity: 'medium', description: 'Receipt has a verification command without command text.', remediation: 'Provide the shell command or test invocation.' },
  ];
}
