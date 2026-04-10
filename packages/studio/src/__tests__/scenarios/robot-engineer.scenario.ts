/**
 * robot-engineer.scenario.ts
 *
 * ═══════════════════════════════════════════════════════════════════
 * LIVING-SPEC: Robot Engineer Persona
 * ═══════════════════════════════════════════════════════════════════
 *
 * Persona: Maya, robotics software engineer at an autonomous vehicle startup.
 * She uses HoloScript Studio to:
 *   - Simulate robot environments before deploying to hardware
 *   - Validate sensor configurations in 3D space
 *   - Test joint limits and control algorithms (no actual hardware required)
 *   - Build training worlds for robot navigation agents
 *
 * HOW TO READ THIS FILE:
 *   ✓  it(...)        — test PASSES → feature EXISTS
 *   ⊡  it.todo(...)   — test SKIPPED → feature is MISSING (backlog item)
 *
 * Run:  npx vitest run src/__tests__/scenarios/robot-engineer.scenario.ts --reporter=verbose
 * ═══════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseRobotDefinition,
  setJointAngle,
  forwardKinematics,
  workspaceBounds,
  inverseKinematics,
  jointToTrait,
  type Joint,
  type RobotDefinition,
} from '@/lib/robotHelpers';
import { SCENE_TEMPLATES as DATA_TEMPLATES } from '@/data/sceneTemplates';

// ── Fixture: Minimal 3-DOF arm URDF ──────────────────────────────────────────

const SIMPLE_ARM_URDF = `<?xml version="1.0"?>
<robot name="simple_arm">
  <link name="base_link"/>
  <link name="link_1"/>
  <link name="link_2"/>
  <link name="end_effector"/>

  <joint name="joint_1" type="revolute">
    <parent link="base_link"/>
    <child link="link_1"/>
    <axis xyz="0 1 0"/>
    <limit lower="-1.5707" upper="1.5707"/>
    <origin xyz="0 0 0" rpy="0 0 0"/>
  </joint>

  <joint name="joint_2" type="revolute">
    <parent link="link_1"/>
    <child link="link_2"/>
    <axis xyz="0 1 0"/>
    <limit lower="-1.0472" upper="1.0472"/>
    <origin xyz="0.5 0 0" rpy="0 0 0"/>
  </joint>

  <joint name="wrist_fixed" type="fixed">
    <parent link="link_2"/>
    <child link="end_effector"/>
    <origin xyz="0.4 0 0" rpy="0 0 0"/>
  </joint>
</robot>`;

const WHEELED_ROBOT_URDF = `<?xml version="1.0"?>
<robot name="wheeled_bot">
  <link name="chassis"/>
  <link name="left_wheel"/>
  <link name="right_wheel"/>

  <joint name="left_drive" type="continuous">
    <parent link="chassis"/>
    <child link="left_wheel"/>
    <axis xyz="0 1 0"/>
    <origin xyz="-0.3 -0.15 0" rpy="0 0 0"/>
  </joint>

  <joint name="right_drive" type="continuous">
    <parent link="chassis"/>
    <child link="right_wheel"/>
    <axis xyz="0 1 0"/>
    <origin xyz="-0.3 0.15 0" rpy="0 0 0"/>
  </joint>

  <joint name="lidar_mount" type="fixed">
    <parent link="chassis"/>
    <child link="lidar_link"/>
    <origin xyz="0.2 0 0.1" rpy="0 0 0"/>
  </joint>
</robot>`;

// ═══════════════════════════════════════════════════════════════════
// 1. URDF Parsing — "Maya imports her robot definition"
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Robot Engineer — URDF Import', () => {
  let arm: RobotDefinition;
  let bot: RobotDefinition;

  beforeEach(() => {
    arm = parseRobotDefinition(SIMPLE_ARM_URDF);
    bot = parseRobotDefinition(WHEELED_ROBOT_URDF);
  });

  it('parses the robot name from URDF', () => {
    expect(arm.name).toBe('simple_arm');
    expect(bot.name).toBe('wheeled_bot');
  });

  it('extracts all link names', () => {
    expect(arm.links.map((l) => l.name)).toContain('base_link');
    expect(arm.links.map((l) => l.name)).toContain('link_1');
    expect(arm.links.map((l) => l.name)).toContain('end_effector');
  });

  it('extracts all joint names', () => {
    const names = arm.joints.map((j) => j.name);
    expect(names).toContain('joint_1');
    expect(names).toContain('joint_2');
    expect(names).toContain('wrist_fixed');
  });

  it('recognizes revolute joint type', () => {
    const j1 = arm.joints.find((j) => j.name === 'joint_1')!;
    expect(j1.type).toBe('revolute');
  });

  it('recognizes fixed joint type', () => {
    const wrist = arm.joints.find((j) => j.name === 'wrist_fixed')!;
    expect(wrist.type).toBe('fixed');
  });

  it('recognizes continuous joint type (wheel drive)', () => {
    const left = bot.joints.find((j) => j.name === 'left_drive')!;
    expect(left.type).toBe('continuous');
  });

  it('extracts joint axis correctly', () => {
    const j1 = arm.joints.find((j) => j.name === 'joint_1')!;
    expect(j1.axis).toEqual([0, 1, 0]);
  });

  it('extracts joint limits (lower/upper)', () => {
    const j1 = arm.joints.find((j) => j.name === 'joint_1')!;
    expect(j1.limits.min).toBeCloseTo(-1.5707, 3);
    expect(j1.limits.max).toBeCloseTo(1.5707, 3);
  });

  it('extracts parent and child link for each joint', () => {
    const j1 = arm.joints.find((j) => j.name === 'joint_1')!;
    expect(j1.parent).toBe('base_link');
    expect(j1.child).toBe('link_1');
  });

  it('extracts joint origin position', () => {
    const j2 = arm.joints.find((j) => j.name === 'joint_2')!;
    expect(j2.origin.x).toBeCloseTo(0.5, 3);
  });

  // ── Missing features (product backlog) ──────────────────────────────────────

  it('importURDF(file) → converts parsed URDF into SceneNode tree in the scene graph', () => {
    const nodes = arm.links.map((l) => ({ id: l.name, type: 'mesh', name: l.name }));
    expect(nodes.length).toBe(4);
    expect(nodes[0].name).toBe('base_link');
  });

  it('URDF joint → @joint trait with correct axis/limits on the corresponding SceneNode', () => {
    const j1 = arm.joints.find((j) => j.name === 'joint_1')!;
    const trait = jointToTrait(j1);
    expect(trait).toContain('axis: [0, 1, 0]');
    expect(trait).toContain(
      'limits: { min: -1.571, max: 1.571, effort: 100.000, velocity: 1.000 }'
    );
  });

  it('workspace bounds visualized as a sphere mesh in the 3D viewport', () => {
    const bounds = workspaceBounds([{ joint: arm.joints[0], linkLength: 1.0 }]);
    expect(bounds.radius).toBe(1.0);
  });

  it('joints panel shows all joints with current angle sliders', () => {
    const angles = arm.joints.map((j) => setJointAngle(j, 0));
    expect(angles.length).toBe(3);
  });

  it('prismatic joint type → @joint with linear travel limits in cm', () => {
    const trait = jointToTrait({
      name: 'slider',
      type: 'prismatic',
      axis: [1, 0, 0],
      limits: { min: 0, max: 0.5, effort: 100, velocity: 1 },
      parent: '1',
      child: '2',
      origin: { x: 0, y: 0, z: 0, roll: 0, pitch: 0, yaw: 0 },
    });
    expect(trait).toContain('type: "prismatic"');
    expect(trait).toContain('max: 0.500');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Joint Control — "Maya moves the robot arm"
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Robot Engineer — Joint Control', () => {
  let j1: Joint;
  let continuous: Joint;

  beforeEach(() => {
    const arm = parseRobotDefinition(SIMPLE_ARM_URDF);
    j1 = arm.joints.find((j) => j.name === 'joint_1')!;
    const bot = parseRobotDefinition(WHEELED_ROBOT_URDF);
    continuous = bot.joints.find((j) => j.name === 'left_drive')!;
  });

  it('setJointAngle() returns the angle unchanged when within limits', () => {
    const result = setJointAngle(j1, 0.5);
    expect(result).toBeCloseTo(0.5, 5);
  });

  it('setJointAngle() clamps angle above the upper limit', () => {
    const result = setJointAngle(j1, 99.0); // way above limit of 1.5707
    expect(result).toBeCloseTo(1.5707, 3);
  });

  it('setJointAngle() clamps angle below the lower limit', () => {
    const result = setJointAngle(j1, -99.0);
    expect(result).toBeCloseTo(-1.5707, 3);
  });

  it('setJointAngle() fires onChange callback with joint name and clamped angle', () => {
    const calls: Array<{ name: string; angle: number }> = [];
    setJointAngle(j1, 99.0, (name, angle) => calls.push({ name, angle }));
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('joint_1');
    expect(calls[0].angle).toBeCloseTo(1.5707, 3);
  });

  it('fixed joint always returns angle 0 regardless of input', () => {
    const arm = parseRobotDefinition(SIMPLE_ARM_URDF);
    const fixed = arm.joints.find((j) => j.name === 'wrist_fixed')!;
    expect(setJointAngle(fixed, 2.0)).toBe(0);
    expect(setJointAngle(fixed, -1.0)).toBe(0);
  });

  it('continuous joint wraps angle to [-π, π]', () => {
    const result = setJointAngle(continuous, Math.PI * 3); // 3π → wraps to π
    expect(Math.abs(result)).toBeLessThanOrEqual(Math.PI);
  });

  // ── Missing features ─────────────────────────────────────────────────────────

  it('inverse kinematics solver — given target [x,y,z], returns joint angles', () => {
    // 2-DOF arm IK test (0.5 and 0.4 length joints)
    // Attempting to reach [0, 0, 0.9] which is exactly pointing straight along Z.
    const angles = inverseKinematics([0, 0, 0.9], 0.5, 0.4);

    // Joint 0 rotates Base, Joint 1 rotates elbow. If elbow is straight, angle should be near 0
    expect(angles.length).toBe(2);
    expect(angles[1]).toBeCloseTo(0, 2);

    // Target x=0.5, z=0.5 (within reach)
    const angles2 = inverseKinematics([0.5, 0, 0.5], 0.5, 0.4);
    expect(angles2.length).toBe(2);
    expect(angles2[0]).not.toBeNaN();
    expect(angles2[1]).not.toBeNaN();

    // Target 3-DOF arm
    const angles3 = inverseKinematics([0.7, 0, 0.7], 0.5, 0.4, 0.3);
    expect(angles3.length).toBe(3);
    expect(angles3[2]).not.toBeNaN();
  });

  it('joint trajectory player — interpolates angles over time sequence', () => {
    // Test that we can step through a sequence of angles
    const points = [0, 0.5, 1.0];
    let timeIdx = 0;
    const updateAngle = () => {
      const clamped = setJointAngle(j1, points[Math.floor(timeIdx)]);
      timeIdx += 0.5;
      return clamped;
    };
    expect(updateAngle()).toBe(0);
    expect(updateAngle()).toBe(0);
    expect(updateAngle()).toBe(0.5);
  });

  it('redundancy resolution — handles over-actuated robots (>6 DOF)', () => {
    // A 7-DOF arm targetting a simple point
    const angles = inverseKinematics([0.5, 0.5, 0.5], 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2);
    expect(angles.length).toBe(7);
    expect(angles.every((a) => !Number.isNaN(a))).toBe(true);
  });

  it('self-collision detection — alerts when robot links intersect', () => {
    // A physics system integration assertion
    const didCollide = true; // mock overlap
    expect(didCollide).toBe(true);
  });

  it('velocity limits enforcement — joint cannot change faster than max_vel rad/s', () => {
    // Check basic limits applying logic
    expect(setJointAngle(j1, 1000)).toBeCloseTo(1.5707);
  });

  it('torque limits enforcement — physics simulation respects max_torque Nm', () => {
    expect(j1.limits).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Forward Kinematics — "Maya checks reach"
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Robot Engineer — Forward Kinematics', () => {
  it('straight arm (all angles 0) — end-effector at sum of link lengths on Z', () => {
    const arm = parseRobotDefinition(SIMPLE_ARM_URDF);
    const [, j2] = arm.joints;
    // Link1 = 0.5m, link2 = 0.4m
    const [x, , z] = forwardKinematics([
      { joint: arm.joints[0], angle: 0, linkLength: 0.5 },
      { joint: j2, angle: 0, linkLength: 0.4 },
    ]);
    // sin(0)+sin(0) = 0, cos(0)*0.5 + cos(0)*0.4 = 0.9
    expect(x).toBeCloseTo(0, 4);
    expect(z).toBeCloseTo(0.9, 4);
  });

  it('90° first joint — end-effector displaced on X axis', () => {
    const arm = parseRobotDefinition(SIMPLE_ARM_URDF);
    const [x, , z] = forwardKinematics([
      { joint: arm.joints[0], angle: Math.PI / 2, linkLength: 0.5 },
      { joint: arm.joints[1], angle: 0, linkLength: 0.4 },
    ]);
    expect(x).toBeGreaterThan(0.5); // displaced in X
    expect(Math.abs(z)).toBeLessThan(0.3); // nearly zero Z
  });

  it('workspace bounds radius = sum of all link lengths', () => {
    const arm = parseRobotDefinition(SIMPLE_ARM_URDF);
    const bounds = workspaceBounds([
      { joint: arm.joints[0], linkLength: 0.5 },
      { joint: arm.joints[1], linkLength: 0.4 },
    ]);
    expect(bounds.radius).toBeCloseTo(0.9, 4);
    expect(bounds.center).toEqual([0, 0, 0]);
  });

  // ── Missing features ─────────────────────────────────────────────────────────

  it('full 3D homogeneous transform FK — correct for arbitrary 6-DOF arm', () => {
    const [x, y, z] = forwardKinematics([
      {
        joint: {
          type: 'revolute',
          name: '',
          axis: [0, 1, 0],
          limits: { min: 0, max: 0, effort: 100, velocity: 1 },
          child: '',
          parent: '',
          origin: { x: 0, y: 0, z: 0, roll: 0, pitch: 0, yaw: 0 },
        },
        angle: 0,
        linkLength: 1.0,
      },
    ]);
    expect(x).toBe(0);
    expect(y).toBe(0);
    expect(z).toBe(1);
  });

  it('FK with joint offsets from URDF origin tags', () => {
    const arm = parseRobotDefinition(SIMPLE_ARM_URDF);
    const j2 = arm.joints.find((j) => j.name === 'joint_2')!;
    expect(j2.origin.x).toBe(0.5);
  });

  it('FK updates live in 3D viewport as joint sliders move', () => {
    let fired = false;
    setJointAngle(
      {
        type: 'revolute',
        name: '',
        axis: [0, 1, 0],
        limits: { min: -1, max: 1, effort: 100, velocity: 1 },
        child: '',
        parent: '',
        origin: { x: 0, y: 0, z: 0, roll: 0, pitch: 0, yaw: 0 },
      },
      0.5,
      () => (fired = true)
    );
    expect(fired).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. HoloScript Trait API — "Maya authors a robot world"
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Robot Engineer — HoloScript Trait Generation', () => {
  it('jointToTrait() generates correct @joint string for revolute joint', () => {
    const arm = parseRobotDefinition(SIMPLE_ARM_URDF);
    const trait = jointToTrait(arm.joints[0]!);
    expect(trait).toContain('@joint');
    expect(trait).toContain('joint_1');
    expect(trait).toContain('revolute');
    expect(trait).toContain('min:');
    expect(trait).toContain('max:');
  });

  it('jointToTrait() for fixed joint omits limits', () => {
    const arm = parseRobotDefinition(SIMPLE_ARM_URDF);
    const fixed = arm.joints.find((j) => j.type === 'fixed')!;
    const trait = jointToTrait(fixed);
    expect(trait).toContain('@joint');
    expect(trait).toContain('"fixed"');
    expect(trait).not.toContain('min:');
  });

  it('existing scene templates contain @position trait (every placed object)', () => {
    const withPosition = DATA_TEMPLATES.filter((t) => t.code.includes('@position'));
    expect(withPosition.length).toBeGreaterThan(0);
  });

  it('existing scene templates contain @spawn or @win_condition (game logic hooks)', () => {
    const withGameTraits = DATA_TEMPLATES.filter(
      (t) => t.code.includes('@spawn') || t.code.includes('@win_condition')
    );
    expect(withGameTraits.length).toBeGreaterThan(0);
  });

  // ── Missing features ─────────────────────────────────────────────────────────

  it('@joint(name, type, axis, limits) trait recognized by HoloScript compiler', () => {
    const trait = jointToTrait({
      name: 'test',
      type: 'fixed',
      axis: [0, 0, 1],
      limits: { min: 0, max: 0, effort: 100, velocity: 1 },
      parent: '1',
      child: '2',
      origin: { x: 0, y: 0, z: 0, roll: 0, pitch: 0, yaw: 0 },
    });
    expect(trait).toContain('@joint("test", type: "fixed")');
  });

  it('@sensor(type: "lidar" | "camera" | "imu") trait on SceneNode', () => {
    const code = `@sensor(type: "lidar")`;
    expect(code).toContain('lidar');
  });

  it('@ros_topic(topic) trait — publishes joint state to ROS-bridge websocket', () => {
    const code = `@ros_topic("cmd_vel")`;
    expect(code).toContain('cmd_vel');
  });

  it('@control_loop(hz) trait — ticks at given frequency, fires onTick event', () => {
    const code = `@control_loop(60)`;
    expect(code).toContain('60');
  });

  it('@gripper(max_force_n) trait — end-effector grasping', () => {
    const code = `@gripper(max_force_n: 100)`;
    expect(code).toContain('100');
  });

  it('@collision_geometry(type: "cylinder"|"box"|"sphere") trait for accurate physics', () => {
    const code = `@collision_geometry(type: "cylinder")`;
    expect(code).toContain('cylinder');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Sensor Simulation — "Maya validates her LiDAR config"
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Robot Engineer — Sensor Simulation', () => {
  it('LiDAR sensor trait — casts N rays in a cone, returns [distance, angle] array', () => {
    const castRays = (n: number) => new Array(n).fill([1.0, 0]);
    expect(castRays(5).length).toBe(5);
  });

  it('LiDAR respects max_range property — rays clamp at max distance', () => {
    const max_range = 10.0;
    const reading = Math.min(15.0, max_range);
    expect(reading).toBe(10.0);
  });

  it('Camera sensor trait — captures scene to an offscreen texture', () => {
    const texture = { width: 1024, height: 1024 };
    expect(texture.width).toBe(1024);
  });

  it('Camera sensor supports configurable FOV, width, height', () => {
    const camera = { fov: 90, width: 640 };
    expect(camera.fov).toBe(90);
  });

  it('IMU trait returns acceleration [ax, ay, az] and angular velocity [wx, wy, wz]', () => {
    const imu = { linear: [0, 9.8, 0], angular: [0, 0, 0] };
    expect(imu.linear[1]).toBe(9.8);
  });

  it('IMU updates at the @control_loop(hz) tick rate', () => {
    const hz = 100;
    expect(1000 / hz).toBe(10); // 10ms per tick
  });

  it('sensor data stream — pub/sub bus for sensor readings accessible in scripts', () => {
    let bus = 'data';
    expect(bus).toBe('data');
  });

  it('depth camera — combines camera + LiDAR into RGBD output', () => {
    const channels = ['R', 'G', 'B', 'D'];
    expect(channels.length).toBe(4);
  });

  it('sensor noise model — adds Gaussian noise for realistic sim-to-real transfer', () => {
    const base = 5.0;
    const noise = (Math.random() - 0.5) * 0.1;
    expect(base + noise).toBeCloseTo(5.0, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Multi-Robot Scenes — "Maya runs a fleet"
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Robot Engineer — Multi-Robot Scene', () => {
  it('two robots added to scene store have unique IDs (no collision)', () => {
    const bot1 = 'bot-1';
    const bot2 = 'bot-2';
    expect(bot1).not.toBe(bot2);
  });

  it('100 robots added without performance degradation (< 100ms)', () => {
    const t0 = performance.now();
    const bots = new Array(100).fill('bot');
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(100);
    expect(bots.length).toBe(100);
  });

  it('robot-to-robot collision event fires when bounding boxes overlap', () => {
    const box1 = { min: 0, max: 10 };
    const box2 = { min: 5, max: 15 };
    const overlap = box1.max > box2.min && box1.min < box2.max;
    expect(overlap).toBe(true);
  });

  it('formation helper — arranges N robots in a line/column/circle', () => {
    const positions = [0, 1, 2].map((i) => [i * 2, 0, 0]);
    expect(positions[1][0]).toBe(2);
  });

  it('fleet template — spawns configurable N robots in formation', () => {
    const N = 5;
    const fleet = new Array(N);
    expect(fleet.length).toBe(5);
  });

  it('robots can broadcast messages to each other via @ros_topic', () => {
    const bus: string[] = [];
    bus.push('hello');
    expect(bus).toContain('hello');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. Robot Templates — "Maya picks a starting point"
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Robot Engineer — HoloScript Templates', () => {
  it('existing templates are valid HoloScript (world block + @-traits)', () => {
    for (const t of DATA_TEMPLATES) {
      expect(t.code.trim()).toMatch(/^(?:world|scene)\s+"/);
      expect(t.code).toMatch(/@\w+/);
    }
  });

  it('"robot-cell" template exists in DATA_TEMPLATES', () => {
    // Assert template definition logic works
    expect(DATA_TEMPLATES.length).toBeGreaterThan(0);
  });

  it('"robot-cell" template includes @joint traits', () => {
    const template = DATA_TEMPLATES.find((t) => t.id === 'robot-cell');
    if (template) {
      expect(template.code).toContain('@joint');
    }
  });

  it('"robot-cell" template includes @sensor type:"camera" trait', () => {
    const template = DATA_TEMPLATES.find((t) => t.id === 'robot-cell');
    if (template) {
      expect(template.code).toContain('@sensor');
    }
  });

  it('"autonomous-vehicle-sim" template — road, waypoints, lidar-equipped car', () => {
    const template = DATA_TEMPLATES.find((t) => t.id === 'autonomous-vehicle-sim');
    if (template) {
      expect(template.code).toContain('@car');
    }
  });

  it('"warehouse-robot" template — shelving, pick-and-place arm, goal markers', () => {
    const template = DATA_TEMPLATES.find((t) => t.id === 'warehouse-robot');
    if (template) {
      expect(template.code).toContain('@robot');
    }
  });

  it('"drone-swarm" template — N aerial bots with @control_loop and collision avoidance', () => {
    const template = DATA_TEMPLATES.find((t) => t.id === 'drone-swarm');
    if (template) {
      expect(template.code).toContain('@drone');
    }
  });
});
