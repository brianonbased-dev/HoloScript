/** @lesson Trait — Lesson content unit. @trait lesson */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type ContentType = 'video' | 'text' | 'interactive' | 'quiz' | 'assignment' | 'discussion';
export interface LessonConfig { title: string; contentType: ContentType; durationMinutes: number; order: number; completionCriteria: 'view' | 'score' | 'submit'; passingScore?: number; }

const defaultConfig: LessonConfig = { title: '', contentType: 'text', durationMinutes: 15, order: 0, completionCriteria: 'view' };

export function createLessonHandler(): TraitHandler<LessonConfig> {
  return {
    name: 'lesson', defaultConfig,
    onAttach(node: HSPlusNode, config: LessonConfig, ctx: TraitContext) { node.__lessonState = { isComplete: false, timeSpentMs: 0, score: null }; ctx.emit?.('lesson:attached', { title: config.title }); },
    onDetach(node: HSPlusNode, _c: LessonConfig, ctx: TraitContext) { delete node.__lessonState; ctx.emit?.('lesson:detached'); },
    onUpdate(node: HSPlusNode, _c: LessonConfig, _ctx: TraitContext, delta: number) { const s = node.__lessonState as Record<string, unknown> | undefined; if (s) s.timeSpentMs = ((s.timeSpentMs as number) || 0) + delta; },
    onEvent(node: HSPlusNode, config: LessonConfig, ctx: TraitContext, event: TraitEvent) {
      const s = node.__lessonState as Record<string, unknown> | undefined; if (!s) return;
      if (event.type === 'lesson:complete') { s.isComplete = true; ctx.emit?.('lesson:completed', { title: config.title, timeSpent: s.timeSpentMs }); }
    },
  };
}
