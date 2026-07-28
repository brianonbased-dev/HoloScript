/**
 * GameAbilityDirectives.test.ts
 *
 * Unit tests for `AbilityDirectives` and `getAbilityDirectives` exported from
 * `packages/core/src/types/base.ts`.  Tests cover:
 *   - default values on empty / missing properties
 *   - numeric coercion from number literals and numeric strings
 *   - surrounding-quote stripping on string values
 *   - all property aliases (snake_case, camelCase, short-form)
 *   - known authority envelope values pass through unchanged
 *   - unknown authority values map to 'server'
 */

import { describe, it, expect } from 'vitest';
import { getAbilityDirectives, type AbilityDirectives, type GameAbilityNode } from '../types/base';

// ---------------------------------------------------------------------------
// Helper: build a minimal GameAbilityNode with the given properties bag.
// ---------------------------------------------------------------------------
function makeNode(properties: Record<string, unknown>): GameAbilityNode {
  return {
    type: 'game-ability',
    name: 'test_ability',
    properties,
  };
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
describe('getAbilityDirectives — defaults on empty properties', () => {
  const d: AbilityDirectives = getAbilityDirectives(makeNode({}));

  it('cooldownMs defaults to 0', () => expect(d.cooldownMs).toBe(0));
  it('manaCost defaults to 0', () => expect(d.manaCost).toBe(0));
  it('gcdMs defaults to 0', () => expect(d.gcdMs).toBe(0));
  it('range defaults to 0', () => expect(d.range).toBe(0));
  it('damageType defaults to "physical"', () => expect(d.damageType).toBe('physical'));
  it('authorityEnvelope defaults to "server"', () => expect(d.authorityEnvelope).toBe('server'));
  it('castTimeMs defaults to 0', () => expect(d.castTimeMs).toBe(0));
});

// ---------------------------------------------------------------------------
// Numeric coercion — number literals
// ---------------------------------------------------------------------------
describe('getAbilityDirectives — numeric literal values', () => {
  it('reads cooldownMs from cooldown (number)', () => {
    expect(getAbilityDirectives(makeNode({ cooldown: 1500 })).cooldownMs).toBe(1500);
  });

  it('reads cooldownMs from cooldown_ms (number)', () => {
    expect(getAbilityDirectives(makeNode({ cooldown_ms: 2000 })).cooldownMs).toBe(2000);
  });

  it('reads cooldownMs from cooldownMs (camelCase, number)', () => {
    expect(getAbilityDirectives(makeNode({ cooldownMs: 500 })).cooldownMs).toBe(500);
  });

  it('reads manaCost from mana_cost (number)', () => {
    expect(getAbilityDirectives(makeNode({ mana_cost: 30 })).manaCost).toBe(30);
  });

  it('reads manaCost from manaCost (camelCase, number)', () => {
    expect(getAbilityDirectives(makeNode({ manaCost: 45 })).manaCost).toBe(45);
  });

  it('reads gcdMs from gcd (number)', () => {
    expect(getAbilityDirectives(makeNode({ gcd: 1500 })).gcdMs).toBe(1500);
  });

  it('reads gcdMs from gcd_ms (number)', () => {
    expect(getAbilityDirectives(makeNode({ gcd_ms: 750 })).gcdMs).toBe(750);
  });

  it('reads gcdMs from gcdMs (camelCase, number)', () => {
    expect(getAbilityDirectives(makeNode({ gcdMs: 1000 })).gcdMs).toBe(1000);
  });

  it('reads range (number)', () => {
    expect(getAbilityDirectives(makeNode({ range: 40 })).range).toBe(40);
  });

  it('reads castTimeMs from cast_time (number)', () => {
    expect(getAbilityDirectives(makeNode({ cast_time: 800 })).castTimeMs).toBe(800);
  });

  it('reads castTimeMs from cast_time_ms (number)', () => {
    expect(getAbilityDirectives(makeNode({ cast_time_ms: 600 })).castTimeMs).toBe(600);
  });

  it('reads castTimeMs from castTimeMs (camelCase, number)', () => {
    expect(getAbilityDirectives(makeNode({ castTimeMs: 1200 })).castTimeMs).toBe(1200);
  });
});

// ---------------------------------------------------------------------------
// Numeric coercion — numeric strings
// ---------------------------------------------------------------------------
describe('getAbilityDirectives — numeric string coercion', () => {
  it('coerces cooldown from numeric string "1500"', () => {
    expect(getAbilityDirectives(makeNode({ cooldown: '1500' })).cooldownMs).toBe(1500);
  });

  it('coerces mana_cost from numeric string "50"', () => {
    expect(getAbilityDirectives(makeNode({ mana_cost: '50' })).manaCost).toBe(50);
  });

  it('coerces gcd from numeric string "1000"', () => {
    expect(getAbilityDirectives(makeNode({ gcd: '1000' })).gcdMs).toBe(1000);
  });

  it('coerces range from numeric string "30"', () => {
    expect(getAbilityDirectives(makeNode({ range: '30' })).range).toBe(30);
  });

  it('coerces castTimeMs from numeric string "500"', () => {
    expect(getAbilityDirectives(makeNode({ cast_time: '500' })).castTimeMs).toBe(500);
  });

  it('falls back to 0 for non-numeric string on a numeric field', () => {
    expect(getAbilityDirectives(makeNode({ cooldown: 'fast' })).cooldownMs).toBe(0);
  });

  it('falls back to 0 for object value on a numeric field', () => {
    expect(getAbilityDirectives(makeNode({ cooldown: { ms: 500 } })).cooldownMs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Quote stripping on string fields
// ---------------------------------------------------------------------------
describe('getAbilityDirectives — quote stripping', () => {
  it('strips double quotes from damageType', () => {
    expect(getAbilityDirectives(makeNode({ damage_type: '"fire"' })).damageType).toBe('fire');
  });

  it('strips single quotes from damageType', () => {
    expect(getAbilityDirectives(makeNode({ damage_type: "'ice'" })).damageType).toBe('ice');
  });

  it('strips double quotes from authority envelope', () => {
    expect(
      getAbilityDirectives(makeNode({ authority: '"client_predicted"' })).authorityEnvelope
    ).toBe('client_predicted');
  });

  it('strips single quotes from authority envelope', () => {
    expect(getAbilityDirectives(makeNode({ authority: "'client'" })).authorityEnvelope).toBe(
      'client'
    );
  });

  it('does not strip partial or mismatched quotes', () => {
    // "fire (only leading quote) → not a wrapped string → treat as literal → unknown → 'physical'
    expect(getAbilityDirectives(makeNode({ damage_type: '"fire' })).damageType).toBe('"fire');
  });
});

// ---------------------------------------------------------------------------
// String alias coverage (damage_type / damageType)
// ---------------------------------------------------------------------------
describe('getAbilityDirectives — damageType aliases', () => {
  it('reads from damage_type (snake_case)', () => {
    expect(getAbilityDirectives(makeNode({ damage_type: 'fire' })).damageType).toBe('fire');
  });

  it('reads from damageType (camelCase)', () => {
    expect(getAbilityDirectives(makeNode({ damageType: 'shadow' })).damageType).toBe('shadow');
  });

  it('snake_case wins over camelCase when both present', () => {
    // damage_type is the first-checked alias
    expect(
      getAbilityDirectives(makeNode({ damage_type: 'fire', damageType: 'ice' })).damageType
    ).toBe('fire');
  });
});

// ---------------------------------------------------------------------------
// authorityEnvelope — all valid values and unknown mapping
// ---------------------------------------------------------------------------
describe('getAbilityDirectives — authorityEnvelope', () => {
  it('passes through "server"', () => {
    expect(getAbilityDirectives(makeNode({ authority: 'server' })).authorityEnvelope).toBe(
      'server'
    );
  });

  it('passes through "client_predicted"', () => {
    expect(
      getAbilityDirectives(makeNode({ authority: 'client_predicted' })).authorityEnvelope
    ).toBe('client_predicted');
  });

  it('passes through "client"', () => {
    expect(getAbilityDirectives(makeNode({ authority: 'client' })).authorityEnvelope).toBe(
      'client'
    );
  });

  it('maps unknown value to "server"', () => {
    expect(
      getAbilityDirectives(makeNode({ authority: 'peer_authoritative' })).authorityEnvelope
    ).toBe('server');
  });

  it('maps empty string to "server"', () => {
    expect(getAbilityDirectives(makeNode({ authority: '' })).authorityEnvelope).toBe('server');
  });

  it('reads from authority_envelope alias', () => {
    expect(getAbilityDirectives(makeNode({ authority_envelope: 'client' })).authorityEnvelope).toBe(
      'client'
    );
  });

  it('reads from authorityEnvelope (camelCase) alias', () => {
    expect(
      getAbilityDirectives(makeNode({ authorityEnvelope: 'client_predicted' })).authorityEnvelope
    ).toBe('client_predicted');
  });

  it('authority wins over authority_envelope when both present', () => {
    expect(
      getAbilityDirectives(makeNode({ authority: 'client', authority_envelope: 'server' }))
        .authorityEnvelope
    ).toBe('client');
  });
});

// ---------------------------------------------------------------------------
// Full realistic property bag (integration-style)
// ---------------------------------------------------------------------------
describe('getAbilityDirectives — full realistic property bag', () => {
  it('parses a typical fireball ability property bag correctly', () => {
    const node = makeNode({
      cooldown: '3000',
      mana_cost: 80,
      gcd: '1500',
      range: 60,
      damage_type: 'fire',
      authority: 'server',
      cast_time: 1200,
    });
    const d = getAbilityDirectives(node);
    expect(d).toEqual<AbilityDirectives>({
      cooldownMs: 3000,
      manaCost: 80,
      gcdMs: 1500,
      range: 60,
      damageType: 'fire',
      authorityEnvelope: 'server',
      castTimeMs: 1200,
    });
  });

  it('parses a client-predicted melee ability with camelCase keys', () => {
    const node = makeNode({
      cooldownMs: 500,
      manaCost: 0,
      gcdMs: 1000,
      range: 5,
      damageType: 'physical',
      authorityEnvelope: 'client_predicted',
      castTimeMs: 0,
    });
    const d = getAbilityDirectives(node);
    expect(d).toEqual<AbilityDirectives>({
      cooldownMs: 500,
      manaCost: 0,
      gcdMs: 1000,
      range: 5,
      damageType: 'physical',
      authorityEnvelope: 'client_predicted',
      castTimeMs: 0,
    });
  });
});
