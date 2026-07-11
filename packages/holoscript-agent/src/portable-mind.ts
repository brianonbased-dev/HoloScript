/**
 * buildPortableMind — the D.102 portable-mind ACQUISITION (the "Quest-side client" half).
 *
 * One call turns a seat (wallet root credential + mesh config) into a live, ready-to-bind
 * `CharacterMind`: it presents the seat wallet to the HoloKey broker for the mesh bearer
 * (wallet-ownership proof, no plaintext bearer), constructs a `HolomeshClient`, and wraps it in a
 * `MeshCharacterMind` over the wallet-scoped private store. The caller then binds it to a body in
 * one line: `await host.bindMind(await buildPortableMind(cfg))` — so the SAME agent that ran on a
 * compute node inhabits the headset body carrying its identity + memory (the node->headset hop).
 *
 * ANCHOR COHERENCE (informed by the shared-key canary, W.820): the identity wallet is DERIVED from
 * the signing private key (`new Wallet(privateKey).address`), never taken from a separately-declared
 * address. This makes "identity wallet == signing key" true by construction, so a node whose
 * declared address drifts from its key cannot produce an incoherent portable mind through this path.
 *
 * Dependency-clean: lives in the headless agent package; never imports `@holoscript/engine` (the
 * body's `bindMind` accepts this structurally). D.101: composes existing pieces (broker + client +
 * MeshCharacterMind), no net-new infra — the D.102 carry the founder named "THE point".
 *
 * @module portable-mind
 */

import { Wallet } from 'ethers';
import { HolomeshClient } from './holomesh-client.js';
import { resolveBearerViaBroker } from './bearer-broker.js';
import { MeshCharacterMind } from './mesh-character-mind.js';
import type { AgentIdentity } from './types.js';

export interface PortableMindConfig {
  /** Seat wallet private key (0x-hex) — the durable root identity. NEVER logged. */
  privateKey: string;
  /** Mesh API base, e.g. https://mcp.holoscript.net/api/holomesh */
  meshApiBase: string;
  /** Team id the seat belongs to. */
  teamId: string;
  /** Agent/seat handle for identity().agentId (defaults to the wallet address). */
  agentId?: string;
  /**
   * Explicit mesh bearer. When set, the broker round-trip is skipped (useful for tests / nodes
   * that already hold a bearer). When absent, the bearer is resolved via wallet-ownership proof.
   */
  bearer?: string;
  /** Local JSONL private-store path (edge mode). When set, memory I/O is local, no network. */
  localKnowledgePath?: string;
  /** Injectable fetch (tests / non-global-fetch runtimes). */
  fetchImpl?: typeof fetch;
}

/**
 * Acquire a live, ready-to-bind portable mind for a seat. Resolves the mesh bearer (broker unless
 * `bearer` is given), builds the client, and returns a `MeshCharacterMind` whose identity wallet is
 * the address of `privateKey` (anchor-coherent by construction).
 */
export async function buildPortableMind(cfg: PortableMindConfig): Promise<MeshCharacterMind> {
  const wallet = new Wallet(cfg.privateKey);
  const bearer =
    cfg.bearer ??
    (await resolveBearerViaBroker({
      privateKey: cfg.privateKey,
      meshApiBase: cfg.meshApiBase,
      fetchImpl: cfg.fetchImpl,
    }));

  const client = new HolomeshClient({
    apiBase: cfg.meshApiBase,
    bearer,
    teamId: cfg.teamId,
    fetchImpl: cfg.fetchImpl,
    localKnowledgePath: cfg.localKnowledgePath,
  });

  const identity: AgentIdentity = {
    handle: cfg.agentId ?? wallet.address,
    surface: 'portable',
    wallet: wallet.address, // DERIVED from the key — identity == signing key (W.820 anchor coherence)
    x402Bearer: bearer,
    llmProvider: 'mock',
    llmModel: '',
    brainPath: '',
    budgetUsdPerDay: 0,
    teamId: cfg.teamId,
    meshApiBase: cfg.meshApiBase,
  };

  return new MeshCharacterMind(identity, client);
}
