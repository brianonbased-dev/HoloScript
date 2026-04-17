import type { Vector3 } from '@holoscript/core';
/**
 * PhysicsWorldImpl.ts
 *
 * Physics world implementation with broadphase collision detection,
 * constraint solving, and spatial queries.
 *
 * @module physics
 */

import {
  IVector3,
  IQuaternion,
  ITransform,
  IRigidBodyConfig,
  IRigidBodyState,
  IPhysicsWorld,
  IPhysicsWorldConfig,
  Constraint,
  CollisionShape,
  ICollisionEvent,
  ITriggerEvent,
  ICollisionFilter,
  IRay,
  IRaycastHit,
  IRaycastOptions,
  IOverlapResult,
  PHYSICS_DEFAULTS,
} from './PhysicsTypes';
import { RigidBody } from './PhysicsBody';
import { IslandDetector } from './IslandDetector';

// ============================================================================
// Vector Math Utilities (used by GJK/EPA)
// ============================================================================

function vec3Dot(a: IVector3, b: IVector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vec3Cross(a: IVector3, b: IVector3): IVector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vec3Sub(a: IVector3, b: IVector3): IVector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Add(a: IVector3, b: IVector3): IVector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vec3Scale(v: IVector3, s: number): IVector3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function vec3Negate(v: IVector3): IVector3 {
  return [-v[0], -v[1], -v[2]];
}

function vec3Length(v: IVector3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vec3LengthSq(v: IVector3): number {
  return v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
}

function vec3Normalize(v: IVector3): IVector3 {
  const len = vec3Length(v);
  if (len < 1e-10) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Triple product: (a x b) x c  -- used in GJK for perpendicular direction
 */
function vec3TripleProduct(a: IVector3, b: IVector3, c: IVector3): IVector3 {
  return vec3Cross(vec3Cross(a, b), c);
}

// ============================================================================
// GJK/EPA Support Function
// ============================================================================

/**
 * Returns the farthest point of a collision shape in a given direction (world space).
 * This is the "support function" needed by GJK.
 */
function shapeSupport(shape: CollisionShape, position: IVector3, direction: IVector3): IVector3 {
  switch (shape.type) {
    case 'sphere': {
      const norm = vec3Normalize(direction);
      return vec3Add(position, vec3Scale(norm, shape.radius));
    }
    case 'box': {
      const he = shape.halfExtents;
      return [
        position[0] + (direction[0] >= 0 ? he[0] : -he[0]),
        position[1] + (direction[1] >= 0 ? he[1] : -he[1]),
        position[2] + (direction[2] >= 0 ? he[2] : -he[2]),
      ];
    }
    case 'capsule': {
      // Capsule = line segment + sphere sweep
      const halfH = shape.height / 2;
      const r = shape.radius;
      const axis = shape.axis ?? 'y';
      let segDir: IVector3;
      if (axis === 'x') segDir = [1, 0, 0];
      else if (axis === 'z') segDir = [0, 0, 1];
      else segDir = [0, 1, 0];

      // Pick the endpoint of the line segment farthest along direction
      const dotSeg = vec3Dot(direction, segDir);
      const endPoint =
        dotSeg >= 0
          ? vec3Add(position, vec3Scale(segDir, halfH))
          : vec3Sub(position, vec3Scale(segDir, halfH));

      // Then extend by sphere radius in the direction
      const norm = vec3Normalize(direction);
      return vec3Add(endPoint, vec3Scale(norm, r));
    }
    case 'cylinder': {
      const halfH = shape.height / 2;
      const r = shape.radius;
      const axis = shape.axis ?? 'y';
      let axisDir: IVector3;
      if (axis === 'x') axisDir = [1, 0, 0];
      else if (axis === 'z') axisDir = [0, 0, 1];
      else axisDir = [0, 1, 0];

      // Component of direction along axis
      const dotAxis = vec3Dot(direction, axisDir);
      const axisPoint = dotAxis >= 0 ? vec3Scale(axisDir, halfH) : vec3Scale(axisDir, -halfH);

      // Component of direction perpendicular to axis
      const perpDir = vec3Sub(direction, vec3Scale(axisDir, dotAxis));
      const perpLen = vec3Length(perpDir);
      const discPoint: IVector3 = perpLen > 1e-10 ? vec3Scale(perpDir, r / perpLen) : [0, 0, 0];

      return vec3Add(position, vec3Add(axisPoint, discPoint));
    }
    case 'cone': {
      // Cone along Y-axis: apex at +height/2, base center at -height/2 with given radius
      const halfH = shape.height / 2;
      const r = shape.radius;
      const apex: IVector3 = [0, halfH, 0];

      // Direction projected onto the XZ plane
      const perpDir: IVector3 = [direction[0], 0, direction[2]];
      const perpLen = vec3Length(perpDir);

      // Base center point farthest in direction on the base disc
      const baseCenter: IVector3 = [0, -halfH, 0];
      const basePoint =
        perpLen > 1e-10 ? vec3Add(baseCenter, vec3Scale(perpDir, r / perpLen)) : baseCenter;

      // Pick whichever support point is farthest along direction
      const dotApex = vec3Dot(apex, direction);
      const dotBase = vec3Dot(basePoint, direction);

      return dotApex >= dotBase ? vec3Add(position, apex) : vec3Add(position, basePoint);
    }
    case 'convex': {
      // Brute-force search through vertices
      const verts = shape.vertices;
      let bestDot = -Infinity;
      let bestPoint: IVector3 = position;
      for (let i = 0; i < verts.length; i += 3) {
        const vx = verts[i] + position[0];
        const vy = verts[i + 1] + position[1];
        const vz = verts[i + 2] + position[2];
        const d = vx * direction[0] + vy * direction[1] + vz * direction[2];
        if (d > bestDot) {
          bestDot = d;
          bestPoint = [vx, vy, vz];
        }
      }
      return bestPoint;
    }
    default: {
      // Fallback: treat as unit sphere
      const norm = vec3Normalize(direction);
      return vec3Add(position, norm);
    }
  }
}

/**
 * Minkowski difference support: support_A(d) - support_B(-d)
 */
function minkowskiSupport(
  shapeA: CollisionShape,
  posA: IVector3,
  shapeB: CollisionShape,
  posB: IVector3,
  direction: IVector3
): IVector3 {
  const pointA = shapeSupport(shapeA, posA, direction);
  const pointB = shapeSupport(shapeB, posB, vec3Negate(direction));
  return vec3Sub(pointA, pointB);
}

// ============================================================================
// GJK Algorithm (3D)
// ============================================================================

/** Maximum GJK iterations to prevent infinite loops */
const GJK_MAX_ITERATIONS = 64;
/** EPA tolerance for convergence */
const EPA_TOLERANCE = 1e-6;
/** Maximum EPA iterations */
const EPA_MAX_ITERATIONS = 64;
/** Maximum EPA faces */
const EPA_MAX_FACES = 128;

interface GJKResult {
  intersects: boolean;
  simplex: IVector3[]; // final simplex (tetrahedron if intersecting)
}

/**
 * GJK intersection test between two convex shapes.
 *
 * Returns whether the Minkowski difference contains the origin and,
 * if so, the final simplex (tetrahedron) for use by EPA.
 */
function gjk(
  shapeA: CollisionShape,
  posA: IVector3,
  shapeB: CollisionShape,
  posB: IVector3
): GJKResult {
  // Initial direction: from A to B
  let direction = vec3Sub(posB, posA);
  if (vec3LengthSq(direction) < 1e-10) {
    direction = [1, 0, 0];
  }

  const simplex: IVector3[] = [];
  const a = minkowskiSupport(shapeA, posA, shapeB, posB, direction);
  simplex.push(a);

  // If the first support point doesn't pass the origin, no intersection
  if (vec3Dot(a, direction) < 0) {
    return { intersects: false, simplex };
  }

  direction = vec3Negate(a);

  for (let iter = 0; iter < GJK_MAX_ITERATIONS; iter++) {
    const newPoint = minkowskiSupport(shapeA, posA, shapeB, posB, direction);

    // If the new point didn't pass the origin along direction, no intersection
    if (vec3Dot(newPoint, direction) < 0) {
      return { intersects: false, simplex };
    }

    simplex.push(newPoint);

    // Process the simplex and get the new search direction
    const result = doSimplex(simplex, direction);
    if (result.containsOrigin) {
      return { intersects: true, simplex };
    }
    direction = result.direction;

    // Safety: if direction is degenerate, bail
    if (vec3LengthSq(direction) < 1e-20) {
      return { intersects: false, simplex };
    }
  }

  // Timed out -- assume no intersection
  return { intersects: false, simplex };
}

interface SimplexResult {
  containsOrigin: boolean;
  direction: IVector3;
}

/**
 * Process the simplex. Modifies `simplex` in-place (may remove vertices).
 * Returns the new search direction or indicates origin is enclosed.
 *
 * The newest point is always the last element (simplex[simplex.length-1]).
 */
function doSimplex(simplex: IVector3[], direction: IVector3): SimplexResult {
  switch (simplex.length) {
    case 2:
      return doSimplexLine(simplex, direction);
    case 3:
      return doSimplexTriangle(simplex, direction);
    case 4:
      return doSimplexTetrahedron(simplex, direction);
    default:
      // Should not happen
      return { containsOrigin: false, direction };
  }
}

/**
 * Line case: simplex = [B, A]  (A is newest)
 */
function doSimplexLine(simplex: IVector3[], _direction: IVector3): SimplexResult {
  const a = simplex[1]; // newest
  const b = simplex[0];

  const ab = vec3Sub(b, a);
  const ao = vec3Negate(a); // origin - a

  if (vec3Dot(ab, ao) > 0) {
    // Origin is in the region between A and B
    // Direction perpendicular to AB toward origin
    const newDir = vec3TripleProduct(ab, ao, ab);
    // If triple product is zero, AB and AO are parallel
    if (vec3LengthSq(newDir) < 1e-20) {
      // Pick any perpendicular
      const perp = vec3Perpendicular(ab);
      return { containsOrigin: false, direction: perp };
    }
    return { containsOrigin: false, direction: newDir };
  } else {
    // Origin is beyond A; drop B
    simplex.splice(0, 1); // remove B, leaving [A]
    return { containsOrigin: false, direction: ao };
  }
}

/**
 * Triangle case: simplex = [C, B, A]  (A is newest)
 */
function doSimplexTriangle(simplex: IVector3[], _direction: IVector3): SimplexResult {
  const a = simplex[2]; // newest
  const b = simplex[1];
  const c = simplex[0];

  const ab = vec3Sub(b, a);
  const ac = vec3Sub(c, a);
  const ao = vec3Negate(a);

  const abc = vec3Cross(ab, ac); // triangle normal

  // Check if origin is outside edge AC (on the side away from B)
  const acPerp = vec3Cross(abc, ac);
  if (vec3Dot(acPerp, ao) > 0) {
    if (vec3Dot(ac, ao) > 0) {
      // Region AC: remove B
      simplex.splice(1, 1); // [C, A]
      const newDir = vec3TripleProduct(ac, ao, ac);
      if (vec3LengthSq(newDir) < 1e-20)
        return { containsOrigin: false, direction: vec3Perpendicular(ac) };
      return { containsOrigin: false, direction: newDir };
    } else {
      // Region A or AB
      return doSimplexLineCheck(simplex, a, b, ao, ab);
    }
  }

  // Check if origin is outside edge AB (on the side away from C)
  const abPerp = vec3Cross(ab, abc);
  if (vec3Dot(abPerp, ao) > 0) {
    return doSimplexLineCheck(simplex, a, b, ao, ab);
  }

  // Origin is within the triangle prism. Check above or below.
  if (vec3Dot(abc, ao) > 0) {
    // Above the triangle
    // simplex stays [C, B, A], direction = abc
    return { containsOrigin: false, direction: abc };
  } else {
    // Below the triangle. Rewind the winding.
    // swap B and C so normal points toward origin
    simplex[0] = b;
    simplex[1] = c;
    return { containsOrigin: false, direction: vec3Negate(abc) };
  }
}

/**
 * Helper for triangle case: check AB edge region
 */
function doSimplexLineCheck(
  simplex: IVector3[],
  a: IVector3,
  b: IVector3,
  ao: IVector3,
  ab: IVector3
): SimplexResult {
  if (vec3Dot(ab, ao) > 0) {
    // Region AB: keep only A and B
    simplex.length = 0;
    simplex.push(b, a);
    const newDir = vec3TripleProduct(ab, ao, ab);
    if (vec3LengthSq(newDir) < 1e-20)
      return { containsOrigin: false, direction: vec3Perpendicular(ab) };
    return { containsOrigin: false, direction: newDir };
  } else {
    // Region A only
    simplex.length = 0;
    simplex.push(a);
    return { containsOrigin: false, direction: ao };
  }
}

/**
 * Tetrahedron case: simplex = [D, C, B, A]  (A is newest)
 */
function doSimplexTetrahedron(simplex: IVector3[], _direction: IVector3): SimplexResult {
  const a = simplex[3]; // newest
  const b = simplex[2];
  const c = simplex[1];
  const d = simplex[0];

  const ab = vec3Sub(b, a);
  const ac = vec3Sub(c, a);
  const ad = vec3Sub(d, a);
  const ao = vec3Negate(a);

  // Face normals pointing outward from the tetrahedron
  const abcNorm = vec3Cross(ab, ac);
  const acdNorm = vec3Cross(ac, ad);
  const adbNorm = vec3Cross(ad, ab);

  // Ensure normals point away from the opposite vertex by checking against
  // the direction from A to the centroid of the opposite face's complement
  // Instead, check if the opposite vertex is on the negative side
  // For face ABC: if D is on the negative side, normal points away from D
  if (vec3Dot(abcNorm, ad) > 0) {
    // Normal points toward D, flip it
    abcNorm[0] = -abcNorm[0];
    abcNorm[1] = -abcNorm[1];
    abcNorm[2] = -abcNorm[2];
  }
  if (vec3Dot(acdNorm, ab) > 0) {
    acdNorm[0] = -acdNorm[0];
    acdNorm[1] = -acdNorm[1];
    acdNorm[2] = -acdNorm[2];
  }
  if (vec3Dot(adbNorm, ac) > 0) {
    adbNorm[0] = -adbNorm[0];
    adbNorm[1] = -adbNorm[1];
    adbNorm[2] = -adbNorm[2];
  }

  // Check which face(s) the origin is in front of
  const abcDot = vec3Dot(abcNorm, ao);
  const acdDot = vec3Dot(acdNorm, ao);
  const adbDot = vec3Dot(adbNorm, ao);

  if (abcDot > 0) {
    // Origin is outside face ABC -- remove D
    simplex.splice(0, 1); // [C, B, A]
    return doSimplexTriangle(simplex, abcNorm);
  }

  if (acdDot > 0) {
    // Origin is outside face ACD -- remove B
    simplex.splice(2, 1); // [D, C, A]
    return doSimplexTriangle(simplex, acdNorm);
  }

  if (adbDot > 0) {
    // Origin is outside face ADB -- remove C
    simplex.splice(1, 1); // [D, B, A]
    return doSimplexTriangle(simplex, adbNorm);
  }

  // Origin is inside the tetrahedron
  return { containsOrigin: true, direction: [0, 0, 0] };
}

/**
 * Returns an arbitrary vector perpendicular to v.
 */
function vec3Perpendicular(v: IVector3): IVector3 {
  if (Math.abs(v[0]) < 0.9) {
    return vec3Normalize(vec3Cross(v, [1, 0, 0]));
  }
  return vec3Normalize(vec3Cross(v, [0, 1, 0]));
}

// ============================================================================
// EPA Algorithm (Expanding Polytope Algorithm)
// ============================================================================

interface EPAFace {
  a: number;
  b: number;
  c: number;
  normal: IVector3;
  distance: number;
}

interface EPAResult {
  normal: IVector3;
  penetration: number;
}

/**
 * EPA: Given a simplex (tetrahedron) that contains the origin, expand the polytope
 * to find the closest face to the origin, yielding contact normal and penetration depth.
 */
function epa(
  simplex: IVector3[],
  shapeA: CollisionShape,
  posA: IVector3,
  shapeB: CollisionShape,
  posB: IVector3
): EPAResult {
  // The simplex should be a tetrahedron (4 points)
  // Build initial polytope from the 4 faces
  const polytope: IVector3[] = [...simplex];

  // Create 4 faces with outward-pointing normals
  const faces: EPAFace[] = [];
  // Faces: [0,1,2], [0,2,3], [0,3,1], [1,3,2]
  const faceIndices: [number, number, number][] = [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 1],
    [1, 3, 2],
  ];

  // Compute centroid to ensure normals point outward
  const centroid: IVector3 = [
    (polytope[0][0] + polytope[1][0] + polytope[2][0] + polytope[3][0]) / 4,
    (polytope[0][1] + polytope[1][1] + polytope[2][1] + polytope[3][1]) / 4,
    (polytope[0][2] + polytope[1][2] + polytope[2][2] + polytope[3][2]) / 4,
  ];

  for (const [ia, ib, ic] of faceIndices) {
    const face = buildEPAFace(polytope, ia, ib, ic, centroid);
    if (face) faces.push(face);
  }

  for (let iter = 0; iter < EPA_MAX_ITERATIONS; iter++) {
    if (faces.length === 0) break;

    // Find closest face to origin
    let closestIdx = 0;
    let closestDist = faces[0].distance;
    for (let i = 1; i < faces.length; i++) {
      if (faces[i].distance < closestDist) {
        closestDist = faces[i].distance;
        closestIdx = i;
      }
    }

    const closestFace = faces[closestIdx];
    const searchDir = closestFace.normal;

    // Get new support point in the direction of the closest face normal
    const newPoint = minkowskiSupport(shapeA, posA, shapeB, posB, searchDir);
    const newDist = vec3Dot(newPoint, searchDir);

    // Check convergence
    if (newDist - closestDist < EPA_TOLERANCE) {
      return {
        normal: closestFace.normal,
        penetration: closestDist,
      };
    }

    // Limit polytope size
    if (polytope.length >= EPA_MAX_FACES) {
      return {
        normal: closestFace.normal,
        penetration: closestDist,
      };
    }

    // Add the new point to the polytope
    const newIdx = polytope.length;
    polytope.push(newPoint);

    // Find and remove all faces visible from the new point
    // A face is visible if the new point is in front of it
    const edges: [number, number][] = [];
    const removedFaces: number[] = [];

    for (let i = faces.length - 1; i >= 0; i--) {
      const face = faces[i];
      const toNew = vec3Sub(newPoint, polytope[face.a]);
      if (vec3Dot(face.normal, toNew) > 0) {
        // This face is visible from the new point; record its edges
        addEdge(edges, face.a, face.b);
        addEdge(edges, face.b, face.c);
        addEdge(edges, face.c, face.a);
        removedFaces.push(i);
      }
    }

    // Remove faces back to front to preserve indices
    for (const idx of removedFaces) {
      faces.splice(idx, 1);
    }

    // Create new faces from the horizon edges to the new point
    const newCentroid: IVector3 = [
      (centroid[0] * (polytope.length - 1)) / polytope.length + newPoint[0] / polytope.length,
      (centroid[1] * (polytope.length - 1)) / polytope.length + newPoint[1] / polytope.length,
      (centroid[2] * (polytope.length - 1)) / polytope.length + newPoint[2] / polytope.length,
    ];

    for (const [edgeA, edgeB] of edges) {
      const face = buildEPAFace(polytope, edgeA, edgeB, newIdx, newCentroid);
      if (face) faces.push(face);
    }
  }

  // Fallback: return best result found
  if (faces.length > 0) {
    let closestIdx = 0;
    let closestDist = faces[0].distance;
    for (let i = 1; i < faces.length; i++) {
      if (faces[i].distance < closestDist) {
        closestDist = faces[i].distance;
        closestIdx = i;
      }
    }
    return {
      normal: faces[closestIdx].normal,
      penetration: faces[closestIdx].distance,
    };
  }

  // Ultimate fallback
  return {
    normal: [0, 1, 0],
    penetration: 0,
  };
}

/**
 * Build an EPA face from three vertex indices, ensuring the normal points
 * away from the centroid.
 */
function buildEPAFace(
  polytope: IVector3[],
  ia: number,
  ib: number,
  ic: number,
  centroid: IVector3
): EPAFace | null {
  const a = polytope[ia];
  const b = polytope[ib];
  const c = polytope[ic];

  const ab = vec3Sub(b, a);
  const ac = vec3Sub(c, a);
  let normal = vec3Cross(ab, ac);
  const len = vec3Length(normal);

  if (len < 1e-10) {
    // Degenerate face
    return null;
  }

  normal = vec3Scale(normal, 1 / len);

  // Ensure normal points away from centroid
  const faceToCentroid = vec3Sub(centroid, a);
  if (vec3Dot(normal, faceToCentroid) > 0) {
    normal = vec3Negate(normal);
    // Also swap winding so edges are consistent
    return {
      a: ia,
      b: ic,
      c: ib,
      normal,
      distance: Math.abs(vec3Dot(normal, a)),
    };
  }

  return {
    a: ia,
    b: ib,
    c: ic,
    normal,
    distance: Math.abs(vec3Dot(normal, a)),
  };
}

/**
 * Add an edge to the edge list. If the reverse edge already exists,
 * remove it (shared edge = not on the horizon).
 */
function addEdge(edges: [number, number][], a: number, b: number): void {
  // Check if reverse edge already exists
  for (let i = edges.length - 1; i >= 0; i--) {
    if (edges[i][0] === b && edges[i][1] === a) {
      // Shared edge, remove both
      edges.splice(i, 1);
      return;
    }
  }
  edges.push([a, b]);
}

/**
 * AABB for broadphase
 */
interface IAABB {
  min: IVector3;
  max: IVector3;
}

/**
 * Collision pair
 */
interface ICollisionPair {
  bodyA: RigidBody;
  bodyB: RigidBody;
}

/**
 * Constraint instance
 */
interface IConstraintInstance {
  config: Constraint;
  bodyA: RigidBody;
  bodyB: RigidBody | null;
  enabled: boolean;
}

/**
 * Physics world implementation
 */
export class PhysicsWorldImpl implements IPhysicsWorld {
  private config: Required<IPhysicsWorldConfig>;
  private bodies: Map<string, RigidBody> = new Map();
  private constraints: Map<string, IConstraintInstance> = new Map();
  private collisionEvents: ICollisionEvent[] = [];
  private triggerEvents: ITriggerEvent[] = [];
  private islandDetector: IslandDetector;
  private accumulator: number = 0;

  // Cached for iteration
  private bodiesArray: RigidBody[] = [];
  private collisionPairs: ICollisionPair[] = [];
  private activeContacts: Map<string, boolean> = new Map();

  constructor(config?: IPhysicsWorldConfig) {
    const defaultG = PHYSICS_DEFAULTS.gravity;
    let initialGravity: IVector3;
    if (config?.gravity) {
      const g = config.gravity as any;
      initialGravity = [
        g.x ?? g[0] ?? 0,
        g.y ?? g[1] ?? 0,
        g.z ?? g[2] ?? 0
      ] as IVector3;
    } else {
      initialGravity = [...defaultG] as IVector3;
    }

    this.config = {
      gravity: initialGravity,
      fixedTimestep: config?.fixedTimestep ?? PHYSICS_DEFAULTS.fixedTimestep,
      maxSubsteps: config?.maxSubsteps ?? PHYSICS_DEFAULTS.maxSubsteps,
      solverIterations: config?.solverIterations ?? PHYSICS_DEFAULTS.solverIterations,
      allowSleep: config?.allowSleep ?? true,
      broadphase: config?.broadphase ?? 'aabb',
    };

    this.islandDetector = new IslandDetector();
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  public setGravity(gravity: IVector3): void {
    const g = gravity as any;
    this.config.gravity = [
      g.x ?? g[0] ?? 0,
      g.y ?? g[1] ?? 0,
      g.z ?? g[2] ?? 0
    ] as IVector3;
  }

  public getGravity(): IVector3 {
    return {
      x: this.config.gravity[0],
      y: this.config.gravity[1],
      z: this.config.gravity[2]
    } as unknown as IVector3;
  }

  // ============================================================================
  // Body Management
  // ============================================================================

  public createBody(config: IRigidBodyConfig): string {
    if (this.bodies.has(config.id)) {
      throw new Error(`Body with id '${config.id}' already exists`);
    }

    const body = new RigidBody(config);
    this.bodies.set(config.id, body);
    this.bodiesArray.push(body);

    return body.id;
  }

  public removeBody(id: string): boolean {
    const body = this.bodies.get(id);
    if (!body) return false;

    // Remove associated constraints
    for (const [constraintId, constraint] of this.constraints) {
      if (constraint.bodyA === body || constraint.bodyB === body) {
        this.constraints.delete(constraintId);
      }
    }

    this.bodies.delete(id);
    this.bodiesArray = this.bodiesArray.filter((b) => b.id !== id);

    return true;
  }

  public getBody(id: string): IRigidBodyState | undefined {
    const body = this.bodies.get(id);
    return body?.getState();
  }

  public getAllBodies(): IRigidBodyState[] {
    return this.bodiesArray.map((b) => b.getState());
  }

  // ============================================================================
  // Body Manipulation
  // ============================================================================

  public setPosition(id: string, position: IVector3): void {
    const body = this.bodies.get(id);
    if (body) body.position = position;
  }

  public setRotation(id: string, rotation: IQuaternion): void {
    const body = this.bodies.get(id);
    if (body) body.rotation = rotation;
  }

  public setTransform(id: string, transform: ITransform): void {
    const body = this.bodies.get(id);
    if (body) body.setTransform(transform);
  }

  public setLinearVelocity(id: string, velocity: IVector3): void {
    const body = this.bodies.get(id);
    if (body) body.linearVelocity = velocity;
  }

  public setAngularVelocity(id: string, velocity: IVector3): void {
    const body = this.bodies.get(id);
    if (body) body.angularVelocity = velocity;
  }

  public applyForce(id: string, force: IVector3, worldPoint?: IVector3): void {
    const body = this.bodies.get(id);
    if (!body) return;

    if (worldPoint) {
      body.applyForceAtPoint(force, worldPoint);
    } else {
      body.applyForce(force);
    }
  }

  public applyImpulse(id: string, impulse: IVector3, worldPoint?: IVector3): void {
    const body = this.bodies.get(id);
    if (!body) return;

    if (worldPoint) {
      body.applyImpulseAtPoint(impulse, worldPoint);
    } else {
      body.applyImpulse(impulse);
    }
  }

  public applyTorque(id: string, torque: IVector3): void {
    const body = this.bodies.get(id);
    if (body) body.applyTorque(torque);
  }

  public applyTorqueImpulse(id: string, impulse: IVector3): void {
    const body = this.bodies.get(id);
    if (body) body.applyTorqueImpulse(impulse);
  }

  // ============================================================================
  // Constraint Management
  // ============================================================================

  public createConstraint(constraint: Constraint): string {
    if (this.constraints.has(constraint.id)) {
      throw new Error(`Constraint with id '${constraint.id}' already exists`);
    }

    const bodyA = this.bodies.get(constraint.bodyA);
    if (!bodyA) {
      throw new Error(`Body A '${constraint.bodyA}' not found`);
    }

    let bodyB: RigidBody | null = null;
    if (constraint.bodyB) {
      bodyB = this.bodies.get(constraint.bodyB) ?? null;
      if (!bodyB) {
        throw new Error(`Body B '${constraint.bodyB}' not found`);
      }
    }

    this.constraints.set(constraint.id, {
      config: constraint,
      bodyA,
      bodyB,
      enabled: true,
    });

    return constraint.id;
  }

  public removeConstraint(id: string): boolean {
    return this.constraints.delete(id);
  }

  public setConstraintEnabled(id: string, enabled: boolean): void {
    const constraint = this.constraints.get(id);
    if (constraint) constraint.enabled = enabled;
  }

  // ============================================================================
  // Simulation
  // ============================================================================

  public step(deltaTime: number): void {
    // Clear events
    this.collisionEvents = [];
    this.triggerEvents = [];

    // Fixed timestep with accumulator
    this.accumulator += deltaTime;
    let substeps = 0;

    while (this.accumulator >= this.config.fixedTimestep && substeps < this.config.maxSubsteps) {
      this.fixedStep(this.config.fixedTimestep);
      this.accumulator -= this.config.fixedTimestep;
      substeps++;
    }
  }

  private fixedStep(dt: number): void {
    // Broadphase collision detection
    this.broadphase();

    // Narrowphase collision detection and generate contacts
    this.narrowphase();

    // Detect islands for sleeping
    if (this.config.allowSleep) {
      this.detectIslands();
    }

    // Integrate forces (gravity + accumulated user forces)
    for (const body of this.bodiesArray) {
      body.integrateForces(dt, this.config.gravity);
    }

    // Clear forces after integration
    for (const body of this.bodiesArray) {
      body.clearForces();
    }

    // Solve constraints
    this.solveConstraints(dt);

    // Integrate velocities
    for (const body of this.bodiesArray) {
      body.integrateVelocities(dt);
    }

    // Update sleep state
    if (this.config.allowSleep) {
      for (const body of this.bodiesArray) {
        body.updateSleep(dt);
      }
    }
  }

  // ============================================================================
  // Collision Detection
  // ============================================================================

  private broadphase(): void {
    this.collisionPairs = [];

    // Simple O(n²) AABB check
    for (let i = 0; i < this.bodiesArray.length; i++) {
      const bodyA = this.bodiesArray[i];
      if (!bodyA.isActive) continue;

      const aabbA = this.getBodyAABB(bodyA);

      for (let j = i + 1; j < this.bodiesArray.length; j++) {
        const bodyB = this.bodiesArray[j];
        if (!bodyB.isActive) continue;

        // Skip if both static
        if (bodyA.type === 'static' && bodyB.type === 'static') continue;

        // Check collision filter
        if (!bodyA.canCollideWith(bodyB)) continue;

        const aabbB = this.getBodyAABB(bodyB);

        if (this.aabbOverlap(aabbA, aabbB)) {
          this.collisionPairs.push({ bodyA, bodyB });
        }
      }
    }
  }

  private narrowphase(): void {
    const newContacts = new Map<string, boolean>();

    for (const pair of this.collisionPairs) {
      const contactKey = this.getContactKey(pair.bodyA.id, pair.bodyB.id);
      const wasContacting = this.activeContacts.has(contactKey);

      // Narrowphase: sphere-sphere fast path or GJK/EPA for general convex pairs
      const collision = this.checkCollision(pair.bodyA, pair.bodyB);

      if (collision) {
        newContacts.set(contactKey, true);

        const eventType = wasContacting ? 'persist' : 'begin';
        this.collisionEvents.push({
          type: eventType,
          bodyA: pair.bodyA.id,
          bodyB: pair.bodyB.id,
          contacts: collision.contacts,
        });

        // Apply collision response
        this.resolveCollision(pair.bodyA, pair.bodyB, collision);
      }
    }

    // Detect ended collisions
    for (const [key] of this.activeContacts) {
      if (!newContacts.has(key)) {
        const [idA, idB] = key.split('|');
        this.collisionEvents.push({
          type: 'end',
          bodyA: idA,
          bodyB: idB,
          contacts: [],
        });
      }
    }

    this.activeContacts = newContacts;
  }

  private checkCollision(
    bodyA: RigidBody,
    bodyB: RigidBody
  ): {
    contacts: Array<{ position: IVector3; normal: IVector3; penetration: number; impulse: number }>;
  } | null {
    // ---- Fast path: sphere-sphere (exact, avoids GJK overhead) ----
    if (bodyA.shape.type === 'sphere' && bodyB.shape.type === 'sphere') {
      return this.checkSphereSphere(bodyA, bodyB);
    }

    // ---- GJK/EPA for all other convex shape pairs ----
    return this.checkGJKEPA(bodyA, bodyB);
  }

  /**
   * Optimized sphere-sphere collision (analytic, O(1)).
   */
  private checkSphereSphere(
    bodyA: RigidBody,
    bodyB: RigidBody
  ): {
    contacts: Array<{ position: IVector3; normal: IVector3; penetration: number; impulse: number }>;
  } | null {
    const posA = bodyA.position;
    const posB = bodyB.position;
    const radiusA = (bodyA.shape as { radius: number }).radius;
    const radiusB = (bodyB.shape as { radius: number }).radius;

    const dx = posB[0] - posA[0];
    const dy = posB[1] - posA[1];
    const dz = posB[2] - posA[2];
    const distSq = dx * dx + dy * dy + dz * dz;
    const radiusSum = radiusA + radiusB;

    if (distSq >= radiusSum * radiusSum) {
      return null;
    }

    const dist = Math.sqrt(distSq);
    const penetration = radiusSum - dist;

    const normal: IVector3 = dist > 0 ? [dx / dist, dy / dist, dz / dist] : [0, 1, 0];

    const contactPoint: IVector3 = [
      posA[0] + normal[0] * radiusA,
      posA[1] + normal[1] * radiusA,
      posA[2] + normal[2] * radiusA,
    ];

    return {
      contacts: [
        {
          position: contactPoint,
          normal,
          penetration,
          impulse: 0,
        },
      ],
    };
  }

  /**
   * GJK/EPA narrowphase collision for arbitrary convex shape pairs.
   *
   * 1. Run GJK to determine overlap (boolean).
   * 2. If overlapping, run EPA to get contact normal + penetration depth.
   * 3. Compute an approximate contact point on the surface between the two shapes.
   */
  private checkGJKEPA(
    bodyA: RigidBody,
    bodyB: RigidBody
  ): {
    contacts: Array<{ position: IVector3; normal: IVector3; penetration: number; impulse: number }>;
  } | null {
    const posA = bodyA.position;
    const posB = bodyB.position;

    // Step 1: GJK intersection test
    const gjkResult = gjk(bodyA.shape, posA, bodyB.shape, posB);

    if (!gjkResult.intersects) {
      return null;
    }

    // Step 2: EPA to find penetration depth and contact normal
    const epaResult = epa(gjkResult.simplex, bodyA.shape, posA, bodyB.shape, posB);

    // The normal from EPA points from A to B (direction to push B away from A).
    // Ensure the normal points from A toward B.
    const aToB = vec3Sub(posB, posA);
    let normal = epaResult.normal;
    if (vec3Dot(normal, aToB) < 0) {
      normal = vec3Negate(normal);
    }

    const penetration = epaResult.penetration;

    // Step 3: Approximate contact point
    // Use support points on each shape along the contact normal direction
    const supportA = shapeSupport(bodyA.shape, posA, normal);
    const supportB = shapeSupport(bodyB.shape, posB, vec3Negate(normal));
    const contactPoint: IVector3 = [
      (supportA[0] + supportB[0]) / 2,
      (supportA[1] + supportB[1]) / 2,
      (supportA[2] + supportB[2]) / 2,
    ];

    return {
      contacts: [
        {
          position: contactPoint,
          normal,
          penetration,
          impulse: 0,
        },
      ],
    };
  }

  private resolveCollision(
    bodyA: RigidBody,
    bodyB: RigidBody,
    collision: {
      contacts: Array<{
        position: IVector3;
        normal: IVector3;
        penetration: number;
        impulse: number;
      }>;
    }
  ): void {
    for (const contact of collision.contacts) {
      // Simple impulse-based resolution
      const normal = contact.normal;
      const relativeVelocity: IVector3 = [
        bodyB.linearVelocity[0] - bodyA.linearVelocity[0],
        bodyB.linearVelocity[1] - bodyA.linearVelocity[1],
        bodyB.linearVelocity[2] - bodyA.linearVelocity[2],
      ];

      const normalVelocity =
        relativeVelocity[0] * normal[0] +
        relativeVelocity[1] * normal[1] +
        relativeVelocity[2] * normal[2];

      // Don't resolve if separating
      if (normalVelocity > 0) continue;

      // Calculate restitution
      const restitution = Math.min(bodyA.material.restitution, bodyB.material.restitution);

      // Calculate impulse magnitude
      const invMassSum = bodyA.inverseMass + bodyB.inverseMass;
      if (invMassSum === 0) continue;

      const impulseMag = (-(1 + restitution) * normalVelocity) / invMassSum;

      // Apply impulse
      const impulse: IVector3 = [
        normal[0] * impulseMag,
        normal[1] * impulseMag,
        normal[2] * impulseMag,
      ];

      bodyA.applyImpulse([-impulse[0], -impulse[1], -impulse[2]]);
      bodyB.applyImpulse(impulse);

      // Position correction (penetration resolution)
      const percent = 0.8; // Correction percentage
      const slop = 0.01; // Penetration allowance

      const correctionMag = (Math.max(contact.penetration - slop, 0) / invMassSum) * percent;
      const correction: IVector3 = [
        normal[0] * correctionMag,
        normal[1] * correctionMag,
        normal[2] * correctionMag,
      ];

      if (bodyA.type === 'dynamic') {
        const posA = bodyA.position;
        bodyA.position = [
          posA[0] - correction[0] * bodyA.inverseMass,
          posA[1] - correction[1] * bodyA.inverseMass,
          posA[2] - correction[2] * bodyA.inverseMass,
        ];
      }

      if (bodyB.type === 'dynamic') {
        const posB = bodyB.position;
        bodyB.position = [
          posB[0] + correction[0] * bodyB.inverseMass,
          posB[1] + correction[1] * bodyB.inverseMass,
          posB[2] + correction[2] * bodyB.inverseMass,
        ];
      }

      // Store impulse
      contact.impulse = impulseMag;
    }
  }

  // ============================================================================
  // Constraints
  // ============================================================================

  private solveConstraints(_dt: number): void {
    for (let iter = 0; iter < this.config.solverIterations; iter++) {
      for (const [, constraint] of this.constraints) {
        if (!constraint.enabled) continue;
        this.solveConstraint(constraint);
      }
    }
  }

  private solveConstraint(constraint: IConstraintInstance): void {
    const { config, bodyA, bodyB } = constraint;

    switch (config.type) {
      case 'distance': {
        if (!bodyB) return;

        const posA = bodyA.position;
        const posB = bodyB.position;

        const dx = posB[0] - posA[0];
        const dy = posB[1] - posA[1];
        const dz = posB[2] - posA[2];
        const currentDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (currentDist === 0) return;

        const diff = (currentDist - config.distance) / currentDist;
        const correction: IVector3 = [
          dx * diff * 0.5,
          dy * diff * 0.5,
          dz * diff * 0.5,
        ];

        if (bodyA.type === 'dynamic') {
          bodyA.position = [
            posA[0] + correction[0],
            posA[1] + correction[1],
            posA[2] + correction[2],
          ];
        }

        if (bodyB.type === 'dynamic') {
          bodyB.position = [
            posB[0] - correction[0],
            posB[1] - correction[1],
            posB[2] - correction[2],
          ];
        }
        break;
      }

      // Add more constraint solvers as needed
      default:
        break;
    }
  }

  // ============================================================================
  // Island Detection
  // ============================================================================

  private detectIslands(): void {
    this.islandDetector.reset();

    // Add active dynamic bodies
    for (const body of this.bodiesArray) {
      if (body.type === 'dynamic' && body.isActive) {
        this.islandDetector.addBody(body.id);
      }
    }

    // Add connections from contacts
    for (const [contactKey] of this.activeContacts) {
      const [idA, idB] = contactKey.split('|');
      const bodyA = this.bodies.get(idA);
      const bodyB = this.bodies.get(idB);

      if (bodyA?.type === 'dynamic' && bodyB?.type === 'dynamic') {
        this.islandDetector.addConnection(idA, idB);
      }
    }

    // Detect islands (can be used for parallel solving)
    const _islands = this.islandDetector.detectIslands();
    // For now, just detect - parallel solving would use these islands
  }

  // ============================================================================
  // Events
  // ============================================================================

  public getContacts(): ICollisionEvent[] {
    return this.collisionEvents;
  }

  public getTriggers(): ITriggerEvent[] {
    return this.triggerEvents;
  }

  // ============================================================================
  // Spatial Queries
  // ============================================================================

  public raycast(ray: IRay, options?: IRaycastOptions): IRaycastHit[] {
    const hits: IRaycastHit[] = [];
    const maxDistance = ray.maxDistance ?? Infinity;

    for (const body of this.bodiesArray) {
      if (!body.isActive) continue;
      if (options?.excludeBodies?.includes(body.id)) continue;
      if (options?.filter && !this.filterMatches(body.filter, options.filter)) continue;

      const hit = this.raycastBody(ray, body, maxDistance);
      if (hit) {
        hits.push(hit);
      }
    }

    // Sort by distance
    hits.sort((a, b) => a.distance - b.distance);

    if (options?.closestOnly && hits.length > 0) {
      return [hits[0]];
    }

    return hits;
  }

  public raycastClosest(ray: IRay, options?: IRaycastOptions): IRaycastHit | null {
    const hits = this.raycast(ray, { ...options, closestOnly: true });
    return hits.length > 0 ? hits[0] : null;
  }

  private raycastBody(ray: IRay, body: RigidBody, maxDistance: number): IRaycastHit | null {
    const aabb = this.getBodyAABB(body);

    // Ray-AABB intersection
    let tmin = 0;
    let tmax = maxDistance;

    const invDirX = ray.direction[0] !== 0 ? 1 / ray.direction[0] : Infinity;
    const invDirY = ray.direction[1] !== 0 ? 1 / ray.direction[1] : Infinity;
    const invDirZ = ray.direction[2] !== 0 ? 1 / ray.direction[2] : Infinity;

    // X axis
    let t1 = (aabb.min[0] - ray.origin[0]) * invDirX;
    let t2 = (aabb.max[0] - ray.origin[0]) * invDirX;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;

    // Y axis
    t1 = (aabb.min[1] - ray.origin[1]) * invDirY;
    t2 = (aabb.max[1] - ray.origin[1]) * invDirY;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;

    // Z axis
    t1 = (aabb.min[2] - ray.origin[2]) * invDirZ;
    t2 = (aabb.max[2] - ray.origin[2]) * invDirZ;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;

    // Calculate hit point
    const distance = tmin >= 0 ? tmin : tmax;
    if (distance < 0 || distance > maxDistance) return null;

    const point: IVector3 = [
      ray.origin[0] + ray.direction[0] * distance,
      ray.origin[1] + ray.direction[1] * distance,
      ray.origin[2] + ray.direction[2] * distance,
    ];

    // Approximate normal (from AABB face)
    const normal = this.calculateAABBHitNormal(point, body.position, aabb);

    return {
      bodyId: body.id,
      point,
      normal,
      distance,
      fraction: distance / maxDistance,
    };
  }

  private calculateAABBHitNormal(point: IVector3, center: IVector3, aabb: IAABB): IVector3 {
    const epsilon = 0.001;

    if (Math.abs(point[0] - aabb.min[0]) < epsilon) return [-1, 0, 0];
    if (Math.abs(point[0] - aabb.max[0]) < epsilon) return [1, 0, 0];
    if (Math.abs(point[1] - aabb.min[1]) < epsilon) return [0, -1, 0];
    if (Math.abs(point[1] - aabb.max[1]) < epsilon) return [0, 1, 0];
    if (Math.abs(point[2] - aabb.min[2]) < epsilon) return [0, 0, -1];
    if (Math.abs(point[2] - aabb.max[2]) < epsilon) return [0, 0, 1];

    // Default: direction from center to point
    const dx = point[0] - center[0];
    const dy = point[1] - center[1];
    const dz = point[2] - center[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return len > 0 ? [dx / len, dy / len, dz / len] : [0, 1, 0];
  }

  public sphereOverlap(
    center: IVector3,
    radius: number,
    filter?: ICollisionFilter
  ): IOverlapResult[] {
    const results: IOverlapResult[] = [];

    for (const body of this.bodiesArray) {
      if (!body.isActive) continue;
      if (filter && !this.filterMatches(body.filter, filter)) continue;

      const aabb = this.getBodyAABB(body);

      // Find closest point on AABB to sphere center
      const closest: IVector3 = [
        Math.max(aabb.min[0], Math.min(center[0], aabb.max[0])),
        Math.max(aabb.min[1], Math.min(center[1], aabb.max[1])),
        Math.max(aabb.min[2], Math.min(center[2], aabb.max[2])),
      ];

      const dx = center[0] - closest[0];
      const dy = center[1] - closest[1];
      const dz = center[2] - closest[2];
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq);
        results.push({
          bodyId: body.id,
          penetration: radius - dist,
          direction: dist > 0 ? [dx / dist, dy / dist, dz / dist] : [0, 1, 0],
        });
      }
    }

    return results;
  }

  public boxOverlap(
    center: IVector3,
    halfExtents: IVector3,
    _rotation?: IQuaternion,
    filter?: ICollisionFilter
  ): IOverlapResult[] {
    const results: IOverlapResult[] = [];

    const queryAABB: IAABB = {
      min: [
        center[0] - halfExtents[0],
        center[1] - halfExtents[1],
        center[2] - halfExtents[2],
      ],
      max: [
        center[0] + halfExtents[0],
        center[1] + halfExtents[1],
        center[2] + halfExtents[2],
      ],
    };

    for (const body of this.bodiesArray) {
      if (!body.isActive) continue;
      if (filter && !this.filterMatches(body.filter, filter)) continue;

      const bodyAABB = this.getBodyAABB(body);

      if (this.aabbOverlap(queryAABB, bodyAABB)) {
        // Calculate penetration
        const overlapX = Math.min(
          queryAABB.max[0] - bodyAABB.min[0],
          bodyAABB.max[0] - queryAABB.min[0]
        );
        const overlapY = Math.min(
          queryAABB.max[1] - bodyAABB.min[1],
          bodyAABB.max[1] - queryAABB.min[1]
        );
        const overlapZ = Math.min(
          queryAABB.max[2] - bodyAABB.min[2],
          bodyAABB.max[2] - queryAABB.min[2]
        );
        const penetration = Math.min(overlapX, overlapY, overlapZ);

        const dx = body.position[0] - center[0];
        const dy = body.position[1] - center[1];
        const dz = body.position[2] - center[2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

        results.push({
          bodyId: body.id,
          penetration,
          direction: len > 0 ? [dx / len, dy / len, dz / len] : [0, 1, 0],
        });
      }
    }

    return results;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private getBodyAABB(body: RigidBody): IAABB {
    const pos = body.position;
    let halfExtents: IVector3;

    switch (body.shape.type) {
      case 'box':
        halfExtents = body.shape.halfExtents;
        break;
      case 'sphere':
        halfExtents = [body.shape.radius, body.shape.radius, body.shape.radius];
        break;
      case 'capsule':
        halfExtents = [
          body.shape.radius,
          body.shape.height / 2 + body.shape.radius,
          body.shape.radius,
        ];
        break;
      default:
        halfExtents = [1, 1, 1];
    }

    return {
      min: [pos[0] - halfExtents[0], pos[1] - halfExtents[1], pos[2] - halfExtents[2]],
      max: [pos[0] + halfExtents[0], pos[1] + halfExtents[1], pos[2] + halfExtents[2]],
    };
  }

  private aabbOverlap(a: IAABB, b: IAABB): boolean {
    return (
      a.min[0] <= b.max[0] &&
      a.max[0] >= b.min[0] &&
      a.min[1] <= b.max[1] &&
      a.max[1] >= b.min[1] &&
      a.min[2] <= b.max[2] &&
      a.max[2] >= b.min[2]
    );
  }

  private getContactKey(idA: string, idB: string): string {
    return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
  }

  private filterMatches(bodyFilter: ICollisionFilter, queryFilter: ICollisionFilter): boolean {
    return (bodyFilter.group & queryFilter.mask) !== 0;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  public dispose(): void {
    this.bodies.clear();
    this.constraints.clear();
    this.bodiesArray = [];
    this.collisionPairs = [];
    this.collisionEvents = [];
    this.triggerEvents = [];
    this.activeContacts.clear();
  }
}

/**
 * Create a physics world
 */
export function createPhysicsWorld(config?: IPhysicsWorldConfig): IPhysicsWorld {
  return new PhysicsWorldImpl(config);
}
