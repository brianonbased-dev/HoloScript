/**
 * disasterResponse.ts — Disaster Response Simulation Engine
 *
 * Earthquake intensity modeling, flood simulation, evacuation pathfinding,
 * building collapse assessment, resource staging, helicopter LZ selection.
 */

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface GeoPoint {
  lat: number;
  lon: number;
  alt: number;
}
export type Vec3 = [number, number, number] | { x: number; y: number; z: number };

function toTuple(v: Vec3): [number, number, number] {
  if (Array.isArray(v)) return v;
  return [v.x, v.y, v.z];
}

export type DisasterType =
  | 'earthquake'
  | 'flood'
  | 'wildfire'
  | 'tornado'
  | 'tsunami'
  | 'hurricane';
export type BuildingCondition =
  | 'intact'
  | 'minor-damage'
  | 'major-damage'
  | 'collapsed'
  | 'on-fire';
export type ResourceType =
  | 'ambulance'
  | 'fire-truck'
  | 'helicopter'
  | 'search-team'
  | 'supply-truck'
  | 'generator';

export interface Building {
  id: string;
  name: string;
  position: Vec3;
  floors: number;
  occupancy: number;
  condition: BuildingCondition;
  structuralIntegrity: number; // 0-1 (1 = perfect)
  material: 'wood' | 'concrete' | 'steel' | 'masonry';
}

export interface EarthquakeEvent {
  magnitude: number; // Richter scale
  depth: number; // km
  epicenter: GeoPoint;
  intensity: number; // Modified Mercalli (I-XII)
  timestamp: number;
  aftershocks: Array<{ magnitude: number; delay: number }>;
}

export interface FloodZone {
  id: string;
  polygon: Vec3[];
  waterLevel: number; // meters
  flowRate: number; // m/s
  recurrence: number; // year flood (100-year, 500-year)
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
  eta: number; // minutes
  capacity: number; // people or supplies
}

export interface HelicopterLZ {
  id: string;
  position: Vec3;
  radiusMeters: number;
  slope: number; // degrees
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
    1: 'Not felt',
    2: 'Weak',
    3: 'Weak',
    4: 'Light',
    5: 'Moderate',
    6: 'Strong',
    7: 'Very strong',
    8: 'Severe',
    9: 'Violent',
    10: 'Extreme',
    11: 'Extreme',
    12: 'Extreme',
  };
  return descriptions[Math.min(12, Math.max(1, Math.round(intensity)))] ?? 'Unknown';
}

