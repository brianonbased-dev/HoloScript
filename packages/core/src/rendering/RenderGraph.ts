/**
 * RenderGraph.ts
 *
 * Declarative render graph: defines passes (shadow, depth-prepass, G-buffer,
 * lighting, post-process), their texture inputs/outputs, and execution order.
 * The graph is topologically sorted before execution.
 *
 * @module render
 */

import type { EngineSystem } from '../engine/SpatialEngine';

// =============================================================================
// TYPES
// =============================================================================

export type TextureFormat =
  | 'rgba8unorm'
  | 'rgba16float'
  | 'depth24plus'
  | 'depth32float'
  | 'r32float'
  | 'rg16float';

export interface RenderTarget {
  id: string;
  width: number;
  height: number;
  format: TextureFormat;
  mipLevels?: number;
}

export interface RenderPassDescriptor {
  /** Unique pass name. */
  id: string;
  /** Textures this pass reads from. */
  inputs: string[];
  /** Textures this pass writes to. */
  outputs: string[];
  /** Clear color (null = don't clear). */
  clearColor?: { r: number; g: number; b: number; a: number } | null;
  /** Whether this pass writes to the backbuffer. */
  presentToScreen?: boolean;
  /** Execute callback — receives pass context. */
  execute: (ctx: PassContext) => void;
  /** Priority hint for ordering (lower = earlier when no dependency). */
  priority?: number;
  /** Tags for filtering (e.g., 'shadow', 'transparent', 'post'). */
  tags?: string[];
  /** Is this pass enabled? */
  enabled?: boolean;
}

export interface PassContext {
  passId: string;
  inputs: Map<string, RenderTarget>;
  outputs: Map<string, RenderTarget>;
  frameNumber: number;
  deltaTime: number;
  width: number;
  height: number;
}

export interface GraphStats {
  passCount: number;
  targetCount: number;
  executionOrderMs: number;
  passTimings: Map<string, number>;
}

// =============================================================================
// RENDER GRAPH
// =============================================================================

export class RenderGraph implements EngineSystem {
  readonly name = 'RenderGraph';
  readonly priority = 900; // Late — after physics + animation

  private passes: Map<string, RenderPassDescriptor> = new Map();
  private targets: Map<string, RenderTarget> = new Map();
  private executionOrder: string[] = [];
  private dirty = true;
  private frameNumber = 0;
  private width = 1920;
  private height = 1080;
  private stats: GraphStats = {
    passCount: 0,
    targetCount: 0,
    executionOrderMs: 0,
    passTimings: new Map(),
  };

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setResolution(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  // ---------------------------------------------------------------------------
  // Target Management
  // ---------------------------------------------------------------------------

  addTarget(target: RenderTarget): this {
    this.targets.set(target.id, target);
    this.dirty = true;
    return this;
  }

  removeTarget(id: string): boolean {
    this.dirty = true;
    return this.targets.delete(id);
  }

  getTarget(id: string): RenderTarget | undefined {
    return this.targets.get(id);
  }

  // ---------------------------------------------------------------------------
  // Pass Management
  // ---------------------------------------------------------------------------

  addPass(pass: RenderPassDescriptor): this {
    this.passes.set(pass.id, { enabled: true, tags: [], priority: 500, ...pass });
    this.dirty = true;
    return this;
  }

  removePass(id: string): boolean {
    this.dirty = true;
    return this.passes.delete(id);
  }

  enablePass(id: string, enabled: boolean): void {
    const pass = this.passes.get(id);
    if (pass) pass.enabled = enabled;
  }

  getPass(id: string): RenderPassDescriptor | undefined {
    return this.passes.get(id);
  }

  getPassesByTag(tag: string): RenderPassDescriptor[] {
    return Array.from(this.passes.values()).filter((p) => p.tags?.includes(tag));
  }

  // ---------------------------------------------------------------------------
  // Topological Sort
  // ---------------------------------------------------------------------------

  private compile(): void {
    if (!this.dirty) return;
    const start = performance.now();

    // Build dependency graph: pass → set of passes that must run before it
    const enabledPasses = Array.from(this.passes.values()).filter((p) => p.enabled !== false);
    const adj = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    // Map: targetId → pass that produces it
    const producerOf = new Map<string, string>();
    for (const pass of enabledPasses) {
      adj.set(pass.id, new Set());
      inDegree.set(pass.id, 0);
      for (const out of pass.outputs) {
        producerOf.set(out, pass.id);
      }
    }

    // Add edges: if pass X reads from target T, and pass Y produces T, then Y → X
    for (const pass of enabledPasses) {
      for (const inp of pass.inputs) {
        const producer = producerOf.get(inp);
        if (producer && producer !== pass.id) {
          if (!adj.get(producer)!.has(pass.id)) {
            adj.get(producer)!.add(pass.id);
            inDegree.set(pass.id, (inDegree.get(pass.id) ?? 0) + 1);
          }
        }
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }
    // Sort zero-degree nodes by priority
    queue.sort(
      (a, b) => (this.passes.get(a)!.priority ?? 500) - (this.passes.get(b)!.priority ?? 500)
    );

    this.executionOrder = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      this.executionOrder.push(current);

      for (const neighbor of adj.get(current) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) {
          // Insert sorted by priority
          const pri = this.passes.get(neighbor)!.priority ?? 500;
          let insertIdx = queue.length;
          for (let i = 0; i < queue.length; i++) {
            if ((this.passes.get(queue[i])!.priority ?? 500) > pri) {
              insertIdx = i;
              break;
            }
          }
          queue.splice(insertIdx, 0, neighbor);
        }
      }
    }

    // Detect cycles
    if (this.executionOrder.length !== enabledPasses.length) {
      console.warn(
        `[RenderGraph] Cycle detected! ${enabledPasses.length - this.executionOrder.length} passes skipped.`
      );
    }

    this.stats.executionOrderMs = performance.now() - start;
    this.stats.passCount = this.executionOrder.length;
    this.stats.targetCount = this.targets.size;
    this.dirty = false;
  }

