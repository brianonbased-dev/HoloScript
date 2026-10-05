/**
 * The answer model is shown at most 30 lines of each top result. For a long
 * function those are chosen by the question's words, so the rule the question
 * asks about is not cut off below line 30 (2026-10-05).
 */
import { describe, expect, it } from 'vitest';
import { questionTerms, selectLinesForQuestion } from './graph-rag-tools';

describe('selectLinesForQuestion', () => {
  const longFunction = [
    '/** Decide the refund. */',
    'export function decideRefund(order: Order): Refund {',
    ...Array.from({ length: 80 }, (_, i) => `  const step${i} = prepare(order, ${i});`),
    '  // the refund window rule',
    '  if (daysSince(order.deliveredAt) > REFUND_WINDOW_DAYS) return { refunded: false };',
    ...Array.from({ length: 40 }, (_, i) => `  audit(order, ${i});`),
    '}',
  ];

  it('reaches a rule past line 30 that the question names, and keeps the signature', () => {
    const picked = selectLinesForQuestion(longFunction, 'when is a refund refused after the refund window?', 30);
    expect(picked.length).toBeLessThanOrEqual(32);
    expect(picked).toContain('export function decideRefund(order: Order): Refund {');
    expect(picked).toContain('  if (daysSince(order.deliveredAt) > REFUND_WINDOW_DAYS) return { refunded: false };');
    expect(picked).toContain('  ...');
  });

  it('returns a definition that fits the budget whole', () => {
    const short = ['function a() {', '  return 1;', '}'];
    expect(selectLinesForQuestion(short, 'anything', 30)).toEqual(short);
  });

  it('falls back to the opening lines when no word matches', () => {
    const picked = selectLinesForQuestion(longFunction, 'zzz qqq', 30);
    expect(picked.slice(0, 30)).toEqual(longFunction.slice(0, 30));
  });

  it('splits camelCase and drops question filler', () => {
    expect(questionTerms('How does fuseHybridScore work?')).toEqual(['fuse', 'hybrid', 'score']);
  });
});
