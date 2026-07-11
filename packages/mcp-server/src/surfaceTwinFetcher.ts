/**
 * surfaceTwinFetcher — the PRODUCTION seam for @verified_view v1 runtime twin verification.
 *
 * `verifySurfaceTwinLive` (in @holoscript/core) takes an INJECTED AuthoritativeStateFetcher so the
 * one pure verifier runs unchanged in CI (a mock) and in production (this real adapter). This
 * adapter reads the authoritative twin value from the LIVE StateAuthority (Loro CRDT) through the
 * SAME `fetch_authoritative_state` MCP handler an agent would call — no private-internal
 * reach-around, no fabricated snapshot. That keeps the two sides genuinely independent: the display
 * side is read from the rendered surface; this side is the authority's own truth.
 *
 * HONESTY RAIL (premortem): an entity no producer has ever written returns the `{ _null: true }`
 * sentinel; this maps to `null`, so the verifier ABSTAINS (`authority-unavailable`) rather than
 * false-FALSIFYING. "The twin was never populated" / "the authority was unreachable" is NOT "the
 * dashboard lied". Only a REACHED authority that diverges from the display flips to FALSIFIED.
 */
import {
  verifySurfaceTwinLive,
  type AuthoritativeStateFetcher,
  type SurfaceTwinProjection,
  type SurfaceTwinReceipt,
  type SurfaceTwinScalar,
} from '@holoscript/core/reconstruction';
import { handleNetworkingTool } from './networking-tools.js';

/**
 * Build an {@link AuthoritativeStateFetcher} backed by the live StateAuthority via the
 * `fetch_authoritative_state` tool handler. The `{ _null: true }` sentinel (no producer has written
 * this entity) → `null` → the verifier abstains, never falsifies. A handler throw likewise
 * surfaces as an unreachable authority (verifySurfaceTwinLive catches it via Promise.allSettled).
 */
export function createAuthoritativeStateFetcher(): AuthoritativeStateFetcher {
  return async (entity: string) => {
    const state = await handleNetworkingTool('fetch_authoritative_state', { entityId: entity });
    if (
      state === null ||
      state === undefined ||
      (typeof state === 'object' && (state as { _null?: unknown })._null === true)
    ) {
      return null;
    }
    return state as Record<string, unknown>;
  };
}

/**
 * Verify a compiled @verified_view surface against the LIVE StateAuthority: fetch each twin entity
 * the surface's `holoViewContract` declares and compare to the displayed values. Thin production
 * wrapper that injects the real fetcher into the pure core verifier — the entry point a runtime
 * gate (or an agent-callable check) uses once a surface declares a real `@projects { node, entity }`.
 */
export async function verifySurfaceAgainstLiveAuthority(input: {
  contract: { projections: SurfaceTwinProjection[] };
  displayedValues: Record<string, SurfaceTwinScalar>;
}): Promise<SurfaceTwinReceipt> {
  return verifySurfaceTwinLive({
    contract: input.contract,
    displayedValues: input.displayedValues,
    fetchAuthoritativeState: createAuthoritativeStateFetcher(),
  });
}
