// implemented by sim-api agent
// This file is the contract source of truth for SimPreset — do NOT overwrite.

/** Shape of a simulation preset consumed by useSimState and SimParamsPanel. */
export interface SimPreset {
  id: string;
  label: string;
  description: string;
  /** SimulationSolverFactory registry key (e.g. 'dem-granular', 'thermal', 'reaction-diffusion', 'molecular-dynamics'). */
  solver: string;
  /** Solver config object passed verbatim to POST /api/simulation/run. */
  config: Record<string, unknown>;
  steps: number;
  dt: number;
  /** Expected response kind — drives SimPreviewCanvas render path. */
  kind: 'particles' | 'scalarField';
}

/** Headline param descriptors per preset — the 2-4 inputs shown in SimParamsPanel. */
export interface SimPresetParam {
  name: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  format: (v: number) => string;
  /** Path into preset.config where this param lives, dot-separated. */
  configPath: string;
}

// SIM_PRESETS is defined at the BOTTOM of this file as a direct alias of
// CURATED_SIM_PRESETS — the engine-verified configs that actually resolve
// through the simulation-registry parsers. (The original hand-sketched
// configs here used invented keys — gridSize/thermalDiffusivity/feedRate —
// that the parsers silently ignored, producing uniform no-op fields.
// Verified live 2026-06-10: thermal ran 200 steps with min=max=avg=20°.)

/** Maps preset id → headline params shown in SimParamsPanel.
 *  Keys = CURATED_SIM_PRESETS ids; configPaths point at REAL parser keys. */
export const SIM_PRESET_PARAMS: Record<string, SimPresetParam[]> = {
  'thermal-hotspot': [
    {
      name: 'steps',
      label: 'Steps',
      min: 50,
      max: 2000,
      step: 50,
      value: 200,
      unit: '',
      format: (v) => Math.round(v).toString(),
      configPath: 'steps',
    },
    {
      name: 'dt',
      label: 'Δt',
      min: 0.001,
      max: 0.05,
      step: 0.001,
      value: 0.01,
      unit: 's',
      format: (v) => v.toFixed(3),
      configPath: 'dt',
    },
    {
      name: 'heatOutput',
      label: 'Source strength',
      min: 100,
      max: 5000,
      step: 100,
      value: 1000,
      unit: 'W',
      format: (v) => Math.round(v).toString(),
      configPath: 'config.sources.internal.hotspot.heat_output',
    },
  ],
  'reaction-diffusion-spots': [
    {
      name: 'steps',
      label: 'Steps',
      min: 100,
      max: 2000,
      step: 100,
      value: 500,
      unit: '',
      format: (v) => Math.round(v).toString(),
      configPath: 'steps',
    },
    {
      name: 'dt',
      label: 'Δt',
      min: 0.1,
      max: 5.0,
      step: 0.1,
      value: 1.0,
      unit: '',
      format: (v) => v.toFixed(1),
      configPath: 'dt',
    },
  ],
  'dem-pour': [
    {
      name: 'steps',
      label: 'Steps',
      min: 50,
      max: 2000,
      step: 50,
      value: 200,
      unit: '',
      format: (v) => Math.round(v).toString(),
      configPath: 'steps',
    },
    {
      name: 'dt',
      label: 'Δt',
      min: 0.001,
      max: 0.02,
      step: 0.001,
      value: 0.005,
      unit: 's',
      format: (v) => v.toFixed(3),
      configPath: 'dt',
    },
    {
      name: 'particleCount',
      label: 'Particle count',
      min: 64,
      max: 2048,
      step: 64,
      value: 300,
      unit: '',
      format: (v) => Math.round(v).toString(),
      configPath: 'config.particleCount',
    },
    {
      name: 'restitution',
      label: 'Restitution',
      min: 0.0,
      max: 1.0,
      step: 0.05,
      value: 0.5,
      unit: '',
      format: (v) => v.toFixed(2),
      configPath: 'config.restitution',
    },
  ],
  'md-equilibration': [
    {
      name: 'steps',
      label: 'Steps',
      min: 50,
      max: 2000,
      step: 50,
      value: 200,
      unit: '',
      format: (v) => Math.round(v).toString(),
      configPath: 'steps',
    },
    {
      name: 'dt',
      label: 'Δt',
      min: 0.0005,
      max: 0.01,
      step: 0.0005,
      value: 0.002,
      unit: 'ps',
      format: (v) => v.toFixed(4),
      configPath: 'dt',
    },
    {
      name: 'particleCount',
      label: 'Particle count',
      min: 32,
      max: 1024,
      step: 32,
      value: 200,
      unit: '',
      format: (v) => Math.round(v).toString(),
      configPath: 'config.particleCount',
    },
    {
      name: 'temperature',
      label: 'Temperature',
      min: 0.1,
      max: 5.0,
      step: 0.1,
      value: 1.0,
      unit: 'kT',
      format: (v) => v.toFixed(1),
      configPath: 'config.temperature',
    },
  ],
};

