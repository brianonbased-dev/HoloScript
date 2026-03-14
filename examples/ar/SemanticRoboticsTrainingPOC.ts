/**
 * SemanticRoboticsTrainingPOC.ts
 *
 * Converts .holo scene descriptions to VR training environments with
 * URDF (Unified Robot Description Format) and SDF (Simulation Description Format)
 * outputs. Integrates with the HoloScript trait system (@physics, @collision, @joint)
 * and provides a VR training session manager for reinforcement-learning-style
 * episode recording, reward signals, and playback.
 *
 * Staging area file for Hololand integration (TODO-052).
 *
 * @version 1.0.0
 * @package hololand/robotics-training
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloSpatialGroup,
  HoloValue,
  HoloLight,
  HoloEnvironment,
} from '../../packages/core/src/parser/HoloCompositionTypes';

// =============================================================================
// TYPES — URDF Intermediate Representation
// =============================================================================

/** Geometry specification for visual/collision shapes */
export interface URDFGeometry {
  type: 'box' | 'cylinder' | 'sphere' | 'mesh' | 'capsule';
  /** Box: [x, y, z]; Sphere: [radius]; Cylinder/Capsule: [radius, length] */
  dimensions: number[];
  /** Mesh URI (only when type === 'mesh') */
  meshUri?: string;
  /** Mesh scale factor */
  meshScale?: [number, number, number];
}

export interface URDFMaterial {
  name: string;
  color?: [number, number, number, number]; // RGBA
  textureUri?: string;
}

export interface URDFInertial {
  mass: number;
  origin: { xyz: [number, number, number]; rpy: [number, number, number] };
  /** Inertia tensor: ixx, ixy, ixz, iyy, iyz, izz */
  inertia: {
    ixx: number;
    ixy: number;
    ixz: number;
    iyy: number;
    iyz: number;
    izz: number;
  };
}

export interface URDFVisual {
  name: string;
  origin: { xyz: [number, number, number]; rpy: [number, number, number] };
  geometry: URDFGeometry;
  material?: URDFMaterial;
}

export interface URDFCollision {
  name: string;
  origin: { xyz: [number, number, number]; rpy: [number, number, number] };
  geometry: URDFGeometry;
}

export interface URDFLink {
  name: string;
  inertial?: URDFInertial;
  visuals: URDFVisual[];
  collisions: URDFCollision[];
}

export type URDFJointType =
  | 'revolute'
  | 'continuous'
  | 'prismatic'
  | 'fixed'
  | 'floating'
  | 'planar';

export interface URDFJointLimit {
  lower: number;
  upper: number;
  effort: number;
  velocity: number;
}

export interface URDFJoint {
  name: string;
  type: URDFJointType;
  parent: string;
  child: string;
  origin: { xyz: [number, number, number]; rpy: [number, number, number] };
  axis?: [number, number, number];
  limit?: URDFJointLimit;
  dynamics?: { damping: number; friction: number };
}

export interface URDFRobot {
  name: string;
  links: URDFLink[];
  joints: URDFJoint[];
}

// =============================================================================
// TYPES — SDF Intermediate Representation
// =============================================================================

export interface SDFSensor {
  name: string;
  type: 'camera' | 'ray' | 'imu' | 'contact' | 'force_torque' | 'gps' | 'altimeter';
  updateRate: number;
  properties: Record<string, string | number | boolean>;
}

export interface SDFPlugin {
  name: string;
  filename: string;
  properties: Record<string, string | number>;
}

export interface SDFModel {
  name: string;
  isStatic: boolean;
  pose: [number, number, number, number, number, number]; // x y z roll pitch yaw
  links: URDFLink[];
  joints: URDFJoint[];
  sensors: SDFSensor[];
  plugins: SDFPlugin[];
}

export interface SDFWorld {
  name: string;
  sdfVersion: string;
  physicsEngine: 'ode' | 'bullet' | 'dart' | 'simbody';
  realTimeFactor: number;
  gravity: [number, number, number];
  models: SDFModel[];
  lights: SDFLightDef[];
  scene: {
    ambient: [number, number, number, number];
    background: [number, number, number, number];
    shadows: boolean;
  };
}

export interface SDFLightDef {
  name: string;
  type: 'directional' | 'point' | 'spot';
  pose: [number, number, number, number, number, number];
  diffuse: [number, number, number, number];
  specular: [number, number, number, number];
  castShadows: boolean;
}

// =============================================================================
// TYPES — VR Training Session
// =============================================================================

export type TrainingSessionStatus =
  | 'idle'
  | 'recording'
  | 'paused'
  | 'completed'
  | 'failed';

export interface RewardSignal {
  timestamp: number;
  value: number;
  source: string;
  description?: string;
}

export interface EpisodeFrame {
  timestampMs: number;
  jointStates: Record<string, number>;
  objectPoses: Record<string, { position: [number, number, number]; rotation: [number, number, number, number] }>;
  sensorReadings: Record<string, number[]>;
  reward: number;
  info: Record<string, unknown>;
}

export interface TrainingEpisode {
  id: string;
  startTime: number;
  endTime?: number;
  frames: EpisodeFrame[];
  totalReward: number;
  outcome: 'success' | 'failure' | 'timeout' | 'aborted';
  metadata: Record<string, unknown>;
}

export interface TrainingSessionConfig {
  maxEpisodeDurationMs: number;
  recordingFps: number;
  rewardShaping: 'sparse' | 'dense' | 'curriculum';
  resetOnFail: boolean;
  environmentRandomization: boolean;
  domainRandomizationParams?: DomainRandomizationParams;
}

