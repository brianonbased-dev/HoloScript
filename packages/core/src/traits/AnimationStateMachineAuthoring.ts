import type {
  HoloAnimationInput,
  HoloAnimationTransitionCondition,
  HoloStateMachine,
  HoloStateTransition,
} from '../parser/HoloCompositionTypes';
import type {
  AnimationConfig,
  AnimationParameter,
  AnimationStateDef,
  AnimationTransition,
  TransitionCondition,
} from './AnimationTypes';

export function animationConfigFromStateMachine(stateMachine: HoloStateMachine): AnimationConfig {
  const states = Object.values(stateMachine.states).map<AnimationStateDef>((state) => ({
    name: state.name,
    clip: state.clip,
    clips: state.clips,
    parameter: state.parameter,
    parameters: state.parameters,
    thresholds: state.thresholds,
    blendType: state.blendType,
  }));

  return {
    states,
    parameters: (stateMachine.inputs ?? []).map(animationInputToParameter),
    transitions: collectAnimationTransitions(stateMachine),
    defaultState: stateMachine.initialState || states[0]?.name,
  };
}

function animationInputToParameter(input: HoloAnimationInput): AnimationParameter {
  const fallback = input.inputType === 'bool' || input.inputType === 'trigger' ? false : 0;
  return {
    name: input.name,
    type: input.inputType,
    value: input.default ?? fallback,
    default: input.default ?? fallback,
  };
}

function collectAnimationTransitions(stateMachine: HoloStateMachine): AnimationTransition[] {
  const transitions: AnimationTransition[] = [];

  for (const transition of stateMachine.transitions ?? []) {
    transitions.push(animationTransitionFromAst(transition));
  }

  for (const [stateName, state] of Object.entries(stateMachine.states)) {
    for (const transition of state.transitions ?? []) {
      transitions.push(animationTransitionFromAst(transition, stateName));
    }
  }

  return transitions;
}

function animationTransitionFromAst(
  transition: HoloStateTransition,
  fallbackFrom?: string
): AnimationTransition {
  const conditions = animationConditionsFromAst(transition.conditions, transition.event);
  return {
    from: transition.from ?? fallbackFrom ?? 'any',
    to: transition.target,
    conditions,
    duration: transition.duration,
    easing: transition.easing,
    exitTime: transition.exitTime,
    hasExitTime: transition.hasExitTime ?? transition.exitTime !== undefined,
    pauseWhenExiting: transition.pauseWhenExiting,
    priority: transition.priority,
    canTransitionToSelf: transition.canTransitionToSelf,
  };
}

function animationConditionsFromAst(
  conditions: HoloAnimationTransitionCondition[] | undefined,
  event: string | undefined
): TransitionCondition[] | undefined {
  if (conditions && conditions.length > 0) {
    return conditions.map((condition) => ({
      parameter: condition.parameter,
      operator: condition.operator,
      value: condition.value,
      chain: condition.chain,
    }));
  }

  if (!event) return undefined;
  return [{ parameter: event, operator: '==', value: true }];
}
