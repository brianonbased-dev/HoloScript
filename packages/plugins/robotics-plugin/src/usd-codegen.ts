/**
 * HoloScript → USD Code Generator
 *
 * Generates Universal Scene Description (USD) files from HoloScript AST.
 * Targets NVIDIA Isaac Sim with UsdPhysics and PhysX schemas.
 *
 * Isaac Lab Interop (Path A):
 * - Emits PhysicsDriveAPI for PD actuator control
 * - Emits PhysxJointAxisAPI for per-axis joint friction assumptions
 * - Supports domain randomization metadata for sim-to-real transfer
 */

import {
  ActuatorGroupConfig,
  CompositionNode,
  DomainRandomizationConfig,
  ObjectNode,
  PropertyValue,
} from './ast';

export interface IsaacLabConfig {
  /** Isaac Lab version target for generated code */
  isaacLabVersion?: string;
  /** Enable PhysX articulation and per-axis joint friction schemas (default: true) */
  enableJointFriction?: boolean;
  /** Enable drive attributes for PD control (default: true) */
  enableDriveAttributes?: boolean;
}

type JointKind = 'revolute' | 'prismatic';

export class USDCodeGen {
  private output: string[] = [];
  private indentLevel: number = 0;
  private config: IsaacLabConfig;

  constructor(config?: IsaacLabConfig) {
    this.config = {
      isaacLabVersion: config?.isaacLabVersion || '2.3',
      enableJointFriction: config?.enableJointFriction ?? true,
      enableDriveAttributes: config?.enableDriveAttributes ?? true,
    };
  }

  generate(ast: CompositionNode): string {
    this.output = [];
    this.indentLevel = 0;

    // USD header
    this.emit('#usda 1.0');
    this.emit('(');
    this.indentLevel++;
    this.emit(`defaultPrim = "${ast.name}"`);
    this.emit('upAxis = "Z"');
    this.emit('metersPerUnit = 1.0');
    this.emit('kilogramsPerMass = 1.0');
    this.indentLevel--;
    this.emit(')');
    this.emit('');

    // Isaac Lab header comment
    this.emit(`# Generated for Isaac Lab ${this.config.isaacLabVersion}`);
    this.emit('# Units: meters, kilograms, seconds; HoloScript angular inputs are radians.');
    this.emit('# USD angular joint limits and velocities are exported in degrees per OpenUSD/PhysX.');

    // Emit domain randomization config as USD comments (for Isaac Lab Python codegen)
    if (ast.domainRandomization) {
      this.emit('');
      this.emit('# Domain Randomization Configuration');
      this.emitDomainRandomizationAsComment(ast.domainRandomization);
      this.emit('');
    }

    // Root articulation.
    const rootSchemas = ['PhysicsArticulationRootAPI'];
    if (this.config.enableJointFriction) {
      rootSchemas.push('PhysxArticulationAPI');
    }

    this.emit(`def Xform "${ast.name}" (`);
    this.indentLevel++;
    this.emit(`prepend apiSchemas = ${this.formatTokenArray(rootSchemas)}`);
    this.indentLevel--;
    this.emit(')');
    this.emit('{');
    this.indentLevel++;

    if (this.config.enableJointFriction) {
      this.emit('');
      this.emit('# PhysxArticulationAPI root settings');
      this.emit('bool physxArticulation:articulationEnabled = true');
      this.emit('bool physxArticulation:enabledSelfCollisions = false');
      this.emit('int physxArticulation:solverPositionIterationCount = 32');
      this.emit('int physxArticulation:solverVelocityIterationCount = 1');
    }

    // Collect joints for later generation
    const joints: Array<{
      name: string;
      kind: JointKind;
      parent: string;
      child: string;
      props: Record<string, PropertyValue>;
      actuatorGroups?: ActuatorGroupConfig[];
    }> = [];

    // Separate joint and link objects
    const jointObjects: ObjectNode[] = [];
    const linkObjects: ObjectNode[] = [];

    for (const obj of ast.objects) {
      if (this.isJointObject(obj)) {
        jointObjects.push(obj);
      } else {
        linkObjects.push(obj);
      }
    }

    // Generate links
    for (const obj of ast.objects) {
      if (this.isJointObject(obj)) {
        // New template format: Joint is separate object
        // Check if there's a corresponding link (child of this joint)
        const childLink = linkObjects.find((link) => link.properties.parent === obj.name);
        const kind = this.getJointKind(obj);

        if (childLink) {
          // Generate the child link
          this.generateLink(childLink);

          // Collect joint info
          const parent = (obj.properties.parent as string) || 'World';
          joints.push({
            name: obj.name,
            kind,
            parent,
            child: childLink.name,
            props: obj.properties,
            actuatorGroups: obj.actuatorGroups,
          });
        } else {
          // Old format: joint_parent property (backward compatibility)
          this.generateLink(obj);

          const parent = (obj.properties.joint_parent as string) || 'World';
          joints.push({
            name: `${obj.name}Joint`,
            kind,
            parent,
            child: obj.name,
            props: obj.properties,
            actuatorGroups: obj.actuatorGroups,
          });
        }
      } else {
        // Link object without joint (base, end effector, etc.)
        // Only generate if not already generated as child of a joint
        const isChildOfJoint = jointObjects.some((j) =>
          linkObjects.find((l) => l.properties.parent === j.name && l.name === obj.name)
        );

        if (!isChildOfJoint) {
          this.generateLink(obj);
        }
      }
    }

    // Generate joints after all links
    this.emit('');
    this.emit('# Joints');
    for (const joint of joints) {
      this.generateJoint(joint);
    }

    this.indentLevel--;
    this.emit('}');

    return this.output.join('\n');
  }

