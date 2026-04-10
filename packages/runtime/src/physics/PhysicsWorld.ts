import * as CANNON from 'cannon-es';
import * as THREE from 'three';

// ============================================================================
// Types
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
// Physics World
// ============================================================================

export class PhysicsWorld {
  private world: CANNON.World;
  private bodies: Map<string, CANNON.Body> = new Map();
  private meshes: Map<string, THREE.Object3D> = new Map();
  private bodyConfigs: Map<string, RigidbodyConfig> = new Map();
  private collisionListeners: Map<string, CollisionCallback[]> = new Map();
  private globalCollisionListeners: CollisionCallback[] = [];
  private lastCallTime: number = 0;
  private stepSize: number;
  private activeCollisions: Set<string> = new Set();

  constructor(options: PhysicsOptions = {}) {
    this.world = new CANNON.World();
    this.setupCollisionEvents();

    // Default gravity: Earth's gravity
    const gravity = options.gravity || [0, -9.82, 0];
    this.world.gravity.set(gravity[0], gravity[1], gravity[2]);

    // Performance settings
    (this.world.solver as CANNON.GSSolver).iterations = options.iterations || 10;
    this.stepSize = options.stepSize || 1 / 60;

    // Default material
    const defaultMaterial = new CANNON.Material('default');
    const defaultContactMaterial = new CANNON.ContactMaterial(defaultMaterial, defaultMaterial, {
      friction: 0.3,
      restitution: 0.3, // Bounciness
    });
    this.world.addContactMaterial(defaultContactMaterial);
  }

  addBody(
    id: string,
    mesh: THREE.Object3D,
    type: 'box' | 'sphere' | 'plane' = 'box',
    mass: number = 1
  ): CANNON.Body {
    // Determine shape and dimensions based on mesh
    let shape: CANNON.Shape;
    const position = new CANNON.Vec3(mesh.position.x, mesh.position.y, mesh.position.z);
    const quaternion = new CANNON.Quaternion(
      mesh.quaternion.x,
      mesh.quaternion.y,
      mesh.quaternion.z,
      mesh.quaternion.w
    );

    // Simplistic shape generation based on type
    // In a real implementation, we would inspect mesh geometry bounding box
    const scale = mesh.scale;

    if (type === 'sphere') {
      // Assuming radius 0.5 (default sphere geometry) * max scale
      const radius = 0.5 * Math.max(scale.x, scale.y, scale.z);
      shape = new CANNON.Sphere(radius);
    } else if (type === 'plane') {
      shape = new CANNON.Plane();
      // Rotate plane to match Three.js plane (which faces Z) vs Cannon plane (which faces Z)
      // Actually Cannon plane is infinite on X/Y, facing Z.
      // Often planes in Three are floor, rotated -90 on X.
      // We'll trust the mesh rotation.
      mass = 0; // Planes are usually static
    } else {
      // Box
      const halfExtents = new CANNON.Vec3(scale.x * 0.5, scale.y * 0.5, scale.z * 0.5);
      shape = new CANNON.Box(halfExtents);
    }

    const body = new CANNON.Body({
      mass: mass, // 0 = static, >0 = dynamic
      shape: shape,
      position: position,
      quaternion: quaternion,
    });

    this.world.addBody(body);
    this.bodies.set(id, body);
    this.meshes.set(id, mesh);

    return body;
  }

  removeBody(id: string): void {
    const body = this.bodies.get(id);
    if (body) {
      this.world.removeBody(body);
      this.bodies.delete(id);
      this.meshes.delete(id);
    }
  }

  step(timeSinceLastCall: number): void {
    // Fixed time step
    this.world.step(this.stepSize, timeSinceLastCall, 3);

    // Sync visual meshes with physics bodies
    this.bodies.forEach((body, id) => {
      const mesh = this.meshes.get(id);
      if (mesh) {
        mesh.position.set(body.position.x, body.position.y, body.position.z);
        mesh.quaternion.set(
          body.quaternion.x,
          body.quaternion.y,
          body.quaternion.z,
          body.quaternion.w
        );
      }
    });
  }

  applyImpulse(
    id: string,
    impulse: [number, number, number],
    worldPoint?: [number, number, number]
  ): void {
    const body = this.bodies.get(id);
    if (body) {
      const imp = new CANNON.Vec3(impulse[0], impulse[1], impulse[2]);
      const point = worldPoint
        ? new CANNON.Vec3(worldPoint[0], worldPoint[1], worldPoint[2])
        : body.position;
      body.applyImpulse(imp, point);
    }
  }

  setVelocity(id: string, velocity: [number, number, number]): void {
    const body = this.bodies.get(id);
    if (body) {
      body.velocity.set(velocity[0], velocity[1], velocity[2]);
    }
  }

  // ============================================================================
  // Collision Event System
  // ============================================================================

