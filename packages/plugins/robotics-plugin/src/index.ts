/**
 * @holoscript/robotics-plugin v1.0.0
 * Complete robotics solution: Compile-time (USD/URDF) + Runtime (ROS2/Gazebo)
 *
 * Features:
 * - USD codegen for NVIDIA Isaac Sim (from holoscript-compiler)
 * - URDF/SDF export for ROS2/Gazebo
 * - ROS2 runtime integration (roslibjs)
 * - VR teleoperation and digital twins
 *
 * @packageDocumentation
 */

// Compile-time: USD/URDF codegen (from holoscript-compiler)
export { USDCodeGen } from './usd-codegen';
export { Lexer, Token, TokenType } from './lexer';
export { Parser } from './parser';
export * from './ast';

// Runtime: ROS2/Gazebo integration
export interface ROS2Config {
  ros_bridge_url: string; // ws://localhost:9090
  namespace?: string; // /my_robot
  tf_prefix?: string; // robot_
}

export interface GazeboConfig {
  world_file?: string; // path/to/world.world
  model_sdf?: string; // path/to/model.sdf
  spawn_position?: [number, number, number];
}

export interface RobotJoint {
  name: string;
  type: 'revolute' | 'prismatic' | 'fixed' | 'continuous';
  parent_link: string;
  child_link: string;
  axis?: [number, number, number];
  limits?: { lower: number; upper: number; effort: number; velocity: number };
}

export interface RobotLink {
  name: string;
  inertial?: {
    mass: number;
    inertia: number[]; // [ixx, iyy, izz, ixy, ixz, iyz]
  };
  visual?: {
    geometry: string;
    material?: string;
  };
  collision?: {
    geometry: string;
  };
}

export interface RobotTransmission {
  name: string;
  joint: string;
  actuator: string;
  mechanicalReduction: number;
  hardwareInterface: 'position' | 'velocity' | 'effort';
}

export interface HoloTraitLike {
  name: string;
  properties?: Record<string, unknown>;
}

export interface HoloCompositionNodeLike {
  id?: string;
  name: string;
  type?: string;
  properties?: Record<string, unknown>;
  traits?: HoloTraitLike[];
  children?: HoloCompositionNodeLike[];
}

export interface HoloCompositionTreeLike {
  name: string;
  children?: HoloCompositionNodeLike[];
}

export interface ExtractedRobotModel {
  name: string;
  links: RobotLink[];
  joints: RobotJoint[];
  transmissions: RobotTransmission[];
  xml: string;
}

export interface URDFExtractionOptions {
  defaultJointType?: RobotJoint['type'];
  defaultAxis?: [number, number, number];
  baseLinkName?: string;
  hardwareScale?: number;
}

type TraitMatch = {
  normalizedName: string;
  trait: HoloTraitLike;
};

const DEFAULT_URDF_AXIS: [number, number, number] = [0, 0, 1];

function normalizeTraitName(name: string): string {
  return name.replace(/^@/, '').trim().toLowerCase();
}

function sanitizeRobotName(name: string): string {
  return name.trim().replace(/[^A-Za-z0-9_]+/g, '_') || 'robot';
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function asVec3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (Array.isArray(value) && value.length >= 3) {
    return [asNumber(value[0], fallback[0]), asNumber(value[1], fallback[1]), asNumber(value[2], fallback[2])];
  }
  return fallback;
}

function asJointLimits(
  value: unknown,
  fallback: RobotJoint['limits']
): RobotJoint['limits'] {
  if (Array.isArray(value) && value.length >= 4) {
    return {
      lower: asNumber(value[0], fallback?.lower ?? -1.57),
      upper: asNumber(value[1], fallback?.upper ?? 1.57),
      effort: asNumber(value[2], fallback?.effort ?? 10),
      velocity: asNumber(value[3], fallback?.velocity ?? 1),
    };
  }

  const record = asRecord(value);
  if (Object.keys(record).length > 0) {
    return {
      lower: asNumber(record.lower, fallback?.lower ?? -1.57),
      upper: asNumber(record.upper, fallback?.upper ?? 1.57),
      effort: asNumber(record.effort, fallback?.effort ?? 10),
      velocity: asNumber(record.velocity, fallback?.velocity ?? 1),
    };
  }

  return fallback;
}

function findTrait(node: HoloCompositionNodeLike, predicate: (normalizedName: string) => boolean): TraitMatch | null {
  for (const trait of node.traits ?? []) {
    const normalizedName = normalizeTraitName(trait.name);
    if (predicate(normalizedName)) {
      return { normalizedName, trait };
    }
  }

  return null;
}

