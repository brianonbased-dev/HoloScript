/**
 * Studio-local UI primitives (B2 consolidation, splendid-popping-lark).
 *
 * These extend / complement @holoscript/ui with studio-theme-aware components
 * that use studio Tailwind tokens (studio-panel, studio-text, studio-muted,
 * studio-accent, studio-border) and must therefore remain studio-local.
 *
 * @holoscript/ui exports (Modal, TabGroup, etc.) are NOT re-exported here to
 * keep the dependency boundary clear.
 */

export { PanelFrame } from './PanelFrame';
export type { PanelFrameProps } from './PanelFrame';

export { WizardStep } from './WizardStep';
export type { WizardStepProps } from './WizardStep';