  private setupCollisionEvents(): void {
    // Track collision start

    this.world.addEventListener(
      'beginContact',
      (event: {
        bodyA: CANNON.Body;
        bodyB: CANNON.Body;
        contactEquations?: Array<{ ri: CANNON.Vec3; ni: CANNON.Vec3; multiplier: number }>;
      }) => {
        const idA = this.findBodyId(event.bodyA);
        const idB = this.findBodyId(event.bodyB);
        if (!idA || !idB) return;

        const pairKey = this.getPairKey(idA, idB);
        if (this.activeCollisions.has(pairKey)) return;
        this.activeCollisions.add(pairKey);

        const configA = this.bodyConfigs.get(idA);
        const configB = this.bodyConfigs.get(idB);
        const isTrigger = configA?.isTrigger || configB?.isTrigger;

        const collisionEvent: CollisionEvent = {
          type: isTrigger ? 'trigger-enter' : 'collision-start',
          bodyA: idA,
          bodyB: idB,
          contactPoint: event.contactEquations?.[0]?.ri
            ? {
                x: event.bodyA.position.x + event.contactEquations[0].ri.x,
                y: event.bodyA.position.y + event.contactEquations[0].ri.y,
                z: event.bodyA.position.z + event.contactEquations[0].ri.z,
              }
            : undefined,
          contactNormal: event.contactEquations?.[0]?.ni
            ? {
                x: event.contactEquations[0].ni.x,
                y: event.contactEquations[0].ni.y,
                z: event.contactEquations[0].ni.z,
              }
            : undefined,
          relativeVelocity: {
            x: event.bodyA.velocity.x - event.bodyB.velocity.x,
            y: event.bodyA.velocity.y - event.bodyB.velocity.y,
            z: event.bodyA.velocity.z - event.bodyB.velocity.z,
          },
          impulse: event.contactEquations?.[0]?.multiplier,
          timestamp: performance.now(),
        };

        this.emitCollision(collisionEvent, idA, idB);
      }
    );

    // Track collision end
    this.world.addEventListener(
      'endContact',
      (event: { bodyA: CANNON.Body; bodyB: CANNON.Body }) => {
        const idA = this.findBodyId(event.bodyA);
        const idB = this.findBodyId(event.bodyB);
        if (!idA || !idB) return;

        const pairKey = this.getPairKey(idA, idB);
        if (!this.activeCollisions.has(pairKey)) return;
        this.activeCollisions.delete(pairKey);

        const configA = this.bodyConfigs.get(idA);
        const configB = this.bodyConfigs.get(idB);
        const isTrigger = configA?.isTrigger || configB?.isTrigger;

        const collisionEvent: CollisionEvent = {
          type: isTrigger ? 'trigger-exit' : 'collision-end',
          bodyA: idA,
          bodyB: idB,
          timestamp: performance.now(),
        };

        this.emitCollision(collisionEvent, idA, idB);
      }
    );
  }

  private findBodyId(body: CANNON.Body): string | undefined {
    for (const [id, b] of this.bodies) {
      if (b === body) return id;
    }
    return undefined;
  }

  private getPairKey(a: string, b: string): string {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }

  private emitCollision(event: CollisionEvent, idA: string, idB: string): void {
    // Emit to specific body listeners
    this.collisionListeners.get(idA)?.forEach((cb) => cb(event));
    this.collisionListeners.get(idB)?.forEach((cb) => cb(event));
    // Emit to global listeners
    this.globalCollisionListeners.forEach((cb) => cb(event));
  }

  // ============================================================================
  // Enhanced Body Creation
  // ============================================================================

  addBodyWithConfig(id: string, mesh: THREE.Object3D, config: RigidbodyConfig = {}): CANNON.Body {
    const scale = mesh.scale;
    const shape = this.createShape(config.shape || 'box', scale);

    const mass = config.type === 'static' ? 0 : (config.mass ?? 1);
    const bodyType =
      config.type === 'kinematic'
        ? CANNON.Body.KINEMATIC
        : config.type === 'static'
          ? CANNON.Body.STATIC
          : CANNON.Body.DYNAMIC;

    const material = new CANNON.Material();
    material.friction = config.friction ?? 0.3;
    material.restitution = config.restitution ?? 0.3;

    const body = new CANNON.Body({
      mass,
      type: bodyType,
      shape,
      position: new CANNON.Vec3(mesh.position.x, mesh.position.y, mesh.position.z),
      quaternion: new CANNON.Quaternion(
        mesh.quaternion.x,
        mesh.quaternion.y,
        mesh.quaternion.z,
        mesh.quaternion.w
      ),
      material,
      linearDamping: config.linearDamping ?? 0.01,
      angularDamping: config.angularDamping ?? 0.01,
      fixedRotation: config.fixedRotation ?? false,
      collisionFilterGroup: config.collisionGroup ?? 1,
      collisionFilterMask: config.collisionMask ?? -1,
      isTrigger: config.isTrigger ?? false,
    });

    this.world.addBody(body);
    this.bodies.set(id, body);
    this.meshes.set(id, mesh);
    this.bodyConfigs.set(id, config);

    return body;
  }

