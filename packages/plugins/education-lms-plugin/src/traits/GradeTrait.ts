/** @grade Trait — Grade and scoring. @trait grade */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type GradingScale = 'letter' | 'percentage' | 'pass_fail' | 'points' | 'gpa';
export interface GradeConfig { score: number; maxScore: number; weight: number; gradingScale: GradingScale; rubric?: string; }

const defaultConfig: GradeConfig = { score: 0, maxScore: 100, weight: 1, gradingScale: 'percentage' };

export function createGradeHandler(): TraitHandler<GradeConfig> {
  return {
    name: 'grade', defaultConfig,
    onAttach(node: HSPlusNode, config: GradeConfig, ctx: TraitContext) { node.__gradeState = { ...config, letterGrade: computeLetter(config.score, config.maxScore) }; ctx.emit?.('grade:assigned'); },
    onDetach(node: HSPlusNode, _c: GradeConfig, ctx: TraitContext) { delete node.__gradeState; ctx.emit?.('grade:removed'); },
    onUpdate() {},
    onEvent(node: HSPlusNode, _c: GradeConfig, ctx: TraitContext, event: TraitEvent) {
      const s = node.__gradeState as Record<string, unknown> | undefined; if (!s) return;
      if (event.type === 'grade:update') { s.score = event.payload?.score as number; s.letterGrade = computeLetter(s.score as number, s.maxScore as number); ctx.emit?.('grade:updated', { score: s.score }); }
    },
  };
}

function computeLetter(score: number, max: number): string {
  const pct = max > 0 ? (score / max) * 100 : 0;
  if (pct >= 93) return 'A'; if (pct >= 90) return 'A-'; if (pct >= 87) return 'B+'; if (pct >= 83) return 'B';
  if (pct >= 80) return 'B-'; if (pct >= 77) return 'C+'; if (pct >= 73) return 'C'; if (pct >= 70) return 'C-';
  if (pct >= 60) return 'D'; return 'F';
}
