/**
 * @holoscript/std — Physics Module
 *
 * Provides physics primitives: ColliderShape, RigidbodyConfig, ForceField, Joint.
 * Runtime representations for HoloScript physics blocks.
 *
 * @version 0.2.0
 * @module @holoscript/std/physics
 */

import { Vec3 } from './spatial';

// =============================================================================
// Collider Shapes
// =============================================================================

export type ColliderShapeType = 'box' | 'sphere' | 'capsule' | 'mesh' | 'convex' | 'cylinder' | 'heightfield';

export interface ColliderConfig {
  shape: ColliderShapeType;
  isTrigger: boolean;
  friction: number;
  restitution: number;
  // Shape-specific
  radius?: number;
  halfExtents?: Vec3;
  height?: number;
  meshAsset?: string;
}

export function createBoxCollider(halfExtents: Vec3, options?: Partial<ColliderConfig>): ColliderConfig {
  return { shape: 'box', isTrigger: false, friction: 0.5, restitution: 0.0, halfExtents, ...options };
}

export function createSphereCollider(radius: number, options?: Partial<ColliderConfig>): ColliderConfig {
  return { shape: 'sphere', isTrigger: false, friction: 0.5, restitution: 0.0, radius, ...options };
}

export function createCapsuleCollider(radius: number, height: number, options?: Partial<ColliderConfig>): ColliderConfig {
  return { shape: 'capsule', isTrigger: false, friction: 0.5, restitution: 0.0, radius, height, ...options };
}

// =============================================================================
// Rigidbody
// =============================================================================

export interface RigidbodyConfig {
  mass: number;
  useGravity: boolean;
  linearDamping: number;
  angularDamping: number;
  freezePosition: [boolean, boolean, boolean];
  freezeRotation: [boolean, boolean, boolean];
  isKinematic: boolean;
}

export function createRigidbody(mass: number, options?: Partial<RigidbodyConfig>): RigidbodyConfig {
  return {
    mass,
    useGravity: true,
    linearDamping: 0.0,
    angularDamping: 0.05,
    freezePosition: [false, false, false],
    freezeRotation: [false, false, false],
    isKinematic: false,
    ...options,
  };
}

// =============================================================================
// Force Fields
// =============================================================================

export type ForceFieldType = 'directional' | 'radial' | 'vortex' | 'buoyancy';

export interface ForceFieldConfig {
  type: ForceFieldType;
  strength: number;
  direction?: Vec3;
  falloff: 'none' | 'linear' | 'quadratic';
  turbulence: number;
}

// =============================================================================
// Joints
// =============================================================================

export type JointType = 'hinge' | 'slider' | 'ball_socket' | 'fixed' | 'd6' | 'spring';

export interface JointConfig {
  type: JointType;
  connectedBody?: string;
  axis?: Vec3;
  limits?: [number, number];
  damping: number;
  springForce?: number;
  breakForce?: number;
}

// =============================================================================
// Raycast Utility
// =============================================================================

export interface RaycastHit {
  point: Vec3;
  normal: Vec3;
  distance: number;
  objectName: string;
}
