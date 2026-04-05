/**
 * RenderPass.ts
 *
 * Render pass pipeline: ordering, dependencies, framebuffer
 * attachments, clear ops, and compositing.
 *
 * @module rendering
 */

// =============================================================================
// TYPES
// =============================================================================

export type AttachmentFormat =
  | 'rgba8'
  | 'rgba16f'
  | 'rgba32f'
  | 'depth24'
  | 'depth32f'
  | 'stencil8';
export type ClearOp = 'clear' | 'load' | 'discard';

export interface FramebufferAttachment {
  name: string;
  format: AttachmentFormat;
  width: number;
  height: number;
  clearOp: ClearOp;
  clearColor?: [number, number, number, number];
}

export interface RenderPassConfig {
  id: string;
  name: string;
  order: number;
  enabled: boolean;
  dependencies: string[]; // IDs of passes that must run before
  attachments: FramebufferAttachment[];
  inputs: string[]; // Attachment names from other passes
  viewport?: { x: number; y: number; w: number; h: number };
}

// =============================================================================
// RENDER PASS
// =============================================================================

export class RenderPass {
  private passes: Map<string, RenderPassConfig> = new Map();
  private sortedOrder: string[] = [];

  // ---------------------------------------------------------------------------
  // Pass Management
  // ---------------------------------------------------------------------------

  addPass(config: RenderPassConfig): void {
    this.passes.set(config.id, config);
    this.rebuildOrder();
  }

  removePass(id: string): void {
    this.passes.delete(id);
    this.rebuildOrder();
  }

  getPass(id: string): RenderPassConfig | undefined {
    return this.passes.get(id);
  }

  enablePass(id: string, enabled: boolean): void {
    const p = this.passes.get(id);
    if (p) p.enabled = enabled;
  }

  // ---------------------------------------------------------------------------
  // Ordering (Topological Sort)
  // ---------------------------------------------------------------------------

  private rebuildOrder(): void {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const pass = this.passes.get(id);
      if (!pass) return;
      for (const dep of pass.dependencies) visit(dep);
      result.push(id);
    };

    // Sort by order first, then resolve dependencies
    const sorted = [...this.passes.values()].sort((a, b) => a.order - b.order);
    for (const pass of sorted) visit(pass.id);

    this.sortedOrder = result;
  }

  getExecutionOrder(): RenderPassConfig[] {
    return this.sortedOrder.map((id) => this.passes.get(id)!).filter((p) => p && p.enabled);
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  validate(): string[] {
    const errors: string[] = [];

    for (const pass of this.passes.values()) {
      for (const dep of pass.dependencies) {
        if (!this.passes.has(dep)) errors.push(`Pass "${pass.id}" depends on unknown pass "${dep}"`);
      }
      for (const input of pass.inputs) {
        // Check input attachment exists in some preceding pass
        let found = false;
        for (const dep of pass.dependencies) {
          const depPass = this.passes.get(dep);
          if (depPass?.attachments.some((a) => a.name === input)) {
            found = true;
            break;
          }
        }
        if (!found) {
          errors.push(`Pass "${pass.id}" requires input "${input}" not produced by dependencies`);
        }
      }
    }

    // Check for cycles
    if (this.hasCycle()) errors.push('Dependency cycle detected in render passes');

    return errors;
  }

  private hasCycle(): boolean {
    const white = new Set<string>(this.passes.keys());
    const gray = new Set<string>();

    const dfs = (id: string): boolean => {
      white.delete(id);
      gray.add(id);
      const pass = this.passes.get(id);
      if (pass) {
        for (const dep of pass.dependencies) {
          if (gray.has(dep)) return true;
          if (white.has(dep) && dfs(dep)) return true;
        }
      }
      gray.delete(id);
      return false;
    };

    for (const id of [...white]) {
      if (white.has(id) && dfs(id)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getPassCount(): number {
    return this.passes.size;
  }
  getAllPasses(): RenderPassConfig[] {
    return [...this.passes.values()];
  }
}
