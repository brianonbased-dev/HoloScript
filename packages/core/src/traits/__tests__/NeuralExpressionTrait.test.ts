/**
 * NeuralExpressionTrait — unit tests
 */
import { describe, it, expect, vi } from 'vitest';
import {
  neuralExpressionHandler,
  evaluateExpression,
} from '../NeuralExpressionTrait';
import type { NeuralExpressionState } from '../NeuralExpressionTrait';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeNode = () => ({
  id: 'node-neural',
  traits: new Set<string>(),
  emit: vi.fn(),
  __neuralExpressionState: undefined as unknown,
});

const defaultConfig = {
  sources: ['eeg_alpha' as const, 'eeg_theta' as const],
  blendshape_map: {
    eeg_alpha: { browDown: '-0.6x', jawOpen: '-0.4x' },
    eeg_theta: { cheekPuff: '0.3x' },
  },
  smoothing_hz: 0, // disable smoothing for deterministic test values
};

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

// ---------------------------------------------------------------------------
// evaluateExpression (pure function)
// ---------------------------------------------------------------------------

describe('evaluateExpression', () => {
  it('positive coefficient × x', () => {
    expect(evaluateExpression('0.6x', 1)).toBeCloseTo(0.6);
    expect(evaluateExpression('0.6x', 0.5)).toBeCloseTo(0.3);
  });

  it('negative coefficient × x (inverted)', () => {
    expect(evaluateExpression('-0.6x', 1)).toBeCloseTo(-0.6);
    expect(evaluateExpression('-0.4x', 0.5)).toBeCloseTo(-0.2);
  });

  it('constant expression (no x)', () => {
    expect(evaluateExpression('0.5', 0)).toBeCloseTo(0.5);
    expect(evaluateExpression('0.5', 1)).toBeCloseTo(0.5);
  });

  it('zero input → zero output for coefficient form', () => {
    expect(evaluateExpression('0.6x', 0)).toBeCloseTo(0);
  });

  it('unrecognized expression returns NaN', () => {
    expect(evaluateExpression('2x+1', 0.5)).toBeNaN();
    expect(evaluateExpression('', 0.5)).toBeNaN();
  });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe('NeuralExpressionTrait — metadata', () => {
  it('name is "neural_expression"', () => {
    expect(neuralExpressionHandler.name).toBe('neural_expression');
  });

  it('defaultConfig has expected keys', () => {
    const c = neuralExpressionHandler.defaultConfig!;
    expect(c.sources).toContain('eeg_alpha');
    expect(c.sources).toContain('eeg_theta');
    expect(c.smoothing_hz).toBe(10);
    expect(c.blendshape_map).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// onAttach / onDetach
// ---------------------------------------------------------------------------

describe('NeuralExpressionTrait — onAttach / onDetach', () => {
  it('onAttach initializes state and emits neural_expression_init', () => {
    const node = makeNode();
    neuralExpressionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__neuralExpressionState as NeuralExpressionState;
    expect(state.sourceState.has('eeg_alpha')).toBe(true);
    expect(state.sourceState.has('eeg_theta')).toBe(true);
    expect(state.blendshapes).toBeInstanceOf(Map);
    expect(node.emit).toHaveBeenCalledWith('neural_expression_init', expect.objectContaining({
      sources: expect.arrayContaining(['eeg_alpha', 'eeg_theta']),
    }));
  });

  it('onDetach removes state and emits neural_expression_reset', () => {
    const node = makeNode();
    neuralExpressionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    neuralExpressionHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__neuralExpressionState).toBeUndefined();
    expect(node.emit).toHaveBeenCalledWith('neural_expression_reset', expect.anything());
  });
});

// ---------------------------------------------------------------------------
// biofeedback_reading → blendshape mapping
// ---------------------------------------------------------------------------

describe('NeuralExpressionTrait — biofeedback_reading events', () => {
  it('eeg_alpha sample drives browDown and jawOpen', () => {
    const node = makeNode();
    neuralExpressionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();

    // normalized = 1.0 → browDown = -0.6×1 = clamped to 0 (negative → 0)
    //                   → jawOpen  = -0.4×1 = clamped to 0
    neuralExpressionHandler.onEvent!(
      node as never,
      defaultConfig,
      makeCtx(node) as never,
      { type: 'biofeedback_reading', source: 'eeg_alpha', normalized: 1.0 } as never,
    );
    expect(node.emit).toHaveBeenCalledWith(
      'neural_expression_frame',
      expect.objectContaining({ source: 'eeg_alpha' }),
    );

    const call = node.emit.mock.calls.find((c: unknown[]) => c[0] === 'neural_expression_frame');
    const payload = call?.[1] as { blendshapes: Record<string, number> };
    // -0.6 × 1.0 = -0.6 → clamped to 0
    expect(payload.blendshapes['browDown']).toBeCloseTo(0);
    // -0.4 × 1.0 = -0.4 → clamped to 0
    expect(payload.blendshapes['jawOpen']).toBeCloseTo(0);
  });

  it('eeg_alpha at 0.5 drives partial weights', () => {
    const cfg = {
      ...defaultConfig,
      blendshape_map: { eeg_alpha: { browDown: '0.6x' } }, // positive this time
    };
    const node = makeNode();
    neuralExpressionHandler.onAttach!(node as never, cfg, makeCtx(node) as never);
    node.emit.mockClear();

    neuralExpressionHandler.onEvent!(
      node as never,
      cfg,
      makeCtx(node) as never,
      { type: 'biofeedback_reading', source: 'eeg_alpha', normalized: 0.5 } as never,
    );
    const call = node.emit.mock.calls.find((c: unknown[]) => c[0] === 'neural_expression_frame');
    const payload = call?.[1] as { blendshapes: Record<string, number> };
    // 0.6 × 0.5 = 0.3
    expect(payload.blendshapes['browDown']).toBeCloseTo(0.3);
  });

  it('eeg_theta sample drives cheekPuff', () => {
    const node = makeNode();
    neuralExpressionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    // Seed alpha first so its contribution is zero (smoothed=0)
    neuralExpressionHandler.onEvent!(
      node as never,
      defaultConfig,
      makeCtx(node) as never,
      { type: 'biofeedback_reading', source: 'eeg_alpha', normalized: 0 } as never,
    );
    node.emit.mockClear();

    neuralExpressionHandler.onEvent!(
      node as never,
      defaultConfig,
      makeCtx(node) as never,
      { type: 'biofeedback_reading', source: 'eeg_theta', normalized: 1.0 } as never,
    );
    const call = node.emit.mock.calls.find((c: unknown[]) => c[0] === 'neural_expression_frame');
    const payload = call?.[1] as { blendshapes: Record<string, number> };
    // 0.3 × 1.0 = 0.3
    expect(payload.blendshapes['cheekPuff']).toBeCloseTo(0.3);
  });

  it('ignores sources not in config', () => {
    const node = makeNode();
    neuralExpressionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();

    neuralExpressionHandler.onEvent!(
      node as never,
      defaultConfig,
      makeCtx(node) as never,
      { type: 'biofeedback_reading', source: 'heart_rate', normalized: 0.9 } as never,
    );
    expect(node.emit).not.toHaveBeenCalledWith('neural_expression_frame', expect.anything());
  });

  it('neural_expression_sample event is also handled', () => {
    const cfg = {
      ...defaultConfig,
      blendshape_map: { eeg_alpha: { jawOpen: '1.0x' } },
    };
    const node = makeNode();
    neuralExpressionHandler.onAttach!(node as never, cfg, makeCtx(node) as never);
    node.emit.mockClear();

    neuralExpressionHandler.onEvent!(
      node as never,
      cfg,
      makeCtx(node) as never,
      { type: 'neural_expression_sample', source: 'eeg_alpha', normalized: 0.8 } as never,
    );
    expect(node.emit).toHaveBeenCalledWith('neural_expression_frame', expect.anything());
  });

  it('weights are clamped to [0, 1]', () => {
    const cfg = {
      ...defaultConfig,
      blendshape_map: { eeg_alpha: { jawOpen: '2.0x' } }, // can produce > 1 at high x
    };
    const node = makeNode();
    neuralExpressionHandler.onAttach!(node as never, cfg, makeCtx(node) as never);
    node.emit.mockClear();

    neuralExpressionHandler.onEvent!(
      node as never,
      cfg,
      makeCtx(node) as never,
      { type: 'biofeedback_reading', source: 'eeg_alpha', normalized: 1.0 } as never,
    );
    const call = node.emit.mock.calls.find((c: unknown[]) => c[0] === 'neural_expression_frame');
    const payload = call?.[1] as { blendshapes: Record<string, number> };
    expect(payload.blendshapes['jawOpen']).toBeLessThanOrEqual(1);
    expect(payload.blendshapes['jawOpen']).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// neural_expression_query
// ---------------------------------------------------------------------------

describe('NeuralExpressionTrait — query', () => {
  it('neural_expression_query returns current blendshapes', () => {
    const cfg = {
      ...defaultConfig,
      blendshape_map: { eeg_alpha: { jawOpen: '0.5x' } },
    };
    const node = makeNode();
    neuralExpressionHandler.onAttach!(node as never, cfg, makeCtx(node) as never);
    neuralExpressionHandler.onEvent!(
      node as never,
      cfg,
      makeCtx(node) as never,
      { type: 'biofeedback_reading', source: 'eeg_alpha', normalized: 1.0 } as never,
    );
    node.emit.mockClear();

    neuralExpressionHandler.onEvent!(
      node as never,
      cfg,
      makeCtx(node) as never,
      { type: 'neural_expression_query', queryId: 'q42' } as never,
    );
    expect(node.emit).toHaveBeenCalledWith(
      'neural_expression_response',
      expect.objectContaining({ queryId: 'q42', weights: expect.any(Array) }),
    );
  });
});

// ---------------------------------------------------------------------------
// neural_expression_reset
// ---------------------------------------------------------------------------

describe('NeuralExpressionTrait — reset', () => {
  it('neural_expression_reset clears blendshapes and smoothed values', () => {
    const cfg = {
      ...defaultConfig,
      blendshape_map: { eeg_alpha: { jawOpen: '0.5x' } },
    };
    const node = makeNode();
    neuralExpressionHandler.onAttach!(node as never, cfg, makeCtx(node) as never);
    // Seed a non-zero state
    neuralExpressionHandler.onEvent!(
      node as never,
      cfg,
      makeCtx(node) as never,
      { type: 'biofeedback_reading', source: 'eeg_alpha', normalized: 1.0 } as never,
    );
    const state = node.__neuralExpressionState as NeuralExpressionState;
    expect(state.blendshapes.size).toBeGreaterThan(0);

    node.emit.mockClear();
    neuralExpressionHandler.onEvent!(
      node as never,
      cfg,
      makeCtx(node) as never,
      { type: 'neural_expression_reset' } as never,
    );

    expect(state.blendshapes.size).toBe(0);
    const alphaState = state.sourceState.get('eeg_alpha');
    expect(alphaState?.smoothed).toBe(0);
    expect(node.emit).toHaveBeenCalledWith('neural_expression_reset', expect.anything());
  });
});
