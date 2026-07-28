/**
 * PhysicsWorld — native adapter over @holoscript/engine PhysicsWorldImpl.
 *
 * Replaces the former cannon-es bridge (D.083 native-first directive,
 * task_1780656313424_l994). The public API surface is unchanged so all
 * callers (BrowserRuntime, TraitSystem, InteractionTraits, etc.) work
 * without modification.
 *
 * Key design decisions:
 *  - `addBody` / `addBodyWithConfig` return a lightweight BodyProxy whose
 *    properties (mass, velocity, position, quaternion, type) stay in sync
 *    with the native IRigidBodyState returned by PhysicsWorldImpl.
 *  - Mesh sync (body → mesh every step) is kept inside this file to
 *    preserve the BrowserRuntime's call-site contract.
 *  - cannon-es types are fully absent from the import graph of this module.
 *  - Collision callbacks are forwarded from the native ICollisionEvent
 *    stream emitted by PhysicsWorldImpl.getContacts() each step.
 */

import * as THREE from 'three';
import {
  PhysicsWorldImpl,
  type IPhysicsWorldConfig,
  type IRigidBodyConfig,
  type IRigidBodyState,
  type CollisionShape,
} from '@holoscript/engine/physics';

// ============================================================================
// Public types (preserved from cannon-es bridge for call-site compatibility)
// ============================================================================

export interface PhysicsOptions {
  gravity?: [number, number, number];
  iterations?: number;
  stepSize?: number;
}

export interface CollisionEvent {
  type: 'collision-start' | 'collision-end' | 'trigger-enter' | 'trigger-exit';
  bodyA: string;
  bodyB: string;
  contactPoint?: { x: number; y: number; z: number };
  contactNormal?: { x: number; y: number; z: number };
  relativeVelocity?: { x: number; y: number; z: number };
  impulse?: number;
  timestamp: number;
}

export interface RigidbodyConfig {
  mass?: number;
  type?: 'dynamic' | 'kinematic' | 'static';
  shape?: 'box' | 'sphere' | 'capsule' | 'cylinder' | 'plane' | 'convex';
  friction?: number;
  restitution?: number;
  linearDamping?: number;
  angularDamping?: number;
  isTrigger?: boolean;
  fixedRotation?: boolean;
  collisionGroup?: number;
  collisionMask?: number;
}

export type CollisionCallback = (event: CollisionEvent) => void;

// ============================================================================
// BodyProxy — the "body handle" returned to callers (replaces CANNON.Body)
// ============================================================================

/** Mutable velocity stub (read/write). Synced from native state each step. */
interface Vec3Stub {
  x: number;
  y: number;
  z: number;
}

/** Quaternion stub used for .quaternion access. */
interface QuatStub {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * BodyProxy exposes the same field shapes that callers used with CANNON.Body:
 *   body.mass, body.position.{x,y,z}, body.velocity.{x,y,z},
 *   body.quaternion.{x,y,z,w}, body.type (0=dynamic,1=static,4=kinematic)
 *
 * Properties are updated by PhysicsWorld._syncProxy() called each step.
 */
export class BodyProxy {
  /** Canonical ID in PhysicsWorldImpl. */
  readonly id: string;
  mass: number;
  /** 0=DYNAMIC, 1=STATIC, 4=KINEMATIC (mirrors CANNON.Body constants). */
  type: number;
  position: Vec3Stub;
  velocity: Vec3Stub;
  angularVelocity: Vec3Stub;
  quaternion: QuatStub;

