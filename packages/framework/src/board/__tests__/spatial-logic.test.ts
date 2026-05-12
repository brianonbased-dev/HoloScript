/**
 * Spatial Logic Framework unit tests
 *
 * Coverage:
 * - Predicate kind validation + edge cases
 * - Action kind validation + edge cases
 * - Rule composition (predicates + actions)
 * - Clone deep-copies tuples + metadata
 * - Type guards
 */

import { describe, it, expect } from 'vitest';
import {
  PREDICATE_KINDS,
  ACTION_KINDS,
  isSupportedPredicateKind,
  isSupportedActionKind,
  validateSpatialPredicate,
  validateSpatialAction,
  validateSpatialRule,
  cloneSpatialPredicate,
  cloneSpatialAction,
  cloneSpatialRule,
} from '../spatial-logic';
import type { SpatialPredicate, SpatialAction, SpatialRule } from '../spatial-logic';

describe('SLF predicates', () => {
  const basePredicate: SpatialPredicate = {
    id: 'pred_01',
    kind: 'in_zone',
    targetId: 'zone_market',
  };

  it('validates a well-formed predicate', () => {
    expect(validateSpatialPredicate(basePredicate)).toEqual([]);
  });

  it('rejects missing id', () => {
    expect(validateSpatialPredicate({ ...basePredicate, id: '' })).toContain(
      'SpatialPredicate.id is required.',
    );
  });

  it('rejects unsupported kind', () => {
    expect(
      validateSpatialPredicate({ ...basePredicate, kind: 'unknown' as any }),
    ).toContain('SpatialPredicate.kind is unsupported: unknown.');
  });

  it('rejects predicate-other without kindLabel', () => {
    expect(
      validateSpatialPredicate({ ...basePredicate, kind: 'predicate-other' }),
    ).toContain('SpatialPredicate pred_01 kind=predicate-other requires kindLabel.');
  });

  it('accepts predicate-other with kindLabel', () => {
    expect(
      validateSpatialPredicate({
        ...basePredicate,
        kind: 'predicate-other',
        kindLabel: 'custom_check',
      }),
    ).toEqual([]);
  });

  it('rejects negative radius', () => {
    expect(
      validateSpatialPredicate({ ...basePredicate, kind: 'entity_near', radius: -1 }),
    ).toContain('SpatialPredicate pred_01.radius must be a non-negative finite number.');
  });

  it('rejects invalid timeRange', () => {
    expect(
      validateSpatialPredicate({ ...basePredicate, kind: 'time_of_day', timeRange: [18, 6] }),
    ).toContain('SpatialPredicate pred_01.timeRange must be [start, end] with 0 <= start < end <= 24.');
  });

  it('accepts valid timeRange', () => {
    expect(
      validateSpatialPredicate({ ...basePredicate, kind: 'time_of_day', timeRange: [6, 18] }),
    ).toEqual([]);
  });

  it('rejects chance out of bounds', () => {
    expect(
      validateSpatialPredicate({ ...basePredicate, kind: 'probability', chance: 1.2 }),
    ).toContain('SpatialPredicate pred_01.chance must be a finite number in [0, 1].');
  });

  it('accepts chance in bounds', () => {
    expect(
      validateSpatialPredicate({ ...basePredicate, kind: 'probability', chance: 0.5 }),
    ).toEqual([]);
  });

  it('rejects malformed position tuple', () => {
    expect(
      validateSpatialPredicate({ ...basePredicate, kind: 'entity_near', position: [1, 2, NaN] }),
    ).toContain('SpatialPredicate pred_01.position must be a finite [x, y, z] tuple.');
  });

  it('accepts valid position tuple', () => {
    expect(
      validateSpatialPredicate({ ...basePredicate, kind: 'entity_near', position: [1, 2, 3] }),
    ).toEqual([]);
  });
});

describe('SLF actions', () => {
  const baseAction: SpatialAction = {
    id: 'act_01',
    kind: 'grant_item',
    targetId: 'item_key',
  };

  it('validates a well-formed action', () => {
    expect(validateSpatialAction(baseAction)).toEqual([]);
  });

  it('rejects missing id', () => {
    expect(validateSpatialAction({ ...baseAction, id: '' })).toContain(
      'SpatialAction.id is required.',
    );
  });

  it('rejects unsupported kind', () => {
    expect(validateSpatialAction({ ...baseAction, kind: 'unknown' as any })).toContain(
      'SpatialAction.kind is unsupported: unknown.',
    );
  });

  it('rejects action-other without kindLabel', () => {
    expect(
      validateSpatialAction({ ...baseAction, kind: 'action-other' }),
    ).toContain('SpatialAction act_01 kind=action-other requires kindLabel.');
  });

  it('accepts action-other with kindLabel', () => {
    expect(
      validateSpatialAction({ ...baseAction, kind: 'action-other', kindLabel: 'custom_act' }),
    ).toEqual([]);
  });

  it('rejects quantity < 1', () => {
    expect(
      validateSpatialAction({ ...baseAction, quantity: 0 }),
    ).toContain('SpatialAction act_01.quantity must be a finite number >= 1.');
  });

  it('accepts valid quantity', () => {
    expect(validateSpatialAction({ ...baseAction, quantity: 3 })).toEqual([]);
  });

  it('rejects malformed spawnPosition', () => {
    expect(
      validateSpatialAction({ ...baseAction, kind: 'spawn_entity', spawnPosition: [0, 0] as any }),
    ).toContain('SpatialAction act_01.spawnPosition must be a finite [x, y, z] tuple.');
  });
});

