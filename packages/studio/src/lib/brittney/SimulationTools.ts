/**
 * SimulationTools — Brittney's simulation-specific function-calling tools.
 *
 * When a scientist says "simulate heat flow" or "is this safe?", Brittney
 * uses these tools to set up solvers, run simulations, interpret results,
 * and generate reports — all without the scientist writing code.
 */

// ── Tool Schemas ─────────────────────────────────────────────────────────────

export const SIMULATION_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'setup_simulation',
      description: 'Set up a simulation on the active scene object. Configures mesh, material, constraints, loads, and solver type. The scientist describes what they want; you translate to config.',
      parameters: {
        type: 'object',
        properties: {
          solver_type: {
            type: 'string',
            enum: ['thermal', 'structural', 'structural-tet10', 'hydraulic', 'acoustic', 'fdtd', 'navier-stokes', 'multiphase', 'molecular-dynamics'],
            description: 'Which physics solver to use',
          },
          config: {
            type: 'object',
            description: 'Solver-specific configuration. For structural: {material, constraints, loads, mesh}. For thermal: {grid_resolution, materials, sources}. For acoustic: {speed_of_sound, sources}. For CFD: {viscosity, boundary_conditions}.',
          },
          description: {
            type: 'string',
            description: 'Human-readable description of what this simulation does',
          },
        },
        required: ['solver_type', 'config'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_simulation',
      description: 'Execute the configured simulation and return results. Use after setup_simulation.',
      parameters: {
        type: 'object',
        properties: {
          steps: { type: 'number', description: 'Number of timesteps for transient solvers (default: 100)' },
          record: { type: 'boolean', description: 'Record snapshots for playback animation (default: true)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'query_results',
      description: 'Ask a question about the simulation results in plain English. Examples: "is this safe?", "what is the max stress?", "did it converge?", "give me a summary".',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'Natural language question about the results' },
        },
        required: ['question'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_report',
      description: 'Generate a complete simulation report with executive summary, metrics, findings, and recommendations. Returns Markdown.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Report title (default: "Simulation Report")' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_parameter_sweep',
      description: 'Run multiple simulations with varying parameters to find the optimal design. Specify which parameter to sweep and the range.',
      parameters: {
        type: 'object',
        properties: {
          parameter_path: { type: 'string', description: 'Dot-path to the parameter, e.g. "material.youngs_modulus"' },
          values: {
            type: 'array',
            items: { type: 'number' },
            description: 'Values to sweep through',
          },
          objective: { type: 'string', description: 'Which result to optimize, e.g. "maxVonMises", "minSafetyFactor"' },
        },
        required: ['parameter_path', 'values'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'import_data',
      description: 'Import scientific data from a file that the user dropped into the scene. Supports FITS (astronomy), STL/OBJ (CAD), CSV (tabular), VTK (simulation results).',
      parameters: {
        type: 'object',
        properties: {
          file_type: {
            type: 'string',
            enum: ['fits', 'stl', 'obj', 'csv', 'vtk'],
            description: 'File format to parse',
          },
          purpose: {
            type: 'string',
            enum: ['visualize', 'mesh_for_simulation', 'compare_with_simulation', 'load_initial_conditions'],
            description: 'What to do with the imported data',
          },
        },
        required: ['file_type', 'purpose'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_visualization',
      description: 'Configure how simulation results are displayed. Change colormap, opacity, displacement scale, or toggle between stress/displacement/pressure views.',
      parameters: {
        type: 'object',
        properties: {
          field: { type: 'string', description: 'Which field to show: "stress", "displacement", "temperature", "velocity", "pressure", "E_field"' },
          colormap: { type: 'string', enum: ['turbo', 'viridis', 'jet', 'inferno', 'coolwarm'] },
          opacity: { type: 'number', description: '0-1' },
          displacement_scale: { type: 'number', description: 'Magnification for deformed shape (default: 1)' },
          wireframe: { type: 'boolean' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'animate_simulation',
      description: 'Control simulation animation playback. Play, pause, rewind, change speed, or seek to a specific time.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['play', 'pause', 'stop', 'rewind', 'step_forward', 'step_backward'] },
          speed: { type: 'number', description: 'Playback speed multiplier (0.25 to 4x)' },
          seek_to: { type: 'number', description: 'Seek to this time in seconds' },
        },
        required: ['action'],
      },
    },
  },
];

// ── System Prompt Extension ──────────────────────────────────────────────────

export const SIMULATION_PROMPT_EXTENSION = `
## Simulation Capabilities

You can set up and run physics simulations directly. When a scientist describes their problem, translate it into the right solver configuration. Don't ask for technical details unless truly needed — infer reasonable defaults:

**Available solvers:**
- structural / structural-tet10: Static stress analysis on solid bodies (bridges, beams, brackets). Use TET10 for accuracy.
- thermal: Heat conduction with sources, insulation, boundary temperatures.
- acoustic: Sound wave propagation, room acoustics, ultrasound.
- fdtd: Electromagnetic wave simulation (antennas, waveguides, radar).
- navier-stokes: Fluid flow (pipe flow, aerodynamics, mixing).
- multiphase: Gas-liquid flows (bubbles, droplets, sloshing).
- molecular-dynamics: Atomic/molecular simulation (phase transitions, diffusion).

**Default behavior when scientist drops a file:**
- .fits → import as spectral cube, show 3D with channel slider, ask what they want to investigate
- .stl/.obj → import as surface mesh, offer to run structural simulation on it
- .csv → import as scalar field, visualize with colormap, offer analysis
- .vtk → import existing simulation results, offer re-analysis or comparison

**When interpreting results, always:**
1. State the key finding in plain language first ("The beam will hold" or "This will fail")
2. Give the number with units ("Safety factor: 2.3, max stress: 150 MPa")
3. Provide a recommendation ("Consider reducing the load or increasing the cross-section")
4. Offer to generate a full report or run a parameter sweep

**You exceed expectations by:**
- Running the simulation before being asked (when the intent is clear)
- Generating a report automatically after every structural analysis
- Suggesting parameter sweeps when the design is marginal (safety factor 1-2)
- Animating transient results automatically so they can see the physics evolve
- Comparing multiple materials without being asked ("Here's how aluminum, steel, and titanium compare")
`;
