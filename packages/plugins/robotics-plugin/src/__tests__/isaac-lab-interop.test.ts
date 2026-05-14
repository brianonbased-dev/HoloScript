/**
 * Isaac Lab Sim-to-Real Interop Tests (Path A)
 *
 * Covers the smallest HoloScript -> Isaac Lab asset/export path:
 * - PhysX/OpenUSD schema wiring for drives and per-axis friction
 * - HoloScript radians -> USD degrees conversion for angular joints
 * - Domain randomization and delayed actuator metadata
 * - Fixture parse/generate validation
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Lexer } from '../lexer';
import { Parser } from '../parser';
import { USDCodeGen } from '../usd-codegen';
import type { CompositionNode } from '../ast';

const testHoloScript = `
composition "TestArm" {
  domain_randomization: {
    physics: {
      massScale: [0.8, 1.2]
      frictionRange: [0.3, 0.7]
    }
    actuator: {
      kpNoise: 0.1
      kdNoise: 0.05
    }
    initialState: {
      jointPosRange: {
        joint1: [-0.1, 0.1]
      }
      rootPoseRange: [-0.5, 0.5, -0.5, 0.5, 0.0, 1.0]
    }
  }

  object "base" @static {
    geometry: "box"
    dimensions: [0.1, 0.1, 0.05]
    mass: 1.0
  }

  object "joint1" {
    @joint_revolute
    joint_parent: "base"
    joint_axis: [0, 0, 1]
    joint_limits: [-3.141592653589793, 3.141592653589793]
    joint_effort: 50
    max_velocity: 3.141592653589793
    kp: 100.0
    kd: 10.0
    joint_friction: 0.05
    joint_viscous_friction: 0.01
    armature: 0.001
    actuator_latency: 0.005
    actuator_group: {
      name: "arm_group"
      type: "DelayedPDActuator"
      joints: ["joint1", "joint2", "joint3"]
      stiffness: 100
      damping: 10
      friction: 0.05
      latency: 0.005
    }
  }

  object "link1" {
    geometry: "cylinder"
    radius: 0.05
    length: 0.3
    mass: 1.0
  }
}
`;

function parseHoloScript(source = testHoloScript): CompositionNode {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

describe('Isaac Lab Interop (Path A)', () => {
  describe('Parser', () => {
    it('parses composition-level domain_randomization blocks', () => {
      const ast = parseHoloScript();

      expect(ast.domainRandomization?.physics?.massScale).toEqual([0.8, 1.2]);
      expect(ast.domainRandomization?.physics?.frictionRange).toEqual([0.3, 0.7]);
      expect(ast.domainRandomization?.actuator?.kpNoise).toBe(0.1);
      expect(ast.domainRandomization?.actuator?.kdNoise).toBe(0.05);
      expect(ast.domainRandomization?.initialState?.jointPosRange?.joint1).toEqual([-0.1, 0.1]);
      expect(ast.domainRandomization?.initialState?.rootPoseRange).toEqual([
        -0.5,
        0.5,
        -0.5,
        0.5,
        0,
        1,
      ]);
    });

    it('accepts traits before and inside object bodies', () => {
      const ast = parseHoloScript();
      const base = ast.objects.find((object) => object.name === 'base');
      const joint1 = ast.objects.find((object) => object.name === 'joint1');

      expect(base?.traits).toContain('static');
      expect(joint1?.traits).toContain('joint_revolute');
    });

    it('parses drive, friction, latency, and actuator group properties', () => {
      const ast = parseHoloScript();
      const joint1 = ast.objects.find((object) => object.name === 'joint1');
      const group = joint1?.actuatorGroups?.[0];

      expect(joint1?.properties.kp).toBe(100);
      expect(joint1?.properties.kd).toBe(10);
      expect(joint1?.properties.joint_friction).toBe(0.05);
      expect(joint1?.properties.actuator_latency).toBe(0.005);
      expect(group?.name).toBe('arm_group');
      expect(group?.type).toBe('DelayedPDActuator');
      expect(group?.jointNames).toEqual(['joint1', 'joint2', 'joint3']);
      expect(group?.latency).toBe(0.005);
    });
  });

  describe('USD Codegen', () => {
    it('emits stage units and PhysX root schema assumptions', () => {
      const usd = new USDCodeGen({ isaacLabVersion: '2.3' }).generate(parseHoloScript());

      expect(usd).toContain('# Generated for Isaac Lab 2.3');
      expect(usd).toContain('metersPerUnit = 1.0');
      expect(usd).toContain('kilogramsPerMass = 1.0');
      expect(usd).toContain('# Units: meters, kilograms, seconds; HoloScript angular inputs are radians.');
      expect(usd).toContain('prepend apiSchemas = ["PhysicsArticulationRootAPI", "PhysxArticulationAPI"]');
      expect(usd).toContain('bool physxArticulation:articulationEnabled = true');
      expect(usd).not.toContain('physxArticulation:jointFriction');
    });

    it('emits applied DriveAPI and PhysxJointAxisAPI schemas on actuated joints', () => {
      const usd = new USDCodeGen().generate(parseHoloScript());

      expect(usd).toContain('prepend apiSchemas = ["PhysicsDriveAPI:angular", "PhysxJointAxisAPI:angular"]');
      expect(usd).toContain('float drive:angular:physics:stiffness = 100');
      expect(usd).toContain('float drive:angular:physics:damping = 10');
      expect(usd).toContain('float drive:angular:physics:maxForce = 50');
      expect(usd).toContain('uniform token drive:angular:physics:type = "force"');
      expect(usd).toContain('float physxJointAxis:angular:staticFrictionEffort = 0.05');
      expect(usd).toContain('float physxJointAxis:angular:dynamicFrictionEffort = 0.05');
      expect(usd).toContain('float physxJointAxis:angular:viscousFrictionCoefficient = 0.01');
      expect(usd).toContain('float physxJointAxis:angular:armature = 0.001');
      expect(usd).not.toContain('drive:angular:physics:friction');
      expect(usd).not.toContain('drive:angular:physics:latency');
    });

    it('exports angular limits and velocity in USD degrees', () => {
      const usd = new USDCodeGen().generate(parseHoloScript());

      expect(usd).toContain('float physics:lowerLimit = -180');
      expect(usd).toContain('float physics:upperLimit = 180');
      expect(usd).toContain('float physics:maxVelocity = 180');
      expect(usd).toContain('float physxJointAxis:angular:maxJointVelocity = 180');
    });

    it('emits domain randomization and delayed actuator metadata without pretending they are USD schemas', () => {
      const usd = new USDCodeGen().generate(parseHoloScript());

      expect(usd).toContain('# Domain Randomization Configuration');
      expect(usd).toContain('#   massScale: [0.8, 1.2]');
      expect(usd).toContain('#   frictionRange: [0.3, 0.7]');
      expect(usd).toContain('#   kpNoise: 0.1');
      expect(usd).toContain('#   kdNoise: 0.05');
      expect(usd).toContain('custom float holoscript:isaacLab:actuatorLatencySeconds = 0.005');
      expect(usd).toContain('#   arm_group: type=DelayedPDActuator joints=[joint1, joint2, joint3]');
    });

    it('disables DriveAPI and PhysX joint-axis output when configured off', () => {
      const usd = new USDCodeGen({
        enableDriveAttributes: false,
        enableJointFriction: false,
      }).generate(parseHoloScript());

      expect(usd).toContain('prepend apiSchemas = ["PhysicsArticulationRootAPI"]');
      expect(usd).not.toContain('PhysxArticulationAPI');
      expect(usd).not.toContain('PhysicsDriveAPI:angular');
      expect(usd).not.toContain('PhysxJointAxisAPI:angular');
      expect(usd).not.toContain('drive:angular:physics:');
      expect(usd).not.toContain('physxJointAxis:angular:');
    });

    it('parses and generates the checked-in Isaac Lab fixture', () => {
      const fixturePath = join(__dirname, '../../examples/isaac-lab-sim-to-real.holo');
      const fixtureSource = readFileSync(fixturePath, 'utf8');
      const usd = new USDCodeGen().generate(parseHoloScript(fixtureSource));

      expect(usd).toContain('def Xform "TwoLinkArm_IsaacLab"');
      expect(usd).toContain('metersPerUnit = 1.0');
      expect(usd).toContain('kilogramsPerMass = 1.0');
      expect(usd).toContain('PhysicsDriveAPI:angular');
      expect(usd).toContain('PhysxJointAxisAPI:angular');
      expect(usd).toContain('custom float holoscript:isaacLab:actuatorLatencySeconds = 0.005');
      expect(usd).toContain('# Domain Randomization Configuration');
    });
  });
});
