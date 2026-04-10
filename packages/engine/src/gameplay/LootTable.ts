/**
 * LootTable.ts
 *
 * Weighted loot drops: rarity tiers, guaranteed drops,
 * roll logic, conditional drops, and pity timers.
 *
 * @module gameplay
 */

// =============================================================================
// TYPES
// =============================================================================

export type LootRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface LootEntry {
  itemId: string;
  weight: number; // Relative probability
  rarity: LootRarity;
  minQuantity: number;
  maxQuantity: number;
  guaranteed: boolean; // Always drops
  condition?: string; // Optional condition key
}

export interface LootDrop {
  itemId: string;
  quantity: number;
  rarity: LootRarity;
}

export interface LootTableDef {
  id: string;
  entries: LootEntry[];
  minDrops: number;
  maxDrops: number;
  guaranteedDrops: boolean; // Whether guaranteed items always included
}

// =============================================================================
// LOOT TABLE
// =============================================================================

export class LootTable {
  private tables: Map<string, LootTableDef> = new Map();
  private pityCounters: Map<string, Map<LootRarity, number>> = new Map(); // table → rarity → rolls since last
  private conditions: Map<string, boolean> = new Map();
  private seed: number;
  private rng: () => number;

  constructor(seed = 42) {
    this.seed = seed;
    this.rng = this.createRng(seed);
  }

  // ---------------------------------------------------------------------------
  // Table Management
  // ---------------------------------------------------------------------------

  addTable(id: string, entries: LootEntry[], minDrops = 1, maxDrops = 3): void {
    this.tables.set(id, { id, entries, minDrops, maxDrops, guaranteedDrops: true });
    this.pityCounters.set(id, new Map());
  }

  getTable(id: string): LootTableDef | undefined {
    return this.tables.get(id);
  }

  // ---------------------------------------------------------------------------
  // Roll
  // ---------------------------------------------------------------------------

  roll(tableId: string, luck = 1): LootDrop[] {
    const table = this.tables.get(tableId);
    if (!table) return [];

    const drops: LootDrop[] = [];

    // Guaranteed drops first
    if (table.guaranteedDrops) {
      for (const entry of table.entries) {
        if (entry.guaranteed && this.meetsCondition(entry)) {
          drops.push(this.createDrop(entry));
        }
      }
    }

    // Random drops
    const pool = table.entries.filter((e) => !e.guaranteed && this.meetsCondition(e));
    if (pool.length === 0) return drops;

    const numDrops =
      table.minDrops + Math.floor(this.rng() * (table.maxDrops - table.minDrops + 1));
    const totalWeight = pool.reduce((sum, e) => sum + e.weight * luck, 0);

    for (let i = 0; i < numDrops && pool.length > 0; i++) {
      let roll = this.rng() * totalWeight;
      for (const entry of pool) {
        roll -= entry.weight * luck;
        if (roll <= 0) {
          drops.push(this.createDrop(entry));
          this.updatePity(tableId, entry.rarity);
          break;
        }
      }
    }

    return drops;
  }

  private createDrop(entry: LootEntry): LootDrop {
    const quantity =
      entry.minQuantity + Math.floor(this.rng() * (entry.maxQuantity - entry.minQuantity + 1));
    return { itemId: entry.itemId, quantity, rarity: entry.rarity };
  }

  // ---------------------------------------------------------------------------
  // Pity System
  // ---------------------------------------------------------------------------

  private updatePity(tableId: string, gotRarity: LootRarity): void {
    const counters = this.pityCounters.get(tableId);
    if (!counters) return;

    // Reset the rarity that was rolled
    counters.set(gotRarity, 0);

    // Increment all other rarities
    const rarities: LootRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    for (const r of rarities) {
      if (r !== gotRarity) {
        counters.set(r, (counters.get(r) ?? 0) + 1);
      }
    }
  }

  getPityCounter(tableId: string, rarity: LootRarity): number {
    return this.pityCounters.get(tableId)?.get(rarity) ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Conditions
  // ---------------------------------------------------------------------------

  setCondition(key: string, value: boolean): void {
    this.conditions.set(key, value);
  }

  private meetsCondition(entry: LootEntry): boolean {
    if (!entry.condition) return true;
    return this.conditions.get(entry.condition) ?? false;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getTableCount(): number {
    return this.tables.size;
  }

  getDropRates(tableId: string): Map<string, number> {
    const table = this.tables.get(tableId);
    if (!table) return new Map();

    const pool = table.entries.filter((e) => !e.guaranteed);
    const totalWeight = pool.reduce((sum, e) => sum + e.weight, 0);
    const rates = new Map<string, number>();

    for (const entry of pool) {
      rates.set(entry.itemId, (entry.weight / totalWeight) * 100);
    }
    return rates;
  }

  reseed(seed: number): void {
    this.seed = seed;
    this.rng = this.createRng(seed);
  }

  private createRng(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }
}
