/**
 * NeuralLinkTrait - Connects HoloScript+ agents to neural model weights
 *
 * Enables the @trait(neural_link) directive to link agent execution
 * to local GGUF models (e.g., Brittney v4).
 *
 * Usage in HS+:
 * @trait(neural_link, model="brittney-v4.gguf", temperature=0.7)
 */

import { logger } from '../../utils/logger';
// import { getHoloScriptExecutor } from '@/services/master-portal/training/HoloScriptExecutor';
import type { Vector3 } from '@holoscript/core';

export interface NeuralLinkConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  sync?: 'local' | 'mesh';
  personality_anchor?: string;
}

export const neuralLinkTrait = {
  name: 'neural_link',
  defaultConfig: {
    model: 'brittney-v4.gguf',
    temperature: 0.7,
    sync: 'local',
  } as NeuralLinkConfig,

  onAttach(node: any, config: NeuralLinkConfig, context: any) {
    logger.info(`[NeuralLink] Attached to ${node.id || 'node'} link -> ${config.model}`);

    // Initialize state on the node
    context.setState({
      neural_status: 'connected',
      active_model: config.model,
      last_inference_time: 0,
    });

    // Register a custom event for triggering inference
    context.emit('neural_link_ready', { nodeId: node.id, model: config.model });
  },

  onUpdate(node: any, config: NeuralLinkConfig, context: any, delta: number) {
    // Optional: could handle background model heartbeats or lo-fi "thinking" animations
  },

  onDetach(node: any, config: NeuralLinkConfig, context: any) {
    logger.info(`[NeuralLink] Detached from ${node.id || 'node'}`);
    context.setState({ neural_status: 'disconnected' });
  },
};

/**
 * Extension for the HoloScript Executor to handle neural link events
 */
export function registerNeuralLinkHandlers(runtime: any) {
  runtime.on('neural_link_execute', async (payload: { nodeId: string; prompt: string }) => {
    const { getHoloScriptExecutor } =
      await import('../../services/master-portal/training/HoloScriptExecutor');
    const executor = getHoloScriptExecutor();
    const state = runtime.getState();

    // Find model config from state or node metadata
    const model = state.active_model || 'brittney-v3';

    logger.info(`[NeuralLink] Executing inference for ${payload.nodeId} on ${model}`);

    try {
      // Direct integration with the GGUF executor
      // In a real implementation, this would call into the training pipeline's local inference
      const result = await (executor as any).executeWithLocalInference(
        'neural-session',
        payload.prompt
      );

      // Update agent state with the result
      runtime.setState({
        last_response: result.inferenceResult.text,
        last_inference_time: result.inferenceResult.generationTime,
        neural_status: 'idle',
      });

      // Emit feedback loop for HoloScript+ callbacks
      runtime.triggerSignal('on_neural_response', {
        nodeId: payload.nodeId,
        text: result.inferenceResult.text,
      });
    } catch (e) {
      logger.error(`[NeuralLink] Inference failed`, e);
      runtime.setState({ neural_status: 'error' });
    }
  });
}
