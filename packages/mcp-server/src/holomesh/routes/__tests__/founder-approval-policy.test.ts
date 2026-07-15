import { describe, expect, it } from 'vitest';
import { deriveApprovalReversibility, inferApprovalActionType } from '../founder-approval-policy';

describe('founder-approval-policy — exact-four authority', () => {
  it.each([
    'Add a unit test for the parser',
    'Deploy studio to production',
    'Rent a GPU within the active rail',
    'Sign and broadcast a wallet transaction within cap',
  ])('keeps routine intent autonomous: %s', (intent) => {
    expect(deriveApprovalReversibility(intent)).toMatchObject({
      authorityRoute: 'autonomous',
      reversible: true,
    });
  });

  it('detects structured active-rail overflow', () => {
    expect(
      deriveApprovalReversibility('Launch paid training', {
        projectedSpendUsd: 6,
        activeRailCapUsd: 5,
      })
    ).toMatchObject({
      authorityRoute: 'joseph-exact-four',
      josephReviewClass: 'spend-or-custody',
    });
  });

  it.each([
    ['Change the treasury master wallet', 'spend-or-custody'],
    ["Require Joseph's physical signature", 'physical-presence'],
    ["Publish under Joseph's name", 'public-identity'],
    ['Change founder authority', 'governance'],
  ])('routes exact-four intent: %s', (intent, josephReviewClass) => {
    expect(deriveApprovalReversibility(intent)).toMatchObject({
      authorityRoute: 'joseph-exact-four',
      josephReviewClass,
    });
  });

  it('keeps specialist and platform routes out of Joseph approval', () => {
    expect(deriveApprovalReversibility('Run legal export-control review').authorityRoute).toBe(
      'specialist-review'
    );
    expect(deriveApprovalReversibility('Deploy credential is missing').authorityRoute).toBe(
      'platform-control'
    );
  });

  it.each(['force-push main', 'hard-reset the shared tree'])(
    'prohibits %s rather than making it approvable',
    (intent) => {
      expect(deriveApprovalReversibility(intent).authorityRoute).toBe('prohibited-replan');
    }
  );

  it('keeps rental/spatial action type as presentation-only metadata', () => {
    expect(inferApprovalActionType('render on a rented gpu')).toBe('service_rental');
    expect(inferApprovalActionType('Add the founder-approval route')).toBe('code');
  });
});
