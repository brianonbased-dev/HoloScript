/**
 * wildfire-response.scenario.ts — LIVING-SPEC: Wildfire Coordination
 *
 * Persona: Captain Reyes — incident commander deploying swarm drones
 * and ground crews to detect, confirm, and contain wildfires.
 */
import { describe, it, expect } from 'vitest';

function fireIntensityCategory(intensity: number): 'low' | 'moderate' | 'high' | 'extreme' {
  if (intensity < 0.3) return 'low';
  if (intensity < 0.6) return 'moderate';
  if (intensity < 0.8) return 'high';
  return 'extreme';
}

function containmentProgress(contained: number, total: number): number {
  return total > 0 ? contained / total : 0;
}

function resourceAllocation(intensity: number): string {
  return intensity > 0.7 ? 'helicopters' : 'ground_crews';
}

function chainOfCommandValid(
  reporter: string,
  authorizer: string,
  roster: Record<string, string>
): boolean {
  return roster[reporter] === authorizer;
}

function estimateSpreadRate(intensity: number, windSpeed: number): number {
  return intensity * windSpeed * 0.5;
}

describe('Scenario: Wildfire — Detection & Classification', () => {
  it('fireIntensityCategory() classifies correctly', () => {
    expect(fireIntensityCategory(0.1)).toBe('low');
    expect(fireIntensityCategory(0.5)).toBe('moderate');
    expect(fireIntensityCategory(0.75)).toBe('high');
    expect(fireIntensityCategory(0.95)).toBe('extreme');
  });
  it('estimateSpreadRate() scales with intensity × wind', () => {
    expect(estimateSpreadRate(0.8, 10)).toBe(4);
    expect(estimateSpreadRate(0.4, 5)).toBe(1);
  });
});

describe('Scenario: Wildfire — Resource Management', () => {
  it('resourceAllocation() — high intensity → helicopters', () => {
    expect(resourceAllocation(0.9)).toBe('helicopters');
    expect(resourceAllocation(0.5)).toBe('ground_crews');
  });
  it('containmentProgress() ratio', () => {
    expect(containmentProgress(3, 5)).toBeCloseTo(0.6);
    expect(containmentProgress(0, 0)).toBe(0);
  });
});

describe('Scenario: Wildfire — Chain of Command', () => {
  it('chainOfCommandValid() — matches roster', () => {
    const roster = { drone_alpha: 'captain_reyes', ground_01: 'captain_reyes' };
    expect(chainOfCommandValid('drone_alpha', 'captain_reyes', roster)).toBe(true);
    expect(chainOfCommandValid('drone_alpha', 'unknown', roster)).toBe(false);
  });
});
