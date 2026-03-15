/**
 * Workflow / BPM Traits
 *
 * Business process management and workflow orchestration primitives.
 *
 * @version 1.0.0
 */
export const WORKFLOW_BPM_TRAITS = [
  'workflow',           // Multi-step workflow orchestration
  'approval',           // Human-in-the-loop approval gate
  'state_machine',      // Finite state machine with transitions
  'form_builder',       // Dynamic form schema and rendering
] as const;

export type WorkflowBPMTraitName = (typeof WORKFLOW_BPM_TRAITS)[number];
