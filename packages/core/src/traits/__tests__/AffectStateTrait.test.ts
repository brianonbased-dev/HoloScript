import { describe, expect, it, vi } from 'vitest';
import {
  affectStateHandler,
  resolveExpression,
  DEFAULT_AFFECT_EXPRESSIONS,
  type AffectState,
} from '../AffectStateTrait';
import type { TraitContext } from '../TraitTypes';

type TestNode = { properties: Record<string, unknown>; __affectState?: AffectState };

function ctx() {
  return { emit: vi.fn() } as unknown as TraitContext & { emit: ReturnType<typeof vi.fn> };
}

function attach() {
  const node: TestNode = { properties: {} };
  const context = ctx();
  affectStateHandler.onAttach(node as never, {} as never, context);
  return { node, context };
}

describe('affect_state runtime', () => {
  it('attaches neutral with visible channels applied', () => {
    const { node } = attach();
    expect(node.__affectState!.expression).toBe('neutral');
    expect(node.properties.expression).toBe('neutral');
    expect(node.properties.emissiveColor).toBe('#8fb7c9');
    expect(node.properties.emissiveIntensity).toBeGreaterThan(0);
  });

  it('resolves expression zones by valence and arousal', () => {
    expect(resolveExpression(0, 0, DEFAULT_AFFECT_EXPRESSIONS).name).toBe('neutral');
    expect(resolveExpression(0.5, 0, DEFAULT_AFFECT_EXPRESSIONS).name).toBe('warm');
    expect(resolveExpression(0.9, 0.6, DEFAULT_AFFECT_EXPRESSIONS).name).toBe('delight');
    expect(resolveExpression(-0.6, 0.5, DEFAULT_AFFECT_EXPRESSIONS).name).toBe('concern');
    expect(resolveExpression(-0.5, -0.6, DEFAULT_AFFECT_EXPRESSIONS).name).toBe('quiet');
  });

  it('a stimulus shifts expression, mutates channels, and receipts the change', () => {
    const { node, context } = attach();
    affectStateHandler.onEvent(node as never, {} as never, context, {
      type: 'affect_stimulus',
      payload: { valence: 0.5, arousal: 0.1, cause: 'owner greeted her' },
    });
    const state = node.__affectState!;
    expect(state.expression).toBe('warm');
    expect(node.properties.expression).toBe('warm');
    expect(node.properties.emissiveColor).toBe('#ffb37f');
    expect(context.emit).toHaveBeenCalledWith(
      'affect_expression_changed',
      expect.objectContaining({ from: 'neutral', to: 'warm', cause: 'owner greeted her' })
    );
    const receipt = state.receipts[state.receipts.length - 1];
    expect(receipt.event).toBe('affect_stimulus');
    expect(receipt.receiptHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('clamps valence and arousal to [-1, 1]', () => {
    const { node, context } = attach();
    affectStateHandler.onEvent(node as never, {} as never, context, {
      type: 'affect_stimulus',
      payload: { valence: 5, arousal: -7 },
    });
    const state = node.__affectState!;
    expect(state.valence).toBe(1);
    expect(state.arousal).toBe(-1);
  });

  it('decays toward baseline over updates until neutral again', () => {
    const { node, context } = attach();
    affectStateHandler.onEvent(node as never, {} as never, context, {
      type: 'affect_stimulus',
      payload: { valence: 0.6, arousal: 0.2 },
    });
    expect(node.__affectState!.expression).toBe('warm');
    affectStateHandler.onUpdate(node as never, {} as never, context, 60);
    const state = node.__affectState!;
    expect(state.valence).toBe(0);
    expect(state.arousal).toBe(0);
    expect(state.expression).toBe('neutral');
    expect(node.properties.expression).toBe('neutral');
  });

  it('affect_forget resets state and history unconditionally, receipted', () => {
    const { node, context } = attach();
    affectStateHandler.onEvent(node as never, {} as never, context, {
      type: 'affect_stimulus',
      payload: { valence: 0.9, arousal: 0.9 },
    });
    affectStateHandler.onEvent(node as never, {} as never, context, { type: 'affect_forget' });
    const state = node.__affectState!;
    expect(state.valence).toBe(0);
    expect(state.arousal).toBe(0);
    expect(state.expression).toBe('neutral');
    expect(state.transitions).toBe(0);
    expect(state.receipts).toHaveLength(1);
    expect(state.receipts[0].event).toBe('affect_forget');
  });
});
