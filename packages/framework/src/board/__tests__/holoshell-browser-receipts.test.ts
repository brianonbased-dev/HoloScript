/**
 * HoloShell Browser Absorption Receipt — Unit Tests
 *
 * Validates the pilot receipt model, validator, type guard, and clone.
 */

import { describe, it, expect } from 'vitest';
import {
  BROWSER_ACTION_KINDS,
  type BrowserAction,
  type BrowserAbsorptionPolicy,
  type BrowserAbsorptionReceipt,
  validateBrowserAbsorptionReceipt,
  isSupportedBrowserActionKind,
  isSupportedBrowserAbsorptionOutcome,
  cloneBrowserAbsorptionReceipt,
} from '../holoshell-browser-receipts';

function makeValidReceipt(): BrowserAbsorptionReceipt {
  return {
    id: 'browser_test_001',
    domain: 'mail.google.com',
    url: 'https://mail.google.com',
    startedAt: '2026-05-13T10:00:00Z',
    endedAt: '2026-05-13T10:01:00Z',
    policy: {
      allowedDomains: ['mail.google.com'],
      blockedDomains: ['evil.com'],
      allowedActions: ['navigate', 'click', 'type', 'screenshot'],
      maxDurationMs: 120_000,
      headless: true,
      userVisible: false,
      captureNetworkLog: true,
      auditSessionState: true,
    },
    screenshotHash: 'abc123',
    screenshotHashAlgorithm: 'sha256',
    networkLogHash: 'def456',
    cookieAuditHash: 'ghi789',
    sessionStateHash: 'jkl012',
    actions: [
      {
        step: 0,
        kind: 'navigate',
        timestamp: '2026-05-13T10:00:00Z',
        url: 'https://mail.google.com',
      },
      {
        step: 1,
        kind: 'click',
        timestamp: '2026-05-13T10:00:05Z',
        selector: '[data-testid="compose-button"]',
        durationMs: 500,
      },
      {
        step: 2,
        kind: 'type',
        timestamp: '2026-05-13T10:00:10Z',
        selector: '[data-testid="to-field"]',
        value: 'test@example.com',
        durationMs: 2000,
      },
      {
        step: 3,
        kind: 'screenshot',
        timestamp: '2026-05-13T10:01:00Z',
      },
    ],
    outcome: 'success',
    summary: 'Composed email draft via browser automation.',
    hash: 'receipt_hash_001',
    hashAlgorithm: 'sha256',
    provenance: {
      parentArtifactIds: ['task_1778625587950_34rn'],
    },
    verificationCommands: [
      {
        command: 'npx playwright replay scripts/browser-automation/test-001.js',
        description: 'Replay the browser automation session',
      },
    ],
    metadata: { browser: 'chromium', version: '135.0.7049.0' },
  };
}

describe('BROWSER_ACTION_KINDS', () => {
  it('contains all 12 action kinds', () => {
    expect(BROWSER_ACTION_KINDS).toHaveLength(12);
    expect(BROWSER_ACTION_KINDS).toContain('navigate');
    expect(BROWSER_ACTION_KINDS).toContain('click');
    expect(BROWSER_ACTION_KINDS).toContain('type');
    expect(BROWSER_ACTION_KINDS).toContain('scroll');
    expect(BROWSER_ACTION_KINDS).toContain('wait');
    expect(BROWSER_ACTION_KINDS).toContain('screenshot');
    expect(BROWSER_ACTION_KINDS).toContain('hover');
    expect(BROWSER_ACTION_KINDS).toContain('focus');
    expect(BROWSER_ACTION_KINDS).toContain('submit');
    expect(BROWSER_ACTION_KINDS).toContain('download');
    expect(BROWSER_ACTION_KINDS).toContain('upload');
    expect(BROWSER_ACTION_KINDS).toContain('other');
  });
});