export interface DomainRandomizationParams {
  /** Lighting intensity range [min, max] */
  lightingRange: [number, number];
  /** Object mass multiplier range [min, max] */
  massRange: [number, number];
  /** Friction coefficient range [min, max] */
  frictionRange: [number, number];
  /** Camera noise standard deviation */
  cameraNoiseStd: number;
  /** Enable texture randomization */
  textureRandomization: boolean;
}

export interface TrainingMetrics {
  episodeCount: number;
  averageReward: number;
  successRate: number;
  averageDurationMs: number;
  bestReward: number;
  rewardHistory: number[];
}

// =============================================================================
// HoloComposition → URDF Converter
// =============================================================================

export class HoloToURDFConverter {
  private robotName: string;
  private defaultMass: number;
  private meshPathPrefix: string;

  constructor(options?: {
    robotName?: string;
    defaultMass?: number;
    meshPathPrefix?: string;
  }) {
    this.robotName = options?.robotName ?? 'holoscript_robot';
    this.defaultMass = options?.defaultMass ?? 1.0;
    this.meshPathPrefix = options?.meshPathPrefix ?? 'package://holoscript_description/meshes/';
  }

  /**
   * Convert a HoloComposition to a URDF intermediate representation.
   */
  convert(composition: HoloComposition): URDFRobot {
    const links: URDFLink[] = [];
    const joints: URDFJoint[] = [];

    // Create a base link (world frame root)
    links.push({
      name: 'base_link',
      visuals: [],
      collisions: [],
    });

    // Process top-level objects
    for (const obj of composition.objects ?? []) {
      const { link, joint } = this.objectToLinkAndJoint(obj, 'base_link');
      links.push(link);
      if (joint) joints.push(joint);

      // Process children recursively
      if (obj.children) {
        this.processChildren(obj.children, link.name, links, joints);
      }
    }

    // Process spatial groups as kinematic chains
    for (const group of composition.spatialGroups ?? []) {
      this.processSpatialGroup(group, 'base_link', links, joints);
    }

    return {
      name: composition.name || this.robotName,
      links,
      joints,
    };
  }

  /**
   * Serialize a URDFRobot to XML string.
   */
  toXML(robot: URDFRobot): string {
    const lines: string[] = [];
    lines.push('<?xml version="1.0"?>');
    lines.push(`<!-- Auto-generated by SemanticRoboticsTrainingPOC -->`);
    lines.push(`<robot name="${this.escapeXml(robot.name)}">`);

    for (const link of robot.links) {
      this.emitLink(link, lines);
    }

    for (const joint of robot.joints) {
      this.emitJoint(joint, lines);
    }

    lines.push('</robot>');
    return lines.join('\n');
  }

