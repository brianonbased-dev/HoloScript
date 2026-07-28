import { describe, expect, it } from 'vitest';
import {
  GATED_EXECUTION_KINDS,
  gateDesktopExecution,
  type BrowserAbsorptionPolicy,
  type ExecutionConsentToken,
} from '../board';

const FUTURE = '2099-01-01T00:00:00.000Z';
const PAST = '2000-01-01T00:00:00.000Z';
const NOW = '2026-06-24T12:00:00.000Z';

function makePolicy(overrides: Partial<BrowserAbsorptionPolicy> = {}): BrowserAbsorptionPolicy {
  return {
    allowedDomains: [],
    blockedDomains: [],
    allowedActions: [],
    maxDurationMs: 60_000,
    headless: true,
    userVisible: false,
    captureNetworkLog: false,
    auditSessionState: false,
    ...overrides,
  };
}

function makeToken(overrides: Partial<ExecutionConsentToken> = {}): ExecutionConsentToken {
  return {
    tokenId: 'tok_test_001',
    grantedAt: '2026-06-24T11:00:00.000Z',
    expiresAt: FUTURE,
    policy: makePolicy(),
    includesIrreversible: false,
    scope: 'test session',
    ...overrides,
  };
}

describe('GATED_EXECUTION_KINDS', () => {
  it('includes click, type, submit, download, upload', () => {
    expect(GATED_EXECUTION_KINDS.has('click')).toBe(true);
    expect(GATED_EXECUTION_KINDS.has('type')).toBe(true);
    expect(GATED_EXECUTION_KINDS.has('submit')).toBe(true);
    expect(GATED_EXECUTION_KINDS.has('download')).toBe(true);
    expect(GATED_EXECUTION_KINDS.has('upload')).toBe(true);
  });

  it('does not include read-only kinds', () => {
    expect(GATED_EXECUTION_KINDS.has('navigate')).toBe(false);
    expect(GATED_EXECUTION_KINDS.has('screenshot')).toBe(false);
    expect(GATED_EXECUTION_KINDS.has('scroll')).toBe(false);
    expect(GATED_EXECUTION_KINDS.has('hover')).toBe(false);
  });
});

describe('gateDesktopExecution — read-only actions', () => {
  it('admits navigate without any token', () => {
    const result = gateDesktopExecution({ kind: 'navigate' }, null, NOW);
    expect(result.admitted).toBe(true);
    expect(result.reason).toMatch(/read-only/);
  });

  it('admits screenshot without any token', () => {
    const result = gateDesktopExecution({ kind: 'screenshot' }, undefined, NOW);
    expect(result.admitted).toBe(true);
  });

  it('admits scroll without any token', () => {
    expect(gateDesktopExecution({ kind: 'scroll' }, null, NOW).admitted).toBe(true);
  });

  it('admits hover without any token', () => {
    expect(gateDesktopExecution({ kind: 'hover' }, null, NOW).admitted).toBe(true);
  });
});

describe('gateDesktopExecution — missing token', () => {
  it('blocks click when no token provided', () => {
    const result = gateDesktopExecution({ kind: 'click' }, null, NOW);
    expect(result.admitted).toBe(false);
    expect(result.reason).toMatch(/ExecutionConsentToken/i);
    expect(result.tokenId).toBeUndefined();
  });

  it('blocks type when token is undefined', () => {
    const result = gateDesktopExecution({ kind: 'type' }, undefined, NOW);
    expect(result.admitted).toBe(false);
  });
});

describe('gateDesktopExecution — expired token', () => {
  it('blocks click when token is expired', () => {
    const token = makeToken({ expiresAt: PAST });
    const result = gateDesktopExecution({ kind: 'click' }, token, NOW);
    expect(result.admitted).toBe(false);
    expect(result.reason).toMatch(/expired/);
    expect(result.reason).toContain('tok_test_001');
  });
});

