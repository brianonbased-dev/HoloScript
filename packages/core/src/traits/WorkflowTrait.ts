/**
 * WorkflowTrait — v5.1
 * Multi-step workflow orchestration with step tracking.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface WorkflowConfig {
  max_steps: number;
}

export const workflowHandler: TraitHandler<WorkflowConfig> = {
  name: 'workflow',
  defaultConfig: { max_steps: 50 },
  onAttach(node: HSPlusNode): void {
    node.__wfState = {
      workflows: new Map<string, { steps: string[]; current: number; status: string }>(),
    };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__wfState;
  },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, _config: WorkflowConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__wfState as { workflows: Map<string, any> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'workflow:create':
        state.workflows.set(event.workflowId as string, {
          steps: event.steps ?? [],
          current: 0,
          status: 'pending',
        });
        context.emit?.('workflow:created', { workflowId: event.workflowId });
        break;
      case 'workflow:advance': {
        const wf = state.workflows.get(event.workflowId as string);
        if (wf && wf.current < wf.steps.length - 1) {
          wf.current++;
          wf.status = 'in_progress';
        } else if (wf) {
          wf.status = 'completed';
        }
        context.emit?.('workflow:advanced', {
          workflowId: event.workflowId,
          step: wf?.current,
          status: wf?.status,
        });
        break;
      }
    }
  },
};
export default workflowHandler;
