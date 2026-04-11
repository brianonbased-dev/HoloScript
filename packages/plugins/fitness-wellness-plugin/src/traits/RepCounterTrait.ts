/** @rep_counter Trait — Repetition counting and form tracking. @trait rep_counter */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface RepCounterConfig { targetReps: number; exerciseName: string; formCheckEnabled: boolean; tempoUp: number; tempoDown: number; }
export interface RepCounterState { currentReps: number; goodFormReps: number; badFormReps: number; isTracking: boolean; }

const defaultConfig: RepCounterConfig = { targetReps: 10, exerciseName: '', formCheckEnabled: true, tempoUp: 2, tempoDown: 3 };

export function createRepCounterHandler(): TraitHandler<RepCounterConfig> {
  return { name: 'rep_counter', defaultConfig,
    onAttach(n: HSPlusNode, _c: RepCounterConfig, ctx: TraitContext) { n.__repState = { currentReps: 0, goodFormReps: 0, badFormReps: 0, isTracking: false }; ctx.emit?.('rep:ready'); },
    onDetach(n: HSPlusNode, _c: RepCounterConfig, ctx: TraitContext) { delete n.__repState; ctx.emit?.('rep:stopped'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: RepCounterConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__repState as RepCounterState | undefined; if (!s) return;
      if (e.type === 'rep:start') { s.isTracking = true; s.currentReps = 0; s.goodFormReps = 0; s.badFormReps = 0; ctx.emit?.('rep:tracking'); }
      if (e.type === 'rep:count' && s.isTracking) {
        s.currentReps++;
        const goodForm = (e.payload?.goodForm as boolean) ?? true;
        if (goodForm) s.goodFormReps++; else s.badFormReps++;
        ctx.emit?.('rep:counted', { reps: s.currentReps, target: c.targetReps, formRate: s.goodFormReps / s.currentReps });
        if (s.currentReps >= c.targetReps) { s.isTracking = false; ctx.emit?.('rep:target_reached', { total: s.currentReps, goodForm: s.goodFormReps }); }
      }
    },
  };
}
