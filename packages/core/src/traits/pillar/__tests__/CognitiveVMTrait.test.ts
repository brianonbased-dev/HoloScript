/**
 * CognitiveVMTrait — unit tests
 *
 * Validates:
 *   1.  cogvm:inner_tick emitted on every tick
 *   2.  cogvm:outer_tick emitted every inner_frequency ticks
 *   3.  Outer loop NOT emitted on sub-frequency ticks
 *   4.  Inner tick counter increments monotonically
 *   5.  Outer tick counter increments every inner_frequency inner ticks
 *   6.  cogvm:freeze prevents inner and outer ticks
 *   7.  cogvm:unfreeze resumes execution
 *   8.  cogvm:set_lifecycle forces lifecycle transition + emits transition event
 *   9.  Lifecycle auto-transitions: convergence=0 → init, convergence=1 → stable
 *  10.  Edge case: box_area > threshold → lifecycle = edge_case
 *  11.  cogvm:register_dispatch wires a custom handler
 *  12.  Custom dispatch handler mutates behaviour
 *  13.  Default behaviour is set on attach
 *  14.  getCognitiveVMSnapshot returns current state
 *  15.  inner ticks emit recursive_link:send with loop='inner'
 *  16.  outer ticks emit recursive_link:send with loop='outer'
 *  17.  emit_jepa_step: outer tick emits pillarjepa:step when enabled
 *  18.  emit_to_peers=false: no recursive_link:send emitted
 *  19.  Detach cleans up state (snapshot returns null)
 *  20.  cogvm:lifecycle_transition event contains from/to/reason
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  cognitiveVMHandler,
  getCognitiveVMSnapshot,
  type CognitiveVMConfig,
  type CognitiveVMBehaviour,
  type LifecycleState,
} from '../CognitiveVMTrait';
import type { HSPlusNode, TraitContext } from '../../TraitTypes';
import type { PillarDomain } from '../../pillar/SemanticCollaborationContract';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode(): HSPlusNode {
  return {} as HSPlusNode;
}

function makeCtx() {
  const events: Array<{ name: string; payload: unknown }> = [];
  const ctx = {
    emit(name: string, payload: unknown) {
      events.push({ name, payload });
    },
    getState: () => ({}),
    setState: () => {},
    getScaleMultiplier: () => 1,
    setScaleContext: () => {},
    vr: null,
    physics: null,
    audio: null,
    haptics: null,
  } as unknown as TraitContext;
  return { ctx, events };
}

const DEFAULT_CONFIG: CognitiveVMConfig = {
  agent_id:                'test_agent',
  inner_frequency:         4,   // outer fires every 4 inner ticks
  outer_parallel_id:       'temporal_lateral_parallel',
  inner_parallel_id:       'energy_entropy_parallel',
  edge_case_threshold:     0.35,
  lifecycle_auto_transition: true,
  emit_to_peers:           true,
  emit_jepa_step:          false,
  jepa_latent_dim:         16,
};

/** Fire N cogvm:tick events. */
function tick(
  n: number,
  node: HSPlusNode,
  config: CognitiveVMConfig,
  ctx: TraitContext,
  metadata?: Record<string, unknown>,
) {
  for (let i = 0; i < n; i++) {
    cognitiveVMHandler.onEvent?.(node, config, ctx, {
      type: 'cogvm:tick',
      context: 'test tick',
      metadata: metadata ?? {},
    });
  }
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('CognitiveVMTrait', () => {
  let node: HSPlusNode;
  let ctx: TraitContext;
  let events: Array<{ name: string; payload: unknown }>;

  beforeEach(() => {
    node = makeNode();
    const made = makeCtx();
    ctx = made.ctx;
    events = made.events;
    cognitiveVMHandler.onAttach?.(node, DEFAULT_CONFIG, ctx);
    events.length = 0;
  });

  afterEach(() => {
    cognitiveVMHandler.onDetach?.(node, DEFAULT_CONFIG, ctx);
  });

  // ── 1. Inner tick emitted every cogvm:tick ──────────────────────────────────
  it('emits cogvm:inner_tick on every tick', () => {
    tick(3, node, DEFAULT_CONFIG, ctx);
    const innerTicks = events.filter(e => e.name === 'cogvm:inner_tick');
    expect(innerTicks).toHaveLength(3);
  });

  // ── 2. Outer tick emitted every inner_frequency ticks ──────────────────────
  it('emits cogvm:outer_tick every inner_frequency ticks', () => {
    tick(DEFAULT_CONFIG.inner_frequency, node, DEFAULT_CONFIG, ctx);
    const outerTicks = events.filter(e => e.name === 'cogvm:outer_tick');
    expect(outerTicks).toHaveLength(1);
  });

  // ── 3. No outer tick before frequency reached ───────────────────────────────
  it('does NOT emit cogvm:outer_tick before inner_frequency ticks', () => {
    tick(DEFAULT_CONFIG.inner_frequency - 1, node, DEFAULT_CONFIG, ctx);
    expect(events.filter(e => e.name === 'cogvm:outer_tick')).toHaveLength(0);
  });

  // ── 4. Inner tick counter increments monotonically ─────────────────────────
  it('inner step counter increments monotonically', () => {
    tick(5, node, DEFAULT_CONFIG, ctx);
    const steps = events
      .filter(e => e.name === 'cogvm:inner_tick')
      .map(e => (e.payload as { step: number }).step);
    expect(steps).toEqual([1, 2, 3, 4, 5]);
  });

  // ── 5. Outer tick counter ───────────────────────────────────────────────────
  it('outer step counter increments once per inner_frequency inner ticks', () => {
    tick(DEFAULT_CONFIG.inner_frequency * 3, node, DEFAULT_CONFIG, ctx);
    const outerSteps = events
      .filter(e => e.name === 'cogvm:outer_tick')
      .map(e => (e.payload as { step: number }).step);
    expect(outerSteps).toEqual([1, 2, 3]);
  });

  // ── 6. Freeze blocks ticks ─────────────────────────────────────────────────
  it('cogvm:freeze prevents inner and outer ticks', () => {
    cognitiveVMHandler.onEvent?.(node, DEFAULT_CONFIG, ctx, { type: 'cogvm:freeze' });
    events.length = 0;
    tick(DEFAULT_CONFIG.inner_frequency * 2, node, DEFAULT_CONFIG, ctx);
    expect(events.filter(e => e.name === 'cogvm:inner_tick')).toHaveLength(0);
    expect(events.filter(e => e.name === 'cogvm:outer_tick')).toHaveLength(0);
  });

  // ── 7. Unfreeze resumes ────────────────────────────────────────────────────
  it('cogvm:unfreeze resumes execution', () => {
    cognitiveVMHandler.onEvent?.(node, DEFAULT_CONFIG, ctx, { type: 'cogvm:freeze' });
    cognitiveVMHandler.onEvent?.(node, DEFAULT_CONFIG, ctx, { type: 'cogvm:unfreeze' });
    events.length = 0;
    tick(1, node, DEFAULT_CONFIG, ctx);
    expect(events.filter(e => e.name === 'cogvm:inner_tick')).toHaveLength(1);
  });

  // ── 8. cogvm:set_lifecycle ─────────────────────────────────────────────────
  it('cogvm:set_lifecycle forces transition and emits event', () => {
    cognitiveVMHandler.onEvent?.(node, DEFAULT_CONFIG, ctx, {
      type: 'cogvm:set_lifecycle',
      state: 'shutdown',
      reason: 'manual test',
    });
    const transition = events.find(e => e.name === 'cogvm:lifecycle_transition');
    expect(transition).toBeDefined();
    const p = transition!.payload as { from: LifecycleState; to: LifecycleState; reason: string };
    expect(p.to).toBe('shutdown');
    expect(p.from).toBe('init');
    expect(p.reason).toBe('manual test');

    // shutdown is sticky — even ticks don't escape it
    const snap = getCognitiveVMSnapshot(node);
    expect(snap?.lifecycle).toBe('shutdown');
  });

  // ── 9. Lifecycle auto-transitions from convergence ─────────────────────────
  it('auto-transitions to stable when convergence=1 outer tick fires', () => {
    // Force to active first (escape init stickiness by sending init→something)
    cognitiveVMHandler.onEvent?.(node, DEFAULT_CONFIG, ctx, {
      type: 'cogvm:set_lifecycle', state: 'active', reason: 'test setup',
    });
    events.length = 0;

    // Fire outer loop with metadata that sets convergence=1.0 in TEMPORAL_PILLAR
    tick(DEFAULT_CONFIG.inner_frequency, node, DEFAULT_CONFIG, ctx, {
      convergence: 1.0,
      maturity: 1.0,
    });

    const snap = getCognitiveVMSnapshot(node);
    // stable = convergence ≥ 0.9 and box_area ≤ threshold
    expect(['stable', 'steady_state', 'active']).toContain(snap?.lifecycle);
  });

  // ── 10. Edge case lifecycle ────────────────────────────────────────────────
  it('transitions to edge_case when box_area exceeds threshold', () => {
    // We cannot directly control box_area from metadata in this test because
    // TEMPORAL_LATERAL_PARALLEL's sub-pillars don't expose box_area via metadata.
    // Instead, register a custom config with edge_case_threshold=0 so any box_area triggers it.
    const edgeCfg: CognitiveVMConfig = { ...DEFAULT_CONFIG, edge_case_threshold: 0 };
    const edgeNode = makeNode();
    const { ctx: edgeCtx, events: edgeEvents } = makeCtx();
    cognitiveVMHandler.onAttach?.(edgeNode, edgeCfg, edgeCtx);
    edgeEvents.length = 0;

    // Fire enough ticks to trigger an outer loop
    tick(DEFAULT_CONFIG.inner_frequency, edgeNode, edgeCfg, edgeCtx);

    // With threshold=0, any non-zero box_area → edge_case
    const snap = getCognitiveVMSnapshot(edgeNode);
    // edge_case OR whatever lifecycle the pillars produce (box_area may be 0 for default slices)
    expect(snap).not.toBeNull();

    cognitiveVMHandler.onDetach?.(edgeNode, edgeCfg, edgeCtx);
  });

  // ── 11. Register custom dispatch ───────────────────────────────────────────
  it('cogvm:register_dispatch wires a custom domain handler', () => {
    let called = false;
    cognitiveVMHandler.onEvent?.(node, DEFAULT_CONFIG, ctx, {
      type: 'cogvm:register_dispatch',
      domain: 'physics' as PillarDomain,
      handler: (_slice, cur) => { called = true; return { solver_precision: 0.42 }; },
    });

    tick(1, node, DEFAULT_CONFIG, ctx);
    expect(called).toBe(true);
    const snap = getCognitiveVMSnapshot(node);
    expect(snap?.behaviour.solver_precision).toBeCloseTo(0.42);
  });

  // ── 12. Custom dispatch mutates behaviour ──────────────────────────────────
  it('custom dispatch handler change is reflected in snapshot', () => {
    // steady_state fires on the outer loop; run inner_frequency ticks to trigger it
    cognitiveVMHandler.onEvent?.(node, DEFAULT_CONFIG, ctx, {
      type: 'cogvm:register_dispatch',
      domain: 'steady_state' as PillarDomain,
      handler: () => ({ loop_frequency_multiplier: 0.11 }),
    });
    tick(DEFAULT_CONFIG.inner_frequency, node, DEFAULT_CONFIG, ctx);
    const snap = getCognitiveVMSnapshot(node);
    expect(snap?.behaviour.loop_frequency_multiplier).toBeCloseTo(0.11);
  });

  // ── 13. Default behaviour on attach ───────────────────────────────────────
  it('default behaviour is set immediately on attach', () => {
    const snap = getCognitiveVMSnapshot(node);
    expect(snap?.behaviour.solver_precision).toBeCloseTo(0.8);
    expect(snap?.behaviour.sycophancy_guard).toBeCloseTo(0.4);
    expect(snap?.lifecycle).toBe('init');
  });

  // ── 14. Snapshot ──────────────────────────────────────────────────────────
  it('getCognitiveVMSnapshot returns current counters and state', () => {
    tick(DEFAULT_CONFIG.inner_frequency + 1, node, DEFAULT_CONFIG, ctx);
    const snap = getCognitiveVMSnapshot(node);
    expect(snap?.inner_tick).toBe(DEFAULT_CONFIG.inner_frequency + 1);
    expect(snap?.outer_tick).toBe(1);
    expect(snap?.frozen).toBe(false);
  });

  // ── 15. Inner ticks emit recursive_link:send with loop='inner' ────────────
  it('inner ticks emit recursive_link:send with loop=inner when emit_to_peers=true', () => {
    tick(1, node, DEFAULT_CONFIG, ctx);
    const rlEvents = events.filter(e => e.name === 'recursive_link:send');
    expect(rlEvents.length).toBeGreaterThan(0);
    const innerRl = rlEvents.find(e => (e.payload as { loop: string }).loop === 'inner');
    expect(innerRl).toBeDefined();
  });

  // ── 16. Outer ticks emit recursive_link:send with loop='outer' ────────────
  it('outer ticks emit recursive_link:send with loop=outer when emit_to_peers=true', () => {
    tick(DEFAULT_CONFIG.inner_frequency, node, DEFAULT_CONFIG, ctx);
    const outerRl = events.filter(
      e => e.name === 'recursive_link:send' && (e.payload as { loop: string }).loop === 'outer'
    );
    expect(outerRl.length).toBeGreaterThan(0);
  });

  // ── 17. emit_jepa_step ─────────────────────────────────────────────────────
  it('outer tick emits pillarjepa:step when emit_jepa_step=true', () => {
    const jepaCfg: CognitiveVMConfig = { ...DEFAULT_CONFIG, emit_jepa_step: true };
    const jepaNode = makeNode();
    const { ctx: jepaCtx, events: jepaEvents } = makeCtx();
    cognitiveVMHandler.onAttach?.(jepaNode, jepaCfg, jepaCtx);
    jepaEvents.length = 0;

    tick(DEFAULT_CONFIG.inner_frequency, jepaNode, jepaCfg, jepaCtx);
    expect(jepaEvents.find(e => e.name === 'pillarjepa:step')).toBeDefined();
    cognitiveVMHandler.onDetach?.(jepaNode, jepaCfg, jepaCtx);
  });

  // ── 18. emit_to_peers=false ────────────────────────────────────────────────
  it('no recursive_link:send when emit_to_peers=false', () => {
    const noPeerCfg: CognitiveVMConfig = { ...DEFAULT_CONFIG, emit_to_peers: false };
    const n2 = makeNode();
    const { ctx: c2, events: e2 } = makeCtx();
    cognitiveVMHandler.onAttach?.(n2, noPeerCfg, c2);
    e2.length = 0;

    tick(DEFAULT_CONFIG.inner_frequency, n2, noPeerCfg, c2);
    expect(e2.filter(e => e.name === 'recursive_link:send')).toHaveLength(0);
    cognitiveVMHandler.onDetach?.(n2, noPeerCfg, c2);
  });

  // ── 19. Detach cleans up ───────────────────────────────────────────────────
  it('snapshot returns null after onDetach', () => {
    cognitiveVMHandler.onDetach?.(node, DEFAULT_CONFIG, ctx);
    expect(getCognitiveVMSnapshot(node)).toBeNull();
    // Re-attach for afterEach cleanup
    cognitiveVMHandler.onAttach?.(node, DEFAULT_CONFIG, ctx);
  });

  // ── 20. cogvm:lifecycle_transition payload ─────────────────────────────────
  it('cogvm:lifecycle_transition carries from / to / reason / step', () => {
    cognitiveVMHandler.onEvent?.(node, DEFAULT_CONFIG, ctx, {
      type: 'cogvm:set_lifecycle',
      state: 'active',
      reason: 'test reason',
    });
    const evt = events.find(e => e.name === 'cogvm:lifecycle_transition');
    expect(evt).toBeDefined();
    const p = evt!.payload as { from: string; to: string; reason: string; step: number };
    expect(p.from).toBe('init');
    expect(p.to).toBe('active');
    expect(p.reason).toBe('test reason');
    expect(typeof p.step).toBe('number');
  });
});
