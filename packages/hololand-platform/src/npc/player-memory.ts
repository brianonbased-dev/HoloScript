import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PlayerMemoryEntry {
  fact: string;
  timestamp: number;
}

/**
 * Per-NPC durable memory of facts shared by individual players.
 * Survives process reload because every mutation is flushed to disk
 * and every read lazily loads from disk.
 */
export class NPCPlayerMemory {
  private store = new Map<string, PlayerMemoryEntry[]>();
  private readonly persistDir: string;
  private readonly npcId: string;

  constructor(npcId: string, persistDir = 'research/hololand-persist') {
    this.npcId = npcId;
    this.persistDir = persistDir;
  }

  private key(playerId: string): string {
    return `npc-${this.npcId}-player-${playerId}`;
  }

  private filePath(playerId: string): string {
    const safe = this.key(playerId).replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.persistDir, `${safe}.json`);
  }

  /** Store a fact about a player and flush to disk immediately. */
  remember(playerId: string, fact: string): void {
    const k = this.key(playerId);
    const entries = this.store.get(k) ?? [];
    entries.push({ fact, timestamp: Date.now() });
    this.store.set(k, entries);
    this.save(playerId);
  }

  /** Recall every fact known about a player, loading from disk if necessary. */
  recall(playerId: string): string[] {
    const k = this.key(playerId);
    if (!this.store.has(k)) {
      const fp = this.filePath(playerId);
      if (existsSync(fp)) {
        try {
          const raw = JSON.parse(readFileSync(fp, 'utf8')) as PlayerMemoryEntry[];
          this.store.set(k, raw);
        } catch {
          // corrupt file → treat as empty
        }
      }
    }
    return (this.store.get(k) ?? []).map((e) => e.fact);
  }

  private save(playerId: string): void {
    const fp = this.filePath(playerId);
    try {
      mkdirSync(this.persistDir, { recursive: true });
      writeFileSync(fp, JSON.stringify(this.store.get(this.key(playerId)) ?? [], null, 2), 'utf8');
    } catch {
      // persistence best-effort; never crash the NPC loop
    }
  }
}