  constructor(id: string, mass: number, type: number) {
    this.id = id;
    this.mass = mass;
    this.type = type;
    this.position = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.angularVelocity = { x: 0, y: 0, z: 0 };
    this.quaternion = { x: 0, y: 0, z: 0, w: 1 };
  }
}

// Body-type constants mirroring CANNON.Body.{DYNAMIC,STATIC,KINEMATIC}
const BODY_DYNAMIC = 0;
const BODY_STATIC = 1;
const BODY_KINEMATIC = 4;

// ============================================================================
// Helpers
// ============================================================================

function toNativeShape(
  shapeType: string,
  scale: { x: number; y: number; z: number }
): CollisionShape {
  switch (shapeType) {
    case 'sphere':
      return { type: 'sphere', radius: 0.5 * Math.max(scale.x, scale.y, scale.z) };
    case 'capsule':
      return {
        type: 'capsule',
        radius: scale.x * 0.5,
        height: scale.y,
      };
    case 'cylinder':
      return {
        type: 'cylinder',
        radius: scale.x * 0.5,
        height: scale.y,
      };
    case 'plane':
      // Represent plane as a very flat box (PhysicsWorldImpl has no infinite plane)
      return { type: 'box', halfExtents: [500, 0.01, 500] };
    case 'box':
    default:
      return {
        type: 'box',
        halfExtents: [scale.x * 0.5, scale.y * 0.5, scale.z * 0.5],
      };
  }
}

function bodyTypeToInt(type?: 'dynamic' | 'kinematic' | 'static', mass?: number): number {
  if (type === 'kinematic') return BODY_KINEMATIC;
  if (type === 'static' || mass === 0) return BODY_STATIC;
  return BODY_DYNAMIC;
}

function intToNativeType(t: number): 'dynamic' | 'kinematic' | 'static' {
  if (t === BODY_KINEMATIC) return 'kinematic';
  if (t === BODY_STATIC) return 'static';
  return 'dynamic';
}

// ============================================================================
// PhysicsWorld — native adapter (public API identical to the cannon-es bridge)
// ============================================================================

export class PhysicsWorld {
  private _impl: PhysicsWorldImpl;
  private _proxies: Map<string, BodyProxy> = new Map();
  private _meshes: Map<string, THREE.Object3D> = new Map();
  // Store shapes per body so setKinematic/setMass can recreate with same geometry
  // (PhysicsWorldImpl.getBody() does not expose the shape in its return state)
  private _shapes: Map<string, CollisionShape> = new Map();
  private _stepSize: number;
  private _collisionListeners: Map<string, CollisionCallback[]> = new Map();
  private _globalCollisionListeners: CollisionCallback[] = [];
  private _activeCollisions: Set<string> = new Set();
  // isTrigger flags per body (no cannon CANNON.Body.isTrigger equivalent)
  private _triggerBodies: Set<string> = new Set();

  constructor(options: PhysicsOptions = {}) {
    const gravity = options.gravity ?? [0, -9.82, 0];
    this._stepSize = options.stepSize ?? 1 / 60;

    const cfg: IPhysicsWorldConfig = {
      gravity,
      fixedTimestep: this._stepSize,
      maxSubsteps: 3,
      solverIterations: options.iterations ?? 10,
      allowSleep: true,
      broadphase: 'aabb',
    };
    this._impl = new PhysicsWorldImpl(cfg);
  }

  // --------------------------------------------------------------------------
  // addBody — basic variant (type inferred from shapeType / mass)
  // --------------------------------------------------------------------------

  addBody(
    id: string,
    mesh: THREE.Object3D,
    type: 'box' | 'sphere' | 'plane' = 'box',
    mass: number = 1
  ): BodyProxy {
    const isPlane = type === 'plane';
    const effectiveMass = isPlane ? 0 : mass;
    const bodyTypeStr = effectiveMass === 0 ? 'static' : 'dynamic';
    const shape = toNativeShape(type, mesh.scale);

    // PhysicsWorldImpl RigidBody reads config.transform.{position,rotation}
    const config = {
      id,
      type: bodyTypeStr,
      shape,
      mass: effectiveMass,
      transform: {
        position: [mesh.position.x, mesh.position.y, mesh.position.z] as [number, number, number],
        rotation: [mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w] as [
          number,
          number,
          number,
          number,
        ],
      },
      material: { friction: 0.3, restitution: 0.3 },
    };

    // Remove stale body if re-adding same id
    if (this._proxies.has(id)) {
      this._impl.removeBody(id);
      this._proxies.delete(id);
      this._meshes.delete(id);
      this._shapes.delete(id);
    }

    this._impl.createBody(config as unknown as IRigidBodyConfig);
    this._meshes.set(id, mesh);
    this._shapes.set(id, shape);

    const proxy = new BodyProxy(id, effectiveMass, bodyTypeToInt(bodyTypeStr, effectiveMass));
    proxy.position.x = mesh.position.x;
    proxy.position.y = mesh.position.y;
    proxy.position.z = mesh.position.z;
    proxy.quaternion.x = mesh.quaternion.x;
    proxy.quaternion.y = mesh.quaternion.y;
    proxy.quaternion.z = mesh.quaternion.z;
    proxy.quaternion.w = mesh.quaternion.w;
    this._proxies.set(id, proxy);
    return proxy;
  }

