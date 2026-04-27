/**
 * HoloScript Scientific Plugin - Type Definitions
 * Narupa Integration for VR-based Molecular Dynamics
 */

/**
 * Configuration for Narupa server instance
 */
export interface NarupaServerConfig {
  /** Path to PDB file */
  pdbPath: string;
  /** Server port (default: 38801) */
  port: number;
  /** Molecular dynamics engine */
  mdEngine: 'openmm' | 'ase';
  /** Simulation temperature in Kelvin */
  temperature: number;
  /** Timestep in femtoseconds */
  timestep: number;
  /** Number of simulation steps */
  steps?: number;
}

/**
 * Status of a Narupa server process
 */
export interface NarupaServerStatus {
  /** Process ID */
  pid: number;
  /** Server port */
  port: number;
  /** Running state */
  running: boolean;
  /** Number of atoms loaded */
  numAtoms?: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Molecular dynamics configuration
 */
export interface MolecularDynamicsConfig {
  /** Protein PDB file */
  protein: string;
  /** Ligand molecule file */
  ligand?: string;
  /** MD engine to use */
  mdEngine: 'openmm' | 'ase';
  /** Temperature in Kelvin */
  temperature: number;
  /** Timestep in femtoseconds */
  timestep: number;
  /** Total simulation steps */
  steps: number;
}
