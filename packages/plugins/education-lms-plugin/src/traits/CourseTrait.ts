/** @course Trait — Course definition and management. @trait course */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export interface CourseConfig { title: string; description: string; instructor: string; durationHours: number; difficulty: Difficulty; prerequisites: string[]; modules: string[]; maxEnrollment: number; }
export interface CourseState { enrolledCount: number; completionRate: number; averageScore: number; isPublished: boolean; }

const defaultConfig: CourseConfig = { title: '', description: '', instructor: '', durationHours: 1, difficulty: 'beginner', prerequisites: [], modules: [], maxEnrollment: 100 };

export function createCourseHandler(): TraitHandler<CourseConfig> {
  return {
    name: 'course', defaultConfig,
    onAttach(node: HSPlusNode, config: CourseConfig, ctx: TraitContext) { node.__courseState = { enrolledCount: 0, completionRate: 0, averageScore: 0, isPublished: false }; ctx.emit?.('course:created', { title: config.title }); },
    onDetach(node: HSPlusNode, _c: CourseConfig, ctx: TraitContext) { delete node.__courseState; ctx.emit?.('course:removed'); },
    onUpdate() {},
    onEvent(node: HSPlusNode, _c: CourseConfig, ctx: TraitContext, event: TraitEvent) {
      const s = node.__courseState as CourseState | undefined; if (!s) return;
      if (event.type === 'course:publish') { s.isPublished = true; ctx.emit?.('course:published'); }
      if (event.type === 'course:enroll') { s.enrolledCount++; ctx.emit?.('course:enrollment_updated', { count: s.enrolledCount }); }
    },
  };
}
