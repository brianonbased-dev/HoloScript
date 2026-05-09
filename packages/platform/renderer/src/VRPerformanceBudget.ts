/**
 * VRPerformanceBudget
 *
 * Allocates and tracks per-frame CPU/GPU/render/inference budgets so that
 * the renderer can adapt before it misses the next VSync.
 *
 * Integrates with HololandRenderer.update() — call beginFrame() at the start
 * of the frame and endFrame() after all work is submitted.
 */

export type BudgetCategory = 'render' | 'inference' | 'gpu' | 'cpu';

export interface BudgetConfig {
  /** Target frame time in ms (default 16.67 for 60 Hz, 11.11 for 90 Hz). */
  targetFrameTimeMs: number;
  /** Fraction of the frame reserved for each category (must sum ≤ 1.0). */
  allocations: Record<BudgetCategory, number>;
  /** Number of historical frames to keep for averaging. */
  historyWindow: number;
}

export interface BudgetSnapshot {
  category: BudgetCategory;
  budgetMs: number;
  usedMs: number;
  remainingMs: number;
  overBudget: boolean;
}

export interface FrameBudgetReport {
  frameTimeMs: number;
  categories: BudgetSnapshot[];
  anyOverBudget: boolean;
  totalUsedMs: number;
  headroomMs: number;
}

export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  targetFrameTimeMs: 16.67,
  allocations: {
    render: 0.45,
    inference: 0.25,
    gpu: 0.20,
    cpu: 0.10,
  },
  historyWindow: 60,
};

export interface VRPerformanceBudgetOptions {
  targetFrameTimeMs?: number;
  allocations?: Partial<Record<BudgetCategory, number>>;
  historyWindow?: number;
}

export class VRPerformanceBudget {
  private readonly config: BudgetConfig;
  private readonly usage: Record<BudgetCategory, number> = {
    render: 0,
    inference: 0,
    gpu: 0,
    cpu: 0,
  };
  private frameStart = 0;
  private readonly history: FrameBudgetReport[] = [];

  constructor(options: VRPerformanceBudgetOptions = {}) {
    const allocations = {
      ...DEFAULT_BUDGET_CONFIG.allocations,
      ...options.allocations,
    };
    const total = Object.values(allocations).reduce((a, b) => a + b, 0);
    if (total > 1.0) {
      // Normalise so the budget never exceeds the frame
      const scale = 1.0 / total;
      for (const key of Object.keys(allocations) as BudgetCategory[]) {
        allocations[key] *= scale;
      }
    }
    this.config = {
      targetFrameTimeMs: options.targetFrameTimeMs ?? DEFAULT_BUDGET_CONFIG.targetFrameTimeMs,
      allocations,
      historyWindow: options.historyWindow ?? DEFAULT_BUDGET_CONFIG.historyWindow,
    };
  }

  /** Call at the very start of the render frame. */
  beginFrame(now = performance.now()): void {
    this.frameStart = now;
    for (const key of Object.keys(this.usage) as BudgetCategory[]) {
      this.usage[key] = 0;
    }
  }

  /** Record how much time a category consumed this frame. */
  recordUsage(category: BudgetCategory, ms: number): void {
    this.usage[category] += ms;
  }

  /** Call after all frame work is submitted. Returns the full report. */
  endFrame(now = performance.now()): FrameBudgetReport {
    const frameTimeMs = now - this.frameStart;
    const categories: BudgetSnapshot[] = [];
    let totalUsedMs = 0;
    let anyOverBudget = false;

    for (const category of Object.keys(this.config.allocations) as BudgetCategory[]) {
      const budgetMs = this.config.targetFrameTimeMs * this.config.allocations[category];
      const usedMs = this.usage[category];
      const remainingMs = budgetMs - usedMs;
      const overBudget = usedMs > budgetMs;
      if (overBudget) anyOverBudget = true;
      totalUsedMs += usedMs;

      categories.push({
        category,
        budgetMs: Math.round(budgetMs * 100) / 100,
        usedMs: Math.round(usedMs * 100) / 100,
        remainingMs: Math.round(remainingMs * 100) / 100,
        overBudget,
      });
    }

    const headroomMs = this.config.targetFrameTimeMs - totalUsedMs;
    const report: FrameBudgetReport = {
      frameTimeMs: Math.round(frameTimeMs * 100) / 100,
      categories,
      anyOverBudget,
      totalUsedMs: Math.round(totalUsedMs * 100) / 100,
      headroomMs: Math.round(headroomMs * 100) / 100,
    };

    this.history.push(report);
    if (this.history.length > this.config.historyWindow) {
      this.history.shift();
    }

    return report;
  }

  /** Current report from the most recent ended frame. */
  getLastReport(): FrameBudgetReport | null {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }

  /** Categories that exceeded their budget in the last frame. */
  getOverBudgetCategories(): BudgetCategory[] {
    const last = this.getLastReport();
    if (!last) return [];
    return last.categories.filter((c) => c.overBudget).map((c) => c.category);
  }

  /** Rolling average frame time over the history window. */
  getAverageFrameTimeMs(): number {
    if (this.history.length === 0) return 0;
    const sum = this.history.reduce((a, r) => a + r.frameTimeMs, 0);
    return Math.round((sum / this.history.length) * 100) / 100;
  }

  /** Fraction of historical frames that were over budget in any category. */
  getOverBudgetRate(): number {
    if (this.history.length === 0) return 0;
    const overCount = this.history.filter((r) => r.anyOverBudget).length;
    return Math.round((overCount / this.history.length) * 1000) / 1000;
  }

  /** Remaining budget for a category in the current (open) frame. */
  getRemaining(category: BudgetCategory, now = performance.now()): number {
    const budgetMs = this.config.targetFrameTimeMs * this.config.allocations[category];
    const elapsed = now - this.frameStart;
    // If usage was explicitly recorded, prefer it; otherwise fall back to elapsed wall-clock
    const used = this.usage[category] > 0 ? this.usage[category] : elapsed;
    return Math.max(0, budgetMs - used);
  }

  getTargetFrameTimeMs(): number {
    return this.config.targetFrameTimeMs;
  }

  getAllocations(): Readonly<Record<BudgetCategory, number>> {
    return { ...this.config.allocations };
  }
}
