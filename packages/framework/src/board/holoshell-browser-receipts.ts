/**
 * HoloShell Browser Absorption Receipts — Pilot
 *
 * Receipt types for browser automation workflows absorbed into HoloScript.
 * Playwright/Chrome agent behind a HoloScript policy envelope produces
 * deterministic evidence: screenshots, network logs, cookie/session audits.
 *
 * Trust floor: `external` (per legacy-absorption-paths.md Browser Automation path).
 * Target upgrade: Native API / MCP when vendor ships first-party programmatic surface.
 *
 * Phase 1 pilot — may migrate to dedicated @holoshell/browser package when
 * the absorption surface stabilizes.
 */

import type {
  ArtifactProvenanceLink,
  ArtifactVerificationCommand,
} from './board-types';

// ── Browser Action ──

export const BROWSER_ACTION_KINDS = [
  'navigate',
  'click',
  'type',
  'scroll',
  'wait',
  'screenshot',
  'hover',
  'focus',
  'submit',
  'download',
  'upload',
  'other',
] as const;

export type BrowserActionKind = (typeof BROWSER_ACTION_KINDS)[number];

/** A single step in a browser automation sequence. */
export interface BrowserAction {
  /** Sequential step number within the receipt. */
  step: number;
  /** Action family. */
  kind: BrowserActionKind;
  /** ISO-8601 timestamp when the action was executed. */
  timestamp: string;
  /** CSS selector or XPath that identified the target element. */
  selector?: string;
  /** Input value (for type, upload, etc.). */
  value?: string;
  /** URL after the action completed (for navigate, click, submit). */
  url?: string;
  /** Hash of screenshot taken before the action. */
  screenshotBeforeHash?: string;
  /** Hash of screenshot taken after the action. */
  screenshotAfterHash?: string;
  /** Wall-clock duration of the action in milliseconds. */
  durationMs?: number;
}

// ── Policy Envelope ──

/**
 * Policy envelope that constrains a browser automation session.
 * Matches the HoloScript safety envelope pattern but scoped to
 * browser-specific risks (domain traversal, credential leakage,
 * screenshot exposure, session hijacking).
 */
export interface BrowserAbsorptionPolicy {
  /** Domains the agent is permitted to navigate to. */
  allowedDomains: string[];
  /** Domains the agent must never navigate to. Blacklist overrides whitelist. */
  blockedDomains: string[];
  /** Actions the agent is permitted to execute. Empty = all permitted (dangerous). */
  allowedActions: string[];
  /** Maximum total session duration in milliseconds. */
  maxDurationMs: number;
  /** Whether the browser runs headless (no visible window). */
  headless: boolean;
  /** Whether the user can see the browser window during automation. */
  userVisible: boolean;
  /** Interval between automatic screenshots in milliseconds. 0 = no automatic screenshots. */
  screenshotIntervalMs?: number;
  /** Whether to capture the full network log (HAR format). */
  captureNetworkLog: boolean;
  /** Whether to audit cookies and localStorage before and after. */
  auditSessionState: boolean;
}

// ── Receipt ──

/**
 * Browser absorption pilot receipt.
 *
 * Evidence produced by a Playwright/Chrome agent operating behind a
 * HoloScript policy envelope. The receipt is the deterministic, auditable
 * record that a browser automation workflow executed as claimed.
 */
