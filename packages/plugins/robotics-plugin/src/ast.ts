/**
 * Abstract Syntax Tree (AST) node types for HoloScript robotics
 *
 * Extended for Isaac Lab sim-to-real interop (Path A):
 * - Domain randomization blocks
 * - Actuator group configurations
 * - Delayed actuator export hints
 */

export type PropertyValue = string | number | boolean | number[] | PropertyValue[];

export interface DomainRandomizationConfig {
  /** Physics randomization: mass, friction, damping */
  physics?: {
    massScale?: [number, number]; // [min, max]
    frictionRange?: [number, number];
    dampingRange?: [number, number];
    armatureRange?: [number, number];
  };
  /** Actuator randomization */
  actuator?: {
    kpNoise?: number;
    kdNoise?: number;
    latencyNoise?: number;
  };
  /** Observation noise */
  observation?: {
    jointPosNoise?: number;
    jointVelNoise?: number;
    imuNoise?: number;
  };
  /** Initial state randomization */
  initialState?: {
    jointPosRange?: Record<string, [number, number]>;
    rootPoseRange?: [number, number, number, number, number, number]; // [x_min, x_max, y_min, ...]
  };
  /** Disturbance forces */
  disturbance?: {
    forceRange?: [number, number];
    intervalRange?: [number, number];
  };
}

export interface ActuatorGroupConfig {
  name: string;
  type: 'IdealPDActuator' | 'DCMotorActuator' | 'DelayedPDActuator' | 'RemotizedPDActuator' | 'ImplicitActuator';
  jointNames: string[];
  stiffness?: number;
  damping?: number;
  friction?: number;
  latency?: number; // seconds, converted by Isaac Lab task config to delay steps.
}

export interface ObjectNode {
  type: 'object';
  name: string;
  traits: string[];
  properties: Record<string, PropertyValue>;
  domainRandomization?: DomainRandomizationConfig;
  actuatorGroups?: ActuatorGroupConfig[];
  template?: string;
  line?: number;
  column?: number;
}

export interface CompositionNode {
  type: 'composition';
  name: string;
  objects: ObjectNode[];
  domainRandomization?: DomainRandomizationConfig;
  line?: number;
  column?: number;
}

export type ASTNode = CompositionNode | ObjectNode;
