/**
 * disasterResponse.ts — Disaster Response Simulation Engine
 *
 * Earthquake intensity modeling, flood simulation, evacuation pathfinding,
 * building collapse assessment, resource staging, helicopter LZ selection.
 */

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface GeoPoint { lat: number; lon: number; alt: number }
export interface Vec3 { x: number; y: number; z: number }

export type DisasterType = 'earthquake' | 'flood' | 'wildfire' | 'tornado' | 'tsunami' | 'hurricane';
export type BuildingCondition = 'intact' | 'minor-damage' | 'major-damage' | 'collapsed' | 'on-fire';
export type ResourceType = 'ambulance' | 'fire-truck' | 'helicopter' | 'search-team' | 'supply-truck' | 'generator';

export interface Building {
  id: string;
  name: string;
  position: Vec3;
  floors: number;
  occupancy: number;
  condition: BuildingCondition;
  structuralIntegrity: number;  // 0-1 (1 = perfect)
  material: 'wood' | 'concrete' | 'steel' | 'masonry';
}

export interface EarthquakeEvent {
  magnitude: number;         // Richter scale
  depth: number;             // km
  epicenter: GeoPoint;
  intensity: number;         // Modified Mercalli (I-XII)
  timestamp: number;
  aftershocks: Array<{ magnitude: number; delay: number }>;
}

export interface FloodZone {
  id: string;
  polygon: Vec3[];
  waterLevel: number;        // meters
  flowRate: number;          // m/s
  recurrence: number;        // year flood (100-year, 500-year)
  evacuated: boolean;
}

export interface EvacuationRoute {
  id: string;
  name: string;
  waypoints: Vec3[];
  capacityPerHour: number;
  distanceKm: number;
  blocked: boolean;
  hazards: string[];
}

export interface ResourceUnit {
  id: string;
  type: ResourceType;
  position: Vec3;
  status: 'available' | 'deployed' | 'en-route' | 'offline';
  eta: number;               // minutes
  capacity: number;          // people or supplies
}

export interface HelicopterLZ {
  id: string;
  position: Vec3;
  radiusMeters: number;
  slope: number;             // degrees
  obstructions: string[];
  suitable: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// Earthquake Physics
// ═══════════════════════════════════════════════════════════════════

export function richterToEnergy(magnitude: number): number {
  // log10(E) = 1.5M + 4.8 (in joules)
  return Math.pow(10, 1.5 * magnitude + 4.8);
}

export function magnitudeComparison(a: number, b: number): number {
  // Each whole number = ~31.6x more energy
  return Math.pow(10, 1.5 * (a - b));
}

export function mercalliToDescription(intensity: number): string {
  const descriptions: Record<number, string> = {
    1: 'Not felt', 2: 'Weak', 3: 'Weak', 4: 'Light',
    5: 'Moderate', 6: 'Strong', 7: 'Very strong', 8: 'Severe',
    9: 'Violent', 10: 'Extreme', 11: 'Extreme', 12: 'Extreme',
  };
  return descriptions[Math.min(12, Math.max(1, Math.round(intensity)))] ?? 'Unknown';
}

export function estimateStructuralDamage(
  building: Building,
  quake: EarthquakeEvent
): number {
  // Higher magnitude + closer distance = more damage
  // Wood flexes, masonry crumbles, steel best
  const materialFactor: Record<Building['material'], number> = {
    steel: 0.3, concrete: 0.5, wood: 0.6, masonry: 0.9,
  };
  const damage = (quake.magnitude / 10) * materialFactor[building.material];
  return Math.min(1, Math.max(0, damage));
}

export function buildingConditionFromIntegrity(integrity: number): BuildingCondition {
  if (integrity > 0.9) return 'intact';
  if (integrity > 0.6) return 'minor-damage';
  if (integrity > 0.3) return 'major-damage';
  return 'collapsed';
}

// ═══════════════════════════════════════════════════════════════════
// Flood Simulation
// ═══════════════════════════════════════════════════════════════════

export function floodRiskLevel(waterLevel: number): 'low' | 'moderate' | 'high' | 'extreme' {
  if (waterLevel < 0.3) return 'low';
  if (waterLevel < 1.0) return 'moderate';
  if (waterLevel < 2.5) return 'high';
  return 'extreme';
}

export function isFloodedAboveFloor(waterLevel: number, floorHeight = 3.0): number {
  return Math.max(0, Math.floor(waterLevel / floorHeight));
}

export function floodEvacuationUrgency(zone: FloodZone): 'immediate' | 'urgent' | 'advisory' {
  if (zone.waterLevel > 2.0 || zone.flowRate > 3.0) return 'immediate';
  if (zone.waterLevel > 0.5) return 'urgent';
  return 'advisory';
}

// ═══════════════════════════════════════════════════════════════════
// Evacuation & Pathfinding
// ═══════════════════════════════════════════════════════════════════

export function routeDistanceKm(waypoints: Vec3[]): number {
  let dist = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const dx = waypoints[i].x - waypoints[i - 1].x;
    const dy = waypoints[i].y - waypoints[i - 1].y;
    const dz = waypoints[i].z - waypoints[i - 1].z;
    dist += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return dist / 1000; // meters to km
}

export function evacuationTimeHours(
  population: number,
  routes: EvacuationRoute[]
): number {
  const totalCapacity = routes
    .filter(r => !r.blocked)
    .reduce((sum, r) => sum + r.capacityPerHour, 0);
  if (totalCapacity === 0) return Infinity;
  return population / totalCapacity;
}

export function isRoutePassable(route: EvacuationRoute): boolean {
  return !route.blocked && route.hazards.length === 0;
}

// ═══════════════════════════════════════════════════════════════════
// Resource Management
// ═══════════════════════════════════════════════════════════════════

export function availableResources(units: ResourceUnit[]): ResourceUnit[] {
  return units.filter(u => u.status === 'available');
}

export function resourcesByType(units: ResourceUnit[], type: ResourceType): ResourceUnit[] {
  return units.filter(u => u.type === type);
}

export function totalCapacity(units: ResourceUnit[]): number {
  return units.reduce((sum, u) => sum + u.capacity, 0);
}

export function isLZSuitable(lz: HelicopterLZ): boolean {
  return lz.slope <= 10 && lz.obstructions.length === 0 && lz.radiusMeters >= 15;
}
