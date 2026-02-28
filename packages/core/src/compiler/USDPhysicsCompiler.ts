/**
 * HoloScript → USD Physics Schema Compiler
 *
 * Exports HoloScript compositions to OpenUSD with Physics schemas for
 * NVIDIA Isaac Sim, Omniverse, and other USD physics runtimes.
 *
 * Implements:
 *   - PhysicsScene - simulation parameters
 *   - PhysicsRigidBodyAPI - rigid body dynamics
 *   - PhysicsCollisionAPI - collision shapes
 *   - PhysicsArticulationRootAPI - articulated robot bases
 *   - PhysicsDriveAPI - joint motors/drives
 *   - PhysicsMassAPI - mass properties
 *
 * Output: USD ASCII (.usda) with physics schemas. Can be converted to
 * binary .usd or .usdc via OpenUSD tools.
 *
 * @version 1.0.0
 */

import type {
import { CompilerBase } from './CompilerBase';
  HoloComposition,
  HoloObjectDecl,
  HoloSpatialGroup,
  HoloValue,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface USDPhysicsCompilerOptions {
  /** Stage name for USD */
  stageName?: string;
  /** Up axis (Y or Z) - Isaac Sim uses Z-up */
  upAxis?: 'Y' | 'Z';
  /** Meters per unit */
  metersPerUnit?: number;
  /** Time codes per second */
  timeCodesPerSecond?: number;
  /** Include PhysicsScene prim */
  includePhysicsScene?: boolean;
  /** Default gravity (m/s²) */
  gravity?: [number, number, number];
  /** Default physics timestep (seconds) */
  physicsTimestep?: number;
  /** Enable GPU dynamics (Isaac Sim) */
  enableGPUDynamics?: boolean;
  /** Include collision shapes */
  includeCollision?: boolean;
  /** Include visual geometry */
  includeVisual?: boolean;
  /** Default mass for objects without @physics */
  defaultMass?: number;
  /** Default static friction */
  defaultStaticFriction?: number;
  /** Default dynamic friction */
  defaultDynamicFriction?: number;
  /** Default restitution (bounciness) */
  defaultRestitution?: number;
  /** Export as articulation for robots */
  enableArticulation?: boolean;
}

export interface USDPhysicsPrim {
  path: string;
  name: string;
  typeName: string;
  translation?: [number, number, number];
  rotation?: [number, number, number, number]; // quaternion xyzw
  scale?: [number, number, number];
  children: USDPhysicsPrim[];
  apis: USDPhysicsAPI[];
  references?: string[];
}

export type USDPhysicsAPI =
  | USDRigidBodyAPI
  | USDCollisionAPI
  | USDMassAPI
  | USDArticulationRootAPI
  | USDDriveAPI
  | USDJointAPI;

export interface USDRigidBodyAPI {
  type: 'PhysicsRigidBodyAPI';
  rigidBodyEnabled: boolean;
  kinematicEnabled?: boolean;
  startsAsleep?: boolean;
  linearVelocity?: [number, number, number];
  angularVelocity?: [number, number, number];
}

export interface USDCollisionAPI {
  type: 'PhysicsCollisionAPI';
  collisionEnabled: boolean;
}

export interface USDMassAPI {
  type: 'PhysicsMassAPI';
  mass: number;
  density?: number;
  centerOfMass?: [number, number, number];
  diagonalInertia?: [number, number, number];
  principalAxes?: [number, number, number, number];
}

export interface USDArticulationRootAPI {
  type: 'PhysicsArticulationRootAPI';
  articulationEnabled: boolean;
  /** Isaac Sim specific: enable self-collision */
  enabledSelfCollisions?: boolean;
  /** Solver position iterations */
  solverPositionIterationCount?: number;
  /** Solver velocity iterations */
  solverVelocityIterationCount?: number;
}

export interface USDDriveAPI {
  type: 'PhysicsDriveAPI';
  driveType: 'position' | 'velocity' | 'force';
  maxForce?: number;
  targetPosition?: number;
  targetVelocity?: number;
  stiffness?: number;
  damping?: number;
}

export interface USDJointAPI {
  type: 'PhysicsJoint';
  jointType: 'revolute' | 'prismatic' | 'spherical' | 'fixed' | 'd6';
  body0: string;
  body1: string;
  localPos0?: [number, number, number];
  localPos1?: [number, number, number];
  localRot0?: [number, number, number, number];
  localRot1?: [number, number, number, number];
  axis?: 'X' | 'Y' | 'Z';
  lowerLimit?: number;
  upperLimit?: number;
  drives?: USDDriveAPI[];
}

export interface USDMaterial {
  path: string;
  name: string;
  staticFriction: number;
  dynamicFriction: number;
  restitution: number;
  density?: number;
}

export interface USDPhysicsScene {
  path: string;
  gravityDirection: [number, number, number];
  gravityMagnitude: number;
}

// =============================================================================
// USD PHYSICS COMPILER
// =============================================================================

export class USDPhysicsCompiler extends CompilerBase {
  protected readonly compilerName = 'USDPhysicsCompiler';
  private options: Required<USDPhysicsCompilerOptions>;
  private lines: string[] = [];
  private indentLevel: number = 0;
  private prims: USDPhysicsPrim[] = [];
  private joints: USDJointAPI[] = [];
  private materials: Map<string, USDMaterial> = new Map();

  constructor(options: USDPhysicsCompilerOptions = {}) {
    super();
    this.options = {
      stageName: options.stageName ?? 'HoloScriptPhysicsStage',
      upAxis: options.upAxis ?? 'Z', // Isaac Sim default
      metersPerUnit: options.metersPerUnit ?? 1.0,
      timeCodesPerSecond: options.timeCodesPerSecond ?? 60,
      includePhysicsScene: options.includePhysicsScene ?? true,
      gravity: options.gravity ?? [0, 0, -9.81],
      physicsTimestep: options.physicsTimestep ?? 1 / 60,
      enableGPUDynamics: options.enableGPUDynamics ?? true,
      includeCollision: options.includeCollision ?? true,
      includeVisual: options.includeVisual ?? true,
      defaultMass: options.defaultMass ?? 1.0,
      defaultStaticFriction: options.defaultStaticFriction ?? 0.5,
      defaultDynamicFriction: options.defaultDynamicFriction ?? 0.5,
      defaultRestitution: options.defaultRestitution ?? 0.1,
      enableArticulation: options.enableArticulation ?? true,
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
    // Handle both formats:
    // 1. { name: 'trait', config: {...} } - formal HoloObjectTrait
    // 2. { name: 'trait', prop1: val1, ... } - inline test/shorthand format
    const traitObj = trait as unknown as Record<string, unknown>;
    if ('config' in traitObj && typeof traitObj.config === 'object') {
      return traitObj.config as Record<string, unknown>;
    }
    // Spread properties directly (excluding only 'name')
    // Keep 'type' if it's a meaningful value like 'hinge', not if it's 'ObjectTrait'
    const { name: _name, ...rest } = traitObj;
    // If type is the AST node type marker, exclude it
    if (rest.type === 'ObjectTrait') {
      const { type: _type, ...config } = rest;
      return config;
    }
    return rest;
  }

  /** Sanitize name for USD path */
  private sanitizeName(name: string): string {
    // USD prim names: alphanumeric + underscore, no leading digit
    let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
    if (/^[0-9]/.test(sanitized)) {
      sanitized = '_' + sanitized;
    }
    return sanitized;
  }

  /** Emit a line with current indent */
  private emit(line: string): void {
    const indent = '    '.repeat(this.indentLevel);
    this.lines.push(indent + line);
  }

  /** Emit empty line */
  private emitBlank(): void {
    this.lines.push('');
  }

  /** Get property value from object properties array */
  private getPropertyValue(obj: HoloObjectDecl, key: string): HoloValue | undefined {
    const prop = obj.properties?.find((p: { key: string; value: HoloValue }) => p.key === key);
    return prop?.value;
  }

  /** Extract position from object properties */
  private extractPosition(obj: HoloObjectDecl): [number, number, number] {
    const pos = this.getPropertyValue(obj, 'position');
    if (Array.isArray(pos) && pos.length >= 3) {
      return [Number(pos[0]) || 0, Number(pos[1]) || 0, Number(pos[2]) || 0];
    }
    return [0, 0, 0];
  }

  /** Extract rotation as quaternion from object properties */
  private extractRotation(obj: HoloObjectDecl): [number, number, number, number] {
    const rot = this.getPropertyValue(obj, 'rotation');
    if (Array.isArray(rot) && rot.length >= 3) {
      // Convert Euler degrees to quaternion
      const euler = [
        (Number(rot[0]) || 0) * (Math.PI / 180),
        (Number(rot[1]) || 0) * (Math.PI / 180),
        (Number(rot[2]) || 0) * (Math.PI / 180),
      ];
      return this.eulerToQuaternion(euler[0], euler[1], euler[2]);
    }
    return [0, 0, 0, 1]; // Identity quaternion
  }

  /** Convert Euler angles (radians) to quaternion */
  private eulerToQuaternion(
    roll: number,
    pitch: number,
    yaw: number
  ): [number, number, number, number] {
    const cy = Math.cos(yaw * 0.5);
    const sy = Math.sin(yaw * 0.5);
    const cp = Math.cos(pitch * 0.5);
    const sp = Math.sin(pitch * 0.5);
    const cr = Math.cos(roll * 0.5);
    const sr = Math.sin(roll * 0.5);

    return [
      sr * cp * cy - cr * sp * sy, // x
      cr * sp * cy + sr * cp * sy, // y
      cr * cp * sy - sr * sp * cy, // z
      cr * cp * cy + sr * sp * sy, // w
    ];
  }

  /** Extract scale from object properties */
  private extractScale(obj: HoloObjectDecl): [number, number, number] {
    const scale = this.getPropertyValue(obj, 'scale');
    if (Array.isArray(scale) && scale.length >= 3) {
      return [Number(scale[0]) || 1, Number(scale[1]) || 1, Number(scale[2]) || 1];
    }
    if (typeof scale === 'number') {
      return [scale, scale, scale];
    }
    return [1, 1, 1];
  }

  /** Extract geometry type from object */
  private extractGeometry(
    obj: HoloObjectDecl
  ): { type: string; size?: [number, number, number]; radius?: number } | undefined {
    const geom = this.getPropertyValue(obj, 'geometry');
    if (!geom) return undefined;

    const geomType = String(geom);
    const scale = this.extractScale(obj);

    switch (geomType) {
      case 'cube':
      case 'box':
        return { type: 'Cube', size: scale };
      case 'sphere':
        return { type: 'Sphere', radius: Math.max(...scale) / 2 };
      case 'cylinder':
        return { type: 'Cylinder', radius: Math.max(scale[0], scale[2]) / 2 };
      case 'capsule':
        return { type: 'Capsule', radius: Math.max(scale[0], scale[2]) / 2 };
      case 'cone':
        return { type: 'Cone', radius: Math.max(scale[0], scale[2]) / 2 };
      default:
        // Could be a mesh path
        if (geomType.endsWith('.usd') || geomType.endsWith('.usda') || geomType.endsWith('.usdc')) {
          return { type: 'Reference', size: scale };
        }
        return { type: 'Cube', size: scale };
    }
  }

  /** Map HoloScript joint types to USD joint types */
  private mapJointType(holoType: string): 'revolute' | 'prismatic' | 'spherical' | 'fixed' | 'd6' {
    switch (holoType) {
      case 'hinge':
      case 'revolute':
        return 'revolute';
      case 'slider':
      case 'prismatic':
        return 'prismatic';
      case 'ball':
      case 'spherical':
        return 'spherical';
      case 'fixed':
        return 'fixed';
      case '6dof':
      case 'd6':
        return 'd6';
      default:
        return 'fixed';
    }
  }

  /** Map axis string to USD axis */
  private mapAxis(axis: unknown): 'X' | 'Y' | 'Z' {
    if (Array.isArray(axis)) {
      // Find dominant axis
      const absX = Math.abs(Number(axis[0]) || 0);
      const absY = Math.abs(Number(axis[1]) || 0);
      const absZ = Math.abs(Number(axis[2]) || 0);
      if (absX >= absY && absX >= absZ) return 'X';
      if (absY >= absX && absY >= absZ) return 'Y';
      return 'Z';
    }
    const axisStr = String(axis).toUpperCase();
    if (axisStr === 'X' || axisStr === 'Y' || axisStr === 'Z') {
      return axisStr;
    }
    return 'Z'; // Default axis
  }

  // ===========================================================================
  // COMPILATION
  // ===========================================================================

  /**
   * Compile HoloScript composition to USD ASCII with physics schemas
   */
  compile(composition: HoloComposition, agentToken: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);
    this.lines = [];
    this.prims = [];
    this.joints = [];
    this.materials.clear();
    this.indentLevel = 0;

    // Extract physics prims from composition
    this.extractFromComposition(composition);

    // Generate USDA
    this.emitHeader(composition.name);
    this.emitBlank();

    // Define stage root
    this.emit(`def Xform "${this.sanitizeName(composition.name)}" (`);
    this.indentLevel++;
    this.emit(`kind = "component"`);
    this.indentLevel--;
    this.emit(`)
{`);
    this.indentLevel++;

    // Physics scene
    if (this.options.includePhysicsScene) {
      this.emitPhysicsScene();
      this.emitBlank();
    }

    // Physics materials
    if (this.materials.size > 0) {
      this.emitPhysicsMaterials();
      this.emitBlank();
    }

    // Root prim for articulation (if robot)
    const isRobot = this.prims.some((p) => p.apis.some((a) => a.type === 'PhysicsArticulationRootAPI'));
    if (isRobot && this.options.enableArticulation) {
      this.emitArticulationRoot();
    } else {
      // Emit prims directly
      for (const prim of this.prims) {
        this.emitPrim(prim);
        this.emitBlank();
      }
    }

    // Emit joints
    for (const joint of this.joints) {
      this.emitJoint(joint);
      this.emitBlank();
    }

    this.indentLevel--;
    this.emit(`}`);

    return this.lines.join('\n');
  }

  // ===========================================================================
  // HEADER EMISSION
  // ===========================================================================

  private emitHeader(name: string): void {
    // Note: gravity is emitted in PhysicsScene, not in header
    this.emit(`#usda 1.0`);
    this.emit(`(`);
    this.indentLevel++;
    this.emit(`defaultPrim = "${this.sanitizeName(name)}"`);
    this.emit(`doc = "Generated by HoloScript USDPhysicsCompiler for NVIDIA Isaac Sim"`);
    this.emit(`metersPerUnit = ${this.options.metersPerUnit}`);
    this.emit(`upAxis = "${this.options.upAxis}"`);
    this.emit(`timeCodesPerSecond = ${this.options.timeCodesPerSecond}`);
    this.emit(`customLayerData = {`);
    this.indentLevel++;
    this.emit(`string generator = "HoloScript v3.0"`);
    this.emit(`string targetRuntime = "Isaac Sim / Omniverse"`);
    this.indentLevel--;
    this.emit(`}`);
    this.indentLevel--;
    this.emit(`)`);
  }

  // ===========================================================================
  // PHYSICS SCENE
  // ===========================================================================

  private emitPhysicsScene(): void {
    const gravityMag = Math.sqrt(
      this.options.gravity[0] ** 2 +
        this.options.gravity[1] ** 2 +
        this.options.gravity[2] ** 2
    );

    // Normalize gravity direction
    const gravityDir: [number, number, number] =
      gravityMag > 0
        ? [
            this.options.gravity[0] / gravityMag,
            this.options.gravity[1] / gravityMag,
            this.options.gravity[2] / gravityMag,
          ]
        : [0, 0, -1];

    this.emit(`def PhysicsScene "PhysicsScene"`);
    this.emit(`{`);
    this.indentLevel++;
    this.emit(`float3 physics:gravityDirection = (${gravityDir[0]}, ${gravityDir[1]}, ${gravityDir[2]})`);
    this.emit(`float physics:gravityMagnitude = ${gravityMag}`);
    this.emit(`# Isaac Sim GPU dynamics`);
    this.emit(`bool physxScene:enableGPUDynamics = ${this.options.enableGPUDynamics}`);
    this.emit(`float physxScene:timestep = ${this.options.physicsTimestep}`);
    this.emit(`uint physxScene:solverType = 1  # TGS solver`);
    this.indentLevel--;
    this.emit(`}`);
  }

  // ===========================================================================
  // PHYSICS MATERIALS
  // ===========================================================================

  private emitPhysicsMaterials(): void {
    this.emit(`def Scope "PhysicsMaterials"`);
    this.emit(`{`);
    this.indentLevel++;

    for (const [_key, mat] of this.materials) {
      this.emit(`def Material "${mat.name}" (`);
      this.indentLevel++;
      this.emit(`prepend apiSchemas = ["PhysicsMaterialAPI"]`);
      this.indentLevel--;
      this.emit(`)`);
      this.emit(`{`);
      this.indentLevel++;
      this.emit(`float physics:staticFriction = ${mat.staticFriction}`);
      this.emit(`float physics:dynamicFriction = ${mat.dynamicFriction}`);
      this.emit(`float physics:restitution = ${mat.restitution}`);
      if (mat.density !== undefined) {
        this.emit(`float physics:density = ${mat.density}`);
      }
      this.indentLevel--;
      this.emit(`}`);
    }

    this.indentLevel--;
    this.emit(`}`);
  }

  // ===========================================================================
  // ARTICULATION ROOT
  // ===========================================================================

  private emitArticulationRoot(): void {
    this.emit(`def Xform "RobotArticulation" (`);
    this.indentLevel++;
    this.emit(`prepend apiSchemas = ["PhysicsArticulationRootAPI"]`);
    this.indentLevel--;
    this.emit(`)`);
    this.emit(`{`);
    this.indentLevel++;

    // Articulation settings
    this.emit(`bool physics:articulationEnabled = true`);
    this.emit(`# Isaac Sim articulation settings`);
    this.emit(`bool physxArticulation:enabledSelfCollisions = false`);
    this.emit(`uint physxArticulation:solverPositionIterationCount = 32`);
    this.emit(`uint physxArticulation:solverVelocityIterationCount = 1`);
    this.emitBlank();

    // Emit child prims
    for (const prim of this.prims) {
      this.emitPrim(prim);
      this.emitBlank();
    }

    this.indentLevel--;
    this.emit(`}`);
  }

  // ===========================================================================
  // PRIM EMISSION
  // ===========================================================================

  private emitPrim(prim: USDPhysicsPrim): void {
    // Collect API schemas
    const apiSchemas = prim.apis
      .map((api) => {
        switch (api.type) {
          case 'PhysicsRigidBodyAPI':
            return 'PhysicsRigidBodyAPI';
          case 'PhysicsCollisionAPI':
            return 'PhysicsCollisionAPI';
          case 'PhysicsMassAPI':
            return 'PhysicsMassAPI';
          case 'PhysicsArticulationRootAPI':
            return 'PhysicsArticulationRootAPI';
          default:
            return null;
        }
      })
      .filter(Boolean);

    // Emit prim definition
    if (apiSchemas.length > 0) {
      const schemasStr = apiSchemas.map((s) => `"${s}"`).join(', ');
      this.emit(`def ${prim.typeName} "${prim.name}" (`);
      this.indentLevel++;
      this.emit(`prepend apiSchemas = [${schemasStr}]`);
      this.indentLevel--;
      this.emit(`)`);
    } else {
      this.emit(`def ${prim.typeName} "${prim.name}"`);
    }

    this.emit(`{`);
    this.indentLevel++;

    // Transform
    if (prim.translation) {
      this.emit(
        `double3 xformOp:translate = (${prim.translation[0]}, ${prim.translation[1]}, ${prim.translation[2]})`
      );
    }
    if (prim.rotation && !this.isIdentityQuaternion(prim.rotation)) {
      this.emit(
        `quatd xformOp:orient = (${prim.rotation[3]}, ${prim.rotation[0]}, ${prim.rotation[1]}, ${prim.rotation[2]})`
      );
    }
    if (prim.scale && !this.isUniformScale(prim.scale)) {
      this.emit(`double3 xformOp:scale = (${prim.scale[0]}, ${prim.scale[1]}, ${prim.scale[2]})`);
    }

    // xformOpOrder if transforms exist
    const hasTransform = prim.translation || prim.rotation || prim.scale;
    if (hasTransform) {
      const ops: string[] = [];
      if (prim.translation) ops.push('"xformOp:translate"');
      if (prim.rotation && !this.isIdentityQuaternion(prim.rotation)) ops.push('"xformOp:orient"');
      if (prim.scale && !this.isUniformScale(prim.scale)) ops.push('"xformOp:scale"');
      this.emit(`uniform token[] xformOpOrder = [${ops.join(', ')}]`);
    }

    // Emit API-specific attributes
    for (const api of prim.apis) {
      this.emitAPIAttributes(api);
    }

    // Emit children
    for (const child of prim.children) {
      this.emitBlank();
      this.emitPrim(child);
    }

    this.indentLevel--;
    this.emit(`}`);
  }

  private isIdentityQuaternion(q: [number, number, number, number]): boolean {
    return Math.abs(q[0]) < 0.0001 && Math.abs(q[1]) < 0.0001 && Math.abs(q[2]) < 0.0001 && Math.abs(q[3] - 1) < 0.0001;
  }

  private isUniformScale(s: [number, number, number]): boolean {
    return Math.abs(s[0] - 1) < 0.0001 && Math.abs(s[1] - 1) < 0.0001 && Math.abs(s[2] - 1) < 0.0001;
  }

  private emitAPIAttributes(api: USDPhysicsAPI): void {
    switch (api.type) {
      case 'PhysicsRigidBodyAPI':
        this.emitBlank();
        this.emit(`# PhysicsRigidBodyAPI`);
        this.emit(`bool physics:rigidBodyEnabled = ${api.rigidBodyEnabled}`);
        if (api.kinematicEnabled !== undefined) {
          this.emit(`bool physics:kinematicEnabled = ${api.kinematicEnabled}`);
        }
        if (api.startsAsleep !== undefined) {
          this.emit(`bool physics:startsAsleep = ${api.startsAsleep}`);
        }
        if (api.linearVelocity) {
          this.emit(
            `float3 physics:velocity = (${api.linearVelocity[0]}, ${api.linearVelocity[1]}, ${api.linearVelocity[2]})`
          );
        }
        if (api.angularVelocity) {
          this.emit(
            `float3 physics:angularVelocity = (${api.angularVelocity[0]}, ${api.angularVelocity[1]}, ${api.angularVelocity[2]})`
          );
        }
        break;

      case 'PhysicsCollisionAPI':
        this.emitBlank();
        this.emit(`# PhysicsCollisionAPI`);
        this.emit(`bool physics:collisionEnabled = ${api.collisionEnabled}`);
        break;

      case 'PhysicsMassAPI':
        this.emitBlank();
        this.emit(`# PhysicsMassAPI`);
        this.emit(`float physics:mass = ${api.mass}`);
        if (api.density !== undefined) {
          this.emit(`float physics:density = ${api.density}`);
        }
        if (api.centerOfMass) {
          this.emit(
            `point3f physics:centerOfMass = (${api.centerOfMass[0]}, ${api.centerOfMass[1]}, ${api.centerOfMass[2]})`
          );
        }
        if (api.diagonalInertia) {
          this.emit(
            `float3 physics:diagonalInertia = (${api.diagonalInertia[0]}, ${api.diagonalInertia[1]}, ${api.diagonalInertia[2]})`
          );
        }
        break;

      case 'PhysicsArticulationRootAPI':
        this.emitBlank();
        this.emit(`# PhysicsArticulationRootAPI`);
        this.emit(`bool physics:articulationEnabled = ${api.articulationEnabled}`);
        break;
    }
  }

  // ===========================================================================
  // JOINT EMISSION
  // ===========================================================================

  private emitJoint(joint: USDJointAPI): void {
    const jointClass = this.getUSDJointClass(joint.jointType);
    const hasLimits = joint.lowerLimit !== undefined || joint.upperLimit !== undefined;
    const hasDrives = joint.drives && joint.drives.length > 0;

    this.emit(`def ${jointClass} "${joint.body0}_to_${joint.body1}_joint"`);
    this.emit(`{`);
    this.indentLevel++;

    // Bodies
    this.emit(`rel physics:body0 = <${joint.body0}>`);
    this.emit(`rel physics:body1 = <${joint.body1}>`);

    // Local transforms
    if (joint.localPos0) {
      this.emit(
        `point3f physics:localPos0 = (${joint.localPos0[0]}, ${joint.localPos0[1]}, ${joint.localPos0[2]})`
      );
    }
    if (joint.localPos1) {
      this.emit(
        `point3f physics:localPos1 = (${joint.localPos1[0]}, ${joint.localPos1[1]}, ${joint.localPos1[2]})`
      );
    }
    if (joint.localRot0) {
      this.emit(
        `quatf physics:localRot0 = (${joint.localRot0[3]}, ${joint.localRot0[0]}, ${joint.localRot0[1]}, ${joint.localRot0[2]})`
      );
    }
    if (joint.localRot1) {
      this.emit(
        `quatf physics:localRot1 = (${joint.localRot1[3]}, ${joint.localRot1[0]}, ${joint.localRot1[1]}, ${joint.localRot1[2]})`
      );
    }

    // Axis (for revolute/prismatic)
    if (joint.jointType === 'revolute' || joint.jointType === 'prismatic') {
      this.emit(`token physics:axis = "${joint.axis || 'Z'}"`);
    }

    // Limits
    if (hasLimits) {
      this.emitBlank();
      this.emit(`# Joint limits`);
      if (joint.lowerLimit !== undefined) {
        this.emit(`float physics:lowerLimit = ${joint.lowerLimit}`);
      }
      if (joint.upperLimit !== undefined) {
        this.emit(`float physics:upperLimit = ${joint.upperLimit}`);
      }
    }

    // Drives
    if (hasDrives) {
      for (const drive of joint.drives!) {
        this.emitDrive(drive, joint.axis || 'Z');
      }
    }

    this.indentLevel--;
    this.emit(`}`);
  }

  private getUSDJointClass(jointType: string): string {
    switch (jointType) {
      case 'revolute':
        return 'PhysicsRevoluteJoint';
      case 'prismatic':
        return 'PhysicsPrismaticJoint';
      case 'spherical':
        return 'PhysicsSphericalJoint';
      case 'fixed':
        return 'PhysicsFixedJoint';
      case 'd6':
        return 'PhysicsD6Joint';
      default:
        return 'PhysicsFixedJoint';
    }
  }

  private emitDrive(drive: USDDriveAPI, axis: string): void {
    const driveAttr = `physics:${axis.toLowerCase()}Drive`;

    this.emitBlank();
    this.emit(`# PhysicsDriveAPI`);
    this.emit(`token ${driveAttr}:type = "${drive.driveType}"`);

    if (drive.maxForce !== undefined) {
      this.emit(`float ${driveAttr}:maxForce = ${drive.maxForce}`);
    }
    if (drive.targetPosition !== undefined) {
      this.emit(`float ${driveAttr}:targetPosition = ${drive.targetPosition}`);
    }
    if (drive.targetVelocity !== undefined) {
      this.emit(`float ${driveAttr}:targetVelocity = ${drive.targetVelocity}`);
    }
    if (drive.stiffness !== undefined) {
      this.emit(`float ${driveAttr}:stiffness = ${drive.stiffness}`);
    }
    if (drive.damping !== undefined) {
      this.emit(`float ${driveAttr}:damping = ${drive.damping}`);
    }
  }

  // ===========================================================================
  // EXTRACTION FROM COMPOSITION
  // ===========================================================================

  private extractFromComposition(composition: HoloComposition): void {
    // Add default material
    this.materials.set('default', {
      path: '/PhysicsMaterials/DefaultMaterial',
      name: 'DefaultMaterial',
      staticFriction: this.options.defaultStaticFriction,
      dynamicFriction: this.options.defaultDynamicFriction,
      restitution: this.options.defaultRestitution,
    });

    // Process objects
    if (composition.objects) {
      for (const obj of composition.objects) {
        const prim = this.processObject(obj);
        if (prim) {
          this.prims.push(prim);
        }
      }
    }

    // Process spatial groups (potential articulation hierarchies)
    if (composition.spatialGroups) {
      for (const group of composition.spatialGroups) {
        const groupPrims = this.processSpatialGroup(group);
        this.prims.push(...groupPrims);
      }
    }
  }

  private processObject(obj: HoloObjectDecl, parentPath?: string): USDPhysicsPrim | null {
    const name = this.sanitizeName(obj.name);
    const path = parentPath ? `${parentPath}/${name}` : name;

    // Check for traits
    const hasPhysics = this.hasTrait(obj, 'physics') || this.hasTrait(obj, 'rigid');
    const hasCollider = this.hasTrait(obj, 'collidable') || this.hasTrait(obj, 'trigger');
    const isKinematic = this.hasTrait(obj, 'kinematic');
    const isArticulationRoot = this.hasTrait(obj, 'articulation_root');

    // Get trait configs
    const physicsConfig = this.getTraitConfig(obj, 'physics') || {};
    const jointConfig = this.getTraitConfig(obj, 'joint');

    // Get geometry
    const geometry = this.extractGeometry(obj);
    const position = this.extractPosition(obj);
    const rotation = this.extractRotation(obj);
    const scale = this.extractScale(obj);

    // Determine prim type
    let typeName = 'Xform';
    if (geometry) {
      typeName = geometry.type === 'Reference' ? 'Xform' : geometry.type;
    }

    // Build APIs
    const apis: USDPhysicsAPI[] = [];

    if (hasPhysics) {
      apis.push({
        type: 'PhysicsRigidBodyAPI',
        rigidBodyEnabled: true,
        kinematicEnabled: isKinematic,
      });
    }

    if (hasCollider || hasPhysics) {
      apis.push({
        type: 'PhysicsCollisionAPI',
        collisionEnabled: true,
      });
    }

    if (hasPhysics) {
      const mass = (physicsConfig.mass as number) ?? this.options.defaultMass;
      apis.push({
        type: 'PhysicsMassAPI',
        mass,
      });
    }

    if (isArticulationRoot) {
      apis.push({
        type: 'PhysicsArticulationRootAPI',
        articulationEnabled: true,
      });
    }

    // Process joint
    if (jointConfig) {
      const jointType = this.mapJointType(String(jointConfig.type || 'fixed'));
      const parentBody = String(jointConfig.connectedBody || 'base_link');
      const axis = this.mapAxis(jointConfig.axis);

      const joint: USDJointAPI = {
        type: 'PhysicsJoint',
        jointType,
        body0: parentBody,
        body1: `RobotArticulation/${name}`,
        axis,
      };

      // Limits
      if (jointConfig.lowerLimit !== undefined || jointConfig.upperLimit !== undefined) {
        const isRevolute = jointType === 'revolute';
        joint.lowerLimit =
          jointConfig.lowerLimit !== undefined
            ? isRevolute
              ? Number(jointConfig.lowerLimit) * (Math.PI / 180)
              : Number(jointConfig.lowerLimit)
            : undefined;
        joint.upperLimit =
          jointConfig.upperLimit !== undefined
            ? isRevolute
              ? Number(jointConfig.upperLimit) * (Math.PI / 180)
              : Number(jointConfig.upperLimit)
            : undefined;
      }

      // Motor/Drive
      if (jointConfig.motor) {
        const motorConfig = jointConfig.motor as Record<string, unknown>;
        joint.drives = [
          {
            type: 'PhysicsDriveAPI',
            driveType: (motorConfig.type as 'position' | 'velocity' | 'force') || 'position',
            maxForce: motorConfig.maxForce as number,
            stiffness: motorConfig.stiffness as number,
            damping: motorConfig.damping as number,
          },
        ];
      }

      this.joints.push(joint);
    }

    return {
      path,
      name,
      typeName,
      translation: position,
      rotation,
      scale,
      children: [],
      apis,
    };
  }

  private processSpatialGroup(group: HoloSpatialGroup): USDPhysicsPrim[] {
    const prims: USDPhysicsPrim[] = [];
    const groupName = this.sanitizeName(group.name);

    // Create group Xform
    const groupPrim: USDPhysicsPrim = {
      path: groupName,
      name: groupName,
      typeName: 'Xform',
      children: [],
      apis: [],
    };

    // Check if this is a robot (has articulation)
    const hasRobotObjects = group.objects?.some((obj) => this.hasTrait(obj, 'joint'));
    if (hasRobotObjects) {
      groupPrim.apis.push({
        type: 'PhysicsArticulationRootAPI',
        articulationEnabled: true,
      });
    }

    // Process objects in group
    if (group.objects) {
      for (const obj of group.objects) {
        const childPrim = this.processObject(obj, groupName);
        if (childPrim) {
          groupPrim.children.push(childPrim);
        }
      }
    }

    prims.push(groupPrim);
    return prims;
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Compile HoloScript composition to USD Physics format
 */
export function compileToUSDPhysics(
  composition: HoloComposition,
  options?: USDPhysicsCompilerOptions
): string {
  const compiler = new USDPhysicsCompiler(options);
  return compiler.compile(composition);
}

/**
 * Generate Isaac Sim compatible USD from HoloScript
 */
export function compileForIsaacSim(
  composition: HoloComposition,
  options?: Partial<USDPhysicsCompilerOptions>
): string {
  const isaacOptions: USDPhysicsCompilerOptions = {
    upAxis: 'Z',
    metersPerUnit: 1.0,
    enableGPUDynamics: true,
    enableArticulation: true,
    timeCodesPerSecond: 60,
    ...options,
  };
  const compiler = new USDPhysicsCompiler(isaacOptions);
  return compiler.compile(composition);
}
