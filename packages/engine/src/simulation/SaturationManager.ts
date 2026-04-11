/**
 * SaturationManager — Threshold tracking + phase transition logic.
 *
 * Monitors a solver's scalar field and fires events when values
 * cross warning/critical/recovery thresholds. Supports hysteresis
 * to prevent oscillation at threshold boundaries.
 *
 * Backs the @saturation_* and @phase_transition traits.
 */

import { RegularGrid3D } from './RegularGrid3D';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SaturationType =
  | 'thermal'
  | 'moisture'
  | 'pressure'
  | 'electrical'
  | 'chemical'
  | 'structural';

export type CellState = 'normal' | 'warning' | 'critical';

export interface SaturationConfig {
  /** The scalar field to monitor (grid or flat array) */
  field: RegularGrid3D | Float32Array;
  /** Threshold levels */
  thresholds: {
    warning: number;
    critical: number;
    /** Recovery threshold (hysteresis): must drop below this to return to normal */
    recovery: number;
  };
  /** Domain type for event labeling */
  type: SaturationType;
  /** Phase transition configuration (optional) */
  phaseTransition?: PhaseTransitionConfig;
}

export interface PhaseTransitionConfig {
  /** Temperature/pressure at which transition occurs */
  transitionPoint: number;
  /** Latent heat in J/kg (energy absorbed/released during transition) */
  latentHeat: number;
  fromPhase: 'solid' | 'liquid' | 'gas';
  toPhase: 'solid' | 'liquid' | 'gas';
}

export interface SaturationEvent {
  /** Cell index (flat) or node index */
  index: number;
  /** Previous state */
  from: CellState;
  /** New state */
  to: CellState;
  /** Current field value at this cell */
  value: number;
  /** Saturation domain type */
  type: SaturationType;
  /** Whether a phase transition was triggered */
  phaseTransition: boolean;
}

export interface SaturationStats {
  totalCells: number;
  normalCount: number;
  warningCount: number;
  criticalCount: number;
  saturationFraction: number;
  phaseTransitionActive: boolean;
  phaseTransitionCells: number;
}

// ── Manager ───────────────────────────────────────────────────────────────────

export class SaturationManager {
  private config: SaturationConfig;
  private cellStates: Uint8Array; // 0=normal, 1=warning, 2=critical
  private phaseTransitionCells: Set<number>;
  private cellCount: number;

  constructor(config: SaturationConfig) {
    this.config = config;
    this.cellCount =
      config.field instanceof RegularGrid3D
        ? config.field.cellCount
        : config.field.length;
    this.cellStates = new Uint8Array(this.cellCount);
    this.phaseTransitionCells = new Set();
  }

  /**
   * Check all cells against thresholds. Returns events for cells that changed state.
   */
  update(): SaturationEvent[] {
    const events: SaturationEvent[] = [];
    const { warning, critical, recovery } = this.config.thresholds;
    const field =
      this.config.field instanceof RegularGrid3D
        ? this.config.field.data
        : this.config.field;

    for (let i = 0; i < this.cellCount; i++) {
      const value = field[i];
      const prevState = this.cellStates[i] as 0 | 1 | 2;
      let newState: 0 | 1 | 2 = prevState;

      // Hysteresis logic: crossing up uses warning/critical, crossing down uses recovery
      if (prevState === 0) {
        // Normal → check if crossed warning
        if (value >= critical) newState = 2;
        else if (value >= warning) newState = 1;
      } else if (prevState === 1) {
        // Warning → can go to critical or back to normal
        if (value >= critical) newState = 2;
        else if (value < recovery) newState = 0;
      } else {
        // Critical → can only recover back to warning or normal
        if (value < recovery) newState = 0;
        else if (value < warning) newState = 1;
      }

      if (newState !== prevState) {
        this.cellStates[i] = newState;

        // Check phase transition
        let phaseTransition = false;
        if (this.config.phaseTransition) {
          const pt = this.config.phaseTransition;
          if (
            (prevState < 2 && newState === 2 && value >= pt.transitionPoint) ||
            (prevState === 2 && newState < 2 && value < pt.transitionPoint)
          ) {
            phaseTransition = true;
            if (newState === 2) {
              this.phaseTransitionCells.add(i);
            } else {
              this.phaseTransitionCells.delete(i);
            }
          }
        }

        events.push({
          index: i,
          from: stateLabel(prevState),
          to: stateLabel(newState),
          value,
          type: this.config.type,
          phaseTransition,
        });
      }
    }

    return events;
  }

  /** Get per-cell state field: 0=normal, 1=warning, 2=critical */
  getStateField(): Uint8Array {
    return this.cellStates;
  }

  /** Fraction of cells at or above warning level */
  getSaturationFraction(): number {
    let count = 0;
    for (let i = 0; i < this.cellCount; i++) {
      if (this.cellStates[i] > 0) count++;
    }
    return count / this.cellCount;
  }

  /** Whether any cell is currently undergoing a phase transition */
  isPhaseTransitionActive(): boolean {
    return this.phaseTransitionCells.size > 0;
  }

  getStats(): SaturationStats {
    let normal = 0, warning = 0, critical = 0;
    for (let i = 0; i < this.cellCount; i++) {
      switch (this.cellStates[i]) {
        case 0: normal++; break;
        case 1: warning++; break;
        case 2: critical++; break;
      }
    }
    return {
      totalCells: this.cellCount,
      normalCount: normal,
      warningCount: warning,
      criticalCount: critical,
      saturationFraction: (warning + critical) / this.cellCount,
      phaseTransitionActive: this.phaseTransitionCells.size > 0,
      phaseTransitionCells: this.phaseTransitionCells.size,
    };
  }

  /** Update the monitored field reference (e.g., after solver re-allocation) */
  setField(field: RegularGrid3D | Float32Array): void {
    this.config.field = field;
    const newCount =
      field instanceof RegularGrid3D ? field.cellCount : field.length;
    if (newCount !== this.cellCount) {
      this.cellCount = newCount;
      this.cellStates = new Uint8Array(newCount);
      this.phaseTransitionCells.clear();
    }
  }

  /** Update thresholds at runtime */
  setThresholds(thresholds: Partial<SaturationConfig['thresholds']>): void {
    Object.assign(this.config.thresholds, thresholds);
  }

  dispose(): void {
    this.phaseTransitionCells.clear();
  }
}

function stateLabel(s: 0 | 1 | 2): CellState {
  return s === 0 ? 'normal' : s === 1 ? 'warning' : 'critical';
}
