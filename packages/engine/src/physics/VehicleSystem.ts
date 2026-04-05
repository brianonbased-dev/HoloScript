/**
 * VehicleSystem.ts
 *
 * Raycast vehicle physics system.
 * Implements suspension springs, wheel friction, steering, and drivetrain simulation.
 *
 * @module physics
 */

import { IVector3 } from './PhysicsTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface WheelConfig {
  id: string;
  connectionPoint: IVector3; // Where the wheel connects to the chassis
  direction: IVector3; // Suspension direction (usually down: 0, -1, 0)
  axle: IVector3; // Wheel axle direction (usually right: 1, 0, 0)
  suspensionRestLength: number; // Rest length of the suspension spring
  suspensionStiffness: number; // Spring constant
  suspensionDamping: number; // Damper coefficient
  maxSuspensionTravel: number; // Maximum compression/extension
  wheelRadius: number;
  frictionSlip: number; // Tire friction coefficient
  isSteering: boolean; // Whether this wheel steers
  isDriving: boolean; // Whether this wheel receives power
  rollInfluence: number; // Anti-roll bar (0 = no roll, 1 = full roll)
}

export interface VehicleDefinition {
  id: string;
  chassisMass: number;
  chassisSize: IVector3;
  wheels: WheelConfig[];
  maxSteerAngle: number; // Maximum steering angle (radians)
  maxEngineForce: number; // Maximum drive force
  maxBrakeForce: number; // Maximum brake force
}

export interface WheelState {
  config: WheelConfig;
  suspensionLength: number;
  suspensionForce: number;
  contactPoint: IVector3 | null;
  isGrounded: boolean;
  rotation: number; // Spin angle (radians)
  steerAngle: number;
  skidFactor: number; // 0 = full grip, 1 = full skid
}

export interface VehicleState {
  id: string;
  definition: VehicleDefinition;
  position: IVector3;
  rotation: { x: number; y: number; z: number; w: number };
  linearVelocity: IVector3;
  angularVelocity: IVector3;
  wheels: WheelState[];
  speed: number; // km/h
  engineForce: number;
  brakeForce: number;
  steerAngle: number;
}

// =============================================================================
// VEHICLE PRESETS
// =============================================================================

export function createDefaultCar(id: string): VehicleDefinition {
  const wheelConfig = (
    x: number,
    z: number,
    isSteering: boolean,
    isDriving: boolean
  ): WheelConfig => ({
    id: `${id}_wheel_${x > 0 ? 'r' : 'l'}_${z > 0 ? 'f' : 'r'}`,
    connectionPoint: { x, y: -0.3, z },
    direction: { x: 0, y: -1, z: 0 },
    axle: { x: 1, y: 0, z: 0 },
    suspensionRestLength: 0.3,
    suspensionStiffness: 25,
    suspensionDamping: 4.4,
    maxSuspensionTravel: 0.2,
    wheelRadius: 0.35,
    frictionSlip: 1.2,
    isSteering,
    isDriving,
    rollInfluence: 0.1,
  });

  return {
    id,
    chassisMass: 1500,
    chassisSize: { x: 1.8, y: 0.6, z: 4.2 },
    wheels: [
      wheelConfig(-0.8, 1.4, true, false), // Front Left
      wheelConfig(0.8, 1.4, true, false), // Front Right
      wheelConfig(-0.8, -1.4, false, true), // Rear Left
      wheelConfig(0.8, -1.4, false, true), // Rear Right
    ],
    maxSteerAngle: 0.5,
    maxEngineForce: 3000,
    maxBrakeForce: 100,
  };
}

