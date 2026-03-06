/**
 * @fileoverview Tests for the Linear Type Checker (Layer 6)
 *
 * Tests for Move-inspired linear resource types:
 * - Built-in resource type definitions
 * - Trait-to-resource mapping
 * - Ownership tracking (owned, moved, consumed)
 * - Violation detection (use-after-move, use-after-consume, leak, etc.)
 * - Integration with the full safety pass
 */

import { describe, it, expect } from 'vitest';
import {
  LinearTypeChecker,
  BUILTIN_RESOURCES,
  TRAIT_RESOURCE_MAP,
} from '../LinearTypeChecker';
import { runSafetyPass } from '../CompilerSafetyPass';
import type { EffectASTNode } from '../EffectChecker';
import type { ResourceAbility } from '../../../types/linear';

// =============================================================================
// Built-in Resource Types
// =============================================================================

describe('BUILTIN_RESOURCES', () => {
  it('defines InventoryItem as fully linear (no copy, no drop)', () => {
    const item = BUILTIN_RESOURCES['InventoryItem'];
    expect(item).toBeDefined();
    expect(item.abilities.has('copy')).toBe(false);
    expect(item.abilities.has('drop')).toBe(false);
  });

  it('defines EntityAuthority as fully linear', () => {
    const auth = BUILTIN_RESOURCES['EntityAuthority'];
    expect(auth).toBeDefined();
    expect(auth.abilities.has('copy')).toBe(false);
    expect(auth.abilities.has('drop')).toBe(false);
  });

  it('defines ZonePermit with drop but no copy', () => {
    const permit = BUILTIN_RESOURCES['ZonePermit'];
    expect(permit).toBeDefined();
    expect(permit.abilities.has('drop')).toBe(true);
    expect(permit.abilities.has('copy')).toBe(false);
  });

  it('defines CapabilityToken as fully linear', () => {
    const token = BUILTIN_RESOURCES['CapabilityToken'];
    expect(token).toBeDefined();
    expect(token.abilities.has('copy')).toBe(false);
    expect(token.abilities.has('drop')).toBe(false);
  });

  it('defines AgentHandle as fully linear', () => {
    const handle = BUILTIN_RESOURCES['AgentHandle'];
    expect(handle).toBeDefined();
    expect(handle.abilities.has('copy')).toBe(false);
    expect(handle.abilities.has('drop')).toBe(false);
  });

  it('InventoryItem has correct consuming/producing ops', () => {
    const item = BUILTIN_RESOURCES['InventoryItem'];
    expect(item.consumingOps).toContain('destroyItem');
    expect(item.consumingOps).toContain('consumeItem');
    expect(item.producingOps).toContain('giveItem');
  });

  it('AgentHandle consumed by killAgent, produced by spawnAgent', () => {
    const handle = BUILTIN_RESOURCES['AgentHandle'];
    expect(handle.consumingOps).toContain('killAgent');
    expect(handle.producingOps).toContain('spawnAgent');
  });
});

// =============================================================================
// Trait-to-Resource Mapping
// =============================================================================

describe('TRAIT_RESOURCE_MAP', () => {
  it('maps @inventory to InventoryItem', () => {
    expect(TRAIT_RESOURCE_MAP['@inventory']).toBe('InventoryItem');
  });

  it('maps @tradeable to InventoryItem', () => {
    expect(TRAIT_RESOURCE_MAP['@tradeable']).toBe('InventoryItem');
  });

  it('maps @consumable to InventoryItem', () => {
    expect(TRAIT_RESOURCE_MAP['@consumable']).toBe('InventoryItem');
  });

  it('maps @owned to EntityAuthority', () => {
    expect(TRAIT_RESOURCE_MAP['@owned']).toBe('EntityAuthority');
  });

  it('maps @delegated to EntityAuthority', () => {
    expect(TRAIT_RESOURCE_MAP['@delegated']).toBe('EntityAuthority');
  });

  it('maps @zone to ZonePermit', () => {
    expect(TRAIT_RESOURCE_MAP['@zone']).toBe('ZonePermit');
  });

  it('maps @agent to AgentHandle', () => {
    expect(TRAIT_RESOURCE_MAP['@agent']).toBe('AgentHandle');
  });

  it('does not map non-resource traits', () => {
    expect(TRAIT_RESOURCE_MAP['@mesh']).toBeUndefined();
    expect(TRAIT_RESOURCE_MAP['@physics']).toBeUndefined();
    expect(TRAIT_RESOURCE_MAP['@audio']).toBeUndefined();
  });
});

