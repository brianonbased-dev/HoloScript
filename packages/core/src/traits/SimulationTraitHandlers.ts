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
    (node as Record<string, unknown>).__thermalState = state;
    context.emit?.('thermal_simulation_create', { node, config, solver });
  },
  onUpdate(node, _config, _context, delta) {
    const state = (node as Record<string, unknown>).__thermalState as
      | ThermalState
      | undefined;
    if (!state?.isSimulating || !state.solver?.step) return;
    state.solver.step(delta / 1000);
  },
  onDetach(node) {
    const state = (node as Record<string, unknown>).__thermalState as
      | ThermalState
      | undefined;
    if (state?.solver) {
      state.solver.dispose();
    }
    delete (node as Record<string, unknown>).__thermalState;
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
    (node as Record<string, unknown>).__structuralState = state;

    // Static analysis: solve immediately
    if (solver?.solve) {
      solver.solve();
      state.isSolved = true;
    }

    context.emit?.('structural_fem_create', { node, config, solver });
  },
  onUpdate(node, _config, _context, _delta) {
    const state = (node as Record<string, unknown>).__structuralState as
      | StructuralState
      | undefined;
    if (!state?.solver?.solve || state.isSolved) return;
    state.solver.solve();
    state.isSolved = true;
  },
  onDetach(node) {
    const state = (node as Record<string, unknown>).__structuralState as
      | StructuralState
      | undefined;
    if (state?.solver) {
      state.solver.dispose();
    }
    delete (node as Record<string, unknown>).__structuralState;
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
    (node as Record<string, unknown>).__hydraulicState = state;

    // Steady-state: solve immediately
    if (solver?.solve) {
      solver.solve();
      state.isSolved = true;
    }

    context.emit?.('hydraulic_pipe_create', { node, config, solver });
  },
  onUpdate(node, _config, _context, _delta) {
    const state = (node as Record<string, unknown>).__hydraulicState as
      | HydraulicState
      | undefined;
    if (!state?.solver?.solve || state.isSolved) return;
    state.solver.solve();
    state.isSolved = true;
  },
  onDetach(node) {
    const state = (node as Record<string, unknown>).__hydraulicState as
      | HydraulicState
      | undefined;
    if (state?.solver) {
      state.solver.dispose();
    }
    delete (node as Record<string, unknown>).__hydraulicState;
  },
};

// ── Saturation Threshold ─────────────────────────────────────────────────────

interface SaturationConfig {
  type?: string;
  warning?: number;
  critical?: number;
  recovery?: number;
}

export const saturationThermalHandler: TraitHandler<SaturationConfig> = {
  name: 'saturation_thermal',
  defaultConfig: { type: 'thermal', warning: 0.8, critical: 0.95, recovery: 0.7 },
  onAttach(node, config, context) {
    (node as Record<string, unknown>).__saturationConfig = config;
    context.emit?.('saturation_create', { node, config, type: 'thermal' });
  },
};

export const saturationMoistureHandler: TraitHandler<SaturationConfig> = {
  name: 'saturation_moisture',
  defaultConfig: { type: 'moisture', warning: 0.7, critical: 0.9, recovery: 0.5 },
  onAttach(node, config, context) {
    (node as Record<string, unknown>).__saturationConfig = config;
    context.emit?.('saturation_create', { node, config, type: 'moisture' });
  },
};

export const saturationPressureHandler: TraitHandler<SaturationConfig> = {
  name: 'saturation_pressure',
  defaultConfig: { type: 'pressure', warning: 0.85, critical: 0.95, recovery: 0.75 },
  onAttach(node, config, context) {
    (node as Record<string, unknown>).__saturationConfig = config;
    context.emit?.('saturation_create', { node, config, type: 'pressure' });
  },
};

export const saturationElectricalHandler: TraitHandler<SaturationConfig> = {
  name: 'saturation_electrical',
  defaultConfig: { type: 'electrical', warning: 0.8, critical: 0.95, recovery: 0.7 },
  onAttach(node, config, context) {
    (node as Record<string, unknown>).__saturationConfig = config;
    context.emit?.('saturation_create', { node, config, type: 'electrical' });
  },
};

export const saturationChemicalHandler: TraitHandler<SaturationConfig> = {
  name: 'saturation_chemical',
  defaultConfig: { type: 'chemical', warning: 0.75, critical: 0.9, recovery: 0.6 },
  onAttach(node, config, context) {
    (node as Record<string, unknown>).__saturationConfig = config;
    context.emit?.('saturation_create', { node, config, type: 'chemical' });
  },
};

export const saturationStructuralHandler: TraitHandler<SaturationConfig> = {
  name: 'saturation_structural',
  defaultConfig: { type: 'structural', warning: 0.7, critical: 0.9, recovery: 0.5 },
  onAttach(node, config, context) {
    (node as Record<string, unknown>).__saturationConfig = config;
    context.emit?.('saturation_create', { node, config, type: 'structural' });
  },
};

// ── Phase Transition ─────────────────────────────────────────────────────────

interface PhaseTransitionConfig {
  transition_point?: number;
  latent_heat?: number;
  from_phase?: string;
  to_phase?: string;
}

export const phaseTransitionHandler: TraitHandler<PhaseTransitionConfig> = {
  name: 'phase_transition',
  defaultConfig: {
    transition_point: 373.15, // water boiling point (K)
    latent_heat: 2260000, // J/kg
    from_phase: 'liquid',
    to_phase: 'gas',
  },
  onAttach(node, config, context) {
    (node as Record<string, unknown>).__phaseTransitionConfig = config;
    context.emit?.('phase_transition_create', { node, config });
  },
};

// ── Threshold Traits (metadata markers) ──────────────────────────────────────

export const thresholdWarningHandler: TraitHandler<{ level?: number }> = {
  name: 'threshold_warning',
  defaultConfig: { level: 0.8 },
  onAttach(node, config, context) {
    (node as Record<string, unknown>).__thresholdWarning = config;
    context.emit?.('threshold_configure', { node, type: 'warning', ...config });
  },
};

export const thresholdCriticalHandler: TraitHandler<{ level?: number }> = {
  name: 'threshold_critical',
  defaultConfig: { level: 0.95 },
  onAttach(node, config, context) {
    (node as Record<string, unknown>).__thresholdCritical = config;
    context.emit?.('threshold_configure', { node, type: 'critical', ...config });
  },
};

export const thresholdRecoveryHandler: TraitHandler<{ level?: number }> = {
  name: 'threshold_recovery',
  defaultConfig: { level: 0.7 },
  onAttach(node, config, context) {
    (node as Record<string, unknown>).__thresholdRecovery = config;
    context.emit?.('threshold_configure', { node, type: 'recovery', ...config });
  },
};

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
    (node as Record<string, unknown>).__scalarFieldOverlay = config;
    context.emit?.('scalar_field_overlay_create', { node, config });
  },
  onUpdate(node, config, _context, _delta) {
    // The overlay renderer reads __scalarFieldOverlay config each frame
    (node as Record<string, unknown>).__scalarFieldOverlay = config;
  },
};