  // --------------------------------------------------------------------------
  // addBodyWithConfig — extended variant for TraitSystem
  // --------------------------------------------------------------------------

  addBodyWithConfig(id: string, mesh: THREE.Object3D, config: RigidbodyConfig = {}): BodyProxy {
    const mass = config.type === 'static' ? 0 : (config.mass ?? 1);
    const bodyTypeStr =
      config.type === 'kinematic' ? 'kinematic' : mass === 0 ? 'static' : 'dynamic';
    const shapeType = config.shape ?? 'box';
    const shape = toNativeShape(shapeType, mesh.scale);

    // PhysicsWorldImpl RigidBody reads config.transform.{position,rotation} and config.filter
    const nativeConfig = {
      id,
      type: bodyTypeStr,
      shape,
      mass,
      transform: {
        position: [mesh.position.x, mesh.position.y, mesh.position.z] as [number, number, number],
        rotation: [mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w] as [
          number,
          number,
          number,
          number,
        ],
      },
      material: {
        friction: config.friction ?? 0.3,
        restitution: config.restitution ?? 0.3,
      },
      linearDamping: config.linearDamping,
      angularDamping: config.angularDamping,
      fixedRotation: config.fixedRotation,
      filter: {
        group: config.collisionGroup ?? 1,
        mask: config.collisionMask ?? -1,
      },
    };

    if (config.isTrigger) {
      this._triggerBodies.add(id);
    }

    // Remove stale if re-adding
    if (this._proxies.has(id)) {
      this._impl.removeBody(id);
      this._proxies.delete(id);
      this._meshes.delete(id);
      this._shapes.delete(id);
    }

    this._impl.createBody(nativeConfig as unknown as IRigidBodyConfig);
    this._meshes.set(id, mesh);
    this._shapes.set(id, shape);

    const typeInt = bodyTypeToInt(bodyTypeStr as 'dynamic' | 'kinematic' | 'static', mass);
    const proxy = new BodyProxy(id, mass, typeInt);
    proxy.position.x = mesh.position.x;
    proxy.position.y = mesh.position.y;
    proxy.position.z = mesh.position.z;
    proxy.quaternion.x = mesh.quaternion.x;
    proxy.quaternion.y = mesh.quaternion.y;
    proxy.quaternion.z = mesh.quaternion.z;
    proxy.quaternion.w = mesh.quaternion.w;
    this._proxies.set(id, proxy);
    return proxy;
  }

  removeBody(id: string): void {
    if (!this._proxies.has(id)) return;
    this._impl.removeBody(id);
    this._proxies.delete(id);
    this._meshes.delete(id);
    this._shapes.delete(id);
    this._triggerBodies.delete(id);
    this._collisionListeners.delete(id);
  }

  // --------------------------------------------------------------------------
  // step — advance simulation + mesh sync + collision event dispatch
  // --------------------------------------------------------------------------