export interface BrowserAbsorptionReceipt {
  /** Stable receipt id, e.g. `browser_gmail_export_20260513_xyz`. */
  id: string;
  /** Primary domain operated against. */
  domain: string;
  /** Initial URL the session started from. */
  url: string;
  /** ISO-8601 timestamp when the session started. */
  startedAt: string;
  /** ISO-8601 timestamp when the session ended. */
  endedAt: string;
  /** Policy envelope that constrained this session. */
  policy: BrowserAbsorptionPolicy;
  /** Hash of the canonical final screenshot (primary evidence). */
  screenshotHash: string;
  /** Hash algorithm for the screenshot. */
  screenshotHashAlgorithm: string;
  /** Hash of the captured network log (HAR), if captured. */
  networkLogHash?: string;
  /** Hash of the cookie + localStorage audit snapshot, if audited. */
  cookieAuditHash?: string;
  /** Hash of the full session state dump, if captured. */
  sessionStateHash?: string;
  /** Ordered action sequence that reproduces the session. */
  actions: BrowserAction[];
  /** Overall outcome of the session. */
  outcome: 'success' | 'failure' | 'timeout' | 'blocked_by_policy';
  /** Human-readable summary, kept short (under ~200 chars by convention). */
  summary?: string;
  /** Hash of the canonical receipt body (id + domain + url + ordered actions + policy). */
  hash: string;
  hashAlgorithm: string;
  /** Provenance link back to the producing task / commit. */
  provenance?: ArtifactProvenanceLink;
  /** Verification commands that reproduce the automation. */
  verificationCommands?: ArtifactVerificationCommand[];
  metadata?: Record<string, unknown>;
}

// ── Validators ──

/**
 * Validate a BrowserAbsorptionReceipt. Returns a list of validation errors;
 * empty array means the receipt is structurally valid.
 */
export function validateBrowserAbsorptionReceipt(receipt: BrowserAbsorptionReceipt): string[] {
  const errors: string[] = [];
  if (!receipt.id) errors.push('BrowserAbsorptionReceipt.id is required.');
  if (!receipt.domain) errors.push('BrowserAbsorptionReceipt.domain is required.');
  if (!receipt.url) errors.push('BrowserAbsorptionReceipt.url is required.');

  if (
    receipt.startedAt === undefined ||
    receipt.startedAt === null ||
    receipt.startedAt === '' ||
    Number.isNaN(Date.parse(receipt.startedAt))
  ) {
    errors.push('BrowserAbsorptionReceipt.startedAt is required and must be a valid ISO-8601 timestamp.');
  }
  if (
    receipt.endedAt === undefined ||
    receipt.endedAt === null ||
    receipt.endedAt === '' ||
    Number.isNaN(Date.parse(receipt.endedAt))
  ) {
    errors.push('BrowserAbsorptionReceipt.endedAt is required and must be a valid ISO-8601 timestamp.');
  }

  // Policy validation
  if (!receipt.policy || typeof receipt.policy !== 'object') {
    errors.push('BrowserAbsorptionReceipt.policy is required.');
  } else {
    const p = receipt.policy;
    if (!Array.isArray(p.allowedDomains)) {
      errors.push('BrowserAbsorptionReceipt.policy.allowedDomains must be an array.');
    }
    if (!Array.isArray(p.blockedDomains)) {
      errors.push('BrowserAbsorptionReceipt.policy.blockedDomains must be an array.');
    }
    if (p.maxDurationMs === undefined || typeof p.maxDurationMs !== 'number' || p.maxDurationMs < 0) {
      errors.push('BrowserAbsorptionReceipt.policy.maxDurationMs must be a non-negative number.');
    }
    if (typeof p.headless !== 'boolean') {
      errors.push('BrowserAbsorptionReceipt.policy.headless must be a boolean.');
    }
    if (typeof p.userVisible !== 'boolean') {
      errors.push('BrowserAbsorptionReceipt.policy.userVisible must be a boolean.');
    }
    if (typeof p.captureNetworkLog !== 'boolean') {
      errors.push('BrowserAbsorptionReceipt.policy.captureNetworkLog must be a boolean.');
    }
    if (typeof p.auditSessionState !== 'boolean') {
      errors.push('BrowserAbsorptionReceipt.policy.auditSessionState must be a boolean.');
    }
    for (const action of p.allowedActions ?? []) {
      if (!isSupportedBrowserActionKind(action)) {
        errors.push(`BrowserAbsorptionReceipt.policy.allowedActions contains unsupported kind: ${String(action)}.`);
      }
    }
  }

  if (!receipt.screenshotHash) errors.push('BrowserAbsorptionReceipt.screenshotHash is required.');
  if (!receipt.screenshotHashAlgorithm) {
    errors.push('BrowserAbsorptionReceipt.screenshotHashAlgorithm is required.');
  }

  if (!receipt.hash) errors.push('BrowserAbsorptionReceipt.hash is required.');
  if (!receipt.hashAlgorithm) errors.push('BrowserAbsorptionReceipt.hashAlgorithm is required.');

  if (!Array.isArray(receipt.actions)) {
    errors.push('BrowserAbsorptionReceipt.actions must be an array.');
  } else {
    for (const action of receipt.actions) {
      if (typeof action.step !== 'number' || action.step < 0) {
        errors.push(`BrowserAction step must be a non-negative number.`);
      }
      if (!isSupportedBrowserActionKind(action.kind)) {
        errors.push(`BrowserAction kind is unsupported: ${String(action.kind)}.`);
      }
      if (
        action.timestamp === undefined ||
        action.timestamp === null ||
        action.timestamp === '' ||
        Number.isNaN(Date.parse(action.timestamp))
      ) {
        errors.push(`BrowserAction step ${action.step} timestamp is invalid.`);
      }
      if (action.durationMs !== undefined && (typeof action.durationMs !== 'number' || action.durationMs < 0)) {
        errors.push(`BrowserAction step ${action.step} durationMs must be a non-negative number.`);
      }
    }
  }

  if (!isSupportedBrowserAbsorptionOutcome(receipt.outcome)) {
    errors.push(`BrowserAbsorptionReceipt.outcome is unsupported: ${String(receipt.outcome)}.`);
  }

  for (const command of receipt.verificationCommands ?? []) {
    if (!command.command) {
      errors.push(`BrowserAbsorptionReceipt ${receipt.id || '<unknown>'} has a verification command without command text.`);
    }
  }

  return errors;
}

