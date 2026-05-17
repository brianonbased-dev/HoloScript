/**
 * SimulationTraitHandlers — Trait handlers for PDE-based simulation domains.
 *
 * Backs @thermal_simulation, @structural_fem, @hydraulic_pipe,
 * @saturation_*, @phase_transition, and @scalar_field_overlay traits.
 *
 * Pattern follows FluidTrait.ts: the trait handler IS the runtime.
 * Solvers are instantiated directly in onAttach via SimulationSolverFactory.
 * Engine registers factories on startup; core calls create() without importing engine.
 */

import type { TraitHandler } from './TraitTypes';
import { SimulationSolverFactory, type SimulationSolver } from './SimulationSolverFactory';

// ── Thermal Simulation ───────────────────────────────────────────────────────

interface ThermalSimConfig {
  grid_resolution?: [number, number, number];
  domain_size?: [number, number, number];
  time_step?: number;
  materials?: Record<string, Record<string, number>>;
  default_material?: string;
  initial_temperature?: number;
  boundary_conditions?: Record<string, unknown>;
  sources?: Record<string, unknown>;
}

interface ThermalState {
  solver: SimulationSolver | null;
  isSimulating: boolean;
}

export const thermalSimulationHandler: TraitHandler<ThermalSimConfig> = {
  name: 'thermal_simulation',
  defaultConfig: {
    grid_resolution: [64, 16, 64],
    time_step: 0.5,
    default_material: 'air',
    initial_temperature: 20,
  },
  onAttach(node, config, context) {
    // Instantiate solver via factory (engine registers on startup)
    const solver = SimulationSolverFactory.create(
      'thermal',
      (config ?? {}) as Record<string, unknown>
    );
    const state: ThermalState = {
      solver,
      isSimulating: solver !== null,
    };
    (node as unknown as Record<string, unknown>).__thermalState = state;
    context.emit?.('thermal_simulation_create', { node, config, solver });
  },
  onUpdate(node, _config, _context, delta) {
    const state = (node as unknown as Record<string, unknown>).__thermalState as
      | ThermalState
      | undefined;
    if (!state?.isSimulating || !state.solver?.step) return;
    state.solver.step(delta / 1000);
  },
  onDetach(node) {
    const state = (node as unknown as Record<string, unknown>).__thermalState as
      | ThermalState
      | undefined;
    if (state?.solver) {
      state.solver.dispose();
    }
    delete (node as unknown as Record<string, unknown>).__thermalState;
  },
};

// ── Structural FEM ───────────────────────────────────────────────────────────

interface StructuralFEMConfig {
  material?: string | Record<string, number>;
  analysis?: string;
  [key: string]: unknown;
}

interface StructuralState {
  solver: SimulationSolver | null;
  isSolved: boolean;
}

export const structuralFEMHandler: TraitHandler<StructuralFEMConfig> = {
  name: 'structural_fem',
  defaultConfig: {
    analysis: 'static_linear',
  },
  onAttach(node, config, context) {
    const solver = SimulationSolverFactory.create(
      'structural',
      (config ?? {}) as Record<string, unknown>
    );
    const state: StructuralState = { solver, isSolved: false };
    (node as unknown as Record<string, unknown>).__structuralState = state;

    // Static analysis: solve immediately
    if (solver?.solve) {
      solver.solve();
      state.isSolved = true;
    }

    context.emit?.('structural_fem_create', { node, config, solver });
  },
  onUpdate(node, _config, _context, _delta) {
    const state = (node as unknown as Record<string, unknown>).__structuralState as
      | StructuralState
      | undefined;
    if (!state?.solver?.solve || state.isSolved) return;
    state.solver.solve();
    state.isSolved = true;
  },
  onDetach(node) {
    const state = (node as unknown as Record<string, unknown>).__structuralState as
      | StructuralState
      | undefined;
    if (state?.solver) {
      state.solver.dispose();
    }
    delete (node as unknown as Record<string, unknown>).__structuralState;
  },
};

// ── Hydraulic Pipe ───────────────────────────────────────────────────────────

interface HydraulicPipeConfig {
  solver?: string;
  max_iterations?: number;
  convergence?: number;
  [key: string]: unknown;
}

interface HydraulicState {
  solver: SimulationSolver | null;
  isSolved: boolean;
}

