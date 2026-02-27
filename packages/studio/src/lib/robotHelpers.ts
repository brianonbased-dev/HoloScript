/**
 * robotHelpers.ts
 *
 * Pure helper functions for robot simulation in HoloScript Studio.
 * No DOM, no Three.js — all pure TypeScript math and data processing.
 *
 * Consumed by the robot-engineer.scenario.ts living-spec tests.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type JointType = 'revolute' | 'prismatic' | 'continuous' | 'fixed';

export interface Joint {
  name: string;
  type: JointType;
  axis: [number, number, number]; // unit vector
  limits: { min: number; max: number }; // radians (revolute/prismatic) or null (continuous/fixed)
  parent: string;
  child: string;
  origin: { x: number; y: number; z: number; roll: number; pitch: number; yaw: number };
}

export interface Link {
  name: string;
}

export interface RobotDefinition {
  name: string;
  joints: Joint[];
  links: Link[];
}

export interface JointState {
  name: string;
  angle: number; // clamped to limits
}

// ── URDF Parser ───────────────────────────────────────────────────────────────

/**
 * Parses a subset of URDF XML into a RobotDefinition.
 * Supports joints (revolute, prismatic, continuous, fixed) and links.
 * Does NOT require a full XML DOM — uses regex-based attribute extraction
 * so it works in Node.js vitest environment.
 */
export function parseRobotDefinition(urdfXml: string): RobotDefinition {
  const name = extractAttr(urdfXml, 'robot', 'name') ?? 'unnamed_robot';

  // Extract links
  const links: Link[] = extractAllBlocks(urdfXml, 'link').map((block) => ({
    name: extractAttr(block, 'link', 'name') ?? 'unnamed_link',
  }));

  // Extract joints
  const joints: Joint[] = extractAllBlocks(urdfXml, 'joint').map((block) => {
    const jName = extractAttr(block, 'joint', 'name') ?? 'unnamed_joint';
    const jType = (extractAttr(block, 'joint', 'type') ?? 'fixed') as JointType;

    // axis xyz attribute
    const axisXyz = extractAttr(block, 'axis', 'xyz') ?? '0 0 1';
    const axisParts = axisXyz.trim().split(/\s+/).map(Number);
    const axis: [number, number, number] = [
      axisParts[0] ?? 0,
      axisParts[1] ?? 0,
      axisParts[2] ?? 1,
    ];

    // limits
    const limitLower = parseFloat(extractAttr(block, 'limit', 'lower') ?? '0');
    const limitUpper = parseFloat(extractAttr(block, 'limit', 'upper') ?? '0');

    // parent / child
    const parent = extractAttr(block, 'parent', 'link') ?? '';
    const child = extractAttr(block, 'child', 'link') ?? '';

    // origin
    const xyzStr = extractAttr(block, 'origin', 'xyz') ?? '0 0 0';
    const rpyStr = extractAttr(block, 'origin', 'rpy') ?? '0 0 0';
    const [ox, oy, oz] = xyzStr.trim().split(/\s+/).map(Number);
    const [roll, pitch, yaw] = rpyStr.trim().split(/\s+/).map(Number);

    return {
      name: jName,
      type: jType,
      axis,
      limits: { min: limitLower, max: limitUpper },
      parent,
      child,
      origin: { x: ox ?? 0, y: oy ?? 0, z: oz ?? 0, roll: roll ?? 0, pitch: pitch ?? 0, yaw: yaw ?? 0 },
    };
  });

  return { name, joints, links };
}

// ── Joint Control ─────────────────────────────────────────────────────────────

/**
 * Sets a joint angle clamped to its limits.
 * Fires onChange with the final (clamped) angle.
 * For 'continuous' joints, angle wraps around [-π, π].
 * For 'fixed' joints, always returns 0.
 */
export function setJointAngle(
  joint: Joint,
  angle: number,
  onChange?: (name: string, angle: number) => void
): number {
  let clamped: number;

  if (joint.type === 'fixed') {
    clamped = 0;
  } else if (joint.type === 'continuous') {
    // Wrap to [-π, π]
    clamped = ((angle + Math.PI) % (2 * Math.PI)) - Math.PI;
  } else {
    clamped = Math.max(joint.limits.min, Math.min(joint.limits.max, angle));
  }

  onChange?.(joint.name, clamped);
  return clamped;
}

// ── Forward Kinematics ────────────────────────────────────────────────────────

/**
 * Computes the end-effector world position using a simplified
 * 1-DOF per joint chain (serial manipulator assumption).
 *
 * For each joint, adds the link length projected onto the world
 * frame using the cumulative rotation angle.
 *
 * Returns [x, y, z] in world space (origin at base).
 *
 * Note: This is a simplified planar FK for revolute chains.
 * Real 3D FK would require homogeneous transform matrices.
 */
