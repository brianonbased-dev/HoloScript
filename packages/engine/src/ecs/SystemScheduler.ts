/**
 * SystemScheduler.ts
 *
 * System execution scheduler: phase ordering, dependency resolution,
 * parallel groups, enable/disable, and performance tracking.
 *
 * @module ecs
 */

// =============================================================================
// TYPES
// =============================================================================

export type SystemPhase = 'preUpdate' | 'update' | 'postUpdate' | 'fixedUpdate' | 'render';

export interface SystemDef {
  name: string;
  phase: SystemPhase;
  execute: (dt: number) => void;
  enabled: boolean;
  priority: number; // Lower = runs first
  dependencies: string[]; // System names that must run before this
  group: string; // Parallel execution group
  lastExecutionTime: number;
  executionCount: number;
}

export interface PhaseStats {
  phase: SystemPhase;
  systemCount: number;
  totalTime: number;
  systems: Array<{ name: string; time: number }>;
}

// =============================================================================
// SYSTEM SCHEDULER
// =============================================================================

const PHASE_ORDER: SystemPhase[] = ['preUpdate', 'fixedUpdate', 'update', 'postUpdate', 'render'];

export class SystemScheduler {
  private systems: Map<string, SystemDef> = new Map();
  private executionOrder: string[] = [];
  private dirty = true;
  private fixedTimeStep = 1 / 60;
  private fixedAccumulator = 0;
  private phaseStats: Map<SystemPhase, PhaseStats> = new Map();

  // ---------------------------------------------------------------------------
  // System Registration
  // ---------------------------------------------------------------------------

  register(
    name: string,
    execute: (dt: number) => void,
    phase: SystemPhase = 'update',
    priority = 0,
    dependencies: string[] = [],
    group = 'default'
  ): void {
    this.systems.set(name, {
      name,
      phase,
      execute,
      enabled: true,
      priority,
      dependencies,
      group,
      lastExecutionTime: 0,
      executionCount: 0,
    });
    this.dirty = true;
  }

  unregister(name: string): boolean {
    const result = this.systems.delete(name);
    if (result) this.dirty = true;
    return result;
  }

  enable(name: string): void {
    const sys = this.systems.get(name);
    if (sys) sys.enabled = true;
  }

  disable(name: string): void {
    const sys = this.systems.get(name);
    if (sys) sys.enabled = false;
  }

  isEnabled(name: string): boolean {
    return this.systems.get(name)?.enabled ?? false;
  }

  // ---------------------------------------------------------------------------
  // Execution Order Resolution
  // ---------------------------------------------------------------------------

  private resolveExecutionOrder(): void {
    if (!this.dirty) return;

    const sorted: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (name: string) => {
      if (visited.has(name)) return;
      if (visiting.has(name)) return; // Cycle detected, skip
      visiting.add(name);

      const sys = this.systems.get(name);
      if (sys) {
        for (const dep of sys.dependencies) {
          visit(dep);
        }
      }
      visiting.delete(name);
      visited.add(name);
      sorted.push(name);
    };

    // Sort by phase, then priority, then topological order
    const byPhase = new Map<SystemPhase, string[]>();
    for (const [name, sys] of this.systems) {
      if (!byPhase.has(sys.phase)) byPhase.set(sys.phase, []);
      byPhase.get(sys.phase)!.push(name);
    }

    for (const phase of PHASE_ORDER) {
      const phaseSystems = byPhase.get(phase) ?? [];
      phaseSystems.sort((a, b) => {
        const sa = this.systems.get(a)!,
          sb = this.systems.get(b)!;
        return sa.priority - sb.priority;
      });
      for (const name of phaseSystems) visit(name);
    }

    this.executionOrder = sorted;
    this.dirty = false;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    this.resolveExecutionOrder();
    this.phaseStats.clear();

    // Handle fixed timestep accumulation
    this.fixedAccumulator += dt;

    for (const name of this.executionOrder) {
      const sys = this.systems.get(name);
      if (!sys || !sys.enabled) continue;

      if (sys.phase === 'fixedUpdate') {
        while (this.fixedAccumulator >= this.fixedTimeStep) {
          const start = performance.now();
          sys.execute(this.fixedTimeStep);
          sys.lastExecutionTime = performance.now() - start;
          sys.executionCount++;
          this.recordPhaseTime(sys.phase, sys.name, sys.lastExecutionTime);
          this.fixedAccumulator -= this.fixedTimeStep;
        }
      } else {
        const start = performance.now();
        sys.execute(dt);
        sys.lastExecutionTime = performance.now() - start;
        sys.executionCount++;
        this.recordPhaseTime(sys.phase, sys.name, sys.lastExecutionTime);
      }
    }
  }

  private recordPhaseTime(phase: SystemPhase, name: string, time: number): void {
    if (!this.phaseStats.has(phase)) {
      this.phaseStats.set(phase, { phase, systemCount: 0, totalTime: 0, systems: [] });
    }
    const stats = this.phaseStats.get(phase)!;
    stats.systemCount++;
    stats.totalTime += time;
    stats.systems.push({ name, time });
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getSystem(name: string): SystemDef | undefined {
    return this.systems.get(name);
  }
  getSystemCount(): number {
    return this.systems.size;
  }
  get systemCount(): number {
    return this.systems.size;
  }
  getExecutionOrder(): string[] {
    this.resolveExecutionOrder();
    return [...this.executionOrder];
  }
  getPhaseStats(): Map<SystemPhase, PhaseStats> {
    return new Map(this.phaseStats);
  }

  getSystemsByPhase(phase: SystemPhase): SystemDef[] {
    return [...this.systems.values()].filter((s) => s.phase === phase);
  }

  setFixedTimeStep(dt: number): void {
    this.fixedTimeStep = dt;
  }
  getFixedTimeStep(): number {
    return this.fixedTimeStep;
  }
}

