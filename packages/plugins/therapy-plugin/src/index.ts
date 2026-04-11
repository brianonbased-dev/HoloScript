export { TherapySessionTrait } from './traits/TherapySessionTrait';
export { HIPAACompliantTrait } from './traits/HIPAACompliantTrait';
export { BrainwaveStateTrait } from './traits/BrainwaveStateTrait';
export type { TraitHandler, TraitContext, TraitEvent, HSPlusNode } from './traits/types';

import type { TraitHandler } from './traits/types';
import { TherapySessionTrait } from './traits/TherapySessionTrait';
import { HIPAACompliantTrait } from './traits/HIPAACompliantTrait';
import { BrainwaveStateTrait } from './traits/BrainwaveStateTrait';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PLUGIN_TRAITS: TraitHandler<any>[] = [
  TherapySessionTrait,
  HIPAACompliantTrait,
  BrainwaveStateTrait,
];

export function registerTherapyPlugin(runtime: {
  registerTrait: (handler: TraitHandler<unknown>) => void;
}): void {
  for (const trait of PLUGIN_TRAITS) {
    runtime.registerTrait(trait);
  }
}

export const TRAIT_KEYWORDS: Record<string, string> = {
  therapy_session: 'Mental health therapy session management with modality tracking',
  hipaa_compliant: 'HIPAA-compliant data handling with audit logging and encryption',
  brainwave_state: 'Real-time brainwave monitoring (alpha/beta/theta + stress index)',
};

export const VERSION = '1.0.0';
