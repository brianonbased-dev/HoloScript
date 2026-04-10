/**
 * trait-semantic-edge-cases.scenario.ts — LIVING-SPEC: Trait Composition & Semantic Edge Cases
 *
 * Tests the robustness of the HoloScript declarative semantic engine:
 * - Overlapping/Contradictory Traits: Gracefully isolating traits that conflict (e.g. @pathfinding vs @stationary).
 * - Dynamic Trait Injection: Runtime validation when adding/removing traits mid-simulation.
 * - Hardware/IoT Degradation: Handling sensor dropouts when mapping physical traits back to virtual.
 */
import { describe, it, expect } from 'vitest';

export interface SemanticTrait {
  name: string;
  category: 'motion' | 'visual' | 'networking' | 'cognitive' | 'hardware';
  weight: number;
}

export interface SpatialEntity {
  id: string;
  traits: Set<string>;
  activeSensors: number;
}

// 1. Contradictory constraints
export function validateTraitComposition(traitRegistry: Map<string, SemanticTrait>, addedTraits: string[]): { valid: boolean; conflicts: string[] } {
  const conflicts: string[] = [];
  const categorized = new Map<string, string[]>();

  for (const t of addedTraits) {
    const data = traitRegistry.get(t);
    if (!data) continue;
    
    // Simple heuristic: Enforce max 1 motion constraint trait for predictability 
    if (data.category === 'motion') {
      if (!categorized.has('motion')) {
        categorized.set('motion', []);
      }
      categorized.get('motion')!.push(t);
    }
  }

  // Conflict if multiple motion traits are attached (e.g. stationary + pathfinding)
  const motionTraits = categorized.get('motion') || [];
  if (motionTraits.length > 1) {
    conflicts.push(...motionTraits);
  }

  return { valid: conflicts.length === 0, conflicts };
}

// 2. Dynamic Trait Injection mid-simulation
export function injectRuntimeTrait(entity: SpatialEntity, trait: string): boolean {
  if (entity.traits.has(trait)) return false; // Trait already exists
  
  if (entity.traits.size >= 20) {
    throw new Error('TRAIT_OVERLOAD: Entity exceeds maximum safe runtime trait volume (20).');
  }

  entity.traits.add(trait);
  return true;
}

// 3. Hardware/IoT Mapping Edge Case (Sensor Dropout)
export function calculateIoTHardwareFidelity(entity: SpatialEntity, requiredSensors: number): number {
  if (requiredSensors === 0) return 1.0;
  // If a drone agent needs 5 visual sensors but activeSensors = 2 due to physical dropout
  const ratio = entity.activeSensors / requiredSensors;
  return Math.max(0, Math.min(1.0, ratio));
}

// 4. IoT Actuator Fallback Shutdown
export function evaluateIoTFallback(fidelity: number, shutdownHook: () => void): boolean {
  if (fidelity < 0.2) {
    shutdownHook();
    return true;
  }
  return false;
}

describe('Scenario: Traits — Composition Constraints', () => {
  const registry = new Map<string, SemanticTrait>([
    ['@pathfinding', { name: '@pathfinding', category: 'motion', weight: 1 }],
    ['@stationary', { name: '@stationary', category: 'motion', weight: 1 }],
    ['@glowing', { name: '@glowing', category: 'visual', weight: 1 }],
  ]);

  it('Rejects conflicting motion constraints on the same asset', () => {
    const composition = ['@pathfinding', '@stationary', '@glowing'];
    const result = validateTraitComposition(registry, composition);
    expect(result.valid).toBe(false);
    expect(result.conflicts).toContain('@pathfinding');
    expect(result.conflicts).toContain('@stationary');
  });

  it('Allows valid compositions', () => {
    const composition = ['@pathfinding', '@glowing'];
    const result = validateTraitComposition(registry, composition);
    expect(result.valid).toBe(true);
    expect(result.conflicts.length).toBe(0);
  });
});

describe('Scenario: Traits — Runtime Injection', () => {
  it('Injects novel traits cleanly into the SpatialEntity tree', () => {
    const entity: SpatialEntity = { id: 'obj_1', traits: new Set(['@glowing']), activeSensors: 2 };
    const success = injectRuntimeTrait(entity, '@reactive');
    expect(success).toBe(true);
    expect(entity.traits.has('@reactive')).toBe(true);
  });

  it('Safeguards against trait exhaustion attacks (>20 traits on single asset)', () => {
    const traits = new Set<string>();
    for (let i = 0; i < 20; i++) traits.add(`@trait_${i}`);
    
    const entity: SpatialEntity = { id: 'obj_overload', traits, activeSensors: 2 };
    expect(() => injectRuntimeTrait(entity, '@one_too_many')).toThrow('TRAIT_OVERLOAD');
  });
});

describe('Scenario: Traits — IoT/Hardware Map Dropout', () => {
  it('Degrades fidelity ratio linearly on sensor failure', () => {
    const drone: SpatialEntity = { id: 'drone_unit_7', traits: new Set(['@drone']), activeSensors: 2 };
    // 2 out of 5 required sensors are online
    expect(calculateIoTHardwareFidelity(drone, 5)).toBe(0.4);
  });

  it('Defaults to 1.0 (perfect fidelity) when no sensors are required', () => {
    const rock: SpatialEntity = { id: 'rock', traits: new Set(['@stationary']), activeSensors: 0 };
    expect(calculateIoTHardwareFidelity(rock, 0)).toBe(1.0);
  });
  
  it('Triggers IoT physical actuator shutdown fallback hooks upon fidelity < 0.2', () => {
    let fallbackHookFired = false;
    const triggerHook = () => { fallbackHookFired = true; };
    
    // Simulate critical damage fidelity drop to 0.1
    const didFallback = evaluateIoTFallback(0.1, triggerHook);
    
    expect(didFallback).toBe(true);
    expect(fallbackHookFired).toBe(true);
  });
});
