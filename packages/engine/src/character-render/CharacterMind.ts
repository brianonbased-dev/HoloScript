/**
 * CharacterMind — the D.102 "portable agent mind" seam for embodied agents.
 *
 * The body (AgentAvatarMesh / CharacterHost) is entity-generic; the MIND is what makes an
 * embodied agent more than a puppet: a device-independent WALLET identity + memory loaded from
 * the wallet-scoped private store (`private:<walletAddress>`), so the SAME agent that ran on a
 * Jetson can inhabit the headset body carrying the same identity + memory (D.102).
 *
 * This module is the ZERO-DEPENDENCY engine interface + an in-memory default. The live binding
 * to the orchestrator memory store / seat wallet (MeshCharacterMind over HolomeshClient) lives
 * in the agent package and imports this TYPE only — the engine never depends on the orchestrator
 * (cycle-free; D.101: reuse the existing private store, no net-new infra).
 *
 * @module character-render
 */

/** Device-independent identity. Wallet is the durable anchor; may be absent pre-attestation. */
export interface MindIdentity {
  /** Seat wallet address — the device-independent identity anchor (wallets = identity). */
  wallet?: string;
  /** Agent / seat id (session-scoped). */
  agentId?: string;
}

/** One recalled memory item (shape is store-agnostic; content is the searchable text). */
export interface MindMemoryEntry {
  id?: string;
  content: string;
  score?: number;
  [key: string]: unknown;
}

/**
 * A portable mind an embodied-agent body binds to. Implementations: StaticCharacterMind
 * (in-memory, here) and MeshCharacterMind (agent package, over the orchestrator private store).
 */
export interface CharacterMind {
  /** The mind's identity (wallet + agent id). */
  identity(): MindIdentity;
  /** Load memory scoped to this mind (private:<wallet>); optional text filter + cap. */
  loadMemory(query?: string, limit?: number): Promise<MindMemoryEntry[]>;
  /** Optionally persist an outcome back to the mind's memory. */
  rememberOutcome?(entry: MindMemoryEntry): Promise<void>;
}

/**
 * In-memory CharacterMind — zero network, deterministic. Useful as a default, for tests, and
 * as the fallback when no live mind is injected. Client-side text filter (the private store has
 * no server search, so filtering is always client-side anyway).
 */
export class StaticCharacterMind implements CharacterMind {
  private entries: MindMemoryEntry[];

  constructor(
    private readonly id: MindIdentity,
    entries: MindMemoryEntry[] = []
  ) {
    this.entries = entries.map((e) => ({ ...e }));
  }

  identity(): MindIdentity {
    return { ...this.id };
  }

  async loadMemory(query?: string, limit = 50): Promise<MindMemoryEntry[]> {
    let list = this.entries;
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((e) => e.content.toLowerCase().includes(q));
    }
    return list.slice(0, limit).map((e) => ({ ...e }));
  }

  async rememberOutcome(entry: MindMemoryEntry): Promise<void> {
    this.entries = [{ ...entry }, ...this.entries];
  }
}
