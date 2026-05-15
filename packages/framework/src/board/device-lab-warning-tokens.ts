/**
 * HoloShell Device Lab Warning Tokens
 *
 * Transforms device-lab receipt gotchas into actionable warning tokens
 * with attach/skip/why-it-matters actions for HoloShell UI consumption.
 *
 * Task: task_1778739828973_47f5
 */

// Local type definitions (mirroring @holoscript/hololand-platform/device-lab)
// to avoid cross-package dependency in @holoscript/framework.

export type ProbeStatus = 'pass' | 'warn' | 'fail' | 'skipped';

export interface ProbeCheck {
  id: string;
  label: string;
  status: ProbeStatus;
  detail: string;
  evidence?: Record<string, unknown>;
}

export interface DeviceGotcha {
  id: string;
  severity: 'low' | 'medium' | 'high';
  summary: string;
  evidenceCheckId: string;
}

export interface DeviceLabReceipt {
  receiptId: string;
  schemaVersion: 'hololand-device-lab-receipt/v1';
  createdAt: string;
  generatedBy: string;
  command: string;
  checks: ProbeCheck[];
  gotchas: DeviceGotcha[];
  overallStatus: 'pass' | 'warn' | 'fail';
}

// ── Warning Token Types ──

export const WARNING_SEVERITY = ['low', 'medium', 'high', 'critical'] as const;
export type WarningSeverity = (typeof WARNING_SEVERITY)[number];

export const WARNING_ACTION_TYPE = ['attach', 'skip', 'why-it-matters', 'delegate'] as const;
export type WarningActionType = (typeof WARNING_ACTION_TYPE)[number];

/**
 * A UI-ready warning token derived from device-lab gotchas or skipped checks.
 * Designed for direct consumption by HoloShell receipt tokens.
 */
export interface DeviceLabWarningToken {
  /** Unique token id, e.g. `warn_headset_report_missing`. */
  id: string;
  /** Human-readable title for the warning. */
  title: string;
  /** Severity level for UI coloring. */
  severity: WarningSeverity;
  /** Short description shown in the token. */
  detail: string;
  /** Why this evidence matters for HoloLand readiness. */
  whyItMatters: string;
  /** Available actions for this warning. */
  actions: DeviceLabWarningAction[];
  /** Reference to the source check id. */
  sourceCheckId: string;
  /** Reference to the source gotcha id (if applicable). */
  gotchaId?: string;
  /** Metadata for action handlers. */
  metadata?: Record<string, unknown>;
}

/**
 * An action that can be taken on a warning token.
 */
export interface DeviceLabWarningAction {
  /** Action type identifier. */
  type: WarningActionType;
  /** Action label shown in UI. */
  label: string;
  /** Action description for tooltip. */
  description?: string;
  /** Payload for action handler. */
  payload?: Record<string, unknown>;
}

// ── Warning Token Factory ──

/**
 * Known warning patterns with pre-defined why-it-matters text.
 */
const KNOWN_WARNING_PATTERNS: Record<string, { title: string; whyItMatters: string; severity: WarningSeverity }> = {
  'G.HW.HEADSET_REPORT': {
    title: 'Quest/headset probe report missing',
    whyItMatters:
      'Headset-specific readiness is unproven without Quest probe evidence. HoloLand worlds may fail to deploy or run on target VR hardware. Export observations.md from Studio /quest-probe and attach via --headset-report.',
    severity: 'medium',
  },
  'G.HW.REPLAY_RECEIPT': {
    title: 'Replay receipt not attached',
    whyItMatters:
      'Deterministic replay evidence is required for scientific validation. Without replay receipts, scene behavior cannot be reproduced, verified, or audited. Pass --replay with a scene replay, trace, or validation receipt.',
    severity: 'medium',
  },
  'G.HW.WEBGPU_BROWSER': {
    title: 'WebGPU browser smoke failed or skipped',
    whyItMatters:
      'WebGPU is required for HoloLand GPU-accelerated paths. Without WebGPU browser smoke, HoloLand must fall back to WASM/TypeScript scalar paths, reducing performance and feature availability.',
    severity: 'high',
  },
  'G.HW.WASM_SIMD': {
    title: 'WASM SIMD unavailable',
    whyItMatters:
      'WASM SIMD is required for HoloLand SIMD-optimized paths. Without SIMD, physics, neural networks, and reconstruction pipelines fall back to scalar WASM, reducing performance by 4-8x.',
    severity: 'high',
  },
  'G.HW.GPU_INVENTORY': {
    title: 'No GPU controller detected',
    whyItMatters:
      'HoloLand requires GPU acceleration for WebGPU, reconstruction, and neural inference. No GPU detected means browser probes may still work, but local GPU paths are unavailable.',
    severity: 'medium',
  },
};

