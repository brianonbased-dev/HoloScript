/**
 * Tests for the requireCapability authorization helper.
 *
 * Coverage:
 * - Unsigned + signing-invalid guards (defense-in-depth — should never reach
 *   the helper in normal flow, but catches mis-wired handlers)
 * - Capability path: scope match → authorized; scope mismatch → reason
 * - Dual path: default allowed; allowDual=false → reason='capability-required'
 * - Classical path: default rejected; allowClassical=true → authorized
 * - Unknown protocol (legacy unset path) → fails closed
 *
 * Discipline: G.GOLD.013 paired FALSE+TRUE for every code path. Each
 * AuthorizationFailureReason has at least one test that produces it.
 */
import { describe, expect, it } from 'vitest';
import type { Capability } from '@holoscript/secrets-broker';
import {
  requireCapability,
  type AuthorizationResult,
  type SigningContext,
} from '../signing-middleware';

// ── Synthetic SigningContext builders ────────────────────────────────

function classicalSignedCtx(overrides: Partial<SigningContext> = {}): SigningContext {
  return {
    signedRequest: true,
    signingValid: true,
    signer: '0xcafe',
    signingProtocol: 'classical',
    ...overrides,
  };
}

function dualSignedCtx(overrides: Partial<SigningContext> = {}): SigningContext {
  return {
    signedRequest: true,
    signingValid: true,
    signer: '0xcafe',
    signingProtocol: 'dual',
    dualMode: 'dual',
    ...overrides,
  };
}

function capabilitySignedCtx(
  capabilityScope: Capability,
  overrides: Partial<SigningContext> = {}
): SigningContext {
  return {
    signedRequest: true,
    signingValid: true,
    signer: 'claude1',
    signingProtocol: 'capability',
    capabilityScope,
    ...overrides,
  };
}

const NEEDED: Capability = 'mesh:claim';

// ── Guard checks (unsigned / invalid / no signer) ─────────────────────

describe('requireCapability — guards', () => {
  it('FALSE: unsigned request → reason=unsigned', () => {
    const ctx: SigningContext = {
      signedRequest: false,
      signingValid: true,
      signer: null,
      signingProtocol: 'classical',
    };
    const r = requireCapability(ctx, NEEDED);
    expect(r.authorized).toBe(false);
    expect((r as Extract<AuthorizationResult, { authorized: false }>).reason).toBe('unsigned');
  });

  it('FALSE: signed but signing-invalid → reason=signing-invalid', () => {
    const ctx: SigningContext = {
      signedRequest: true,
      signingValid: false,
      signer: null,
      signingProtocol: 'classical',
      signingReason: 'signer-not-attested',
    };
    const r = requireCapability(ctx, NEEDED);
    expect(r.authorized).toBe(false);
    expect((r as Extract<AuthorizationResult, { authorized: false }>).reason).toBe('signing-invalid');
  });

  it('FALSE: signingValid=true but signer=null (inconsistent ctx) → reason=signing-invalid (defense-in-depth)', () => {
    const ctx: SigningContext = {
      signedRequest: true,
      signingValid: true,
      signer: null,
      signingProtocol: 'classical',
    };
    const r = requireCapability(ctx, NEEDED);
    expect(r.authorized).toBe(false);
    expect((r as Extract<AuthorizationResult, { authorized: false }>).reason).toBe('signing-invalid');
  });
});

// ── Capability protocol path ──────────────────────────────────────────

describe('requireCapability — capability protocol', () => {
  it('TRUE: capability scope matches → authorized with protocol=capability', () => {
    const ctx = capabilitySignedCtx(NEEDED);
    const r = requireCapability(ctx, NEEDED);
    expect(r.authorized).toBe(true);
    if (r.authorized) {
      expect(r.signer).toBe('claude1');
      expect(r.protocol).toBe('capability');
    }
  });

  it('FALSE: capability scope mismatches → reason=capability-scope-mismatch', () => {
    const ctx = capabilitySignedCtx('mesh:read');
    const r = requireCapability(ctx, 'mesh:claim');
    expect(r.authorized).toBe(false);
    expect((r as Extract<AuthorizationResult, { authorized: false }>).reason).toBe(
      'capability-scope-mismatch'
    );
  });

  it('FALSE: capabilityScope missing entirely on capability ctx → scope-mismatch', () => {
    const ctx: SigningContext = {
      signedRequest: true,
      signingValid: true,
      signer: 'claude1',
      signingProtocol: 'capability',
      // capabilityScope intentionally absent
    };
    const r = requireCapability(ctx, 'mesh:claim');
    expect(r.authorized).toBe(false);
    expect((r as Extract<AuthorizationResult, { authorized: false }>).reason).toBe(
      'capability-scope-mismatch'
    );
  });

  it('TRUE: capability scope check is identity-strict (no fuzzy match)', () => {
    // 'mesh:read' and 'mesh:claim' are distinct strings — strict equality.
    const ctxClaim = capabilitySignedCtx('mesh:claim');
    expect(requireCapability(ctxClaim, 'mesh:claim').authorized).toBe(true);
    expect(requireCapability(ctxClaim, 'mesh:read').authorized).toBe(false);

    const ctxRead = capabilitySignedCtx('mesh:read');
    expect(requireCapability(ctxRead, 'mesh:read').authorized).toBe(true);
    expect(requireCapability(ctxRead, 'mesh:claim').authorized).toBe(false);
  });
});