  private createShape(type: string, scale: THREE.Vector3): CANNON.Shape {
    switch (type) {
      case 'sphere':
        return new CANNON.Sphere(0.5 * Math.max(scale.x, scale.y, scale.z));
      case 'capsule':
        // Cannon-ES doesn't have native capsule, use cylinder + spheres
        return new CANNON.Cylinder(scale.x * 0.5, scale.x * 0.5, scale.y, 12);
      case 'cylinder':
        return new CANNON.Cylinder(scale.x * 0.5, scale.x * 0.5, scale.y, 12);
      case 'plane':
        return new CANNON.Plane();
      case 'box':
      default:
        return new CANNON.Box(new CANNON.Vec3(scale.x * 0.5, scale.y * 0.5, scale.z * 0.5));
    }
  }

  // ============================================================================
  // Collision Subscription
  // ============================================================================

  onCollision(bodyId: string, callback: CollisionCallback): () => void {
    if (!this.collisionListeners.has(bodyId)) {
      this.collisionListeners.set(bodyId, []);
    }
    this.collisionListeners.get(bodyId)!.push(callback);
    return () => {
      const listeners = this.collisionListeners.get(bodyId);
      if (listeners) {
        const idx = listeners.indexOf(callback);
        if (idx >= 0) listeners.splice(idx, 1);
      }
    };
  }

  onAnyCollision(callback: CollisionCallback): () => void {
    this.globalCollisionListeners.push(callback);
    return () => {
      const idx = this.globalCollisionListeners.indexOf(callback);
      if (idx >= 0) this.globalCollisionListeners.splice(idx, 1);
    };
  }

  // ============================================================================
  // Additional Physics Methods
  // ============================================================================

  getBody(id: string): CANNON.Body | undefined {
    return this.bodies.get(id);
  }

  setPosition(id: string, position: [number, number, number]): void {
    const body = this.bodies.get(id);
    if (body) {
      body.position.set(position[0], position[1], position[2]);
    }
  }

  setRotation(id: string, quaternion: [number, number, number, number]): void {
    const body = this.bodies.get(id);
    if (body) {
      body.quaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
    }
  }

  applyForce(
    id: string,
    force: [number, number, number],
    worldPoint?: [number, number, number]
  ): void {
    const body = this.bodies.get(id);
    if (body) {
      const f = new CANNON.Vec3(force[0], force[1], force[2]);
      const point = worldPoint
        ? new CANNON.Vec3(worldPoint[0], worldPoint[1], worldPoint[2])
        : body.position;
      body.applyForce(f, point);
    }
  }

  applyTorque(id: string, torque: [number, number, number]): void {
    const body = this.bodies.get(id);
    if (body) {
      body.torque.set(
        body.torque.x + torque[0],
        body.torque.y + torque[1],
        body.torque.z + torque[2]
      );
    }
  }

  setMass(id: string, mass: number): void {
    const body = this.bodies.get(id);
    if (body) {
      body.mass = mass;
      body.updateMassProperties();
    }
  }

  setKinematic(id: string, kinematic: boolean): void {
    const body = this.bodies.get(id);
    if (body) {
      body.type = kinematic ? CANNON.Body.KINEMATIC : CANNON.Body.DYNAMIC;
    }
  }

  wakeUp(id: string): void {
    const body = this.bodies.get(id);
    if (body) body.wakeUp();
  }

  sleep(id: string): void {
    const body = this.bodies.get(id);
    if (body) body.sleep();
  }

  getVelocity(id: string): [number, number, number] | undefined {
    const body = this.bodies.get(id);
    if (body) {
      return [body.velocity.x, body.velocity.y, body.velocity.z];
    }
    return undefined;
  }

  getAngularVelocity(id: string): [number, number, number] | undefined {
    const body = this.bodies.get(id);
    if (body) {
      return [body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z];
    }
    return undefined;
  }

  raycast(
    from: [number, number, number],
    to: [number, number, number]
  ): { id: string; point: [number, number, number]; normal: [number, number, number] } | null {
    const result = new CANNON.RaycastResult();
    const ray = new CANNON.Ray(
      new CANNON.Vec3(from[0], from[1], from[2]),
      new CANNON.Vec3(to[0], to[1], to[2])
    );
    ray.intersectWorld(this.world, { result, skipBackfaces: true });

    if (result.hasHit && result.body) {
      const id = this.findBodyId(result.body);
      if (id) {
        return {
          id,
          point: [result.hitPointWorld.x, result.hitPointWorld.y, result.hitPointWorld.z],
          normal: [result.hitNormalWorld.x, result.hitNormalWorld.y, result.hitNormalWorld.z],
        };
      }
    }
    return null;
  }
}
