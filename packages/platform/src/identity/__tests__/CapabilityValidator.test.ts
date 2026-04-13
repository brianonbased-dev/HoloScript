import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CapabilityValidator,
  type CapabilityToken,
  type CapabilityScope,
} from '@holoscript/core';

describe('CapabilityValidator', () => {
  let validator: CapabilityValidator;

  /** Helper: build a valid token with sensible defaults. */
  function makeToken(overrides: Partial<CapabilityToken> = {}): CapabilityToken {
    return {
      issuer: 'did:key:z6MkIssuer',
      subject: 'did:key:z6MkSubject',
      scopes: [
        {
          resource: 'mvc.decisionHistory',
          actions: ['read', 'write'],
        },
        {
          resource: 'spatial.anchors',
          actions: ['read'],
        },
      ],
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      nonce: `nonce-${Math.random().toString(36).slice(2)}`,
      ...overrides,
    };
  }

  beforeEach(() => {
    validator = new CapabilityValidator();
  });

  // ── 1. valid token passes ───────────────────────────────────────────

  it('should validate a token that has a matching scope', () => {
    const token = makeToken();

    const result = validator.validate(token, 'mvc.decisionHistory', 'write');

    expect(result.valid).toBe(true);
    expect(result.matchedScopes).toBeDefined();
    expect(result.matchedScopes!.length).toBeGreaterThanOrEqual(1);
    expect(result.matchedScopes![0].resource).toBe('mvc.decisionHistory');
  });

  // ── 2. expired token fails ─────────────────────────────────────────

  it('should reject an expired token', () => {
    vi.useFakeTimers();

    const token = makeToken({ expiresAt: Date.now() + 10_000 });

    // Advance time past expiry
    vi.advanceTimersByTime(11_000);

    const result = validator.validate(token, 'mvc.decisionHistory', 'read');

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Token has expired');

    vi.useRealTimers();
  });

  // ── 3. revoked token fails ─────────────────────────────────────────

  it('should reject a revoked token', () => {
    const token = makeToken();

    // Revoke the token by its nonce
    validator.revoke(token.nonce);
    expect(validator.isRevoked(token.nonce)).toBe(true);

    const result = validator.validate(token, 'mvc.decisionHistory', 'read');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Token has been revoked');
  });

  // ── 4. replay detection (used nonce) ───────────────────────────────

  it('should reject a token whose nonce has already been used', () => {
    const token = makeToken();

    // First use is fine
    const first = validator.validate(token, 'mvc.decisionHistory', 'read');
    expect(first.valid).toBe(true);

    // Mark the nonce as consumed
    validator.markUsed(token.nonce);
    expect(validator.isUsed(token.nonce)).toBe(true);

    // Second use should be rejected as replay
    const second = validator.validate(token, 'mvc.decisionHistory', 'read');
    expect(second.valid).toBe(false);
    expect(second.reason).toBe('Nonce already used (replay detected)');
  });

  // ── 5. scope mismatch fails ────────────────────────────────────────

  it('should reject when no scope grants the requested action on the resource', () => {
    const token = makeToken();

    // spatial.anchors only has 'read' -- requesting 'delete' should fail
    const result = validator.validate(token, 'spatial.anchors', 'delete');

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("No scope grants 'delete' on 'spatial.anchors'");
  });
});