  private generateLink(obj: ObjectNode): void {
    const geometry = (obj.properties.geometry as string) || 'box';
    const usdType = this.geometryToUSD(geometry);
    const isStatic = obj.traits.includes('static');

    this.emit('');
    this.emit(`# ${obj.name}`);
    if (obj.domainRandomization) {
      this.emit('# Object Domain Randomization Configuration');
      this.emitDomainRandomizationAsComment(obj.domainRandomization);
    }
    this.emit(`def ${usdType} "${obj.name}" (`);
    this.indentLevel++;

    // Add physics APIs (unless static)
    if (!isStatic) {
      this.emit(
        'prepend apiSchemas = ["PhysicsCollisionAPI", "PhysicsRigidBodyAPI", "PhysicsMassAPI"]'
      );
    }

    this.indentLevel--;
    this.emit(')');
    this.emit('{');
    this.indentLevel++;

    // Geometry dimensions (support both array and individual properties)
    if (geometry === 'cylinder') {
      let radius: number, height: number;

      if (obj.properties.dimensions) {
        // Old format: dimensions: [radius, height]
        const dims = obj.properties.dimensions as number[];
        [radius, height] = dims;
      } else {
        // New format: radius: 0.2, height/length: 0.2
        radius = (obj.properties.radius as number) || 0.1;
        height = ((obj.properties.height || obj.properties.length) as number) || 0.1;
      }

      this.emit(`float radius = ${radius}`);
      this.emit(`float height = ${height}`);
    } else if (geometry === 'box') {
      let length: number, width: number, height: number;

      if (obj.properties.dimensions) {
        // Old format: dimensions: [length, width, height]
        const dims = obj.properties.dimensions as number[];
        [length, width, height] = dims;
      } else {
        // New format: length: 1.0, width: 0.1, height: 0.1
        length = (obj.properties.length as number) || 1.0;
        width = (obj.properties.width as number) || 1.0;
        height = (obj.properties.height as number) || 1.0;
      }

      this.emit('double size = 1.0');
      this.emit(`float3 xformOp:scale = (${length}, ${width}, ${height})`);
      this.emit('uniform token[] xformOpOrder = ["xformOp:scale"]');
    } else if (geometry === 'sphere') {
      let radius: number;

      if (obj.properties.dimensions) {
        // Old format: dimensions: [radius]
        const dims = obj.properties.dimensions as number[];
        [radius] = dims;
      } else {
        // New format: radius: 0.08
        radius = (obj.properties.radius as number) || 0.1;
      }

      this.emit(`float radius = ${radius}`);
    }

    // Color/Material
    if (obj.properties.color) {
      const color = obj.properties.color as number[];
      const [r, g, b] = color;
      this.emit(`color3f[] primvars:displayColor = [(${r}, ${g}, ${b})]`);
    } else if (obj.properties.material) {
      // Default colors based on material
      const materialColors: Record<string, string> = {
        metal: '0.6, 0.6, 0.65',
        plastic: '0.8, 0.8, 0.8',
        wood: '0.6, 0.4, 0.2',
        glass: '0.9, 0.9, 1.0',
      };
      const material = obj.properties.material as string;
      const color = materialColors[material] || '0.8, 0.8, 0.8';
      this.emit(`color3f[] primvars:displayColor = [(${color})]`);
    }

    // Physics properties
    if (!isStatic) {
      this.emit('');
      this.emit('# Physics properties');

      const mass = (obj.properties.mass as number) || 1.0;
      this.emit(`float physics:mass = ${mass}`);

      if (obj.properties.inertia) {
        const inertia = obj.properties.inertia as number[];
        this.emit(`float3 physics:diagonalInertia = (${inertia[0]}, ${inertia[1]}, ${inertia[2]})`);
      }

      this.emit('uniform token physics:approximation = "convexHull"');
    } else {
      this.emit('');
      this.emit('# Static object');
      this.emit('uniform token physics:rigidBodyEnabled = false');
    }

    // Position (if specified)
    if (obj.properties.position) {
      const pos = obj.properties.position as number[];
      this.emit('');
      this.emit(`double3 xformOp:translate = (${pos[0]}, ${pos[1]}, ${pos[2]})`);
      if (!obj.properties.dimensions) {
        this.emit('uniform token[] xformOpOrder = ["xformOp:translate"]');
      }
    }

    this.indentLevel--;
    this.emit('}');
  }

