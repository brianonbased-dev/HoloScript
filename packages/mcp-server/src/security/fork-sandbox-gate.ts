/**
 * Fork Sandbox Gate — Enforces sandbox policy on HoloScript-looking code,
 * MCP tools, runtime adapters, and generated plugins before they can touch
 * sensitive state (HoloLand worlds, robot/AI substrate, payments, player-impacting state).
 *
 * Canary task: task_1778618757735_zpt5
 * Authority: W.GOLD.035, W.GOLD.039, W.GOLD.193
 */

import type {
  SandboxPolicy,
  SandboxSubject,
  SandboxSubjectSource,
  CapabilityManifest,
  DenialReceipt,
  SandboxGateResult,
} from './sandbox-policy';
import {
  resolvePolicy,
  hashPayload,
  globalReceiptStore,
  isSensitiveTool,
  DEFAULT_SENSITIVE_POLICY,
  DEFAULT_BENIGN_POLICY,
} from './sandbox-policy';

// ── Fork Detection Heuristics ────────────────────────────────────────────────

/**
 * Detect whether a HoloScript code payload appears to come from a forked or
 * untrusted compiler. These heuristics are defense-in-depth; the primary
 * trust signal is the explicit `source` field on the SandboxSubject.
 *
 * Detection rules (return true if suspicious):
 * 1. Contains keywords that canonical HoloScript blocks (HS010) — a fork that
 *    removed the lexical firewall would let these through.
 * 2. Claims a compiler version that does not match known canonical versions.
 * 3. Contains `@security_sandbox` trait syntax but no observable sandbox calls.
 * 4. References npm scopes other than `@holoscript/*` for core imports.
 * 5. Contains `eval`, `Function`, `process`, `require`, `fs`, `child_process`.
 */
const HS010_KEYWORDS = [
  'process',
  'fs',
  'require',
  'eval',
  'exec',
  'spawn',
  'child_process',
  'constructor',
  'prototype',
  'globalThis',
];

const CANONICAL_COMPILER_VERSIONS = ['7.0.0', '6.0.2', '6.0.1', '6.0.0'];

export interface ForkDetectionResult {
  isSuspicious: boolean;
  signals: string[];
}

