/**
 * InferenceTrait — v5.1
 *
 * Run inference (text, image, structured) against loaded models.
 *
 * Events:
 *  inference:run      { modelId, input, options }
 *  inference:result   { modelId, output, latencyMs }
 *  inference:error    { modelId, error }
 */

import type { TraitHandler } from './TraitTypes';

export interface InferenceConfig {
  timeout_ms: number;
  max_tokens: number;
}

export const inferenceHandler: TraitHandler<InferenceConfig> = {
  name: 'inference',
  defaultConfig: { timeout_ms: 30000, max_tokens: 4096 },

  onAttach(node: any): void {
    node.__inferenceState = { totalRuns: 0, totalTokens: 0 };
  },
  onDetach(node: any): void { delete node.__inferenceState; },
  onUpdate(): void {},

  onEvent(node: any, config: InferenceConfig, context: any, event: any): void {
    const state = node.__inferenceState as { totalRuns: number; totalTokens: number } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 'inference:run') {
      state.totalRuns++;
      context.emit?.('inference:result', {
        modelId: event.modelId,
        output: null, // placeholder — real impl calls model
        latencyMs: 0,
        maxTokens: config.max_tokens,
        runNumber: state.totalRuns,
      });
    }
  },
};

export default inferenceHandler;