  // ---------------------------------------------------------------------------
  // EngineSystem — lateUpdate (runs after animation, before present)
  // ---------------------------------------------------------------------------

  lateUpdate(dt: number): void {
    this.compile();
    this.frameNumber++;

    for (const passId of this.executionOrder) {
      const pass = this.passes.get(passId)!;
      const passStart = performance.now();

      const inputTargets = new Map<string, RenderTarget>();
      for (const inp of pass.inputs) {
        const target = this.targets.get(inp);
        if (target) inputTargets.set(inp, target);
      }

      const outputTargets = new Map<string, RenderTarget>();
      for (const out of pass.outputs) {
        const target = this.targets.get(out);
        if (target) outputTargets.set(out, target);
      }

      const ctx: PassContext = {
        passId,
        inputs: inputTargets,
        outputs: outputTargets,
        frameNumber: this.frameNumber,
        deltaTime: dt,
        width: this.width,
        height: this.height,
      };

      pass.execute(ctx);

      this.stats.passTimings.set(passId, performance.now() - passStart);
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getExecutionOrder(): string[] {
    this.compile();
    return [...this.executionOrder];
  }

  getStats(): GraphStats {
    return { ...this.stats, passTimings: new Map(this.stats.passTimings) };
  }

  // ---------------------------------------------------------------------------
  // Preset Pipeline
  // ---------------------------------------------------------------------------

  /**
   * Set up a standard forward+ rendering pipeline:
   * shadow → depth-prepass → main-color → post-process → present
   */
  setupForwardPipeline(): this {
    this.addTarget({ id: 'shadow-map', width: 2048, height: 2048, format: 'depth32float' });
    this.addTarget({
      id: 'depth-buffer',
      width: this.width,
      height: this.height,
      format: 'depth24plus',
    });
    this.addTarget({
      id: 'color-buffer',
      width: this.width,
      height: this.height,
      format: 'rgba16float',
    });
    this.addTarget({
      id: 'post-buffer',
      width: this.width,
      height: this.height,
      format: 'rgba8unorm',
    });

    this.addPass({
      id: 'shadow-pass',
      inputs: [],
      outputs: ['shadow-map'],
      priority: 100,
      tags: ['shadow'],
      execute: (_ctx) => {
        /* Shadow rendering — bind shadow FBO, draw shadow casters */
      },
    });

    this.addPass({
      id: 'depth-prepass',
      inputs: [],
      outputs: ['depth-buffer'],
      priority: 200,
      tags: ['depth'],
      execute: (_ctx) => {
        /* Depth-only rendering for early-Z and occlusion */
      },
    });

    this.addPass({
      id: 'main-color',
      inputs: ['shadow-map', 'depth-buffer'],
      outputs: ['color-buffer'],
      priority: 300,
      tags: ['color'],
      clearColor: { r: 0.05, g: 0.05, b: 0.1, a: 1 },
      execute: (_ctx) => {
        /* Main forward pass — PBR lighting, sample shadow map */
      },
    });

    this.addPass({
      id: 'post-process',
      inputs: ['color-buffer'],
      outputs: ['post-buffer'],
      priority: 800,
      tags: ['post'],
      execute: (_ctx) => {
        /* Bloom, tone mapping, FXAA */
      },
    });

    this.addPass({
      id: 'present',
      inputs: ['post-buffer'],
      outputs: [],
      priority: 999,
      tags: ['present'],
      presentToScreen: true,
      execute: (_ctx) => {
        /* Blit to backbuffer / swap chain */
      },
    });

    return this;
  }

  destroy(): void {
    this.passes.clear();
    this.targets.clear();
    this.executionOrder = [];
  }
}