// =============================================================================
// LinearTypeChecker — Ownership Tracking
// =============================================================================

describe('LinearTypeChecker', () => {
  const checker = new LinearTypeChecker();

  it('passes for empty input', () => {
    const result = checker.checkModule([]);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('passes for nodes without resource traits', () => {
    const nodes: EffectASTNode[] = [
      { type: 'object', name: 'Rock', traits: ['@mesh', '@physics'], calls: [] },
      { type: 'object', name: 'Light', traits: ['@light'], calls: ['playSound'] },
    ];
    const result = checker.checkModule(nodes);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('detects resource from @inventory trait', () => {
    const nodes: EffectASTNode[] = [
      { type: 'object', name: 'Sword', traits: ['@mesh', '@inventory'], calls: ['destroyItem'] },
    ];
    const result = checker.checkModule(nodes);
    expect(result.trackedResources.has('Sword')).toBe(true);
  });

  it('consumes resource with destroyItem call', () => {
    const nodes: EffectASTNode[] = [
      { type: 'object', name: 'Potion', traits: ['@consumable'], calls: ['consumeItem'] },
    ];
    const result = checker.checkModule(nodes);
    expect(result.trackedResources.get('Potion')).toBe('consumed');
    // Consumed = no leak
    expect(result.passed).toBe(true);
  });

  it('moves resource with giveItem call', () => {
    const nodes: EffectASTNode[] = [
      { type: 'object', name: 'Gift', traits: ['@inventory'], calls: ['giveItem'] },
    ];
    const result = checker.checkModule(nodes);
    expect(result.trackedResources.get('Gift')).toBe('moved');
    // Moved = no leak
    expect(result.passed).toBe(true);
  });
});

// =============================================================================
// LinearTypeChecker — Violation Detection
// =============================================================================

describe('LinearTypeChecker violations', () => {
  const checker = new LinearTypeChecker();

  it('detects resource leak for InventoryItem (no drop)', () => {
    const nodes: EffectASTNode[] = [
      { type: 'object', name: 'Sword', traits: ['@inventory'], calls: [] },
    ];
    const result = checker.checkModule(nodes);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].kind).toBe('resource-leak');
    expect(result.violations[0].resourceType).toBe('InventoryItem');
    expect(result.violations[0].resourceName).toBe('Sword');
  });

  it('no leak for ZonePermit (has drop)', () => {
    const nodes: EffectASTNode[] = [
      { type: 'object', name: 'SafeZone', traits: ['@zone'], calls: [] },
    ];
    const result = checker.checkModule(nodes);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('detects use-after-consume for double destroyItem', () => {
    // Two separate nodes where the second tries to consume an already-consumed resource
    const nodes: EffectASTNode[] = [
      { type: 'object', name: 'Potion', traits: ['@consumable'], calls: ['consumeItem'] },
      { type: 'action', name: 'Potion', traits: [], calls: ['consumeItem'] },
    ];
    // The second node's call to consumeItem on 'Potion' happens at module level
    // Since the first node already consumed it, the checker detects it via checkReferencesInNode
    const result = checker.checkModule(nodes);
    // The second node references a consumed resource
    const useAfterConsume = result.violations.filter(v => v.kind === 'use-after-consume');
    expect(useAfterConsume.length).toBeGreaterThan(0);
  });

  it('detects use-after-move for accessing transferred resource', () => {
    // First node produces and moves the resource, second node tries to use it
    const nodes: EffectASTNode[] = [
      { type: 'object', name: 'Crown', traits: ['@owned'], calls: ['transferOwnership'] },
      { type: 'action', name: 'Crown', traits: [], calls: ['revokeAccess'] },
    ];
    const result = checker.checkModule(nodes);
    const useAfterMove = result.violations.filter(v => v.kind === 'use-after-move');
    expect(useAfterMove.length).toBeGreaterThan(0);
  });

  it('detects leak for EntityAuthority (no drop)', () => {
    const nodes: EffectASTNode[] = [
      { type: 'object', name: 'AdminToken', traits: ['@owned'], calls: [] },
    ];
    const result = checker.checkModule(nodes);
    expect(result.passed).toBe(false);
    const leaks = result.violations.filter(v => v.kind === 'resource-leak');
    expect(leaks.length).toBe(1);
    expect(leaks[0].resourceType).toBe('EntityAuthority');
  });

  it('detects leak for AgentHandle (no drop)', () => {
    const nodes: EffectASTNode[] = [
      { type: 'object', name: 'Bot', traits: ['@agent'], calls: [] },
    ];
    const result = checker.checkModule(nodes);
    expect(result.passed).toBe(false);
    const leaks = result.violations.filter(v => v.kind === 'resource-leak');
    expect(leaks.length).toBe(1);
    expect(leaks[0].resourceType).toBe('AgentHandle');
  });
});

// =============================================================================
// LinearTypeChecker — Configuration
// =============================================================================

describe('LinearTypeChecker config', () => {
  it('allows custom resource types', () => {
    const checker = new LinearTypeChecker({
      customResources: {
        CustomToken: {
          name: 'CustomToken',
          abilities: new Set<ResourceAbility>(),
          consumingOps: ['burnToken'],
          producingOps: ['mintToken'],
        },
      },
      customTraitMap: { '@mintable': 'CustomToken' },
    });

    const nodes: EffectASTNode[] = [
      { type: 'object', name: 'MyToken', traits: ['@mintable'], calls: [] },
    ];
    const result = checker.checkModule(nodes);
    expect(result.passed).toBe(false);
    expect(result.violations[0].kind).toBe('resource-leak');
    expect(result.violations[0].resourceType).toBe('CustomToken');
  });

  it('strictLeaks=false makes leaks warnings instead of errors', () => {
    const checker = new LinearTypeChecker({ strictLeaks: false });
    const nodes: EffectASTNode[] = [
      { type: 'object', name: 'Sword', traits: ['@inventory'], calls: [] },
    ];
    const result = checker.checkModule(nodes);
    // With strictLeaks=false, leaks are warnings, not errors
    expect(result.passed).toBe(true); // No errors
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].severity).toBe('warning');
  });
});

// =============================================================================
// Integration with Safety Pass
// =============================================================================

describe('Linear types in runSafetyPass', () => {
  it('safe module with no resources passes linear check', () => {
    const nodes: EffectASTNode[] = [
      {
        type: 'object', name: 'SafePlayer',
        traits: ['@mesh', '@audio'],
        calls: [],
        declaredEffects: ['render:spawn', 'audio:play'],
      },
    ];
    const result = runSafetyPass(nodes, {
      moduleId: 'safe-game',
      targetPlatforms: ['quest3'],
      trustLevel: 'basic',
    });
    expect(result.report.linear.passed).toBe(true);
    expect(result.report.linear.violations).toHaveLength(0);
    expect(result.report.linear.trackedResources).toBe(0);
  });

  it('module with resource leak reports in linear section', () => {
    const nodes: EffectASTNode[] = [
      {
        type: 'object', name: 'LeakyItem',
        traits: ['@mesh', '@inventory'],
        calls: [],
        declaredEffects: ['render:spawn', 'inventory:take', 'inventory:give'],
      },
    ];
    const result = runSafetyPass(nodes, {
      moduleId: 'leaky-game',
      trustLevel: 'trusted',
    });
    expect(result.report.linear.passed).toBe(false);
    expect(result.report.linear.violations.length).toBeGreaterThan(0);
    expect(result.report.linear.violations[0].kind).toBe('resource-leak');
  });

  it('linear violations affect overall verdict', () => {
    const nodes: EffectASTNode[] = [
      {
        type: 'object', name: 'LeakyAuth',
        traits: ['@owned'],
        calls: [],
        declaredEffects: ['authority:own'],
      },
    ];
    const result = runSafetyPass(nodes, {
      moduleId: 'auth-leak',
      trustLevel: 'trusted',
    });
    // The resource leak makes it unsafe
    expect(result.report.verdict).toBe('unsafe');
    expect(result.passed).toBe(false);
  });

  it('consumed resource passes linear check', () => {
    const nodes: EffectASTNode[] = [
      {
        type: 'object', name: 'UsedItem',
        traits: ['@consumable'],
        calls: ['consumeItem'],
        declaredEffects: ['inventory:take', 'inventory:give', 'inventory:destroy'],
      },
    ];
    const result = runSafetyPass(nodes, {
      moduleId: 'consume-game',
      trustLevel: 'trusted',
    });
    expect(result.report.linear.passed).toBe(true);
  });

  it('formatted report includes linear section', () => {
    const nodes: EffectASTNode[] = [
      { type: 'object', name: 'A', traits: ['@mesh'], calls: [], declaredEffects: ['render:spawn'] },
    ];
    const result = runSafetyPass(nodes, { moduleId: 'format-test', trustLevel: 'basic' });
    expect(result.formattedReport).toContain('Linear Types:');
    expect(result.formattedReport).toContain('resources tracked');
  });
});
