import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IMPORT_SHIP_MODE,
  evaluatePush,
  importShipMetadata,
  workspaceDirectShipEnabled,
  workspaceShipMode,
} from '../shipPolicy';
import { importCreditCost } from '../importCost';
import { OPERATION_COSTS } from '@/lib/absorb/pricing';

describe('workspace ship policy', () => {
  it('imports default to branch + PR with direct ship off', () => {
    expect(DEFAULT_IMPORT_SHIP_MODE).toBe('branch-pr');
    expect(importShipMetadata('main')).toEqual({
      directShip: false,
      shipMode: 'branch-pr',
      defaultBranch: 'main',
    });
  });

  it('treats missing, legacy and non-boolean settings as OFF', () => {
    expect(workspaceDirectShipEnabled(null)).toBe(false);
    expect(workspaceDirectShipEnabled({ metadata: {} })).toBe(false);
    expect(workspaceDirectShipEnabled({ metadata: { directShip: 'true' } })).toBe(false);
    expect(workspaceShipMode({ metadata: { directShip: true } })).toBe('direct-ship');
  });

  it('with direct ship off, never pushes to the default branch', () => {
    expect(evaluatePush({ directShip: false, branch: 'main', defaultBranch: 'main' }).ok).toBe(false);
    expect(evaluatePush({ directShip: false, branch: 'develop', defaultBranch: 'develop' }).ok).toBe(false);
    expect(evaluatePush({ directShip: false, branch: 'refs/heads/trunk', defaultBranch: 'trunk' }).ok).toBe(false);
    // Unknown default: main/master are protected, and so is "current branch".
    expect(evaluatePush({ directShip: false, branch: 'master', defaultBranch: null }).ok).toBe(false);
    expect(evaluatePush({ directShip: false, branch: undefined, defaultBranch: 'main' }).ok).toBe(false);
    expect(evaluatePush({ directShip: false, branch: 'HEAD', defaultBranch: 'main' }).ok).toBe(false);
    expect(evaluatePush({ directShip: false, branch: 'studio/fix-1', defaultBranch: 'main' }).ok).toBe(true);
  });

  it('with direct ship on, pushes to the default branch are allowed', () => {
    expect(evaluatePush({ directShip: true, branch: 'main', defaultBranch: 'main' }).ok).toBe(true);
  });
});

describe('import credit cost', () => {
  it('comes from the real price table (deep absorb, the op absorb-service charges)', () => {
    const cost = importCreditCost();
    expect(cost.operation).toBe('absorb_deep');
    expect(cost.credits).toBe(OPERATION_COSTS.absorb_deep.baseCostCents);
    expect(cost.label).toContain(String(OPERATION_COSTS.absorb_deep.baseCostCents));
    expect(importCreditCost({ shallow: true }).credits).toBe(
      OPERATION_COSTS.absorb_shallow.baseCostCents
    );
  });
});
