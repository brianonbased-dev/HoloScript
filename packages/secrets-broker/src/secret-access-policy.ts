/**
 * Secret access policy — the HoloGate `scope` axis for value resolution.
 *
 * HoloGate admits an entity through `identify → authorize → scope → admit → log`.
 * The {@link import('./secret-resolver').SecretResolver} already does identify/authorize
 * (fail-closed auth), admit (owner-bound `SecretStore.get`), and log (audit). This module
 * supplies the missing **scope** step: a least-authority constraint over WHICH refs a given
 * execution context may resolve — even for secrets the authenticated owner genuinely owns.
 *
 * Why ownership is not enough: a Brittney chat session and a Fleet deploy job can run under
 * the SAME authenticated owner, yet a chat turn has no business resolving `vault:FLEET_DEPLOY_KEY`.
 * Ownership answers "is this yours?"; scope answers "may THIS context touch it?". Defense in
 * depth — a mis-scoped consumer is contained to its allowlist instead of the owner's whole vault.
 *
 * Shape mirrors HoloDoor's allow/block lists (cf. `holodoor-routes.ts`): glob patterns over the
 * canonical `<surface>:<key>` ref. Semantics, chosen to fail in the SAFE direction:
 *   - `block` wins: a ref matching ANY block glob is denied, even if `allow` also matches it.
 *   - `allow` present (the key exists) ⇒ allowlist mode: the ref MUST match one entry.
 *       `allow: []` is therefore deny-all (an empty allowlist admits nothing) — programmatic
 *       callers whose `allow` collapses to empty fail CLOSED, never open.
 *   - `allow` absent (undefined) ⇒ no allowlist constraint (block-only mode).
 *   - `{}` (neither key) ⇒ no constraint; the policy is a no-op and ownership alone governs.
 *
 * This module is pure (no I/O, no secret material) and carries only ref labels — never values.
 *
 * @module secrets-broker/secret-access-policy
 */

import type { SecretRef } from './types';

/**
 * A scope policy over secret refs. Glob patterns (`*` = any run incl. empty, `?` = one char)
 * match against the whole canonical ref (e.g. `vault:OPENAI_API_KEY`). See module docs for the
 * block-wins / allowlist-presence semantics.
 */
export interface SecretAccessPolicy {
  /** Globs a ref MUST match (when the key is present). `[]` denies all; absent = unconstrained. */
  readonly allow?: readonly string[];
  /** Globs that, when matched, deny regardless of {@link allow}. */
  readonly block?: readonly string[];
}

/** Outcome of {@link checkSecretAccess}. `reason` is the denial cause, or null when allowed. */
export interface SecretAccessDecision {
  readonly allowed: boolean;
  /** `'blocked'` | `'not-in-allowlist'` when denied; `null` when allowed. */
  readonly reason: 'blocked' | 'not-in-allowlist' | null;
}

/** Thrown by the resolver when a scope policy denies a ref. Carries the ref + cause, no patterns. */
export class PolicyDeniedError extends Error {
  readonly ref: SecretRef;
  /** Why it was denied: `'blocked'` or `'not-in-allowlist'`. */
  readonly reason: 'blocked' | 'not-in-allowlist';
  constructor(ref: SecretRef, reason: 'blocked' | 'not-in-allowlist') {
    super(`secret-access-policy: ${ref} denied by scope (${reason})`);
    this.name = 'PolicyDeniedError';
    this.ref = ref;
    this.reason = reason;
  }
}

const REGEX_META = /[.*+?^${}()|[\]\\]/g;

/**
 * Compile a glob (`*` / `?` wildcards) to an anchored RegExp. Every other character is treated
 * literally — regex metacharacters are escaped so a ref like `vault:K.EY` cannot be matched by
 * an unintended `.`. Never throws.
 */
function globToRegExp(glob: string): RegExp {
  let out = '^';
  for (const ch of glob) {
    if (ch === '*') out += '.*';
    else if (ch === '?') out += '.';
    else out += ch.replace(REGEX_META, '\\$&');
  }
  return new RegExp(`${out}$`);
}

/**
 * Decide whether `ref` may be resolved under `policy`. Pure; evaluates block-first, then the
 * allowlist (see module docs). Returns a decision — it does NOT throw; the resolver turns a
 * `{ allowed: false }` into a {@link PolicyDeniedError} so the value boundary stays single-sourced.
 */
export function checkSecretAccess(policy: SecretAccessPolicy, ref: SecretRef): SecretAccessDecision {
  // block wins — a blocked ref is denied even if an allow entry would admit it.
  if (policy.block) {
    for (const pattern of policy.block) {
      if (globToRegExp(pattern).test(ref)) return { allowed: false, reason: 'blocked' };
    }
  }
  // allowlist — presence of the key means "only these"; an empty list admits nothing.
  if (policy.allow !== undefined) {
    const matched = policy.allow.some((pattern) => globToRegExp(pattern).test(ref));
    if (!matched) return { allowed: false, reason: 'not-in-allowlist' };
  }
  return { allowed: true, reason: null };
}