describe('SLF rules', () => {
  const baseRule: SpatialRule = {
    id: 'rule_01',
    name: 'Open Gate',
    predicates: [
      { id: 'p1', kind: 'has_item', targetId: 'item_key' },
    ],
    actions: [
      { id: 'a1', kind: 'unlock_zone', targetId: 'zone_inner' },
    ],
  };

  it('validates a well-formed rule', () => {
    expect(validateSpatialRule(baseRule)).toEqual([]);
  });

  it('rejects missing rule id', () => {
    expect(validateSpatialRule({ ...baseRule, id: '' })).toContain(
      'SpatialRule.id is required.',
    );
  });

  it('rejects missing rule name', () => {
    expect(validateSpatialRule({ ...baseRule, name: '' })).toContain(
      'SpatialRule rule_01.name is required.',
    );
  });

  it('rejects non-array predicates', () => {
    expect(
      validateSpatialRule({ ...baseRule, predicates: null as any }),
    ).toContain('SpatialRule rule_01.predicates must be an array.');
  });

  it('rejects non-array actions', () => {
    expect(
      validateSpatialRule({ ...baseRule, actions: null as any }),
    ).toContain('SpatialRule rule_01.actions must be an array.');
  });

  it('rejects empty actions', () => {
    expect(
      validateSpatialRule({ ...baseRule, actions: [] }),
    ).toContain('SpatialRule rule_01.actions must be non-empty.');
  });

  it('validates nested predicate errors', () => {
    const badRule: SpatialRule = {
      ...baseRule,
      predicates: [{ id: 'bad', kind: 'unknown' as any }],
    };
    expect(validateSpatialRule(badRule)).toContain(
      'SpatialRule rule_01.predicates[bad]: SpatialPredicate.kind is unsupported: unknown.',
    );
  });

  it('validates nested action errors', () => {
    const badRule: SpatialRule = {
      ...baseRule,
      actions: [{ id: 'bad', kind: 'unknown' as any }],
    };
    expect(validateSpatialRule(badRule)).toContain(
      'SpatialRule rule_01.actions[bad]: SpatialAction.kind is unsupported: unknown.',
    );
  });

  it('rejects invalid predicateMode', () => {
    expect(
      validateSpatialRule({ ...baseRule, predicateMode: 'maybe' as any }),
    ).toContain("SpatialRule rule_01.predicateMode must be 'all' or 'any'.");
  });

  it('accepts valid predicateMode values', () => {
    expect(validateSpatialRule({ ...baseRule, predicateMode: 'all' })).toEqual([]);
    expect(validateSpatialRule({ ...baseRule, predicateMode: 'any' })).toEqual([]);
  });

  it('rejects non-finite priority', () => {
    expect(
      validateSpatialRule({ ...baseRule, priority: NaN }),
    ).toContain('SpatialRule rule_01.priority must be a finite number.');
  });
});

describe('SLF clones', () => {
  it('deep-clones predicate tuples', () => {
    const p: SpatialPredicate = {
      id: 'p1',
      kind: 'entity_near',
      position: [1, 2, 3],
      timeRange: [6, 18],
      metadata: { foo: 'bar' },
    };
    const c = cloneSpatialPredicate(p);
    expect(c).toEqual(p);
    expect(c.position).not.toBe(p.position);
    expect(c.timeRange).not.toBe(p.timeRange);
    expect(c.metadata).not.toBe(p.metadata);
  });

  it('deep-clones action tuples', () => {
    const a: SpatialAction = {
      id: 'a1',
      kind: 'spawn_entity',
      spawnPosition: [4, 5, 6],
      metadata: { count: 2 },
    };
    const c = cloneSpatialAction(a);
    expect(c).toEqual(a);
    expect(c.spawnPosition).not.toBe(a.spawnPosition);
    expect(c.metadata).not.toBe(a.metadata);
  });

  it('deep-clones rule with predicates and actions', () => {
    const r: SpatialRule = {
      id: 'r1',
      name: 'Test',
      predicates: [
        { id: 'p1', kind: 'in_zone', targetId: 'z1' },
      ],
      actions: [
        { id: 'a1', kind: 'broadcast_event', targetId: 'evt' },
      ],
      metadata: { key: 'val' },
    };
    const c = cloneSpatialRule(r);
    expect(c).toEqual(r);
    expect(c.predicates).not.toBe(r.predicates);
    expect(c.actions).not.toBe(r.actions);
    expect(c.metadata).not.toBe(r.metadata);
  });
});

describe('SLF type guards', () => {
  it('matches every predicate kind', () => {
    for (const kind of PREDICATE_KINDS) {
      expect(isSupportedPredicateKind(kind)).toBe(true);
    }
  });

  it('rejects unknown predicate kind', () => {
    expect(isSupportedPredicateKind('nope')).toBe(false);
  });

  it('matches every action kind', () => {
    for (const kind of ACTION_KINDS) {
      expect(isSupportedActionKind(kind)).toBe(true);
    }
  });

  it('rejects unknown action kind', () => {
    expect(isSupportedActionKind('nope')).toBe(false);
  });
});