export function createTruck(id: string): VehicleDefinition {
  const wheelConfig = (
    x: number,
    z: number,
    isSteering: boolean,
    isDriving: boolean
  ): WheelConfig => ({
    id: `${id}_wheel_${x > 0 ? 'r' : 'l'}_${z.toFixed(0)}`,
    connectionPoint: { x, y: -0.5, z },
    direction: { x: 0, y: -1, z: 0 },
    axle: { x: 1, y: 0, z: 0 },
    suspensionRestLength: 0.4,
    suspensionStiffness: 40,
    suspensionDamping: 6.0,
    maxSuspensionTravel: 0.3,
    wheelRadius: 0.5,
    frictionSlip: 1.5,
    isSteering,
    isDriving,
    rollInfluence: 0.05,
  });

  return {
    id,
    chassisMass: 5000,
    chassisSize: { x: 2.4, y: 1.0, z: 7.0 },
    wheels: [
      wheelConfig(-1.0, 2.8, true, false),
      wheelConfig(1.0, 2.8, true, false),
      wheelConfig(-1.0, -1.5, false, true),
      wheelConfig(1.0, -1.5, false, true),
      wheelConfig(-1.0, -2.8, false, true),
      wheelConfig(1.0, -2.8, false, true),
    ],
    maxSteerAngle: 0.4,
    maxEngineForce: 6000,
    maxBrakeForce: 200,
  };
}

// =============================================================================
// VEHICLE SYSTEM
// =============================================================================

export class VehicleSystem {
  private vehicles: Map<string, VehicleState> = new Map();

  /**
   * Create a vehicle from a definition at a given position.
   */
  createVehicle(definition: VehicleDefinition, position: IVector3): VehicleState {
    const wheels: WheelState[] = definition.wheels.map((wc) => ({
      config: wc,
      suspensionLength: wc.suspensionRestLength,
      suspensionForce: 0,
      contactPoint: null,
      isGrounded: false,
      rotation: 0,
      steerAngle: 0,
      skidFactor: 0,
    }));

    const state: VehicleState = {
      id: definition.id,
      definition,
      position: { ...position },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      wheels,
      speed: 0,
      engineForce: 0,
      brakeForce: 0,
      steerAngle: 0,
    };

    this.vehicles.set(definition.id, state);
    return state;
  }

  /**
   * Update vehicle physics for one timestep.
   */
  update(vehicleId: string, dt: number): VehicleState | null {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) return null;

    const def = vehicle.definition;

    // Update steering
    for (const wheel of vehicle.wheels) {
      if (wheel.config.isSteering) {
        wheel.steerAngle = vehicle.steerAngle;
      }
    }

    // Suspension & forces
    let totalSuspensionForce = 0;
    const forwardDir = this.getForwardVector(vehicle);

    for (const wheel of vehicle.wheels) {
      // Raycast suspension (simplified: ground at y = 0)
      const wheelWorldY = vehicle.position.y + wheel.config.connectionPoint.y;
      const rayEnd = wheelWorldY - wheel.config.suspensionRestLength - wheel.config.wheelRadius;

      if (rayEnd <= 0) {
        // Hit ground
        wheel.isGrounded = true;
        const compression = -rayEnd;
        wheel.suspensionLength = Math.max(
          wheel.config.suspensionRestLength - compression,
          wheel.config.suspensionRestLength - wheel.config.maxSuspensionTravel
        );

        // Spring force
        const springDelta = wheel.config.suspensionRestLength - wheel.suspensionLength;
        const springForce = springDelta * wheel.config.suspensionStiffness;

        // Damping force
        const relVel = vehicle.linearVelocity.y;
        const dampForce = -relVel * wheel.config.suspensionDamping;

        wheel.suspensionForce = Math.max(0, springForce + dampForce);
        totalSuspensionForce += wheel.suspensionForce;

        wheel.contactPoint = {
          x: vehicle.position.x + wheel.config.connectionPoint.x,
          y: 0,
          z: vehicle.position.z + wheel.config.connectionPoint.z,
        };
      } else {
        wheel.isGrounded = false;
        wheel.suspensionForce = 0;
        wheel.contactPoint = null;
        wheel.suspensionLength = wheel.config.suspensionRestLength;
      }
    }

