/**
 * Tutorial Trait
 *
 * Declares a guided demo (with a mock QR) as DATA (F.126) so the user sees the flow before real
 * scanning. Consumed by compile targets; the Quest target emits the heading / demo URL / steps into
 * the @generated ScannerContent the Compose panel animates.
 *
 * NOTE: the 'tutorial' trait NAME already exists as a catalog constant (constants/education-learning);
 * this file adds the missing HANDLER only — it does not re-declare the constant.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface TutorialMockQr {
  demo_url: string;
  caption: string;
  display_dp: number;
}

export interface TutorialResultPreview {
  label: string;
  sample: string;
  open_action: string;
}

export interface TutorialConfig {
  heading: string;
  /** On-device-generated mock QR shown in the demo. */
  mock_qr: TutorialMockQr;
  /** Ordered demo steps. */
  steps: string[];
  /** Preview of what a successful read looks like. */
  result_preview: TutorialResultPreview;
  start_action: string;
}

// =============================================================================
// HANDLER
// =============================================================================

export const tutorialHandler: TraitHandler<TutorialConfig> = {
  name: 'tutorial',

  defaultConfig: {
    heading: 'How it works',
    mock_qr: { demo_url: 'https://holoscript.studio', caption: 'A QR code looks like this', display_dp: 180 },
    steps: [],
    result_preview: { label: 'QR found', sample: 'https://holoscript.studio', open_action: 'Open in browser' },
    start_action: 'Start scanning',
  },

  onAttach(node, _config, context) {
    context.emit?.('tutorial:show', { node: node.id });
  },
};

export default tutorialHandler;
