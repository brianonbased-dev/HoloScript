/**
 * RewardSystem.ts
 *
 * Reward distribution: XP, items, currency, unlock conditions,
 * reward multipliers, and loot integration.
 *
 * @module gameplay
 */

// =============================================================================
// TYPES
// =============================================================================

export type RewardType = 'xp' | 'item' | 'currency' | 'unlock' | 'reputation' | 'skill_point';

export interface RewardDef {
  id: string;
  type: RewardType;
  target: string; // item ID, currency name, unlock key, etc.
  amount: number;
  condition?: string; // Optional condition key
}

export interface RewardBundle {
  id: string;
  name: string;
  rewards: RewardDef[];
  claimed: boolean;
  claimedAt: number | null;
}

export interface PlayerStats {
  xp: number;
  level: number;
  currency: Map<string, number>;
  unlocks: Set<string>;
  skillPoints: number;
}

// =============================================================================
// REWARD SYSTEM
// =============================================================================

let _rewardId = 0;

export class RewardSystem {
  private bundles: Map<string, RewardBundle> = new Map();
  private stats: PlayerStats = {
    xp: 0,
    level: 1,
    currency: new Map([['gold', 0]]),
    unlocks: new Set(),
    skillPoints: 0,
  };
  private xpPerLevel = 100;
  private xpMultiplier = 1;
  private rewardHistory: Array<{ bundle: string; timestamp: number }> = [];

  // ---------------------------------------------------------------------------
  // Bundle Management
  // ---------------------------------------------------------------------------

  createBundle(name: string, rewards: Omit<RewardDef, 'id'>[]): RewardBundle {
    const id = `bundle_${_rewardId++}`;
    const bundle: RewardBundle = {
      id,
      name,
      rewards: rewards.map((r) => ({ ...r, id: `reward_${_rewardId++}` })),
      claimed: false,
      claimedAt: null,
    };
    this.bundles.set(id, bundle);
    return bundle;
  }

  getBundle(id: string): RewardBundle | undefined {
    return this.bundles.get(id);
  }

  // ---------------------------------------------------------------------------
  // Claim Rewards
  // ---------------------------------------------------------------------------

  claim(bundleId: string): RewardDef[] | null {
    const bundle = this.bundles.get(bundleId);
    if (!bundle || bundle.claimed) return null;

    const granted: RewardDef[] = [];

    for (const reward of bundle.rewards) {
      this.applyReward(reward);
      granted.push(reward);
    }

    bundle.claimed = true;
    bundle.claimedAt = Date.now();
    this.rewardHistory.push({ bundle: bundleId, timestamp: Date.now() });

    return granted;
  }

  private applyReward(reward: RewardDef): void {
    switch (reward.type) {
      case 'xp':
        this.addXP(reward.amount);
        break;
      case 'currency': {
        const current = this.stats.currency.get(reward.target) ?? 0;
        this.stats.currency.set(reward.target, current + reward.amount);
        break;
      }
      case 'unlock':
        this.stats.unlocks.add(reward.target);
        break;
      case 'skill_point':
        this.stats.skillPoints += reward.amount;
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // XP & Leveling
  // ---------------------------------------------------------------------------

  addXP(amount: number): { leveled: boolean; newLevel: number } {
    const adjusted = Math.floor(amount * this.xpMultiplier);
    this.stats.xp += adjusted;

    let leveled = false;
    while (this.stats.xp >= this.getXPForLevel(this.stats.level + 1)) {
      this.stats.level++;
      leveled = true;
    }

    return { leveled, newLevel: this.stats.level };
  }

  getXPForLevel(level: number): number {
    return level * this.xpPerLevel;
  }

  setXPMultiplier(mult: number): void {
    this.xpMultiplier = mult;
  }

  // ---------------------------------------------------------------------------
  // Currency
  // ---------------------------------------------------------------------------

  getCurrency(name: string): number {
    return this.stats.currency.get(name) ?? 0;
  }

  spendCurrency(name: string, amount: number): boolean {
    const current = this.stats.currency.get(name) ?? 0;
    if (current < amount) return false;
    this.stats.currency.set(name, current - amount);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getStats(): PlayerStats {
    return {
      ...this.stats,
      currency: new Map(this.stats.currency),
      unlocks: new Set(this.stats.unlocks),
    };
  }
  getLevel(): number {
    return this.stats.level;
  }
  getXP(): number {
    return this.stats.xp;
  }
  hasUnlock(key: string): boolean {
    return this.stats.unlocks.has(key);
  }
  getSkillPoints(): number {
    return this.stats.skillPoints;
  }
  getBundleCount(): number {
    return this.bundles.size;
  }
  getClaimedCount(): number {
    return [...this.bundles.values()].filter((b) => b.claimed).length;
  }
}

