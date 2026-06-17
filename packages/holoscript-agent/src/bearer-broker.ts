/**
 * HoloKey bearer broker — resolve an agent's mesh bearer by proving wallet
 * ownership, instead of holding the bearer in plaintext `.env`.
 *
 * The edge agent holds only its WALLET (the durable root identity, F.119 —
 * deterministic + recoverable from the master seed). The mesh bearer is
 * rotatable/mintable, so it is FETCHED on demand from the broker rather than
 * stored: `POST /key/challenge` → sign EIP-712 `Recovery{nonce}` → `POST
 * /key/recover` returns the agent's current `api_key`. The private key never
 * leaves the process; only the signature + public address transit the wire.
 *
 * This generalizes the per-agent `HOLOMESH_API_KEY_<HANDLE>_X402` pattern into
 * the secrets-broker model (`@holoscript/secrets-broker`): one root credential
 * (the wallet), short-lived/fetched capability (the bearer).
 *
 * @module holoscript-agent/bearer-broker
 */
import { Wallet } from 'ethers';

export interface ResolveBearerViaBrokerOpts {
  /** Agent wallet private key (0x-hex). Root credential; NEVER logged. */
  privateKey: string;
  /** Mesh API base, e.g. https://mcp.holoscript.net/api/holomesh */
  meshApiBase: string;
  /** Injectable fetch for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** Domain/types for the EIP-712 `Recovery` envelope the server verifies (core-routes.ts key/recover). */
const RECOVERY_DOMAIN: { name: string; version: string } = { name: 'HoloMesh', version: '1' };
const RECOVERY_TYPES: Record<string, { name: string; type: string }[]> = {
  Recovery: [{ name: 'nonce', type: 'string' }],
};

/**
 * Resolve the agent's mesh bearer via wallet-ownership proof against the broker.
 * Throws on any failure (challenge/recover non-200, missing nonce/api_key) so the
 * caller can fall back to an explicit env bearer or surface a clear boot error.
 */
export async function resolveBearerViaBroker(opts: ResolveBearerViaBrokerOpts): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch;
  const wallet = new Wallet(opts.privateKey);
  const address = wallet.address;
  const base = opts.meshApiBase.replace(/\/+$/, '');

  const chalRes = await doFetch(`${base}/key/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet_address: address }),
  });
  if (!chalRes.ok) {
    throw new Error(`bearer-broker: /key/challenge returned ${chalRes.status} for ${address}`);
  }
  const chal = (await chalRes.json()) as { nonce?: string };
  if (!chal.nonce) throw new Error('bearer-broker: /key/challenge returned no nonce');

  const signature = await wallet.signTypedData(RECOVERY_DOMAIN, RECOVERY_TYPES, {
    nonce: chal.nonce,
  });

  const recRes = await doFetch(`${base}/key/recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet_address: address, nonce: chal.nonce, signature }),
  });
  if (!recRes.ok) {
    throw new Error(`bearer-broker: /key/recover returned ${recRes.status} for ${address}`);
  }
  const rec = (await recRes.json()) as { agent?: { api_key?: string } };
  const bearer = rec.agent?.api_key;
  if (!bearer) throw new Error('bearer-broker: /key/recover returned no api_key');
  return bearer;
}
