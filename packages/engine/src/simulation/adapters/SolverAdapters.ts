/**
 * SolverAdapters — Thin wrappers that implement SimSolver around concrete solvers.
 */

import type { SimSolver, SolverMode, FieldData } from '../SimSolver';
import type { ThermalSolver } from '../ThermalSolver';
import type { StructuralSolver } from '../StructuralSolver';
import type { StructuralSolverTET10 } from '../StructuralSolverTET10';
import type { HydraulicSolver } from '../HydraulicSolver';
import type { AcousticSolver } from '../AcousticSolver';
import type { FDTDSolver } from '../FDTDSolver';
import type { ReactionDiffusionSolver } from '../ReactionDiffusionSolver';

// Helper to avoid repetition
function stats(s: { getStats(): unknown }): Record<string, unknown> {
  return s.getStats() as unknown as Record<string, unknown>;
}

export class ThermalSolverAdapter implements SimSolver {
  readonly mode: SolverMode = 'transient';
  readonly fieldNames = ['temperature', 'temperature_grid'] as const;
  constructor(private s: ThermalSolver) {}
  step(dt: number): void { this.s.step(dt); }
  solve(): void {}
  getField(name: string): FieldData | null {
    if (name === 'temperature') return this.s.getTemperatureField();
    if (name === 'temperature_grid') return this.s.getTemperatureGrid();
    return null;
  }
  getStats() { return stats(this.s); }
  dispose(): void { this.s.dispose(); }
}

export class StructuralSolverAdapter implements SimSolver {
  readonly mode: SolverMode = 'steady-state';
  readonly fieldNames = ['von_mises_stress', 'safety_factor', 'displacements'] as const;
  constructor(private s: StructuralSolver) {}
  step(): void {}
  solve(): void { this.s.solve(); }
  getField(name: string): FieldData | null {
    if (name === 'von_mises_stress') return this.s.getVonMisesStress();
    if (name === 'safety_factor') return this.s.getSafetyFactor();
    if (name === 'displacements') return this.s.getDisplacements();
    return null;
  }
  getStats() { return stats(this.s); }
  dispose(): void { this.s.dispose(); }
}

export class TET10SolverAdapter implements SimSolver {
  readonly mode: SolverMode = 'steady-state';
  readonly fieldNames = ['von_mises_stress', 'safety_factor', 'displacements'] as const;
  constructor(private s: StructuralSolverTET10) {}
  step(): void {}
  async solve(): Promise<void> { await this.s.solve(); }
  getField(name: string): FieldData | null {
    if (name === 'von_mises_stress') return this.s.getVonMisesStress();
    if (name === 'safety_factor') return this.s.getSafetyFactor();
    if (name === 'displacements') return this.s.getDisplacements();
    return null;
  }
  getStats() { return stats(this.s); }
  dispose(): void { this.s.dispose(); }
}

export class HydraulicSolverAdapter implements SimSolver {
  readonly mode: SolverMode = 'steady-state';
  readonly fieldNames = ['pressure', 'flow_rates'] as const;
  constructor(private s: HydraulicSolver) {}
  step(): void {}
  solve(): void { this.s.solve(); }
  getField(name: string): FieldData | null {
    if (name === 'pressure') return this.s.getPressureField();
    if (name === 'flow_rates') return this.s.getFlowRates();
    return null;
  }
  getStats() { return stats(this.s); }
  dispose(): void { this.s.dispose(); }
}

export class AcousticSolverAdapter implements SimSolver {
  readonly mode: SolverMode = 'transient';
  readonly fieldNames = ['pressure', 'pressure_grid'] as const;
  constructor(private s: AcousticSolver) {}
  step(dt: number): void { this.s.step(dt); }
  solve(): void {}
  getField(name: string): FieldData | null {
    if (name === 'pressure') return this.s.getPressureField();
    if (name === 'pressure_grid') return this.s.getPressureGrid();
    return null;
  }
  getStats() { return stats(this.s); }
  dispose(): void { this.s.dispose(); }
}

export class FDTDSolverAdapter implements SimSolver {
  readonly mode: SolverMode = 'transient';
  readonly fieldNames = ['E_magnitude', 'H_magnitude'] as const;
  constructor(private s: FDTDSolver) {}
  step(): void { this.s.step(); }
  solve(): void {}
  getField(name: string): FieldData | null {
    if (name === 'E_magnitude') return this.s.getEFieldMagnitude();
    if (name === 'H_magnitude') return this.s.getHFieldMagnitude();
    return null;
  }
  getStats() { return stats(this.s); }
  dispose(): void { this.s.dispose(); }
}

export class ReactionDiffusionSolverAdapter implements SimSolver {
  readonly mode: SolverMode = 'transient';
  readonly fieldNames: readonly string[];
  constructor(private s: ReactionDiffusionSolver) {
    // Dynamic field names: concentration_<name> for each species + heat_source + temperature
    const names: string[] = [];
    for (const name of s.getSpeciesNames()) {
      names.push(`concentration_${name}`);
      names.push(`concentration_grid_${name}`);
    }
    names.push('heat_source', 'heat_source_grid', 'temperature_grid');
    this.fieldNames = names;
  }
  step(dt: number): void { this.s.step(dt); }
  solve(): void {}
  getField(name: string): FieldData | null {
    const speciesNames = this.s.getSpeciesNames();
    // concentration_<name> → Float32Array
    for (let i = 0; i < speciesNames.length; i++) {
      if (name === `concentration_${speciesNames[i]}`) return this.s.getConcentrationField(i);
      if (name === `concentration_grid_${speciesNames[i]}`) return this.s.getConcentrationGrid(i);
    }
    if (name === 'heat_source') return this.s.getHeatSourceField();
    if (name === 'heat_source_grid') return this.s.getHeatSourceGrid();
    if (name === 'temperature_grid') return this.s.getTemperatureGrid();
    return null;
  }
  getStats() { return stats(this.s); }
  dispose(): void { this.s.dispose(); }
}
