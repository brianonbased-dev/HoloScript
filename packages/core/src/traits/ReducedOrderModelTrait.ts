/**
 * ReducedOrderModelTrait
 *
 * Runtime surface for deployed ROM/digital-twin surrogate models. The trait
 * keeps CAEL provenance and validation bounds adjacent to the fast step path.
 */
import type { TraitEvent, TraitHandler } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

export interface ReducedOrderModelCoefficient {
  intercept: number;
  weights: Record<string, number>;
}

export interface ReducedOrderModelConfig {
  model_id: string;
  input_names: string[];
  output_names: string[];
  coefficients: Record<string, ReducedOrderModelCoefficient>;
  error_bounds: Record<string, number>;
  training_trace_hashes: string[];
  cael_receipt_hash: string;
  deployment_target: 'browser' | 'edge' | 'wasm-edge' | 'node';
}

interface ReducedOrderModelState {
  modelId: string;
  ready: boolean;
  lastInputs: Record<string, number> | null;
  lastOutputs: Record<string, number> | null;
  stepCount: number;
}

const DEFAULT_CONFIG: ReducedOrderModelConfig = {
  model_id: '',
  input_names: [],
  output_names: [],
  coefficients: {},
  error_bounds: {},
  training_trace_hashes: [],
  cael_receipt_hash: '',
  deployment_target: 'browser',
};

export const reducedOrderModelHandler: TraitHandler<ReducedOrderModelConfig> = {
  name: 'reduced_order_model',
  defaultConfig: DEFAULT_CONFIG,

  onAttach(node, config, context) {
    const state: ReducedOrderModelState = {
      modelId: config.model_id,
      ready: isModelConfigReady(config),
      lastInputs: null,
      lastOutputs: null,
      stepCount: 0,
    };
    (node as unknown as Record<string, unknown>).__reducedOrderModelState = state;

    context.emit?.('rom_model_attached', {
      node,
      modelId: config.model_id,
      ready: state.ready,
      inputNames: config.input_names,
      outputNames: config.output_names,
      errorBounds: config.error_bounds,
      caelReceiptHash: config.cael_receipt_hash,
    });
  },

  onDetach(node, _config, context) {
    const state = getState(node);
    if (state) {
      context.emit?.('rom_model_detached', {
        node,
        modelId: state.modelId,
        stepCount: state.stepCount,
      });
    }
    delete (node as unknown as Record<string, unknown>).__reducedOrderModelState;
  },

  onEvent(node, config, context, event) {
    const state = getState(node);
    if (!state) return;

    if (event.type === 'rom_step' || event.type === 'rom:step') {
      if (!state.ready) {
        context.emit?.('rom_error', { node, modelId: config.model_id, error: 'model_not_ready' });
        return;
      }

      const inputs = numericRecord(recordFromEvent(event, 'inputs'));
      const outputs = stepReducedOrderModel(config, inputs);
      state.lastInputs = inputs;
      state.lastOutputs = outputs;
      state.stepCount += 1;

      context.emit?.('rom_output', {
        node,
        modelId: config.model_id,
        inputs,
        outputs,
        stepCount: state.stepCount,
        errorBounds: config.error_bounds,
        caelReceiptHash: config.cael_receipt_hash,
      });
    }

    if (event.type === 'rom_query' || event.type === 'rom:query') {
      context.emit?.('rom_info', {
        node,
        modelId: config.model_id,
        ready: state.ready,
        stepCount: state.stepCount,
        lastInputs: state.lastInputs,
        lastOutputs: state.lastOutputs,
        trainingTraceHashes: config.training_trace_hashes,
        errorBounds: config.error_bounds,
        deploymentTarget: config.deployment_target,
      });
    }

    if (event.type === 'rom_validate' || event.type === 'rom:validate') {
      const actual = numericRecord(recordFromEvent(event, 'actualOutputs'));
      const predicted = state.lastOutputs ?? {};
      const errors = Object.fromEntries(
        config.output_names.map((name) => [
          name,
          Math.abs((predicted[name] ?? 0) - (actual[name] ?? 0)),
        ])
      );
      const passed = config.output_names.every((name) => {
        const bound = config.error_bounds[name] ?? Number.POSITIVE_INFINITY;
        return (errors[name] ?? Number.POSITIVE_INFINITY) <= bound;
      });

      context.emit?.('rom_validation_result', {
        node,
        modelId: config.model_id,
        passed,
        errors,
        errorBounds: config.error_bounds,
        caelReceiptHash: config.cael_receipt_hash,
      });
    }
  },
};

export function stepReducedOrderModel(
  config: ReducedOrderModelConfig,
  inputs: Record<string, number>
): Record<string, number> {
  const outputs: Record<string, number> = {};
  for (const outputName of config.output_names) {
    const coefficient = config.coefficients[outputName];
    if (!coefficient) {
      outputs[outputName] = Number.NaN;
      continue;
    }

    let value = coefficient.intercept;
    for (const inputName of config.input_names) {
      value += (coefficient.weights[inputName] ?? 0) * (inputs[inputName] ?? 0);
    }
    outputs[outputName] = value;
  }
  return outputs;
}

function isModelConfigReady(config: ReducedOrderModelConfig): boolean {
  return (
    config.model_id.length > 0 &&
    config.input_names.length > 0 &&
    config.output_names.length > 0 &&
    config.output_names.every((name) => Boolean(config.coefficients[name]))
  );
}

function getState(node: HSPlusNode): ReducedOrderModelState | null {
  const value = (node as unknown as Record<string, unknown>).__reducedOrderModelState;
  return value && typeof value === 'object' ? (value as ReducedOrderModelState) : null;
}

function recordFromEvent(event: TraitEvent, key: string): Record<string, unknown> {
  const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
  const fromPayload = (payload as Record<string, unknown>)[key];
  if (fromPayload && typeof fromPayload === 'object' && !Array.isArray(fromPayload)) {
    return fromPayload as Record<string, unknown>;
  }
  const direct = event[key];
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }
  return {};
}

function numericRecord(record: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(record)) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) out[key] = numeric;
  }
  return out;
}

export default reducedOrderModelHandler;
