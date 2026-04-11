/**
 * SimulationSolverFactory — Runtime solver registry.
 *
 * Avoids circular dependency between core (trait handlers) and engine (solvers).
 * Engine registers solver constructors on app startup; core trait handlers
 * call create() to instantiate them without importing engine directly.
 *
 * Pattern matches how FluidTrait.ts instantiates MLSMPMFluid — the trait
 * handler IS the runtime, and the factory is just the bridge.
 */

// ── Solver interface (minimal contract) ──────────────────────────────────────

export interface SimulationSolver {
  step?(dt: number): void;
  solve?(): unknown;
  dispose(): void;
  getStats?(): Record<string, unknown>;
}

export type SolverFactory = (config: Record<string, unknown>) => SimulationSolver;

// ── Factory registry ─────────────────────────────────────────────────────────

const factories = new Map<string, SolverFactory>();

export const SimulationSolverFactory = {
  /**
   * Register a solver constructor for a simulation type.
   * Called by engine on app startup.
   *
   * @example
   * SimulationSolverFactory.register('thermal', (cfg) => new ThermalSolver(cfg));
   */
  register(type: string, factory: SolverFactory): void {
    factories.set(type, factory);
  },

  /**
   * Create a solver instance. Returns null if no factory registered for type.
   * Called by trait handlers in onAttach.
   */
  create(type: string, config: Record<string, unknown>): SimulationSolver | null {
    const factory = factories.get(type);
    if (!factory) return null;
    return factory(config);
  },

  /** Check if a solver type has a registered factory. */
  has(type: string): boolean {
    return factories.has(type);
  },

  /** List all registered solver types. */
  types(): string[] {
    return [...factories.keys()];
  },

  /** Clear all registrations (for testing). */
  clear(): void {
    factories.clear();
  },
};