/**
 * Default why-it-matters for unknown warnings.
 */
const DEFAULT_WHAT_IT_MATTERS =
  'This evidence gap affects HoloLand readiness. Attach the required evidence or explicitly skip with a reason.';

/**
 * Derive warning tokens from a device-lab receipt.
 * Combines skipped checks and gotchas into unified actionable tokens.
 */
export function deriveWarningTokens(receipt: DeviceLabReceipt): DeviceLabWarningToken[] {
  const tokens: DeviceLabWarningToken[] = [];
  const seenCheckIds = new Set<string>();

  // Process gotchas first (these are explicit warnings/failures)
  for (const gotcha of receipt.gotchas) {
    const pattern = KNOWN_WARNING_PATTERNS[gotcha.id] || null;
    const check = receipt.checks.find((c: ProbeCheck) => c.id === gotcha.evidenceCheckId);

    const token: DeviceLabWarningToken = {
      id: `warn_${gotcha.id.toLowerCase().replace(/\./g, '_')}`,
      title: pattern?.title || gotcha.summary,
      severity: mapGotchaSeverityToWarning(gotcha.severity),
      detail: check?.detail || gotcha.summary,
      whyItMatters: pattern?.whyItMatters || DEFAULT_WHAT_IT_MATTERS,
      actions: buildWarningActions(gotcha.id, check),
      sourceCheckId: gotcha.evidenceCheckId,
      gotchaId: gotcha.id,
      metadata: {
        gotchaSeverity: gotcha.severity,
        checkStatus: check?.status,
      },
    };

    tokens.push(token);
    seenCheckIds.add(gotcha.evidenceCheckId);
  }

  // Process skipped checks that don't have corresponding gotchas
  for (const check of receipt.checks) {
    if (check.status === 'skipped' && !seenCheckIds.has(check.id)) {
      const token = buildSkippedCheckToken(check);
      if (token) {
        tokens.push(token);
      }
    }
  }

  return tokens;
}

/**
 * Map device gotcha severity to warning severity.
 */
function mapGotchaSeverityToWarning(severity: DeviceGotcha['severity']): WarningSeverity {
  switch (severity) {
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
    default:
      return 'medium';
  }
}

/**
 * Build a warning token from a skipped check.
 */
function buildSkippedCheckToken(check: ProbeCheck): DeviceLabWarningToken | null {
  // Only create tokens for checks that have meaningful skip reasons
  if (!check.detail.includes('No ') && !check.detail.includes('not supplied')) {
    return null;
  }

  const pattern = KNOWN_WARNING_PATTERNS[`G.HW.${check.id.toUpperCase().replace(/-/g, '_')}`] || null;

  return {
    id: `warn_${check.id.toLowerCase().replace(/-/g, '_')}_skipped`,
    title: pattern?.title || `${check.label} not attached`,
    severity: pattern?.severity || 'medium',
    detail: check.detail,
    whyItMatters: pattern?.whyItMatters || DEFAULT_WHAT_IT_MATTERS,
    actions: buildWarningActions(check.id, check),
    sourceCheckId: check.id,
    metadata: {
      checkStatus: 'skipped',
    },
  };
}

/**
 * Build available actions for a warning.
 */
