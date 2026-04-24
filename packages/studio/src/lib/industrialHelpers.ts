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

export interface Vec3 {
  x: number;
  y: number;
  z: number;
  [index: number]: number;
}

/**
 * Factory helper to create Vec3 from tuple or object.
 * Supports both { x, y, z } and [x, y, z] access patterns.
 * Numeric indices are non-enumerable for clean toEqual() assertions.
 */
export function vec3(x: number, y: number, z: number): Vec3 {
  const v = { x, y, z } as any;
  Object.defineProperty(v, '0', { value: x, enumerable: false });
  Object.defineProperty(v, '1', { value: y, enumerable: false });
  Object.defineProperty(v, '2', { value: z, enumerable: false });
  return v as Vec3;
}

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
  position: Vec3 | [number, number, number] | { x: number; y: number; z: number };
  dimensions: Vec3 | [number, number, number] | { x: number; y: number; z: number };
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
 * @param position  Input world position (supports {x,y,z} or [0,1,2])
 * @param increment Grid cell size in meters (default 0.5m)
 */
export function gridSnap(position: Vec3 | { x: number; y: number; z: number }, increment = 0.5): Vec3 {
  const x = position.x ?? position[0];
  const y = position.y ?? position[1];
  const z = position.z ?? position[2];
  return vec3(
    Math.round(x / increment) * increment,
    Math.round(y / increment) * increment,
    Math.round(z / increment) * increment
  );
}

// ── Distance Measurement ──────────────────────────────────────────────────────

/**
 * Measures the Euclidean distance between two node positions in meters.
 */
export function measureDistance(
  a: Vec3 | { x: number; y: number; z: number },
  b: Vec3 | { x: number; y: number; z: number }
): number {
  const ax = a.x ?? a[0];
  const ay = a.y ?? a[1];
  const az = a.z ?? a[2];
  const bx = b.x ?? b[0];
  const by = b.y ?? b[1];
  const bz = b.z ?? b[2];
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Measures the floor-plane (XZ) distance, ignoring Y (height).
 * Useful for footprint calculations on a factory floor.
 */
export function measureFloorDistance(
  a: Vec3 | { x: number; y: number; z: number },
  b: Vec3 | { x: number; y: number; z: number }
): number {
  const ax = a.x ?? a[0];
  const az = a.z ?? a[2];
  const bx = b.x ?? b[0];
  const bz = b.z ?? b[2];
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// ── Safety Zone ───────────────────────────────────────────────────────────────

/**
 * Creates a safety zone around a node at the given radius.
 * Safety zones mark exclusion areas around industrial equipment.
 */
export function safetyZone(
  node: { id: string; position: Vec3 | { x: number; y: number; z: number } },
  radius: number,
  type: SafetyZone['type'] = 'exclusion'
): SafetyZone {
  const pos = node.position;
  const center = vec3(pos.x ?? pos[0], pos.y ?? pos[1], pos.z ?? pos[2]);
  return {
    nodeId: node.id,
    center,
    radius,
    type,
  };
}

/**
 * Returns true if a point is inside a safety zone.
 */
export function isInsideSafetyZone(
  point: Vec3 | { x: number; y: number; z: number },
  zone: SafetyZone
): boolean {
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
  const halfW = (Array.isArray(node.dimensions) ? node.dimensions[0] : node.dimensions.x) / 2;
  const halfH = (Array.isArray(node.dimensions) ? node.dimensions[1] : node.dimensions.y) / 2;
  const halfD = (Array.isArray(node.dimensions) ? node.dimensions[2] : node.dimensions.z) / 2;
  const px = Array.isArray(node.position) ? node.position[0] : node.position.x;
  const py = Array.isArray(node.position) ? node.position[1] : node.position.y;
  const pz = Array.isArray(node.position) ? node.position[2] : node.position.z;
  return {
    min: vec3(px - halfW, py - halfH, pz - halfD),
    max: vec3(px + halfW, py + halfH, pz + halfD),
  };
}

/** Returns true if two bounding boxes intersect (AABB test). */
export function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  const a_min_x = a.min.x ?? a.min[0];
  const a_max_x = a.max.x ?? a.max[0];
  const a_min_y = a.min.y ?? a.min[1];
  const a_max_y = a.max.y ?? a.max[1];
  const a_min_z = a.min.z ?? a.min[2];
  const a_max_z = a.max.z ?? a.max[2];
  const b_min_x = b.min.x ?? b.min[0];
  const b_max_x = b.max.x ?? b.max[0];
  const b_min_y = b.min.y ?? b.min[1];
  const b_max_y = b.max.y ?? b.max[1];
  const b_min_z = b.min.z ?? b.min[2];
  const b_max_z = b.max.z ?? b.max[2];
  return (
    a_min_x <= b_max_x &&
    a_max_x >= b_min_x &&
    a_min_y <= b_max_y &&
    a_max_y >= b_min_y &&
    a_min_z <= b_max_z &&
    a_max_z >= b_min_z
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