  private objectToLinkAndJoint(
    obj: HoloObjectDecl,
    parentName: string
  ): { link: URDFLink; joint: URDFJoint | null } {
    const linkName = this.sanitizeName(obj.name) + '_link';
    const position = this.extractPosition(obj);
    const rotation = this.extractRotation(obj);
    const scale = this.extractScale(obj);

    // Build visual geometry
    const geometry = this.objectToGeometry(obj, scale);
    const material = this.extractMaterial(obj);

    const visual: URDFVisual = {
      name: linkName + '_visual',
      origin: { xyz: position, rpy: rotation },
      geometry,
      material: material ?? undefined,
    };

    // Build collision geometry (if @collision or @physics trait present)
    const collisions: URDFCollision[] = [];
    if (this.hasTrait(obj, 'collision') || this.hasTrait(obj, 'collidable') || this.hasTrait(obj, 'physics')) {
      collisions.push({
        name: linkName + '_collision',
        origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] },
        geometry: this.objectToGeometry(obj, scale),
      });
    }

    // Build inertial (from @physics trait)
    let inertial: URDFInertial | undefined;
    const physicsTrait = this.getTrait(obj, 'physics');
    if (physicsTrait) {
      const mass = this.getTraitConfigNumber(physicsTrait, 'mass') ?? this.defaultMass;
      const inertiaScale = mass * scale * scale * 0.1;
      inertial = {
        mass,
        origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] },
        inertia: {
          ixx: inertiaScale,
          ixy: 0,
          ixz: 0,
          iyy: inertiaScale,
          iyz: 0,
          izz: inertiaScale,
        },
      };
    }

    const link: URDFLink = {
      name: linkName,
      inertial,
      visuals: [visual],
      collisions,
    };

    // Build joint (from @joint trait or default fixed)
    let joint: URDFJoint | null = null;
    const jointTrait = this.getTrait(obj, 'joint');
    if (jointTrait || parentName !== 'base_link') {
      const jointType = (this.getTraitConfigString(jointTrait, 'type') ?? 'fixed') as URDFJointType;
      const axisRaw = this.getTraitConfigArray(jointTrait, 'axis');
      const axis: [number, number, number] = axisRaw
        ? [Number(axisRaw[0]) || 0, Number(axisRaw[1]) || 0, Number(axisRaw[2]) || 1]
        : [0, 0, 1];

      joint = {
        name: `${parentName}_to_${linkName}_joint`,
        type: jointType,
        parent: parentName,
        child: linkName,
        origin: { xyz: position, rpy: rotation },
        axis: jointType !== 'fixed' ? axis : undefined,
      };

      // Add limits for revolute/prismatic joints
      if (jointType === 'revolute' || jointType === 'prismatic') {
        const lower = this.getTraitConfigNumber(jointTrait, 'lower') ?? -Math.PI;
        const upper = this.getTraitConfigNumber(jointTrait, 'upper') ?? Math.PI;
        const effort = this.getTraitConfigNumber(jointTrait, 'effort') ?? 100;
        const velocity = this.getTraitConfigNumber(jointTrait, 'velocity') ?? 1.0;
        joint.limit = { lower, upper, effort, velocity };
      }

      // Dynamics
      const damping = this.getTraitConfigNumber(jointTrait, 'damping');
      const friction = this.getTraitConfigNumber(jointTrait, 'friction');
      if (damping !== null || friction !== null) {
        joint.dynamics = {
          damping: damping ?? 0.1,
          friction: friction ?? 0.0,
        };
      }
    }

    return { link, joint };
  }

  private processChildren(
    children: HoloObjectDecl[],
    parentLinkName: string,
    links: URDFLink[],
    joints: URDFJoint[]
  ): void {
    for (const child of children) {
      const { link, joint } = this.objectToLinkAndJoint(child, parentLinkName);
      links.push(link);
      if (joint) joints.push(joint);
      if (child.children) {
        this.processChildren(child.children, link.name, links, joints);
      }
    }
  }

  private processSpatialGroup(
    group: HoloSpatialGroup,
    parentLinkName: string,
    links: URDFLink[],
    joints: URDFJoint[]
  ): void {
    const groupLinkName = this.sanitizeName(group.name) + '_group_link';

    // Create a link for the group itself
    links.push({
      name: groupLinkName,
      visuals: [],
      collisions: [],
    });

    // Fixed joint from parent to group
    const groupPos = this.extractGroupPosition(group);
    joints.push({
      name: `${parentLinkName}_to_${groupLinkName}_joint`,
      type: 'fixed',
      parent: parentLinkName,
      child: groupLinkName,
      origin: { xyz: groupPos, rpy: [0, 0, 0] },
    });

    // Process group objects
    for (const obj of group.objects ?? []) {
      const { link, joint } = this.objectToLinkAndJoint(obj, groupLinkName);
      links.push(link);
      if (joint) joints.push(joint);
      if (obj.children) {
        this.processChildren(obj.children, link.name, links, joints);
      }
    }

    // Process nested groups
    for (const nested of group.groups ?? []) {
      this.processSpatialGroup(nested, groupLinkName, links, joints);
    }
  }

  // ---- XML Emission ----

  private emitLink(link: URDFLink, lines: string[]): void {
    lines.push(`  <link name="${this.escapeXml(link.name)}">`);

    if (link.inertial) {
      lines.push('    <inertial>');
      lines.push(`      <origin xyz="${link.inertial.origin.xyz.join(' ')}" rpy="${link.inertial.origin.rpy.join(' ')}"/>`);
      lines.push(`      <mass value="${link.inertial.mass}"/>`);
      const i = link.inertial.inertia;
      lines.push(`      <inertia ixx="${i.ixx}" ixy="${i.ixy}" ixz="${i.ixz}" iyy="${i.iyy}" iyz="${i.iyz}" izz="${i.izz}"/>`);
      lines.push('    </inertial>');
    }

    for (const visual of link.visuals) {
      lines.push(`    <visual name="${this.escapeXml(visual.name)}">`);
      lines.push(`      <origin xyz="${visual.origin.xyz.join(' ')}" rpy="${visual.origin.rpy.join(' ')}"/>`);
      this.emitGeometry(visual.geometry, lines, '      ');
      if (visual.material) {
        this.emitMaterial(visual.material, lines);
      }
      lines.push('    </visual>');
    }

    for (const collision of link.collisions) {
      lines.push(`    <collision name="${this.escapeXml(collision.name)}">`);
      lines.push(`      <origin xyz="${collision.origin.xyz.join(' ')}" rpy="${collision.origin.rpy.join(' ')}"/>`);
      this.emitGeometry(collision.geometry, lines, '      ');
      lines.push('    </collision>');
    }

    lines.push('  </link>');
    lines.push('');
  }

  private emitJoint(joint: URDFJoint, lines: string[]): void {
    lines.push(`  <joint name="${this.escapeXml(joint.name)}" type="${joint.type}">`);
    lines.push(`    <parent link="${this.escapeXml(joint.parent)}"/>`);
    lines.push(`    <child link="${this.escapeXml(joint.child)}"/>`);
    lines.push(`    <origin xyz="${joint.origin.xyz.join(' ')}" rpy="${joint.origin.rpy.join(' ')}"/>`);

    if (joint.axis) {
      lines.push(`    <axis xyz="${joint.axis.join(' ')}"/>`);
    }

    if (joint.limit) {
      lines.push(`    <limit lower="${joint.limit.lower}" upper="${joint.limit.upper}" effort="${joint.limit.effort}" velocity="${joint.limit.velocity}"/>`);
    }

    if (joint.dynamics) {
      lines.push(`    <dynamics damping="${joint.dynamics.damping}" friction="${joint.dynamics.friction}"/>`);
    }

    lines.push('  </joint>');
    lines.push('');
  }

  private emitGeometry(geometry: URDFGeometry, lines: string[], indent: string): void {
    lines.push(`${indent}<geometry>`);
    switch (geometry.type) {
      case 'box':
        lines.push(`${indent}  <box size="${geometry.dimensions.join(' ')}"/>`);
        break;
      case 'sphere':
        lines.push(`${indent}  <sphere radius="${geometry.dimensions[0]}"/>`);
        break;
      case 'cylinder':
        lines.push(`${indent}  <cylinder radius="${geometry.dimensions[0]}" length="${geometry.dimensions[1]}"/>`);
        break;
      case 'capsule':
        lines.push(`${indent}  <capsule radius="${geometry.dimensions[0]}" length="${geometry.dimensions[1]}"/>`);
        break;
      case 'mesh':
        if (geometry.meshScale) {
          lines.push(`${indent}  <mesh filename="${geometry.meshUri}" scale="${geometry.meshScale.join(' ')}"/>`);
        } else {
          lines.push(`${indent}  <mesh filename="${geometry.meshUri}"/>`);
        }
        break;
    }
    lines.push(`${indent}</geometry>`);
  }

  private emitMaterial(material: URDFMaterial, lines: string[]): void {
    lines.push(`      <material name="${this.escapeXml(material.name)}">`);
    if (material.color) {
      lines.push(`        <color rgba="${material.color.join(' ')}"/>`);
    }
    if (material.textureUri) {
      lines.push(`        <texture filename="${material.textureUri}"/>`);
    }
    lines.push('      </material>');
  }

  // ---- Helpers ----

  private objectToGeometry(obj: HoloObjectDecl, scale: number): URDFGeometry {
    const geoProp = obj.properties?.find((p) => p.key === 'geometry');
    const geoType = geoProp ? this.getStringValue(geoProp.value) : 'box';

    switch (geoType) {
      case 'sphere':
        return { type: 'sphere', dimensions: [scale / 2] };
      case 'cylinder':
        return { type: 'cylinder', dimensions: [scale / 2, scale] };
      case 'capsule':
        return { type: 'capsule', dimensions: [scale / 3, scale] };
      default:
        if (geoType.includes('.')) {
          return {
            type: 'mesh',
            dimensions: [1],
            meshUri: this.meshPathPrefix + geoType,
            meshScale: [scale, scale, scale],
          };
        }
        return { type: 'box', dimensions: [scale, scale, scale] };
    }
  }

  private extractPosition(obj: HoloObjectDecl): [number, number, number] {
    const posProp = obj.properties?.find((p) => p.key === 'position');
    if (posProp && Array.isArray(posProp.value)) {
      return [
        Number(posProp.value[0]) || 0,
        Number(posProp.value[1]) || 0,
        Number(posProp.value[2]) || 0,
      ];
    }
    return [0, 0, 0];
  }

  private extractRotation(obj: HoloObjectDecl): [number, number, number] {
    const rotProp = obj.properties?.find((p) => p.key === 'rotation');
    if (rotProp && Array.isArray(rotProp.value)) {
      return [
        Number(rotProp.value[0]) || 0,
        Number(rotProp.value[1]) || 0,
        Number(rotProp.value[2]) || 0,
      ];
    }
    return [0, 0, 0];
  }

  private extractScale(obj: HoloObjectDecl): number {
    const scaleProp = obj.properties?.find((p) => p.key === 'scale');
    if (scaleProp && typeof scaleProp.value === 'number') {
      return scaleProp.value;
    }
    return 1.0;
  }

  private extractGroupPosition(group: HoloSpatialGroup): [number, number, number] {
    const posProp = group.properties?.find((p) => p.key === 'position');
    if (posProp && Array.isArray(posProp.value)) {
      return [
        Number(posProp.value[0]) || 0,
        Number(posProp.value[1]) || 0,
        Number(posProp.value[2]) || 0,
      ];
    }
    return [0, 0, 0];
  }

  private extractMaterial(obj: HoloObjectDecl): URDFMaterial | null {
    const colorProp = obj.properties?.find((p) => p.key === 'color');
    if (colorProp) {
      const colorStr = this.getStringValue(colorProp.value);
      const rgb = this.parseHexColor(colorStr);
      if (rgb) {
        return {
          name: this.sanitizeName(obj.name) + '_material',
          color: [rgb.r, rgb.g, rgb.b, 1.0],
        };
      }
    }

    // Check for @material trait
    const matTrait = this.getTrait(obj, 'material');
    if (matTrait) {
      const r = this.getTraitConfigNumber(matTrait, 'r') ?? 0.7;
      const g = this.getTraitConfigNumber(matTrait, 'g') ?? 0.7;
      const b = this.getTraitConfigNumber(matTrait, 'b') ?? 0.7;
      return {
        name: this.sanitizeName(obj.name) + '_material',
        color: [r, g, b, 1.0],
      };
    }

    return null;
  }

  private hasTrait(obj: HoloObjectDecl, traitName: string): boolean {
    return obj.traits?.some((t) => this.getTraitName(t) === traitName) ?? false;
  }

  private getTrait(obj: HoloObjectDecl, traitName: string): HoloObjectTrait | undefined {
    return obj.traits?.find((t) => this.getTraitName(t) === traitName);
  }

  private getTraitName(trait: HoloObjectTrait | string): string {
    return typeof trait === 'string' ? trait : trait.name;
  }

  private getTraitConfigNumber(trait: HoloObjectTrait | undefined, key: string): number | null {
    if (!trait || !trait.config) return null;
    const val = trait.config[key];
    return typeof val === 'number' ? val : null;
  }

  private getTraitConfigString(trait: HoloObjectTrait | undefined, key: string): string | null {
    if (!trait || !trait.config) return null;
    const val = trait.config[key];
    return typeof val === 'string' ? val : null;
  }

  private getTraitConfigArray(trait: HoloObjectTrait | undefined, key: string): HoloValue[] | null {
    if (!trait || !trait.config) return null;
    const val = trait.config[key];
    return Array.isArray(val) ? val : null;
  }

  private getStringValue(val: HoloValue): string {
    return typeof val === 'string' ? val : String(val ?? 'box');
  }

  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private parseHexColor(hex: string): { r: number; g: number; b: number } | null {
    const match = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!match) return null;
    return {
      r: parseInt(match[1], 16) / 255,
      g: parseInt(match[2], 16) / 255,
      b: parseInt(match[3], 16) / 255,
    };
  }
}

