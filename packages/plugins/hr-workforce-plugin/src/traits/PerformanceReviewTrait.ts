/** @performance_review Trait — Employee performance evaluation. @trait performance_review */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type ReviewCycle = 'annual' | 'semi_annual' | 'quarterly' | 'monthly';
export type Rating = 1 | 2 | 3 | 4 | 5;
export interface ReviewGoal { id: string; description: string; weight: number; rating: Rating | null; comments: string; }
export interface PerformanceReviewConfig { employeeId: string; reviewerId: string; cycle: ReviewCycle; goals: ReviewGoal[]; selfAssessment: boolean; peerReview: boolean; }
export interface PerformanceReviewState { overallRating: number | null; status: 'draft' | 'self_review' | 'manager_review' | 'calibration' | 'complete'; goalsRated: number; }

const defaultConfig: PerformanceReviewConfig = { employeeId: '', reviewerId: '', cycle: 'annual', goals: [], selfAssessment: true, peerReview: false };

export function createPerformanceReviewHandler(): TraitHandler<PerformanceReviewConfig> {
  return { name: 'performance_review', defaultConfig,
    onAttach(n: HSPlusNode, c: PerformanceReviewConfig, ctx: TraitContext) { n.__reviewState = { overallRating: null, status: 'draft', goalsRated: 0 }; ctx.emit?.('review:created', { goals: c.goals.length, cycle: c.cycle }); },
    onDetach(n: HSPlusNode, _c: PerformanceReviewConfig, ctx: TraitContext) { delete n.__reviewState; ctx.emit?.('review:discarded'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: PerformanceReviewConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__reviewState as PerformanceReviewState | undefined; if (!s) return;
      if (e.type === 'review:rate_goal') {
        const goalId = e.payload?.goalId as string; const rating = e.payload?.rating as Rating;
        const goal = c.goals.find(g => g.id === goalId);
        if (goal && rating >= 1 && rating <= 5) { goal.rating = rating; s.goalsRated = c.goals.filter(g => g.rating !== null).length;
          if (s.goalsRated === c.goals.length) { const weighted = c.goals.reduce((sum, g) => sum + (g.rating ?? 0) * g.weight, 0); const totalWeight = c.goals.reduce((sum, g) => sum + g.weight, 0); s.overallRating = totalWeight > 0 ? weighted / totalWeight : 0; ctx.emit?.('review:all_goals_rated', { overall: s.overallRating }); }
        }
      }
      if (e.type === 'review:submit') { s.status = 'complete'; ctx.emit?.('review:submitted', { rating: s.overallRating }); }
    },
  };
}
