/** @employee Trait — Employee record. @trait employee */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type EmploymentStatus = 'active' | 'on_leave' | 'terminated' | 'probation' | 'contractor';
export interface EmployeeConfig { employeeId: string; name: string; department: string; title: string; status: EmploymentStatus; hireDate: string; managerId?: string; }

const defaultConfig: EmployeeConfig = { employeeId: '', name: '', department: '', title: '', status: 'active', hireDate: '' };

export function createEmployeeHandler(): TraitHandler<EmployeeConfig> {
  return { name: 'employee', defaultConfig,
    onAttach(n: HSPlusNode, c: EmployeeConfig, ctx: TraitContext) { n.__empState = { ...c, tenureDays: 0 }; ctx.emit?.('employee:onboarded', { id: c.employeeId, department: c.department }); },
    onDetach(n: HSPlusNode, _c: EmployeeConfig, ctx: TraitContext) { delete n.__empState; ctx.emit?.('employee:offboarded'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, _c: EmployeeConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__empState as Record<string, unknown> | undefined; if (!s) return;
      if (e.type === 'employee:promote') { s.title = e.payload?.newTitle; s.department = e.payload?.newDepartment ?? s.department; ctx.emit?.('employee:promoted', { title: s.title }); }
      if (e.type === 'employee:terminate') { s.status = 'terminated'; ctx.emit?.('employee:terminated', { id: s.employeeId }); }
    },
  };
}
