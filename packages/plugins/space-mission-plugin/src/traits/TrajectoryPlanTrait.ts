/**
 * @trajectory_plan Trait — Orbital mechanics and maneuver planning
 * @trait trajectory_plan
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type TransferType = 'hohmann' | 'bi_elliptic' | 'gravity_assist' | 'low_thrust' | 'direct';
export interface OrbitalElements { semiMajorAxisKm: number; eccentricity: number; inclinationDeg: number; raanDeg: number; argPeriapsisDeg: number; trueAnomalyDeg: number; }
export interface ManeuverNode { id: string; deltaVMs: number; durationS: number; direction: [number, number, number]; epochMs: number; }
export interface TrajectoryPlanConfig { launchWindowStart: string; launchWindowEnd: string; deltaVBudgetMs: number; orbit: OrbitalElements; maneuvers: ManeuverNode[]; transferType: TransferType; targetBody?: string; }
export interface TrajectoryPlanState { currentDeltaVUsed: number; completedManeuvers: string[]; currentOrbit: OrbitalElements; }

const defaultOrbit: OrbitalElements = { semiMajorAxisKm: 6778, eccentricity: 0, inclinationDeg: 28.5, raanDeg: 0, argPeriapsisDeg: 0, trueAnomalyDeg: 0 };
const defaultConfig: TrajectoryPlanConfig = { launchWindowStart: '', launchWindowEnd: '', deltaVBudgetMs: 9400, orbit: defaultOrbit, maneuvers: [], transferType: 'hohmann' };

export function createTrajectoryPlanHandler(): TraitHandler<TrajectoryPlanConfig> {
  return {
    name: 'trajectory_plan',
    defaultConfig,
    onAttach(node: HSPlusNode, config: TrajectoryPlanConfig, ctx: TraitContext) {
      node.__trajectoryState = { currentDeltaVUsed: 0, completedManeuvers: [], currentOrbit: { ...config.orbit } };
      ctx.emit?.('trajectory:attached', { transferType: config.transferType, maneuverCount: config.maneuvers.length });
    },
    onDetach(node: HSPlusNode, _c: TrajectoryPlanConfig, ctx: TraitContext) { delete node.__trajectoryState; ctx.emit?.('trajectory:detached'); },
    onUpdate(node: HSPlusNode, _c: TrajectoryPlanConfig, _ctx: TraitContext, _d: number) {
      const s = node.__trajectoryState as TrajectoryPlanState | undefined;
      if (s) { /* propagate orbit forward */ }
    },
    onEvent(node: HSPlusNode, config: TrajectoryPlanConfig, ctx: TraitContext, event: TraitEvent) {
      const s = node.__trajectoryState as TrajectoryPlanState | undefined;
      if (!s) return;
      if (event.type === 'trajectory:execute_maneuver') {
        const id = event.payload?.maneuverNodeId as string;
        const maneuver = config.maneuvers.find(m => m.id === id);
        if (maneuver && !s.completedManeuvers.includes(id)) {
          s.currentDeltaVUsed += maneuver.deltaVMs;
          s.completedManeuvers.push(id);
          ctx.emit?.('trajectory:maneuver_complete', { id, deltaVUsed: s.currentDeltaVUsed, budgetRemaining: config.deltaVBudgetMs - s.currentDeltaVUsed });
        }
      }
    },
  };
}
