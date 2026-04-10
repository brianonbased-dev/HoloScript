/**
 * LootTable — weighted random loot with seeded RNG, conditions, pity counters.
 * @module gameplay
 */

export interface LootEntry {
  itemId: string;
  weight: number;
  rarity: string;
  minQuantity: number;
  maxQuantity: number;
  guaranteed: boolean;
  condition?: string;
}

export interface LootDrop {
  itemId: string;
  quantity: number;
  rarity: string;
}

interface TableDef {
  entries: LootEntry[];
  minDrops: number;
  maxDrops: number;
}

// Simple seeded PRNG (mulberry32)
function mulberry32(seed: number) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RARITY_TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export class LootTable {
  private tables = new Map<string, TableDef>();
  private conditions = new Map<string, boolean>();
  private pityCounters = new Map<string, Map<string, number>>();
  private rng: () => number;

  constructor(seed?: number) {
    this.rng = mulberry32(seed ?? Date.now());
  }

  getTableCount(): number {
    return this.tables.size;
  }

  addTable(id: string, entries: LootEntry[], minDrops = 1, maxDrops = 3): void {
    this.tables.set(id, {
      entries: entries.map((e) => ({ ...e })),
      minDrops,
      maxDrops,
    });
    // Initialize pity counters
    const pity = new Map<string, number>();
    for (const tier of RARITY_TIERS) {
      pity.set(tier, 0);
    }
    this.pityCounters.set(id, pity);
  }

  getTable(id: string): (TableDef & { minDrops: number; maxDrops: number }) | undefined {
    return this.tables.get(id);
  }

  setCondition(name: string, value: boolean): void {
    this.conditions.set(name, value);
  }

  roll(tableId: string): LootDrop[] {
    const table = this.tables.get(tableId);
    if (!table) return [];

    const drops: LootDrop[] = [];

    // Add guaranteed drops
    for (const entry of table.entries) {
      if (entry.guaranteed) {
        drops.push(this.makeDrop(entry));
      }
    }

    // Filter eligible non-guaranteed entries
    const eligible = table.entries.filter((e) => {
      if (e.guaranteed) return false;
      if (e.condition) {
        return this.conditions.get(e.condition) === true;
      }
      return true;
    });

    if (eligible.length > 0 && table.maxDrops > 0) {
      const numDrops =
        table.minDrops === table.maxDrops
          ? table.minDrops
          : table.minDrops + Math.floor(this.rng() * (table.maxDrops - table.minDrops + 1));

      const totalWeight = eligible.reduce((sum, e) => sum + e.weight, 0);

      for (let i = 0; i < numDrops; i++) {
        const roll = this.rng() * totalWeight;
        let cumulative = 0;
        for (const entry of eligible) {
          cumulative += entry.weight;
          if (roll < cumulative) {
            drops.push(this.makeDrop(entry));
            // Update pity counters
            this.updatePity(tableId, entry.rarity);
            break;
          }
        }
      }
    }

    return drops;
  }

  getPityCounter(tableId: string, rarity: string): number {
    const pity = this.pityCounters.get(tableId);
    if (!pity) return 0;
    return pity.get(rarity) ?? 0;
  }

  getDropRates(tableId: string): Map<string, number> {
    const table = this.tables.get(tableId);
    if (!table) return new Map();

    const nonGuaranteed = table.entries.filter((e) => !e.guaranteed);
    const totalWeight = nonGuaranteed.reduce((sum, e) => sum + e.weight, 0);
    if (totalWeight === 0) return new Map();

    const rates = new Map<string, number>();
    for (const entry of nonGuaranteed) {
      rates.set(entry.itemId, (entry.weight / totalWeight) * 100);
    }
    return rates;
  }

  reseed(seed: number): void {
    this.rng = mulberry32(seed);
  }

  private makeDrop(entry: LootEntry): LootDrop {
    const quantity =
      entry.minQuantity === entry.maxQuantity
        ? entry.minQuantity
        : entry.minQuantity + Math.floor(this.rng() * (entry.maxQuantity - entry.minQuantity + 1));
    return {
      itemId: entry.itemId,
      quantity,
      rarity: entry.rarity,
    };
  }

  private updatePity(tableId: string, droppedRarity: string): void {
    const pity = this.pityCounters.get(tableId);
    if (!pity) return;
    for (const tier of RARITY_TIERS) {
      if (tier === droppedRarity) {
        pity.set(tier, 0);
      } else {
        pity.set(tier, (pity.get(tier) ?? 0) + 1);
      }
    }
  }
}
