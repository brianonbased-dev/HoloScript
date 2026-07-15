import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  ACTIVE_RAIL_CAP_RE,
  PROHIBITED_OPERATION_RE,
  deriveFounderReversibility,
  inferFounderActionType,
} from '../founder-reversibility';

describe('founder authority routing — presentation action type', () => {
  it('keeps the existing UI classifications', () => {
    expect(inferFounderActionType('Add a unit test for the parser')).toBe('code');
    expect(inferFounderActionType('Render the scene preview')).toBe('spatial');
    expect(inferFounderActionType('Provision a rented GPU')).toBe('service_rental');
    expect(inferFounderActionType('Coordinate a mobility trip')).toBe('mobility_coordination');
  });

  it('does not treat a software route as mobility', () => {
    expect(inferFounderActionType('Add the founder-approval route')).toBe('code');
  });
});

describe('founder authority routing — exact four', () => {
  it('keeps ordinary deploy, publish, merge, delete, and within-cap rental autonomous', () => {
    for (const intent of [
      'Deploy studio to production',
      'Publish the ordinary release notes',
      'Merge to main after tests pass',
      'Delete the stale generated fixture',
      'Rent a GPU within the active rail for the benchmark',
      'Sign and broadcast a wallet transaction within the active rail',
    ]) {
      expect(deriveFounderReversibility(intent)).toMatchObject({
        authorityRoute: 'autonomous',
        reversible: true,
      });
    }
  });

  it('detects spend beyond a structured active rail', () => {
    expect(
      deriveFounderReversibility('Launch the paid training job', {
        projectedSpendUsd: 12,
        activeRailCapUsd: 10,
      })
    ).toMatchObject({
      authorityRoute: 'joseph-exact-four',
      josephReviewClass: 'spend-or-custody',
    });
  });

  it.each([
    ['Spend beyond the active GPU rail cap', 'spend-or-custody'],
    ['Change the treasury master wallet', 'spend-or-custody'],
    ['Recover the Trezor seed', 'spend-or-custody'],
    ['Create a new wallet for the permanent seat', 'spend-or-custody'],
    ["This commitment requires Joseph's physical signature", 'physical-presence'],
    ["Publish this statement under Joseph's name", 'public-identity'],
    ['Change founder authority and escalation criteria', 'governance'],
  ])('routes exact-four intent: %s', (intent, protectedClass) => {
    expect(deriveFounderReversibility(intent)).toMatchObject({
      authorityRoute: 'joseph-exact-four',
      josephReviewClass: protectedClass,
      reversible: false,
    });
  });

  it('uses an active cap, never a fixed numeric founder threshold', () => {
    expect(ACTIVE_RAIL_CAP_RE.test('spend beyond the active wallet cap')).toBe(true);
    expect(
      deriveFounderReversibility('Launch paid job', {
        projectedSpendUsd: 99,
        activeRailCapUsd: 100,
      }).authorityRoute
    ).toBe('autonomous');
    expect(
      deriveFounderReversibility('Launch paid job', {
        projectedSpendUsd: 101,
        activeRailCapUsd: 100,
      }).authorityRoute
    ).toBe('joseph-exact-four');
  });
});

describe('founder authority routing — separate non-Joseph routes', () => {
  it.each([
    ['Run legal and export-control review', 'specialist-review'],
    ['IRB and privacy compliance review', 'specialist-review'],
    ['The deploy credential is missing', 'platform-control'],
    ['Permission denied by the platform', 'platform-control'],
  ])('routes %s to %s', (intent, authorityRoute) => {
    expect(deriveFounderReversibility(intent).authorityRoute).toBe(authorityRoute);
  });

  it.each(['force-push main', 'hard reset the shared tree']) (
    'prohibits %s instead of making it approvable',
    (intent) => {
      expect(deriveFounderReversibility(intent)).toMatchObject({
        authorityRoute: 'prohibited-replan',
        reversible: false,
      });
    }
  );

  it('exports a prohibited-operation matcher that includes both operations', () => {
    expect(PROHIBITED_OPERATION_RE.test('force-push')).toBe(true);
    expect(PROHIBITED_OPERATION_RE.test('hard-reset')).toBe(true);
  });
});

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');
const CONSUMER_FILES = [
  resolve(REPO_ROOT, 'packages/mcp-server/src/holomesh/routes/founder-approval-policy.ts'),
  resolve(REPO_ROOT, 'packages/studio/src/app/api/quest-proof/next-actions/nextActions.ts'),
];

describe('divergence guard — consumers use the shared classifier', () => {
  for (const filePath of CONSUMER_FILES) {
    it(`${filePath} does not define a second exact-four classifier`, () => {
      const source = readFileSync(filePath, 'utf8');
      expect(source).toContain('deriveFounderReversibility');
      expect(source).not.toContain('const ACTIVE_RAIL_CAP_RE');
      expect(source).not.toContain('const PROHIBITED_OPERATION_RE');
    });
  }
});
