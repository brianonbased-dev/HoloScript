/**
 * CareEthicsTrait
 *
 * Runtime trait bridge for the CareField substrate. It attaches an autonomy
 * guard to agents/NPCs and emits CAEL-compatible care receipts for decisions.
 */

import {
  createCareField,
  evaluateAutonomyGuard,
  type AutonomyGuardDecision,
  type CareActor,
  type CareConsentState,
  type CareField,
  type CareOptimizationTarget,
  type CareSignal,
} from '../care';
import type { HSPlusNode, TraitContext, TraitEvent, TraitHandler } from './TraitTypes';

export type CareEthicsCAELEventKind = 'care_field_attached' | 'care_signal' | 'care_decision';

export interface CareEthicsCAELEvent {
  version: 'cael.v1';
  event: 'interaction';
  timestamp: number;
  simTime: number;
  payload: {
    type: CareEthicsCAELEventKind;
    nodeId: string;
    fieldId: string;
    policyId: string;
    allowed: boolean;
    goal: string;
    blocked: readonly { code: string; message: string; evidenceRefs?: readonly string[] }[];
    signal?: CareSignal;
    evidenceRefs?: readonly string[];
  };
}

export interface CareEthicsConfig {
  steward?: CareActor;
  counterpart?: CareActor;
  goal: string;
  consent: CareConsentState;
  optimization_targets: readonly CareOptimizationTarget[];
  has_disengage_path: boolean;
  preserves_outside_support: boolean;
  respects_data_boundary: boolean;
  emit_cael: boolean;
  evidence_refs: readonly string[];
}

export interface CareEthicsState {
  field: CareField;
  signals: CareSignal[];
  lastDecision: AutonomyGuardDecision;
  caelEvents: CareEthicsCAELEvent[];
}

export interface CareEthicsTurnInput {
  goal: string;
  consent: CareConsentState;
  optimizationTargets?: readonly CareOptimizationTarget[];
  signals?: readonly CareSignal[];
  hasDisengagePath?: boolean;
  preservesOutsideSupport?: boolean;
  respectsDataBoundary?: boolean;
}

export const CARE_ETHICS_TRAIT = 'care_ethics';

export const careEthicsHandler: TraitHandler<CareEthicsConfig> = {
  name: CARE_ETHICS_TRAIT,

  defaultConfig: {
    goal: 'Preserve human agency while helping the person complete their chosen task.',
    consent: 'unknown',
    optimization_targets: ['human_agency', 'mutual_understanding'],
    has_disengage_path: true,
    preserves_outside_support: true,
    respects_data_boundary: true,
    emit_cael: true,
    evidence_refs: [],
  },

  onAttach(node, config, context) {
    const field = createCareField({
      createdAt: new Date().toISOString(),
      steward: resolveActor(config.steward, {
        id: 'agent:care-steward',
        kind: 'agent',
        displayName: 'Care Steward',
      }),
      counterpart: resolveActor(config.counterpart, {
        id: node.id ?? node.name ?? 'human:participant',
        kind: 'human',
        displayName: node.name,
      }),
      goal: config.goal,
      consent: config.consent,
      autonomy: {
        optimizationTargets: config.optimization_targets,
        hasDisengagePath: config.has_disengage_path,
        preservesOutsideSupport: config.preserves_outside_support,
        respectsDataBoundary: config.respects_data_boundary,
      },
    });

    const state: CareEthicsState = {
      field,
      signals: [],
      lastDecision: field.autonomy,
      caelEvents: [],
    };
    node.__careEthicsState = state;

    context.emit?.('care_ethics_attached', {
      node,
      field,
      decision: field.autonomy,
    });
    emitCareEthicsCAEL(node, config, context, state, 'care_field_attached');
  },

  onDetach(node, _config, context) {
    const state = node.__careEthicsState as CareEthicsState | undefined;
    if (state) {
      context.emit?.('care_ethics_detached', {
        node,
        fieldId: state.field.fieldId,
      });
    }
    delete node.__careEthicsState;
  },

  onEvent(node, config, context, event) {
    const state = node.__careEthicsState as CareEthicsState | undefined;
    if (!state) return;

    if (event.type === 'care_signal') {
      const signal = readCareSignal(event);
      if (!signal) return;
      state.signals.push(signal);
      state.lastDecision = evaluateCareEthicsTurn({
        goal: config.goal,
        consent: config.consent,
        optimizationTargets: config.optimization_targets,
        signals: state.signals,
        hasDisengagePath: config.has_disengage_path,
        preservesOutsideSupport: config.preserves_outside_support,
        respectsDataBoundary: config.respects_data_boundary,
      });
      state.field = { ...state.field, autonomy: state.lastDecision };

      context.emit?.('care_ethics_signal_recorded', {
        node,
        fieldId: state.field.fieldId,
        signal,
        decision: state.lastDecision,
      });
      emitCareEthicsCAEL(node, config, context, state, 'care_signal', signal);
      return;
    }

    if (event.type === 'care_evaluate_action' || event.type === 'npc_turn_intent') {
      const turn = readTurnInput(event, config);
      const decision = evaluateCareEthicsTurn(turn);
      state.lastDecision = decision;
      state.field = { ...state.field, autonomy: decision };

      const eventName = decision.allowed
        ? 'care_ethics_action_allowed'
        : 'care_ethics_action_blocked';
      context.emit?.(eventName, {
        node,
        fieldId: state.field.fieldId,
        sourceEvent: event.type,
        decision,
      });
      emitCareEthicsCAEL(node, config, context, state, 'care_decision');
    }
  },
};

