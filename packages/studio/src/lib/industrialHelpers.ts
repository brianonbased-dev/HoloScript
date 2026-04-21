/**
 * industrialHelpers.ts
 *
 * Pure geometry + data helpers for industrial plant / factory floor
 * simulation in HoloScript Studio.
 *
 * No DOM, no Three.js — pure TypeScript math.
 * Consumed by the industrial-plant-designer.scenario.ts living-spec tests.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type Vec3 = [number, number, number];

export interface BoundingSphere {
  center: Vec3;
  radius: number;
}

export interface BoundingBox {
  min: Vec3;
  max: Vec3;
}

export interface SafetyZone {
  nodeId: string;
  center: Vec3;
  radius: number;
  type: 'exclusion' | 'warning' | 'controlled';
}

export interface EquipmentNode {
  id: string;
  name: string;
  type: string;
  position: Vec3;
  dimensions: Vec3; // width, height, depth in meters
  traits: string[];
}

export interface ThroughputSimParams {
  itemsPerMinuteInput: number; // source rate
  processingTimeSeconds: number; // time to process each item
  bufferCapacity: number; // max items waiting
}

// ── Grid Snap ─────────────────────────────────────────────────────────────────

/**
 * Snaps a world-space position to the nearest grid point.
 * Useful for aligning equipment on a factory floor grid.
 *
 * @param position  Input world position
 * @param increment Grid cell size in meters (default 0.5m)
 */
export function gridSnap(position: Vec3, increment = 0.5): Vec3 {
  return [
    Math.round(position[0] / increment) * increment,
    Math.round(position[1] / increment) * increment,
    Math.round(position[2] / increment) * increment,
  ];
}

// ── Distance Measurement ──────────────────────────────────────────────────────

/**
 * Measures the Euclidean distance between two node positions in meters.
 */
export function measureDistance(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Measures the floor-plane (XZ) distance, ignoring Y (height).
 * Useful for footprint calculations on a factory floor.
 */
export function measureFloorDistance(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dz * dz);
}

// ── Safety Zone ───────────────────────────────────────────────────────────────

/**
 * Creates a safety zone around a node at the given radius.
 * Safety zones mark exclusion areas around industrial equipment.
 */
export function safetyZone(
  node: { id: string; position: Vec3 },
  radius: number,
  type: SafetyZone['type'] = 'exclusion'
): SafetyZone {
  return {
    nodeId: node.id,
    center: [...node.position] as Vec3,
    radius,
    type,
  };
}

/**
 * Returns true if a point is inside a safety zone.
 */
export function isInsideSafetyZone(point: Vec3, zone: SafetyZone): boolean {
  return measureDistance(point, zone.center) < zone.radius;
}

/**
 * Returns all safety zones that overlap with each other.
 * Overlapping zones indicate unsafe layouts requiring review.
 */
export function findOverlappingZones(zones: SafetyZone[]): Array<[SafetyZone, SafetyZone]> {
  const overlaps: Array<[SafetyZone, SafetyZone]> = [];
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const dist = measureDistance(zones[i].center, zones[j].center);
      if (dist < zones[i].radius + zones[j].radius) {
        overlaps.push([zones[i], zones[j]]);
      }
    }
  }
  return overlaps;
}

// ── Bounding Box / Collision ──────────────────────────────────────────────────

/** Returns the axis-aligned bounding box of an equipment node. */
export function equipmentBounds(node: EquipmentNode): BoundingBox {
  const halfW = node.dimensions[0] / 2;
  const halfH = node.dimensions[1] / 2;
  const halfD = node.dimensions[2] / 2;
  return {
    min: [node.position[0] - halfW, node.position[1] - halfH, node.position[2] - halfD],
    max: [node.position[0] + halfW, node.position[1] + halfH, node.position[2] + halfD],
  };
}

/** Returns true if two bounding boxes intersect (AABB test). */
export function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return (
    a.min[0] <= b.max[0] &&
    a.max[0] >= b.min[0] &&
    a.min[1] <= b.max[1] &&
    a.max[1] >= b.min[1] &&
    a.min[2] <= b.max[2] &&
    a.max[2] >= b.min[2]
  );
}

