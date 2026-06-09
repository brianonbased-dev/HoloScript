import { describe, it, expect } from 'vitest';
import {
  checkSecretAccess,
  PolicyDeniedError,
  type SecretAccessPolicy,
} from '../secret-access-policy';

describe('checkSecretAccess (HoloGate scope axis over secret refs)', () => {
  it('no-op policy {} allows any ref (ownership alone governs)', () => {
    const policy: SecretAccessPolicy = {};
    expect(checkSecretAccess(policy, 'vault:OPENAI_API_KEY')).toEqual({
      allowed: true,
      reason: null,
    });
    expect(checkSecretAccess(policy, 'env:WHATEVER')).toEqual({ allowed: true, reason: null });
  });

  it('allowlist (present) admits only matching refs', () => {
    const policy: SecretAccessPolicy = { allow: ['vault:OPENAI_API_KEY', 'vault:ANTHROPIC_*'] };
    expect(checkSecretAccess(policy, 'vault:OPENAI_API_KEY').allowed).toBe(true);
    expect(checkSecretAccess(policy, 'vault:ANTHROPIC_API_KEY').allowed).toBe(true);
    const denied = checkSecretAccess(policy, 'vault:FLEET_DEPLOY_KEY');
    expect(denied).toEqual({ allowed: false, reason: 'not-in-allowlist' });
  });

  it('empty allowlist [] denies ALL — programmatic collapse fails CLOSED, not open', () => {
    const policy: SecretAccessPolicy = { allow: [] };
    expect(checkSecretAccess(policy, 'vault:OPENAI_API_KEY')).toEqual({
      allowed: false,
      reason: 'not-in-allowlist',
    });
    expect(checkSecretAccess(policy, 'anything:at-all')).toEqual({
      allowed: false,
      reason: 'not-in-allowlist',
    });
  });

  it('absent allowlist (undefined) is block-only — everything not blocked passes', () => {
    const policy: SecretAccessPolicy = { block: ['vault:FLEET_*'] };
    expect(checkSecretAccess(policy, 'vault:OPENAI_API_KEY').allowed).toBe(true);
    expect(checkSecretAccess(policy, 'vault:FLEET_DEPLOY_KEY')).toEqual({
      allowed: false,
      reason: 'blocked',
    });
  });

  it('block WINS over allow — a ref on both lists is denied as blocked', () => {
    const policy: SecretAccessPolicy = {
      allow: ['vault:*'], // would admit everything under vault:
      block: ['vault:FLEET_DEPLOY_KEY'], // …except this one
    };
    expect(checkSecretAccess(policy, 'vault:OPENAI_API_KEY').allowed).toBe(true);
    expect(checkSecretAccess(policy, 'vault:FLEET_DEPLOY_KEY')).toEqual({
      allowed: false,
      reason: 'blocked',
    });
  });

  it('glob * matches any run (including empty); ? matches exactly one char', () => {
    expect(checkSecretAccess({ allow: ['vault:*'] }, 'vault:').allowed).toBe(true); // * = empty
    expect(checkSecretAccess({ allow: ['vault:*'] }, 'vault:X').allowed).toBe(true);
    // ? is exactly one char: matches single, not zero and not two.
    expect(checkSecretAccess({ allow: ['vault:K?Y'] }, 'vault:KEY').allowed).toBe(true);
    expect(checkSecretAccess({ allow: ['vault:K?Y'] }, 'vault:KY').allowed).toBe(false);
    expect(checkSecretAccess({ allow: ['vault:K?Y'] }, 'vault:KEEY').allowed).toBe(false);
  });

  it('treats regex metacharacters in patterns literally (a `.` is a dot, not "any char")', () => {
    const policy: SecretAccessPolicy = { allow: ['vault:K.EY'] };
    expect(checkSecretAccess(policy, 'vault:K.EY').allowed).toBe(true); // literal dot
    expect(checkSecretAccess(policy, 'vault:KXEY').allowed).toBe(false); // dot is NOT a wildcard
  });

  it('anchors full-match — a pattern must cover the whole ref, not a prefix/substring', () => {
    const policy: SecretAccessPolicy = { allow: ['vault:KEY'] };
    expect(checkSecretAccess(policy, 'vault:KEY').allowed).toBe(true);
    expect(checkSecretAccess(policy, 'vault:KEY_EXTRA').allowed).toBe(false); // not a prefix match
    expect(checkSecretAccess(policy, 'x-vault:KEY').allowed).toBe(false); // not a suffix match
  });
});

describe('PolicyDeniedError', () => {
  it('carries the ref + reason and never the value; message has no secret material', () => {
    const err = new PolicyDeniedError('vault:FLEET_DEPLOY_KEY', 'blocked');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PolicyDeniedError');
    expect(err.ref).toBe('vault:FLEET_DEPLOY_KEY');
    expect(err.reason).toBe('blocked');
    expect(err.message).toContain('vault:FLEET_DEPLOY_KEY');
    expect(err.message).toContain('blocked');
  });
});
