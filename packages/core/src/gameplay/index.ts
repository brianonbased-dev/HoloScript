/**
 * Gameplay subsystem — barrel export.
 * @module gameplay
 */

export { InventorySystem } from './InventorySystem';
export type { ItemDef, InventorySlot, AddResult } from './InventorySystem';

export { QuestManager } from './QuestManager';
export type { QuestDef, QuestObjective } from './QuestManager';

export { CraftingSystem } from './CraftingSystem';
export type { CraftingRecipe, CraftingIngredient, CraftingOutput } from './CraftingSystem';

export { LootTable } from './LootTable';
export type { LootEntry, LootDrop } from './LootTable';

export { AchievementSystem } from './AchievementSystem';
export type { AchievementDef, AchievementRarity } from './AchievementSystem';

export { ProgressionTree } from './ProgressionTree';
export type { SkillNode, SkillNodeDef } from './ProgressionTree';

export { LeaderboardManager } from './LeaderboardManager';
export type { Board, LeaderboardEntry, SubmitResult } from './LeaderboardManager';

export { RewardSystem } from './RewardSystem';
export type { RewardDef, RewardEntry, RewardBundle, PlayerStats } from './RewardSystem';

export { JournalTracker } from './JournalTracker';
export type { JournalEntry, JournalNotification } from './JournalTracker';
