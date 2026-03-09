/**
 * disaster-response.scenario.ts — LIVING-SPEC: Disaster Response Simulator
 *
 * Persona: Commander Reyes — emergency coordinator who simulates earthquakes,
 * floods, and evacuations in 3D, deploying resources and assessing damage.
 *
 * ✓ it(...)      = PASSING — feature exists
 * ⊡ it.todo(...) = SKIPPED — missing feature (backlog item)
 */

import { describe, it, expect } from 'vitest';
import {
  richterToEnergy,
  magnitudeComparison,
  mercalliToDescription,
  estimateStructuralDamage,
  buildingConditionFromIntegrity,
  floodRiskLevel,
  isFloodedAboveFloor,
  floodEvacuationUrgency,
  routeDistanceKm,
  evacuationTimeHours,
  isRoutePassable,
  availableResources,
  resourcesByType,
  totalCapacity,
  isLZSuitable,
  startTriageClassify,
  fallbackRadioTopology,
  droneDeploymentGrid,
  type Building,
  type EarthquakeEvent,
  type FloodZone,
  type EvacuationRoute,
  type ResourceUnit,
  type HelicopterLZ,
} from '@/lib/disasterResponse';

// ═══════════════════════════════════════════════════════════════════
// 1. Earthquake Physics
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Disaster Response — Earthquake', () => {
  const quake: EarthquakeEvent = {
    magnitude: 7.1,
    depth: 10,
    epicenter: { lat: 34.05, lon: -118.24, alt: 0 },
    intensity: 9,
    timestamp: Date.now(),
    aftershocks: [
      { magnitude: 5.2, delay: 120 },
      { magnitude: 4.1, delay: 300 },
    ],
  };

  it('richterToEnergy() converts magnitude to joules', () => {
    const e5 = richterToEnergy(5);
    const e7 = richterToEnergy(7);
    expect(e7).toBeGreaterThan(e5);
  });

  it('M7.0 is ~1000x more energy than M5.0', () => {
    const ratio = magnitudeComparison(7, 5);
    expect(ratio).toBeCloseTo(1000, -2); // 10^(1.5*2) ≈ 1000
  });

  it('mercalliToDescription() maps intensity to labels', () => {
    expect(mercalliToDescription(1)).toBe('Not felt');
    expect(mercalliToDescription(5)).toBe('Moderate');
    expect(mercalliToDescription(9)).toBe('Violent');
    expect(mercalliToDescription(12)).toBe('Extreme');
  });

  it('estimateStructuralDamage() — masonry worst, steel best', () => {
    const masonry: Building = {
      id: 'b1',
      name: 'Old Hall',
      position: { x: 0, y: 0, z: 0 },
      floors: 3,
      occupancy: 100,
      condition: 'intact',
      structuralIntegrity: 1,
      material: 'masonry',
    };
    const steel: Building = {
      id: 'b2',
      name: 'Tower',
      position: { x: 0, y: 0, z: 0 },
      floors: 20,
      occupancy: 500,
      condition: 'intact',
      structuralIntegrity: 1,
      material: 'steel',
    };
    const dmgMasonry = estimateStructuralDamage(masonry, quake);
    const dmgSteel = estimateStructuralDamage(steel, quake);
    expect(dmgMasonry).toBeGreaterThan(dmgSteel);
  });

  it('buildingConditionFromIntegrity() classifies damage levels', () => {
    expect(buildingConditionFromIntegrity(0.95)).toBe('intact');
    expect(buildingConditionFromIntegrity(0.7)).toBe('minor-damage');
    expect(buildingConditionFromIntegrity(0.5)).toBe('major-damage');
    expect(buildingConditionFromIntegrity(0.1)).toBe('collapsed');
  });

  it('aftershocks have lower magnitude than mainshock', () => {
    for (const a of quake.aftershocks) {
      expect(a.magnitude).toBeLessThan(quake.magnitude);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Flood Simulation
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Disaster Response — Flood', () => {
  it('floodRiskLevel() classifies water depth', () => {
    expect(floodRiskLevel(0.1)).toBe('low');
    expect(floodRiskLevel(0.5)).toBe('moderate');
    expect(floodRiskLevel(1.5)).toBe('high');
    expect(floodRiskLevel(3.0)).toBe('extreme');
  });

  it('isFloodedAboveFloor() counts flooded floors', () => {
    expect(isFloodedAboveFloor(0)).toBe(0);
    expect(isFloodedAboveFloor(3)).toBe(1);
    expect(isFloodedAboveFloor(7)).toBe(2);
  });

  it('floodEvacuationUrgency() — high water = immediate', () => {
    const zone: FloodZone = {
      id: 'z1',
      polygon: [],
      waterLevel: 3.0,
      flowRate: 1.0,
      recurrence: 100,
      evacuated: false,
    };
    expect(floodEvacuationUrgency(zone)).toBe('immediate');
  });

  it('floodEvacuationUrgency() — fast flow = immediate', () => {
    const zone: FloodZone = {
      id: 'z2',
      polygon: [],
      waterLevel: 0.5,
      flowRate: 4.0,
      recurrence: 100,
      evacuated: false,
    };
    expect(floodEvacuationUrgency(zone)).toBe('immediate');
  });

  it('floodEvacuationUrgency() — moderate = urgent', () => {
    const zone: FloodZone = {
      id: 'z3',
      polygon: [],
      waterLevel: 0.8,
      flowRate: 1.0,
      recurrence: 50,
      evacuated: false,
    };
    expect(floodEvacuationUrgency(zone)).toBe('urgent');
  });

  it('floodEvacuationUrgency() — low water = advisory', () => {
    const zone: FloodZone = {
      id: 'z4',
      polygon: [],
      waterLevel: 0.2,
      flowRate: 0.5,
      recurrence: 10,
      evacuated: false,
    };
    expect(floodEvacuationUrgency(zone)).toBe('advisory');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Evacuation & Pathfinding
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Disaster Response — Evacuation', () => {
  it('routeDistanceKm() calculates path length', () => {
    const waypoints = [
      { x: 0, y: 0, z: 0 },
      { x: 1000, y: 0, z: 0 },
      { x: 1000, y: 0, z: 1000 },
    ];
    expect(routeDistanceKm(waypoints)).toBeCloseTo(2.0, 1);
  });

  it('evacuationTimeHours() divides population by capacity', () => {
    const routes: EvacuationRoute[] = [
      {
        id: 'r1',
        name: 'North',
        waypoints: [],
        capacityPerHour: 500,
        distanceKm: 2,
        blocked: false,
        hazards: [],
      },
      {
        id: 'r2',
        name: 'South',
        waypoints: [],
        capacityPerHour: 300,
        distanceKm: 3,
        blocked: false,
        hazards: [],
      },
    ];
    expect(evacuationTimeHours(2400, routes)).toBe(3); // 2400 / (500+300)
  });

  it('evacuationTimeHours() is Infinity when all routes blocked', () => {
    const routes: EvacuationRoute[] = [
      {
        id: 'r1',
        name: 'Blocked',
        waypoints: [],
        capacityPerHour: 500,
        distanceKm: 2,
        blocked: true,
        hazards: [],
      },
    ];
    expect(evacuationTimeHours(1000, routes)).toBe(Infinity);
  });

  it('isRoutePassable() requires no blocks and no hazards', () => {
    expect(
      isRoutePassable({
        id: 'r',
        name: 'Clear',
        waypoints: [],
        capacityPerHour: 500,
        distanceKm: 1,
        blocked: false,
        hazards: [],
      })
    ).toBe(true);
    expect(
      isRoutePassable({
        id: 'r',
        name: 'Jammed',
        waypoints: [],
        capacityPerHour: 500,
        distanceKm: 1,
        blocked: true,
        hazards: [],
      })
    ).toBe(false);
    expect(
      isRoutePassable({
        id: 'r',
        name: 'Hazard',
        waypoints: [],
        capacityPerHour: 500,
        distanceKm: 1,
        blocked: false,
        hazards: ['debris'],
      })
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Resource Management
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Disaster Response — Resources', () => {
  const units: ResourceUnit[] = [
    {
      id: 'ambu-1',
      type: 'ambulance',
      position: { x: 0, y: 0, z: 0 },
      status: 'available',
      eta: 0,
      capacity: 4,
    },
    {
      id: 'heli-1',
      type: 'helicopter',
      position: { x: 5, y: 0, z: 0 },
      status: 'deployed',
      eta: 30,
      capacity: 8,
    },
    {
      id: 'ambu-2',
      type: 'ambulance',
      position: { x: 10, y: 0, z: 0 },
      status: 'available',
      eta: 0,
      capacity: 4,
    },
    {
      id: 'fire-1',
      type: 'fire-truck',
      position: { x: 15, y: 0, z: 0 },
      status: 'en-route',
      eta: 10,
      capacity: 6,
    },
  ];

  it('availableResources() filters available units', () => {
    expect(availableResources(units)).toHaveLength(2);
  });

  it('resourcesByType() filters by type', () => {
    expect(resourcesByType(units, 'ambulance')).toHaveLength(2);
    expect(resourcesByType(units, 'helicopter')).toHaveLength(1);
  });

  it('totalCapacity() sums all unit capacities', () => {
    expect(totalCapacity(units)).toBe(22);
  });

  it('isLZSuitable() requires flat, clear, wide area', () => {
    const good: HelicopterLZ = {
      id: 'lz1',
      position: { x: 0, y: 0, z: 0 },
      radiusMeters: 20,
      slope: 5,
      obstructions: [],
      suitable: true,
    };
    const bad: HelicopterLZ = {
      id: 'lz2',
      position: { x: 0, y: 0, z: 0 },
      radiusMeters: 10,
      slope: 15,
      obstructions: ['power line'],
      suitable: false,
    };
    expect(isLZSuitable(good)).toBe(true);
    expect(isLZSuitable(bad)).toBe(false);
  });

  it('real-time drone deployment — autonomous search grid flight paths', () => {
    const grid = droneDeploymentGrid(0, 0, 200, 300, 50, 50);
    expect(grid.length).toBeGreaterThanOrEqual(8); // At least 4 lanes × 2 waypoints
    // First waypoint starts at origin
    expect(grid[0].position.x).toBe(0);
    expect(grid[0].altitudeM).toBe(50);
    // Lanes alternate direction (boustrophedon)
    expect(grid[0].position.z).toBe(0);
    expect(grid[1].position.z).toBe(300);
    expect(grid[2].position.z).toBe(300); // Odd lane starts from end
    expect(grid[3].position.z).toBe(0); // Odd lane ends at origin
  });

  it('startTriageClassify — START protocol categorizes casualties', () => {
    // Not breathing → Deceased
    expect(startTriageClassify(false, 0, 0, false)).toBe('deceased');
    // RR > 30 → Immediate
    expect(startTriageClassify(true, 35, 1, true)).toBe('immediate');
    // Poor perfusion → Immediate
    expect(startTriageClassify(true, 20, 4, true)).toBe('immediate');
    // Normal vitals, follows commands → Delayed
    expect(startTriageClassify(true, 18, 1.5, true)).toBe('delayed');
  });

  it('fallbackRadioTopology — builds mesh from node positions', () => {
    const nodes = [
      { id: 'HQ', position: { x: 0, y: 0, z: 0 }, rangeMeters: 500, isRelay: true },
      { id: 'A', position: { x: 300, y: 0, z: 0 }, rangeMeters: 500, isRelay: false },
      { id: 'B', position: { x: 0, y: 400, z: 0 }, rangeMeters: 500, isRelay: false },
      { id: 'C', position: { x: 9000, y: 9000, z: 0 }, rangeMeters: 100, isRelay: false },
    ];
    const topo = fallbackRadioTopology(nodes);
    expect(topo.links.length).toBeGreaterThanOrEqual(2);
    expect(topo.isolatedNodes).toContain('C');
    expect(topo.connected).toBe(false);
  });
});