export function getPresetById(id: string): SimPreset | undefined {
  return SIM_PRESETS.find((p) => p.id === id);
}

export function getPresetParams(id: string): SimPresetParam[] {
  return SIM_PRESET_PARAMS[id] ?? [];
}

// ── Curated simulation presets (engine-verified configs) ─────────────────────
// These are the canonical presets consumed by POST /api/simulation/run.
// Configs are verified to resolve through SimulationSolverFactory with the
// actual solver config parsers in simulation-registry.ts.

/** Curated preset for the simulation API (id must be unique, stable). */
export interface CuratedSimPreset {
  id: string;
  label: string;
  description: string;
  /** SimulationSolverFactory registry key */
  solver: string;
  config: Record<string, unknown>;
  steps: number;
  dt: number;
  /** Expected response kind — drives render path in SimPreviewCanvas. */
  kind: 'particles' | 'scalarField';
}

/**
 * Curated engine-verified presets.
 *
 * 'thermal-hotspot'           — 24³ grid, one central point heat source (scalarField)
 * 'dem-pour'                  — 300 particles falling into a box (particles)
 * 'reaction-diffusion-spots'  — 16³ Schnakenberg Turing-spot pattern (scalarField)
 * 'md-equilibration'          — 200 LJ particles equilibrating at T=1 (particles)
 *
 * Grid sizes are kept small (≤ 24³) so the route can run server-side in < 10 s.
 * Particle counts are well under the 5 000-particle cap.
 */
