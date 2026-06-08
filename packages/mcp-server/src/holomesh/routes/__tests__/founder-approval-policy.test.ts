import { describe, it, expect } from 'vitest';
import { deriveApprovalReversibility, inferApprovalActionType } from '../founder-approval-policy';

describe('founder-approval-policy — deriveApprovalReversibility', () => {
  it('admits plain code intents as reversible one-tap', () => {
    const r = deriveApprovalReversibility('Add a unit test for the parser');
    expect(r.reversible).toBe(true);
    expect(r.actionType).toBe('code');
  });

  it('admits spatial intents as reversible', () => {
    const r = deriveApprovalReversibility('Render the scene preview for the demo zone');
    expect(r.reversible).toBe(true);
    expect(r.actionType).toBe('spatial');
  });

  it.each([
    ['Deploy studio to production', 'deploy'],
    ['Force-push the rebased branch', 'force-push'],
    ['Spend treasury on the audit', 'spend/treasury'],
    ['Sign and broadcast the on-chain anchor', 'sign/broadcast'],
    ['Merge to main after review', 'merge to main'],
    ['Delete the stale world', 'delete'],
  ])('blocks irreversible intent: %s', (title) => {
    const r = deriveApprovalReversibility(title);
    expect(r.reversible).toBe(false);
    expect(r.reason).toMatch(/irreversible|review/i);
  });

  it('blocks service_rental even without an irreversible verb', () => {
    const r = deriveApprovalReversibility('Provision a GPU fleet for the benchmark');
    expect(r.actionType).toBe('service_rental');
    expect(r.reversible).toBe(false);
  });

  it('blocks mobility_coordination', () => {
    const r = deriveApprovalReversibility('Coordinate the door-to-door mobility trip');
    expect(r.actionType).toBe('mobility_coordination');
    expect(r.reversible).toBe(false);
  });

  it('inferApprovalActionType prioritizes rental over spatial', () => {
    // "render" (spatial) + "gpu" (rental) → rental wins (spend gate is stricter)
    expect(inferApprovalActionType('render on a rented gpu')).toBe('service_rental');
  });

  it('does NOT classify a software "route" as mobility_coordination', () => {
    // "route" in an API/code context is NOT a mobility trip — regression from
    // the over-broad MOBILITY_RE that matched any "route" keyword.
    const r = deriveApprovalReversibility('Add the founder-approval route');
    expect(r.actionType).toBe('code');
    expect(r.reversible).toBe(true);
  });

  it('still blocks actual mobility coordination', () => {
    const r = deriveApprovalReversibility('Coordinate the mobility trip for door-to-door delivery');
    expect(r.actionType).toBe('mobility_coordination');
    expect(r.reversible).toBe(false);
  });
});