// =============================================================================
// HoloComposition → SDF Converter
// =============================================================================

export class HoloToSDFConverter {
  private worldName: string;
  private sdfVersion: string;
  private physicsEngine: 'ode' | 'bullet' | 'dart' | 'simbody';
  private realTimeFactor: number;
  private meshPathPrefix: string;

  constructor(options?: {
    worldName?: string;
    sdfVersion?: string;
    physicsEngine?: 'ode' | 'bullet' | 'dart' | 'simbody';
    realTimeFactor?: number;
    meshPathPrefix?: string;
  }) {
    this.worldName = options?.worldName ?? 'holoscript_training_world';
    this.sdfVersion = options?.sdfVersion ?? '1.8';
    this.physicsEngine = options?.physicsEngine ?? 'ode';
    this.realTimeFactor = options?.realTimeFactor ?? 1.0;
    this.meshPathPrefix = options?.meshPathPrefix ?? 'model://';
  }

  /**
   * Convert a HoloComposition to an SDF world description.
   */
  convert(composition: HoloComposition): SDFWorld {
    const models: SDFModel[] = [];
    const lights: SDFLightDef[] = [];

    // Convert objects to SDF models
    for (const obj of composition.objects ?? []) {
      models.push(this.objectToModel(obj));
    }

    // Convert spatial groups — each group becomes a model with sub-links
    for (const group of composition.spatialGroups ?? []) {
      models.push(this.spatialGroupToModel(group));
    }

    // Convert lights
    for (const light of composition.lights ?? []) {
      lights.push(this.holoLightToSDF(light));
    }

    // Scene properties
    const scene = this.extractScene(composition.environment);

    return {
      name: this.worldName,
      sdfVersion: this.sdfVersion,
      physicsEngine: this.physicsEngine,
      realTimeFactor: this.realTimeFactor,
      gravity: [0, 0, -9.81],
      models,
      lights,
      scene,
    };
  }