/** Returns all pairs of equipment nodes whose footprints overlap. */
export function findCollisions(nodes: EquipmentNode[]): Array<[EquipmentNode, EquipmentNode]> {
  const collisions: Array<[EquipmentNode, EquipmentNode]> = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (boxesOverlap(equipmentBounds(nodes[i]), equipmentBounds(nodes[j]))) {
        collisions.push([nodes[i], nodes[j]]);
      }
    }
  }
  return collisions;
}

// ── Throughput Simulation ─────────────────────────────────────────────────────

export interface ThroughputResult {
  itemsProcessedPerMinute: number;
  bufferUtilization: number; // 0-1
  bottlenecked: boolean;
}

/**
 * Simulates steady-state throughput of a single processing station.
 * Based on queuing theory (M/D/1 approximation).
 */
export function simulateThroughput(params: ThroughputSimParams): ThroughputResult {
  const processingRatePerMinute = 60 / params.processingTimeSeconds;
  const itemsProcessedPerMinute = Math.min(params.itemsPerMinuteInput, processingRatePerMinute);
  const queueDepth = Math.max(
    0,
    (params.itemsPerMinuteInput - processingRatePerMinute) * (params.processingTimeSeconds / 60)
  );
  const bufferUtilization = Math.min(queueDepth / (params.bufferCapacity || 1), 1);
  const bottlenecked = params.itemsPerMinuteInput > processingRatePerMinute;

  return { itemsProcessedPerMinute, bufferUtilization, bottlenecked };
}

// ── HoloScript Trait Generators ───────────────────────────────────────────────

/** Generates a @conveyor_belt trait string for HoloScript templates. */
export function conveyorBeltTrait(
  speedMs: number,
  direction: 'x' | 'y' | 'z' | '-x' | '-y' | '-z'
): string {
  return `@conveyor_belt(speed: ${speedMs}, direction: "${direction}")`;
}

/** Generates a @robot_arm trait string for HoloScript templates. */
export function robotArmTrait(dof: number, reachMeters: number): string {
  return `@robot_arm(dof: ${dof}, reach: ${reachMeters})`;
}

/** Generates a @safety_fence trait string for HoloScript templates. */
export function safetyFenceTrait(heightMeters: number, color = '#ff6600'): string {
  return `@safety_fence(height: ${heightMeters}, color: "${color}")`;
}

/** Generates a @sensor trait string for HoloScript templates. */
export function sensorTrait(type: 'proximity' | 'temp' | 'pressure' | 'camera'): string {
  return `@sensor(type: "${type}")`;
}

// ── Digital Twin Export (DTDL Stub) ──────────────────────────────────────────

export interface DTDLInterface {
  '@id': string;
  '@type': 'Interface';
  '@context': string;
  displayName: string;
  contents: DTDLProperty[];
}

export interface DTDLProperty {
  '@type': 'Property' | 'Telemetry';
  name: string;
  schema: string;
}

/**
 * Generates a minimal DTDL (Azure Digital Twins Definition Language) interface
 * for an equipment node. Full export requires actual sensor streams.
 */
export function equipmentToDTDL(node: EquipmentNode): DTDLInterface {
  const properties: DTDLProperty[] = [
    { '@type': 'Property', name: 'position_x', schema: 'double' },
    { '@type': 'Property', name: 'position_y', schema: 'double' },
    { '@type': 'Property', name: 'position_z', schema: 'double' },
    { '@type': 'Property', name: 'type', schema: 'string' },
  ];

  // Add telemetry for sensor traits
  for (const trait of node.traits) {
    if (trait.includes('@sensor')) {
      properties.push({ '@type': 'Telemetry', name: 'sensor_reading', schema: 'double' });
    }
    if (trait.includes('@conveyor_belt')) {
      properties.push({ '@type': 'Telemetry', name: 'belt_speed', schema: 'double' });
    }
  }

  return {
    '@id': `dtmi:holoscript:${node.id};1`,
    '@type': 'Interface',
    '@context': 'dtmi:dtdl:context;2',
    displayName: node.name,
    contents: properties,
  };
}