export const hydraulicPipeHandler: TraitHandler<HydraulicPipeConfig> = {
  name: 'hydraulic_pipe',
  defaultConfig: {
    solver: 'hardy_cross',
    max_iterations: 100,
    convergence: 0.001,
  },
  onAttach(node, config, context) {
    const solver = SimulationSolverFactory.create(
      'hydraulic',
      (config ?? {}) as Record<string, unknown>
    );
    const state: HydraulicState = { solver, isSolved: false };
    (node as unknown as Record<string, unknown>).__hydraulicState = state;

    // Steady-state: solve immediately
    if (solver?.solve) {
      solver.solve();
      state.isSolved = true;
    }

    context.emit?.('hydraulic_pipe_create', { node, config, solver });
  },
  onUpdate(node, _config, _context, _delta) {
    const state = (node as unknown as Record<string, unknown>).__hydraulicState as
      | HydraulicState
      | undefined;
    if (!state?.solver?.solve || state.isSolved) return;
    state.solver.solve();
    state.isSolved = true;
  },
  onDetach(node) {
    const state = (node as unknown as Record<string, unknown>).__hydraulicState as
      | HydraulicState
      | undefined;
    if (state?.solver) {
      state.solver.dispose();
    }
    delete (node as unknown as Record<string, unknown>).__hydraulicState;
  },
};

// ── TOMBSTONE: Saturation / Phase Transition / Threshold handlers ────────────
//
// 10 handlers (6 saturation_* + phase_transition + 3 threshold_*) were retired
// 2026-05-17 via founder ruling on board task task_1778979065243_dksg. They
// were Pattern E violations per /stub-audit 2026-05-16 — every handler emitted
// an event (saturation_create, phase_transition_create, threshold_configure)
// with ZERO listeners anywhere in the codebase. SaturationManager
// (packages/engine/src/simulation/SaturationManager.ts) existed as the intended
// consumer but was never subscribed.
//
// SECOND-PASS NOTE: original deletion landed at commit d1046b2f6. Peer commit
// a9daad4d3 (Codex type-harden pass) silently re-introduced the handlers as a
// side effect of working off a stale base — the commit message lists 9 other
// trait files for type-hardening but not SimulationTraitHandlers. This is the
// second pass re-applying the founder-authorized deletion while preserving
// peer's type-hardening on the 3 KEPT handlers (thermal/structural/hydraulic
// gained `(config ?? {}) as Record<string, unknown>` casts on the
// SimulationSolverFactory.create() call sites).
//
// DESIGN INTENT PRESERVED at docs/simulation/SATURATION_MONITORING_DESIGN.md
// with full default tables (warning/critical/recovery per domain), 4 concrete
// rebuild triggers (industrial-twin dashboards, real-time alerting, CAEL
// training-pair generation, multi-physics coupling chain), and the rebuild
// path discipline per F.058 + amendment.
//
// SaturationManager.ts is shipped and unaffected. The trait-name strings
// (saturation_thermal, phase_transition, threshold_warning, etc.) are removed
// from constants/simulation-domains.ts in the same commit.
//
// References: ca818d90f (design doc commit), d1046b2f6 (first deletion pass),
// a9daad4d3 (peer auto-tool collision that necessitated this second pass),
// 8d345bccb (Pattern Z fix — preserves thermal/structural/hydraulic),
// SATURATION_MONITORING_DESIGN.md (rebuild guidance).
//
// ─────────────────────────────────────────────────────────────────────────────

// ── Scalar Field Overlay ─────────────────────────────────────────────────────

interface ScalarFieldOverlayConfig {
  source?: string;
  colormap?: string;
  range?: [number, number];
  opacity?: number;
  visible?: boolean;
  label?: string;
}

export const scalarFieldOverlayHandler: TraitHandler<ScalarFieldOverlayConfig> = {
  name: 'scalar_field_overlay',
  defaultConfig: {
    colormap: 'turbo',
    range: [0, 1],
    opacity: 0.7,
    visible: true,
  },
  onAttach(node, config, context) {
    (node as unknown as Record<string, unknown>).__scalarFieldOverlay = config;
    context.emit?.('scalar_field_overlay_create', { node, config });
  },
  onUpdate(node, config, _context, _delta) {
    // The overlay renderer reads __scalarFieldOverlay config each frame
    (node as unknown as Record<string, unknown>).__scalarFieldOverlay = config;
  },
};