describe('isSupportedBrowserActionKind', () => {
  it('returns true for known kinds', () => {
    expect(isSupportedBrowserActionKind('navigate')).toBe(true);
    expect(isSupportedBrowserActionKind('screenshot')).toBe(true);
    expect(isSupportedBrowserActionKind('other')).toBe(true);
  });

  it('returns false for unknown kinds', () => {
    expect(isSupportedBrowserActionKind('hack')).toBe(false);
    expect(isSupportedBrowserActionKind('')).toBe(false);
  });
});

describe('isSupportedBrowserAbsorptionOutcome', () => {
  it('returns true for known outcomes', () => {
    expect(isSupportedBrowserAbsorptionOutcome('success')).toBe(true);
    expect(isSupportedBrowserAbsorptionOutcome('failure')).toBe(true);
    expect(isSupportedBrowserAbsorptionOutcome('timeout')).toBe(true);
    expect(isSupportedBrowserAbsorptionOutcome('blocked_by_policy')).toBe(true);
  });

  it('returns false for unknown outcomes', () => {
    expect(isSupportedBrowserAbsorptionOutcome('cancelled')).toBe(false);
    expect(isSupportedBrowserAbsorptionOutcome('')).toBe(false);
  });
});

describe('validateBrowserAbsorptionReceipt', () => {
  it('returns empty for a valid receipt', () => {
    const receipt = makeValidReceipt();
    expect(validateBrowserAbsorptionReceipt(receipt)).toEqual([]);
  });

  it('requires id', () => {
    const receipt = { ...makeValidReceipt(), id: '' };
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAbsorptionReceipt.id is required.',
    );
  });

  it('requires domain', () => {
    const receipt = { ...makeValidReceipt(), domain: '' };
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAbsorptionReceipt.domain is required.',
    );
  });

  it('requires url', () => {
    const receipt = { ...makeValidReceipt(), url: '' };
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAbsorptionReceipt.url is required.',
    );
  });

  it('requires valid startedAt', () => {
    const receipt = { ...makeValidReceipt(), startedAt: 'invalid' };
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAbsorptionReceipt.startedAt is required and must be a valid ISO-8601 timestamp.',
    );
  });

  it('requires valid endedAt', () => {
    const receipt = { ...makeValidReceipt(), endedAt: '' };
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAbsorptionReceipt.endedAt is required and must be a valid ISO-8601 timestamp.',
    );
  });

  it('requires policy', () => {
    const receipt = { ...makeValidReceipt(), policy: undefined as unknown as BrowserAbsorptionPolicy };
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAbsorptionReceipt.policy is required.',
    );
  });

  it('requires policy.allowedDomains as array', () => {
    const receipt = makeValidReceipt();
    receipt.policy = { ...receipt.policy, allowedDomains: 'bad' as unknown as string[] };
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAbsorptionReceipt.policy.allowedDomains must be an array.',
    );
  });

  it('requires policy.maxDurationMs as non-negative number', () => {
    const receipt = makeValidReceipt();
    receipt.policy = { ...receipt.policy, maxDurationMs: -1 };
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAbsorptionReceipt.policy.maxDurationMs must be a non-negative number.',
    );
  });

  it('requires policy.headless as boolean', () => {
    const receipt = makeValidReceipt();
    receipt.policy = { ...receipt.policy, headless: 'true' as unknown as boolean };
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAbsorptionReceipt.policy.headless must be a boolean.',
    );
  });

  it('requires policy.userVisible as boolean', () => {
    const receipt = makeValidReceipt();
    receipt.policy = { ...receipt.policy, userVisible: 'true' as unknown as boolean };
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAbsorptionReceipt.policy.userVisible must be a boolean.',
    );
  });

  it('rejects unsupported allowedActions', () => {
    const receipt = makeValidReceipt();
    receipt.policy = { ...receipt.policy, allowedActions: ['navigate', 'hack'] as string[] };
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAbsorptionReceipt.policy.allowedActions contains unsupported kind: hack.',
    );
  });

  it('requires screenshotHash', () => {
    const receipt = { ...makeValidReceipt(), screenshotHash: '' };
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAbsorptionReceipt.screenshotHash is required.',
    );
  });

  it('requires screenshotHashAlgorithm', () => {
    const receipt = { ...makeValidReceipt(), screenshotHashAlgorithm: '' };
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAbsorptionReceipt.screenshotHashAlgorithm is required.',
    );
  });

  it('requires hash', () => {
    const receipt = { ...makeValidReceipt(), hash: '' };
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAbsorptionReceipt.hash is required.',
    );
  });

  it('requires hashAlgorithm', () => {
    const receipt = { ...makeValidReceipt(), hashAlgorithm: '' };
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAbsorptionReceipt.hashAlgorithm is required.',
    );
  });

  it('requires actions as array', () => {
    const receipt = { ...makeValidReceipt(), actions: 'bad' as unknown as BrowserAction[] };
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAbsorptionReceipt.actions must be an array.',
    );
  });

  it('rejects action with negative step', () => {
    const receipt = makeValidReceipt();
    receipt.actions = [{ ...receipt.actions[0], step: -1 }];
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAction step must be a non-negative number.',
    );
  });

  it('rejects action with unsupported kind', () => {
    const receipt = makeValidReceipt();
    receipt.actions = [{ ...receipt.actions[0], kind: 'hack' as unknown as BrowserAction['kind'] }];
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAction kind is unsupported: hack.',
    );
  });

  it('rejects action with invalid timestamp', () => {
    const receipt = makeValidReceipt();
    receipt.actions = [{ ...receipt.actions[0], timestamp: 'not-a-date' }];
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAction step 0 timestamp is invalid.',
    );
  });

  it('rejects action with negative durationMs', () => {
    const receipt = makeValidReceipt();
    receipt.actions = [{ ...receipt.actions[0], durationMs: -100 }];
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAction step 0 durationMs must be a non-negative number.',
    );
  });

  it('rejects unsupported outcome', () => {
    const receipt = { ...makeValidReceipt(), outcome: 'cancelled' as unknown as BrowserAbsorptionReceipt['outcome'] };
    expect(validateBrowserAbsorptionReceipt(receipt)).toContain(
      'BrowserAbsorptionReceipt.outcome is unsupported: cancelled.',
    );
  });
});

