/**
 * BatchJobTrait — v5.1
 * Batch processing job runner.
 */
import type { TraitHandler } from './TraitTypes';
export interface BatchJobConfig {
  max_concurrent: number;
}
export const batchJobHandler: TraitHandler<BatchJobConfig> = {
  name: 'batch_job',
  defaultConfig: { max_concurrent: 5 },
  onAttach(node: any): void {
    node.__batchState = { jobs: new Map<string, { status: string; progress: number }>() };
  },
  onDetach(node: any): void {
    delete node.__batchState;
  },
  onUpdate(): void {},
  onEvent(node: any, _config: BatchJobConfig, context: any, event: any): void {
    const state = node.__batchState as { jobs: Map<string, any> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'batch:submit':
        state.jobs.set(event.jobId as string, { status: 'queued', progress: 0 });
        context.emit?.('batch:queued', { jobId: event.jobId });
        break;
      case 'batch:progress': {
        const j = state.jobs.get(event.jobId as string);
        if (j) {
          j.status = 'running';
          j.progress = (event.progress as number) ?? 0;
        }
        context.emit?.('batch:progress', { jobId: event.jobId, progress: j?.progress });
        break;
      }
      case 'batch:complete': {
        const j = state.jobs.get(event.jobId as string);
        if (j) j.status = 'completed';
        context.emit?.('batch:completed', { jobId: event.jobId });
        break;
      }
    }
  },
};
export default batchJobHandler;