  step(timeSinceLastCall: number): void {
    this._impl.step(timeSinceLastCall);

    // Sync meshes and proxies from native body state
    for (const [id, proxy] of this._proxies) {
      const state = this._impl.getBody(id);
      if (!state) continue;

      // Update proxy fields
      proxy.position.x = state.position[0];
      proxy.position.y = state.position[1];
      proxy.position.z = state.position[2];
      proxy.velocity.x = state.linearVelocity[0];
      proxy.velocity.y = state.linearVelocity[1];
      proxy.velocity.z = state.linearVelocity[2];
      proxy.angularVelocity.x = state.angularVelocity[0];
      proxy.angularVelocity.y = state.angularVelocity[1];
      proxy.angularVelocity.z = state.angularVelocity[2];
      proxy.quaternion.x = state.rotation[0];
      proxy.quaternion.y = state.rotation[1];
      proxy.quaternion.z = state.rotation[2];
      proxy.quaternion.w = state.rotation[3];

      // Sync mesh
      const mesh = this._meshes.get(id);
      if (mesh) {
        mesh.position.set(state.position[0], state.position[1], state.position[2]);
        mesh.quaternion.set(
          state.rotation[0],
          state.rotation[1],
          state.rotation[2],
          state.rotation[3]
        );
      }
    }

    // Dispatch collision events from native contact stream
    this._dispatchCollisions();
  }

  private _dispatchCollisions(): void {
    const contacts = this._impl.getContacts();
    const newActiveKeys = new Set<string>();

    for (const contact of contacts) {
      const { bodyA: idA, bodyB: idB } = contact;
      const pairKey = this._getPairKey(idA, idB);

      if (contact.type === 'begin' || contact.type === 'persist') {
        newActiveKeys.add(pairKey);

        if (contact.type === 'begin') {
          const isTrigger = this._triggerBodies.has(idA) || this._triggerBodies.has(idB);
          const stateA = this._impl.getBody(idA);
          const stateB = this._impl.getBody(idB);
          const firstContact = contact.contacts[0];

          const event: CollisionEvent = {
            type: isTrigger ? 'trigger-enter' : 'collision-start',
            bodyA: idA,
            bodyB: idB,
            contactPoint: firstContact
              ? {
                  x: firstContact.position[0],
                  y: firstContact.position[1],
                  z: firstContact.position[2],
                }
              : undefined,
            contactNormal: firstContact
              ? {
                  x: firstContact.normal[0],
                  y: firstContact.normal[1],
                  z: firstContact.normal[2],
                }
              : undefined,
            relativeVelocity:
              stateA && stateB
                ? {
                    x: stateA.linearVelocity[0] - stateB.linearVelocity[0],
                    y: stateA.linearVelocity[1] - stateB.linearVelocity[1],
                    z: stateA.linearVelocity[2] - stateB.linearVelocity[2],
                  }
                : undefined,
            impulse: firstContact?.impulse,
            timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
          };

          this._emitCollision(event, idA, idB);
        }
      }
    }

    // Detect ended collisions (pairs in _activeCollisions not in newActiveKeys)
    for (const key of this._activeCollisions) {
      if (!newActiveKeys.has(key)) {
        const [idA, idB] = key.split(':');
        const isTrigger = this._triggerBodies.has(idA) || this._triggerBodies.has(idB);
        const event: CollisionEvent = {
          type: isTrigger ? 'trigger-exit' : 'collision-end',
          bodyA: idA,
          bodyB: idB,
          timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        };
        this._emitCollision(event, idA, idB);
      }
    }

    this._activeCollisions.clear();
    for (const key of newActiveKeys) {
      this._activeCollisions.add(key);
    }
  }

  private _getPairKey(a: string, b: string): string {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }

  private _emitCollision(event: CollisionEvent, idA: string, idB: string): void {
    this._collisionListeners.get(idA)?.forEach((cb) => cb(event));
    this._collisionListeners.get(idB)?.forEach((cb) => cb(event));
    this._globalCollisionListeners.forEach((cb) => cb(event));
  }

  // --------------------------------------------------------------------------
  // Body manipulation
  // --------------------------------------------------------------------------

