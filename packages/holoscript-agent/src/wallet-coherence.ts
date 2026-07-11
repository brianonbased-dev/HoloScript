/**
 * wallet-coherence — boot-time self-heal for the W.820 stray-key / shared-.env incident.
 *
 * An agent has TWO identity claims that were never cross-checked at boot:
 *   - the DECLARED wallet (`HOLOSCRIPT_AGENT_WALLET`, also what the mesh registered for the bearer),
 *   - the SIGNING key (`HOLOSCRIPT_AGENT_WALLET_PRIVATE_KEY`), whose derived address is the real
 *     cryptographic identity used for broker proof + EIP-191 signing.
 * When they diverge (a mis-pasted key, or a shared `.env` whose single key belongs to neither of
 * two agents — the shared-key incident, W.820), the agent silently signed as the WRONG wallet.
 *
 * The fix is to make every agent catch this itself, with no human:
 *   - coherent  → use the key normally.
 *   - mismatch + a bearer present → DROP the stray key (degrade to bearer-only): the bearer carries
 *     the true declared/registered identity, so the agent keeps operating as its real self while
 *     NEVER signing as the wrong wallet. Signing is cleanly unavailable until the correct key is
 *     installed (an honest absence, not a false signature).
 *   - mismatch + no bearer → HALT: there is nothing to carry the declared identity, so booting
 *     would mean operating as the stray wallet. Refuse.
 *   - `HOLOSCRIPT_AGENT_WALLET_COHERENCE_HALT=1` → HALT on any mismatch (strict/CI environments).
 *
 * IMPORTANT (the shared-key lesson, W.820): the KEY is NOT automatically the truth. The declared wallet is
 * what the mesh registered (with its memories); a stray key must be rejected, not adopted. This is
 * why we degrade to the bearer (declared identity) rather than "trust the key".
 *
 * D.101: a fix to existing boot code, not net-new infra. Agent-custody (governance): self-healing
 * one's own seat coherence is autonomous; only NEW-seat attestation (Trezor) + the treasury master
 * stay founder-gated (G.GOLD.016 protects the treasury vars, not agent seats).
 *
 * @module wallet-coherence
 */

export type WalletCoherenceDecision =
  | { coherent: true }
  | { coherent: false; action: 'degrade-to-bearer-only'; reason: string }
  | { coherent: false; action: 'halt'; reason: string };

export interface WalletCoherenceInput {
  /** Address derived from the loaded seat private key, or undefined when no local key is present. */
  derivedAddress: string | undefined;
  /** The declared identity wallet (`HOLOSCRIPT_AGENT_WALLET`). */
  declaredWallet: string;
  /** Whether an explicit mesh bearer is present to carry the declared identity without the key. */
  hasBearer: boolean;
  /** `HOLOSCRIPT_AGENT_WALLET_COHERENCE_HALT === '1'` — force HALT on any mismatch. */
  halt: boolean;
}

/**
 * Decide how to reconcile a seat key against the declared identity at boot. Pure + deterministic so
 * it is unit-testable; the caller performs the side effects (log the canary, null the seat, throw).
 */
export function decideWalletCoherence(input: WalletCoherenceInput): WalletCoherenceDecision {
  // No local key → already bearer-only; nothing to reconcile.
  if (!input.derivedAddress) return { coherent: true };

  if (input.derivedAddress.toLowerCase() === input.declaredWallet.toLowerCase()) {
    return { coherent: true };
  }

  const base = `seat key derives ${input.derivedAddress} but declared identity is ${input.declaredWallet}`;
  if (input.halt) {
    return { coherent: false, action: 'halt', reason: `${base} (HOLOSCRIPT_AGENT_WALLET_COHERENCE_HALT set)` };
  }
  if (input.hasBearer) {
    return {
      coherent: false,
      action: 'degrade-to-bearer-only',
      reason: `${base} — bearer carries the declared identity; ignoring the stray key (no on-device signing until the correct key is installed)`,
    };
  }
  return {
    coherent: false,
    action: 'halt',
    reason: `${base} — no bearer to carry the declared identity; refusing to operate as the stray wallet`,
  };
}
