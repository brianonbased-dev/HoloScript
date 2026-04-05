/**
 * AchievementSystem.ts
 *
 * Achievement tracking: conditions, unlock, progress,
 * tiers, notifications, and persistence.
 *
 * @module gameplay
 */

// =============================================================================
// TYPES
// =============================================================================

export type AchievementRarity = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: AchievementRarity;
  maxProgress: number;
  currentProgress: number;
  unlocked: boolean;
  unlockedAt: number | null;
  hidden: boolean; // Don't show until unlocked
  category: string;
}

// =============================================================================
// ACHIEVEMENT SYSTEM
// =============================================================================

export class AchievementSystem {
  private achievements: Map<string, AchievementDef> = new Map();
  private listeners: Array<(achievement: AchievementDef) => void> = [];
  private totalPoints = 0;

  private static readonly RARITY_POINTS: Record<AchievementRarity, number> = {
    bronze: 5,
    silver: 10,
    gold: 25,
    platinum: 50,
    diamond: 100,
  };

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  register(
    config: Omit<AchievementDef, 'currentProgress' | 'unlocked' | 'unlockedAt'>
  ): AchievementDef {
    const achievement: AchievementDef = {
      ...config,
      currentProgress: 0,
      unlocked: false,
      unlockedAt: null,
    };
    this.achievements.set(config.id, achievement);
    return achievement;
  }

  // ---------------------------------------------------------------------------
  // Progress
  // ---------------------------------------------------------------------------

  addProgress(id: string, amount = 1): boolean {
    const ach = this.achievements.get(id);
    if (!ach || ach.unlocked) return false;

    ach.currentProgress = Math.min(ach.maxProgress, ach.currentProgress + amount);

    if (ach.currentProgress >= ach.maxProgress) {
      ach.unlocked = true;
      ach.unlockedAt = Date.now();
      this.totalPoints += AchievementSystem.RARITY_POINTS[ach.rarity];
      for (const l of this.listeners) l(ach);
      return true;
    }
    return false;
  }

  unlock(id: string): boolean {
    const ach = this.achievements.get(id);
    if (!ach || ach.unlocked) return false;
    ach.currentProgress = ach.maxProgress;
    ach.unlocked = true;
    ach.unlockedAt = Date.now();
    this.totalPoints += AchievementSystem.RARITY_POINTS[ach.rarity];
    for (const l of this.listeners) l(ach);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  onUnlock(listener: (achievement: AchievementDef) => void): void {
    this.listeners.push(listener);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  get(id: string): AchievementDef | undefined {
    return this.achievements.get(id);
  }
  getAll(): AchievementDef[] {
    return [...this.achievements.values()];
  }
  getUnlocked(): AchievementDef[] {
    return this.getAll().filter((a) => a.unlocked);
  }
  getLocked(): AchievementDef[] {
    return this.getAll().filter((a) => !a.unlocked);
  }
  getByCategory(cat: string): AchievementDef[] {
    return this.getAll().filter((a) => a.category === cat);
  }
  getByRarity(rarity: AchievementRarity): AchievementDef[] {
    return this.getAll().filter((a) => a.rarity === rarity);
  }
  getCount(): number {
    return this.achievements.size;
  }
  getUnlockedCount(): number {
    return this.getUnlocked().length;
  }
  getTotalPoints(): number {
    return this.totalPoints;
  }
  getCompletionPercent(): number {
    if (this.achievements.size === 0) return 0;
    return (this.getUnlockedCount() / this.achievements.size) * 100;
  }

  getProgress(id: string): number {
    const ach = this.achievements.get(id);
    if (!ach) return 0;
    return ach.currentProgress / ach.maxProgress;
  }
}