  /**
   * Serialize an SDFWorld to XML string.
   */
  toXML(world: SDFWorld): string {
    const lines: string[] = [];
    let indent = 0;

    const emit = (text: string) => lines.push('  '.repeat(indent) + text);

    emit('<?xml version="1.0"?>');
    emit(`<!-- Auto-generated by SemanticRoboticsTrainingPOC SDF Converter -->`);
    emit(`<sdf version="${world.sdfVersion}">`);
    indent++;
    emit(`<world name="${this.escapeXml(world.name)}">`);
    indent++;

    // Physics
    emit(`<physics name="default_physics" type="${world.physicsEngine}">`);
    indent++;
    emit('<max_step_size>0.001</max_step_size>');
    emit(`<real_time_factor>${world.realTimeFactor}</real_time_factor>`);
    emit('<real_time_update_rate>1000</real_time_update_rate>');
    indent--;
    emit('</physics>');
    emit('');

    // Gravity
    emit(`<gravity>${world.gravity.join(' ')}</gravity>`);
    emit('');

    // Scene
    emit('<scene>');
    indent++;
    emit(`<ambient>${world.scene.ambient.join(' ')}</ambient>`);
    emit(`<background>${world.scene.background.join(' ')}</background>`);
    emit(`<shadows>${world.scene.shadows}</shadows>`);
    indent--;
    emit('</scene>');
    emit('');

    // Ground plane
    emit('<model name="ground_plane">');
    indent++;
    emit('<static>true</static>');
    emit('<link name="link">');
    indent++;
    emit('<collision name="collision"><geometry><plane><normal>0 0 1</normal><size>100 100</size></plane></geometry></collision>');
    emit('<visual name="visual"><geometry><plane><normal>0 0 1</normal><size>100 100</size></plane></geometry></visual>');
    indent--;
    emit('</link>');
    indent--;
    emit('</model>');
    emit('');

    // Models
    for (const model of world.models) {
      this.emitModel(model, emit, () => indent++, () => indent--);
      emit('');
    }

    // Lights
    for (const light of world.lights) {
      this.emitLight(light, emit, () => indent++, () => indent--);
      emit('');
    }

    indent--;
    emit('</world>');
    indent--;
    emit('</sdf>');

    return lines.join('\n');
  }

  private objectToModel(obj: HoloObjectDecl): SDFModel {
    const urdfConverter = new HoloToURDFConverter({ meshPathPrefix: this.meshPathPrefix });
    const hasPhysics = obj.traits?.some((t) => {
      const name = typeof t === 'string' ? t : t.name;
      return name === 'physics' || name === 'rigid';
    }) ?? false;

    const position = this.extractPosition(obj);
    const rotation = this.extractRotation(obj);

    // Extract sensors from @sensor trait
    const sensors: SDFSensor[] = [];
    const sensorTrait = obj.traits?.find((t) => (typeof t === 'string' ? t : t.name) === 'sensor');
    if (sensorTrait && typeof sensorTrait !== 'string' && sensorTrait.config) {
      const sType = (sensorTrait.config['type'] as string) ?? 'camera';
      sensors.push({
        name: obj.name + '_sensor',
        type: sType as SDFSensor['type'],
        updateRate: (sensorTrait.config['rate'] as number) ?? 30,
        properties: sensorTrait.config as Record<string, string | number | boolean>,
      });
    }

    // Extract plugins from @plugin trait
    const plugins: SDFPlugin[] = [];
    const pluginTrait = obj.traits?.find((t) => (typeof t === 'string' ? t : t.name) === 'plugin');
    if (pluginTrait && typeof pluginTrait !== 'string' && pluginTrait.config) {
      plugins.push({
        name: (pluginTrait.config['name'] as string) ?? obj.name + '_plugin',
        filename: (pluginTrait.config['filename'] as string) ?? 'libdefault_plugin.so',
        properties: pluginTrait.config as Record<string, string | number>,
      });
    }

    // Convert this object to a single-link URDF then transplant the link
    const { link } = (urdfConverter as any).objectToLinkAndJoint(obj, 'world');

    return {
      name: this.sanitizeName(obj.name),
      isStatic: !hasPhysics,
      pose: [...position, ...rotation],
      links: [link],
      joints: [],
      sensors,
      plugins,
    };
  }

