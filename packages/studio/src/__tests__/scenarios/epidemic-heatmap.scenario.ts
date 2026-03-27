/**
 * epidemic-heatmap.scenario.ts — LIVING-SPEC: Epidemic Heatmap Planner
 *
 * Persona: Dr. Okafor — epidemiologist who models disease spread,
 * manages quarantine zones, and plans vaccination campaigns.
 *
 * ✓ it(...)      = PASSING — feature exists
 */

import { describe, it, expect } from 'vitest';
import {
  basicReproductionNumber,
  effectiveR,
  herdImmunityThreshold,
  infectionRate,
  caseRiskLevel,
  caseFatalityRate,
  stepSEIR,
  quarantineEffectiveness,
  vaccinationCoverage,
  daysToHerdImmunity,
  contactTracingGraph,
  icuCapacityProjection,
  type PopulationZone,
  type QuarantineZone,
  type SEIRState,
} from '@/lib/epidemicHeatmap';

describe('Scenario: Epidemic Heatmap — R0 & Risk', () => {
  it('basicReproductionNumber() calculates R0', () => {
    expect(basicReproductionNumber(50, 10, 100)).toBe(5);
  });

  it('effectiveR() decreases with immunity', () => {
    expect(effectiveR(3.0, 0)).toBe(3.0);
    expect(effectiveR(3.0, 0.5)).toBe(1.5);
    expect(effectiveR(3.0, 1.0)).toBe(0);
  });

  it('herdImmunityThreshold() for R0=3 is 66.7%', () => {
    expect(herdImmunityThreshold(3)).toBeCloseTo(0.667, 2);
  });

  it('herdImmunityThreshold() for R0=1 is 0%', () => {
    expect(herdImmunityThreshold(1)).toBe(0);
  });

  it('infectionRate() = infected / population', () => {
    const zone: PopulationZone = {
      id: 'z1',
      name: 'Downtown',
      center: { lat: 0, lon: 0 },
      radiusKm: 5,
      population: 10000,
      density: 5000,
      infected: 500,
      recovered: 200,
      deceased: 10,
      vaccinated: 3000,
    };
    expect(infectionRate(zone)).toBe(0.05);
  });

  it('caseRiskLevel() classifies infection rates', () => {
    expect(caseRiskLevel(0.005)).toBe('low');
    expect(caseRiskLevel(0.03)).toBe('moderate');
    expect(caseRiskLevel(0.1)).toBe('high');
    expect(caseRiskLevel(0.25)).toBe('critical');
  });

  it('caseFatalityRate() = deceased / total cases', () => {
    expect(caseFatalityRate(5, 500)).toBe(0.01);
  });
});

describe('Scenario: Epidemic Heatmap — SEIR Model', () => {
  const initial: SEIRState = {
    susceptible: 9900,
    exposed: 50,
    infected: 50,
    recovered: 0,
    total: 10000,
  };

  it('SEIR step reduces susceptible as infected grow', () => {
    const next = stepSEIR(initial, 0.3, 0.2, 0.1);
    expect(next.susceptible).toBeLessThan(initial.susceptible);
  });

  it('SEIR step moves exposed → infected', () => {
    const next = stepSEIR(initial, 0.3, 0.2, 0.1);
    expect(next.infected).toBeGreaterThan(0);
  });

  it('SEIR step moves infected → recovered', () => {
    const next = stepSEIR(initial, 0.3, 0.2, 0.1);
    expect(next.recovered).toBeGreaterThan(0);
  });

  it('total population remains constant in SEIR', () => {
    const next = stepSEIR(initial, 0.3, 0.2, 0.1);
    const sum = next.susceptible + next.exposed + next.infected + next.recovered;
    expect(sum).toBeCloseTo(initial.total, 0);
  });
});