  applyImpulse(
    id: string,
    impulse: [number, number, number],
    worldPoint?: [number, number, number]
  ): void {
    this._impl.applyImpulse(id, impulse, worldPoint);
    this._syncProxy(id);
  }

  setVelocity(id: string, velocity: [number, number, number]): void {
    this._impl.setLinearVelocity(id, velocity);
    this._syncProxy(id);
  }

  setPosition(id: string, position: [number, number, number]): void {
    this._impl.setPosition(id, position);

    // Also update the mesh immediately (mirrors cannon bridge updateBodyBounds + syncMesh)
    const mesh = this._meshes.get(id);
    if (mesh) mesh.position.set(position[0], position[1], position[2]);

    // Force AABB update equivalent — impl handles internally
    this._syncProxy(id);
  }

  setRotation(id: string, quaternion: [number, number, number, number]): void {
    this._impl.setRotation(id, quaternion);
    const mesh = this._meshes.get(id);
    if (mesh) mesh.quaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
    this._syncProxy(id);
  }

  setTransform(
    id: string,
    position: [number, number, number],
    quaternion: [number, number, number, number]
  ): void {
    this._impl.setTransform(id, { position, rotation: quaternion });
    const mesh = this._meshes.get(id);
    if (mesh) {
      mesh.position.set(position[0], position[1], position[2]);
      mesh.quaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
    }
    this._syncProxy(id);
  }

  applyForce(
    id: string,
    force: [number, number, number],
    worldPoint?: [number, number, number]
  ): void {
    this._impl.applyForce(id, force, worldPoint);
  }

  applyTorque(id: string, torque: [number, number, number]): void {
    this._impl.applyTorque(id, torque);
  }

  setKinematic(id: string, kinematic: boolean): void {
    // PhysicsWorldImpl doesn't have a setKinematic convenience; change type by recreating
    const proxy = this._proxies.get(id);
    const mesh = this._meshes.get(id);
    if (!proxy || !mesh) return;

    const state = this._impl.getBody(id);
    if (!state) return;

    const newType = kinematic ? 'kinematic' : 'dynamic';
    const newTypeInt = kinematic ? BODY_KINEMATIC : BODY_DYNAMIC;
    const shape = this._shapes.get(id) ?? {
      type: 'box' as const,
      halfExtents: [0.5, 0.5, 0.5] as [number, number, number],
    };

    // Recreate body with same shape/mass but new type (PhysicsWorldImpl has no setType)
    const newConfig = {
      id,
      type: newType,
      shape,
      mass: proxy.mass,
      transform: {
        position: [state.position[0], state.position[1], state.position[2]] as [
          number,
          number,
          number,
        ],
        rotation: [state.rotation[0], state.rotation[1], state.rotation[2], state.rotation[3]] as [
          number,
          number,
          number,
          number,
        ],
      },
    };

    this._impl.removeBody(id);
    this._impl.createBody(newConfig as unknown as IRigidBodyConfig);
    proxy.type = newTypeInt;
  }

  setMass(id: string, mass: number): void {
    // PhysicsWorldImpl doesn't expose setMass; approximate by recreating body
    const proxy = this._proxies.get(id);
    if (!proxy) return;

    const state = this._impl.getBody(id);
    if (!state) return;

    const newType = mass === 0 ? 'static' : intToNativeType(proxy.type);
    const shape = this._shapes.get(id) ?? {
      type: 'box' as const,
      halfExtents: [0.5, 0.5, 0.5] as [number, number, number],
    };

    const newConfig = {
      id,
      type: newType,
      shape,
      mass,
      transform: {
        position: [state.position[0], state.position[1], state.position[2]] as [
          number,
          number,
          number,
        ],
        rotation: [state.rotation[0], state.rotation[1], state.rotation[2], state.rotation[3]] as [
          number,
          number,
          number,
          number,
        ],
      },
    };

    this._impl.removeBody(id);
    this._impl.createBody(newConfig as unknown as IRigidBodyConfig);
    proxy.mass = mass;
    if (mass === 0) proxy.type = BODY_STATIC;
  }

