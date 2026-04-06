/**
 * CraftingSystem — recipes, discovery, crafting queue with time-based completion.
 * @module gameplay
 */

export interface CraftingIngredient {
  itemId: string;
  quantity: number;
}

export interface CraftingOutput {
  itemId: string;
  quantity: number;
}

export interface CraftingRecipe {
  id: string;
  name: string;
  ingredients: CraftingIngredient[];
  output: CraftingOutput;
  workbenchType: string | null;
  craftTime: number;
  discovered: boolean;
  level: number;
}

interface CraftJob {
  recipe: CraftingRecipe;
  elapsed: number;
}

export class CraftingSystem {
  private recipes = new Map<string, CraftingRecipe>();
  private queue: CraftJob[] = [];
  private playerLevel = 1;

  getRecipeCount(): number {
    return this.recipes.size;
  }

  getDiscoveredCount(): number {
    let count = 0;
    for (const r of this.recipes.values()) {
      if (r.discovered) count++;
    }
    return count;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getPlayerLevel(): number {
    return this.playerLevel;
  }

  setPlayerLevel(level: number): void {
    this.playerLevel = level;
  }

  addRecipe(recipe: CraftingRecipe): void {
    this.recipes.set(recipe.id, { ...recipe });
  }

  getRecipe(id: string): CraftingRecipe | undefined {
    return this.recipes.get(id);
  }

  discoverRecipe(id: string): boolean {
    const recipe = this.recipes.get(id);
    if (!recipe) return false;
    recipe.discovered = true;
    return true;
  }

  canCraft(id: string, inventory: Map<string, number>): boolean {
    const recipe = this.recipes.get(id);
    if (!recipe) return false;
    if (!recipe.discovered) return false;
    if (this.playerLevel < recipe.level) return false;
    for (const ing of recipe.ingredients) {
      const have = inventory.get(ing.itemId) ?? 0;
      if (have < ing.quantity) return false;
    }
    return true;
  }

  startCraft(id: string, inventory: Map<string, number>): boolean {
    if (!this.canCraft(id, inventory)) return false;
    const recipe = this.recipes.get(id)!;
    // Consume ingredients
    for (const ing of recipe.ingredients) {
      const have = inventory.get(ing.itemId) ?? 0;
      inventory.set(ing.itemId, have - ing.quantity);
    }
    this.queue.push({ recipe, elapsed: 0 });
    return true;
  }

  update(dt: number): CraftingOutput[] {
    const completed: CraftingOutput[] = [];
    const remaining: CraftJob[] = [];
    for (const job of this.queue) {
      job.elapsed += dt;
      if (job.elapsed >= job.recipe.craftTime) {
        completed.push({ ...job.recipe.output });
      } else {
        remaining.push(job);
      }
    }
    this.queue = remaining;
    return completed;
  }

  checkDiscovery(heldItemIds: string[]): CraftingRecipe[] {
    const discovered: CraftingRecipe[] = [];
    const heldSet = new Set(heldItemIds);
    for (const recipe of this.recipes.values()) {
      if (recipe.discovered) continue;
      const allPresent = recipe.ingredients.every((ing) => heldSet.has(ing.itemId));
      if (allPresent) {
        recipe.discovered = true;
        discovered.push(recipe);
      }
    }
    return discovered;
  }

  getAvailableRecipes(inventory: Map<string, number>): CraftingRecipe[] {
    return [...this.recipes.values()].filter((r) => this.canCraft(r.id, inventory));
  }

  getRecipesByWorkbench(workbenchType: string): CraftingRecipe[] {
    return [...this.recipes.values()].filter((r) => r.workbenchType === workbenchType);
  }
}
