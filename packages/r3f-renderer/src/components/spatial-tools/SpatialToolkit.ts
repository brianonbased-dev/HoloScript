/**
 * SpatialToolkit — Modular domain-specific spatial tool configurations.
 *
 * Each domain (engineering, astronomy, geophysics, biology, CFD, etc.)
 * gets its own measurement units, coordinate system, annotation presets,
 * and probe fields. The wizard selects the right toolkit based on the
 * user's domain classification.
 *
 * Usage:
 *   const toolkit = getSpatialToolkit('structural-engineering');
 *   // toolkit.coordinateSystem → 'engineering'
 *   // toolkit.measurementUnit → 'mm'
 *   // toolkit.probeFields → ['von_mises_stress', 'safety_factor', 'displacement']
 *   // toolkit.annotationPresets → ['Peak stress', 'Fixed support', 'Applied load', ...]
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SpatialToolkitConfig {
  /** Toolkit ID */
  id: string;
  /** Display name */
  name: string;
  /** Coordinate system to activate */
  coordinateSystem: 'engineering' | 'astronomical' | 'geophysical' | 'scene';
  /** Primary measurement unit */
  measurementUnit: string;
  /** Field unit for scalar probing */
  fieldUnit: string;
  /** Which scalar fields to offer for probing */
  probeFields: string[];
  /** Default colormap for this domain */
  defaultColormap: 'turbo' | 'viridis' | 'jet' | 'inferno' | 'coolwarm';
  /** Quick-add annotation presets */
  annotationPresets: string[];
  /** Measurement presets (common measurements for this domain) */
  measurementPresets: string[];
  /** Whether to show displacement deformation controls */
  showDisplacement: boolean;
  /** Whether to show animation/playback controls */
  showAnimation: boolean;
  /** WCS metadata (for astronomical) */
  wcsEnabled: boolean;
  /** Description for the wizard */
  description: string;
}

// ── Domain Toolkits ──────────────────────────────────────────────────────────

const TOOLKITS: Record<string, SpatialToolkitConfig> = {
  'structural-engineering': {
    id: 'structural-engineering',
    name: 'Structural Engineering',
    coordinateSystem: 'engineering',
    measurementUnit: 'mm',
    fieldUnit: 'MPa',
    probeFields: ['von_mises_stress', 'safety_factor', 'displacements'],
    defaultColormap: 'turbo',
    annotationPresets: [
      'Peak stress — reinforce here',
      'Fixed support',
      'Applied load',
      'Safety factor < 2 — review',
      'Stress concentration at fillet',
      'Acceptable — within limits',
    ],
    measurementPresets: [
      'Measure deflection at tip',
      'Measure stress gradient across joint',
      'Measure wall thickness',
    ],
    showDisplacement: true,
    showAnimation: false,
    wcsEnabled: false,
    description: 'Structural analysis with stress, safety factors, and deformation visualization.',
  },

  'thermal-engineering': {
    id: 'thermal-engineering',
    name: 'Thermal Engineering',
    coordinateSystem: 'engineering',
    measurementUnit: 'mm',
    fieldUnit: '°C',
    probeFields: ['temperature'],
    defaultColormap: 'coolwarm',
    annotationPresets: [
      'Hotspot — add cooling',
      'Cold bridge — add insulation',
      'Thermostat location',
      'Heat source',
      'Acceptable temperature',
    ],
    measurementPresets: [
      'Measure temperature gradient across wall',
      'Measure hotspot to vent distance',
    ],
    showDisplacement: false,
    showAnimation: true,
    wcsEnabled: false,
    description: 'Heat transfer analysis with temperature field visualization.',
  },

  'radio-astronomy': {
    id: 'radio-astronomy',
    name: 'Radio Astronomy',
    coordinateSystem: 'astronomical',
    measurementUnit: 'arcsec',
    fieldUnit: 'Jy/beam',
    probeFields: ['intensity', 'flux_density', 'E_magnitude'],
    defaultColormap: 'viridis',
    annotationPresets: [
      'Point source',
      'Extended emission',
      'RFI artifact',
      'Spectral line detection',
      'Noise region',
      'Calibrator',
    ],
    measurementPresets: [
      'Measure angular separation',
      'Measure flux at source peak',
      'Measure beam width',
    ],
    showDisplacement: false,
    showAnimation: true,
    wcsEnabled: true,
    description: 'Radio observation analysis with WCS coordinates and spectral cube navigation.',
  },

  'acoustics': {
    id: 'acoustics',
    name: 'Acoustics',
    coordinateSystem: 'engineering',
    measurementUnit: 'm',
    fieldUnit: 'Pa',
    probeFields: ['pressure'],
    defaultColormap: 'coolwarm',
    annotationPresets: [
      'Sound source',
      'Reflection point',
      'Absorption zone',
      'Standing wave node',
      'Dead spot — add diffuser',
    ],
    measurementPresets: [
      'Measure source to listener distance',
      'Measure room dimension',
      'Measure pressure decay over distance',
    ],
    showDisplacement: false,
    showAnimation: true,
    wcsEnabled: false,
    description: 'Room acoustics and sound propagation with pressure field animation.',
  },

  'electromagnetic': {
    id: 'electromagnetic',
    name: 'Electromagnetics',
    coordinateSystem: 'engineering',
    measurementUnit: 'mm',
    fieldUnit: 'V/m',
    probeFields: ['E_magnitude', 'H_magnitude'],
    defaultColormap: 'turbo',
    annotationPresets: [
      'Antenna feed point',
      'PML boundary',
      'Field null',
      'Resonance peak',
      'Dielectric interface',
    ],
    measurementPresets: [
      'Measure wavelength',
      'Measure field decay in material',
      'Measure antenna aperture',
    ],
    showDisplacement: false,
    showAnimation: true,
    wcsEnabled: false,
    description: 'FDTD electromagnetic simulation with E/H field visualization.',
  },

  'fluid-dynamics': {
    id: 'fluid-dynamics',
    name: 'Fluid Dynamics',
    coordinateSystem: 'engineering',
    measurementUnit: 'm',
    fieldUnit: 'm/s',
    probeFields: ['velocity_magnitude', 'pressure'],
    defaultColormap: 'turbo',
    annotationPresets: [
      'Inlet',
      'Outlet',
      'Recirculation zone',
      'Stagnation point',
      'Boundary layer separation',
      'Vortex core',
    ],
    measurementPresets: [
      'Measure velocity at cross-section',
      'Measure pressure drop inlet to outlet',
      'Measure boundary layer thickness',
    ],
    showDisplacement: false,
    showAnimation: true,
    wcsEnabled: false,
    description: 'CFD flow visualization with velocity and pressure fields.',
  },

  'geophysics': {
    id: 'geophysics',
    name: 'Geophysics / Seismic',
    coordinateSystem: 'geophysical',
    measurementUnit: 'm',
    fieldUnit: 'Pa',
    probeFields: ['pressure', 'velocity'],
    defaultColormap: 'turbo',
    annotationPresets: [
      'Shot point',
      'Layer boundary',
      'Fault zone',
      'Salt dome',
      'Receiver location',
      'First break',
    ],
    measurementPresets: [
      'Measure layer depth',
      'Measure offset distance',
      'Measure velocity in layer',
    ],
    showDisplacement: false,
    showAnimation: true,
    wcsEnabled: false,
    description: 'Seismic wave propagation through layered earth models.',
  },

  'molecular-dynamics': {
    id: 'molecular-dynamics',
    name: 'Molecular Dynamics',
    coordinateSystem: 'scene',
    measurementUnit: 'σ',
    fieldUnit: 'ε',
    probeFields: ['kinetic_energy', 'potential_energy'],
    defaultColormap: 'inferno',
    annotationPresets: [
      'Crystal defect',
      'Phase boundary',
      'Surface atom',
      'Vacancy site',
      'High-energy particle',
    ],
    measurementPresets: [
      'Measure interatomic distance',
      'Measure cluster radius',
      'Measure nearest-neighbor distance',
    ],
    showDisplacement: false,
    showAnimation: true,
    wcsEnabled: false,
    description: 'Atomic-scale simulation with particle trajectories and phase visualization.',
  },

  'general': {
    id: 'general',
    name: 'General Purpose',
    coordinateSystem: 'scene',
    measurementUnit: 'm',
    fieldUnit: '',
    probeFields: [],
    defaultColormap: 'turbo',
    annotationPresets: ['Note', 'Important', 'Review needed'],
    measurementPresets: ['Measure distance'],
    showDisplacement: false,
    showAnimation: false,
    wcsEnabled: false,
    description: 'General-purpose spatial tools.',
  },
};

