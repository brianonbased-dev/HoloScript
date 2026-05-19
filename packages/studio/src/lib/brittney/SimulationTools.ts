/**
 * SimulationTools — Brittney's simulation-specific function-calling tools.
 *
 * When a scientist or engineer asks about physics, Brittney can help configure
 * developer-facing solvers, inspect results, and draft reports. These tools do
 * not replace CAD import review, mesh-quality checks, or domain V&V sign-off.
 */

// ── Tool Schemas ─────────────────────────────────────────────────────────────

export const SIMULATION_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'setup_simulation',
      description: 'Set up a simulation on the active scene object. Configures mesh, material, constraints, loads, and solver type. Translate the request into explicit config, and ask for missing geometry, units, loads, constraints, or validation context before treating the result as evidence.',
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
      description: 'Ask a question about simulation results in plain English. Examples: "what is the max stress?", "did it converge?", "give me a summary". Do not certify safety; report assumptions and missing validation.',
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
      description: 'Generate a simulation report draft with assumptions, metrics, findings, limitations, and recommendations. Returns Markdown.',
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
      description: 'Import scientific or engineering data from a file that the user dropped into the scene. Supports FITS (astronomy), STL/OBJ surface meshes, CSV (tabular), and VTK (simulation results). STEP/IGES CAD import is not part of this tool.',
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
  {
    type: 'function' as const,
    function: {
      name: 'measure_in_3d',
      description: 'Measure distance between two points on the simulation results, probing scalar values at each location. The measurement lives in 3D space — not a screenshot.',
      parameters: {
        type: 'object',
        properties: {
          point_a: { type: 'array', items: { type: 'number' }, description: '[x, y, z] world coordinates' },
          point_b: { type: 'array', items: { type: 'number' }, description: '[x, y, z] world coordinates' },
          field: { type: 'string', description: 'Which field to probe at each point (e.g., "von_mises_stress", "temperature")' },
        },
        required: ['point_a', 'point_b'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'add_annotation',
      description: 'Pin a text note to a specific 3D location on the simulation results. Creates a visible marker with label in the scene.',
      parameters: {
        type: 'object',
        properties: {
          position: { type: 'array', items: { type: 'number' }, description: '[x, y, z] world coordinates' },
          text: { type: 'string', description: 'Note text (e.g., "Peak stress here — reinforce this corner")' },
          color: { type: 'string', description: 'Hex color for the pin (default: #ffaa00)' },
        },
        required: ['position', 'text'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'set_coordinate_system',
      description: 'Set the coordinate display system. Engineering shows mm, astronomy shows RA/Dec/Freq, geophysics shows depth/offset.',
      parameters: {
        type: 'object',
        properties: {
          system: { type: 'string', enum: ['engineering', 'astronomical', 'geophysical', 'scene'], description: 'Coordinate system' },
          wcs: { type: 'object', description: 'WCS metadata for astronomical coordinates (crpix, crval, cdelt from FITS header)' },
        },
        required: ['system'],
      },
    },
  },
];

// ── System Prompt Extension ──────────────────────────────────────────────────

export const SIMULATION_PROMPT_EXTENSION = `
## Simulation Capabilities

You can help set up and run developer-facing physics simulations. When a scientist or engineer describes a problem, translate it into explicit solver configuration and clearly label assumptions. Ask for geometry, units, materials, loads, constraints, mesh quality, or validation context when those facts affect the result.

**Available solvers:**
- structural / structural-tet10: Static stress analysis on supplied or generated meshes. TET10 can improve element accuracy, but only after geometry, loads, constraints, and mesh quality are credible.
- thermal: Heat conduction with sources, insulation, boundary temperatures.
- acoustic: Sound wave propagation, room acoustics, ultrasound.
- fdtd: Electromagnetic wave simulation (antennas, waveguides, radar).
- navier-stokes: Fluid flow (pipe flow, aerodynamics, mixing).
- multiphase: Gas-liquid flows (bubbles, droplets, sloshing).
- molecular-dynamics: Atomic/molecular simulation (phase transitions, diffusion).

**Default behavior when a scientific or engineering file appears:**
- .fits → import as spectral cube, show 3D with channel slider, ask what they want to investigate
- .stl/.obj → import as surface mesh, explain the meshing assumptions, and offer structural setup only after units, material, constraints, and loads are known
- .csv → import as scalar field, visualize with colormap, offer analysis
- .vtk → import existing simulation results, offer re-analysis or comparison

**When interpreting results, always:**
1. State the key finding in plain language first ("Under the stated assumptions, the beam clears the chosen threshold" or "This setup exceeds the chosen limit")
2. Give the number with units ("Safety factor: 2.3, max stress: 150 MPa")
3. Provide a recommendation plus the assumption it depends on ("Consider reducing the load or increasing the cross-section; verify material and boundary conditions first")
4. Offer to generate a full report or run a parameter sweep

**Spatial verification tools (what makes HoloScript unique):**
- measure_in_3d: Measure distance + probe values at two 3D points on the simulation
- add_annotation: Pin notes to specific 3D locations (e.g., "reinforce this corner")
- set_coordinate_system: Switch between engineering (mm), astronomical (RA/Dec), geophysical (depth)

**You exceed expectations by:**
- Running the simulation before being asked (when the intent is clear)
- Generating a report draft after every structural analysis, with assumptions and limitations visible
- Suggesting parameter sweeps when the design is marginal (safety factor 1-2)
- Animating transient results when a recorded simulation exists
- Comparing multiple materials without being asked ("Here's how aluminum, steel, and titanium compare")
- Adding measurements and annotations proactively: "I measured 2.3mm deflection at the tip. I've pinned a note at the stress concentration near the fillet."
- Setting the coordinate system automatically: .fits files → astronomical, structural → engineering (mm), seismic → geophysical (depth)
`;
