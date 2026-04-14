/**
 * HoloScript -> URDF (Unified Robot Description Format) Compiler
 *
 * Exports HoloScript compositions to URDF XML format for ROS 2 / Gazebo
 * simulation and robot manipulation. This is the most widely used robot
 * description format in ROS and captures the largest robotics developer
 * market segment.
 *
 * Architecture follows the USD Physics Compiler pattern with:
 *   - Type-safe intermediate representation (URDFLink, URDFJoint, etc.)
 *   - Composition extraction phase -> IR building -> XML emission phase
 *   - Trait-based mapping from HoloScript semantics to URDF elements
 *   - Convenience functions for common deployment targets
 *
 * Maps:
 *   - Objects -> Links with visual/collision geometry
 *   - @physics -> Inertial properties (mass, inertia tensor)
 *   - @collidable -> Collision geometry
 *   - @joint -> Joint definitions (revolute, prismatic, continuous, fixed, floating, planar)
 *   - @sensor -> Gazebo sensor plugins (camera, IMU, lidar, force-torque, contact)
 *   - @actuator -> ros2_control transmission definitions
 *   - @grabbable -> Interaction hints (as custom XML comments)
 *   - Spatial Groups -> Link hierarchy with fixed joints
 *
 * Output: URDF XML (.urdf) compatible with:
 *   - ROS 2 (Humble, Iron, Jazzy, Rolling)
 *   - Gazebo (Classic and Ignition/Garden+)
 *   - MoveIt 2 (motion planning)
 *   - RViz2 (visualization)
 *   - Isaac Sim (NVIDIA robotics)
 *
 * @version 2.0.0
 * @package @holoscript/core/compiler
 */

import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';
import {
  compileDomainBlocks,
  compileMaterialBlock,
  compilePhysicsBlock,
  compileAudioSourceBlock,
  compileWeatherBlock,
  physicsToURDF,
} from './DomainBlockCompilerMixin';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloSpatialGroup,
  HoloValue,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface URDFCompilerOptions {
  /** Robot name for URDF */
  robotName?: string;
  /** Include visual meshes */
  includeVisual?: boolean;
  /** Include collision geometry */
  includeCollision?: boolean;
  /** Include inertial properties */
  includeInertial?: boolean;
  /** Default mass for objects without @physics */
  defaultMass?: number;
  /** Mesh export path prefix */
  meshPathPrefix?: string;
  /** Include custom HoloScript extensions as XML comments */
  includeHoloExtensions?: boolean;
  /** Include Gazebo-specific plugin tags */
  includeGazeboPlugins?: boolean;
  /** Include ros2_control hardware interface tags */
  includeROS2Control?: boolean;
  /** Gazebo version target: 'classic' or 'harmonic' */
  gazeboVersion?: 'classic' | 'harmonic';
  /** Gazebo physics engine (ode, bullet, dart, simbody) */
  gazeboPhysicsEngine?: 'ode' | 'bullet' | 'dart' | 'simbody';
  /** Default static friction coefficient */
  defaultMu1?: number;
  /** Default dynamic friction coefficient */
  defaultMu2?: number;
  /** Default contact stiffness (kp) */
  defaultKp?: number;
  /** Default contact damping (kd) */
  defaultKd?: number;
  /** Enable self-collision checking */
  enableSelfCollision?: boolean;
  /** ROS 2 package name (for mesh paths) */
  packageName?: string;
  /** Include Isaac Sim-specific extension tags */
  includeIsaacSimExtensions?: boolean;
  /** Isaac Sim drive type: 'acceleration' or 'force' */
  isaacSimDriveType?: 'acceleration' | 'force';
  /** Isaac Sim target type: 'none', 'position', 'velocity' */
  isaacSimTargetType?: 'none' | 'position' | 'velocity';
  /** Isaac Sim PhysX solver position iterations */
  isaacSimSolverPositionIterations?: number;
  /** Isaac Sim PhysX solver velocity iterations */
  isaacSimSolverVelocityIterations?: number;
}

export interface URDFLink {
  name: string;
  visual?: URDFGeometry;
  collision?: URDFGeometry;
  inertial?: URDFInertial;
  origin?: URDFOrigin;
  /** Gazebo material override */
  gazeboMaterial?: string;
  /** Sensor attached to this link */
  sensors?: URDFSensor[];
}

export interface URDFGeometry {
  type: 'box' | 'sphere' | 'cylinder' | 'mesh';
  size?: [number, number, number];
  radius?: number;
  length?: number;
  filename?: string;
  color?: string;
  /** Scale for mesh geometry */
  scale?: [number, number, number];
}

export interface URDFInertial {
  mass: number;
  inertia: {
    ixx: number;
    ixy: number;
    ixz: number;
    iyy: number;
    iyz: number;
    izz: number;
  };
  origin?: URDFOrigin;
}

export interface URDFOrigin {
  xyz: [number, number, number];
  rpy: [number, number, number]; // roll, pitch, yaw in radians
}

export interface URDFJoint {
  name: string;
  type: 'fixed' | 'revolute' | 'prismatic' | 'continuous' | 'floating' | 'planar';
  parent: string;
  child: string;
  origin?: URDFOrigin;
  axis?: [number, number, number];
  limits?: {
    lower: number;
    upper: number;
    effort: number;
    velocity: number;
  };
  dynamics?: {
    damping: number;
    friction: number;
  };
  /** Mimic joint configuration */
  mimic?: {
    joint: string;
    multiplier: number;
    offset: number;
  };
  /** Safety controller limits */
  safetyController?: {
    softLowerLimit: number;
    softUpperLimit: number;
    kPosition: number;
    kVelocity: number;
  };
}

export interface URDFSensor {
  name: string;
  type: 'camera' | 'imu' | 'lidar' | 'ray' | 'force_torque' | 'contact' | 'depth_camera' | 'gps';
  /** Link this sensor is attached to */
  parentLink: string;
  /** Update rate in Hz */
  updateRate?: number;
  /** Topic name for ROS 2 */
  topicName?: string;
  /** Frame name */
  frameName?: string;
  /** Camera-specific config */
  camera?: {
    horizontalFov: number;
    imageWidth: number;
    imageHeight: number;
    clipNear: number;
    clipFar: number;
    format?: string;
  };
  /** Lidar/ray-specific config */
  lidar?: {
    samples: number;
    resolution: number;
    minAngle: number;
    maxAngle: number;
    minRange: number;
    maxRange: number;
  };
  /** IMU-specific config */
  imu?: {
    gaussianNoise?: number;
  };
}

export interface URDFTransmission {
  name: string;
  type: string;
  jointName: string;
  actuatorName: string;
  hardwareInterface: string;
  mechanicalReduction?: number;
}

export interface URDFMaterial {
  name: string;
  color: { r: number; g: number; b: number; a: number };
  texture?: string;
}

export interface URDFROS2Control {
  name: string;
  type: 'system' | 'actuator' | 'sensor';
  hardwarePlugin: string;
  joints: Array<{
    name: string;
    commandInterfaces: string[];
    stateInterfaces: string[];
    mimic?: { joint: string; multiplier: number; offset: number };
  }>;
  sensors?: Array<{
    name: string;
    stateInterfaces: string[];
  }>;
  parameters?: Record<string, string>;
}

export interface URDFIsaacSimSensor {
  name: string;
  type: string;
  parentLink: string;
  origin?: URDFOrigin;
  /** Isaac Sim preconfigured sensor name or JSON path */
  isaacSimConfig: string;
}

export interface URDFLoopJoint {
  name: string;
  type: 'spherical';
  link1: { link: string; rpy: [number, number, number]; xyz: [number, number, number] };
  link2: { link: string; rpy: [number, number, number]; xyz: [number, number, number] };
}

export interface URDFFixedFrame {
  name: string;
  parentLink: string;
  origin: URDFOrigin;
}

// =============================================================================
// URDF COMPILER
// =============================================================================