// ── API ──────────────────────────────────────────────────────────────────────

/**
 * Get the spatial toolkit for a given domain.
 * Falls back to 'general' if domain not recognized.
 */
export function getSpatialToolkit(domain: string): SpatialToolkitConfig {
  return TOOLKITS[domain] ?? TOOLKITS['general'];
}

/**
 * Infer the best toolkit from wizard keywords / scenario ID.
 */
export function inferToolkit(keywords: string[]): SpatialToolkitConfig {
  const kw = keywords.map((k) => k.toLowerCase()).join(' ');

  if (kw.includes('structural') || kw.includes('stress') || kw.includes('fem') || kw.includes('bridge')) return TOOLKITS['structural-engineering'];
  if (kw.includes('thermal') || kw.includes('heat') || kw.includes('hvac') || kw.includes('temperature')) return TOOLKITS['thermal-engineering'];
  if (kw.includes('radio') || kw.includes('telescope') || kw.includes('fits') || kw.includes('astro')) return TOOLKITS['radio-astronomy'];
  if (kw.includes('acoustic') || kw.includes('sound') || kw.includes('audio') || kw.includes('noise')) return TOOLKITS['acoustics'];
  if (kw.includes('electromagnetic') || kw.includes('antenna') || kw.includes('radar') || kw.includes('fdtd')) return TOOLKITS['electromagnetic'];
  if (kw.includes('fluid') || kw.includes('cfd') || kw.includes('navier') || kw.includes('flow') || kw.includes('aerodynamic')) return TOOLKITS['fluid-dynamics'];
  if (kw.includes('seismic') || kw.includes('geophys') || kw.includes('earthquake') || kw.includes('subsurface')) return TOOLKITS['geophysics'];
  if (kw.includes('molecular') || kw.includes('atom') || kw.includes('lennard') || kw.includes('md')) return TOOLKITS['molecular-dynamics'];

  return TOOLKITS['general'];
}

/** Get all available toolkit IDs. */
export function listToolkits(): string[] {
  return Object.keys(TOOLKITS);
}

/** Get all toolkits. */
export function getAllToolkits(): SpatialToolkitConfig[] {
  return Object.values(TOOLKITS);
}
