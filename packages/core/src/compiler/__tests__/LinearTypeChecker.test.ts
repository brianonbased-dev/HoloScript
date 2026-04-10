import { describe, it, expect } from 'vitest';
import {
  LinearTypeChecker,
  BUILTIN_RESOURCES,
  TRAIT_RESOURCE_MAP,
} from '../safety/LinearTypeChecker';
import type { EffectASTNode } from '../safety/EffectChecker';

function makeNode(overrides: Partial<EffectASTNode> = {}): EffectASTNode {
  return {
    type: 'Object',
    name: 'TestNode',
    traits: [],
    calls: [],
    children: [],
    ...overrides,
  };
}

// ─── Built-in Resources ────────────────────────────────────────────────

describe('BUILTIN_RESOURCES', () => {
  it('defines InventoryItem with consuming and producing ops', () => {
    const res = BUILTIN_RESOURCES.InventoryItem;
    expect(res.name).toBe('InventoryItem');
    expect(res.consumingOps).toContain('destroyItem');
    expect(res.consumingOps).toContain('consumeItem');
    expect(res.producingOps).toContain('giveItem');
  });

  it('defines EntityAuthority resource', () => {
    const res = BUILTIN_RESOURCES.EntityAuthority;
    expect(res.name).toBe('EntityAuthority');
    expect(res.consumingOps).toContain('revokeAccess');
    expect(res.producingOps).toContain('transferOwnership');
  });

  it('ZonePermit has drop ability', () => {
    const res = BUILTIN_RESOURCES.ZonePermit;
    expect(res.abilities.has('drop')).toBe(true);
  });

  it('AgentHandle tracks spawn and kill', () => {
    const res = BUILTIN_RESOURCES.AgentHandle;
    expect(res.consumingOps).toContain('killAgent');
    expect(res.producingOps).toContain('spawnAgent');
  });
});

// ─── Trait Resource Map ────────────────────────────────────────────────

describe('TRAIT_RESOURCE_MAP', () => {
  it('maps inventory-related traits to InventoryItem', () => {
    expect(TRAIT_RESOURCE_MAP['@inventory']).toBe('InventoryItem');
    expect(TRAIT_RESOURCE_MAP['@tradeable']).toBe('InventoryItem');
    expect(TRAIT_RESOURCE_MAP['@consumable']).toBe('InventoryItem');
    expect(TRAIT_RESOURCE_MAP['@loot']).toBe('InventoryItem');
  });

  it('maps ownership traits to EntityAuthority', () => {
    expect(TRAIT_RESOURCE_MAP['@owned']).toBe('EntityAuthority');
    expect(TRAIT_RESOURCE_MAP['@delegated']).toBe('EntityAuthority');
  });

  it('maps @zone to ZonePermit', () => {
    expect(TRAIT_RESOURCE_MAP['@zone']).toBe('ZonePermit');
  });

  it('maps agent traits to AgentHandle', () => {
    expect(TRAIT_RESOURCE_MAP['@agent']).toBe('AgentHandle');
    expect(TRAIT_RESOURCE_MAP['@npc']).toBe('AgentHandle');
  });
});

// ─── LinearTypeChecker — checkNode ─────────────────────────────────────

describe('LinearTypeChecker — checkNode', () => {
  it('passes for nodes without resource traits', () => {
    const checker = new LinearTypeChecker();
    const result = checker.checkNode(makeNode({ traits: ['@mesh', '@physics'] }));
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('detects resource from @inventory trait', () => {
    const checker = new LinearTypeChecker();
    const result = checker.checkNode(makeNode({ name: 'sword', traits: ['@inventory'] }));
    // Resource tracked but no violation (just owned, no consuming calls)
    expect(result.trackedResources.has('sword')).toBe(true);
    expect(result.trackedResources.get('sword')).toBe('owned');
  });

  it('detects use-after-consume violation', () => {
    const checker = new LinearTypeChecker();
    const node = makeNode({
      name: 'potion',
      traits: ['@consumable'],
      calls: ['consumeItem', 'consumeItem'], // Double consume
    });
    const result = checker.checkNode(node);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.kind === 'use-after-consume')).toBe(true);
  });

  it('detects use-after-move when accessing moved resource', () => {
    const checker = new LinearTypeChecker();
    // giveItem is a producing op → triggers move on owned resource
    // Then consumeItem on a moved resource → use-after-move
    const node = makeNode({
      name: 'gem',
      traits: ['@tradeable'],
      calls: ['giveItem', 'consumeItem'],
    });
    const result = checker.checkNode(node);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.kind === 'use-after-move')).toBe(true);
  });

  it('allows valid consumption of owned resource', () => {
    const checker = new LinearTypeChecker();
    const node = makeNode({
      name: 'item',
      traits: ['@inventory'],
      calls: ['destroyItem'],
    });
    const result = checker.checkNode(node);
    // Consumed successfully, no violations
    expect(result.violations.filter((v) => v.severity === 'error')).toHaveLength(0);
    expect(result.trackedResources.get('item')).toBe('consumed');
  });

  it('checks children for references to consumed resources', () => {
    const checker = new LinearTypeChecker();
    const parent = makeNode({
      name: 'scroll',
      traits: ['@consumable'],
      calls: ['consumeItem'],
      children: [
        makeNode({ name: 'scroll' }), // Reference to consumed resource
      ],
    });
    const result = checker.checkNode(parent);
    expect(result.violations.some((v) => v.kind === 'use-after-consume')).toBe(true);
  });
});