describe('cloneBrowserAbsorptionReceipt', () => {
  it('produces an equal but independent copy', () => {
    const original = makeValidReceipt();
    const clone = cloneBrowserAbsorptionReceipt(original);
    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.policy).not.toBe(original.policy);
    expect(clone.actions).not.toBe(original.actions);
    expect(clone.policy.allowedDomains).not.toBe(original.policy.allowedDomains);
    expect(clone.verificationCommands).not.toBe(original.verificationCommands);
  });

  it('handles optional fields gracefully', () => {
    const minimal: BrowserAbsorptionReceipt = {
      id: 'minimal',
      domain: 'example.com',
      url: 'https://example.com',
      startedAt: '2026-05-13T10:00:00Z',
      endedAt: '2026-05-13T10:01:00Z',
      policy: {
        allowedDomains: [],
        blockedDomains: [],
        allowedActions: [],
        maxDurationMs: 60_000,
        headless: true,
        userVisible: false,
        captureNetworkLog: false,
        auditSessionState: false,
      },
      screenshotHash: 'abc',
      screenshotHashAlgorithm: 'sha256',
      actions: [],
      outcome: 'success',
      hash: 'hash',
      hashAlgorithm: 'sha256',
    };
    const clone = cloneBrowserAbsorptionReceipt(minimal);
    expect(clone).toEqual(minimal);
    expect(clone.networkLogHash).toBeUndefined();
    expect(clone.cookieAuditHash).toBeUndefined();
    expect(clone.sessionStateHash).toBeUndefined();
    expect(clone.provenance).toBeUndefined();
    expect(clone.verificationCommands).toBeUndefined();
    expect(clone.metadata).toBeUndefined();
  });
});