  private generateJoint(joint: {
    name: string;
    kind: JointKind;
    parent: string;
    child: string;
    props: Record<string, PropertyValue>;
    actuatorGroups?: ActuatorGroupConfig[];
  }): void {
    const axisToken = joint.kind === 'prismatic' ? 'linear' : 'angular';
    const schemas = this.getJointApiSchemas(joint, axisToken);

    this.emit('');
    this.emit(`def ${joint.kind === 'prismatic' ? 'PhysicsPrismaticJoint' : 'PhysicsRevoluteJoint'} "${joint.name}"`);
    if (schemas.length > 0) {
      this.emit('(');
      this.indentLevel++;
      this.emit(`prepend apiSchemas = ${this.formatTokenArray(schemas)}`);
      this.indentLevel--;
      this.emit(')');
    }
    this.emit('{');
    this.indentLevel++;

    // Body references
    this.emit(`rel physics:body0 = <../${joint.parent}>`);
    this.emit(`rel physics:body1 = <../${joint.child}>`);
    this.emit('');

    // Joint frames
    const origin = joint.props.joint_origin || joint.props.position;
    if (origin) {
      const pos = origin as number[];
      this.emit(`point3f physics:localPos0 = (${pos[0]}, ${pos[1]}, ${pos[2]})`);
    } else {
      this.emit('point3f physics:localPos0 = (0, 0, 0)');
    }
    this.emit('quatf physics:localRot0 = (1, 0, 0, 0)');
    this.emit('');
    this.emit('point3f physics:localPos1 = (0, 0, 0)');
    this.emit('quatf physics:localRot1 = (1, 0, 0, 0)');
    this.emit('');

    // Joint axis (support both old and new property names)
    const axis = joint.props.joint_axis || joint.props.axis;
    if (axis) {
      const axisVec = axis as number[];
      const axisName = this.vectorToAxisName(axisVec);
      this.emit(`uniform token physics:axis = "${axisName}"`);
    } else {
      this.emit('uniform token physics:axis = "Y"');
    }
    this.emit('');

    // Joint limits (support both old and new property names)
    const limits = joint.props.joint_limits || joint.props.limits;
    if (limits) {
      const limitsVec = limits as number[];
      this.emit(`float physics:lowerLimit = ${this.formatNumber(this.convertJointScalar(limitsVec[0], joint.kind))}`);
      this.emit(`float physics:upperLimit = ${this.formatNumber(this.convertJointScalar(limitsVec[1], joint.kind))}`);
    }
    this.emit('');

    // Joint dynamics (support both old and new property names)
    const effort = this.numberProp(joint.props, 'joint_effort', 'max_effort');
    if (effort !== undefined) {
      this.emit(`float physics:maxForce = ${effort}`);
    }

    const velocity = this.numberProp(joint.props, 'max_velocity');
    if (velocity !== undefined) {
      this.emit(`float physics:maxVelocity = ${this.formatNumber(this.convertJointScalar(velocity, joint.kind))}`);
    }

    // OpenUSD PhysicsDriveAPI attributes for PD actuator control.
    if (this.config.enableDriveAttributes && this.hasDriveProperties(joint.props)) {
      this.emit('');
      this.emit('# PhysicsDriveAPI attributes for PD control');

      const kp = this.numberProp(joint.props, 'kp', 'stiffness');
      const kd = this.numberProp(joint.props, 'kd', 'damping');

      if (kp !== undefined) {
        this.emit(`float drive:${axisToken}:physics:stiffness = ${kp}`);
      }
      if (kd !== undefined) {
        this.emit(`float drive:${axisToken}:physics:damping = ${kd}`);
      }
      if (effort !== undefined) {
        this.emit(`float drive:${axisToken}:physics:maxForce = ${effort}`);
      }
      this.emit(`uniform token drive:${axisToken}:physics:type = "force"`);
    }

    if (this.config.enableJointFriction && this.hasPhysxJointAxisProperties(joint.props)) {
      this.emit('');
      this.emit('# PhysxJointAxisAPI per-axis friction and velocity assumptions');
      this.emitPhysxJointAxisProperties(joint.props, joint.kind, axisToken);
    }

    const latency = this.numberProp(joint.props, 'actuator_latency', 'latency');
    if (latency !== undefined) {
      this.emit('');
      this.emit('# Isaac Lab delayed actuator hint; convert seconds to delay steps in task config.');
      this.emit(`custom float holoscript:isaacLab:actuatorLatencySeconds = ${latency}`);
    }

    if (joint.actuatorGroups?.length) {
      this.emit('');
      this.emit('# Isaac Lab actuator group hints');
      for (const group of joint.actuatorGroups) {
        this.emitActuatorGroupComment(group);
      }
    }

    this.indentLevel--;
    this.emit('}');
  }

