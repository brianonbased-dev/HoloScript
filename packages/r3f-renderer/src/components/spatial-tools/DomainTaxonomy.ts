/**
 * DomainTaxonomy — Complete scientific domain classification for HoloScript.
 *
 * Maps every major STEM simulation domain to:
 *   - Which solver(s) serve it
 *   - Which spatial toolkit to use
 *   - Coverage level (full / partial / bridge / none)
 *   - Keywords for wizard auto-detection
 *
 * Sources: arXiv category taxonomy, NSF STEM classifications, DHS STEM list,
 * ACM Computing Classification System, IEEE taxonomy.
 *
 * This is the master reference for ensuring no scientist is left out.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type CoverageLevel =
  | 'full'      // Native solver exists, tested, verified
  | 'partial'   // Solver exists but limited (e.g., 2D only, no turbulence)
  | 'bridge'    // External tool bridge (Python, WASM) — not native
  | 'visualize' // Can visualize imported data but can't simulate
  | 'planned'   // On roadmap
  | 'none';     // Not covered

export interface DomainEntry {
  /** Unique domain ID */
  id: string;
  /** Display name */
  name: string;
  /** Parent category */
  category: string;
  /** Coverage level */
  coverage: CoverageLevel;
  /** Which HoloScript solver(s) serve this domain */
  solvers: string[];
  /** Spatial toolkit ID to activate */
  toolkit: string;
  /** Keywords for wizard auto-detection */
  keywords: string[];
  /** arXiv category (if applicable) */
  arxiv?: string;
  /** Brief description */
  description: string;
}

// ── Complete Taxonomy ────────────────────────────────────────────────────────