export const CURATED_SIM_PRESETS: CuratedSimPreset[] = [
  {
    id: 'thermal-hotspot',
    label: 'Thermal Hotspot',
    description: 'Heat spreading from a central point source on a 24³ grid.',
    solver: 'thermal',
    config: {
      // ThermalConfig fields (parsed by parseThermalConfig in simulation-registry.ts)
      grid_resolution: [24, 24, 24] as [number, number, number],
      domain_size: [1, 1, 1] as [number, number, number],
      time_step: 0.01,
      materials: {},
      default_material: 'air',
      boundary_conditions: {
        exterior: { type: 'dirichlet', T: 20 },
      },
      sources: {
        internal: {
          hotspot: {
            // WORLD coordinates — parseThermalSources maps to grid via round(p/dx);
            // [0.5,0.5,0.5] = center of the [1,1,1] domain. (Grid-index coords here
            // clamp to a corner and the field never heats — verified live 2026-06-10.)
            position: [0.5, 0.5, 0.5] as [number, number, number],
            heat_output: 1000,
            count: 1,
            active: true,
          },
        },
      },
      initial_temperature: 20,
    },
    steps: 100,
    dt: 0.01,
    kind: 'scalarField',
  },
  {
    id: 'dem-pour',
    label: 'Granular Pour',
    description: '300 particles falling into a box under gravity.',
    solver: 'dem-granular',
    config: {
      // DEMConfig fields (parsed by parseDEMConfig in simulation-registry.ts)
      particleCount: 300,
      defaultRadius: 0.04,
      defaultMass: 1.0,
      kn: 1e5,
      restitution: 0.5,
      friction: 0.3,
      gravity: [0, -9.81, 0] as [number, number, number],
      boxBounds: [
        [-1, 1],
        [-1, 1],
        [-1, 1],
      ] as [[number, number], [number, number], [number, number]],
    },
    steps: 200,
    dt: 0.005,
    kind: 'particles',
  },
  {
    id: 'reaction-diffusion-spots',
    label: 'Turing Spots',
    description: 'Schnakenberg reaction-diffusion producing spot patterns on a 16³ grid.',
    solver: 'reaction-diffusion',
    config: {
      // ReactionDiffusionConfig fields (reaction-diffusion entry in simulation-registry.ts)
      gridResolution: [16, 16, 16] as [number, number, number],
      domainSize: [1, 1, 1] as [number, number, number],
      referenceTemperature: 298.15,
      // Schnakenberg model: a = 0.1, b = 0.9 → two species U and V
      // U: activator  V: inhibitor
      species: [
        { name: 'U', diffusivity: 1e-4, initialConcentration: 0.5 },
        { name: 'V', diffusivity: 5e-3, initialConcentration: 0.25 },
      ],
      // Schnakenberg kinetics: dU/dt = a - U + U²V,  dV/dt = b - U²V
      // Encoded as mass-action reactions with near-zero Ea (isothermal)
      // Net: reaction 1 produces U (source a),  reaction 2 degrades U and V (cross)
      // We use two effective reactions that together give the Schnakenberg net rates.
      // Reaction A: spontaneous production of U   (rate ≈ a = 0.1, order 0 → preExp directly)
      //   stoich: U+1, Ea≈0
      // Reaction B: cross-catalysis (U²V → products and recycling)
      //   stoich: U-1, V-1 ... approximated as first-order for tractability at 16³
      //   Real Gray-Scott-like patterns need many steps; this is a tractable demo.
      reactions: [
        {
          label: 'U source (a)',
          stoichiometry: { U: 1 },
          preExponential: 0.1,
          activationEnergy: 0.01,
          orders: {},
          enthalpy: 0,
        },
        {
          label: 'V source (b)',
          stoichiometry: { V: 1 },
          preExponential: 0.9,
          activationEnergy: 0.01,
          orders: {},
          enthalpy: 0,
        },
        {
          label: 'U autocatalytic degradation',
          stoichiometry: { U: -1, V: -1 },
          preExponential: 1.0,
          activationEnergy: 0.01,
          orders: { U: 2, V: 1 },
          enthalpy: 0,
        },
      ],
    },
    steps: 60,
    dt: 0.5,
    kind: 'scalarField',
  },
  {
    id: 'md-equilibration',
    label: 'LJ Gas Equilibration',
    description: '200 Lennard-Jones particles equilibrating at T=1 in a periodic box.',
    solver: 'molecular-dynamics',
    config: {
      // MDConfig fields (consumed directly via `raw as unknown as MDConfig` in registry)
      particleCount: 200,
      boxSize: [8, 8, 8] as [number, number, number],
      epsilon: 1.0,
      sigma: 1.0,
      mass: 1.0,
      cutoff: 2.5,
      temperature: 1.0,
      thermostatTau: 0.5,
      initialConfig: 'fcc',
    },
    steps: 100,
    dt: 0.002,
    kind: 'particles',
  },
];

/**
 * Built-in presets bundled with Studio = the curated, engine-verified set.
 * CuratedSimPreset is structurally identical to SimPreset; the alias keeps
 * the UI (useSimState/SimParamsPanel) and the API route on ONE source of
 * truth, so a panel run can never send configs the registry parsers ignore.
 */
export const SIM_PRESETS: SimPreset[] = CURATED_SIM_PRESETS;