describe('gateDesktopExecution — allowedActions policy', () => {
  it('blocks action kind not in allowedActions when list is non-empty', () => {
    const token = makeToken({ policy: makePolicy({ allowedActions: ['type'] }) });
    const result = gateDesktopExecution({ kind: 'click' }, token, NOW);
    expect(result.admitted).toBe(false);
    expect(result.reason).toMatch(/"click"/);
    expect(result.reason).toMatch(/allowedActions/);
  });

  it('admits action kind that IS in allowedActions', () => {
    const token = makeToken({ policy: makePolicy({ allowedActions: ['click', 'type'] }) });
    const result = gateDesktopExecution({ kind: 'click' }, token, NOW);
    expect(result.admitted).toBe(true);
    expect(result.tokenId).toBe('tok_test_001');
  });

  it('admits any kind when allowedActions is empty (open policy)', () => {
    const token = makeToken({ policy: makePolicy({ allowedActions: [] }) });
    const result = gateDesktopExecution({ kind: 'click' }, token, NOW);
    expect(result.admitted).toBe(true);
  });
});

describe('gateDesktopExecution — domain policy', () => {
  it('blocks action when target domain is in blockedDomains', () => {
    const token = makeToken({ policy: makePolicy({ blockedDomains: ['evil.com'] }) });
    const result = gateDesktopExecution(
      { kind: 'click', url: 'https://evil.com/path' },
      token,
      NOW
    );
    expect(result.admitted).toBe(false);
    expect(result.reason).toMatch(/evil\.com/);
    expect(result.reason).toMatch(/blocked/i);
  });

  it('blocks action when target domain is NOT in allowedDomains (non-empty list)', () => {
    const token = makeToken({ policy: makePolicy({ allowedDomains: ['good.com'] }) });
    const result = gateDesktopExecution({ kind: 'click', url: 'https://other.com/' }, token, NOW);
    expect(result.admitted).toBe(false);
    expect(result.reason).toMatch(/allowedDomains/);
  });

  it('admits action when target domain IS in allowedDomains', () => {
    const token = makeToken({ policy: makePolicy({ allowedDomains: ['good.com'] }) });
    const result = gateDesktopExecution(
      { kind: 'click', url: 'https://good.com/page' },
      token,
      NOW
    );
    expect(result.admitted).toBe(true);
  });

  it('admits action with no url when allowedDomains is non-empty', () => {
    const token = makeToken({ policy: makePolicy({ allowedDomains: ['good.com'] }) });
    const result = gateDesktopExecution({ kind: 'click' }, token, NOW);
    expect(result.admitted).toBe(true);
  });

  it('admits any domain when allowedDomains is empty', () => {
    const token = makeToken();
    const result = gateDesktopExecution(
      { kind: 'click', url: 'https://anything.example.com/' },
      token,
      NOW
    );
    expect(result.admitted).toBe(true);
  });
});

describe('gateDesktopExecution — irreversible actions', () => {
  it('blocks submit when includesIrreversible is false', () => {
    const token = makeToken({ includesIrreversible: false });
    const result = gateDesktopExecution({ kind: 'submit' }, token, NOW);
    expect(result.admitted).toBe(false);
    expect(result.reason).toMatch(/irreversible/i);
    expect(result.reason).toMatch(/D\.080/);
  });

  it('blocks download when includesIrreversible is false', () => {
    const token = makeToken({ includesIrreversible: false });
    expect(gateDesktopExecution({ kind: 'download' }, token, NOW).admitted).toBe(false);
  });

  it('blocks upload when includesIrreversible is false', () => {
    const token = makeToken({ includesIrreversible: false });
    expect(gateDesktopExecution({ kind: 'upload' }, token, NOW).admitted).toBe(false);
  });

  it('admits submit when includesIrreversible is true', () => {
    const token = makeToken({ includesIrreversible: true });
    const result = gateDesktopExecution({ kind: 'submit' }, token, NOW);
    expect(result.admitted).toBe(true);
    expect(result.tokenId).toBe('tok_test_001');
  });

  it('does not apply irreversible check to click (reversible)', () => {
    const token = makeToken({ includesIrreversible: false });
    const result = gateDesktopExecution({ kind: 'click' }, token, NOW);
    expect(result.admitted).toBe(true);
  });
});

describe('gateDesktopExecution — valid consent path', () => {
  it('returns admitted:true with tokenId on fully valid token', () => {
    const token = makeToken({
      tokenId: 'tok_valid_999',
      policy: makePolicy({
        allowedDomains: ['app.holoscript.net'],
        allowedActions: ['click', 'type'],
      }),
    });
    const result = gateDesktopExecution(
      { kind: 'click', url: 'https://app.holoscript.net/dashboard' },
      token,
      NOW
    );
    expect(result.admitted).toBe(true);
    expect(result.tokenId).toBe('tok_valid_999');
    expect(result.reason).toMatch(/consent verified/);
  });
});
