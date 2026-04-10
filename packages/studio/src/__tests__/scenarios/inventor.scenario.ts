/**
 * inventor.scenario.ts — LIVING-SPEC: Inventor
 *
 * Persona: Nikola — a hardware inventor and engineer using the InventorPanel
 * to track Bill of Materials (BOM), physics stress simulations, and costs.
 *
 * ✓ it(...)      = PASSING — feature exists
 * ⊡ it.todo(...) = SKIPPED — missing feature (backlog item)
 */

import { describe, it, expect } from 'vitest';
import {
  calculateTotalCost,
  estimateBuildTimeDays,
  simulatePhysicsStressTest,
  type PrototypeComponent,
} from '@/lib/inventorScenario';

describe('Scenario: Inventor — Hardware Prototyping', () => {
  const components: PrototypeComponent[] = [
    { id: '1', name: 'Frame', material: 'Aluminium', weightKg: 10, cost: 200 },
    { id: '2', name: 'Motor', material: 'Copper/Steel', weightKg: 5, cost: 150 },
  ];

  it('calculates the total cost of prototype BOM', () => {
    const cost = calculateTotalCost(components);
    expect(cost).toBe(350);
  });

  it('estimates build time based on complexity', () => {
    // 2 components
    expect(estimateBuildTimeDays('low', 2)).toBe(1); // 2 * 0.5 = 1
    expect(estimateBuildTimeDays('medium', 2)).toBe(1.5); // 1 * 1.5
    expect(estimateBuildTimeDays('high', 2)).toBe(2.5); // 1 * 2.5
    expect(estimateBuildTimeDays('experimental', 2)).toBe(4.0);
  });

  it('simulates physics stress test logic', () => {
    // Total weight = 15kg
    // Max load = 100kg
    // Stress = 100 / 15 = 6.66 <= 10 -> PASSED
    const result1 = simulatePhysicsStressTest(components, 100);
    expect(result1.passed).toBe(true);
    expect(result1.stressFactor).toBeCloseTo(100 / 15, 3);

    // Max load = 200kg
    // Stress = 200 / 15 = 13.33 > 10 -> FAILED
    const result2 = simulatePhysicsStressTest(components, 200);
    expect(result2.passed).toBe(false);
  });

  it('returns false for zero weight components', () => {
    const zero: PrototypeComponent[] = [
      { id: '0', name: 'Air', material: 'None', weightKg: 0, cost: 0 },
    ];
    const result = simulatePhysicsStressTest(zero, 100);
    expect(result.passed).toBe(false);
    expect(result.stressFactor).toBe(0);
  });
});
