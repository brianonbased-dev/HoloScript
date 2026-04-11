/** @onboarding Trait — New hire onboarding workflow. @trait onboarding */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface OnboardingStep { id: string; name: string; required: boolean; completedAt: number | null; assignee: string; }
export interface OnboardingConfig { employeeId: string; steps: OnboardingStep[]; targetCompletionDays: number; buddy?: string; }
export interface OnboardingState { completedSteps: number; totalSteps: number; percentComplete: number; isComplete: boolean; startDate: number; }

const defaultConfig: OnboardingConfig = { employeeId: '', steps: [], targetCompletionDays: 30 };

export function createOnboardingHandler(): TraitHandler<OnboardingConfig> {
  return { name: 'onboarding', defaultConfig,
    onAttach(n: HSPlusNode, c: OnboardingConfig, ctx: TraitContext) { n.__onboardState = { completedSteps: 0, totalSteps: c.steps.length, percentComplete: 0, isComplete: false, startDate: Date.now() }; ctx.emit?.('onboarding:started', { steps: c.steps.length }); },
    onDetach(n: HSPlusNode, _c: OnboardingConfig, ctx: TraitContext) { delete n.__onboardState; ctx.emit?.('onboarding:cancelled'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: OnboardingConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__onboardState as OnboardingState | undefined; if (!s) return;
      if (e.type === 'onboarding:complete_step') {
        const stepId = e.payload?.stepId as string;
        const step = c.steps.find(st => st.id === stepId);
        if (step && !step.completedAt) { step.completedAt = Date.now(); s.completedSteps++; s.percentComplete = (s.completedSteps / s.totalSteps) * 100;
          if (s.completedSteps === s.totalSteps) { s.isComplete = true; ctx.emit?.('onboarding:completed'); }
          else ctx.emit?.('onboarding:step_done', { step: step.name, progress: s.percentComplete });
        }
      }
    },
  };
}