  wakeUp(_id: string): void {
    // PhysicsWorldImpl auto-wakes on force/velocity changes; no-op here
  }

  sleep(_id: string): void {
    // No-op: sleep API is internal to PhysicsWorldImpl's island detector
  }

  getBody(id: string): BodyProxy | undefined {
    return this._proxies.get(id);
  }

  /**
   * Return a detached snapshot of the native solver state for one body.
   *
   * This is intentionally separate from getBody(), which preserves the
   * mutable compatibility proxy used by existing browser/runtime callers.
   * Receipt and replay tooling can use this method to observe solver-owned
   * sleeping and active state without reaching through the private adapter.
   */
  getBodyState(id: string): IRigidBodyState | undefined {
    return this._impl.getBody(id);
  }

  /**
   * Return detached native solver snapshots in deterministic registration
   * order. Mutating a returned tuple cannot mutate the physics world.
   */
  getAllBodyStates(): IRigidBodyState[] {
    return this._impl.getAllBodies();
  }

  getVelocity(id: string): [number, number, number] | undefined {
    const state = this._impl.getBody(id);
    if (!state) return undefined;
    return [state.linearVelocity[0], state.linearVelocity[1], state.linearVelocity[2]];
  }

  getAngularVelocity(id: string): [number, number, number] | undefined {
    const state = this._impl.getBody(id);
    if (!state) return undefined;
    return [state.angularVelocity[0], state.angularVelocity[1], state.angularVelocity[2]];
  }

  // --------------------------------------------------------------------------
  // Raycast
  // --------------------------------------------------------------------------

  raycast(
    from: [number, number, number],
    to: [number, number, number]
  ): { id: string; point: [number, number, number]; normal: [number, number, number] } | null {
    const dir: [number, number, number] = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const len = Math.sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2);
    if (len === 0) return null;

    const hit = this._impl.raycastClosest({
      origin: from,
      direction: [dir[0] / len, dir[1] / len, dir[2] / len],
      maxDistance: len,
    });

    if (!hit) return null;
    return {
      id: hit.bodyId,
      point: [hit.point[0], hit.point[1], hit.point[2]],
      normal: [hit.normal[0], hit.normal[1], hit.normal[2]],
    };
  }

  // --------------------------------------------------------------------------
  // Collision subscriptions
  // --------------------------------------------------------------------------

  onCollision(bodyId: string, callback: CollisionCallback): () => void {
    if (!this._collisionListeners.has(bodyId)) {
      this._collisionListeners.set(bodyId, []);
    }
    this._collisionListeners.get(bodyId)!.push(callback);
    return () => {
      const listeners = this._collisionListeners.get(bodyId);
      if (listeners) {
        const idx = listeners.indexOf(callback);
        if (idx >= 0) listeners.splice(idx, 1);
      }
    };
  }

  onAnyCollision(callback: CollisionCallback): () => void {
    this._globalCollisionListeners.push(callback);
    return () => {
      const idx = this._globalCollisionListeners.indexOf(callback);
      if (idx >= 0) this._globalCollisionListeners.splice(idx, 1);
    };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private _syncProxy(id: string): void {
    const proxy = this._proxies.get(id);
    if (!proxy) return;
    const state = this._impl.getBody(id);
    if (!state) return;

    proxy.position.x = state.position[0];
    proxy.position.y = state.position[1];
    proxy.position.z = state.position[2];
    proxy.velocity.x = state.linearVelocity[0];
    proxy.velocity.y = state.linearVelocity[1];
    proxy.velocity.z = state.linearVelocity[2];
    proxy.angularVelocity.x = state.angularVelocity[0];
    proxy.angularVelocity.y = state.angularVelocity[1];
    proxy.angularVelocity.z = state.angularVelocity[2];
    proxy.quaternion.x = state.rotation[0];
    proxy.quaternion.y = state.rotation[1];
    proxy.quaternion.z = state.rotation[2];
    proxy.quaternion.w = state.rotation[3];
  }
}
