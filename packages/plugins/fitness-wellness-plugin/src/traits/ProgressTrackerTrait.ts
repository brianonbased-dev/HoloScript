/** @progress_tracker Trait — Fitness progress over time. @trait progress_tracker */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface ProgressEntry { date: string; metric: string; value: number; unit: string; }
export interface ProgressTrackerConfig { userId: string; metrics: string[]; goalValues: Record<string, number>; trackingPeriodDays: number; }
export interface ProgressTrackerState { entries: ProgressEntry[]; streakDays: number; lastLogDate: string | null; goalsReached: string[]; }

const defaultConfig: ProgressTrackerConfig = { userId: '', metrics: ['weight', 'body_fat', 'bench_press_1rm'], goalValues: {}, trackingPeriodDays: 90 };

export function createProgressTrackerHandler(): TraitHandler<ProgressTrackerConfig> {
  return { name: 'progress_tracker', defaultConfig,
    onAttach(n: HSPlusNode, _c: ProgressTrackerConfig, ctx: TraitContext) { n.__progressState = { entries: [], streakDays: 0, lastLogDate: null, goalsReached: [] }; ctx.emit?.('progress:initialized'); },
    onDetach(n: HSPlusNode, _c: ProgressTrackerConfig, ctx: TraitContext) { delete n.__progressState; ctx.emit?.('progress:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: ProgressTrackerConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__progressState as ProgressTrackerState | undefined; if (!s) return;
      if (e.type === 'progress:log') {
        const entry: ProgressEntry = { date: new Date().toISOString().split('T')[0], metric: (e.payload?.metric as string) ?? '', value: (e.payload?.value as number) ?? 0, unit: (e.payload?.unit as string) ?? '' };
        s.entries.push(entry);
        const today = entry.date;
        if (s.lastLogDate && s.lastLogDate !== today) { const diff = (new Date(today).getTime() - new Date(s.lastLogDate).getTime()) / 86400000; s.streakDays = diff <= 1 ? s.streakDays + 1 : 1; }
        else if (!s.lastLogDate) s.streakDays = 1;
        s.lastLogDate = today;
        const goal = c.goalValues[entry.metric];
        if (goal !== undefined && entry.value >= goal && !s.goalsReached.includes(entry.metric)) { s.goalsReached.push(entry.metric); ctx.emit?.('progress:goal_reached', { metric: entry.metric, value: entry.value }); }
        ctx.emit?.('progress:logged', { metric: entry.metric, streak: s.streakDays });
      }
    },
  };
}
