/**
 * ProgressionTree.ts
 *
 * Skill tree: nodes with prerequisites, point allocation,
 * tiers, respec, and tree traversal.
 *
 * @module gameplay
 */

// =============================================================================
// TYPES
// =============================================================================

export interface SkillNode {
  id: string;
  name: string;
  description: string;
  tier: number;
  maxLevel: number;
  currentLevel: number;
  cost: number; // Points per level
  prerequisites: string[]; // Node IDs
  unlocked: boolean;
  icon: string;
  category: string;
  effects: Record<string, number>; // stat → bonus per level
}

// =============================================================================
// PROGRESSION TREE
// =============================================================================

export class ProgressionTree {
  private nodes: Map<string, SkillNode> = new Map();
  private availablePoints = 0;
  private totalSpent = 0;
  private respecCount = 0;

  // ---------------------------------------------------------------------------
  // Node Management
  // ---------------------------------------------------------------------------

  addNode(config: Omit<SkillNode, 'currentLevel' | 'unlocked'>): SkillNode {
    const node: SkillNode = { ...config, currentLevel: 0, unlocked: false };
    this.nodes.set(config.id, node);
    this.checkUnlock(config.id);
    return node;
  }

  getNode(id: string): SkillNode | undefined {
    return this.nodes.get(id);
  }

  // ---------------------------------------------------------------------------
  // Points
  // ---------------------------------------------------------------------------

  addPoints(amount: number): void {
    this.availablePoints += amount;
  }
  getAvailablePoints(): number {
    return this.availablePoints;
  }
  getTotalSpent(): number {
    return this.totalSpent;
  }

  // ---------------------------------------------------------------------------
  // Allocation
  // ---------------------------------------------------------------------------

  invest(id: string, levels = 1): boolean {
    const node = this.nodes.get(id);
    if (!node || !node.unlocked) return false;
    if (node.currentLevel + levels > node.maxLevel) return false;

    const cost = node.cost * levels;
    if (this.availablePoints < cost) return false;

    node.currentLevel += levels;
    this.availablePoints -= cost;
    this.totalSpent += cost;

    // Check if any downstream nodes are now unlockable
    this.recheckAll();
    return true;
  }

  canInvest(id: string, levels = 1): boolean {
    const node = this.nodes.get(id);
    if (!node || !node.unlocked) return false;
    if (node.currentLevel + levels > node.maxLevel) return false;
    return this.availablePoints >= node.cost * levels;
  }

  // ---------------------------------------------------------------------------
  // Prerequisites
  // ---------------------------------------------------------------------------

  private checkUnlock(id: string): void {
    const node = this.nodes.get(id);
    if (!node || node.unlocked) return;

    const met = node.prerequisites.every((preId) => {
      const pre = this.nodes.get(preId);
      return pre && pre.currentLevel > 0;
    });

    if (met || node.prerequisites.length === 0) {
      node.unlocked = true;
    }
  }

  private recheckAll(): void {
    for (const id of this.nodes.keys()) this.checkUnlock(id);
  }

  // ---------------------------------------------------------------------------
  // Respec
  // ---------------------------------------------------------------------------

  respec(): void {
    for (const node of this.nodes.values()) {
      this.availablePoints += node.currentLevel * node.cost;
      this.totalSpent -= node.currentLevel * node.cost;
      node.currentLevel = 0;
    }
    this.respecCount++;
    this.recheckAll();
  }

  getRespecCount(): number {
    return this.respecCount;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getByTier(tier: number): SkillNode[] {
    return [...this.nodes.values()].filter((n) => n.tier === tier);
  }
  getByCategory(cat: string): SkillNode[] {
    return [...this.nodes.values()].filter((n) => n.category === cat);
  }
  getUnlocked(): SkillNode[] {
    return [...this.nodes.values()].filter((n) => n.unlocked);
  }
  getInvested(): SkillNode[] {
    return [...this.nodes.values()].filter((n) => n.currentLevel > 0);
  }
  getNodeCount(): number {
    return this.nodes.size;
  }

  getEffectTotal(stat: string): number {
    let total = 0;
    for (const node of this.nodes.values()) {
      if (node.effects[stat]) total += node.effects[stat] * node.currentLevel;
    }
    return total;
  }

  getTiers(): number[] {
    const tiers = new Set<number>();
    for (const n of this.nodes.values()) tiers.add(n.tier);
    return [...tiers].sort((a, b) => a - b);
  }
}