  private indent(): string {
    return '    '.repeat(this.indentLevel);
  }

  private emit(line: string): void {
    this.output.push(this.indent() + line);
  }

  private geometryToUSD(geometry: string): string {
    const mapping: Record<string, string> = {
      cylinder: 'Cylinder',
      box: 'Cube',
      sphere: 'Sphere',
      cone: 'Cone',
      plane: 'Plane',
      torus: 'Torus',
    };
    return mapping[geometry] || 'Cube';
  }

  private isJointObject(obj: ObjectNode): boolean {
    return obj.traits.includes('joint_revolute') || obj.traits.includes('joint_prismatic');
  }

  private getJointKind(obj: ObjectNode): JointKind {
    return obj.traits.includes('joint_prismatic') ? 'prismatic' : 'revolute';
  }

  private getJointApiSchemas(
    joint: { props: Record<string, PropertyValue> },
    axisToken: string
  ): string[] {
    const schemas: string[] = [];

    if (this.config.enableDriveAttributes && this.hasDriveProperties(joint.props)) {
      schemas.push(`PhysicsDriveAPI:${axisToken}`);
    }

    if (this.config.enableJointFriction && this.hasPhysxJointAxisProperties(joint.props)) {
      schemas.push(`PhysxJointAxisAPI:${axisToken}`);
    }

    return schemas;
  }

  private hasDriveProperties(props: Record<string, PropertyValue>): boolean {
    return this.numberProp(props, 'kp', 'stiffness', 'kd', 'damping', 'joint_effort', 'max_effort') !== undefined;
  }

  private hasPhysxJointAxisProperties(props: Record<string, PropertyValue>): boolean {
    return (
      this.numberProp(
        props,
        'joint_friction',
        'friction',
        'joint_static_friction',
        'joint_dynamic_friction',
        'joint_viscous_friction',
        'armature',
        'max_velocity'
      ) !== undefined
    );
  }

  private emitPhysxJointAxisProperties(
    props: Record<string, PropertyValue>,
    kind: JointKind,
    axisToken: string
  ): void {
    const friction = this.numberProp(props, 'joint_friction', 'friction');
    const staticFriction = this.numberProp(props, 'joint_static_friction') ?? friction;
    const dynamicFriction = this.numberProp(props, 'joint_dynamic_friction') ?? friction;
    const viscousFriction = this.numberProp(props, 'joint_viscous_friction');
    const armature = this.numberProp(props, 'armature');
    const velocity = this.numberProp(props, 'max_velocity');

    if (staticFriction !== undefined) {
      this.emit(`float physxJointAxis:${axisToken}:staticFrictionEffort = ${staticFriction}`);
    }
    if (dynamicFriction !== undefined) {
      this.emit(`float physxJointAxis:${axisToken}:dynamicFrictionEffort = ${dynamicFriction}`);
    }
    if (viscousFriction !== undefined) {
      this.emit(`float physxJointAxis:${axisToken}:viscousFrictionCoefficient = ${viscousFriction}`);
    }
    if (armature !== undefined) {
      this.emit(`float physxJointAxis:${axisToken}:armature = ${armature}`);
    }
    if (velocity !== undefined) {
      this.emit(`float physxJointAxis:${axisToken}:maxJointVelocity = ${this.formatNumber(this.convertJointScalar(velocity, kind))}`);
    }
  }

