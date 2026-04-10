/**
 * RewardSystem — bundles, claiming, XP/leveling, currency, unlocks, skill points.
 * @module gameplay
 */

export interface RewardDef {
  type: 'xp' | 'currency' | 'unlock' | 'skill_point';
  target: string;
  amount: number;
}

export interface RewardEntry extends RewardDef {
  id: string;
}

export interface RewardBundle {
  id: string;
  name: string;
  rewards: RewardEntry[];
  claimed: boolean;
  claimedAt: Date | null;
}

export interface PlayerStats {
  xp: number;
  level: number;
  currency: Map<string, number>;
  unlocks: Set<string>;
  skillPoints: number;
}

let bundleIdCounter = 0;
let rewardIdCounter = 0;

export class RewardSystem {
  private bundles = new Map<string, RewardBundle>();
  private xp = 0;
  private level = 1;
  private xpMultiplier = 1;
  private currency = new Map<string, number>();
  private unlocks = new Set<string>();
  private skillPoints = 0;
  private claimedCount = 0;

  getBundleCount(): number {
    return this.bundles.size;
  }

  getClaimedCount(): number {
    return this.claimedCount;
  }

  createBundle(name: string, rewards: RewardDef[]): RewardBundle {
    const id = `bundle_${++bundleIdCounter}`;
    const bundle: RewardBundle = {
      id,
      name,
      rewards: rewards.map((r) => ({ ...r, id: `reward_${++rewardIdCounter}` })),
      claimed: false,
      claimedAt: null,
    };
    this.bundles.set(id, bundle);
    return bundle;
  }

  getBundle(id: string): RewardBundle | undefined {
    return this.bundles.get(id);
  }

  claim(bundleId: string): RewardEntry[] | null {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) return null;
    if (bundle.claimed) return null;

    bundle.claimed = true;
    bundle.claimedAt = new Date();
    this.claimedCount++;

    for (const reward of bundle.rewards) {
      this.applyReward(reward);
    }

    return [...bundle.rewards];
  }

  // --- XP & Leveling ---

  addXP(amount: number): { leveled: boolean; newLevel: number } {
    const scaled = amount * this.xpMultiplier;
    this.xp += scaled;

    let leveled = false;
    while (this.xp >= this.getXPForLevel(this.level + 1)) {
      this.level++;
      leveled = true;
    }

    return { leveled, newLevel: this.level };
  }

  getXP(): number {
    return this.xp;
  }

  getLevel(): number {
    return this.level;
  }

  setXPMultiplier(multiplier: number): void {
    this.xpMultiplier = multiplier;
  }

  // --- Currency ---

  getCurrency(name: string): number {
    return this.currency.get(name) ?? 0;
  }

  spendCurrency(name: string, amount: number): boolean {
    const balance = this.currency.get(name) ?? 0;
    if (balance < amount) return false;
    this.currency.set(name, balance - amount);
    return true;
  }

  // --- Unlocks ---

  hasUnlock(target: string): boolean {
    return this.unlocks.has(target);
  }

  // --- Skill Points ---

  getSkillPoints(): number {
    return this.skillPoints;
  }

  // --- Stats ---

  getStats(): PlayerStats {
    return {
      xp: this.xp,
      level: this.level,
      currency: new Map(this.currency),
      unlocks: new Set(this.unlocks),
      skillPoints: this.skillPoints,
    };
  }

  // --- Internal ---

  private applyReward(reward: RewardDef): void {
    switch (reward.type) {
      case 'xp':
        this.addXP(reward.amount);
        break;
      case 'currency': {
        const current = this.currency.get(reward.target) ?? 0;
        this.currency.set(reward.target, current + reward.amount);
        break;
      }
      case 'unlock':
        this.unlocks.add(reward.target);
        break;
      case 'skill_point':
        this.skillPoints += reward.amount;
        break;
    }
  }

  private getXPForLevel(level: number): number {
    return level * 100;
  }
}