export function estimateStructuralDamage(building: Building, quake: EarthquakeEvent): number {
  // Higher magnitude + closer distance = more damage
  // Wood flexes, masonry crumbles, steel best
  const materialFactor: Record<Building['material'], number> = {
    steel: 0.3,
    concrete: 0.5,
    wood: 0.6,
    masonry: 0.9,
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
    const [ax, ay, az] = toTuple(waypoints[i]);
    const [bx, by, bz] = toTuple(waypoints[i - 1]);
    const dx = ax - bx;
    const dy = ay - by;
    const dz = az - bz;
    dist += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return dist / 1000; // meters to km
}

export function evacuationTimeHours(population: number, routes: EvacuationRoute[]): number {
  const totalCapacity = routes
    .filter((r) => !r.blocked)
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
  return units.filter((u) => u.status === 'available');
}

export function resourcesByType(units: ResourceUnit[], type: ResourceType): ResourceUnit[] {
  return units.filter((u) => u.type === type);
}

export function totalCapacity(units: ResourceUnit[]): number {
  return units.reduce((sum, u) => sum + u.capacity, 0);
}

export function isLZSuitable(lz: HelicopterLZ): boolean {
  return lz.slope <= 10 && lz.obstructions.length === 0 && lz.radiusMeters >= 15;
}

// ═══════════════════════════════════════════════════════════════════
// START Triage Protocol
// ═══════════════════════════════════════════════════════════════════

export type TriageCategory = 'immediate' | 'delayed' | 'minor' | 'deceased';

/**
 * Classifies a casualty using the START (Simple Triage And Rapid Treatment) protocol.
 * @param breathing - Is the patient breathing? (spontaneous after airway opened)
 * @param respiratoryRate - Breaths per minute (0 if not breathing)
 * @param perfusion - Capillary refill seconds (or radial pulse present)
 * @param mentalStatus - Can follow simple commands
 */
export function startTriageClassify(
  breathing: boolean,
  respiratoryRate: number,
  perfusionSeconds: number,
  canFollowCommands: boolean
): TriageCategory {
  // Step 1: Not breathing after airway opened → Deceased
  if (!breathing && respiratoryRate === 0) return 'deceased';

  // Step 2: RR > 30 → Immediate
  if (respiratoryRate > 30) return 'immediate';

  // Step 3: Perfusion > 2 sec → Immediate
  if (perfusionSeconds > 2) return 'immediate';

  // Step 4: Mental status
  if (!canFollowCommands) return 'immediate';

  // Walking wounded → Minor, otherwise Delayed
  return respiratoryRate > 0 && respiratoryRate <= 30 ? 'delayed' : 'minor';
}

// ═══════════════════════════════════════════════════════════════════
// Fallback Radio Mesh Topology
// ═══════════════════════════════════════════════════════════════════

export interface RadioNode {
  id: string;
  position: Vec3;
  rangeMeters: number;
  isRelay: boolean;
}

export interface RadioLink {
  from: string;
  to: string;
  distance: number;
  signalStrength: number; // 0-1
}

/**
 * Builds a fallback radio mesh topology from node positions and ranges.
 * Two nodes can communicate if their distance < min(rangeA, rangeB).
 */
export function fallbackRadioTopology(nodes: RadioNode[]): {
  links: RadioLink[];
  connected: boolean;
  isolatedNodes: string[];
} {
  const links: RadioLink[] = [];
  const connectedSet = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i],
        b = nodes[j];
      const [ax, ay, az] = toTuple(a.position);
      const [bx, by, bz] = toTuple(b.position);
      const dx = ax - bx;
      const dy = ay - by;
      const dz = az - bz;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const maxRange = Math.min(a.rangeMeters, b.rangeMeters);

      if (distance < maxRange) {
        const signalStrength = Math.max(0, 1 - distance / maxRange);
        links.push({ from: a.id, to: b.id, distance, signalStrength });
        connectedSet.add(a.id);
        connectedSet.add(b.id);
      }
    }
  }

  const isolatedNodes = nodes.filter((n) => !connectedSet.has(n.id)).map((n) => n.id);

  return {
    links,
    connected: isolatedNodes.length === 0 && nodes.length > 0,
    isolatedNodes,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Drone Deployment — Autonomous Search Grid
// ═══════════════════════════════════════════════════════════════════

export interface DroneWaypoint {
  position: { x: number; y: number; z: number };
  altitudeM: number;
  hoverTimeSec: number;
}

/**
 * Generate a boustrophedon (lawn-mower) search grid for disaster zone scanning.
 */
export function droneDeploymentGrid(
  originX: number,
  originZ: number,
  widthM: number,
  depthM: number,
  altitudeM: number,
  laneSpacingM: number
): DroneWaypoint[] {
  const waypoints: DroneWaypoint[] = [];
  const lanes = Math.ceil(widthM / laneSpacingM);
  for (let i = 0; i <= lanes; i++) {
    const x = originX + i * laneSpacingM;
    // Alternate direction each lane (boustrophedon)
    const zStart = i % 2 === 0 ? originZ : originZ + depthM;
    const zEnd = i % 2 === 0 ? originZ + depthM : originZ;
    waypoints.push({ position: { x, y: 0, z: zStart }, altitudeM, hoverTimeSec: 2 });
    waypoints.push({ position: { x, y: 0, z: zEnd }, altitudeM, hoverTimeSec: 2 });
  }
  return waypoints;
}

export interface Disaster {
  id: string;
  type: DisasterType;
  name: string;
  severity: 'moderate' | 'major' | 'critical';
  location: { lat: number; lng: number };
  radiusKm: number;
  estimatedAffected: number;
  timestamp: number;
}

export interface ResourcePool {
  medical: { total: number; deployed: number; available: number };
  rescue: { total: number; deployed: number; available: number };
  logistics: { total: number; deployed: number; available: number };
}

export interface TriagePatient {
  id: string;
  name: string;
  age: number;
  injury: string;
  vitals: {
    heartRate: number;
    bloodPressure: string;
    respRate: number;
    oxygenSat: number;
    conscious: boolean;
  };
  canWalk: boolean;
  breathing: boolean;
}

export function triagePriority(patient: TriagePatient): TriageCategory {
  return startTriageClassify(
    patient.breathing,
    patient.vitals.respRate,
    patient.vitals.heartRate > 100 ? 3 : 1, // rough proxy for perfusion
    patient.vitals.conscious
  );
}

export function resourceUtilization(resource: { total: number; deployed: number }): number {
  if (resource.total === 0) return 0;
  return resource.deployed / resource.total;
}

export function safeDistance(magnitude: number): number {
  return magnitude * 1.5;
}

export function evacuationTimeMinutes(popDensity: number, lanes: number): number {
  return (popDensity / lanes) * 0.1;
}

export function affectedPopulation(popDensity: number, radiusKm: number): number {
  const area = Math.PI * radiusKm * radiusKm;
  return Math.round(area * popDensity);
}
