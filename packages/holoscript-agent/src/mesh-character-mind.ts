/**
 * MeshCharacterMind — the LIVE D.102 "portable agent mind" binding.
 *
 * Implements the engine's `CharacterMind` shape over the agent's wallet-scoped private store via
 * `HolomeshClient`. This is the live counterpart to the engine's in-memory `StaticCharacterMind`:
 * the SAME wallet identity + `private:<wallet>` memory that drove the agent on a Jetson/laptop is
 * loaded into the embodied-agent body in the headset, so one continuous agent inhabits the body
 * across substrates (D.102 — "the portable agent mind is THE point").
 *
 * Structurally typed, dep-free on purpose: the engine's `CharacterHost.bindMind(mind)` /
 * `SplatCharacterHost.bindMind(mind)` accept any object with `identity()` + `loadMemory()`
 * (TypeScript is structural), so this runtime never imports `@holoscript/engine` — which would
 * pull three.js / WebGPU into a headless agent. The three `Mind*` interfaces below MIRROR
 * `@holoscript/engine` `character-render/CharacterMind`; keep them in sync (pure data shapes).
 *
 * D.101: reuses the existing private store + `HolomeshClient` — no net-new infra.
 *
 * @module mesh-character-mind
 */

import type { HolomeshClient, KnowledgeEntry } from './holomesh-client.js';
import type { AgentIdentity } from './types.js';

/** Device-independent identity (mirrors `@holoscript/engine` MindIdentity). */
export interface MindIdentity {
  wallet?: string;
  agentId?: string;
}

/** One recalled memory item (mirrors `@holoscript/engine` MindMemoryEntry). */
export interface MindMemoryEntry {
  id?: string;
  content: string;
  score?: number;
  [key: string]: unknown;
}

/** The portable-mind shape an embodied-agent body binds to (mirrors `@holoscript/engine` CharacterMind). */
export interface CharacterMind {
  identity(): MindIdentity;
  loadMemory(query?: string, limit?: number): Promise<MindMemoryEntry[]>;
  rememberOutcome?(entry: MindMemoryEntry): Promise<void>;
}

/** The minimal `HolomeshClient` surface this adapter needs (keeps it mockable + loosely coupled). */
export type PrivateMemoryStore = Pick<HolomeshClient, 'queryPrivateKnowledge' | 'writePrivateKnowledge'>;

/**
 * Live `CharacterMind` backed by the wallet-scoped private store. Identity comes from the seat
 * `AgentIdentity` (wallet = durable anchor, handle = agent id); memory loads from `private:<wallet>`
 * via `HolomeshClient.queryPrivateKnowledge` (the server scopes by the bearer's wallet). The private
 * endpoint has no server-side search, so the optional `query` filters client-side — exactly as
 * `StaticCharacterMind` does.
 */
export class MeshCharacterMind implements CharacterMind {
  constructor(
    private readonly seat: AgentIdentity,
    private readonly store: PrivateMemoryStore
  ) {}

  identity(): MindIdentity {
    return {
      wallet: this.seat.wallet || undefined,
      agentId: this.seat.handle || undefined,
    };
  }

  async loadMemory(query?: string, limit = 50): Promise<MindMemoryEntry[]> {
    // queryPrivateKnowledge already returns [] on any failure (never throws); guard anyway so a
    // store outage degrades the body to mind-less rather than throwing through bindMind.
    let entries: KnowledgeEntry[];
    try {
      entries = await this.store.queryPrivateKnowledge();
    } catch {
      return [];
    }
    let list: MindMemoryEntry[] = entries.map((e) => ({
      id: e.id,
      content: e.content,
      type: e.type,
      domain: e.domain,
      createdAt: e.createdAt,
    }));
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((e) => e.content.toLowerCase().includes(q));
    }
    return list.slice(0, limit);
  }

  async rememberOutcome(entry: MindMemoryEntry): Promise<void> {
    try {
      await this.store.writePrivateKnowledge([{ content: entry.content }]);
    } catch {
      // best-effort: a write miss never breaks a tick (the work is already done).
    }
  }
}
