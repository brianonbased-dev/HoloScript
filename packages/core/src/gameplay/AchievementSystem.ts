/**
 * AchievementSystem — registration, progress tracking, unlock events, points.
 * @module gameplay
 */

export type AchievementRarity = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: AchievementRarity;
  maxProgress: number;
  hidden: boolean;
  category: string;
  // runtime state
  unlocked: boolean;
  currentProgress: number;
  unlockedAt: Date | null;
}

const RARITY_POINTS: Record<AchievementRarity, number> = {
  bronze: 5,
  silver: 10,
  gold: 25,
  platinum: 50,
};

type UnlockListener = (achievement: AchievementDef) => void;

export class AchievementSystem {
  private achievements = new Map<string, AchievementDef>();
  private listeners: UnlockListener[] = [];

  register(
    def: Omit<AchievementDef, 'unlocked' | 'currentProgress' | 'unlockedAt'>
  ): AchievementDef {
    const achievement: AchievementDef = {
      ...def,
      unlocked: false,
      currentProgress: 0,
      unlockedAt: null,
    };
    this.achievements.set(achievement.id, achievement);
    return achievement;
  }

  get(id: string): AchievementDef | undefined {
    return this.achievements.get(id);
  }

  getCount(): number {
    return this.achievements.size;
  }

  addProgress(id: string, amount = 1): boolean {
    const ach = this.achievements.get(id);
    if (!ach) return false;
    if (ach.unlocked) return false;

    ach.currentProgress = Math.min(ach.currentProgress + amount, ach.maxProgress);
    if (ach.currentProgress >= ach.maxProgress) {
      ach.unlocked = true;
      ach.unlockedAt = new Date();
      this.fireUnlock(ach);
      return true;
    }
    return false;
  }

  unlock(id: string): boolean {
    const ach = this.achievements.get(id);
    if (!ach) return false;
    if (ach.unlocked) return false;
    ach.unlocked = true;
    ach.currentProgress = ach.maxProgress;
    ach.unlockedAt = new Date();
    this.fireUnlock(ach);
    return true;
  }

  onUnlock(listener: UnlockListener): void {
    this.listeners.push(listener);
  }

  getTotalPoints(): number {
    let total = 0;
    for (const ach of this.achievements.values()) {
      if (ach.unlocked) {
        total += RARITY_POINTS[ach.rarity] ?? 0;
      }
    }
    return total;
  }

  getAll(): AchievementDef[] {
    return [...this.achievements.values()];
  }

  getUnlocked(): AchievementDef[] {
    return [...this.achievements.values()].filter((a) => a.unlocked);
  }

  getUnlockedCount(): number {
    return this.getUnlocked().length;
  }

  getLocked(): AchievementDef[] {
    return [...this.achievements.values()].filter((a) => !a.unlocked);
  }

  getByCategory(category: string): AchievementDef[] {
    return [...this.achievements.values()].filter((a) => a.category === category);
  }

  getByRarity(rarity: AchievementRarity): AchievementDef[] {
    return [...this.achievements.values()].filter((a) => a.rarity === rarity);
  }

  getProgress(id: string): number {
    const ach = this.achievements.get(id);
    if (!ach) return 0;
    return ach.currentProgress / ach.maxProgress;
  }

  getCompletionPercent(): number {
    const total = this.achievements.size;
    if (total === 0) return 0;
    const unlocked = this.getUnlocked().length;
    return (unlocked / total) * 100;
  }

  private fireUnlock(ach: AchievementDef): void {
    for (const listener of this.listeners) {
      listener(ach);
    }
  }
}