export function forwardKinematics(
  joints: Array<{ joint: Joint; angle: number; linkLength: number }>
): [number, number, number] {
  let x = 0;
  let y = 0;
  let z = 0;
  let cumulativeAngle = 0;

  for (const { joint, angle, linkLength } of joints) {
    if (joint.type === 'fixed') continue;
    cumulativeAngle += angle;
    // Project link along XZ plane (y-axis rotation for simplicity)
    x += linkLength * Math.sin(cumulativeAngle);
    z += linkLength * Math.cos(cumulativeAngle);
  }

  return [x, y, z];
}

// ── Workspace Bounds ──────────────────────────────────────────────────────────

/**
 * Estimates the reachable workspace of a serial robot as a sphere.
 * Radius = sum of all link lengths (reachable if all joints at max).
 */
export function workspaceBounds(
  joints: Array<{ joint: Joint; linkLength: number }>
): { center: [number, number, number]; radius: number } {
  const radius = joints.reduce((sum, { linkLength }) => sum + linkLength, 0);
  return { center: [0, 0, 0], radius };
}

import * as THREE from 'three';
import { IKSolver } from './ikSolver';

/**
 * Inverse kinematics using CCD (via IKSolver) for N-DOF.
 * Uses a temporary THREE.js scene graph to resolve realistic angles.
 */
export function inverseKinematics(
  target: [number, number, number],
  ...linkLengths: number[]
): number[] {
  const root = new THREE.Object3D();
  let currentParent = root;
  const simulatedJoints = [];

  for (let i = 0; i < linkLengths.length; i++) {
    const jointMesh = new THREE.Object3D();
    currentParent.add(jointMesh);

    // Planar arms rotate around Y-axis
    simulatedJoints.push({
      mesh: jointMesh,
      axis: new THREE.Vector3(0, 1, 0),
      minAngle: -Math.PI,
      maxAngle: Math.PI
    });

    const linkEnd = new THREE.Object3D();
    // Default rest pose sticks out along Z-axis (matches FK tests above)
    linkEnd.position.set(0, 0, linkLengths[i]);
    jointMesh.add(linkEnd);

    currentParent = linkEnd;
  }

  const endEffector = currentParent;
  root.updateMatrixWorld(true);

  const solver = new IKSolver(simulatedJoints, endEffector);
  solver.solve(new THREE.Vector3(target[0], target[1], target[2]));

  // Return the resolved angle for each joint along its Y-axis
  return simulatedJoints.map(j => j.mesh.rotation.y);
}

// ── HoloScript Trait Generation ───────────────────────────────────────────────

/**
 * Converts a Joint into a HoloScript @joint trait string.
 * Used to generate templates from parsed URDF.
 */
export function jointToTrait(joint: Joint): string {
  const axis = joint.axis.join(' ');
  if (joint.type === 'fixed') {
    return `@joint("${joint.name}", type: "fixed")`;
  }
  return `@joint("${joint.name}", type: "${joint.type}", axis: [${axis}], min: ${joint.limits.min.toFixed(3)}, max: ${joint.limits.max.toFixed(3)})`;
}

// ── XML Helpers ───────────────────────────────────────────────────────────────

/**
 * Extracts the value of a named attribute from the FIRST occurrence of
 * a tag with the given name anywhere in `xml`.
 *
 * Handles:  attr="value with spaces"  and  attr='value'
 */
function extractAttr(xml: string, tagName: string, attrName: string): string | null {
  // Match the opening tag (or self-closing) — non-greedy after the tag name
  const tagRe = new RegExp(`<${tagName}(?:\\s[^>]*)?>|<${tagName}(?:\\s[^>]*)?/>`, 'i');
  const tagMatch = tagRe.exec(xml);
  if (!tagMatch) return null;
  const tag = tagMatch[0];

  // Match attr="..." or attr='...' — allow any chars (including spaces) inside quotes
  const doubleQuote = new RegExp(`${attrName}="([^"]*)"`, 'i').exec(tag);
  if (doubleQuote) return doubleQuote[1];

  const singleQuote = new RegExp(`${attrName}='([^']*)'`, 'i').exec(tag);
  if (singleQuote) return singleQuote[1];

  return null;
}

/** Extracts all block contents for a given tag name. */
function extractAllBlocks(xml: string, tagName: string): string[] {
  const blocks: string[] = [];

  // Match open+close tag pairs (non-greedy, dotAll)
  const openClose = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = openClose.exec(xml)) !== null) {
    blocks.push(m[0]);
  }

  // Match self-closing tags (capture those not already captured above)
  const selfClosing = new RegExp(`<${tagName}(?:\\s[^>]*)?/>`, 'gi');
  while ((m = selfClosing.exec(xml)) !== null) {
    // Only add if not already inside an open+close block we captured
    if (!blocks.some(b => b.includes(m![0]))) {
      blocks.push(m[0]);
    }
  }

  return blocks;
}