  private spatialGroupToModel(group: HoloSpatialGroup): SDFModel {
    const urdfConverter = new HoloToURDFConverter({ meshPathPrefix: this.meshPathPrefix });
    const links: URDFLink[] = [];
    const joints: URDFJoint[] = [];

    for (const obj of group.objects ?? []) {
      const result = (urdfConverter as any).objectToLinkAndJoint(obj, 'base_link');
      links.push(result.link);
      if (result.joint) joints.push(result.joint);
    }

    const groupPos = this.extractGroupPosition(group);

    return {
      name: this.sanitizeName(group.name),
      isStatic: false,
      pose: [...groupPos, 0, 0, 0],
      links,
      joints,
      sensors: [],
      plugins: [],
    };
  }

  private holoLightToSDF(light: HoloLight): SDFLightDef {
    const lightType = light.lightType ?? 'point';
    const mapped: SDFLightDef['type'] = lightType === 'directional' ? 'directional' : lightType === 'spot' ? 'spot' : 'point';

    const posProp = light.properties?.find((p) => p.key === 'position');
    const pos = posProp && Array.isArray(posProp.value)
      ? [Number(posProp.value[0]) || 0, Number(posProp.value[1]) || 0, Number(posProp.value[2]) || 5]
      : [0, 0, 5];

    const intensityProp = light.properties?.find((p) => p.key === 'intensity');
    const intensity = (intensityProp && typeof intensityProp.value === 'number') ? intensityProp.value : 1.0;

    return {
      name: this.sanitizeName(light.name || 'light'),
      type: mapped,
      pose: [pos[0], pos[1], pos[2], 0, 0, 0],
      diffuse: [intensity * 0.8, intensity * 0.8, intensity * 0.8, 1],
      specular: [0.2, 0.2, 0.2, 1],
      castShadows: true,
    };
  }

  private extractScene(env?: HoloEnvironment): SDFWorld['scene'] {
    return {
      ambient: [0.4, 0.4, 0.4, 1],
      background: [0.7, 0.7, 0.9, 1],
      shadows: true,
    };
  }

  private extractPosition(obj: HoloObjectDecl): [number, number, number] {
    const posProp = obj.properties?.find((p) => p.key === 'position');
    if (posProp && Array.isArray(posProp.value)) {
      return [Number(posProp.value[0]) || 0, Number(posProp.value[1]) || 0, Number(posProp.value[2]) || 0];
    }
    return [0, 0, 0];
  }

  private extractRotation(obj: HoloObjectDecl): [number, number, number] {
    const rotProp = obj.properties?.find((p) => p.key === 'rotation');
    if (rotProp && Array.isArray(rotProp.value)) {
      return [Number(rotProp.value[0]) || 0, Number(rotProp.value[1]) || 0, Number(rotProp.value[2]) || 0];
    }
    return [0, 0, 0];
  }

  private extractGroupPosition(group: HoloSpatialGroup): [number, number, number] {
    const posProp = group.properties?.find((p) => p.key === 'position');
    if (posProp && Array.isArray(posProp.value)) {
      return [Number(posProp.value[0]) || 0, Number(posProp.value[1]) || 0, Number(posProp.value[2]) || 0];
    }
    return [0, 0, 0];
  }

  private emitModel(
    model: SDFModel,
    emit: (s: string) => void,
    incIndent: () => void,
    decIndent: () => void
  ): void {
    emit(`<model name="${this.escapeXml(model.name)}">`);
    incIndent();
    if (model.isStatic) emit('<static>true</static>');
    emit(`<pose>${model.pose.join(' ')}</pose>`);

    for (const link of model.links) {
      emit(`<link name="${this.escapeXml(link.name)}">`);
      incIndent();
      if (link.inertial) {
        emit(`<inertial><mass>${link.inertial.mass}</mass></inertial>`);
      }
      for (const v of link.visuals) {
        emit(`<visual name="${this.escapeXml(v.name)}"><geometry><box><size>1 1 1</size></box></geometry></visual>`);
      }
      for (const c of link.collisions) {
        emit(`<collision name="${this.escapeXml(c.name)}"><geometry><box><size>1 1 1</size></box></geometry></collision>`);
      }
      decIndent();
      emit('</link>');
    }

    for (const joint of model.joints) {
      emit(`<joint name="${this.escapeXml(joint.name)}" type="${joint.type}">`);
      incIndent();
      emit(`<parent>${this.escapeXml(joint.parent)}</parent>`);
      emit(`<child>${this.escapeXml(joint.child)}</child>`);
      decIndent();
      emit('</joint>');
    }

    for (const sensor of model.sensors) {
      emit(`<sensor name="${this.escapeXml(sensor.name)}" type="${sensor.type}">`);
      incIndent();
      emit(`<update_rate>${sensor.updateRate}</update_rate>`);
      decIndent();
      emit('</sensor>');
    }

    for (const plugin of model.plugins) {
      emit(`<plugin name="${this.escapeXml(plugin.name)}" filename="${this.escapeXml(plugin.filename)}"/>`);
    }

    decIndent();
    emit('</model>');
  }

