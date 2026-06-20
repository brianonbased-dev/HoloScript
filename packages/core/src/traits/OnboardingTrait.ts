/**
 * Onboarding Trait
 *
 * Declares a welcome / how-to-use screen as DATA (F.126) — the copy and the per-context aiming tips
 * are data the compiler renders, not hand-written UI. Consumed by compile targets; the Quest target
 * emits these strings into the @generated ScannerContent the Compose panel reads.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface OnboardingHowTo {
  context: string;
  icon: string;
  text: string;
}

export interface OnboardingConfig {
  title: string;
  tagline: string;
  /** Per-scenario how-to-use rows (the real scan blocker is aiming). */
  how_to_use: OnboardingHowTo[];
  aim_tip: string;
  start_action: string;
  tutorial_action: string;
}

// =============================================================================
// HANDLER
// =============================================================================

export const onboardingHandler: TraitHandler<OnboardingConfig> = {
  name: 'onboarding',

  defaultConfig: {
    title: 'Universal QR Scanner',
    tagline: 'Read any QR code — right in mixed reality',
    how_to_use: [],
    aim_tip: '',
    start_action: 'Start scanning',
    tutorial_action: 'See how it works',
  },

  onAttach(node, _config, context) {
    context.emit?.('onboarding:show', { node: node.id });
  },
};

export default onboardingHandler;