export const DOMAIN_TAXONOMY: DomainEntry[] = [
  // ═══════════════════════════════════════════════════════════════
  // PHYSICS
  // ═══════════════════════════════════════════════════════════════

  // Mechanics & Structures
  { id: 'structural-static', name: 'Static Structural Analysis', category: 'Engineering Mechanics', coverage: 'full', solvers: ['structural-tet10'], toolkit: 'structural-engineering', keywords: ['structural', 'stress', 'fem', 'finite element', 'deformation', 'beam', 'bridge', 'bracket'], arxiv: 'physics.class-ph', description: 'Linear/nonlinear static stress analysis with TET10 quadratic elements.' },
  { id: 'structural-dynamic', name: 'Structural Dynamics', category: 'Engineering Mechanics', coverage: 'partial', solvers: ['structural-tet10'], toolkit: 'structural-engineering', keywords: ['vibration', 'modal', 'natural frequency', 'resonance', 'impact', 'crash'], description: 'Modal analysis via eigenvalue extraction. Time-domain dynamics planned.' },
  { id: 'fatigue', name: 'Fatigue & Fracture', category: 'Engineering Mechanics', coverage: 'partial', solvers: ['structural-tet10'], toolkit: 'structural-engineering', keywords: ['fatigue', 'fracture', 'crack', 'lifecycle', 'SN curve', 'paris law'], description: 'Safety factors indicate fatigue margin. Explicit crack propagation not yet implemented.' },
  { id: 'contact-mechanics', name: 'Contact Mechanics', category: 'Engineering Mechanics', coverage: 'none', solvers: [], toolkit: 'structural-engineering', keywords: ['contact', 'friction', 'hertz', 'bolted joint', 'interference fit'], description: 'Contact detection and penalty/Lagrange multiplier methods not yet implemented.' },

  // Thermal
  { id: 'heat-conduction', name: 'Heat Conduction', category: 'Thermal Science', coverage: 'full', solvers: ['thermal'], toolkit: 'thermal-engineering', keywords: ['thermal', 'heat', 'conduction', 'temperature', 'insulation', 'fourier'], arxiv: 'physics.class-ph', description: 'Transient and steady-state heat conduction on 3D grids.' },
  { id: 'convection', name: 'Convective Heat Transfer', category: 'Thermal Science', coverage: 'partial', solvers: ['thermal', 'navier-stokes'], toolkit: 'thermal-engineering', keywords: ['convection', 'forced convection', 'natural convection', 'boussinesq', 'hvac'], description: 'Boundary convection BCs in thermal solver. Full conjugate heat transfer via CFD coupling.' },
  { id: 'radiation', name: 'Thermal Radiation', category: 'Thermal Science', coverage: 'none', solvers: [], toolkit: 'thermal-engineering', keywords: ['radiation', 'stefan boltzmann', 'view factor', 'radiosity', 'blackbody'], description: 'Radiative heat transfer not yet implemented. Would need view factor computation.' },

  // Fluid Dynamics
  { id: 'incompressible-cfd', name: 'Incompressible Flow', category: 'Fluid Dynamics', coverage: 'full', solvers: ['navier-stokes'], toolkit: 'fluid-dynamics', keywords: ['cfd', 'fluid', 'flow', 'navier stokes', 'incompressible', 'pipe flow', 'cavity'], arxiv: 'physics.flu-dyn', description: 'Chorin projection method with semi-Lagrangian advection.' },
  { id: 'multiphase-flow', name: 'Multiphase Flow', category: 'Fluid Dynamics', coverage: 'full', solvers: ['multiphase'], toolkit: 'fluid-dynamics', keywords: ['multiphase', 'bubble', 'droplet', 'level set', 'two phase', 'sloshing', 'dam break'], description: 'Level-set interface tracking with surface tension (CSF).' },
  { id: 'compressible-flow', name: 'Compressible Flow', category: 'Fluid Dynamics', coverage: 'none', solvers: [], toolkit: 'fluid-dynamics', keywords: ['compressible', 'supersonic', 'shock', 'mach', 'euler equations', 'blast'], description: 'Compressible Euler/NS not yet implemented. Would need Riemann solver.' },
  { id: 'turbulence', name: 'Turbulence Modeling', category: 'Fluid Dynamics', coverage: 'none', solvers: [], toolkit: 'fluid-dynamics', keywords: ['turbulence', 'k epsilon', 'k omega', 'les', 'rans', 'reynolds'], description: 'No turbulence models. Current NS is DNS on coarse grids (laminar only).' },
  { id: 'hydraulic-networks', name: 'Pipe Network Hydraulics', category: 'Fluid Dynamics', coverage: 'full', solvers: ['hydraulic'], toolkit: 'fluid-dynamics', keywords: ['pipe', 'hydraulic', 'water network', 'hardy cross', 'valve', 'pump'], description: 'Hardy-Cross method for pipe networks with valves.' },

  // Acoustics
  { id: 'room-acoustics', name: 'Room Acoustics', category: 'Acoustics', coverage: 'full', solvers: ['acoustic'], toolkit: 'acoustics', keywords: ['acoustic', 'room', 'reverberation', 'sound', 'speaker', 'noise', 'absorption'], arxiv: 'physics.class-ph', description: 'Wave equation with hard/soft/absorbing walls.' },
  { id: 'ultrasound', name: 'Ultrasound', category: 'Acoustics', coverage: 'partial', solvers: ['acoustic'], toolkit: 'acoustics', keywords: ['ultrasound', 'medical imaging', 'ndt', 'transducer'], description: 'Same wave equation at higher frequencies. Tissue models not yet included.' },
  { id: 'vibro-acoustics', name: 'Vibro-Acoustics', category: 'Acoustics', coverage: 'partial', solvers: ['acoustic', 'structural-tet10'], toolkit: 'acoustics', keywords: ['vibro acoustic', 'noise vibration', 'nvh', 'structural acoustic'], description: 'Structural-acoustic coupling via CouplingManagerV2. One-way only (no FSI).' },

  // Electromagnetics
  { id: 'fdtd-em', name: 'Full-Wave EM (FDTD)', category: 'Electromagnetics', coverage: 'full', solvers: ['fdtd'], toolkit: 'electromagnetic', keywords: ['electromagnetic', 'fdtd', 'maxwell', 'antenna', 'radar', 'microwave', 'waveguide'], arxiv: 'physics.optics', description: 'Yee FDTD with PEC/PML boundaries and lossy media.' },
  { id: 'rf-design', name: 'RF/Microwave Design', category: 'Electromagnetics', coverage: 'partial', solvers: ['fdtd'], toolkit: 'electromagnetic', keywords: ['rf', 'microwave', 'pcb', 'transmission line', 'impedance', 's parameter'], description: 'FDTD handles time-domain. No frequency-domain (MoM, FEM-EM) yet.' },
  { id: 'photonics', name: 'Photonics / Optics', category: 'Electromagnetics', coverage: 'partial', solvers: ['fdtd'], toolkit: 'electromagnetic', keywords: ['photonic', 'optical', 'laser', 'fiber', 'waveguide', 'diffraction'], arxiv: 'physics.optics', description: 'FDTD at optical frequencies. No beam propagation or ray tracing.' },
  { id: 'electrostatics', name: 'Electrostatics', category: 'Electromagnetics', coverage: 'none', solvers: [], toolkit: 'electromagnetic', keywords: ['electrostatic', 'capacitance', 'charge', 'poisson equation', 'laplace'], description: 'Poisson solver exists (pressure projection) but not wired for electrostatics.' },

  // ═══════════════════════════════════════════════════════════════
  // EARTH & SPACE SCIENCE
  // ═══════════════════════════════════════════════════════════════

  { id: 'seismic', name: 'Seismology', category: 'Earth Science', coverage: 'full', solvers: ['acoustic'], toolkit: 'geophysics', keywords: ['seismic', 'earthquake', 'seismology', 'wave propagation', 'ricker', 'refraction'], arxiv: 'physics.geo-ph', description: 'Acoustic solver with heterogeneous velocity field and layered earth models.' },
  { id: 'reservoir', name: 'Reservoir Simulation', category: 'Earth Science', coverage: 'partial', solvers: ['multiphase'], toolkit: 'geophysics', keywords: ['reservoir', 'oil', 'gas', 'porous media', 'darcy', 'permeability'], description: 'Multiphase flow applicable. No Darcy-specific formulation yet.' },
  { id: 'oceanography', name: 'Physical Oceanography', category: 'Earth Science', coverage: 'partial', solvers: ['navier-stokes'], toolkit: 'geophysics', keywords: ['ocean', 'current', 'wave', 'tide', 'coastal', 'tsunami'], description: 'NS solver applies to ocean currents. No free-surface or Coriolis yet.' },
  { id: 'atmospheric', name: 'Atmospheric Science', category: 'Earth Science', coverage: 'none', solvers: [], toolkit: 'geophysics', keywords: ['weather', 'climate', 'atmosphere', 'nwp', 'gcm', 'meteorology'], arxiv: 'physics.ao-ph', description: 'Requires spherical geometry and spectral methods. Not in scope.' },
  { id: 'radio-astronomy', name: 'Radio Astronomy', category: 'Astrophysics', coverage: 'full', solvers: ['fdtd'], toolkit: 'radio-astronomy', keywords: ['radio', 'telescope', 'interferometer', 'fits', 'spectral cube', 'pulsar', 'vla', 'alma'], arxiv: 'astro-ph', description: 'FDTD for array simulation + FITS import + spectral cube viewer.' },
  { id: 'stellar', name: 'Stellar Astrophysics', category: 'Astrophysics', coverage: 'visualize', solvers: [], toolkit: 'radio-astronomy', keywords: ['star', 'stellar', 'supernova', 'black hole', 'neutron star'], arxiv: 'astro-ph.SR', description: 'Can visualize imported data. No stellar evolution solver.' },
  { id: 'cosmology', name: 'Cosmology', category: 'Astrophysics', coverage: 'visualize', solvers: [], toolkit: 'radio-astronomy', keywords: ['cosmology', 'cmb', 'dark matter', 'galaxy', 'redshift', 'hubble'], arxiv: 'astro-ph.CO', description: 'Can visualize N-body or FITS data. No cosmological solver.' },

  // ═══════════════════════════════════════════════════════════════
  // CHEMISTRY & MATERIALS
  // ═══════════════════════════════════════════════════════════════

  { id: 'molecular-dynamics', name: 'Classical Molecular Dynamics', category: 'Chemistry / Materials', coverage: 'full', solvers: ['molecular-dynamics'], toolkit: 'molecular-dynamics', keywords: ['molecular dynamics', 'md', 'lennard jones', 'argon', 'protein folding', 'diffusion'], arxiv: 'cond-mat.soft', description: 'Velocity Verlet + Lennard-Jones + periodic BCs + Berendsen thermostat.' },
  { id: 'reaction-diffusion', name: 'Reaction-Diffusion', category: 'Chemistry / Materials', coverage: 'full', solvers: ['reaction-diffusion'], toolkit: 'thermal-engineering', keywords: ['reaction diffusion', 'gray scott', 'turing pattern', 'chemical kinetics', 'arrhenius'], description: 'Adaptive RK4/5 with Strang splitting and Arrhenius kinetics.' },
  { id: 'quantum-chemistry', name: 'Quantum Chemistry', category: 'Chemistry / Materials', coverage: 'none', solvers: [], toolkit: 'molecular-dynamics', keywords: ['dft', 'quantum', 'hartree fock', 'schrodinger', 'basis set', 'orbital'], arxiv: 'physics.chem-ph', description: 'Different mathematical framework (eigenvalue on basis sets). Not in scope.' },
  { id: 'materials-science', name: 'Materials Science', category: 'Chemistry / Materials', coverage: 'partial', solvers: ['structural-tet10', 'molecular-dynamics'], toolkit: 'structural-engineering', keywords: ['material', 'alloy', 'composite', 'crystal', 'grain', 'microstructure'], arxiv: 'cond-mat.mtrl-sci', description: 'Structural + MD for mechanical/thermal properties. No phase-field or crystal plasticity.' },

  // ═══════════════════════════════════════════════════════════════
  // BIOLOGY & MEDICINE
  // ═══════════════════════════════════════════════════════════════

  { id: 'biomechanics', name: 'Biomechanics', category: 'Biomedical', coverage: 'full', solvers: ['structural-tet10'], toolkit: 'structural-engineering', keywords: ['biomechanics', 'bone', 'implant', 'prosthetic', 'tissue', 'ortho'], description: 'Structural FEM with biological material properties.' },
  { id: 'hemodynamics', name: 'Hemodynamics', category: 'Biomedical', coverage: 'partial', solvers: ['navier-stokes'], toolkit: 'fluid-dynamics', keywords: ['blood flow', 'hemodynamics', 'artery', 'vascular', 'aneurysm', 'stent'], description: 'NS solver for blood flow. No non-Newtonian viscosity model yet.' },
  { id: 'drug-delivery', name: 'Drug Delivery / Pharmacokinetics', category: 'Biomedical', coverage: 'partial', solvers: ['reaction-diffusion', 'thermal'], toolkit: 'thermal-engineering', keywords: ['drug delivery', 'pharmacokinetics', 'diffusion', 'release rate', 'tissue'], description: 'Reaction-diffusion for drug transport. No compartment models.' },
  { id: 'medical-imaging', name: 'Medical Imaging', category: 'Biomedical', coverage: 'partial', solvers: ['acoustic', 'fdtd'], toolkit: 'acoustics', keywords: ['ultrasound imaging', 'mri', 'ct scan', 'medical imaging', 'dicom'], description: 'Acoustic (ultrasound) and EM (MRI) wave solvers applicable. No DICOM parser.' },
  { id: 'protein-folding', name: 'Protein Folding', category: 'Biomedical', coverage: 'bridge', solvers: [], toolkit: 'molecular-dynamics', keywords: ['protein', 'folding', 'alphafold', 'pdb', 'docking'], description: 'Narupa bridge to OpenMM/ASE. AlphaFold plugin for structure prediction.' },
  { id: 'neuroscience', name: 'Computational Neuroscience', category: 'Biomedical', coverage: 'partial', solvers: [], toolkit: 'general', keywords: ['neuroscience', 'neuron', 'spiking', 'brain', 'eeg', 'neural network'], arxiv: 'q-bio.NC', description: 'SNN-WebGPU package handles spiking neural networks on GPU.' },
  { id: 'epidemiology', name: 'Epidemiology', category: 'Biomedical', coverage: 'partial', solvers: ['reaction-diffusion'], toolkit: 'general', keywords: ['epidemic', 'sir model', 'pandemic', 'disease spread', 'contagion'], description: 'Reaction-diffusion for spatial SIR models. No agent-based epidemiology.' },

  // ═══════════════════════════════════════════════════════════════
  // ENGINEERING DISCIPLINES
  // ═══════════════════════════════════════════════════════════════

  { id: 'civil-engineering', name: 'Civil / Structural Engineering', category: 'Engineering', coverage: 'full', solvers: ['structural-tet10', 'thermal'], toolkit: 'structural-engineering', keywords: ['civil', 'building', 'foundation', 'concrete', 'reinforcement', 'bridge'], description: 'Full structural + thermal for civil engineering applications.' },
  { id: 'mechanical-engineering', name: 'Mechanical Engineering', category: 'Engineering', coverage: 'full', solvers: ['structural-tet10', 'thermal', 'navier-stokes'], toolkit: 'structural-engineering', keywords: ['mechanical', 'machine', 'gear', 'bearing', 'shaft', 'mechanism'], description: 'Structural + thermal + CFD covers most mechanical engineering needs.' },
  { id: 'aerospace', name: 'Aerospace Engineering', category: 'Engineering', coverage: 'partial', solvers: ['structural-tet10', 'navier-stokes', 'acoustic'], toolkit: 'structural-engineering', keywords: ['aerospace', 'aircraft', 'wing', 'fuselage', 'turbine', 'propulsion'], description: 'Structural + CFD + acoustics. No compressible flow for transonic/supersonic.' },
  { id: 'electrical-engineering', name: 'Electrical Engineering', category: 'Engineering', coverage: 'full', solvers: ['fdtd'], toolkit: 'electromagnetic', keywords: ['electrical', 'circuit', 'pcb', 'emi', 'emc', 'power electronics'], description: 'FDTD for EMI/EMC and antenna design. No circuit simulation (SPICE).' },
  { id: 'chemical-engineering', name: 'Chemical / Process Engineering', category: 'Engineering', coverage: 'partial', solvers: ['reaction-diffusion', 'navier-stokes', 'thermal'], toolkit: 'fluid-dynamics', keywords: ['chemical engineering', 'reactor', 'distillation', 'heat exchanger', 'process'], description: 'Reaction-diffusion + CFD + thermal. No multi-component transport.' },
  { id: 'environmental', name: 'Environmental Engineering', category: 'Engineering', coverage: 'partial', solvers: ['navier-stokes', 'reaction-diffusion'], toolkit: 'fluid-dynamics', keywords: ['environmental', 'pollution', 'water treatment', 'air quality', 'dispersion'], description: 'CFD for dispersion modeling. Reaction-diffusion for chemical transport.' },
  { id: 'nuclear-engineering', name: 'Nuclear Engineering', category: 'Engineering', coverage: 'none', solvers: [], toolkit: 'general', keywords: ['nuclear', 'reactor', 'neutron', 'radiation', 'fission', 'fusion'], arxiv: 'nucl-th', description: 'Requires Boltzmann transport equation. Fundamentally different math.' },
  { id: 'manufacturing', name: 'Manufacturing / Additive', category: 'Engineering', coverage: 'partial', solvers: ['structural-tet10', 'thermal'], toolkit: 'structural-engineering', keywords: ['manufacturing', '3d printing', 'additive', 'injection molding', 'welding', 'residual stress'], description: 'Structural + thermal for process-induced stresses. No toolpath simulation.' },

  // ═══════════════════════════════════════════════════════════════
  // MATHEMATICS & COMPUTATION
  // ═══════════════════════════════════════════════════════════════

  { id: 'optimization', name: 'Optimization', category: 'Applied Math', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['optimization', 'parameter sweep', 'pareto', 'sensitivity', 'design space'], description: 'ExperimentOrchestrator + ParameterSpace + ResultsAnalyzer for parameter optimization.' },
  { id: 'uncertainty', name: 'Uncertainty Quantification', category: 'Applied Math', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['uncertainty', 'uq', 'monte carlo', 'confidence interval', 'stochastic'], description: 'UncertaintyQuantification module with LHS ensemble analysis.' },
  { id: 'verification', name: 'Verification & Validation', category: 'Applied Math', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['verification', 'validation', 'benchmark', 'convergence', 'error analysis', 'gci'], description: 'V&V reports, convergence analysis, Richardson extrapolation, NAFEMS benchmarks.' },

  // ═══════════════════════════════════════════════════════════════
  // GAMING & INTERACTIVE
  // ═══════════════════════════════════════════════════════════════

  { id: 'game-physics', name: 'Game Physics', category: 'Gaming', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['game physics', 'rigid body', 'collision', 'ragdoll', 'rapier', 'physics engine'], description: 'Rapier3D physics via PhysicsProvider. Rigid bodies, colliders, joints.' },
  { id: 'game-vfx', name: 'Game VFX / Particles', category: 'Gaming', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['vfx', 'particle', 'explosion', 'fire', 'smoke', 'trail', 'effect'], description: 'VFXParticleRenderer with presets: fire, smoke, sparks, magic, rain, snow.' },
  { id: 'game-ai', name: 'Game AI / Behavior', category: 'Gaming', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['game ai', 'npc', 'behavior tree', 'pathfinding', 'state machine', 'goap'], description: 'BehaviorTree, PathfindingPanel, StateMachinePanel, DialoguePanel.' },
  { id: 'game-animation', name: 'Character Animation', category: 'Gaming', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['animation', 'keyframe', 'skeletal', 'blend shape', 'motion capture', 'vrm'], description: 'AnimationEngine, KeyframeEditor, VRM import, cutscene timeline.' },
  { id: 'game-multiplayer', name: 'Multiplayer / Networking', category: 'Gaming', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['multiplayer', 'netcode', 'lobby', 'p2p', 'server', 'sync', 'collab'], description: 'MultiplayerPanel, CRDT collaboration, real-time sync.' },
  { id: 'game-audio', name: 'Spatial Audio', category: 'Gaming', coverage: 'full', solvers: [], toolkit: 'acoustics', keywords: ['game audio', 'spatial audio', '3d sound', 'hrtf', 'reverb', 'occlusion'], description: 'SpatialAudioSource, AudioDiffraction, AudioOcclusion, AudioAnalyzer.' },
  { id: 'game-terrain', name: 'Terrain / World Building', category: 'Gaming', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['terrain', 'heightmap', 'procedural', 'landscape', 'world building', 'biome'], description: 'TerrainPanel, procedural generation, heightmap import.' },
  { id: 'game-inventory', name: 'Inventory / Economy', category: 'Gaming', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['inventory', 'loot', 'crafting', 'economy', 'shop', 'trading'], description: 'InventoryPanel, economic primitives plugin.' },
  { id: 'game-combat', name: 'Combat Systems', category: 'Gaming', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['combat', 'weapon', 'damage', 'health', 'hitbox', 'ability'], description: 'CombatPanel with damage models and ability systems.' },
  { id: 'vr-xr', name: 'VR / AR / XR', category: 'Gaming', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['vr', 'ar', 'xr', 'visionos', 'quest', 'headset', 'immersive', 'hologram'], description: 'WebXR export, VisionOS, Quest, spatial computing.' },
  { id: 'gaussian-splatting', name: 'Gaussian Splatting', category: 'Gaming', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['gaussian splat', '3dgs', 'nerf', 'point cloud', 'photogrammetry', 'splat'], description: 'GaussianSplatViewer with SPZ, glTF, MPEG GSC codecs.' },

  // ═══════════════════════════════════════════════════════════════
  // CREATIVE & INDUSTRY
  // ═══════════════════════════════════════════════════════════════

  { id: 'architecture', name: 'Architecture / BIM', category: 'Creative', coverage: 'partial', solvers: ['thermal', 'acoustic', 'structural-tet10'], toolkit: 'structural-engineering', keywords: ['architecture', 'building', 'bim', 'ifc', 'floor plan', 'facade'], description: 'Thermal + acoustic + structural for building performance. No IFC parser.' },
  { id: 'film-vfx', name: 'Film VFX', category: 'Creative', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['film', 'vfx', 'compositing', 'green screen', 'volumetric', 'motion capture'], description: 'Film VFX plugin, volumetric rendering, USD/USDZ export.' },
  { id: 'robotics', name: 'Robotics', category: 'Engineering', coverage: 'partial', solvers: ['structural-tet10'], toolkit: 'structural-engineering', keywords: ['robot', 'urdf', 'ros', 'actuator', 'kinematics', 'servo'], description: 'URDF export, ROS2 bridge. Structural for stress on robot frames.' },
  { id: 'smart-contracts', name: 'Smart Contracts / Web3', category: 'Technology', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['smart contract', 'solidity', 'blockchain', 'nft', 'token', 'web3', 'x402'], description: 'Smart contract plugin, x402 paywall, token-gated access.' },

  // ═══════════════════════════════════════════════════════════════
  // INDUSTRY VERTICALS (from 35 plugins + 36 scenarios)
  // ═══════════════════════════════════════════════════════════════

  // Finance & Business
  { id: 'banking-finance', name: 'Banking & Finance', category: 'Industry', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['banking', 'finance', 'trading', 'portfolio', 'risk', 'fintech', 'stock'], description: 'Banking-finance plugin + economic primitives.' },
  { id: 'insurance', name: 'Insurance', category: 'Industry', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['insurance', 'actuarial', 'underwriting', 'claims', 'policy'], description: 'Insurance plugin with risk modeling.' },
  { id: 'retail-ecommerce', name: 'Retail & E-Commerce', category: 'Industry', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['retail', 'ecommerce', 'shop', 'store', 'product', 'catalog', 'cart'], description: 'Retail-ecommerce plugin with inventory and storefront.' },
  { id: 'real-estate', name: 'Real Estate', category: 'Industry', coverage: 'partial', solvers: ['thermal'], toolkit: 'structural-engineering', keywords: ['real estate', 'property', 'building', 'floor plan', 'staging'], description: 'Building thermal simulation + 3D tours.' },

  // Healthcare & Life Sciences
  { id: 'therapy', name: 'Therapy / Mental Health', category: 'Healthcare', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['therapy', 'mental health', 'counseling', 'mindfulness', 'meditation', 'ptsd'], description: 'Therapy plugin for VR-assisted therapeutic environments.' },
  { id: 'surgical', name: 'Surgical Planning', category: 'Healthcare', coverage: 'partial', solvers: ['structural-tet10'], toolkit: 'structural-engineering', keywords: ['surgery', 'surgical', 'implant', 'procedure', 'anatomy', 'rehearsal'], description: 'SurgicalRehearsalPanel. FEM for implant stress analysis.' },
  { id: 'fitness', name: 'Fitness & Wellness', category: 'Healthcare', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['fitness', 'workout', 'health', 'wellness', 'exercise', 'yoga', 'gym'], description: 'Fitness-wellness plugin with spatial exercise environments.' },

  // Education
  { id: 'education', name: 'Education / LMS', category: 'Education', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['education', 'learning', 'student', 'classroom', 'tutorial', 'lms', 'course'], description: 'Education-LMS plugin with interactive 3D learning environments.' },
  { id: 'museum', name: 'Museum / Cultural Heritage', category: 'Education', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['museum', 'heritage', 'artifact', 'exhibit', 'culture', 'history', 'archaeology'], description: 'Archaeology plugin + culture-keyword plugin for heritage preservation.' },

  // Legal & Government
  { id: 'legal', name: 'Legal / Forensics', category: 'Legal', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['legal', 'law', 'courtroom', 'evidence', 'forensic', 'crime scene', 'deposition'], description: 'Legal-document plugin + forensics plugin + CourtroomPanel.' },
  { id: 'emergency-response', name: 'Emergency Response', category: 'Government', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['emergency', 'disaster', 'fire', 'earthquake response', 'evacuation', 'first responder'], description: 'Emergency-response plugin + DisasterResponsePanel.' },
  { id: 'threat-intelligence', name: 'Threat Intelligence / Security', category: 'Government', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['threat', 'intelligence', 'cybersecurity', 'security', 'vulnerability', 'attack surface'], description: 'Threat-intelligence plugin + ThreatIntelligencePanel.' },
  { id: 'urban-planning', name: 'Urban Planning', category: 'Government', coverage: 'full', solvers: ['thermal', 'acoustic'], toolkit: 'general', keywords: ['urban', 'city', 'planning', 'zoning', 'traffic', 'infrastructure', 'smart city'], description: 'Urban-planning plugin. Thermal/acoustic for building performance.' },

  // Food & Hospitality
  { id: 'restaurant', name: 'Restaurant / Food Service', category: 'Hospitality', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['restaurant', 'food', 'kitchen', 'menu', 'dining', 'chef', 'recipe'], description: 'Restaurant plugin with spatial dining experiences.' },
  { id: 'wine-beverage', name: 'Wine & Beverage', category: 'Hospitality', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['wine', 'beverage', 'sommelier', 'brewery', 'distillery', 'tasting'], description: 'Wine-food-beverage plugin + WineSommelierPanel.' },
  { id: 'travel', name: 'Travel & Hospitality', category: 'Hospitality', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['travel', 'hotel', 'tourism', 'booking', 'vacation', 'resort'], description: 'Travel-hospitality plugin for virtual tours and booking.' },

  // Creative Industries
  { id: 'fashion', name: 'Fashion Design', category: 'Creative', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['fashion', 'clothing', 'runway', 'garment', 'textile', 'outfit', 'style'], description: 'Fashion plugin + FashionRunwayPanel for virtual fashion shows.' },
  { id: 'music', name: 'Music Production', category: 'Creative', coverage: 'full', solvers: [], toolkit: 'acoustics', keywords: ['music', 'studio', 'recording', 'mixing', 'beat', 'instrument', 'daw'], description: 'MusicStudioPanel + spatial audio infrastructure.' },
  { id: 'theme-park', name: 'Theme Park / Entertainment', category: 'Creative', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['theme park', 'ride', 'attraction', 'entertainment', 'amusement'], description: 'ThemeParkPanel for spatial experience design.' },

  // HR & Workforce
  { id: 'hr-workforce', name: 'HR & Workforce', category: 'Industry', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['hr', 'workforce', 'hiring', 'training', 'onboarding', 'employee'], description: 'HR-workforce plugin for training simulations and onboarding.' },

  // Hardware & Manufacturing
  { id: 'hardware-invention', name: 'Hardware / Invention', category: 'Engineering', coverage: 'full', solvers: ['structural-tet10'], toolkit: 'structural-engineering', keywords: ['hardware', 'invention', 'prototype', 'patent', 'mechanism', 'device'], description: 'Hardware-invention plugin + InventorPanel. FEM for stress testing.' },

  // ═══════════════════════════════════════════════════════════════
  // COMPILATION TARGETS (from 40 compilers)
  // ═══════════════════════════════════════════════════════════════

  { id: 'web-development', name: 'Web Development', category: 'Targets', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['web', 'nextjs', 'react', 'website', 'webapp', 'frontend', 'api'], description: 'NextJSCompiler, R3FCompiler, NextJSAPICompiler, NodeServiceCompiler.' },
  { id: 'mobile-ios', name: 'iOS Development', category: 'Targets', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['ios', 'iphone', 'ipad', 'swift', 'apple', 'app store'], description: 'IOSCompiler + Native2DCompiler for iOS apps.' },
  { id: 'mobile-android', name: 'Android Development', category: 'Targets', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['android', 'kotlin', 'google play', 'mobile'], description: 'AndroidCompiler + AndroidXRCompiler.' },
  { id: 'unity', name: 'Unity Game Engine', category: 'Targets', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['unity', 'c#', 'unity3d', 'game engine'], description: 'UnityCompiler for Unity project export.' },
  { id: 'unreal', name: 'Unreal Engine', category: 'Targets', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['unreal', 'ue5', 'blueprint', 'unreal engine'], description: 'UnrealCompiler for Unreal project export.' },
  { id: 'godot', name: 'Godot Engine', category: 'Targets', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['godot', 'gdscript', 'open source game engine'], description: 'GodotCompiler for Godot project export.' },
  { id: 'visionos', name: 'Apple Vision Pro', category: 'Targets', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['visionos', 'vision pro', 'apple xr', 'spatial computing'], description: 'VisionOSCompiler for Apple spatial computing.' },
  { id: 'openxr', name: 'OpenXR / Quest', category: 'Targets', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['openxr', 'quest', 'meta', 'oculus', 'pcvr', 'steamvr'], description: 'OpenXRCompiler + OpenXRSpatialEntitiesCompiler.' },
  { id: 'vrchat', name: 'VRChat', category: 'Targets', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['vrchat', 'social vr', 'avatar', 'world'], description: 'VRChatCompiler for VRChat world/avatar export.' },
  { id: 'babylon', name: 'Babylon.js', category: 'Targets', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['babylon', 'babylonjs', 'webgl'], description: 'BabylonCompiler for Babylon.js export.' },
  { id: 'playcanvas', name: 'PlayCanvas', category: 'Targets', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['playcanvas', 'webgame'], description: 'PlayCanvasCompiler for PlayCanvas export.' },
  { id: 'urdf-robotics', name: 'URDF / ROS', category: 'Targets', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['urdf', 'ros', 'ros2', 'robot description'], description: 'URDFCompiler for robot description format.' },
  { id: 'dtdl-iot', name: 'DTDL / IoT Digital Twins', category: 'Targets', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['dtdl', 'iot', 'digital twin', 'azure', 'twin definition'], description: 'DTDLCompiler for Azure Digital Twins.' },
  { id: 'usd-pipeline', name: 'USD / Pixar Pipeline', category: 'Targets', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['usd', 'usda', 'usdz', 'pixar', 'omniverse'], description: 'USD export via USDPhysicsCompiler + USDZ exporter.' },
  { id: 'wasm-deploy', name: 'WASM Deployment', category: 'Targets', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['wasm', 'webassembly', 'edge', 'serverless'], description: 'WASMCompiler for WebAssembly deployment.' },
  { id: 'ai-agents', name: 'AI Agent Infrastructure', category: 'Targets', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['ai agent', 'llm', 'claude', 'gpt', 'gemini', 'a2a', 'mcp'], description: 'A2AAgentCardCompiler, Claude/GPT/Gemini targets, MCP tools.' },
  { id: 'nft-marketplace', name: 'NFT Marketplace', category: 'Targets', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['nft', 'marketplace', 'mint', 'collection'], description: 'NFTMarketplaceCompiler for on-chain spatial assets.' },
  { id: 'sdf-rendering', name: 'SDF / Ray Marching', category: 'Targets', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['sdf', 'signed distance', 'ray march', 'procedural', 'shader'], description: 'SDFCompiler + SDFRayMarchCompiler for procedural geometry.' },
  { id: 'webgpu-compute', name: 'WebGPU Compute', category: 'Targets', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['webgpu', 'compute shader', 'gpu', 'parallel'], description: 'WebGPUCompiler + TSLCompiler for GPU compute.' },
  { id: 'ai-glasses', name: 'AI Smart Glasses', category: 'Targets', coverage: 'full', solvers: [], toolkit: 'general', keywords: ['smart glasses', 'ar glasses', 'heads up', 'hud', 'wearable'], description: 'AIGlassesCompiler for smart glasses AR.' },
];

