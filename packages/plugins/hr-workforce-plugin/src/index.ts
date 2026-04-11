export { createEmployeeHandler, type EmployeeConfig, type EmploymentStatus } from './traits/EmployeeTrait';
export { createPayrollHandler, type PayrollConfig, type PayFrequency } from './traits/PayrollTrait';
export { createOnboardingHandler, type OnboardingConfig, type OnboardingStep } from './traits/OnboardingTrait';
export { createPerformanceReviewHandler, type PerformanceReviewConfig, type ReviewGoal, type Rating } from './traits/PerformanceReviewTrait';
export * from './traits/types';

import { createEmployeeHandler } from './traits/EmployeeTrait';
import { createPayrollHandler } from './traits/PayrollTrait';
import { createOnboardingHandler } from './traits/OnboardingTrait';
import { createPerformanceReviewHandler } from './traits/PerformanceReviewTrait';

export const pluginMeta = { name: '@holoscript/plugin-hr-workforce', version: '1.0.0', traits: ['employee', 'payroll', 'onboarding', 'performance_review'] };
export const traitHandlers = [createEmployeeHandler(), createPayrollHandler(), createOnboardingHandler(), createPerformanceReviewHandler()];
