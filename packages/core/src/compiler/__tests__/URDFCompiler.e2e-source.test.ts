/**
 * URDF/USD Articulation — END-TO-END from SOURCE
 *
 * The sibling `URDFCompiler.articulation.test.ts` hand-builds the parser-OUTPUT
 * trait format and calls the compiler directly. That proves the compiler works
 * for ONE trait shape but BYPASSES the parser — so it never caught that real
 * `.holo` source (which the robotics-plugin examples author with the
 * `@joint_revolute` trait family + `joint_*` properties) compiled to a robot
 * with every joint welded `fixed`, no kinematic chain, a duplicated base_link,
 * and default geometry.
 *
 * This test closes that gap: it PARSES source with the real parser
 * (`parseHoloStrict`, the production entry) and asserts the compiled robot is
 * genuinely articulated — the falsifiable, failing-if-broken evidence for the
 * "write a robot in HoloScript → get NVIDIA-Isaac-ready output" claim.
 */

import { describe, it, expect, vi } from 'vitest';
import { URDFCompiler } from '../URDFCompiler';
import { USDPhysicsCompiler } from '../USDPhysicsCompiler';
import { parseHoloStrict } from '../../parser/HoloCompositionParser';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

// A clean 3-link arm authored the way the robotics examples do it:
// joint type via the @joint_revolute trait, kinematics via joint_* properties.
const ARM_SOURCE = `composition "ArmRobot" {
  object "base_link" {
    @static
    geometry: "cylinder"
    radius: 0.1
    length: 0.1
    mass: 1.0
  }
  object "upper_arm" {
    @joint_revolute
    joint_parent: "base_link"
    joint_axis: [0, 0, 1]
    joint_limits: [-1.5707963, 1.5707963]
    geometry: "cylinder"
    radius: 0.05
    length: 0.4
    mass: 0.5
    position: [0, 0, 0.3]
  }
  object "forearm" {
    @joint_revolute
    joint_parent: "upper_arm"
    joint_axis: [0, 1, 0]
    joint_limits: [-1.0, 1.0]
    geometry: "cylinder"
    radius: 0.04
    length: 0.35
    mass: 0.3
    position: [0, 0, 0.7]
  }
}`;

const countOf = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe('URDF articulation — end-to-end from parsed source', () => {
  const composition = parseHoloStrict(ARM_SOURCE);
  const urdf = new URDFCompiler({ includeInertial: true, robotName: 'ArmRobot' }).compile(
    composition,
    'test-token'
  );

  it('parses the source into three named objects', () => {
    expect(composition.objects.map((o) => o.name)).toEqual(['base_link', 'upper_arm', 'forearm']);
  });

  it('emits exactly one base_link (no synthetic duplicate)', () => {
    expect(countOf(urdf, /<link\s+name="base_link"/g)).toBe(1);
  });

  it('emits the two moving joints as type="revolute", never welded fixed', () => {
    expect(countOf(urdf, /type="revolute"/g)).toBe(2);
    expect(countOf(urdf, /type="fixed"/g)).toBe(0);
  });

  it('builds the real kinematic chain from joint_parent', () => {
    // upper_arm hangs off base_link; forearm hangs off upper_arm.
    expect(urdf).toMatch(/<parent\s+link="base_link"\s*\/>\s*<child\s+link="upper_arm"\s*\/>/);
    expect(urdf).toMatch(/<parent\s+link="upper_arm"\s*\/>\s*<child\s+link="forearm"\s*\/>/);
  });

  it('honors joint_axis per joint', () => {
    expect(urdf).toContain('xyz="0 0 1"'); // shoulder Z
    expect(urdf).toContain('xyz="0 1 0"'); // elbow Y
  });

  it('round-trips revolute joint_limits radians to correct URDF radians', () => {
    // shoulder ±1.5707963 rad must survive the rad→deg→rad normalization ~unscaled,
    // NOT emerge as the 57.3× category-wrong ~90 that an ungated conversion produces.
    expect(urdf).toMatch(/lower="-1\.570[0-9]*"/);
    expect(urdf).toMatch(/upper="1\.570[0-9]*"/);
    expect(urdf).not.toMatch(/upper="[89][0-9]\./);
  });

  it('reads real geometry radii from source (not the 0.5 default)', () => {
    expect(urdf).toContain('radius="0.05"');
    expect(urdf).toContain('radius="0.04"');
  });

  it('carries per-link mass from source', () => {
    expect(urdf).toContain('value="0.5"');
    expect(urdf).toContain('value="0.3"');
  });
});

describe('URDF prismatic joint_limits are LINEAR meters, not angular (P1 regression)', () => {
  // A sliding gripper: joint_limits [0, 0.04] are METERS and must pass through
  // unscaled. An ungated rad→deg conversion would turn a 4 cm stroke into 2.29 m.
  const PRISMATIC_SOURCE = `composition "Slider" {
  object "base_link" {
    @static
    geometry: "box"
    mass: 1.0
  }
  object "carriage" {
    @joint_prismatic
    joint_parent: "base_link"
    joint_axis: [1, 0, 0]
    joint_limits: [0, 0.04]
    geometry: "box"
    mass: 0.2
  }
}`;
  const urdf = new URDFCompiler({ includeInertial: true, robotName: 'Slider' }).compile(
    parseHoloStrict(PRISMATIC_SOURCE),
    'test-token'
  );

  it('emits a prismatic joint from @joint_prismatic', () => {
    expect(urdf).toContain('type="prismatic"');
  });

  it('preserves the 0.04 m stroke unscaled (never the 2.29 m rad→deg bug)', () => {
    expect(urdf).toMatch(/upper="0\.04/);
    expect(urdf).not.toMatch(/upper="2\.2/);
  });
});

describe('USD articulation — end-to-end from parsed source', () => {
  const composition = parseHoloStrict(ARM_SOURCE);
  const usd = new USDPhysicsCompiler({ targetContext: 'isaac_sim' }).compile(
    composition,
    'test-token',
    'arm_robot.usda'
  );

  it('marks the robot as an articulation root for Isaac Sim', () => {
    expect(usd).toContain('PhysicsArticulationRootAPI');
  });

  it('emits revolute joint prims, not fixed', () => {
    expect(usd).toMatch(/RevoluteJoint/);
  });
});