function getJointTrait(node: HoloCompositionNodeLike): TraitMatch | null {
  return findTrait(
    node,
    (name) =>
      name === 'joint' ||
      name === 'hinge' ||
      name === 'slider' ||
      name.startsWith('joint_')
  );
}

function getMotorTrait(node: HoloCompositionNodeLike): TraitMatch | null {
  return findTrait(
    node,
    (name) => name === 'motor' || name === 'servo' || name === 'actuator' || name.endsWith('_motor')
  );
}

function jointTypeFromTrait(
  jointTrait: TraitMatch | null,
  nodeProps: Record<string, unknown>,
  defaultJointType: RobotJoint['type']
): RobotJoint['type'] {
  const explicitType = normalizeTraitName(asString(nodeProps.joint_type ?? nodeProps.type, defaultJointType));

  switch (explicitType) {
    case 'revolute':
    case 'prismatic':
    case 'fixed':
    case 'continuous':
      return explicitType;
    case 'hinge':
      return 'revolute';
    case 'slider':
      return 'prismatic';
  }

  switch (jointTrait?.normalizedName) {
    case 'joint_revolute':
    case 'hinge':
      return 'revolute';
    case 'joint_prismatic':
    case 'slider':
      return 'prismatic';
    case 'joint_continuous':
      return 'continuous';
    case 'joint_fixed':
      return 'fixed';
    default:
      return defaultJointType;
  }
}

function hardwareInterfaceFromMotor(
  motorProps: Record<string, unknown>
): RobotTransmission['hardwareInterface'] {
  const commandMode = normalizeTraitName(asString(motorProps.commandMode ?? motorProps.mode, 'position'));

  if (commandMode === 'velocity') return 'velocity';
  if (commandMode === 'effort' || commandMode === 'torque') return 'effort';
  return 'position';
}

function scaleMass(mass: number, hardwareScale: number): number {
  return Number((mass * Math.pow(hardwareScale, 3)).toFixed(6));
}

function mapNodeToRobotLink(node: HoloCompositionNodeLike, hardwareScale: number): RobotLink {
  const props = asRecord(node.properties);
  const baseMass = asNumber(props.mass, 1);
  const inertia = Array.isArray(props.inertia)
    ? props.inertia.map((value) => asNumber(value, 0))
    : [0.01, 0.01, 0.01, 0, 0, 0];
  const geometry = asString(props.geometry, node.type ?? 'box');
  const material = typeof props.material === 'string' ? props.material : undefined;
  const collisionGeometry = asString(props.collisionGeometry ?? props.geometry, geometry);

  return {
    name: sanitizeRobotName(node.name || node.id || 'link'),
    inertial: {
      mass: scaleMass(baseMass, hardwareScale),
      inertia,
    },
    visual: {
      geometry,
      material,
    },
    collision: {
      geometry: collisionGeometry,
    },
  };
}

function createTransmission(
  jointName: string,
  motorProps: Record<string, unknown>,
  hardwareScale: number
): RobotTransmission {
  return {
    name: sanitizeRobotName(asString(motorProps.name, `${jointName}_transmission`)),
    joint: jointName,
    actuator: sanitizeRobotName(asString(motorProps.actuator ?? motorProps.name, `${jointName}_motor`)),
    mechanicalReduction: Number((asNumber(motorProps.mechanicalReduction ?? motorProps.gearRatio, 1) * hardwareScale).toFixed(6)),
    hardwareInterface: hardwareInterfaceFromMotor(motorProps),
  };
}

function buildLinkXml(link: RobotLink): string {
  const lines = [`  <link name="${xmlEscape(link.name)}">`];

  if (link.inertial) {
    const [ixx = 0.01, iyy = 0.01, izz = 0.01, ixy = 0, ixz = 0, iyz = 0] = link.inertial.inertia;
    lines.push('    <inertial>');
    lines.push(`      <mass value="${link.inertial.mass}"/>`);
    lines.push(
      `      <inertia ixx="${ixx}" iyy="${iyy}" izz="${izz}" ixy="${ixy}" ixz="${ixz}" iyz="${iyz}"/>`
    );
    lines.push('    </inertial>');
  }

  if (link.visual) {
    lines.push('    <visual>');
    lines.push(`      <geometry><mesh filename="${xmlEscape(link.visual.geometry)}"/></geometry>`);
    if (link.visual.material) {
      lines.push(`      <material name="${xmlEscape(link.visual.material)}"/>`);
    }
    lines.push('    </visual>');
  }

  if (link.collision) {
    lines.push('    <collision>');
    lines.push(`      <geometry><mesh filename="${xmlEscape(link.collision.geometry)}"/></geometry>`);
    lines.push('    </collision>');
  }

  lines.push('  </link>');
  return lines.join('\n');
}