  private emitLight(
    light: SDFLightDef,
    emit: (s: string) => void,
    incIndent: () => void,
    decIndent: () => void
  ): void {
    emit(`<light name="${this.escapeXml(light.name)}" type="${light.type}">`);
    incIndent();
    emit(`<cast_shadows>${light.castShadows}</cast_shadows>`);
    emit(`<pose>${light.pose.join(' ')}</pose>`);
    emit(`<diffuse>${light.diffuse.join(' ')}</diffuse>`);
    emit(`<specular>${light.specular.join(' ')}</specular>`);
    decIndent();
    emit('</light>');
  }

  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
  }

  private escapeXml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

// =============================================================================
// VR Training Session Manager
// =============================================================================

/**
 * Manages VR training sessions for reinforcement-learning-style robotics training.
 * Handles episode start/stop, frame recording, reward accumulation, and reset.
 */
export class VRTrainingSessionManager {
  private config: TrainingSessionConfig;
  private currentEpisode: TrainingEpisode | null = null;
  private episodes: TrainingEpisode[] = [];
  private status: TrainingSessionStatus = 'idle';
  private recordingInterval: ReturnType<typeof setInterval> | null = null;
  private episodeTimer: ReturnType<typeof setTimeout> | null = null;
  private cumulativeReward: number = 0;
  private rewardSignals: RewardSignal[] = [];
  private frameCallback: (() => EpisodeFrame) | null = null;

  /** Event listeners */
  private listeners: {
    onEpisodeStart?: (episodeId: string) => void;
    onEpisodeEnd?: (episode: TrainingEpisode) => void;
    onReward?: (signal: RewardSignal) => void;
    onFrame?: (frame: EpisodeFrame) => void;
    onReset?: () => void;
  } = {};

  constructor(config?: Partial<TrainingSessionConfig>) {
    this.config = {
      maxEpisodeDurationMs: config?.maxEpisodeDurationMs ?? 60_000,
      recordingFps: config?.recordingFps ?? 30,
      rewardShaping: config?.rewardShaping ?? 'dense',
      resetOnFail: config?.resetOnFail ?? true,
      environmentRandomization: config?.environmentRandomization ?? false,
      domainRandomizationParams: config?.domainRandomizationParams,
    };
  }

  /** Register event listeners */
  on(event: keyof typeof this.listeners, callback: (...args: any[]) => void): void {
    (this.listeners as any)[event] = callback;
  }

  /** Set the frame capture callback. Called each recording tick to sample the environment. */
  setFrameCallback(cb: () => EpisodeFrame): void {
    this.frameCallback = cb;
  }

  /** Get current session status */
  getStatus(): TrainingSessionStatus {
    return this.status;
  }

  /** Get all completed episodes */
  getEpisodes(): TrainingEpisode[] {
    return [...this.episodes];
  }

  /** Get the current in-progress episode, or null */
  getCurrentEpisode(): TrainingEpisode | null {
    return this.currentEpisode;
  }