  private emitActuatorGroupComment(group: ActuatorGroupConfig): void {
    const details = [
      `type=${group.type}`,
      `joints=[${group.jointNames.join(', ')}]`,
      group.stiffness !== undefined ? `stiffness=${group.stiffness}` : undefined,
      group.damping !== undefined ? `damping=${group.damping}` : undefined,
      group.friction !== undefined ? `friction=${group.friction}` : undefined,
      group.latency !== undefined ? `latencySeconds=${group.latency}` : undefined,
    ].filter(Boolean);

    this.emit(`#   ${group.name}: ${details.join(' ')}`);
  }

  private numberProp(props: Record<string, PropertyValue>, ...keys: string[]): number | undefined {
    for (const key of keys) {
      const value = props[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
    }

    return undefined;
  }

  private convertJointScalar(value: number, kind: JointKind): number {
    return kind === 'revolute' ? (value * 180) / Math.PI : value;
  }

  private formatNumber(value: number): string {
    return Number(value.toFixed(6)).toString();
  }

  private formatTokenArray(values: string[]): string {
    return `[${values.map((value) => `"${value}"`).join(', ')}]`;
  }

  private vectorToAxisName(axis: number[]): string {
    const [x = 0, y = 0, z = 1] = axis;

    if (Math.abs(x) > Math.abs(y) && Math.abs(x) > Math.abs(z)) {
      return 'X';
    } else if (Math.abs(y) > Math.abs(z)) {
      return 'Y';
    } else {
      return 'Z';
    }
  }

  private emitDomainRandomizationAsComment(dr: DomainRandomizationConfig): void {
    if (dr.physics) {
      this.emit('# physics:');
      if (dr.physics.massScale) {
        this.emit(`#   massScale: [${dr.physics.massScale[0]}, ${dr.physics.massScale[1]}]`);
      }
      if (dr.physics.frictionRange) {
        this.emit(`#   frictionRange: [${dr.physics.frictionRange[0]}, ${dr.physics.frictionRange[1]}]`);
      }
      if (dr.physics.dampingRange) {
        this.emit(`#   dampingRange: [${dr.physics.dampingRange[0]}, ${dr.physics.dampingRange[1]}]`);
      }
      if (dr.physics.armatureRange) {
        this.emit(`#   armatureRange: [${dr.physics.armatureRange[0]}, ${dr.physics.armatureRange[1]}]`);
      }
    }
    if (dr.actuator) {
      this.emit('# actuator:');
      if (dr.actuator.kpNoise !== undefined) {
        this.emit(`#   kpNoise: ${dr.actuator.kpNoise}`);
      }
      if (dr.actuator.kdNoise !== undefined) {
        this.emit(`#   kdNoise: ${dr.actuator.kdNoise}`);
      }
      if (dr.actuator.latencyNoise !== undefined) {
        this.emit(`#   latencyNoise: ${dr.actuator.latencyNoise}`);
      }
    }
    if (dr.observation) {
      this.emit('# observation:');
      if (dr.observation.jointPosNoise !== undefined) {
        this.emit(`#   jointPosNoise: ${dr.observation.jointPosNoise}`);
      }
      if (dr.observation.jointVelNoise !== undefined) {
        this.emit(`#   jointVelNoise: ${dr.observation.jointVelNoise}`);
      }
      if (dr.observation.imuNoise !== undefined) {
        this.emit(`#   imuNoise: ${dr.observation.imuNoise}`);
      }
    }
    if (dr.initialState) {
      this.emit('# initialState:');
      if (dr.initialState.rootPoseRange) {
        this.emit(`#   rootPoseRange: [${dr.initialState.rootPoseRange.join(', ')}]`);
      }
    }
    if (dr.disturbance) {
      this.emit('# disturbance:');
      if (dr.disturbance.forceRange) {
        this.emit(`#   forceRange: [${dr.disturbance.forceRange[0]}, ${dr.disturbance.forceRange[1]}]`);
      }
      if (dr.disturbance.intervalRange) {
        this.emit(`#   intervalRange: [${dr.disturbance.intervalRange[0]}, ${dr.disturbance.intervalRange[1]}]`);
      }
    }
  }
}