function buildJointXml(joint: RobotJoint): string {
  const lines = [`  <joint name="${xmlEscape(joint.name)}" type="${joint.type}">`];
  lines.push(`    <parent link="${xmlEscape(joint.parent_link)}"/>`);
  lines.push(`    <child link="${xmlEscape(joint.child_link)}"/>`);

  if (joint.axis) {
    lines.push(`    <axis xyz="${joint.axis.join(' ')}"/>`);
  }

  if (joint.limits && joint.type !== 'fixed') {
    lines.push(
      `    <limit lower="${joint.limits.lower}" upper="${joint.limits.upper}" effort="${joint.limits.effort}" velocity="${joint.limits.velocity}"/>`
    );
  }

  lines.push('  </joint>');
  return lines.join('\n');
}

function buildTransmissionXml(transmission: RobotTransmission): string {
  return [
    `  <transmission name="${xmlEscape(transmission.name)}">`,
    '    <type>transmission_interface/SimpleTransmission</type>',
    `    <joint name="${xmlEscape(transmission.joint)}">`,
    `      <hardwareInterface>${transmission.hardwareInterface}</hardwareInterface>`,
    '    </joint>',
    `    <actuator name="${xmlEscape(transmission.actuator)}">`,
    '      <hardwareInterface>hardware_interface/EffortJointInterface</hardwareInterface>',
    `      <mechanicalReduction>${transmission.mechanicalReduction}</mechanicalReduction>`,
    '    </actuator>',
    '  </transmission>',
  ].join('\n');
}

export function buildURDFXML(model: Omit<ExtractedRobotModel, 'xml'>): string {
  const lines = [`<robot name="${xmlEscape(model.name)}">`];
  lines.push(...model.links.map(buildLinkXml));
  lines.push(...model.joints.map(buildJointXml));
  lines.push(...model.transmissions.map(buildTransmissionXml));
  lines.push('</robot>');
  return lines.join('\n');
}

export function extractURDFFromHoloComposition(
  composition: HoloCompositionTreeLike,
  options: URDFExtractionOptions = {}
): ExtractedRobotModel {
  const defaultJointType = options.defaultJointType ?? 'fixed';
  const defaultAxis = options.defaultAxis ?? DEFAULT_URDF_AXIS;
  const hardwareScale = options.hardwareScale ?? 1;
  const links: RobotLink[] = [];
  const joints: RobotJoint[] = [];
  const transmissions: RobotTransmission[] = [];

  const visitNode = (
    node: HoloCompositionNodeLike,
    parentLinkName: string | null
  ) => {
    const props = asRecord(node.properties);
    const link = mapNodeToRobotLink(node, hardwareScale);
    links.push(link);

    const jointTrait = getJointTrait(node);
    const motorTrait = getMotorTrait(node);
    const jointName = sanitizeRobotName(asString(props.jointName, `${link.name}_joint`));

    if (parentLinkName && jointTrait) {
      const limits = asJointLimits(props.joint_limits ?? props.limits, {
        lower: -1.57,
        upper: 1.57,
        effort: 10 * hardwareScale,
        velocity: 1 * hardwareScale,
      });

      const joint: RobotJoint = {
        name: jointName,
        type: jointTypeFromTrait(jointTrait, props, defaultJointType),
        parent_link: sanitizeRobotName(parentLinkName),
        child_link: link.name,
        axis: asVec3(props.joint_axis ?? props.axis, defaultAxis),
        limits,
      };

      joints.push(joint);

      if (motorTrait) {
        const motorProps = {
          ...props,
          ...asRecord(motorTrait.trait.properties),
        };
        transmissions.push(createTransmission(joint.name, motorProps, hardwareScale));
      }
    }

    for (const child of node.children ?? []) {
      visitNode(child, link.name);
    }
  };

  const baseLinkName = sanitizeRobotName(options.baseLinkName ?? `${composition.name}_base`);
  links.push({
    name: baseLinkName,
    inertial: {
      mass: scaleMass(1, hardwareScale),
      inertia: [0.01, 0.01, 0.01, 0, 0, 0],
    },
    visual: {
      geometry: 'base_link',
    },
    collision: {
      geometry: 'base_link',
    },
  });

  for (const child of composition.children ?? []) {
    visitNode(child, baseLinkName);
  }

  const modelWithoutXml: Omit<ExtractedRobotModel, 'xml'> = {
    name: sanitizeRobotName(composition.name),
    links,
    joints,
    transmissions,
  };

  return {
    ...modelWithoutXml,
    xml: buildURDFXML(modelWithoutXml),
  };
}

// Traits
export * from './traits/ROS2HardwareLoopTrait';

// Version
export const VERSION = '1.0.0';

// Re-export for convenience
export default {
  VERSION,
  buildURDFXML,
  extractURDFFromHoloComposition,
};
