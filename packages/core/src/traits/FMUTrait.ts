import { createHash } from 'crypto';
import type { TraitContext, TraitEvent, TraitHandler } from './TraitTypes';
import type { HSPlusNode, VRTraitName } from '../types/HoloScriptPlus';

export type FMUMode = 'co-simulation' | 'model-exchange' | 'both';
export type FMUCausality = 'input' | 'output' | 'parameter' | 'local' | 'independent';
export type FMUScalarType = 'Real' | 'Integer' | 'Boolean' | 'String';

export interface FMUPort {
  name: string;
  type?: FMUScalarType;
  causality?: FMUCausality;
  valueReference?: number;
}

export interface FMUConfig {
  source: string;
  modelIdentifier: string;
  fmiVersion: string;
  mode: FMUMode;
  inputs: FMUPort[];
  outputs: FMUPort[];
  parameters: FMUPort[];
  stepSize: number;
}

export interface FMUCouplingReceipt {
  kind: 'cael-fmu-coupling-step';
  modelIdentifier: string;
  step: number;
  stepSize: number;
  inputsHash: string;
  outputsHash: string;
  receiptHash: string;
}

export interface FMUState {
  attached: boolean;
  currentStep: number;
  lastReceipt?: FMUCouplingReceipt;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
}

export const defaultFMUConfig: FMUConfig = {
  source: '',
  modelIdentifier: 'holoscript_fmu',
  fmiVersion: '3.0',
  mode: 'co-simulation',
  inputs: [],
  outputs: [],
  parameters: [],
  stepSize: 0.01,
};

export const fmuHandler: TraitHandler<FMUConfig> = {
  name: 'fmu' as VRTraitName,
  defaultConfig: defaultFMUConfig,

  onAttach(node, config, context) {
    node.__fmuState = {
      attached: true,
      currentStep: 0,
      inputs: {},
      outputs: {},
    } satisfies FMUState;
    context.emit('fmu:attached', {
      node: node.name ?? node.type,
      source: config.source,
      modelIdentifier: config.modelIdentifier,
      fmiVersion: config.fmiVersion,
      mode: config.mode,
    });
  },

  onUpdate(node, config, context, delta) {
    if (config.mode === 'model-exchange') return;
    stepFMU(node, config, context, delta || config.stepSize);
  },

  onEvent(node, config, context, event) {
    const payload = event as TraitEvent & Record<string, unknown>;
    if (payload.type === 'fmu:set_input' && typeof payload.name === 'string') {
      const state = getFMUState(node);
      state.inputs[payload.name] = payload.value;
      return;
    }
    if (payload.type === 'fmu:set_output' && typeof payload.name === 'string') {
      const state = getFMUState(node);
      state.outputs[payload.name] = payload.value;
      return;
    }
    if (payload.type === 'fmu:step') {
      const stepSize = typeof payload.stepSize === 'number' ? payload.stepSize : config.stepSize;
      stepFMU(node, config, context, stepSize);
    }
  },

  onDetach(node, config, context) {
    const state = getFMUState(node);
    state.attached = false;
    context.emit('fmu:detached', {
      node: node.name ?? node.type,
      modelIdentifier: config.modelIdentifier,
      currentStep: state.currentStep,
    });
  },
};

export function getFMUState(node: HSPlusNode): FMUState {
  const existing = node.__fmuState;
  if (isFMUState(existing)) return existing;
  const fresh: FMUState = { attached: false, currentStep: 0, inputs: {}, outputs: {} };
  node.__fmuState = fresh;
  return fresh;
}

export function createFMUCouplingReceipt(
  config: FMUConfig,
  state: FMUState,
  stepSize: number
): FMUCouplingReceipt {
  const inputsHash = hashJson(state.inputs);
  const outputsHash = hashJson(state.outputs);
  const receiptHash = hashJson({
    modelIdentifier: config.modelIdentifier,
    step: state.currentStep,
    stepSize,
    inputsHash,
    outputsHash,
  });
  return {
    kind: 'cael-fmu-coupling-step',
    modelIdentifier: config.modelIdentifier,
    step: state.currentStep,
    stepSize,
    inputsHash,
    outputsHash,
    receiptHash,
  };
}

function stepFMU(
  node: HSPlusNode,
  config: FMUConfig,
  context: TraitContext,
  stepSize: number
): void {
  const state = getFMUState(node);
  state.currentStep += 1;
  const receipt = createFMUCouplingReceipt(config, state, stepSize);
  state.lastReceipt = receipt;
  context.emit('fmu:coupling_step', {
    node: node.name ?? node.type,
    receipt,
    inputs: state.inputs,
    outputs: state.outputs,
  });
}

function isFMUState(value: unknown): value is FMUState {
  return Boolean(value && typeof value === 'object' && 'currentStep' in value && 'inputs' in value);
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