function buildWarningActions(
  warningId: string,
  check?: ProbeCheck
): DeviceLabWarningAction[] {
  const actions: DeviceLabWarningAction[] = [];

  // Attach action - tells user how to provide the missing evidence
  actions.push({
    type: 'attach',
    label: 'Attach evidence',
    description: getAttachDescription(warningId),
    payload: {
      expectedArtifact: getExpectedArtifact(warningId),
      attachCommand: getAttachCommand(warningId),
    },
  });

  // Skip action - allows explicit skip with reason
  actions.push({
    type: 'skip',
    label: 'Skip with reason',
    description: 'Explicitly skip this check and record the reason',
    payload: {
      requiresReason: true,
      skipCategories: ['not-applicable', 'later-phase', 'alternative-evidence', 'known-limitation'],
    },
  });

  // Why-it-matters action - expands the explanation
  actions.push({
    type: 'why-it-matters',
    label: 'Why this matters',
    description: 'Explain why this evidence is required for HoloLand readiness',
  });

  return actions;
}

/**
 * Get attach instruction for a specific warning.
 */
function getAttachDescription(warningId: string): string {
  const descriptions: Record<string, string> = {
    'g_hw_headset_report': 'Export observations.md from Studio /quest-probe and attach',
    'g_hw_replay_receipt': 'Pass --replay with a scene replay, trace, or validation receipt',
    'g_hw_webgpu_browser': 'Run scripts/probe-webgpu.mjs or pass --webgpu-report',
    'g_hw_wasm_simd': 'Upgrade Node.js to enable WASM SIMD support',
    'g_hw_gpu_inventory': 'Ensure GPU drivers are installed and accessible',
  };
  return descriptions[warningId] || 'Attach the required evidence file';
}

/**
 * Get expected artifact type for a warning.
 */
function getExpectedArtifact(warningId: string): string {
  const artifacts: Record<string, string> = {
    'g_hw_headset_report': 'observations.md (QuestProbe markdown)',
    'g_hw_replay_receipt': 'scene-replay.json or validation-receipt.json',
    'g_hw_webgpu_browser': 'webgpu-report.json',
    'g_hw_wasm_simd': 'N/A (hardware capability)',
    'g_hw_gpu_inventory': 'N/A (hardware detection)',
  };
  return artifacts[warningId] || 'evidence file';
}

/**
 * Get attach command for a warning.
 */
function getAttachCommand(warningId: string): string {
  const commands: Record<string, string> = {
    'g_hw_headset_report': 'hololand-device-lab --headset-report ./observations.md',
    'g_hw_replay_receipt': 'hololand-device-lab --replay ./scene-replay.json',
    'g_hw_webgpu_browser': 'node scripts/probe-webgpu.mjs --output webgpu-report.json',
    'g_hw_wasm_simd': 'N/A',
    'g_hw_gpu_inventory': 'N/A',
  };
  return commands[warningId] || 'hololand-device-lab --attach <file>';
}

// ── UI Helper Functions ──

/**
 * Get CSS color class for a warning severity.
 */
export function getWarningColorClass(severity: WarningSeverity): string {
  const colors: Record<WarningSeverity, string> = {
    low: 'warning-low',
    medium: 'warning-medium',
    high: 'warning-high',
    critical: 'warning-critical',
  };
  return colors[severity];
}

/**
 * Get icon name for a warning severity.
 */
export function getWarningIcon(severity: WarningSeverity): string {
  switch (severity) {
    case 'low':
      return 'info';
    case 'medium':
      return 'alert-triangle';
    case 'high':
      return 'alert-circle';
    case 'critical':
      return 'alert-octagon';
    default:
      return 'alert-circle';
  }
}

/**
 * Format warning token for HoloShell consumption.
 */
export function formatWarningForHoloShell(token: DeviceLabWarningToken): string {
  return `[${token.severity.toUpperCase()}] ${token.title}: ${token.detail}`;
}

/**
 * Compute overall warning summary from tokens.
 */
export function summarizeWarningTokens(tokens: DeviceLabWarningToken[]): string {
  if (tokens.length === 0) {
    return 'All evidence attached';
  }

  const highOrCritical = tokens.filter((t) => t.severity === 'high' || t.severity === 'critical').length;
  const medium = tokens.filter((t) => t.severity === 'medium').length;
  const low = tokens.filter((t) => t.severity === 'low').length;

  const parts: string[] = [];
  if (highOrCritical > 0) parts.push(`${highOrCritical} critical`);
  if (medium > 0) parts.push(`${medium} medium`);
  if (low > 0) parts.push(`${low} low`);

  return `${tokens.length} evidence gap${tokens.length > 1 ? 's' : ''}: ${parts.join(', ')}`;
}
