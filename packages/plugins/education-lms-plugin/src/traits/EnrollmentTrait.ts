/** @enrollment Trait — Student enrollment tracking. @trait enrollment */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type EnrollmentStatus = 'enrolled' | 'completed' | 'dropped' | 'waitlisted' | 'suspended';
export interface EnrollmentConfig { studentId: string; courseId: string; status: EnrollmentStatus; enrolledDate: string; progressPercent: number; }

const defaultConfig: EnrollmentConfig = { studentId: '', courseId: '', status: 'enrolled', enrolledDate: '', progressPercent: 0 };

export function createEnrollmentHandler(): TraitHandler<EnrollmentConfig> {
  return {
    name: 'enrollment', defaultConfig,
    onAttach(node: HSPlusNode, config: EnrollmentConfig, ctx: TraitContext) { node.__enrollState = { ...config }; ctx.emit?.('enrollment:created', { studentId: config.studentId, courseId: config.courseId }); },
    onDetach(node: HSPlusNode, _c: EnrollmentConfig, ctx: TraitContext) { delete node.__enrollState; ctx.emit?.('enrollment:removed'); },
    onUpdate() {},
    onEvent(node: HSPlusNode, _c: EnrollmentConfig, ctx: TraitContext, event: TraitEvent) {
      const s = node.__enrollState as EnrollmentConfig | undefined; if (!s) return;
      if (event.type === 'enrollment:update_progress') { s.progressPercent = event.payload?.progress as number; ctx.emit?.('enrollment:progress', { progress: s.progressPercent }); }
      if (event.type === 'enrollment:complete') { s.status = 'completed'; s.progressPercent = 100; ctx.emit?.('enrollment:completed'); }
      if (event.type === 'enrollment:drop') { s.status = 'dropped'; ctx.emit?.('enrollment:dropped'); }
    },
  };
}