export function detectForkedHoloScript(code: string): ForkDetectionResult {
  const signals: string[] = [];

  // HS010 keyword presence
  for (const kw of HS010_KEYWORDS) {
    const regex = new RegExp(`\\b${kw}\\b`);
    if (regex.test(code)) {
      signals.push(`HS010-blocked-keyword:${kw}`);
    }
  }

  // Version mismatch
  const versionMatch = code.match(/@compiler\s+version\s+["']?([\d.]+)["']?/i);
  if (versionMatch) {
    const claimedVersion = versionMatch[1];
    if (!CANONICAL_COMPILER_VERSIONS.includes(claimedVersion)) {
      signals.push(`unknown-compiler-version:${claimedVersion}`);
    }
  }

  // No-op trait pattern: @security_sandbox present but no sandbox import
  if (/(?:^|\s)@security_sandbox\b/.test(code) && !/\bimport\s+.*security-sandbox/.test(code)) {
    signals.push('no-op-security-trait');
  }

  // Non-canonical npm scope import
  const nonCanonicalImport = /\bfrom\s+['"](?!@holoscript\/)[@\w\/-]+['"]/.test(code);
  if (nonCanonicalImport) {
    signals.push('non-canonical-import');
  }

  return {
    isSuspicious: signals.length > 0,
    signals,
  };
}

/**
 * Detect whether a plugin manifest or adapter config looks forked/untrusted.
 */
export function detectForkedPlugin(manifest: Record<string, unknown>): ForkDetectionResult {
  const signals: string[] = [];
  const scope = typeof manifest.scopeName === 'string' ? manifest.scopeName : '';
  if (scope && !scope.startsWith('@holoscript/')) {
    signals.push(`non-canonical-scope:${scope}`);
  }
  const version = typeof manifest.version === 'string' ? manifest.version : '';
  if (version && !/^\d+\.\d+\.\d+/.test(version)) {
    signals.push(`invalid-semver:${version}`);
  }
  const tier = typeof manifest.trustTier === 'string' ? manifest.trustTier : '';
  if (tier && tier === 'unverified') {
    signals.push('unverified-tier');
  }
  return {
    isSuspicious: signals.length > 0,
    signals,
  };
}

// ── Capability Manifest Validation ───────────────────────────────────────────

function validateCapabilityManifest(
  subject: SandboxSubject,
  policy: SandboxPolicy
): { passed: boolean; detail?: string } {
  const manifest: CapabilityManifest | undefined = subject.manifest;

  if (!manifest) {
    if (policy.capabilityManifest.required) {
      return {
        passed: false,
        detail: `Capability manifest required but missing for ${subject.kind}:${subject.subjectId}`,
      };
    }
    return { passed: true, detail: 'Manifest not required' };
  }

  if (manifest.declaredCapabilities.length === 0) {
    return {
      passed: false,
      detail: 'Capability manifest has zero declared capabilities',
    };
  }

  if (policy.capabilityManifest.attestationRequired) {
    if (!manifest.attestation) {
      return {
        passed: false,
        detail: 'Attestation required but missing',
      };
    }
    const tierOrder = ['founder', 'diamond', 'platinum', 'gold', 'verified', 'unverified'];
    const subjectIdx = tierOrder.indexOf(manifest.attestation.trustTier);
    const requiredIdx = tierOrder.indexOf(policy.capabilityManifest.minAttestationTier);
    if (subjectIdx < 0 || subjectIdx > requiredIdx) {
      return {
        passed: false,
        detail: `Attestation trust tier '${manifest.attestation.trustTier}' is below required '${policy.capabilityManifest.minAttestationTier}'`,
      };
    }
  }

  return { passed: true, detail: 'Manifest valid' };
}

// ── Permission Validation ────────────────────────────────────────────────────

function validatePermissions(
  _subject: SandboxSubject,
  policy: SandboxPolicy,
  grantedScopes: string[]
): { passed: boolean; detail?: string } {
  if (grantedScopes.includes('admin:*')) {
    return { passed: true, detail: 'admin:* bypasses scope check' };
  }

  if (policy.permissions.allowAnonymous) {
    return { passed: true, detail: 'Anonymous access permitted' };
  }

  const required = policy.permissions.requiredScopes;
  const hasScope = required.some((s) => grantedScopes.includes(s));
  if (!hasScope) {
    return {
      passed: false,
      detail: `Insufficient scope. Required one of [${required.join(', ')}]. Granted [${grantedScopes.join(', ')}]`,
    };
  }

  return { passed: true, detail: 'Scopes adequate' };
}

// ── Network/File Limits ──────────────────────────────────────────────────────

function validateNetworkLimits(
  subject: SandboxSubject,
  policy: SandboxPolicy
): { passed: boolean; detail?: string } {
  if (!policy.network.allowNetwork) {
    return { passed: true, detail: 'Network disabled by policy' };
  }

  // For code subjects, scan for network calls
  if (subject.kind === 'holoscript_code' && typeof subject.payload === 'string') {
    const code = subject.payload;
    const hasFetch = /\bfetch\s*\(/.test(code);
    const hasAxios = /\baxios\b/.test(code);
    const hasHttp = /\bhttp\b/.test(code);
    if ((hasFetch || hasAxios || hasHttp) && policy.network.allowedHosts.length === 0) {
      return {
        passed: false,
        detail: 'Code contains network calls but policy allows no hosts',
      };
    }
  }

  return { passed: true, detail: 'Network limits acceptable' };
}

function validateFileLimits(
  subject: SandboxSubject,
  policy: SandboxPolicy
): { passed: boolean; detail?: string } {
  if (!policy.file.allowFsWrites) {
    // Scan for file-system write patterns in code
    if (subject.kind === 'holoscript_code' && typeof subject.payload === 'string') {
      const code = subject.payload;
      const hasFsWrite = /\bfs\s*\.\s*(writeFile|appendFile|mkdir|unlink|rmdir)\b/.test(code);
      const hasPathWrite = /\bwriteFileSync\b/.test(code);
      if (hasFsWrite || hasPathWrite) {
        return {
          passed: false,
          detail: 'Code contains filesystem writes but policy blocks fs writes',
        };
      }
    }
  }

  // Path traversal check for file-path arguments
  if (typeof subject.payload === 'object' && subject.payload !== null) {
    const args = subject.payload as Record<string, unknown>;
    for (const val of Object.values(args)) {
      if (typeof val === 'string') {
        const normalized = val.replace(/\\/g, '/').replace(/^\.\//, '');
        if (normalized.startsWith('..') || normalized.includes('/../')) {
          return {
            passed: false,
            detail: `Path traversal blocked: "${val}"`,
          };
        }
      }
    }
  }

  return { passed: true, detail: 'File limits acceptable' };
}

// ── Resource Ceiling Validation ──────────────────────────────────────────────

function validateResourceCeilings(
  _subject: SandboxSubject,
  policy: SandboxPolicy
): { passed: boolean; detail?: string } {
  if (policy.resources.maxExecutionTimeMs <= 0) {
    return { passed: false, detail: 'maxExecutionTimeMs must be positive' };
  }
  if (policy.resources.maxMemoryBytes <= 0) {
    return { passed: false, detail: 'maxMemoryBytes must be positive' };
  }
  return { passed: true, detail: 'Resource ceilings valid' };
}

// ── Denial Receipt Generation ──────────────────────────────────────────────────

async function createDenialReceipt(
  subject: SandboxSubject,
  policy: SandboxPolicy,
  failedCheck: string,
  reason: string,
  checks: Array<{ name: string; passed: boolean; detail?: string }>,
  remediation: string
): Promise<DenialReceipt> {
  const payloadHash = await hashPayload(subject.payload);
  const receiptId = `denial_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const receipt: DenialReceipt = {
    receiptId,
    timestamp: new Date().toISOString(),
    policyId: policy.policyId,
    subject: {
      kind: subject.kind,
      subjectId: subject.subjectId,
      source: subject.source,
      payloadHash,
      ...(policy.receipt.includePayload ? { payload: subject.payload } : {}),
    },
    failedCheck,
    reason,
    checks,
    remediation,
  };

  if (policy.receipt.emitReceipt) {
    globalReceiptStore.add(receipt, policy.receipt.receiptTTLMs);
  }

  return receipt;
}

// ── Main Gate ────────────────────────────────────────────────────────────────

export interface ForkSandboxGateOptions {
  /** OAuth 2.1 scopes granted to the current caller */
  grantedScopes?: string[];
  /** Override the default policy resolution */
  policy?: SandboxPolicy;
  /** Tool name being invoked (for policy resolution) */
  toolName?: string;
  /** Enable fork-detection heuristics on code payloads */
  enableHeuristics?: boolean;
}

/**
 * Run the fork sandbox gate against a subject.
 *
 * Protocol:
 * 1. Resolve policy (based on subject source + optional tool name).
 * 2. If heuristics enabled and subject is code/plugin, run fork detection.
 *    Suspicious signals upgrade source to 'fork' if it was 'unknown'.
 * 3. Run required checks in order: manifest → permissions → network → file → resources.
 * 4. On first failure, emit denial receipt (if configured) and return blocked.
 * 5. On success, return allowed with per-check detail.
 */
export async function runForkSandboxGate(
  subject: SandboxSubject,
  options: ForkSandboxGateOptions = {}
): Promise<SandboxGateResult> {
  // Step 1: Heuristic fork detection (defense-in-depth)
  let effectiveSource: SandboxSubjectSource = subject.source;
  let heuristicSignals: string[] = [];
  if (options.enableHeuristics !== false) {
    if (subject.kind === 'holoscript_code' && typeof subject.payload === 'string') {
      const detection = detectForkedHoloScript(subject.payload);
      if (detection.isSuspicious) {
        heuristicSignals = detection.signals;
        if (effectiveSource === 'unknown' || effectiveSource === 'generated') {
          effectiveSource = 'fork';
        }
      }
    } else if (subject.kind === 'generated_plugin' && typeof subject.payload === 'object') {
      const detection = detectForkedPlugin(subject.payload as Record<string, unknown>);
      if (detection.isSuspicious) {
        heuristicSignals = detection.signals;
        if (effectiveSource === 'unknown' || effectiveSource === 'generated') {
          effectiveSource = 'fork';
        }
      }
    }
  }

  const policy = options.policy ?? resolvePolicy({ ...subject, source: effectiveSource }, options.toolName);

  // Admin bypass: full authority scope short-circuits all checks
  if (options.grantedScopes?.includes('admin:*')) {
    return {
      allowed: true,
      appliedPolicy: policy,
      checks: [{ name: 'admin_bypass', passed: true, detail: 'admin:* bypasses all gates' }],
    };
  }

  const checks: Array<{ name: string; passed: boolean; detail?: string }> = [];

  // Check 1: Capability manifest
  const manifestCheck = validateCapabilityManifest(
    { ...subject, source: effectiveSource },
    policy
  );
  checks.push({ name: 'capability_manifest', ...manifestCheck });
  if (!manifestCheck.passed) {
    const receipt = await createDenialReceipt(
      subject,
      policy,
      'capability_manifest',
      manifestCheck.detail!,
      checks,
      'Provide a valid capability manifest with attestation from a verified-tier signer.'
    );
    return { allowed: false, receipt, appliedPolicy: policy, checks };
  }

  // Check 2: Permissions
  const scopes = options.grantedScopes ?? [];
  const permCheck = validatePermissions(subject, policy, scopes);
  checks.push({ name: 'permissions', ...permCheck });
  if (!permCheck.passed) {
    const receipt = await createDenialReceipt(
      subject,
      policy,
      'permissions',
      permCheck.detail!,
      checks,
      'Request the required OAuth scopes or elevate the subject attestation tier.'
    );
    return { allowed: false, receipt, appliedPolicy: policy, checks };
  }

  // Check 3: Network limits
  const netCheck = validateNetworkLimits(subject, policy);
  checks.push({ name: 'network_limits', ...netCheck });
  if (!netCheck.passed) {
    const receipt = await createDenialReceipt(
      subject,
      policy,
      'network_limits',
      netCheck.detail!,
      checks,
      'Remove network calls from the subject or request a policy with allowedHosts.'
    );
    return { allowed: false, receipt, appliedPolicy: policy, checks };
  }

  // Check 4: File limits
  const fileCheck = validateFileLimits(subject, policy);
  checks.push({ name: 'file_limits', ...fileCheck });
  if (!fileCheck.passed) {
    const receipt = await createDenialReceipt(
      subject,
      policy,
      'file_limits',
      fileCheck.detail!,
      checks,
      'Remove filesystem write patterns or request a policy with allowFsWrites=true and allowedPaths.'
    );
    return { allowed: false, receipt, appliedPolicy: policy, checks };
  }

  // Check 5: Resource ceilings
  const resourceCheck = validateResourceCeilings(subject, policy);
  checks.push({ name: 'resource_ceilings', ...resourceCheck });
  if (!resourceCheck.passed) {
    const receipt = await createDenialReceipt(
      subject,
      policy,
      'resource_ceilings',
      resourceCheck.detail!,
      checks,
      'Adjust resource ceilings to positive values in the policy.'
    );
    return { allowed: false, receipt, appliedPolicy: policy, checks };
  }

  // Heuristic signals are informational only — they don't block if all formal checks pass
  if (heuristicSignals.length > 0) {
    checks.push({
      name: 'fork_heuristics',
      passed: true,
      detail: `Suspicious signals detected but not blocking: ${heuristicSignals.join(', ')}`,
    });
  }

  return { allowed: true, appliedPolicy: policy, checks };
}

// ── Convenience: Gate a HoloScript code string ───────────────────────────────

export async function gateHoloScriptCode(
  code: string,
  opts: {
    source?: SandboxSubjectSource;
    subjectId?: string;
    grantedScopes?: string[];
    toolName?: string;
    manifest?: CapabilityManifest;
  } = {}
): Promise<SandboxGateResult> {
  const subject: SandboxSubject = {
    kind: 'holoscript_code',
    source: opts.source ?? 'unknown',
    subjectId: opts.subjectId ?? `code_${Date.now()}`,
    payload: code,
    manifest: opts.manifest,
  };
  return runForkSandboxGate(subject, {
    grantedScopes: opts.grantedScopes,
    toolName: opts.toolName,
  });
}

// ── Convenience: Gate an MCP tool invocation ─────────────────────────────────

export async function gateMcpTool(
  toolName: string,
  args: Record<string, unknown>,
  opts: {
    source?: SandboxSubjectSource;
    grantedScopes?: string[];
    manifest?: CapabilityManifest;
  } = {}
): Promise<SandboxGateResult> {
  const subject: SandboxSubject = {
    kind: 'mcp_tool',
    source: opts.source ?? 'unknown',
    subjectId: `tool:${toolName}`,
    payload: args,
    manifest: opts.manifest,
  };
  return runForkSandboxGate(subject, {
    grantedScopes: opts.grantedScopes,
    toolName,
  });
}

// ── Convenience: Gate a plugin registration ──────────────────────────────────

export async function gatePluginRegistration(
  pluginManifest: Record<string, unknown>,
  opts: {
    source?: SandboxSubjectSource;
    grantedScopes?: string[];
  } = {}
): Promise<SandboxGateResult> {
  const subject: SandboxSubject = {
    kind: 'generated_plugin',
    source: opts.source ?? 'unknown',
    subjectId: `plugin:${pluginManifest.name ?? 'unnamed'}`,
    payload: pluginManifest,
    manifest: pluginManifest.manifest as CapabilityManifest | undefined,
  };
  return runForkSandboxGate(subject, {
    grantedScopes: opts.grantedScopes,
  });
}

// ── Re-exports for consumers ───────────────────────────────────────────────────

export { isSensitiveTool, resolvePolicy, DEFAULT_SENSITIVE_POLICY, DEFAULT_BENIGN_POLICY };
