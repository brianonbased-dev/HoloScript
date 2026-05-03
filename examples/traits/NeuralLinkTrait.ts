/**
 * NeuralLinkTrait - Connects HoloScript+ agents to neural model weights
 *
 * Enables the @trait(neural_link) directive to link agent execution
 * to local GGUF models (e.g., Brittney v4).
 *
 * Runtime behavior (onUpdate):
 *   - Inference timeout: if execute was sent but no response arrived within
 *     inference_timeout_ms, emits neural_link_timeout and resets status.
 *   - Heartbeat keepalive: emits neural_link_heartbeat every
 *     heartbeat_interval_ms while connected.
 *   - Mesh sync pulse: when sync='mesh', emits neural_link_sync every
 *     sync_interval_ms to broadcast state to mesh peers.
 *
 * Usage in HS+:
 * @trait(neural_link, model="brittney-v4.gguf", temperature=0.7)
 */

import { logger } from '../../utils/logger';
// import { getHoloScriptExecutor } from '@/services/master-portal/training/HoloScriptExecutor';
import type { _Vector3 } from '@holoscript/core';

export interface NeuralLinkConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  sync?: 'local' | 'mesh';
  personality_anchor?: string;
  inference_timeout_ms?: number;
  heartbeat_interval_ms?: number;
  sync_interval_ms?: number;
}

export const neuralLinkTrait = {
  name: 'neural_link',
  defaultConfig: {
    model: 'brittney-v4.gguf',
    temperature: 0.7,
    max_tokens: 2048,
    sync: 'local',
    personality_anchor: '',
    inference_timeout_ms: 30_000,
    heartbeat_interval_ms: 5_000,
    sync_interval_ms: 10_000,
  } as NeuralLinkConfig,

  onAttach(node: any, config: NeuralLinkConfig, context: any) {
    logger.info(`[NeuralLink] Attached to ${node.id || 'node'} link -> ${config.model}`);

    // Initialize state on the node
    context.setState({
      neural_status: 'connected',
      active_model: config.model,
      last_inference_time: 0,
      last_response: null,
      inference_start: null,
      heartbeat_elapsed: 0,
      sync_elapsed: 0,
    });

    // Register a custom event for triggering inference
    context.emit('neural_link_ready', { nodeId: node.id, model: config.model });
  },

  onUpdate(node: any, config: NeuralLinkConfig, context: any, delta: number) {
    const state = node.__neuralLinkState;
    if (!state) return;

    // Inference timeout: if execute was sent and no response within timeout, reset
    if (state.neural_status === 'inferring' && state.inference_start !== null) {
      const elapsed = Date.now() - state.inference_start;
      if (elapsed >= (config.inference_timeout_ms ?? 30_000)) {
        context.emit('neural_link_timeout', {
          nodeId: node.id,
          model: config.model,
          elapsedMs: elapsed,
        });
        state.neural_status = 'idle';
        state.inference_start = null;
      }
    }

    // Heartbeat keepalive
    state.heartbeat_elapsed += delta * 1000;
    if (state.heartbeat_elapsed >= (config.heartbeat_interval_ms ?? 5_000)) {
      context.emit('neural_link_heartbeat', {
        nodeId: node.id,
        model: config.model,
        status: state.neural_status,
      });
      state.heartbeat_elapsed = 0;
    }

    // Mesh sync pulse (only when sync='mesh')
    if (config.sync === 'mesh') {
      state.sync_elapsed += delta * 1000;
      if (state.sync_elapsed >= (config.sync_interval_ms ?? 10_000)) {
        context.emit('neural_link_sync', {
          nodeId: node.id,
          model: config.model,
          status: state.neural_status,
          last_inference_time: state.last_inference_time,
        });
        state.sync_elapsed = 0;
      }
    }
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
        inference_start: null,
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