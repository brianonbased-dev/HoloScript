/**
 * HoloLand Fork Admission Gate
 *
 * Combines structural artifact validation (from artifact-admission-gate) with
 * fork-detection heuristics (from fork-sandbox-gate) to prevent compromised or
 * forked code from entering HoloLand worlds, shards, zones, and NPCs.
 *
 * Scans code-bearing string fields inside artifacts for:
 *   - HS010-blocked keywords (process, fs, eval, exec, spawn, child_process,
 *     constructor, prototype, globalThis)
 *   - Unknown compiler versions
 *   - Non-canonical imports
 *   - No-op security traits
 *
 * Authority: W.GOLD.035, W.GOLD.039, W.GOLD.193
 */

import { detectForkedHoloScript } from './fork-sandbox-gate';
import {
  runAdmissionGate,
  type ArtifactKind,
  type ConformanceReport,
  type ConformanceFinding,
} from '../conformance/artifact-admission-gate';

export interface HoloLandForkAdmissionInput {
  artifactKind: ArtifactKind;
  artifactId: string;
  artifact: unknown;
}

export interface HoloLandForkAdmissionReport extends ConformanceReport {
  forkSignals: string[];
}

/**
 * Run the HoloLand fork admission gate on an artifact.
 *
 * Protocol:
 * 1. Run structural admission gate (world/shard/zone/NPC/identity/package/receipt rules).
 * 2. Recursively scan artifact string fields for fork indicators.
 * 3. Combine findings. Fork signals are promoted to critical severity.
 * 4. Return full report with forkSignals array.
 */
export function runHololandForkAdmissionGate(
  input: HoloLandForkAdmissionInput
): HoloLandForkAdmissionReport {
  // Step 1: structural validation
  const structural = runAdmissionGate({
    artifactKind: input.artifactKind,
    artifactId: input.artifactId,
    artifact: input.artifact,
  });

  // Step 2: fork detection
  const forkSignals = scanArtifactForForkSignals(input.artifact);

  // Step 3: combine
  const findings: ConformanceFinding[] = [...structural.findings];
  if (forkSignals.length > 0) {
    findings.push({
      ruleId: 'FORK-001',
      severity: 'critical',
      message: `HoloLand fork admission blocked: detected ${forkSignals.length} fork indicator(s) — ${forkSignals.join(', ')}`,
      remediation:
        'Remove blocked keywords (process, fs, eval, exec, spawn, child_process, constructor, prototype, globalThis), use canonical compiler versions (7.0.0, 6.0.2, 6.0.1, 6.0.0), ensure imports are from @holoscript/*, and verify security sandbox traits have matching imports.',
    });
  }

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;

  return {
    artifactKind: input.artifactKind,
    artifactId: input.artifactId,
    passed: structural.passed && forkSignals.length === 0,
    findings,
    criticalCount,
    highCount,
    mediumCount: findings.filter((f) => f.severity === 'medium').length,
    lowCount: findings.filter((f) => f.severity === 'low').length,
    infoCount: findings.filter((f) => f.severity === 'info').length,
    checkedAt: new Date().toISOString(),
    gateVersion: '1.0.0',
    forkSignals,
  };
}