    // Apply engine and brake forces
    for (const wheel of vehicle.wheels) {
      if (!wheel.isGrounded) continue;

      if (wheel.config.isDriving && vehicle.engineForce !== 0) {
        const driveForce =
          vehicle.engineForce / vehicle.wheels.filter((w) => w.config.isDriving).length;
        vehicle.linearVelocity.x += ((forwardDir.x * driveForce) / def.chassisMass) * dt;
        vehicle.linearVelocity.z += ((forwardDir.z * driveForce) / def.chassisMass) * dt;
      }

      if (vehicle.brakeForce > 0) {
        const speed = Math.sqrt(vehicle.linearVelocity.x ** 2 + vehicle.linearVelocity.z ** 2);
        if (speed > 0.01) {
          const brakeDec = Math.min((vehicle.brakeForce / def.chassisMass) * dt, speed);
          const factor = 1 - brakeDec / speed;
          vehicle.linearVelocity.x *= factor;
          vehicle.linearVelocity.z *= factor;
        }
      }

      // Wheel rotation (visual)
      const wheelSpeed = Math.sqrt(vehicle.linearVelocity.x ** 2 + vehicle.linearVelocity.z ** 2);
      wheel.rotation += (wheelSpeed / wheel.config.wheelRadius) * dt;

      // Skid factor
      const lateralSpeed = Math.abs(vehicle.angularVelocity.y * 0.5);
      wheel.skidFactor = Math.min(lateralSpeed / (wheel.config.frictionSlip + 0.001), 1);
    }

    // Apply gravity
    const isGrounded = vehicle.wheels.some((w) => w.isGrounded);
    if (!isGrounded) {
      vehicle.linearVelocity.y -= 9.81 * dt;
    } else {
      // Suspension keeps us up
      const suspensionAccel = totalSuspensionForce / def.chassisMass;
      vehicle.linearVelocity.y += (suspensionAccel - 9.81) * dt;
      const refWheel = vehicle.wheels[0].config;
      if (vehicle.position.y <= refWheel.wheelRadius + refWheel.suspensionRestLength) {
        vehicle.linearVelocity.y = Math.max(vehicle.linearVelocity.y, 0);
      }
    }

    // Steering yaw
    if (vehicle.steerAngle !== 0 && isGrounded) {
      const speed = Math.sqrt(vehicle.linearVelocity.x ** 2 + vehicle.linearVelocity.z ** 2);
      const turnRate = vehicle.steerAngle * speed * 0.5;
      vehicle.angularVelocity.y = turnRate;
    } else {
      vehicle.angularVelocity.y *= 0.95; // Natural yaw damping
    }

    // Integrate position
    vehicle.position.x += vehicle.linearVelocity.x * dt;
    vehicle.position.y += vehicle.linearVelocity.y * dt;
    vehicle.position.z += vehicle.linearVelocity.z * dt;

    // Compute speed in km/h
    vehicle.speed = Math.sqrt(vehicle.linearVelocity.x ** 2 + vehicle.linearVelocity.z ** 2) * 3.6;

    return vehicle;
  }

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  setThrottle(vehicleId: string, throttle: number): void {
    const v = this.vehicles.get(vehicleId);
    if (!v) return;
    v.engineForce = throttle * v.definition.maxEngineForce;
  }

  setBrake(vehicleId: string, brake: number): void {
    const v = this.vehicles.get(vehicleId);
    if (!v) return;
    v.brakeForce = brake * v.definition.maxBrakeForce;
  }

  setSteering(vehicleId: string, steering: number): void {
    const v = this.vehicles.get(vehicleId);
    if (!v) return;
    v.steerAngle = Math.max(-1, Math.min(1, steering)) * v.definition.maxSteerAngle;
  }

  getVehicle(vehicleId: string): VehicleState | undefined {
    return this.vehicles.get(vehicleId);
  }

  removeVehicle(vehicleId: string): boolean {
    return this.vehicles.delete(vehicleId);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private getForwardVector(vehicle: VehicleState): IVector3 {
    // Simplified: use yaw from angular velocity to determine forward direction
    const yaw = vehicle.angularVelocity.y;
    // Accumulated yaw approximation (simplified)
    return { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
  }
}