// ── API ──────────────────────────────────────────────────────────────────────

/** Get all domains in a category. */
export function getDomainsByCategory(category: string): DomainEntry[] {
  return DOMAIN_TAXONOMY.filter((d) => d.category === category);
}

/** Get all unique categories. */
export function getCategories(): string[] {
  return [...new Set(DOMAIN_TAXONOMY.map((d) => d.category))];
}

/** Find domains matching keywords (for wizard). */
export function matchDomains(keywords: string[]): DomainEntry[] {
  const kw = keywords.map((k) => k.toLowerCase());
  return DOMAIN_TAXONOMY
    .filter((d) => d.keywords.some((dk) => kw.some((k) => dk.includes(k) || k.includes(dk))))
    .sort((a, b) => {
      // Prefer full coverage over partial
      const coverageOrder: Record<CoverageLevel, number> = { full: 0, partial: 1, bridge: 2, visualize: 3, planned: 4, none: 5 };
      return (coverageOrder[a.coverage] ?? 5) - (coverageOrder[b.coverage] ?? 5);
    });
}

/** Coverage summary statistics. */
export function coverageSummary(): Record<CoverageLevel, number> {
  const counts: Record<CoverageLevel, number> = { full: 0, partial: 0, bridge: 0, visualize: 0, planned: 0, none: 0 };
  for (const d of DOMAIN_TAXONOMY) counts[d.coverage]++;
  return counts;
}

/** Total number of domains (auto-computed). */
export const TOTAL_DOMAINS = DOMAIN_TAXONOMY.length; // Should be ~90