// ── Type guards ──

export function isSupportedBrowserActionKind(kind: string): kind is BrowserActionKind {
  return (BROWSER_ACTION_KINDS as readonly string[]).includes(kind);
}

const BROWSER_ABSORPTION_OUTCOMES = ['success', 'failure', 'timeout', 'blocked_by_policy'] as const;

export function isSupportedBrowserAbsorptionOutcome(
  outcome: string,
): outcome is BrowserAbsorptionReceipt['outcome'] {
  return (BROWSER_ABSORPTION_OUTCOMES as readonly string[]).includes(outcome);
}

// ── Cloning ──

function cloneBrowserActions(actions: BrowserAction[]): BrowserAction[] {
  return actions.map((a) => ({ ...a }));
}

function cloneBrowserPolicy(policy: BrowserAbsorptionPolicy): BrowserAbsorptionPolicy {
  return {
    ...policy,
    allowedDomains: [...policy.allowedDomains],
    blockedDomains: [...policy.blockedDomains],
    allowedActions: [...policy.allowedActions],
  };
}

function cloneVerificationCommands(
  commands: ArtifactVerificationCommand[] | undefined,
): ArtifactVerificationCommand[] | undefined {
  if (!commands) return undefined;
  return commands.map((command) => ({
    ...command,
    ...(command.artifactIds ? { artifactIds: [...command.artifactIds] } : {}),
  }));
}

function cloneProvenance(
  provenance: ArtifactProvenanceLink | undefined,
): ArtifactProvenanceLink | undefined {
  if (!provenance) return undefined;
  return {
    ...provenance,
    ...(provenance.parentArtifactIds
      ? { parentArtifactIds: [...provenance.parentArtifactIds] }
      : {}),
  };
}

export function cloneBrowserAbsorptionReceipt(
  receipt: BrowserAbsorptionReceipt,
): BrowserAbsorptionReceipt {
  return {
    ...receipt,
    policy: cloneBrowserPolicy(receipt.policy),
    actions: cloneBrowserActions(receipt.actions),
    ...(receipt.provenance ? { provenance: cloneProvenance(receipt.provenance) } : {}),
    ...(receipt.verificationCommands
      ? { verificationCommands: cloneVerificationCommands(receipt.verificationCommands) }
      : {}),
    ...(receipt.metadata ? { metadata: { ...receipt.metadata } } : {}),
  };
}
