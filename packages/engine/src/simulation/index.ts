/**
 * Simulation — PDE-based engineering solvers for HoloScript.
 *
 * Layer 0: Shared infrastructure (grid, materials, BCs, convergence)
 * Layer 1: Domain solvers (thermal, structural, hydraulic, saturation)
 * Layer 4: Multi-physics coupling
 */

// Layer 0 — Infrastructure
export { RegularGrid3D } from './RegularGrid3D';
export {
  applyBoundaryConditions,
  type BoundaryCondition,
  type BCType,
  type BCFace,
} from './BoundaryConditions';
export {
  getMaterial,
  findMaterial,
  registerMaterial,
  listMaterials,
  thermalDiffusivity,
  type ThermalMaterial,
  type StructuralMaterial,
  type HydraulicMaterial,
  type SimulationMaterial,
} from './MaterialDatabase';
export {
  conjugateGradient,
  jacobiIteration,
  type ConvergenceResult,
} from './ConvergenceControl';

// Layer 1 — Domain Solvers
export { ThermalSolver, type ThermalConfig, type ThermalSource } from './ThermalSolver';
export { StructuralSolver, type StructuralConfig, type StructuralConstraint, type StructuralLoad } from './StructuralSolver';
export { HydraulicSolver, type HydraulicConfig, type HydraulicPipe, type HydraulicNode, type HydraulicValve } from './HydraulicSolver';
export { SaturationManager, type SaturationConfig, type SaturationEvent } from './SaturationManager';

// Layer 4 — Multi-Physics Coupling
export { CouplingManager, type FieldCoupling } from './CouplingManager';