describe('Scenario: Epidemic Heatmap — Interventions', () => {
  it('quarantineEffectiveness() depends on compliance and level', () => {
    const enforced: QuarantineZone = {
      id: 'q1',
      boundary: [],
      restrictionLevel: 'enforced',
      startDate: 0,
      endDate: 14 * 86400000,
      population: 5000,
      complianceRate: 0.9,
    };
    const advisory: QuarantineZone = {
      id: 'q2',
      boundary: [],
      restrictionLevel: 'advisory',
      startDate: 0,
      endDate: 14 * 86400000,
      population: 5000,
      complianceRate: 0.5,
    };
    expect(quarantineEffectiveness(enforced)).toBeGreaterThan(quarantineEffectiveness(advisory));
  });

  it('vaccinationCoverage() = vaccinated / population', () => {
    expect(vaccinationCoverage(7000, 10000)).toBe(0.7);
  });

  it('daysToHerdImmunity() estimates timeline', () => {
    const days = daysToHerdImmunity(10000, 2000, 200, 3);
    // Threshold = 66.7% = 6667 needed, minus 2000 immune = 4667, at 200/day ≈ 24
    expect(days).toBeGreaterThan(20);
    expect(days).toBeLessThan(30);
  });

  it('daysToHerdImmunity() returns 0 if already immune', () => {
    expect(daysToHerdImmunity(10000, 8000, 200, 3)).toBe(0);
  });

  it('daysToHerdImmunity() returns Infinity if no vaccinations', () => {
    expect(daysToHerdImmunity(10000, 0, 0, 3)).toBe(Infinity);
  });

  it('contactTracingGraph — builds infection chain and finds super-spreaders', () => {
    const events = [
      {
        id: '1',
        patientId: 'P1',
        location: { lat: 40, lon: -74 },
        timestamp: 1000,
        status: 'infected' as const,
        contactCount: 8,
        isolated: false,
      },
      {
        id: '2',
        patientId: 'P2',
        location: { lat: 40, lon: -74 },
        timestamp: 2000,
        status: 'infected' as const,
        contactCount: 2,
        isolated: true,
      },
      {
        id: '3',
        patientId: 'P3',
        location: { lat: 41, lon: -73 },
        timestamp: 3000,
        status: 'infected' as const,
        contactCount: 1,
        isolated: false,
      },
    ];
    const graph = contactTracingGraph(events, 5);
    expect(graph.nodes).toContain('P1');
    expect(graph.superSpreaders).toEqual(['P1']);
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it('icuCapacityProjection — projects bed usage over 7 days', () => {
    const proj = icuCapacityProjection(1000, 0.1, 0.15, 0.25, 100, 50, 7);
    expect(proj).toHaveLength(7);
    expect(proj[0].day).toBe(0);
    // Should eventually go over capacity with 10% daily growth
    const lastDay = proj[proj.length - 1];
    expect(lastDay.projectedICUPatients).toBeGreaterThan(proj[0].projectedICUPatients);
  });

  it('icuCapacityProjection — lastDay correctly identifies over-capacity state', () => {
    // High growth rate (0.3), will exceed 50 available beds
    const projOver = icuCapacityProjection(1000, 0.3, 0.20, 0.25, 100, 50, 14);
    const lastDayOver = projOver[projOver.length - 1];
    expect(lastDayOver.projectedICUPatients).toBeGreaterThan(lastDayOver.availableBeds);
    expect(lastDayOver.overCapacity).toBe(true);
  });

  it('icuCapacityProjection — lastDay remains under capacity for low spread', () => {
    // Zero growth rate (0.0), will not exceed 90 available beds
    const projUnder = icuCapacityProjection(1000, 0.0, 0.10, 0.15, 100, 10, 14);
    const lastDayUnder = projUnder[projUnder.length - 1];
    expect(lastDayUnder.projectedICUPatients).toBeLessThanOrEqual(lastDayUnder.availableBeds);
    expect(lastDayUnder.overCapacity).toBe(false);
  });
});
