/**
 * Flag-gated signer->identity binding for HoloMesh board mutations.
 *
 * When `HOLOMESH_BOARD_BIND_SIGNER=1`, a board mutation must be authorized by the
 * wallet that owns the identity being written. OFF by default -> zero behavior
 * change. Rules (flag on):
 *   - A classical wallet signature (0x address) must equal the authenticated
 *     caller's wallet (self-write OR delegation), OR the written identity's
 *     registered wallet (the identity's owner cross-signs). Else 403.
 *   - A non-wallet signer (founder-bypass / unsigned-grace resolve to null;
 *     capability tokens resolve to a handle; pqc to a key) is authenticated by
 *     its own mechanism and passes through for a SELF-write -- but FAILS CLOSED
 *     for a DELEGATED write (body.agentId != caller.id), because a non-bindable
 *     signer cannot prove authority to write as another identity. This closes the
 *     capability-token / pqc PATCH-claim impersonation vector.
 *
 * Trust model note: because the delegation branch accepts the authenticated
 * caller's own wallet for any written identity, any wallet-backed bearer may
 * attribute a write to any agentId ("bearer vouches", used by fleet orchestration).
 * Board-impersonation containment therefore ultimately rests on bearer/wallet
 * issuance control; this binding stops the strictly-dumber foreign-signature and
 * non-bindable-delegation attacks and forces a bindable proof for delegated writes.
 *
 * Does NOT close: the founder-bypass gap (separate hardening) or the parallel
 * unsigned board-tools.ts MCP write path (that path bypasses this HTTP route
 * entirely -- must be bound/routed separately before the flag is full protection).
 * Enable prerequisite: verify every active signing seat's bearer walletAddress (or
 * walletToAgent mapping) matches its signing seat wallet, else legitimate seats
 * 403 on every board write. See research/2026-07-26_holomesh-mcp-identity-gap.md.
 */
import { addressesEqual } from '../request-signing';
import { keyRegistry, walletToAgent } from '../state';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Look up an agentId's registered wallet address from the key registry. */
export function resolveAgentWallet(agentId: string): string | undefined {
  return Array.from(keyRegistry.values()).find((k) => k.agentId === agentId)?.walletAddress;
}

/** True when the signer wallet is registered to the caller's own identity. */
export function defaultSignerMapsToCaller(signer: string, callerId: string): boolean {
  const agent = walletToAgent.get(signer.toLowerCase());
  return !!agent && agent.id === callerId;
}

export type BindingResult = { ok: true } | { ok: false; status: number; error: string };

const MISMATCH: BindingResult = { ok: false, status: 403, error: 'signer-identity-mismatch' };

/**
 * @param signingCtx        the verified signing context (only `.signer` is consulted)
 * @param writtenAgentId    the identity the mutation attributes the write to
 * @param caller            the bearer-authenticated agent making the request
 * @param resolveWallet     agentId -> wallet resolver (injectable for tests)
 * @param signerMapsToCaller signer,callerId -> boolean (injectable for tests)
 */
export function checkSignerIdentityBinding(
  signingCtx: { signer: string | null },
  writtenAgentId: string,
  caller: { id: string; walletAddress?: string },
  resolveWallet: (agentId: string) => string | undefined = resolveAgentWallet,
  signerMapsToCaller: (signer: string, callerId: string) => boolean = defaultSignerMapsToCaller
): BindingResult {
  if (process.env.HOLOMESH_BOARD_BIND_SIGNER !== '1') return { ok: true };

  const signer = signingCtx.signer;
  const delegated = writtenAgentId !== caller.id;

  // Non-wallet signer: founder-bypass / unsigned-grace (null), capability handle,
  // or pqc key. Self-writes pass (authenticated by their own mechanism); delegated
  // writes fail closed (a non-bindable signer cannot authorize writing as another).
  if (typeof signer !== 'string' || !ADDRESS_RE.test(signer)) {
    return delegated ? MISMATCH : { ok: true };
  }

  // Classical wallet signer that is (or maps to) the authenticated caller: the
  // bearer may write on its own behalf OR delegate (fleet orchestration). The
  // walletToAgent mapping covers seats whose bearer record walletAddress is unset
  // or differs from the per-window signing wallet.
  if (caller.walletAddress && addressesEqual(signer, caller.walletAddress)) return { ok: true };
  if (signerMapsToCaller(signer, caller.id)) return { ok: true };

  // Otherwise the signer must own the identity being written.
  const boundWallet = delegated ? resolveWallet(writtenAgentId) : caller.walletAddress;
  if (boundWallet && addressesEqual(signer, boundWallet)) return { ok: true };

  return MISMATCH;
}
