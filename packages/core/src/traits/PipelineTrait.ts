/**
 * PipelineTrait — v5.1
 *
 * Sequential or parallel step orchestration for HoloScript compositions.
 * Each step emits an action event and waits for completion. Steps can be
 * actions, conditions, or transforms.
 *
 * Events:
 *  pipeline:start          { pipelineId, stepCount, mode }
 *  pipeline:step_start     { pipelineId, stepIndex, stepName }
 *  pipeline:step_complete  { pipelineId, stepIndex, stepName, result }
 *  pipeline:step_error     { pipelineId, stepIndex, stepName, error }
 *  pipeline:complete       { pipelineId, results, elapsed }
 *  pipeline:error          { pipelineId, stepIndex, error }
 *  pipeline:run            (command) Start the pipeline
 *  pipeline:step_result    (inbound) Deliver a step result
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
import { extractPayload } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface PipelineStep {
  name: string;
  type: 'action' | 'condition' | 'transform';
  /** Action name to emit for this step */
  action: string;
  /** Parameters to pass with the action */
  params: Record<string, unknown>;
  /** Timeout per step in ms (0 = no timeout) */
  timeout_ms: number;
}

export interface PipelineConfig {
  /** Pipeline identifier */
  pipeline_id: string;
  /** Ordered list of steps */
  steps: PipelineStep[];
  /** Execution mode */
  mode: 'sequential' | 'parallel';
  /** Stop pipeline on first error */
  halt_on_error: boolean;
  /** Auto-start on attach */
  auto_start: boolean;
}

export interface PipelineState {
  running: boolean;
  currentStep: number;
  results: Array<{ stepName: string; result: unknown; error: string | null }>;
  startedAt: number;
  pendingSteps: Set<number>;
  completed: boolean;
}

// =============================================================================
// HANDLER
// =============================================================================

export const pipelineHandler: TraitHandler<PipelineConfig> = {
  name: 'pipeline',

  defaultConfig: {
    pipeline_id: 'default',
    steps: [],
    mode: 'sequential',
    halt_on_error: true,
    auto_start: false,
  },

  onAttach(node: HSPlusNode, config: PipelineConfig, context: TraitContext): void {
    const state: PipelineState = {
      running: false,
      currentStep: 0,
      results: [],
      startedAt: 0,
      pendingSteps: new Set(),
      completed: false,
    };
    node.__pipelineState = state;

    if (config.auto_start && config.steps.length > 0) {
      startPipeline(node, config, context);
    }
  },

  onDetach(node: HSPlusNode, _config: PipelineConfig, _context: TraitContext): void {
    delete node.__pipelineState;
  },

  onUpdate(_node: HSPlusNode, _config: PipelineConfig, _context: TraitContext, _delta: number): void {
    // Pipeline is event-driven, no per-frame work
  },

  onEvent(node: HSPlusNode, config: PipelineConfig, context: TraitContext, event: TraitEvent): void {
    const state: PipelineState | undefined = node.__pipelineState;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;
    const payload = extractPayload(event);

    switch (eventType) {
      case 'pipeline:run': {
        if (!state.running) {
          startPipeline(node, config, context);
        }
        break;
      }

      case 'pipeline:step_result': {
        const stepIndex = payload.stepIndex as number;
        const result = payload.result;
        const error = payload.error as string | null;

        if (state.results[stepIndex]) break; // Already received

        state.results[stepIndex] = {
          stepName: config.steps[stepIndex]?.name ?? `step_${stepIndex}`,
          result,
          error,
        };

        context.emit?.('pipeline:step_complete', {
          pipelineId: config.pipeline_id,
          stepIndex,
          stepName: config.steps[stepIndex]?.name,
          result,
        });

        if (error && config.halt_on_error) {
          state.running = false;
          context.emit?.('pipeline:error', {
            pipelineId: config.pipeline_id,
            stepIndex,
            error,
          });
          return;
        }

        state.pendingSteps.delete(stepIndex);

        if (config.mode === 'sequential') {
          // Advance to next step
          state.currentStep = stepIndex + 1;
          if (state.currentStep < config.steps.length) {
            emitStep(state.currentStep, config, context);
          } else {
            finishPipeline(state, config, context);
          }
        } else {
          // Parallel: check if all done
          if (state.pendingSteps.size === 0) {
            finishPipeline(state, config, context);
          }
        }
        break;
      }

      case 'pipeline:reset': {
        state.running = false;
        state.currentStep = 0;
        state.results = [];
        state.pendingSteps.clear();
        state.completed = false;
        break;
      }
    }
  },
};

function startPipeline(node: HSPlusNode, config: PipelineConfig, context: TraitContext): void {
  const state: PipelineState = node.__pipelineState;
  state.running = true;
  state.currentStep = 0;
  state.results = new Array(config.steps.length).fill(null);
  state.pendingSteps.clear();
  state.startedAt = Date.now();
  state.completed = false;

  context.emit?.('pipeline:start', {
    pipelineId: config.pipeline_id,
    stepCount: config.steps.length,
    mode: config.mode,
  });

  if (config.mode === 'sequential') {
    if (config.steps.length > 0) {
      emitStep(0, config, context);
    } else {
      finishPipeline(state, config, context);
    }
  } else {
    // Parallel: emit all steps at once
    for (let i = 0; i < config.steps.length; i++) {
      state.pendingSteps.add(i);
      emitStep(i, config, context);
    }
    if (config.steps.length === 0) {
      finishPipeline(state, config, context);
    }
  }
}

function emitStep(index: number, config: PipelineConfig, context: TraitContext): void {
  const step = config.steps[index];
  context.emit?.('pipeline:step_start', {
    pipelineId: config.pipeline_id,
    stepIndex: index,
    stepName: step.name,
  });
  context.emit?.(step.action, {
    ...step.params,
    __pipelineStepIndex: index,
    __pipelineId: config.pipeline_id,
  });
}

function finishPipeline(state: PipelineState, config: PipelineConfig, context: TraitContext): void {
  state.running = false;
  state.completed = true;
  context.emit?.('pipeline:complete', {
    pipelineId: config.pipeline_id,
    results: state.results,
    elapsed: Date.now() - state.startedAt,
  });
}

export default pipelineHandler;