// Fields that are explicitly non-code metadata and should be skipped during recursion
const SKIP_FIELDS: ReadonlySet<string> = new Set([
  'id',
  'name',
  'handle',
  'walletAddress',
  'attestation',
  'hash',
  'signature',
  'keyFingerprint',
  'sourceHash',
  'packageId',
  'artifactId',
  'receiptId',
  'checkedAt',
  'attestedAt',
  'issuedAt',
  'createdAt',
  'modifiedAt',
  'publishedAt',
  'sealedAt',
  'revokedAt',
  'version',
  'compilerVersion',
  'runtimeVersion',
  'manifestHash',
  'signer',
  'trustTier',
  'admissionDecision',
  'tag',
  'category',
  'role',
  'behavior',
  'biome',
  'biomeLabel',
  'modelProvider',
  'modelId',
  'npcId',
  'worldId',
  'shardId',
  'zoneId',
  'placeId',
  'questId',
  'envelopeId',
  'grantHash',
  'revocationSignature',
  'hardwareFingerprint',
  'wallet',
  'email',
  'phone',
  'url',
  'assetUrl',
  'navmeshUrl',
  'modelUrl',
  'generationId',
  'description',
  'title',
  'message',
  'prompt',
  'line',
  'greeting',
  'farewell',
  'color',
  'skybox',
  'theme',
  'platform',
  'status',
  'tier',
  'tierGate',
  'health',
  'format',
  'quality',
  'provider',
  'style',
  'mode',
  'kind',
  'scope',
  'action',
  'command',
  'granterId',
  'granteeId',
  'agentId',
  'playerInput',
  'context',
  'dialogueLine',
  'greetings',
  'farewells',
  'brainCompositionRef',
  'memorySnapshotHash',
  'resumeStepId',
  'lat',
  'lng',
  'alt',
  'radius',
  'capacity',
  'maxUsers',
  'maxAgents',
  'maxTickDurationMs',
  'maxMemoryBytes',
  'maxNetworkCallsPerMinute',
]);

function scanArtifactForForkSignals(artifact: unknown): string[] {
  const signals = new Set<string>();
  const codeLikeStrings = extractCodeLikeStrings(artifact);
  for (const str of codeLikeStrings) {
    const result = detectForkedHoloScript(str);
    for (const signal of result.signals) {
      signals.add(signal);
    }
  }
  return Array.from(signals);
}

function looksLikeCode(str: string): boolean {
  // HoloScript language markers
  if (/\borb\b/.test(str)) return true;
  if (/\bcomposition\b/.test(str)) return true;
  if (/\bsystem\b/.test(str)) return true;
  if (/\bcomponent\b/.test(str)) return true;
  if (/\bimport\b/.test(str)) return true;
  if (/@/.test(str)) return true;
  if (/\{/.test(str) && /\}/.test(str)) return true;
  if (/@compiler\b/.test(str)) return true;
  if (/@security_sandbox\b/.test(str)) return true;

  // Node.js / runtime API call patterns (require call-site syntax, not bare keywords)
  if (/\beval\s*\(/.test(str)) return true;
  if (/\bfs\s*\./.test(str)) return true;
  if (/\brequire\s*\(/.test(str)) return true;
  if (/\bchild_process\b/.test(str)) return true;
  if (/\bspawn\s*\(/.test(str)) return true;
  if (/\bexec\s*\(/.test(str)) return true;
  if (/\bwriteFileSync\b/.test(str)) return true;
  if (/\breadFileSync\b/.test(str)) return true;
  if (/\bfetch\s*\(/.test(str)) return true;
  if (/\baxios\b/.test(str)) return true;
  if (/\bhttp\b/.test(str)) return true;

  // Dangerous JS properties
  if (/\bconstructor\b/.test(str)) return true;
  if (/\bprototype\b/.test(str)) return true;
  if (/\bglobalThis\b/.test(str)) return true;

  return false;
}

function extractCodeLikeStrings(value: unknown, depth = 0): string[] {
  if (depth > 10) return [];

  if (typeof value === 'string') {
    return looksLikeCode(value) ? [value] : [];
  }

  if (Array.isArray(value)) {
    const results: string[] = [];
    for (const item of value) {
      results.push(...extractCodeLikeStrings(item, depth + 1));
    }
    return results;
  }

  if (value !== null && typeof value === 'object') {
    const results: string[] = [];
    for (const [key, val] of Object.entries(value)) {
      if (SKIP_FIELDS.has(key)) continue;
      results.push(...extractCodeLikeStrings(val, depth + 1));
    }
    return results;
  }

  return [];
}