// ─── LinearTypeChecker — checkModule ───────────────────────────────────

describe('LinearTypeChecker — checkModule', () => {
  it('passes for module with no resource nodes', () => {
    const checker = new LinearTypeChecker();
    const result = checker.checkModule([
      makeNode({ name: 'cube', traits: ['@mesh'] }),
      makeNode({ name: 'light', traits: ['@light'] }),
    ]);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('detects resource leaks for non-Drop resources', () => {
    const checker = new LinearTypeChecker();
    const result = checker.checkModule([
      makeNode({ name: 'key', traits: ['@inventory'] }),
      // key is never consumed or transferred → leak
    ]);
    expect(result.violations.some((v) => v.kind === 'resource-leak')).toBe(true);
  });

  it('does not flag resource leak for Drop-capable resources', () => {
    const checker = new LinearTypeChecker();
    const result = checker.checkModule([
      makeNode({ name: 'permit', traits: ['@zone'] }),
      // ZonePermit has Drop ability, so not using it is OK
    ]);
    expect(result.violations.filter((v) => v.kind === 'resource-leak')).toHaveLength(0);
  });

  it('tracks resource states across module nodes', () => {
    const checker = new LinearTypeChecker();
    const result = checker.checkModule([
      makeNode({ name: 'coin', traits: ['@tradeable'] }),
      makeNode({ name: 'handler', calls: ['destroyItem'] }),
    ]);
    // destroyItem consumes the InventoryItem tracked from 'coin'
    expect(result.trackedResources.size).toBeGreaterThan(0);
  });
});

// ─── Configuration ─────────────────────────────────────────────────────

describe('LinearTypeChecker — configuration', () => {
  it('supports custom resource types', () => {
    const checker = new LinearTypeChecker({
      customResources: {
        MagicOrb: {
          name: 'MagicOrb',
          abilities: new Set(),
          consumingOps: ['shatterOrb'],
          producingOps: ['craftOrb'],
        },
      },
      customTraitMap: { '@magic_orb': 'MagicOrb' },
    });

    const result = checker.checkModule([makeNode({ name: 'orb', traits: ['@magic_orb'] })]);
    expect(result.trackedResources.has('orb')).toBe(true);
    expect(result.violations.some((v) => v.kind === 'resource-leak')).toBe(true);
  });

  it('respects strictLeaks=false (warnings instead of errors)', () => {
    const checker = new LinearTypeChecker({ strictLeaks: false });
    const result = checker.checkModule([makeNode({ name: 'item', traits: ['@inventory'] })]);
    const leaks = result.violations.filter((v) => v.kind === 'resource-leak');
    expect(leaks.length).toBeGreaterThan(0);
    expect(leaks[0].severity).toBe('warning');
    expect(result.passed).toBe(true); // Warnings don't fail
  });

  it('handles @ prefix normalization for traits', () => {
    const checker = new LinearTypeChecker();
    const node = makeNode({ name: 'item', traits: ['inventory'] }); // No @ prefix
    const result = checker.checkNode(node);
    expect(result.trackedResources.has('item')).toBe(true);
  });
});

// ─── Edge Cases ────────────────────────────────────────────────────────

describe('LinearTypeChecker — edge cases', () => {
  it('handles node with no traits', () => {
    const checker = new LinearTypeChecker();
    const result = checker.checkNode(makeNode());
    expect(result.passed).toBe(true);
  });

  it('handles node with no calls', () => {
    const checker = new LinearTypeChecker();
    const result = checker.checkNode(makeNode({ traits: ['@mesh'] }));
    expect(result.passed).toBe(true);
  });

  it('handles empty module', () => {
    const checker = new LinearTypeChecker();
    const result = checker.checkModule([]);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('first trait wins for resource registration', () => {
    const checker = new LinearTypeChecker();
    const node = makeNode({
      name: 'item',
      traits: ['@inventory', '@owned'], // Both map to different resource types
    });
    const result = checker.checkNode(node);
    // Should register as InventoryItem (first trait wins)
    expect(result.trackedResources.has('item')).toBe(true);
  });
});
