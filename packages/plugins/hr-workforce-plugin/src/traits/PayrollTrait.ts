/** @payroll Trait — Payroll processing. @trait payroll */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
export interface PayrollConfig { employeeId: string; baseSalary: number; currency: string; frequency: PayFrequency; taxRate: number; benefits: { type: string; amount: number }[]; }
export interface PayrollState { grossPay: number; netPay: number; taxWithheld: number; benefitsDeducted: number; ytdGross: number; }

const defaultConfig: PayrollConfig = { employeeId: '', baseSalary: 0, currency: 'USD', frequency: 'biweekly', taxRate: 0.25, benefits: [] };

export function createPayrollHandler(): TraitHandler<PayrollConfig> {
  return { name: 'payroll', defaultConfig,
    onAttach(n: HSPlusNode, c: PayrollConfig, ctx: TraitContext) {
      const periods = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
      const gross = c.baseSalary / periods[c.frequency];
      const benefits = c.benefits.reduce((s, b) => s + b.amount, 0);
      const tax = gross * c.taxRate;
      n.__payrollState = { grossPay: gross, netPay: gross - tax - benefits, taxWithheld: tax, benefitsDeducted: benefits, ytdGross: 0 };
      ctx.emit?.('payroll:configured', { frequency: c.frequency, grossPerPeriod: gross });
    },
    onDetach(n: HSPlusNode, _c: PayrollConfig, ctx: TraitContext) { delete n.__payrollState; ctx.emit?.('payroll:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, _c: PayrollConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__payrollState as PayrollState | undefined; if (!s) return;
      if (e.type === 'payroll:process') { s.ytdGross += s.grossPay; ctx.emit?.('payroll:processed', { net: s.netPay, ytdGross: s.ytdGross }); }
    },
  };
}