export function evaluateCareEthicsTurn(input: CareEthicsTurnInput): AutonomyGuardDecision {
  return evaluateAutonomyGuard({
    goal: input.goal,
    consent: input.consent,
    optimizationTargets: input.optimizationTargets,
    signals: input.signals,
    hasDisengagePath: input.hasDisengagePath,
    preservesOutsideSupport: input.preservesOutsideSupport,
    respectsDataBoundary: input.respectsDataBoundary,
  });
}

export function getCareEthicsState(node: HSPlusNode): CareEthicsState | undefined {
  return node.__careEthicsState as CareEthicsState | undefined;
}

function resolveActor(actor: CareActor | undefined, fallback: CareActor): CareActor {
  if (!actor?.id) return fallback;
  return actor;
}

function readCareSignal(event: TraitEvent): CareSignal | null {
  const payload = event.payload ?? {};
  if (typeof payload !== 'object' || payload === null) return null;
  const candidate = payload as Partial<CareSignal>;
  if (typeof candidate.kind !== 'string') return null;
  return {
    kind: candidate.kind as CareSignal['kind'],
    weight: candidate.weight,
    note: candidate.note,
    evidenceRefs: candidate.evidenceRefs,
  };
}

function readTurnInput(event: TraitEvent, config: CareEthicsConfig): CareEthicsTurnInput {
  const payload = event.payload ?? {};
  const record =
    typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  return {
    goal: stringValue(record.goal, config.goal),
    consent: careConsentValue(record.consent, config.consent),
    optimizationTargets: readOptimizationTargets(
      record.optimizationTargets,
      config.optimization_targets
    ),
    signals: readSignals(record.signals),
    hasDisengagePath: booleanValue(record.hasDisengagePath, config.has_disengage_path),
    preservesOutsideSupport: booleanValue(
      record.preservesOutsideSupport,
      config.preserves_outside_support
    ),
    respectsDataBoundary: booleanValue(record.respectsDataBoundary, config.respects_data_boundary),
  };
}

function emitCareEthicsCAEL(
  node: HSPlusNode,
  config: CareEthicsConfig,
  context: TraitContext,
  state: CareEthicsState,
  type: CareEthicsCAELEventKind,
  signal?: CareSignal
): void {
  if (!config.emit_cael) return;

  const event: CareEthicsCAELEvent = {
    version: 'cael.v1',
    event: 'interaction',
    timestamp: Date.now(),
    simTime: state.caelEvents.length,
    payload: {
      type,
      nodeId: node.id ?? node.name ?? 'unknown-node',
      fieldId: state.field.fieldId,
      policyId: state.lastDecision.policyId,
      allowed: state.lastDecision.allowed,
      goal: state.lastDecision.goal,
      blocked: state.lastDecision.blocked,
      signal,
      evidenceRefs: config.evidence_refs,
    },
  };

  state.caelEvents.push(event);
  context.emit?.('care_ethics_cael_event', event);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function careConsentValue(value: unknown, fallback: CareConsentState): CareConsentState {
  return value === 'explicit' ||
    value === 'delegated' ||
    value === 'not_required' ||
    value === 'unknown' ||
    value === 'withdrawn'
    ? value
    : fallback;
}

function readOptimizationTargets(
  value: unknown,
  fallback: readonly CareOptimizationTarget[]
): readonly CareOptimizationTarget[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter((target): target is CareOptimizationTarget => typeof target === 'string');
}

function readSignals(value: unknown): readonly CareSignal[] {
  if (!Array.isArray(value)) return [];
  return value.filter((signal): signal is CareSignal => {
    return (
      typeof signal === 'object' &&
      signal !== null &&
      typeof (signal as Partial<CareSignal>).kind === 'string'
    );
  });
}

export default careEthicsHandler;
