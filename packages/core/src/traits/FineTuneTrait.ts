/**
 * FineTuneTrait — v5.1
 *
 * Fine-tuning job management with status tracking.
 *
 * Events:
 *  finetune:start   { modelId, dataset, hyperparams }
 *  finetune:status  { jobId, status, progress }
 *  finetune:complete { jobId, modelId, metrics }
 */

import type { TraitHandler } from './TraitTypes';

export interface FineTuneConfig {
  max_concurrent: number;
}

export const fineTuneHandler: TraitHandler<FineTuneConfig> = {
  name: 'fine_tune' as any,
  defaultConfig: { max_concurrent: 2 },

  onAttach(node: any): void {
    node.__fineTuneState = { jobs: new Map<string, { modelId: string; status: string; progress: number }>() };
  },
  onDetach(node: any): void { delete node.__fineTuneState; },
  onUpdate(): void {},

  onEvent(node: any, config: FineTuneConfig, context: any, event: any): void {
    const state = node.__fineTuneState as { jobs: Map<string, { modelId: string; status: string; progress: number }> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'finetune:start': {
        if (state.jobs.size >= config.max_concurrent) {
          context.emit?.('finetune:error', { error: 'max_concurrent_exceeded' });
          break;
        }
        const jobId = `ft_${Date.now()}`;
        state.jobs.set(jobId, { modelId: event.modelId as string, status: 'running', progress: 0 });
        context.emit?.('finetune:status', { jobId, modelId: event.modelId, status: 'running', progress: 0 });
        break;
      }
      case 'finetune:get_status': {
        const job = state.jobs.get(event.jobId as string);
        if (job) {
          context.emit?.('finetune:status', { jobId: event.jobId, ...job });
        }
        break;
      }
    }
  },
};

export default fineTuneHandler;
