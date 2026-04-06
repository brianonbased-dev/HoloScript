/**
 * ProgressionTree — skill tree with points, tiers, prerequisites, respec, effects.
 * @module gameplay
 */

export interface SkillNodeDef {
  id: string;
  name: string;
  description: string;
  tier: number;
  maxLevel: number;
  cost: number;
  prerequisites: string[];
  icon: string;
  category: string;
  effects: Record<string, number>;
}

export interface SkillNode extends SkillNodeDef {
  currentLevel: number;
  unlocked: boolean;
}

export class ProgressionTree {
  private nodes = new Map<string, SkillNode>();
  private availablePoints = 0;
  private totalSpent = 0;
  private respecCount = 0;

  getNodeCount(): number {
    return this.nodes.size;
  }

  getAvailablePoints(): number {
    return this.availablePoints;
  }

  getTotalSpent(): number {
    return this.totalSpent;
  }

  getRespecCount(): number {
    return this.respecCount;
  }

  addPoints(amount: number): void {
    this.availablePoints += amount;
  }

  addNode(def: SkillNodeDef): SkillNode {
    const unlocked =
      def.prerequisites.length === 0 ||
      def.prerequisites.every((pid) => {
        const prereq = this.nodes.get(pid);
        return prereq && prereq.currentLevel > 0;
      });

    const node: SkillNode = {
      ...def,
      currentLevel: 0,
      unlocked,
    };
    this.nodes.set(node.id, node);
    return node;
  }

  getNode(id: string): SkillNode | undefined {
    return this.nodes.get(id);
  }

  canInvest(id: string, levels = 1): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;
    if (!node.unlocked) return false;
    if (node.currentLevel + levels > node.maxLevel) return false;
    if (this.availablePoints < node.cost * levels) return false;
    return true;
  }

  invest(id: string, levels = 1): boolean {
    if (!this.canInvest(id, levels)) return false;
    const node = this.nodes.get(id)!;
    const cost = node.cost * levels;
    node.currentLevel += levels;
    this.availablePoints -= cost;
    this.totalSpent += cost;

    // Unlock downstream nodes
    for (const n of this.nodes.values()) {
      if (n.unlocked) continue;
      if (n.prerequisites.length === 0) continue;
      const allMet = n.prerequisites.every((pid) => {
        const prereq = this.nodes.get(pid);
        return prereq && prereq.currentLevel > 0;
      });
      if (allMet) {
        n.unlocked = true;
      }
    }

    return true;
  }

  respec(): void {
    for (const node of this.nodes.values()) {
      node.currentLevel = 0;
    }
    this.availablePoints += this.totalSpent;
    this.totalSpent = 0;
    this.respecCount++;

    // Re-evaluate unlocked states
    for (const node of this.nodes.values()) {
      if (node.prerequisites.length === 0) {
        node.unlocked = true;
      } else {
        node.unlocked = node.prerequisites.every((pid) => {
          const prereq = this.nodes.get(pid);
          return prereq && prereq.currentLevel > 0;
        });
      }
    }
  }

  getByTier(tier: number): SkillNode[] {
    return [...this.nodes.values()].filter((n) => n.tier === tier);
  }

  getByCategory(category: string): SkillNode[] {
    return [...this.nodes.values()].filter((n) => n.category === category);
  }

  getUnlocked(): SkillNode[] {
    return [...this.nodes.values()].filter((n) => n.unlocked);
  }

  getInvested(): SkillNode[] {
    return [...this.nodes.values()].filter((n) => n.currentLevel > 0);
  }

  getEffectTotal(effectName: string): number {
    let total = 0;
    for (const node of this.nodes.values()) {
      if (node.currentLevel > 0 && effectName in node.effects) {
        total += node.effects[effectName] * node.currentLevel;
      }
    }
    return total;
  }

  getTiers(): number[] {
    const tiers = new Set<number>();
    for (const node of this.nodes.values()) {
      tiers.add(node.tier);
    }
    return [...tiers].sort((a, b) => a - b);
  }
}
