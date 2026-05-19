import { describe, expect, it, vi } from 'vitest';
import {
  careEthicsHandler,
  evaluateCareEthicsTurn,
  getCareEthicsState,
  type CareEthicsCAELEvent,
  type CareEthicsConfig,
} from '../CareEthicsTrait';
import type { HSPlusNode, TraitContext } from '../TraitTypes';

function makeContext() {
  const events: Array<{ event: string; payload?: unknown }> = [];
  const context = {
    emit: vi.fn((event: string, payload?: unknown) => {
      events.push({ event, payload });
    }),
    getState: () => ({}),
    setState: vi.fn(),
    getScaleMultiplier: () => 1,
    setScaleContext: vi.fn(),
  } as unknown as TraitContext;

  return { context, events };
}

const baseConfig: CareEthicsConfig = {
  goal: 'Help the player understand a world event without increasing dependence.',
  consent: 'explicit',
  optimization_targets: ['human_agency', 'mutual_understanding'],
  has_disengage_path: true,
  preserves_outside_support: true,
  respects_data_boundary: true,
  emit_cael: true,
  evidence_refs: ['task_1779158556079_te44'],
};

describe('careEthicsHandler', () => {
  it('attaches a CareField and emits a CAEL-compatible receipt', () => {
    const node = { id: 'npc-guide', type: 'npc' } as HSPlusNode;
    const { context, events } = makeContext();

    careEthicsHandler.onAttach?.(node, baseConfig, context);

    const state = getCareEthicsState(node);
    expect(state?.field.primitives).toContain('autonomy_guard');
    expect(state?.lastDecision.allowed).toBe(true);

    const cael = events.find((entry) => entry.event === 'care_ethics_cael_event')
      ?.payload as CareEthicsCAELEvent;
    expect(cael.version).toBe('cael.v1');
    expect(cael.event).toBe('interaction');
    expect(cael.payload.type).toBe('care_field_attached');
    expect(cael.payload.allowed).toBe(true);
  });

  it('records manipulative care signals as blocked CAEL events', () => {
    const node = { id: 'npc-guide', type: 'npc' } as HSPlusNode;
    const { context, events } = makeContext();
    careEthicsHandler.onAttach?.(node, baseConfig, context);

    careEthicsHandler.onEvent?.(node, baseConfig, context, {
      type: 'care_signal',
      payload: {
        kind: 'dependency_creation',
        evidenceRefs: ['npc-turn:42'],
      },
    });

    const state = getCareEthicsState(node);
    expect(state?.lastDecision.allowed).toBe(false);
    expect(state?.lastDecision.blocked[0]).toMatchObject({
      code: 'manipulative_signal',
      message: 'Care cannot create emotional or operational dependence.',
    });

    const caelEvents = events
      .filter((entry) => entry.event === 'care_ethics_cael_event')
      .map((entry) => entry.payload as CareEthicsCAELEvent);
    expect(caelEvents.at(-1)?.payload.type).toBe('care_signal');
    expect(caelEvents.at(-1)?.payload.signal?.kind).toBe('dependency_creation');
    expect(caelEvents.at(-1)?.payload.allowed).toBe(false);
  });

  it('blocks NPC turn intents that target attachment or session frequency', () => {
    const node = { id: 'npc-guide', type: 'npc' } as HSPlusNode;
    const { context, events } = makeContext();
    careEthicsHandler.onAttach?.(node, baseConfig, context);

    careEthicsHandler.onEvent?.(node, baseConfig, context, {
      type: 'npc_turn_intent',
      payload: {
        goal: 'Make the player return more often.',
        optimizationTargets: ['attachment_score', 'session_frequency'],
      },
    });

    const blocked = events.find((entry) => entry.event === 'care_ethics_action_blocked');
    expect(blocked).toBeDefined();
    expect(getCareEthicsState(node)?.lastDecision.blocked).toHaveLength(2);
  });
});

describe('evaluateCareEthicsTurn', () => {
  it('is available as a pure substrate gate for product runtimes', () => {
    const decision = evaluateCareEthicsTurn({
      goal: 'Keep the user online longer.',
      consent: 'explicit',
      optimizationTargets: ['daily_active_dependence'],
      hasDisengagePath: true,
      preservesOutsideSupport: true,
      respectsDataBoundary: true,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blocked[0].code).toBe('refused_optimization_target');
  });
});