export class URDFCompiler extends CompilerBase {
  protected readonly compilerName = 'URDFCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.URDF;
  }

  private options: Required<URDFCompilerOptions>;
  private lines: string[] = [];
  private indentLevel: number = 0;
  private links: URDFLink[] = [];
  private joints: URDFJoint[] = [];
  private materials: Map<string, URDFMaterial> = new Map();
  private sensors: URDFSensor[] = [];
  private transmissions: URDFTransmission[] = [];
  private ros2Controls: URDFROS2Control[] = [];
  private isaacSimSensors: URDFIsaacSimSensor[] = [];
  private loopJoints: URDFLoopJoint[] = [];
  private fixedFrames: URDFFixedFrame[] = [];

  constructor(options: URDFCompilerOptions = {}) {
    super();
    this.options = {
      robotName: options.robotName || 'HoloScriptRobot',
      includeVisual: options.includeVisual ?? true,
      includeCollision: options.includeCollision ?? true,
      includeInertial: options.includeInertial ?? true,
      defaultMass: options.defaultMass ?? 1.0,
      meshPathPrefix: options.meshPathPrefix || 'package://meshes/',
      includeHoloExtensions: options.includeHoloExtensions ?? true,
      includeGazeboPlugins: options.includeGazeboPlugins ?? false,
      includeROS2Control: options.includeROS2Control ?? false,
      gazeboVersion: options.gazeboVersion ?? 'classic',
      gazeboPhysicsEngine: options.gazeboPhysicsEngine ?? 'ode',
      defaultMu1: options.defaultMu1 ?? 0.5,
      defaultMu2: options.defaultMu2 ?? 0.5,
      defaultKp: options.defaultKp ?? 1e6,
      defaultKd: options.defaultKd ?? 100,
      enableSelfCollision: options.enableSelfCollision ?? false,
      packageName: options.packageName ?? 'holoscript_robot',
      includeIsaacSimExtensions: options.includeIsaacSimExtensions ?? false,
      isaacSimDriveType: options.isaacSimDriveType ?? 'acceleration',
      isaacSimTargetType: options.isaacSimTargetType ?? 'position',
      isaacSimSolverPositionIterations: options.isaacSimSolverPositionIterations ?? 8,
      isaacSimSolverVelocityIterations: options.isaacSimSolverVelocityIterations ?? 4,
    };
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /** Get trait name from either string or object format */
  private getTraitName(trait: string | { name: string }): string {
    return typeof trait === 'string' ? trait : trait.name;
  }

  /** Check if object has a specific trait */
  private hasTrait(obj: HoloObjectDecl, traitName: string): boolean {
    return obj.traits?.some((t) => this.getTraitName(t) === traitName) ?? false;
  }

  /** Get trait configuration object */
  private getTraitConfig(
    obj: HoloObjectDecl,
    traitName: string
  ): Record<string, unknown> | undefined {
    const trait = obj.traits?.find((t) => this.getTraitName(t) === traitName);
    if (!trait) return undefined;
    if (typeof trait === 'string') return {};
    // Return the trait object minus the name
    const { name: _name, ...config } = trait as unknown as { name: string } & Record<
      string,
      unknown
    >;
    return config;
  }

  /** Map HoloScript joint types to URDF joint types */
  private mapJointType(
    holoType: string
  ): 'fixed' | 'revolute' | 'prismatic' | 'continuous' | 'floating' | 'planar' {
    switch (holoType) {
      case 'hinge':
      case 'revolute':
        return 'revolute';
      case 'slider':
      case 'prismatic':
        return 'prismatic';
      case 'ball':
      case 'floating':
        return 'floating';
      case 'fixed':
        return 'fixed';
      case 'continuous':
        return 'continuous';
      case 'planar':
        return 'planar';
      default:
        return 'fixed';
    }
  }

  /** Sanitize name for URDF element names (Isaac Sim compatible) */
  private sanitizeName(name: string): string {
    let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    // Isaac Sim prepends 'a' to names starting with underscore after sanitization
    if (sanitized.startsWith('_')) {
      sanitized = 'a' + sanitized;
    }
    return sanitized;
  }

  /** Escape special characters for XML attribute values */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /** Emit a line with current indent */
  private emit(line: string): void {
    const indent = '  '.repeat(this.indentLevel);
    this.lines.push(indent + line);
  }

  /** Emit empty line */
  private emitBlank(): void {
    this.lines.push('');
  }

  /** Convert HoloValue to string */
  private getStringValue(value: HoloValue): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    return '';
  }

  /** Parse hex color string to RGBA components */
  private parseColor(color: string): { r: number; g: number; b: number; a: number } {
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      return {
        r: parseInt(hex.slice(0, 2), 16) / 255,
        g: parseInt(hex.slice(2, 4), 16) / 255,
        b: parseInt(hex.slice(4, 6), 16) / 255,
        a: hex.length > 6 ? parseInt(hex.slice(6, 8), 16) / 255 : 1.0,
      };
    }
    // Named colors
    const colors: Record<string, { r: number; g: number; b: number; a: number }> = {
      red: { r: 1, g: 0, b: 0, a: 1 },
      green: { r: 0, g: 0.8, b: 0, a: 1 },
      blue: { r: 0, g: 0, b: 1, a: 1 },
      white: { r: 1, g: 1, b: 1, a: 1 },
      black: { r: 0, g: 0, b: 0, a: 1 },
      yellow: { r: 1, g: 1, b: 0, a: 1 },
      cyan: { r: 0, g: 1, b: 1, a: 1 },
      magenta: { r: 1, g: 0, b: 1, a: 1 },
      orange: { r: 1, g: 0.65, b: 0, a: 1 },
      gray: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
      grey: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
    };
    return colors[color.toLowerCase()] || { r: 0.8, g: 0.8, b: 0.8, a: 1 };
  }

  // ===========================================================================
  // EXTRACTION METHODS
  // ===========================================================================

  /** Extract position from object properties */
  private extractPosition(obj: HoloObjectDecl): [number, number, number] {
    const posProp = obj.properties.find((p) => p.key === 'position');
    if (posProp && Array.isArray(posProp.value)) {
      return [
        Number(posProp.value[0]) || 0,
        Number(posProp.value[1]) || 0,
        Number(posProp.value[2]) || 0,
      ];
    }
    return [0, 0, 0];
  }

  /** Extract rotation from object properties (degrees -> radians) */
  private extractRotation(obj: HoloObjectDecl): [number, number, number] {
    const rotProp = obj.properties.find((p) => p.key === 'rotation');
    if (rotProp && Array.isArray(rotProp.value)) {
      return [
        ((Number(rotProp.value[0]) || 0) * Math.PI) / 180,
        ((Number(rotProp.value[1]) || 0) * Math.PI) / 180,
        ((Number(rotProp.value[2]) || 0) * Math.PI) / 180,
      ];
    }
    return [0, 0, 0];
  }

  /** Extract uniform scale value from object properties */
  private extractScale(obj: HoloObjectDecl): number {
    const scaleProp = obj.properties.find((p) => p.key === 'scale');
    if (scaleProp) {
      if (typeof scaleProp.value === 'number') {
        return scaleProp.value;
      }
      if (Array.isArray(scaleProp.value)) {
        return Number(scaleProp.value[0]) || 1;
      }
    }
    return 1;
  }

  /** Extract 3D scale from object properties */
  private extractScale3D(obj: HoloObjectDecl): [number, number, number] {
    const scaleProp = obj.properties.find((p) => p.key === 'scale');
    if (scaleProp) {
      if (typeof scaleProp.value === 'number') {
        return [scaleProp.value, scaleProp.value, scaleProp.value];
      }
      if (Array.isArray(scaleProp.value) && scaleProp.value.length >= 3) {
        return [
          Number(scaleProp.value[0]) || 1,
          Number(scaleProp.value[1]) || 1,
          Number(scaleProp.value[2]) || 1,
        ];
      }
    }
    return [1, 1, 1];
  }

  /** Extract color from object properties */
  private extractColor(obj: HoloObjectDecl): string | undefined {
    const colorProp = obj.properties.find((p) => p.key === 'color');
    return colorProp ? this.getStringValue(colorProp.value) : undefined;
  }

  /** Extract mass from physics property or trait */
  private extractMass(obj: HoloObjectDecl): number | undefined {
    // Try physics property first
    const physicsProp = obj.properties.find((p) => p.key === 'physics');
    if (physicsProp && typeof physicsProp.value === 'object' && !Array.isArray(physicsProp.value)) {
      const massEntry = (physicsProp.value as Record<string, unknown>).mass;
      if (typeof massEntry === 'number') return massEntry;
    }
    // Try mass property directly
    const massProp = obj.properties.find((p) => p.key === 'mass');
    if (massProp && typeof massProp.value === 'number') return massProp.value;
    return undefined;
  }

  /** Extract geometry type and dimensions from object */
  private extractGeometry(obj: HoloObjectDecl): URDFGeometry | undefined {
    const geometryProp = obj.properties.find((p) => p.key === 'geometry');
    if (!geometryProp) return undefined;

    const geometryValue = this.getStringValue(geometryProp.value);
    const scale = this.extractScale(obj);

    switch (geometryValue) {
      case 'cube':
      case 'box':
        return { type: 'box', size: [scale, scale, scale] };
      case 'sphere':
        return { type: 'sphere', radius: scale / 2 };
      case 'cylinder':
        return { type: 'cylinder', radius: scale / 2, length: scale };
      case 'cone':
        // URDF doesn't have cone, approximate as cylinder
        return { type: 'cylinder', radius: scale / 2, length: scale };
      case 'capsule':
        // URDF doesn't have capsule, approximate as cylinder
        return { type: 'cylinder', radius: scale / 3, length: scale };
      case 'plane':
        return { type: 'box', size: [scale, 0.01, scale] };
      default:
        // Custom mesh
        if (
          geometryValue.endsWith('.glb') ||
          geometryValue.endsWith('.dae') ||
          geometryValue.endsWith('.stl') ||
          geometryValue.endsWith('.obj')
        ) {
          const filename = geometryValue
            .replace('.glb', '.stl')
            .replace('.dae', '.stl')
            .replace('.obj', '.stl');
          return {
            type: 'mesh',
            filename: `${this.options.meshPathPrefix}${filename}`,
            scale: this.extractScale3D(obj),
          };
        }
        return { type: 'box', size: [scale, scale, scale] };
    }
  }

  /** Calculate inertia tensor from geometry and mass */
  private calculateInertia(geometry: URDFGeometry | undefined, mass: number): URDFInertial {
    // Default inertia for a 1m cube with given mass
    let ixx = (mass * (1 + 1)) / 12;
    let iyy = (mass * (1 + 1)) / 12;
    let izz = (mass * (1 + 1)) / 12;

    if (geometry) {
      switch (geometry.type) {
        case 'box': {
          const [w, h, d] = geometry.size || [1, 1, 1];
          ixx = (mass * (h * h + d * d)) / 12;
          iyy = (mass * (w * w + d * d)) / 12;
          izz = (mass * (w * w + h * h)) / 12;
          break;
        }
        case 'sphere': {
          const r = geometry.radius || 0.5;
          ixx = iyy = izz = (2 / 5) * mass * r * r;
          break;
        }
        case 'cylinder': {
          const r = geometry.radius || 0.5;
          const l = geometry.length || 1;
          ixx = iyy = (mass * (3 * r * r + l * l)) / 12;
          izz = (mass * r * r) / 2;
          break;
        }
      }
    }

    return {
      mass,
      inertia: { ixx, ixy: 0, ixz: 0, iyy, iyz: 0, izz },
    };
  }

  // ===========================================================================
  // COMPILATION
  // ===========================================================================

  /**
   * Compile HoloScript composition to URDF XML
   */
  compile(composition: HoloComposition, agentToken?: string, outputPath?: string): string {
    if (agentToken) {
      this.validateCompilerAccess(agentToken, outputPath);
    }
    this.lines = [];
    this.links = [];
    this.joints = [];
    this.materials.clear();
    this.sensors = [];
    this.transmissions = [];
    this.ros2Controls = [];
    this.isaacSimSensors = [];
    this.loopJoints = [];
    this.fixedFrames = [];
    this.indentLevel = 0;

    // Extract links, joints, sensors, etc. from composition
    this.extractFromComposition(composition);

    // Generate URDF XML
    this.emit('<?xml version="1.0"?>');
    this.emit(`<!-- Auto-generated by HoloScript URDFCompiler v2.0 -->`);
    this.emit(
      `<!-- Source: composition "${this.escapeStringValue(composition.name as string, 'TypeScript')}" -->`
    );
    this.emit(`<!-- Target: ROS 2 / Gazebo / MoveIt 2 / RViz2 -->`);
    this.emitBlank();
    this.emit(`<robot name="${this.escapeXml(this.options.robotName)}">`);
    this.indentLevel++;

    // Materials
    this.emitMaterials();

    // Links
    for (const link of this.links) {
      this.emitLink(link);
    }

    // Joints
    for (const joint of this.joints) {
      this.emitJoint(joint);
    }

    // Transmissions (for ros_control)
    if (this.transmissions.length > 0) {
      this.emitBlank();
      this.emit('<!-- Transmissions -->');
      for (const transmission of this.transmissions) {
        this.emitTransmission(transmission);
      }
    }

    // ROS 2 Control hardware interface
    if (this.options.includeROS2Control && this.ros2Controls.length > 0) {
      this.emitBlank();
      this.emit('<!-- ROS 2 Control Hardware Interface -->');
      for (const control of this.ros2Controls) {
        this.emitROS2Control(control);
      }
    }

    // Gazebo plugins
    if (this.options.includeGazeboPlugins) {
      this.emitBlank();
      this.emitGazeboPlugins(composition);
    }

    // Sensor Gazebo tags
    if (this.sensors.length > 0 && this.options.includeGazeboPlugins) {
      for (const sensor of this.sensors) {
        this.emitGazeboSensor(sensor);
      }
    }

    // Isaac Sim extensions
    if (this.options.includeIsaacSimExtensions) {
      this.emitIsaacSimExtensions();
    }

    // HoloScript extensions as comments
    if (this.options.includeHoloExtensions) {
      this.emitHoloExtensions(composition);
    }

    // v4.2: Domain Blocks (materials as URDF materials, physics as links/joints, audio/weather as comments)
    this.emitDomainBlocks(composition);

    this.indentLevel--;
    this.emit('</robot>');

    return this.lines.join('\n');
  }

  private emitDomainBlocks(composition: HoloComposition): void {
    const domainBlocks = composition.domainBlocks ?? [];
    if (domainBlocks.length === 0) return;

    this.emitBlank();
    this.emit('<!-- v4.2 Domain Blocks -->');

    const compiled = compileDomainBlocks(
      domainBlocks,
      {
        material: (block) => {
          const mat = compileMaterialBlock(block);
          const lines: string[] = [];
          lines.push(
            `<material name="${this.escapeStringValue(mat.name as string, 'TypeScript')}">`
          );
          if (mat.baseColor) {
            const h = mat.baseColor.replace('#', '');
            const r = (parseInt(h.substring(0, 2), 16) / 255).toFixed(3);
            const g = (parseInt(h.substring(2, 4), 16) / 255).toFixed(3);
            const b = (parseInt(h.substring(4, 6), 16) / 255).toFixed(3);
            lines.push(`  <color rgba="${r} ${g} ${b} ${mat.opacity ?? 1}"/>`);
          }
          for (const [mapType, path] of Object.entries(mat.textureMaps)) {
            if (mapType === 'albedo_map') {
              lines.push(`  <texture filename="${path}"/>`);
            }
          }
          lines.push('</material>');
          return lines.join('\n');
        },
        physics: (block) => {
          const phys = compilePhysicsBlock(block);
          return physicsToURDF(phys);
        },
        audio: (block) => {
          const audio = compileAudioSourceBlock(block);
          return `<!-- Audio: ${this.escapeStringValue(audio.name as string, 'TypeScript')} (${audio.keyword}) clip="${audio.properties.clip || ''}" volume="${audio.properties.volume ?? 1}" -->`;
        },
        weather: (block) => {
          const weather = compileWeatherBlock(block);
          return `<!-- Weather: ${weather.keyword} "${weather.name || ''}" layers: ${weather.layers.map((l) => l.type).join(', ')} -->`;
        },
      },
      (block) =>
        `<!-- Domain block: ${block.domain}/${block.keyword} "${this.escapeStringValue(block.name as string, 'TypeScript')}" -->`
    );

    for (const output of compiled) {
      for (const line of output.split('\n')) {
        this.emit(line);
      }
    }
  }

  // ===========================================================================
  // EXTRACTION FROM COMPOSITION
  // ===========================================================================

  private extractFromComposition(composition: HoloComposition): void {
    // Add default material
    this.materials.set('default', {
      name: 'default',
      color: { r: 0.8, g: 0.8, b: 0.8, a: 1.0 },
    });

    // Create base link
    this.links.push({
      name: 'base_link',
      visual: undefined,
      collision: undefined,
      inertial: {
        mass: 0.001,
        inertia: { ixx: 0.001, ixy: 0, ixz: 0, iyy: 0.001, iyz: 0, izz: 0.001 },
      },
    });

    // Track actuated joints for ros2_control generation
    const actuatedJoints: Array<{
      name: string;
      type: string;
      commandInterfaces: string[];
      stateInterfaces: string[];
      mimic?: { joint: string; multiplier: number; offset: number };
    }> = [];

    // Process objects
    if (composition.objects) {
      for (const obj of composition.objects) {
        this.processObject(obj, 'base_link', actuatedJoints);
      }
    }

    // Process spatial groups
    if (composition.spatialGroups) {
      for (const group of composition.spatialGroups) {
        this.processSpatialGroup(group, 'base_link', actuatedJoints);
      }
    }

    // Build ros2_control if we have actuated joints
    if (this.options.includeROS2Control && actuatedJoints.length > 0) {
      this.ros2Controls.push({
        name: `${this.sanitizeName(this.options.robotName)}_ros2_control`,
        type: 'system',
        hardwarePlugin: 'gz_ros2_control/GazeboSimSystem',
        joints: actuatedJoints,
      });
    }
  }

  private processObject(
    obj: HoloObjectDecl,
    parentLink: string,
    actuatedJoints: Array<{
      name: string;
      type: string;
      commandInterfaces: string[];
      stateInterfaces: string[];
      mimic?: { joint: string; multiplier: number; offset: number };
    }>
  ): void {
    const linkName = this.sanitizeName(obj.name);
    const hasPhysics = this.hasTrait(obj, 'physics') || this.hasTrait(obj, 'rigid');
    const hasCollider = this.hasTrait(obj, 'collidable') || this.hasTrait(obj, 'trigger');
    const jointConfig = this.getTraitConfig(obj, 'joint');
    const sensorConfig = this.getTraitConfig(obj, 'sensor');
    const actuatorConfig = this.getTraitConfig(obj, 'actuator');

    // Get geometry
    const geometry = this.extractGeometry(obj);
    const position = this.extractPosition(obj);
    const rotation = this.extractRotation(obj);
    const color = this.extractColor(obj);

    // Create material if color specified with unique name (Isaac Sim merges same-name materials)
    if (color) {
      const colorHash = color.replace(/[^a-zA-Z0-9]/g, '');
      const matName = `material_${linkName}_${colorHash}`;
      const rgba = this.parseColor(color);
      this.materials.set(matName, {
        name: matName,
        color: rgba,
      });
    }

    // Create link
    const link: URDFLink = {
      name: linkName,
      origin: {
        xyz: position,
        rpy: rotation,
      },
    };

    if (this.options.includeVisual && geometry) {
      link.visual = { ...geometry, color };
    }

    if (this.options.includeCollision && (hasCollider || hasPhysics) && geometry) {
      link.collision = geometry;
    }

    if (this.options.includeInertial) {
      const mass = this.extractMass(obj) || this.options.defaultMass;
      link.inertial = this.calculateInertia(geometry, mass);
    }

    this.links.push(link);

    // Create joint to parent - use @joint trait config if available
    const joint: URDFJoint = {
      name: `${parentLink}_to_${linkName}_joint`,
      type: 'fixed',
      parent: parentLink,
      child: linkName,
      origin: {
        xyz: position,
        rpy: rotation,
      },
    };

    // Apply @joint trait configuration
    if (jointConfig) {
      // Map joint type
      if (jointConfig.jointType) {
        joint.type = this.mapJointType(jointConfig.jointType as string);
      }

      // Extract axis
      if (jointConfig.axis) {
        const axis = jointConfig.axis as { x?: number; y?: number; z?: number };
        joint.axis = [axis[0] ?? 0, axis[1] ?? 0, axis[2] ?? 1];
      }

      // Extract limits (for revolute/prismatic joints)
      if (jointConfig.limits && (joint.type === 'revolute' || joint.type === 'prismatic')) {
        const limitsConfig = jointConfig.limits as {
          min?: number;
          max?: number;
          effort?: number;
          velocity?: number;
        };
        joint.limits = {
          lower:
            joint.type === 'revolute'
              ? ((limitsConfig.min ?? -180) * Math.PI) / 180
              : (limitsConfig.min ?? -1),
          upper:
            joint.type === 'revolute'
              ? ((limitsConfig.max ?? 180) * Math.PI) / 180
              : (limitsConfig.max ?? 1),
          effort: limitsConfig.effort ?? 100,
          velocity: limitsConfig.velocity ?? 1,
        };
      }

      // Extract damping
      if (jointConfig.damping !== undefined) {
        joint.dynamics = {
          damping: jointConfig.damping as number,
          friction: (jointConfig.friction as number) ?? 0,
        };
      }

      // Extract mimic configuration
      if (jointConfig.mimic) {
        const mimicConfig = jointConfig.mimic as {
          joint: string;
          multiplier?: number;
          offset?: number;
        };
        joint.mimic = {
          joint: mimicConfig.joint,
          multiplier: mimicConfig.multiplier ?? 1.0,
          offset: mimicConfig.offset ?? 0.0,
        };
      }

      // Safety controller
      if (jointConfig.safetyController) {
        const safety = jointConfig.safetyController as {
          softLowerLimit?: number;
          softUpperLimit?: number;
          kPosition?: number;
          kVelocity?: number;
        };
        joint.safetyController = {
          softLowerLimit: safety.softLowerLimit ?? 0,
          softUpperLimit: safety.softUpperLimit ?? 0,
          kPosition: safety.kPosition ?? 100,
          kVelocity: safety.kVelocity ?? 10,
        };
      }

      // Update parent if connectedBody is specified
      if (jointConfig.connectedBody) {
        const newParent = this.sanitizeName(jointConfig.connectedBody as string);
        joint.parent = newParent;
        joint.name = `${newParent}_to_${linkName}_joint`;
      }

      // Track actuated joints for ros2_control
      if (joint.type !== 'fixed' && this.options.includeROS2Control) {
        const interfaces = this.getJointInterfaces(joint.type);
        const actuatedEntry: {
          name: string;
          type: string;
          commandInterfaces: string[];
          stateInterfaces: string[];
          mimic?: { joint: string; multiplier: number; offset: number };
        } = {
          name: joint.name,
          type: joint.type,
          ...interfaces,
        };
        if (joint.mimic) {
          actuatedEntry.mimic = joint.mimic;
        }
        actuatedJoints.push(actuatedEntry);
      }
    }

    this.joints.push(joint);

    // Process @sensor trait
    if (sensorConfig) {
      this.processSensorTrait(sensorConfig, linkName);
    }

    // Process @actuator trait -> transmission
    if (actuatorConfig) {
      this.processActuatorTrait(actuatorConfig, joint.name, linkName);
    }
  }

  private processSpatialGroup(
    group: HoloSpatialGroup,
    parentLink: string,
    actuatedJoints: Array<{
      name: string;
      type: string;
      commandInterfaces: string[];
      stateInterfaces: string[];
      mimic?: { joint: string; multiplier: number; offset: number };
    }>
  ): void {
    const groupLinkName = this.sanitizeName(group.name);

    // Create group link
    this.links.push({
      name: groupLinkName,
      inertial: {
        mass: 0.001,
        inertia: { ixx: 0.001, ixy: 0, ixz: 0, iyy: 0.001, iyz: 0, izz: 0.001 },
      },
    });

    // Joint to parent
    this.joints.push({
      name: `${parentLink}_to_${groupLinkName}_joint`,
      type: 'fixed',
      parent: parentLink,
      child: groupLinkName,
    });

    // Process objects in group
    if (group.objects) {
      for (const obj of group.objects) {
        this.processObject(obj, groupLinkName, actuatedJoints);
      }
    }
  }

  /** Process @sensor trait into sensor definition */
  private processSensorTrait(config: Record<string, unknown>, parentLink: string): void {
    const sensorType = (config.sensorType || config.type || 'camera') as string;
    const name = (config.name || `${parentLink}_${sensorType}_sensor`) as string;

    const sensor: URDFSensor = {
      name: this.sanitizeName(name),
      type: this.mapSensorType(sensorType),
      parentLink,
      updateRate: (config.updateRate as number) ?? 30,
      topicName: (config.topic as string) ?? `/${this.sanitizeName(name)}`,
      frameName: (config.frameName as string) ?? `${parentLink}_${sensorType}_frame`,
    };

    // Camera config
    if (sensor.type === 'camera' || sensor.type === 'depth_camera') {
      sensor.camera = {
        horizontalFov: (config.fov as number) ?? 1.3962634,
        imageWidth: (config.width as number) ?? 640,
        imageHeight: (config.height as number) ?? 480,
        clipNear: (config.clipNear as number) ?? 0.1,
        clipFar: (config.clipFar as number) ?? 100,
        format: (config.format as string) ?? 'R8G8B8',
      };
    }

    // Lidar config
    if (sensor.type === 'lidar' || sensor.type === 'ray') {
      sensor.lidar = {
        samples: (config.samples as number) ?? 360,
        resolution: (config.resolution as number) ?? 1.0,
        minAngle: (config.minAngle as number) ?? -Math.PI,
        maxAngle: (config.maxAngle as number) ?? Math.PI,
        minRange: (config.minRange as number) ?? 0.1,
        maxRange: (config.maxRange as number) ?? 30.0,
      };
    }

    // IMU config
    if (sensor.type === 'imu') {
      sensor.imu = {
        gaussianNoise: (config.noise as number) ?? 0.0,
      };
    }

    this.sensors.push(sensor);
  }

  /** Map sensor type strings to URDF sensor types */
  private mapSensorType(
    type: string
  ): 'camera' | 'imu' | 'lidar' | 'ray' | 'force_torque' | 'contact' | 'depth_camera' | 'gps' {
    switch (type.toLowerCase()) {
      case 'camera':
      case 'rgb_camera':
        return 'camera';
      case 'depth':
      case 'depth_camera':
      case 'rgbd':
        return 'depth_camera';
      case 'imu':
        return 'imu';
      case 'lidar':
      case 'laser':
        return 'lidar';
      case 'ray':
        return 'ray';
      case 'force_torque':
      case 'ft':
        return 'force_torque';
      case 'contact':
      case 'bumper':
        return 'contact';
      case 'gps':
      case 'navsat':
        return 'gps';
      default:
        return 'camera';
    }
  }

  /** Process @actuator trait into transmission definition */
  private processActuatorTrait(
    config: Record<string, unknown>,
    jointName: string,
    linkName: string
  ): void {
    const transmission: URDFTransmission = {
      name: `${linkName}_transmission`,
      type: (config.transmissionType as string) ?? 'transmission_interface/SimpleTransmission',
      jointName,
      actuatorName: (config.actuatorName as string) ?? `${linkName}_actuator`,
      hardwareInterface:
        (config.hardwareInterface as string) ?? 'hardware_interface/PositionJointInterface',
      mechanicalReduction: config.mechanicalReduction as number | undefined,
    };
    this.transmissions.push(transmission);
  }

  /** Get command and state interfaces for ros2_control based on joint type */
  private getJointInterfaces(jointType: string): {
    commandInterfaces: string[];
    stateInterfaces: string[];
  } {
    switch (jointType) {
      case 'revolute':
      case 'continuous':
        return {
          commandInterfaces: ['position'],
          stateInterfaces: ['position', 'velocity'],
        };
      case 'prismatic':
        return {
          commandInterfaces: ['position'],
          stateInterfaces: ['position', 'velocity'],
        };
      default:
        return {
          commandInterfaces: ['position'],
          stateInterfaces: ['position'],
        };
    }
  }

  // ===========================================================================
  // EMISSION METHODS
  // ===========================================================================

  /** Emit all materials */
  private emitMaterials(): void {
    this.emit('<!-- Materials -->');
    for (const [_key, mat] of this.materials) {
      this.emit(`<material name="${this.escapeStringValue(mat.name as string, 'TypeScript')}">`);
      this.indentLevel++;
      this.emit(`<color rgba="${mat.color.r} ${mat.color.g} ${mat.color.b} ${mat.color.a}"/>`);
      if (mat.texture) {
        this.emit(`<texture filename="${mat.texture}"/>`);
      }
      this.indentLevel--;
      this.emit('</material>');
    }
    this.emitBlank();
  }

  /** Emit a single link element */
  private emitLink(link: URDFLink): void {
    this.emit(`<link name="${this.escapeStringValue(link.name as string, 'TypeScript')}">`);
    this.indentLevel++;

    // Visual
    if (link.visual) {
      this.emit('<visual>');
      this.indentLevel++;
      if (link.origin) {
        this.emitOrigin(link.origin);
      }
      this.emitGeometry(link.visual);
      // Use per-link material if color was specified, otherwise default
      if (link.visual.color) {
        const colorHash = link.visual.color.replace(/[^a-zA-Z0-9]/g, '');
        const matName = `material_${this.escapeStringValue(link.name as string, 'TypeScript')}_${colorHash}`;
        if (this.materials.has(matName)) {
          this.emit(`<material name="${matName}"/>`);
        } else {
          this.emit('<material name="default"/>');
        }
      } else {
        this.emit('<material name="default"/>');
      }
      this.indentLevel--;
      this.emit('</visual>');
    }

    // Collision
    if (link.collision) {
      this.emit('<collision>');
      this.indentLevel++;
      if (link.origin) {
        this.emitOrigin(link.origin);
      }
      this.emitGeometry(link.collision);
      this.indentLevel--;
      this.emit('</collision>');
    }

    // Inertial
    if (link.inertial) {
      this.emit('<inertial>');
      this.indentLevel++;
      if (link.inertial.origin) {
        this.emitOrigin(link.inertial.origin);
      }
      this.emit(`<mass value="${link.inertial.mass}"/>`);
      const i = link.inertial.inertia;
      this.emit(
        `<inertia ixx="${i.ixx.toFixed(6)}" ixy="${i.ixy}" ixz="${i.ixz}" iyy="${i.iyy.toFixed(6)}" iyz="${i.iyz}" izz="${i.izz.toFixed(6)}"/>`
      );
      this.indentLevel--;
      this.emit('</inertial>');
    }

    this.indentLevel--;
    this.emit('</link>');
    this.emitBlank();
  }

  /** Emit a single joint element */
  private emitJoint(joint: URDFJoint): void {
    this.emit(
      `<joint name="${this.escapeStringValue(joint.name as string, 'TypeScript')}" type="${joint.type}">`
    );
    this.indentLevel++;

    this.emit(`<parent link="${joint.parent}"/>`);
    this.emit(`<child link="${joint.child}"/>`);

    if (joint.origin) {
      this.emitOrigin(joint.origin);
    }

    if (joint.axis) {
      this.emit(`<axis xyz="${joint.axis.join(' ')}"/>`);
    }

    if (joint.limits) {
      this.emit(
        `<limit lower="${joint.limits.lower}" upper="${joint.limits.upper}" effort="${joint.limits.effort}" velocity="${joint.limits.velocity}"/>`
      );
    }

    if (joint.dynamics) {
      this.emit(
        `<dynamics damping="${joint.dynamics.damping}" friction="${joint.dynamics.friction}"/>`
      );
    }

    if (joint.mimic) {
      this.emit(
        `<mimic joint="${joint.mimic.joint}" multiplier="${joint.mimic.multiplier}" offset="${joint.mimic.offset}"/>`
      );
    }

    if (joint.safetyController) {
      this.emit(
        `<safety_controller soft_lower_limit="${joint.safetyController.softLowerLimit}" soft_upper_limit="${joint.safetyController.softUpperLimit}" k_position="${joint.safetyController.kPosition}" k_velocity="${joint.safetyController.kVelocity}"/>`
      );
    }

    this.indentLevel--;
    this.emit('</joint>');
    this.emitBlank();
  }

  /** Emit geometry element */
  private emitGeometry(geom: URDFGeometry): void {
    this.emit('<geometry>');
    this.indentLevel++;

    switch (geom.type) {
      case 'box':
        this.emit(`<box size="${(geom.size || [1, 1, 1]).join(' ')}"/>`);
        break;
      case 'sphere':
        this.emit(`<sphere radius="${geom.radius || 0.5}"/>`);
        break;
      case 'cylinder':
        this.emit(`<cylinder radius="${geom.radius || 0.5}" length="${geom.length || 1}"/>`);
        break;
      case 'mesh':
        if (geom.scale && (geom.scale[0] !== 1 || geom.scale[1] !== 1 || geom.scale[2] !== 1)) {
          this.emit(`<mesh filename="${geom.filename}" scale="${geom.scale.join(' ')}"/>`);
        } else {
          this.emit(`<mesh filename="${geom.filename}"/>`);
        }
        break;
    }

    this.indentLevel--;
    this.emit('</geometry>');
  }

  /** Emit origin element */
  private emitOrigin(origin: URDFOrigin): void {
    this.emit(
      `<origin xyz="${origin.xyz.join(' ')}" rpy="${origin.rpy.map((v) => v.toFixed(6)).join(' ')}"/>`
    );
  }

  /** Emit transmission element (for ros_control) */
  private emitTransmission(trans: URDFTransmission): void {
    this.emit(
      `<transmission name="${this.escapeStringValue(trans.name as string, 'TypeScript')}">`
    );
    this.indentLevel++;
    this.emit(`<type>${trans.type}</type>`);
    this.emit(`<joint name="${trans.jointName}">`);
    this.indentLevel++;
    this.emit(`<hardwareInterface>${trans.hardwareInterface}</hardwareInterface>`);
    this.indentLevel--;
    this.emit('</joint>');
    this.emit(`<actuator name="${trans.actuatorName}">`);
    this.indentLevel++;
    this.emit(`<hardwareInterface>${trans.hardwareInterface}</hardwareInterface>`);
    if (trans.mechanicalReduction !== undefined) {
      this.emit(`<mechanicalReduction>${trans.mechanicalReduction}</mechanicalReduction>`);
    }
    this.indentLevel--;
    this.emit('</actuator>');
    this.indentLevel--;
    this.emit('</transmission>');
    this.emitBlank();
  }

  /** Emit ros2_control hardware interface block */
  private emitROS2Control(control: URDFROS2Control): void {
    this.emit(
      `<ros2_control name="${this.escapeStringValue(control.name as string, 'TypeScript')}" type="${control.type}">`
    );
    this.indentLevel++;

    // Hardware plugin
    this.emit('<hardware>');
    this.indentLevel++;
    this.emit(`<plugin>${control.hardwarePlugin}</plugin>`);
    if (control.parameters) {
      for (const [key, value] of Object.entries(control.parameters)) {
        this.emit(`<param name="${key}">${value}</param>`);
      }
    }
    this.indentLevel--;
    this.emit('</hardware>');

    // Joints
    for (const joint of control.joints) {
      this.emit(`<joint name="${this.escapeStringValue(joint.name as string, 'TypeScript')}">`);
      this.indentLevel++;
      for (const iface of joint.commandInterfaces) {
        this.emit(`<command_interface name="${iface}"/>`);
      }
      for (const iface of joint.stateInterfaces) {
        this.emit(`<state_interface name="${iface}"/>`);
      }
      if (joint.mimic) {
        this.emit(`<param name="mimic">${joint.mimic.joint}</param>`);
        this.emit(`<param name="multiplier">${joint.mimic.multiplier}</param>`);
      }
      this.indentLevel--;
      this.emit('</joint>');
    }

    // Sensors
    if (control.sensors) {
      for (const sensor of control.sensors) {
        this.emit(`<sensor name="${this.escapeStringValue(sensor.name as string, 'TypeScript')}">`);
        this.indentLevel++;
        for (const iface of sensor.stateInterfaces) {
          this.emit(`<state_interface name="${iface}"/>`);
        }
        this.indentLevel--;
        this.emit('</sensor>');
      }
    }

    this.indentLevel--;
    this.emit('</ros2_control>');
    this.emitBlank();
  }

  /** Emit Gazebo plugin tags */
  private emitGazeboPlugins(composition: HoloComposition): void {
    this.emit('<!-- Gazebo Plugins -->');

    // Global Gazebo settings
    this.emit('<gazebo>');
    this.indentLevel++;

    // Self-collision
    if (this.options.enableSelfCollision) {
      this.emit('<self_collide>true</self_collide>');
    }

    // ros2_control Gazebo plugin (if we have actuated joints)
    if (this.options.includeROS2Control && this.ros2Controls.length > 0) {
      this.emit('<plugin filename="gz_ros2_control-system" name="gz_ros2_control">');
      this.indentLevel++;
      this.emit(
        '<parameters>$(find ' + this.options.packageName + ')/config/controllers.yaml</parameters>'
      );
      this.indentLevel--;
      this.emit('</plugin>');
    }

    this.indentLevel--;
    this.emit('</gazebo>');
    this.emitBlank();

    // Per-link Gazebo material and friction settings
    for (const link of this.links) {
      if (link.name === 'base_link' && !link.visual) continue;

      const hasSpecialConfig = link.visual?.color || link.collision;
      if (hasSpecialConfig) {
        this.emit(
          `<gazebo reference="${this.escapeStringValue(link.name as string, 'TypeScript')}">`
        );
        this.indentLevel++;

        // Gazebo material color
        if (link.visual?.color) {
          const rgba = this.parseColor(link.visual.color);
          this.emit(`<material>Gazebo/${this.getGazeboColorName(rgba)}</material>`);
        }

        // Friction coefficients for collision links
        if (link.collision) {
          this.emit(`<mu1>${this.options.defaultMu1}</mu1>`);
          this.emit(`<mu2>${this.options.defaultMu2}</mu2>`);
          this.emit(`<kp>${this.options.defaultKp}</kp>`);
          this.emit(`<kd>${this.options.defaultKd}</kd>`);
        }

        this.indentLevel--;
        this.emit('</gazebo>');
        this.emitBlank();
      }
    }
  }

  /** Map RGBA to closest Gazebo built-in color name */
  private getGazeboColorName(rgba: { r: number; g: number; b: number; a: number }): string {
    // Simple heuristic mapping
    if (rgba.r > 0.8 && rgba.g < 0.3 && rgba.b < 0.3) return 'Red';
    if (rgba.r < 0.3 && rgba.g > 0.6 && rgba.b < 0.3) return 'Green';
    if (rgba.r < 0.3 && rgba.g < 0.3 && rgba.b > 0.8) return 'Blue';
    if (rgba.r > 0.8 && rgba.g > 0.8 && rgba.b < 0.3) return 'Yellow';
    if (rgba.r < 0.3 && rgba.g > 0.8 && rgba.b > 0.8) return 'Turquoise';
    if (rgba.r > 0.8 && rgba.g < 0.3 && rgba.b > 0.8) return 'Purple';
    if (rgba.r > 0.8 && rgba.g > 0.5 && rgba.b < 0.2) return 'Orange';
    if (rgba.r > 0.9 && rgba.g > 0.9 && rgba.b > 0.9) return 'White';
    if (rgba.r < 0.1 && rgba.g < 0.1 && rgba.b < 0.1) return 'Black';
    if (rgba.r > 0.4 && rgba.r < 0.6 && rgba.g > 0.4 && rgba.g < 0.6) return 'Grey';
    return 'DarkGrey';
  }

  /** Emit Gazebo sensor tag for a specific sensor */
  private emitGazeboSensor(sensor: URDFSensor): void {
    this.emit(`<gazebo reference="${sensor.parentLink}">`);
    this.indentLevel++;

    this.emit(
      `<sensor name="${this.escapeStringValue(sensor.name as string, 'TypeScript')}" type="${this.getGazeboSensorType(sensor.type)}">`
    );
    this.indentLevel++;

    this.emit(`<always_on>true</always_on>`);
    this.emit(`<update_rate>${sensor.updateRate ?? 30}</update_rate>`);
    this.emit(`<visualize>true</visualize>`);

    // Camera sensor
    if ((sensor.type === 'camera' || sensor.type === 'depth_camera') && sensor.camera) {
      this.emit('<camera>');
      this.indentLevel++;
      this.emit(`<horizontal_fov>${sensor.camera.horizontalFov}</horizontal_fov>`);
      this.emit('<image>');
      this.indentLevel++;
      this.emit(`<width>${sensor.camera.imageWidth}</width>`);
      this.emit(`<height>${sensor.camera.imageHeight}</height>`);
      this.emit(`<format>${sensor.camera.format || 'R8G8B8'}</format>`);
      this.indentLevel--;
      this.emit('</image>');
      this.emit('<clip>');
      this.indentLevel++;
      this.emit(`<near>${sensor.camera.clipNear}</near>`);
      this.emit(`<far>${sensor.camera.clipFar}</far>`);
      this.indentLevel--;
      this.emit('</clip>');
      this.indentLevel--;
      this.emit('</camera>');

      // ROS 2 plugin
      this.emit('<plugin name="camera_controller" filename="libgazebo_ros_camera.so">');
      this.indentLevel++;
      this.emit(`<frame_name>${sensor.frameName}</frame_name>`);
      this.indentLevel--;
      this.emit('</plugin>');
    }

    // Lidar/Ray sensor
    if ((sensor.type === 'lidar' || sensor.type === 'ray') && sensor.lidar) {
      this.emit('<ray>');
      this.indentLevel++;
      this.emit('<scan>');
      this.indentLevel++;
      this.emit('<horizontal>');
      this.indentLevel++;
      this.emit(`<samples>${sensor.lidar.samples}</samples>`);
      this.emit(`<resolution>${sensor.lidar.resolution}</resolution>`);
      this.emit(`<min_angle>${sensor.lidar.minAngle}</min_angle>`);
      this.emit(`<max_angle>${sensor.lidar.maxAngle}</max_angle>`);
      this.indentLevel--;
      this.emit('</horizontal>');
      this.indentLevel--;
      this.emit('</scan>');
      this.emit('<range>');
      this.indentLevel++;
      this.emit(`<min>${sensor.lidar.minRange}</min>`);
      this.emit(`<max>${sensor.lidar.maxRange}</max>`);
      this.emit('<resolution>0.01</resolution>');
      this.indentLevel--;
      this.emit('</range>');
      this.indentLevel--;
      this.emit('</ray>');

      // ROS 2 plugin
      this.emit('<plugin name="laser_controller" filename="libgazebo_ros_ray_sensor.so">');
      this.indentLevel++;
      this.emit(`<ros><remapping>~/out:=${sensor.topicName || '/scan'}</remapping></ros>`);
      this.emit('<output_type>sensor_msgs/LaserScan</output_type>');
      this.emit(`<frame_name>${sensor.frameName}</frame_name>`);
      this.indentLevel--;
      this.emit('</plugin>');
    }

    // IMU sensor
    if (sensor.type === 'imu') {
      this.emit('<imu>');
      this.indentLevel++;
      if (sensor.imu?.gaussianNoise) {
        this.emit(
          `<noise><type>gaussian</type><stddev>${sensor.imu.gaussianNoise}</stddev></noise>`
        );
      }
      this.indentLevel--;
      this.emit('</imu>');

      // ROS 2 plugin
      this.emit('<plugin name="imu_controller" filename="libgazebo_ros_imu_sensor.so">');
      this.indentLevel++;
      this.emit(`<ros><remapping>~/out:=${sensor.topicName || '/imu/data'}</remapping></ros>`);
      this.emit(`<frame_name>${sensor.frameName}</frame_name>`);
      this.indentLevel--;
      this.emit('</plugin>');
    }

    // Force-torque sensor
    if (sensor.type === 'force_torque') {
      this.emit('<force_torque>');
      this.indentLevel++;
      this.emit('<measure_direction>child_to_parent</measure_direction>');
      this.indentLevel--;
      this.emit('</force_torque>');
    }

    // Contact sensor
    if (sensor.type === 'contact') {
      this.emit('<contact>');
      this.indentLevel++;
      this.emit(`<collision>${sensor.parentLink}_collision</collision>`);
      this.indentLevel--;
      this.emit('</contact>');

      this.emit('<plugin name="bumper_controller" filename="libgazebo_ros_bumper.so">');
      this.indentLevel++;
      this.emit(
        `<ros><remapping>bumper_states:=${sensor.topicName || '/bumper'}</remapping></ros>`
      );
      this.emit(`<frame_name>${sensor.frameName}</frame_name>`);
      this.indentLevel--;
      this.emit('</plugin>');
    }

    // GPS sensor
    if (sensor.type === 'gps') {
      this.emit('<plugin name="gps_controller" filename="libgazebo_ros_gps_sensor.so">');
      this.indentLevel++;
      this.emit(`<ros><remapping>~/out:=${sensor.topicName || '/gps/fix'}</remapping></ros>`);
      this.emit(`<frame_name>${sensor.frameName}</frame_name>`);
      this.indentLevel--;
      this.emit('</plugin>');
    }

    this.indentLevel--;
    this.emit('</sensor>');

    this.indentLevel--;
    this.emit('</gazebo>');
    this.emitBlank();
  }

  /** Map sensor type to Gazebo sensor type string */
  private getGazeboSensorType(type: string): string {
    switch (type) {
      case 'camera':
        return 'camera';
      case 'depth_camera':
        return 'depth';
      case 'imu':
        return 'imu';
      case 'lidar':
      case 'ray':
        return 'ray';
      case 'force_torque':
        return 'force_torque';
      case 'contact':
        return 'contact';
      case 'gps':
        return 'gps';
      default:
        return 'camera';
    }
  }

  /** Emit HoloScript extension comments */
  private emitHoloExtensions(composition: HoloComposition): void {
    this.emitBlank();
    this.emit('<!-- HoloScript Extensions -->');
    this.emit(
      `<!-- Original composition: "${this.escapeStringValue(composition.name as string, 'TypeScript')}" -->`
    );
    // Access skybox from environment properties - handle both array and object formats
    const skybox = this.getEnvProp(composition, 'skybox');
    if (skybox && typeof skybox === 'string') {
      this.emit(`<!-- Environment skybox: ${skybox} -->`);
    }
    if (composition.templates && composition.templates.length > 0) {
      this.emit(`<!-- Templates: ${composition.templates.map((t) => t.name).join(', ')} -->`);
    }
    // List sensors if any
    if (this.sensors.length > 0) {
      this.emit(
        `<!-- Sensors: ${this.sensors.map((s) => `${this.escapeStringValue(s.name as string, 'TypeScript')} (${s.type})`).join(', ')} -->`
      );
    }
  }

  /** Helper to get environment property from either array or object format */
  private getEnvProp(
    composition: HoloComposition,
    key: string
  ): string | number | boolean | null | undefined {
    const env = composition.environment;
    if (!env) return undefined;

    // Try array format: properties: [{ key: 'skybox', value: 'night' }]
    if (Array.isArray(env.properties)) {
      const prop = env.properties.find((p: { key: string; value: unknown }) => p.key === key);
      if (prop) return prop.value as string | number | boolean | null;
    }

    // Try object format: { skybox: 'night' } directly on environment
    if (key in env) {
      return (env as unknown as Record<string, unknown>)[key] as string | number | boolean | null;
    }

    // Try object inside properties: properties: { skybox: 'night' }
    if (env.properties && typeof env.properties === 'object' && !Array.isArray(env.properties)) {
      const props = env.properties as Record<string, unknown>;
      if (key in props) {
        return props[key] as string | number | boolean | null;
      }
    }

    return undefined;
  }

  // ===========================================================================
  // ISAAC SIM EXTENSION EMISSION
  // ===========================================================================

  /** Emit Isaac Sim sensor extension tag */
  private emitIsaacSimSensor(sensor: URDFIsaacSimSensor): void {
    this.emit(
      `<sensor name="${this.escapeStringValue(sensor.name as string, 'TypeScript')}" type="${sensor.type}" isaac_sim_config="${sensor.isaacSimConfig}">`
    );
    this.indentLevel++;
    this.emit(`<parent link="${sensor.parentLink}"/>`);
    if (sensor.origin) {
      this.emitOrigin(sensor.origin);
    }
    this.indentLevel--;
    this.emit('</sensor>');
  }

  /** Emit Isaac Sim loop joint extension tag */
  private emitLoopJoint(loopJoint: URDFLoopJoint): void {
    this.emit(
      `<loop_joint name="${this.escapeStringValue(loopJoint.name as string, 'TypeScript')}" type="${loopJoint.type}">`
    );
    this.indentLevel++;
    this.emit(
      `<link1 link="${loopJoint.link1.link}" rpy="${loopJoint.link1.rpy.join(' ')}" xyz="${loopJoint.link1.xyz.join(' ')}"/>`
    );
    this.emit(
      `<link1 link="${loopJoint.link2.link}" rpy="${loopJoint.link2.rpy.join(' ')}" xyz="${loopJoint.link2.xyz.join(' ')}"/>`
    );
    this.indentLevel--;
    this.emit('</loop_joint>');
  }

  /** Emit Isaac Sim fixed frame extension tag */
  private emitFixedFrame(frame: URDFFixedFrame): void {
    this.emit(`<fixed_frame name="${this.escapeStringValue(frame.name as string, 'TypeScript')}">`);
    this.indentLevel++;
    this.emit(`<parent link="${frame.parentLink}"/>`);
    this.emitOrigin(frame.origin);
    this.indentLevel--;
    this.emit('</fixed_frame>');
  }

  /** Emit Isaac Sim PhysX configuration comments */
  private emitIsaacSimExtensions(): void {
    if (!this.options.includeIsaacSimExtensions) return;

    this.emitBlank();
    this.emit('<!-- Isaac Sim Extensions -->');

    // Emit Isaac Sim sensors
    for (const sensor of this.isaacSimSensors) {
      this.emitIsaacSimSensor(sensor);
    }

    // Emit loop joints
    for (const loopJoint of this.loopJoints) {
      this.emitLoopJoint(loopJoint);
    }

    // Emit fixed frames
    for (const fixedFrame of this.fixedFrames) {
      this.emitFixedFrame(fixedFrame);
    }

    // PhysX tuning as comments (for post-import configuration scripts)
    this.emit(
      `<!-- isaac_sim_config: drive_type=${this.options.isaacSimDriveType} target_type=${this.options.isaacSimTargetType} -->`
    );
    this.emit(
      `<!-- isaac_sim_config: solver_position_iterations=${this.options.isaacSimSolverPositionIterations} solver_velocity_iterations=${this.options.isaacSimSolverVelocityIterations} -->`
    );
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Compile HoloScript composition to URDF format
 */
export function compileToURDF(composition: HoloComposition, options?: URDFCompilerOptions): string {
  const compiler = new URDFCompiler(options);
  return compiler.compile(composition);
}

/**
 * Compile HoloScript composition for ROS 2 deployment
 * Includes ros2_control tags and Gazebo plugins
 */
export function compileForROS2(
  composition: HoloComposition,
  options?: Partial<URDFCompilerOptions>
): string {
  const ros2Options: URDFCompilerOptions = {
    includeGazeboPlugins: true,
    includeROS2Control: true,
    includeVisual: true,
    includeCollision: true,
    includeInertial: true,
    ...options,
  };
  const compiler = new URDFCompiler(ros2Options);
  return compiler.compile(composition);
}

/**
 * Compile HoloScript composition for Gazebo simulation
 * Includes Gazebo material tags, friction parameters, and sensor plugins
 */
export function compileForGazebo(
  composition: HoloComposition,
  options?: Partial<URDFCompilerOptions>
): string {
  const gazeboOptions: URDFCompilerOptions = {
    includeGazeboPlugins: true,
    gazeboVersion: 'classic',
    includeVisual: true,
    includeCollision: true,
    includeInertial: true,
    ...options,
  };
  const compiler = new URDFCompiler(gazeboOptions);
  return compiler.compile(composition);
}

/**
 * Compile HoloScript composition for NVIDIA Isaac Sim
 * Includes Isaac Sim extension tags, optimized for PhysX physics
 */
export function compileForIsaacSim(
  composition: HoloComposition,
  options?: Partial<URDFCompilerOptions>
): string {
  const isaacOptions: URDFCompilerOptions = {
    includeVisual: true,
    includeCollision: true,
    includeInertial: true,
    includeGazeboPlugins: false, // Isaac Sim uses PhysX, not Gazebo plugins
    includeROS2Control: true,
    includeIsaacSimExtensions: true,
    isaacSimDriveType: 'acceleration',
    isaacSimTargetType: 'position',
    isaacSimSolverPositionIterations: 8,
    isaacSimSolverVelocityIterations: 4,
    ...options,
  };
  const compiler = new URDFCompiler(isaacOptions);
  return compiler.compile(composition);
}

/**
 * Generate a ROS 2 launch file (Python) for loading the URDF
 */
export function generateROS2LaunchFile(
  packageName: string,
  urdfFilename: string,
  options?: {
    useSimTime?: boolean;
    rviz?: boolean;
    gazebo?: boolean;
    controllers?: string[];
  }
): string {
  const useSimTime = options?.useSimTime ?? true;
  const rviz = options?.rviz ?? true;
  const gazebo = options?.gazebo ?? true;
  const controllers = options?.controllers ?? [
    'joint_state_broadcaster',
    'joint_trajectory_controller',
  ];

  const lines: string[] = [];
  lines.push('"""');
  lines.push(`ROS 2 Launch file for ${packageName}`);
  lines.push('Auto-generated by HoloScript URDFCompiler');
  lines.push('"""');
  lines.push('');
  lines.push('import os');
  lines.push('from ament_index_python.packages import get_package_share_directory');
  lines.push('from launch import LaunchDescription');
  lines.push(
    'from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription, RegisterEventHandler'
  );
  lines.push('from launch.conditions import IfCondition');
  lines.push('from launch.event_handlers import OnProcessExit');
  lines.push('from launch.launch_description_sources import PythonLaunchDescriptionSource');
  lines.push(
    'from launch.substitutions import Command, FindExecutable, LaunchConfiguration, PathJoinSubstitution'
  );
  lines.push('from launch_ros.actions import Node');
  lines.push('from launch_ros.substitutions import FindPackageShare');
  lines.push('');
  lines.push('');
  lines.push('def generate_launch_description():');
  lines.push(`    pkg_share = get_package_share_directory('${packageName}')`);
  lines.push(`    urdf_file = os.path.join(pkg_share, 'urdf', '${urdfFilename}')`);
  lines.push('');
  lines.push('    with open(urdf_file, "r") as f:');
  lines.push('        robot_description = f.read()');
  lines.push('');
  lines.push('    # Robot State Publisher');
  lines.push('    robot_state_publisher = Node(');
  lines.push("        package='robot_state_publisher',");
  lines.push("        executable='robot_state_publisher',");
  lines.push('        parameters=[{');
  lines.push("            'robot_description': robot_description,");
  lines.push(`            'use_sim_time': ${useSimTime ? 'True' : 'False'},`);
  lines.push('        }],');
  lines.push("        output='screen',");
  lines.push('    )');
  lines.push('');

  if (rviz) {
    lines.push('    # RViz2');
    lines.push('    rviz_config = os.path.join(pkg_share, "config", "display.rviz")');
    lines.push('    rviz = Node(');
    lines.push("        package='rviz2',");
    lines.push("        executable='rviz2',");
    lines.push("        arguments=['-d', rviz_config],");
    lines.push(`        parameters=[{'use_sim_time': ${useSimTime ? 'True' : 'False'}}],`);
    lines.push("        output='screen',");
    lines.push('    )');
    lines.push('');
  }

  if (gazebo) {
    lines.push('    # Gazebo');
    lines.push('    gazebo = IncludeLaunchDescription(');
    lines.push('        PythonLaunchDescriptionSource([');
    lines.push("            FindPackageShare('ros_gz_sim'),");
    lines.push("            '/launch/gz_sim.launch.py',");
    lines.push('        ]),');
    lines.push("        launch_arguments={'gz_args': '-r empty.sdf'}.items(),");
    lines.push('    )');
    lines.push('');
    lines.push('    # Spawn robot');
    lines.push('    spawn_entity = Node(');
    lines.push("        package='ros_gz_sim',");
    lines.push("        executable='create',");
    lines.push(
      "        arguments=['-topic', 'robot_description', '-name', '" + packageName + "'],"
    );
    lines.push("        output='screen',");
    lines.push('    )');
    lines.push('');
  }

  // Controller spawners
  for (const controller of controllers) {
    const varName = controller.replace(/-/g, '_');
    lines.push(`    # ${controller}`);
    lines.push(`    ${varName}_spawner = Node(`);
    lines.push("        package='controller_manager',");
    lines.push("        executable='spawner',");
    lines.push(`        arguments=['${controller}'],`);
    lines.push("        output='screen',");
    lines.push('    )');
    lines.push('');
  }

  lines.push('    return LaunchDescription([');
  lines.push('        robot_state_publisher,');
  if (rviz) lines.push('        rviz,');
  if (gazebo) {
    lines.push('        gazebo,');
    lines.push('        spawn_entity,');
  }
  for (const controller of controllers) {
    lines.push(`        ${controller.replace(/-/g, '_')}_spawner,`);
  }
  lines.push('    ])');

  return lines.join('\n');
}

/**
 * Generate a controllers.yaml configuration for ros2_control
 */
export function generateControllersYaml(
  robotName: string,
  jointNames: string[],
  options?: {
    controllerType?: string;
    publishRate?: number;
  }
): string {
  const controllerType =
    options?.controllerType ?? 'joint_trajectory_controller/JointTrajectoryController';
  const publishRate = options?.publishRate ?? 50;

  const lines: string[] = [];
  lines.push('# Auto-generated by HoloScript URDFCompiler');
  lines.push(`# Robot: ${robotName}`);
  lines.push('');
  lines.push('controller_manager:');
  lines.push('  ros__parameters:');
  lines.push(`    update_rate: ${publishRate}`);
  lines.push('');
  lines.push('    joint_state_broadcaster:');
  lines.push('      type: joint_state_broadcaster/JointStateBroadcaster');
  lines.push('');
  lines.push('    joint_trajectory_controller:');
  lines.push(`      type: ${controllerType}`);
  lines.push('');
  lines.push('joint_trajectory_controller:');
  lines.push('  ros__parameters:');
  lines.push('    joints:');
  for (const joint of jointNames) {
    lines.push(`      - ${joint}`);
  }
  lines.push('    command_interfaces:');
  lines.push('      - position');
  lines.push('    state_interfaces:');
  lines.push('      - position');
  lines.push('      - velocity');

  return lines.join('\n');
}

// =============================================================================
// EXPORTS
// =============================================================================

export default URDFCompiler;
