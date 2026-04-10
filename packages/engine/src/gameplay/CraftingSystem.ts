/**
 * CraftingSystem.ts
 *
 * Recipe-based crafting: ingredients, workbenches,
 * recipe discovery, and crafting output.
 *
 * @module gameplay
 */

// =============================================================================
// TYPES
// =============================================================================

export interface CraftingIngredient {
  itemId: string;
  quantity: number;
}

export interface CraftingRecipe {
  id: string;
  name: string;
  ingredients: CraftingIngredient[];
  output: { itemId: string; quantity: number };
  workbenchType: string | null; // null = hand-craft
  craftTime: number; // seconds
  discovered: boolean;
  level: number; // required skill level
}

// =============================================================================
// CRAFTING SYSTEM
// =============================================================================

export class CraftingSystem {
  private recipes: Map<string, CraftingRecipe> = new Map();
  private discoveredRecipes: Set<string> = new Set();
  private craftingQueue: Array<{ recipe: CraftingRecipe; startTime: number; elapsed: number }> = [];
  private playerLevel = 1;

  // ---------------------------------------------------------------------------
  // Recipe Management
  // ---------------------------------------------------------------------------

  addRecipe(recipe: CraftingRecipe): void {
    this.recipes.set(recipe.id, recipe);
    if (recipe.discovered) this.discoveredRecipes.add(recipe.id);
  }

  getRecipe(id: string): CraftingRecipe | undefined {
    return this.recipes.get(id);
  }

  discoverRecipe(id: string): boolean {
    if (!this.recipes.has(id)) return false;
    this.discoveredRecipes.add(id);
    const recipe = this.recipes.get(id)!;
    recipe.discovered = true;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Crafting
  // ---------------------------------------------------------------------------

  canCraft(recipeId: string, availableItems: Map<string, number>): boolean {
    const recipe = this.recipes.get(recipeId);
    if (!recipe || !recipe.discovered) return false;
    if (recipe.level > this.playerLevel) return false;

    for (const ing of recipe.ingredients) {
      const available = availableItems.get(ing.itemId) ?? 0;
      if (available < ing.quantity) return false;
    }
    return true;
  }

  startCraft(recipeId: string, availableItems: Map<string, number>): boolean {
    if (!this.canCraft(recipeId, availableItems)) return false;
    const recipe = this.recipes.get(recipeId)!;

    // Consume ingredients
    for (const ing of recipe.ingredients) {
      const current = availableItems.get(ing.itemId) ?? 0;
      availableItems.set(ing.itemId, current - ing.quantity);
    }

    this.craftingQueue.push({ recipe, startTime: Date.now(), elapsed: 0 });
    return true;
  }

  update(dt: number): Array<{ itemId: string; quantity: number }> {
    const completed: Array<{ itemId: string; quantity: number }> = [];
    const remaining: Array<{ recipe: CraftingRecipe; startTime: number; elapsed: number }> = [];

    for (const craft of this.craftingQueue) {
      craft.elapsed += dt;
      if (craft.elapsed >= craft.recipe.craftTime) {
        completed.push(craft.recipe.output);
      } else {
        remaining.push(craft);
      }
    }

    this.craftingQueue = remaining;
    return completed;
  }

  // ---------------------------------------------------------------------------
  // Discovery
  // ---------------------------------------------------------------------------

  checkDiscovery(heldItems: string[]): CraftingRecipe[] {
    const discovered: CraftingRecipe[] = [];
    for (const recipe of this.recipes.values()) {
      if (recipe.discovered) continue;
      const needed = recipe.ingredients.map((i) => i.itemId);
      if (needed.every((id) => heldItems.includes(id))) {
        recipe.discovered = true;
        this.discoveredRecipes.add(recipe.id);
        discovered.push(recipe);
      }
    }
    return discovered;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  setPlayerLevel(level: number): void {
    this.playerLevel = level;
  }
  getPlayerLevel(): number {
    return this.playerLevel;
  }
  getRecipeCount(): number {
    return this.recipes.size;
  }
  getDiscoveredCount(): number {
    return this.discoveredRecipes.size;
  }
  getQueueLength(): number {
    return this.craftingQueue.length;
  }

  getAvailableRecipes(availableItems: Map<string, number>): CraftingRecipe[] {
    return [...this.recipes.values()].filter(
      (r) => r.discovered && this.canCraft(r.id, availableItems)
    );
  }

  getRecipesByWorkbench(workbenchType: string): CraftingRecipe[] {
    return [...this.recipes.values()].filter(
      (r) => r.discovered && r.workbenchType === workbenchType
    );
  }
}

