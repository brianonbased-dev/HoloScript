export { createEmployeeHandler, type EmployeeConfig, type EmploymentStatus } from './traits/EmployeeTrait';
export { createPayrollHandler, type PayrollConfig, type PayFrequency } from './traits/PayrollTrait';
export { createOnboardingHandler, type OnboardingConfig, type OnboardingStep } from './traits/OnboardingTrait';
export { createPerformanceReviewHandler, type PerformanceReviewConfig, type ReviewGoal, type Rating } from './traits/PerformanceReviewTrait';
export * from './traits/types';

import { createEmployeeHandler } from './traits/EmployeeTrait';
import { createPayrollHandler } from './traits/PayrollTrait';
import { createOnboardingHandler } from './traits/OnboardingTrait';
import { createPerformanceReviewHandler } from './traits/PerformanceReviewTrait';

export * from './workforce';

// Runtime integration — behavioral trait handler + registrar that wire the
// deterministic pay-equity analytic solver into HoloScriptRuntime's dispatch.
// Closes the built-but-dead-wired gap for `pay_equity`, mirroring
// government-civic's `civic_decision` reference integration.
export {
  HR_WORKFORCE_PLUGIN_ID,
  payEquityHandler,
  registerHrWorkforceTraitHandlers,
  type PayEquityTraitConfig,
  type PayEquitySolvedEvent,
  type RuntimeTraitHandler,
  type TraitRegistrar,
} from './runtime';

export const pluginMeta = { name: '@holoscript/plugin-hr-workforce', version: '1.0.0', traits: ['employee', 'payroll', 'onboarding', 'performance_review', 'pay_equity', 'merit_budget', 'workforce_forecast', 'attrition_risk', 'headcount_plan'] };
export const traitHandlers = [createEmployeeHandler(), createPayrollHandler(), createOnboardingHandler(), createPerformanceReviewHandler()];