// ── Dual protocol path ────────────────────────────────────────────────

describe('requireCapability — dual protocol', () => {
  it('TRUE: dual ctx with default options → authorized (default allowDual=true)', () => {
    const ctx = dualSignedCtx();
    const r = requireCapability(ctx, NEEDED);
    expect(r.authorized).toBe(true);
    if (r.authorized) {
      expect(r.protocol).toBe('dual');
      expect(r.signer).toBe('0xcafe');
    }
  });

  it('FALSE: dual ctx with allowDual=false → reason=capability-required', () => {
    const ctx = dualSignedCtx();
    const r = requireCapability(ctx, NEEDED, { allowDual: false });
    expect(r.authorized).toBe(false);
    expect((r as Extract<AuthorizationResult, { authorized: false }>).reason).toBe(
      'capability-required'
    );
  });

  it('TRUE: explicit allowDual=true is the same as default', () => {
    const ctx = dualSignedCtx();
    expect(requireCapability(ctx, NEEDED, { allowDual: true }).authorized).toBe(true);
  });
});

// ── Classical protocol path ───────────────────────────────────────────

describe('requireCapability — classical protocol', () => {
  it('FALSE: classical ctx with default options → reason=capability-required (default-deny)', () => {
    const ctx = classicalSignedCtx();
    const r = requireCapability(ctx, NEEDED);
    expect(r.authorized).toBe(false);
    expect((r as Extract<AuthorizationResult, { authorized: false }>).reason).toBe(
      'capability-required'
    );
  });

  it('TRUE: classical ctx with allowClassical=true → authorized', () => {
    const ctx = classicalSignedCtx();
    const r = requireCapability(ctx, NEEDED, { allowClassical: true });
    expect(r.authorized).toBe(true);
    if (r.authorized) {
      expect(r.protocol).toBe('classical');
      expect(r.signer).toBe('0xcafe');
    }
  });

  it('FALSE: classical ctx with allowClassical=false explicit → still rejected', () => {
    const ctx = classicalSignedCtx();
    expect(
      requireCapability(ctx, NEEDED, { allowClassical: false }).authorized
    ).toBe(false);
  });
});

// ── Unknown protocol (legacy / forward-compat) ────────────────────────

describe('requireCapability — unknown protocol', () => {
  it('FALSE: signingProtocol undefined → reason=unknown-protocol (fail closed)', () => {
    const ctx: SigningContext = {
      signedRequest: true,
      signingValid: true,
      signer: '0xcafe',
      // signingProtocol intentionally absent
    };
    const r = requireCapability(ctx, NEEDED);
    expect(r.authorized).toBe(false);
    expect((r as Extract<AuthorizationResult, { authorized: false }>).reason).toBe(
      'unknown-protocol'
    );
  });

  it('FALSE: signingProtocol set to an unrecognized value → unknown-protocol', () => {
    const ctx = {
      signedRequest: true,
      signingValid: true,
      signer: '0xcafe',
      signingProtocol: 'future-mode-9000',
    } as unknown as SigningContext;
    const r = requireCapability(ctx, NEEDED);
    expect(r.authorized).toBe(false);
    expect((r as Extract<AuthorizationResult, { authorized: false }>).reason).toBe(
      'unknown-protocol'
    );
  });
});

// ── Option combinations (G.GOLD.015 experienced-failure category) ─────

describe('requireCapability — option combinations', () => {
  it('TRUE: capability ctx ignores allowClassical/allowDual entirely (scope is the gate)', () => {
    const ctx = capabilitySignedCtx(NEEDED);
    expect(
      requireCapability(ctx, NEEDED, { allowClassical: false, allowDual: false }).authorized
    ).toBe(true);
  });

  it('TRUE: classical + dual combo (allowDual=false, allowClassical=true) — only classical passes', () => {
    const classical = classicalSignedCtx();
    const dual = dualSignedCtx();
    const opts = { allowClassical: true, allowDual: false };
    expect(requireCapability(classical, NEEDED, opts).authorized).toBe(true);
    expect(requireCapability(dual, NEEDED, opts).authorized).toBe(false);
  });
});