  /**
   * Start a new training episode.
   */
  startEpisode(metadata?: Record<string, unknown>): string {
    if (this.status === 'recording') {
      this.endEpisode('aborted');
    }

    const id = `ep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.currentEpisode = {
      id,
      startTime: Date.now(),
      frames: [],
      totalReward: 0,
      outcome: 'timeout',
      metadata: metadata ?? {},
    };
    this.cumulativeReward = 0;
    this.rewardSignals = [];
    this.status = 'recording';

    // Apply domain randomization if enabled
    if (this.config.environmentRandomization && this.config.domainRandomizationParams) {
      this.applyDomainRandomization(this.config.domainRandomizationParams);
    }

    // Start recording frames
    const intervalMs = 1000 / this.config.recordingFps;
    this.recordingInterval = setInterval(() => {
      this.captureFrame();
    }, intervalMs);

    // Set max duration timeout
    this.episodeTimer = setTimeout(() => {
      this.endEpisode('timeout');
    }, this.config.maxEpisodeDurationMs);

    this.listeners.onEpisodeStart?.(id);
    return id;
  }

  /**
   * End the current episode.
   */
  endEpisode(outcome: TrainingEpisode['outcome'] = 'success'): TrainingEpisode | null {
    if (!this.currentEpisode) return null;

    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }
    if (this.episodeTimer) {
      clearTimeout(this.episodeTimer);
      this.episodeTimer = null;
    }

    this.currentEpisode.endTime = Date.now();
    this.currentEpisode.totalReward = this.cumulativeReward;
    this.currentEpisode.outcome = outcome;

    const completed = { ...this.currentEpisode };
    this.episodes.push(completed);
    this.currentEpisode = null;
    this.status = outcome === 'success' ? 'completed' : outcome === 'failure' ? 'failed' : 'idle';

    this.listeners.onEpisodeEnd?.(completed);

    // Auto-reset on failure
    if (outcome === 'failure' && this.config.resetOnFail) {
      this.reset();
    }

    return completed;
  }

  /**
   * Pause recording (keeps episode open but stops frame capture).
   */
  pauseRecording(): void {
    if (this.status !== 'recording') return;
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }
    this.status = 'paused';
  }

  /**
   * Resume recording after pause.
   */
  resumeRecording(): void {
    if (this.status !== 'paused' || !this.currentEpisode) return;
    const intervalMs = 1000 / this.config.recordingFps;
    this.recordingInterval = setInterval(() => {
      this.captureFrame();
    }, intervalMs);
    this.status = 'recording';
  }

  /**
   * Send a reward signal to the current episode.
   */
  sendReward(value: number, source: string, description?: string): void {
    if (!this.currentEpisode) return;

    const signal: RewardSignal = {
      timestamp: Date.now(),
      value,
      source,
      description,
    };

    this.cumulativeReward += value;
    this.rewardSignals.push(signal);
    this.listeners.onReward?.(signal);

    // Attach reward to the latest frame
    const lastFrame = this.currentEpisode.frames[this.currentEpisode.frames.length - 1];
    if (lastFrame) {
      lastFrame.reward += value;
    }
  }

  /**
   * Reset the environment to initial state.
   */
  reset(): void {
    if (this.currentEpisode) {
      this.endEpisode('aborted');
    }
    this.status = 'idle';
    this.listeners.onReset?.();
  }

  /**
   * Compute aggregate training metrics across all episodes.
   */
  getMetrics(): TrainingMetrics {
    const episodeCount = this.episodes.length;
    if (episodeCount === 0) {
      return {
        episodeCount: 0,
        averageReward: 0,
        successRate: 0,
        averageDurationMs: 0,
        bestReward: 0,
        rewardHistory: [],
      };
    }

    const rewards = this.episodes.map((e) => e.totalReward);
    const durations = this.episodes.map((e) => (e.endTime ?? e.startTime) - e.startTime);
    const successes = this.episodes.filter((e) => e.outcome === 'success').length;

    return {
      episodeCount,
      averageReward: rewards.reduce((a, b) => a + b, 0) / episodeCount,
      successRate: successes / episodeCount,
      averageDurationMs: durations.reduce((a, b) => a + b, 0) / episodeCount,
      bestReward: Math.max(...rewards),
      rewardHistory: rewards,
    };
  }

  /**
   * Export all episodes as a JSON-serializable structure for offline analysis.
   */
  exportData(): {
    config: TrainingSessionConfig;
    metrics: TrainingMetrics;
    episodes: TrainingEpisode[];
  } {
    return {
      config: { ...this.config },
      metrics: this.getMetrics(),
      episodes: this.episodes.map((e) => ({ ...e })),
    };
  }

  /** Destroy and clean up all timers */
  destroy(): void {
    if (this.recordingInterval) clearInterval(this.recordingInterval);
    if (this.episodeTimer) clearTimeout(this.episodeTimer);
    this.recordingInterval = null;
    this.episodeTimer = null;
    this.currentEpisode = null;
    this.episodes = [];
    this.status = 'idle';
  }

  // ---- Private ----

  private captureFrame(): void {
    if (!this.currentEpisode || !this.frameCallback) return;

    const frame = this.frameCallback();
    this.currentEpisode.frames.push(frame);
    this.listeners.onFrame?.(frame);
  }

  private applyDomainRandomization(params: DomainRandomizationParams): void {
    // Domain randomization is applied externally by the training environment.
    // This method stores the params in the current episode metadata for reproducibility.
    if (this.currentEpisode) {
      const randomized: Record<string, number> = {
        lightingScale: this.randomInRange(params.lightingRange[0], params.lightingRange[1]),
        massScale: this.randomInRange(params.massRange[0], params.massRange[1]),
        frictionScale: this.randomInRange(params.frictionRange[0], params.frictionRange[1]),
        cameraNoise: params.cameraNoiseStd * (Math.random() * 2 - 1),
      };
      this.currentEpisode.metadata['domainRandomization'] = randomized;
    }
  }

  private randomInRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
}

// =============================================================================
// Unified Facade: SemanticRoboticsTrainingPOC
// =============================================================================

/**
 * Top-level facade that ties together URDF conversion, SDF conversion,
 * and VR training session management. This is the main entry point for
 * Hololand robotics training integration.
 */
export class SemanticRoboticsTrainingPOC {
  public readonly urdfConverter: HoloToURDFConverter;
  public readonly sdfConverter: HoloToSDFConverter;
  public readonly sessionManager: VRTrainingSessionManager;

  constructor(options?: {
    robotName?: string;
    worldName?: string;
    meshPathPrefix?: string;
    sessionConfig?: Partial<TrainingSessionConfig>;
  }) {
    this.urdfConverter = new HoloToURDFConverter({
      robotName: options?.robotName,
      meshPathPrefix: options?.meshPathPrefix,
    });
    this.sdfConverter = new HoloToSDFConverter({
      worldName: options?.worldName,
      meshPathPrefix: options?.meshPathPrefix,
    });
    this.sessionManager = new VRTrainingSessionManager(options?.sessionConfig);
  }

  /**
   * Convert a HoloComposition to URDF XML.
   */
  toURDF(composition: HoloComposition): string {
    const robot = this.urdfConverter.convert(composition);
    return this.urdfConverter.toXML(robot);
  }

  /**
   * Convert a HoloComposition to SDF XML.
   */
  toSDF(composition: HoloComposition): string {
    const world = this.sdfConverter.convert(composition);
    return this.sdfConverter.toXML(world);
  }

  /**
   * Start a training episode from a composition.
   * Returns the episode ID.
   */
  startTraining(composition: HoloComposition, metadata?: Record<string, unknown>): string {
    return this.sessionManager.startEpisode({
      compositionName: composition.name,
      objectCount: composition.objects?.length ?? 0,
      ...metadata,
    });
  }

  /**
   * Stop the current training episode with an outcome.
   */
  stopTraining(outcome: TrainingEpisode['outcome'] = 'success'): TrainingEpisode | null {
    return this.sessionManager.endEpisode(outcome);
  }

  /**
   * Get training metrics.
   */
  getMetrics(): TrainingMetrics {
    return this.sessionManager.getMetrics();
  }

  /**
   * Export all data (URDF, SDF, training episodes) for a given composition.
   */
  exportAll(composition: HoloComposition): {
    urdf: string;
    sdf: string;
    training: ReturnType<VRTrainingSessionManager['exportData']>;
  } {
    return {
      urdf: this.toURDF(composition),
      sdf: this.toSDF(composition),
      training: this.sessionManager.exportData(),
    };
  }

  /**
   * Destroy and clean up all resources.
   */
  destroy(): void {
    this.sessionManager.destroy();
  }
}
