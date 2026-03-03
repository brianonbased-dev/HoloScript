/**
 * URDFCompiler v2.0 — Enhanced Feature Test Suite
 *
 * Covers all v2.0 features added to match USD Physics Compiler sophistication:
 *   - Gazebo plugin generation (per-link materials, friction, self-collision, ros2_control plugin)
 *   - ros2_control hardware interface tags
 *   - Sensor support (camera, IMU, lidar, force-torque, contact, GPS, depth camera)
 *   - Transmission definitions (from @actuator trait)
 *   - Mimic joint configuration
 *   - Safety controller limits
 *   - Material color parsing (hex colors, named colors)
 *   - Convenience functions: compileToURDF, compileForROS2, compileForGazebo
 *   - ROS 2 launch file generation: generateROS2LaunchFile
 *   - Controllers YAML generation: generateControllersYaml
 *   - Mesh scale support
 *   - 3D scale extraction
 *   - Backward compatibility with v1.0 API
 *
 * @version 2.0.0
 */

import { describe, it, expect, beforeEach, vi} from 'vitest';
import {
  URDFCompiler,
  compileToURDF,
  compileForROS2,
  compileForGazebo,
  generateROS2LaunchFile,
  generateControllersYaml,
} from '../URDFCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});


// =============================================================================
// TEST HELPERS
// =============================================================================

function makeComp(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    name: 'TestRobot',
    objects: [],
    lights: [],
    timelines: [],
    transitions: [],
    ...overrides,
  } as HoloComposition;
}

function makeObj(
  name: string,
  props: Array<{ key: string; value: unknown }> = [],
  traits: any[] = []
): HoloObjectDecl {
  return {
    name,
    properties: props.map(({ key, value }) => ({ key, value })),
    traits,
    children: [],
  } as any;
}

// =============================================================================
// GAZEBO PLUGIN TESTS
// =============================================================================

describe('URDFCompiler v2.0 — Gazebo Plugins', () => {
  it('includes Gazebo plugin section when includeGazeboPlugins is true', () => {
    const compiler = new URDFCompiler({ includeGazeboPlugins: true });
    const obj = makeObj('arm', [{ key: 'geometry', value: 'box' }], ['collidable']);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<!-- Gazebo Plugins -->');
    expect(xml).toContain('<gazebo>');
  });

  it('excludes Gazebo plugin section when includeGazeboPlugins is false (default)', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj('arm', [{ key: 'geometry', value: 'box' }]);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).not.toContain('<!-- Gazebo Plugins -->');
  });

  it('includes self_collide tag when enableSelfCollision is true', () => {
    const compiler = new URDFCompiler({
      includeGazeboPlugins: true,
      enableSelfCollision: true,
    });
    const xml = compiler.compile(makeComp(), 'test-token');

    expect(xml).toContain('<self_collide>true</self_collide>');
  });

  it('excludes self_collide tag when enableSelfCollision is false (default)', () => {
    const compiler = new URDFCompiler({ includeGazeboPlugins: true });
    const xml = compiler.compile(makeComp(), 'test-token');

    expect(xml).not.toContain('<self_collide>');
  });

  it('emits per-link Gazebo material for colored objects', () => {
    const compiler = new URDFCompiler({ includeGazeboPlugins: true });
    const obj = makeObj(
      'colored_link',
      [
        { key: 'geometry', value: 'box' },
        { key: 'color', value: 'red' },
      ],
      ['collidable']
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<gazebo reference="colored_link">');
    expect(xml).toContain('Gazebo/Red');
  });

  it('emits friction parameters for collision links', () => {
    const compiler = new URDFCompiler({
      includeGazeboPlugins: true,
      defaultMu1: 0.8,
      defaultMu2: 0.6,
      defaultKp: 1e7,
      defaultKd: 200,
    });
    const obj = makeObj('floor', [{ key: 'geometry', value: 'box' }], ['collidable']);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<mu1>0.8</mu1>');
    expect(xml).toContain('<mu2>0.6</mu2>');
    expect(xml).toContain('<kp>10000000</kp>');
    expect(xml).toContain('<kd>200</kd>');
  });

  it('maps named colors to Gazebo built-in colors', () => {
    const compiler = new URDFCompiler({ includeGazeboPlugins: true });

    // Test several named colors
    const colors = ['red', 'green', 'blue', 'yellow', 'white', 'black', 'orange'];
    const expected = ['Red', 'Green', 'Blue', 'Yellow', 'White', 'Black', 'Orange'];

    for (let i = 0; i < colors.length; i++) {
      const obj = makeObj(
        `link_${colors[i]}`,
        [
          { key: 'geometry', value: 'box' },
          { key: 'color', value: colors[i] },
        ],
        ['collidable']
      );
      const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
      expect(xml).toContain(`Gazebo/${expected[i]}`);
    }
  });

  it('maps hex color to closest Gazebo color', () => {
    const compiler = new URDFCompiler({ includeGazeboPlugins: true });
    const obj = makeObj(
      'red_hex',
      [
        { key: 'geometry', value: 'box' },
        { key: 'color', value: '#FF0000' },
      ],
      ['collidable']
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('Gazebo/Red');
  });
});

// =============================================================================
// ROS 2 CONTROL TESTS
// =============================================================================

describe('URDFCompiler v2.0 — ros2_control', () => {
  it('includes ros2_control block when enabled with actuated joints', () => {
    const compiler = new URDFCompiler({
      includeROS2Control: true,
    });
    const obj = makeObj(
      'joint_link',
      [{ key: 'geometry', value: 'cylinder' }],
      [
        {
          name: 'joint',
          jointType: 'revolute',
          axis: { x: 0, y: 0, z: 1 },
          limits: { min: -90, max: 90 },
        },
      ]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<!-- ROS 2 Control Hardware Interface -->');
    expect(xml).toContain('<ros2_control');
    expect(xml).toContain('type="system"');
    expect(xml).toContain('<plugin>gz_ros2_control/GazeboSimSystem</plugin>');
  });

  it('includes command and state interfaces for revolute joints', () => {
    const compiler = new URDFCompiler({ includeROS2Control: true });
    const obj = makeObj(
      'revolute_link',
      [{ key: 'geometry', value: 'cylinder' }],
      [
        {
          name: 'joint',
          jointType: 'revolute',
          axis: { x: 0, y: 0, z: 1 },
          limits: { min: -90, max: 90 },
        },
      ]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<command_interface name="position"/>');
    expect(xml).toContain('<state_interface name="position"/>');
    expect(xml).toContain('<state_interface name="velocity"/>');
  });

  it('does not include ros2_control for fixed joints only', () => {
    const compiler = new URDFCompiler({ includeROS2Control: true });
    const obj = makeObj('fixed_link', [{ key: 'geometry', value: 'box' }]);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).not.toContain('<ros2_control');
  });

  it('includes Gazebo ros2_control plugin when both are enabled', () => {
    const compiler = new URDFCompiler({
      includeGazeboPlugins: true,
      includeROS2Control: true,
      packageName: 'my_robot_pkg',
    });
    const obj = makeObj(
      'actuated',
      [{ key: 'geometry', value: 'cylinder' }],
      [
        {
          name: 'joint',
          jointType: 'revolute',
          axis: { x: 0, y: 0, z: 1 },
          limits: { min: -90, max: 90 },
        },
      ]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('gz_ros2_control-system');
    expect(xml).toContain('my_robot_pkg');
    expect(xml).toContain('controllers.yaml');
  });

  it('handles mimic joints in ros2_control block', () => {
    const compiler = new URDFCompiler({ includeROS2Control: true });
    const obj = makeObj(
      'mimic_link',
      [{ key: 'geometry', value: 'cylinder' }],
      [
        {
          name: 'joint',
          jointType: 'revolute',
          axis: { x: 0, y: 0, z: 1 },
          limits: { min: -90, max: 90 },
          mimic: {
            joint: 'leader_joint',
            multiplier: 1.0,
            offset: 0.0,
          },
        },
      ]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    // ros2_control block should have mimic params
    expect(xml).toContain('<param name="mimic">leader_joint</param>');
    expect(xml).toContain('<param name="multiplier">1</param>');
  });
});

// =============================================================================
// SENSOR TESTS
// =============================================================================

describe('URDFCompiler v2.0 — Sensors', () => {
  it('creates camera sensor from @sensor trait', () => {
    const compiler = new URDFCompiler({ includeGazeboPlugins: true });
    const obj = makeObj(
      'camera_link',
      [{ key: 'geometry', value: 'box' }],
      [
        {
          name: 'sensor',
          sensorType: 'camera',
          fov: 1.5708,
          width: 1920,
          height: 1080,
          clipNear: 0.05,
          clipFar: 50,
        },
      ]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<sensor name="camera_link_camera_sensor"');
    expect(xml).toContain('type="camera"');
    expect(xml).toContain('<horizontal_fov>1.5708</horizontal_fov>');
    expect(xml).toContain('<width>1920</width>');
    expect(xml).toContain('<height>1080</height>');
    expect(xml).toContain('<near>0.05</near>');
    expect(xml).toContain('<far>50</far>');
    expect(xml).toContain('libgazebo_ros_camera.so');
  });

  it('creates IMU sensor from @sensor trait', () => {
    const compiler = new URDFCompiler({ includeGazeboPlugins: true });
    const obj = makeObj(
      'imu_link',
      [{ key: 'geometry', value: 'box' }],
      [
        {
          name: 'sensor',
          sensorType: 'imu',
          noise: 0.01,
          updateRate: 100,
        },
      ]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<sensor name="imu_link_imu_sensor"');
    expect(xml).toContain('type="imu"');
    expect(xml).toContain('<update_rate>100</update_rate>');
    expect(xml).toContain('<stddev>0.01</stddev>');
    expect(xml).toContain('libgazebo_ros_imu_sensor.so');
  });

  it('creates lidar sensor from @sensor trait', () => {
    const compiler = new URDFCompiler({ includeGazeboPlugins: true });
    const obj = makeObj(
      'lidar_link',
      [{ key: 'geometry', value: 'box' }],
      [
        {
          name: 'sensor',
          sensorType: 'lidar',
          samples: 720,
          minRange: 0.2,
          maxRange: 25.0,
          topic: '/scan',
        },
      ]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<sensor name="lidar_link_lidar_sensor"');
    expect(xml).toContain('type="ray"');
    expect(xml).toContain('<samples>720</samples>');
    expect(xml).toContain('<min>0.2</min>');
    expect(xml).toContain('<max>25</max>');
    expect(xml).toContain('libgazebo_ros_ray_sensor.so');
    expect(xml).toContain('sensor_msgs/LaserScan');
  });

  it('creates contact sensor from @sensor trait', () => {
    const compiler = new URDFCompiler({ includeGazeboPlugins: true });
    const obj = makeObj(
      'bumper_link',
      [{ key: 'geometry', value: 'box' }],
      [
        {
          name: 'sensor',
          sensorType: 'contact',
          topic: '/bumper_contact',
        },
      ]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('type="contact"');
    expect(xml).toContain('<collision>bumper_link_collision</collision>');
    expect(xml).toContain('libgazebo_ros_bumper.so');
    expect(xml).toContain('/bumper_contact');
  });

  it('creates force-torque sensor from @sensor trait', () => {
    const compiler = new URDFCompiler({ includeGazeboPlugins: true });
    const obj = makeObj(
      'ft_link',
      [{ key: 'geometry', value: 'cylinder' }],
      [
        {
          name: 'sensor',
          sensorType: 'force_torque',
        },
      ]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('type="force_torque"');
    expect(xml).toContain('<measure_direction>child_to_parent</measure_direction>');
  });

  it('creates GPS sensor from @sensor trait', () => {
    const compiler = new URDFCompiler({ includeGazeboPlugins: true });
    const obj = makeObj(
      'gps_link',
      [{ key: 'geometry', value: 'box' }],
      [
        {
          name: 'sensor',
          sensorType: 'gps',
          topic: '/gps/fix',
        },
      ]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('type="gps"');
    expect(xml).toContain('libgazebo_ros_gps_sensor.so');
    expect(xml).toContain('/gps/fix');
  });

  it('creates depth camera sensor from @sensor trait', () => {
    const compiler = new URDFCompiler({ includeGazeboPlugins: true });
    const obj = makeObj(
      'depth_link',
      [{ key: 'geometry', value: 'box' }],
      [
        {
          name: 'sensor',
          sensorType: 'depth_camera',
          width: 640,
          height: 480,
        },
      ]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('type="depth"');
    expect(xml).toContain('<camera>');
    expect(xml).toContain('<width>640</width>');
    expect(xml).toContain('<height>480</height>');
  });

  it('maps alternative sensor type names correctly', () => {
    const compiler = new URDFCompiler({ includeGazeboPlugins: true });

    // Test 'laser' maps to lidar/ray
    const obj1 = makeObj(
      'laser_link',
      [{ key: 'geometry', value: 'box' }],
      [{ name: 'sensor', sensorType: 'laser' }]
    );
    const xml1 = compiler.compile(makeComp({ objects: [obj1] }), 'test-token');
    expect(xml1).toContain('type="ray"');

    // Test 'bumper' maps to contact
    const obj2 = makeObj(
      'bumper_link2',
      [{ key: 'geometry', value: 'box' }],
      [{ name: 'sensor', sensorType: 'bumper' }]
    );
    const xml2 = compiler.compile(makeComp({ objects: [obj2] }), 'test-token');
    expect(xml2).toContain('type="contact"');

    // Test 'rgbd' maps to depth_camera
    const obj3 = makeObj(
      'rgbd_link',
      [{ key: 'geometry', value: 'box' }],
      [{ name: 'sensor', sensorType: 'rgbd' }]
    );
    const xml3 = compiler.compile(makeComp({ objects: [obj3] }), 'test-token');
    expect(xml3).toContain('type="depth"');

    // Test 'navsat' maps to GPS
    const obj4 = makeObj(
      'navsat_link',
      [{ key: 'geometry', value: 'box' }],
      [{ name: 'sensor', sensorType: 'navsat' }]
    );
    const xml4 = compiler.compile(makeComp({ objects: [obj4] }), 'test-token');
    expect(xml4).toContain('type="gps"');
  });

  it('does not emit sensor Gazebo tags when includeGazeboPlugins is false', () => {
    const compiler = new URDFCompiler({ includeGazeboPlugins: false });
    const obj = makeObj(
      'sensor_link',
      [{ key: 'geometry', value: 'box' }],
      [{ name: 'sensor', sensorType: 'camera' }]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).not.toContain('<sensor name=');
    expect(xml).not.toContain('libgazebo_ros_camera.so');
  });

  it('lists sensors in HoloScript extensions comment', () => {
    const compiler = new URDFCompiler({
      includeGazeboPlugins: true,
      includeHoloExtensions: true,
    });
    const obj = makeObj(
      'cam_link',
      [{ key: 'geometry', value: 'box' }],
      [{ name: 'sensor', sensorType: 'camera' }]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<!-- Sensors:');
  });
});

// =============================================================================
// TRANSMISSION TESTS
// =============================================================================

describe('URDFCompiler v2.0 — Transmissions', () => {
  it('creates transmission from @actuator trait', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj(
      'motor_link',
      [{ key: 'geometry', value: 'cylinder' }],
      [
        {
          name: 'actuator',
          actuatorName: 'shoulder_motor',
          hardwareInterface: 'hardware_interface/EffortJointInterface',
          mechanicalReduction: 50,
        },
      ]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<!-- Transmissions -->');
    expect(xml).toContain('<transmission name="motor_link_transmission">');
    expect(xml).toContain('transmission_interface/SimpleTransmission');
    expect(xml).toContain('<actuator name="shoulder_motor">');
    expect(xml).toContain('hardware_interface/EffortJointInterface');
    expect(xml).toContain('<mechanicalReduction>50</mechanicalReduction>');
  });

  it('uses default transmission values when not specified', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj(
      'actuated_link',
      [{ key: 'geometry', value: 'cylinder' }],
      [{ name: 'actuator' }]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('transmission_interface/SimpleTransmission');
    expect(xml).toContain('hardware_interface/PositionJointInterface');
    expect(xml).toContain('<actuator name="actuated_link_actuator">');
  });

  it('does not emit transmissions section when no actuators exist', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj('passive_link', [{ key: 'geometry', value: 'box' }]);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).not.toContain('<!-- Transmissions -->');
    expect(xml).not.toContain('<transmission');
  });
});

// =============================================================================
// MIMIC JOINT TESTS
// =============================================================================

describe('URDFCompiler v2.0 — Mimic Joints', () => {
  it('emits mimic tag for joints with mimic configuration', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj(
      'finger_right',
      [{ key: 'geometry', value: 'box' }],
      [
        {
          name: 'joint',
          jointType: 'revolute',
          axis: { x: 0, y: 0, z: 1 },
          limits: { min: 0, max: 45 },
          mimic: {
            joint: 'finger_left_joint',
            multiplier: 1.0,
            offset: 0.0,
          },
        },
      ]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<mimic joint="finger_left_joint" multiplier="1" offset="0"/>');
  });

  it('supports non-default mimic multiplier and offset', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj(
      'gear_follower',
      [{ key: 'geometry', value: 'cylinder' }],
      [
        {
          name: 'joint',
          jointType: 'revolute',
          axis: { x: 0, y: 0, z: 1 },
          limits: { min: -180, max: 180 },
          mimic: {
            joint: 'gear_leader_joint',
            multiplier: -0.5,
            offset: 0.1,
          },
        },
      ]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<mimic joint="gear_leader_joint" multiplier="-0.5" offset="0.1"/>');
  });
});

// =============================================================================
// SAFETY CONTROLLER TESTS
// =============================================================================

describe('URDFCompiler v2.0 — Safety Controllers', () => {
  it('emits safety_controller tag when configured', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj(
      'safe_joint_link',
      [{ key: 'geometry', value: 'cylinder' }],
      [
        {
          name: 'joint',
          jointType: 'revolute',
          axis: { x: 0, y: 0, z: 1 },
          limits: { min: -90, max: 90 },
          safetyController: {
            softLowerLimit: -1.2,
            softUpperLimit: 1.2,
            kPosition: 200,
            kVelocity: 20,
          },
        },
      ]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<safety_controller');
    expect(xml).toContain('soft_lower_limit="-1.2"');
    expect(xml).toContain('soft_upper_limit="1.2"');
    expect(xml).toContain('k_position="200"');
    expect(xml).toContain('k_velocity="20"');
  });

  it('does not emit safety_controller when not configured', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj(
      'normal_joint',
      [{ key: 'geometry', value: 'cylinder' }],
      [
        {
          name: 'joint',
          jointType: 'revolute',
          axis: { x: 0, y: 0, z: 1 },
        },
      ]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).not.toContain('<safety_controller');
  });
});

// =============================================================================
// MATERIAL COLOR PARSING TESTS
// =============================================================================

describe('URDFCompiler v2.0 — Material Colors', () => {
  it('creates material from hex color', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj('colored', [
      { key: 'geometry', value: 'box' },
      { key: 'color', value: '#FF8800' },
    ]);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<material name="material_colored">');
    expect(xml).toContain('1 0.533');
  });

  it('creates material from named color', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj('red_cube', [
      { key: 'geometry', value: 'box' },
      { key: 'color', value: 'red' },
    ]);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<material name="material_red_cube">');
    expect(xml).toContain('rgba="1 0 0 1"');
  });

  it('references per-link material in visual element', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj('blue_sphere', [
      { key: 'geometry', value: 'sphere' },
      { key: 'color', value: 'blue' },
    ]);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<material name="material_blue_sphere"/>');
  });

  it('uses default material when no color specified', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj('no_color', [{ key: 'geometry', value: 'box' }]);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<material name="default"/>');
  });

  it('parses hex color with alpha channel', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj('alpha_obj', [
      { key: 'geometry', value: 'box' },
      { key: 'color', value: '#FF000080' },
    ]);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<material name="material_alpha_obj">');
    // alpha should be ~0.502
    expect(xml).toMatch(/rgba="1 0 0 0\.50/);
  });

  it('falls back to grey for unknown color names', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj('unknown_color', [
      { key: 'geometry', value: 'box' },
      { key: 'color', value: 'chartreuse' },
    ]);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    // Should fallback to grey (0.8, 0.8, 0.8)
    expect(xml).toContain('rgba="0.8 0.8 0.8 1"');
  });

  it('always includes default material definition', () => {
    const compiler = new URDFCompiler();
    const xml = compiler.compile(makeComp(), 'test-token');

    expect(xml).toContain('<!-- Materials -->');
    expect(xml).toContain('<material name="default">');
    expect(xml).toContain('rgba="0.8 0.8 0.8 1"');
  });
});

// =============================================================================
// CONVENIENCE FUNCTION TESTS
// =============================================================================

describe('URDFCompiler v2.0 — Convenience Functions', () => {
  describe('compileToURDF', () => {
    it('compiles composition to URDF string', () => {
      const xml = compileToURDF(makeComp());

      expect(xml).toContain('<?xml version="1.0"?>');
      expect(xml).toContain('<robot');
      expect(xml).toContain('</robot>');
    });

    it('accepts custom options', () => {
      const xml = compileToURDF(makeComp(), { robotName: 'FunctionBot' });

      expect(xml).toContain('name="FunctionBot"');
    });

    it('passes through all options to URDFCompiler', () => {
      const xml = compileToURDF(makeComp(), {
        robotName: 'TestBot',
        includeVisual: false,
      });

      expect(xml).toContain('name="TestBot"');
      expect(xml).not.toContain('<visual>');
    });
  });

  describe('compileForROS2', () => {
    it('enables ros2_control and Gazebo plugins by default', () => {
      const obj = makeObj(
        'ros2_link',
        [{ key: 'geometry', value: 'cylinder' }],
        [
          {
            name: 'joint',
            jointType: 'revolute',
            axis: { x: 0, y: 0, z: 1 },
            limits: { min: -90, max: 90 },
          },
        ]
      );
      const xml = compileForROS2(makeComp({ objects: [obj] }));

      expect(xml).toContain('<ros2_control');
      expect(xml).toContain('<!-- Gazebo Plugins -->');
    });

    it('allows overriding default options', () => {
      const xml = compileForROS2(makeComp(), {
        robotName: 'ROS2Bot',
        includeGazeboPlugins: false,
      });

      // robotName override should work
      expect(xml).toContain('name="ROS2Bot"');
      // includeGazeboPlugins override should suppress plugins
      expect(xml).not.toContain('<!-- Gazebo Plugins -->');
    });
  });

  describe('compileForGazebo', () => {
    it('enables Gazebo plugins by default', () => {
      const xml = compileForGazebo(makeComp());

      expect(xml).toContain('<!-- Gazebo Plugins -->');
    });

    it('includes visual, collision, and inertial by default', () => {
      const obj = makeObj(
        'gazebo_link',
        [{ key: 'geometry', value: 'box' }],
        ['physics', 'collidable']
      );
      const xml = compileForGazebo(makeComp({ objects: [obj] }));

      expect(xml).toContain('<visual>');
      expect(xml).toContain('<collision>');
      expect(xml).toContain('<inertial>');
    });

    it('allows overriding default options', () => {
      const xml = compileForGazebo(makeComp(), {
        robotName: 'GazeboBot',
        enableSelfCollision: true,
      });

      expect(xml).toContain('name="GazeboBot"');
      expect(xml).toContain('<self_collide>true</self_collide>');
    });
  });
});

// =============================================================================
// ROS 2 LAUNCH FILE GENERATION TESTS
// =============================================================================

describe('URDFCompiler v2.0 — generateROS2LaunchFile', () => {
  it('generates Python launch file with correct structure', () => {
    const launch = generateROS2LaunchFile('my_robot', 'robot.urdf');

    expect(launch).toContain('from launch import LaunchDescription');
    expect(launch).toContain('from launch_ros.actions import Node');
    expect(launch).toContain('def generate_launch_description():');
    expect(launch).toContain("get_package_share_directory('my_robot')");
    expect(launch).toContain("'robot.urdf'");
  });

  it('includes robot_state_publisher node', () => {
    const launch = generateROS2LaunchFile('my_robot', 'robot.urdf');

    expect(launch).toContain("package='robot_state_publisher'");
    expect(launch).toContain("executable='robot_state_publisher'");
    expect(launch).toContain("'robot_description': robot_description");
  });

  it('includes RViz2 when rviz option is true (default)', () => {
    const launch = generateROS2LaunchFile('my_robot', 'robot.urdf');

    expect(launch).toContain("package='rviz2'");
    expect(launch).toContain("executable='rviz2'");
    expect(launch).toContain('display.rviz');
  });

  it('excludes RViz2 when rviz option is false', () => {
    const launch = generateROS2LaunchFile('my_robot', 'robot.urdf', { rviz: false });

    expect(launch).not.toContain("package='rviz2'");
  });

  it('includes Gazebo when gazebo option is true (default)', () => {
    const launch = generateROS2LaunchFile('my_robot', 'robot.urdf');

    expect(launch).toContain("FindPackageShare('ros_gz_sim')");
    expect(launch).toContain('gz_sim.launch.py');
    expect(launch).toContain('spawn_entity');
  });

  it('excludes Gazebo when gazebo option is false', () => {
    const launch = generateROS2LaunchFile('my_robot', 'robot.urdf', { gazebo: false });

    expect(launch).not.toContain('ros_gz_sim');
    expect(launch).not.toContain('spawn_entity');
  });

  it('includes default controller spawners', () => {
    const launch = generateROS2LaunchFile('my_robot', 'robot.urdf');

    expect(launch).toContain("arguments=['joint_state_broadcaster']");
    expect(launch).toContain("arguments=['joint_trajectory_controller']");
  });

  it('includes custom controller spawners', () => {
    const launch = generateROS2LaunchFile('my_robot', 'robot.urdf', {
      controllers: ['velocity_controller', 'gripper_controller'],
    });

    expect(launch).toContain("arguments=['velocity_controller']");
    expect(launch).toContain("arguments=['gripper_controller']");
    expect(launch).not.toContain('joint_state_broadcaster');
  });

  it('uses use_sim_time correctly', () => {
    const launchSim = generateROS2LaunchFile('my_robot', 'robot.urdf', {
      useSimTime: true,
    });
    expect(launchSim).toContain("'use_sim_time': True");

    const launchReal = generateROS2LaunchFile('my_robot', 'robot.urdf', {
      useSimTime: false,
    });
    expect(launchReal).toContain("'use_sim_time': False");
  });

  it('returns proper Python file with docstring', () => {
    const launch = generateROS2LaunchFile('test_pkg', 'test.urdf');

    expect(launch).toContain('"""');
    expect(launch).toContain('ROS 2 Launch file for test_pkg');
    expect(launch).toContain('Auto-generated by HoloScript URDFCompiler');
  });
});

// =============================================================================
// CONTROLLERS YAML GENERATION TESTS
// =============================================================================

describe('URDFCompiler v2.0 — generateControllersYaml', () => {
  it('generates valid YAML controller configuration', () => {
    const yaml = generateControllersYaml('TestRobot', [
      'joint1',
      'joint2',
      'joint3',
    ]);

    expect(yaml).toContain('# Auto-generated by HoloScript URDFCompiler');
    expect(yaml).toContain('# Robot: TestRobot');
    expect(yaml).toContain('controller_manager:');
    expect(yaml).toContain('ros__parameters:');
  });

  it('includes joint_state_broadcaster', () => {
    const yaml = generateControllersYaml('Robot', ['joint1']);

    expect(yaml).toContain('joint_state_broadcaster:');
    expect(yaml).toContain('type: joint_state_broadcaster/JointStateBroadcaster');
  });

  it('includes joint_trajectory_controller', () => {
    const yaml = generateControllersYaml('Robot', ['joint1']);

    expect(yaml).toContain('joint_trajectory_controller:');
    expect(yaml).toContain('type: joint_trajectory_controller/JointTrajectoryController');
  });

  it('lists all joint names', () => {
    const yaml = generateControllersYaml('Robot', [
      'shoulder_joint',
      'elbow_joint',
      'wrist_joint',
    ]);

    expect(yaml).toContain('- shoulder_joint');
    expect(yaml).toContain('- elbow_joint');
    expect(yaml).toContain('- wrist_joint');
  });

  it('includes default command and state interfaces', () => {
    const yaml = generateControllersYaml('Robot', ['joint1']);

    expect(yaml).toContain('command_interfaces:');
    expect(yaml).toContain('- position');
    expect(yaml).toContain('state_interfaces:');
    expect(yaml).toContain('- velocity');
  });

  it('uses custom controller type when specified', () => {
    const yaml = generateControllersYaml('Robot', ['joint1'], {
      controllerType: 'velocity_controllers/JointGroupVelocityController',
    });

    expect(yaml).toContain(
      'type: velocity_controllers/JointGroupVelocityController'
    );
  });

  it('uses custom publish rate when specified', () => {
    const yaml = generateControllersYaml('Robot', ['joint1'], {
      publishRate: 100,
    });

    expect(yaml).toContain('update_rate: 100');
  });

  it('uses default publish rate of 50 when not specified', () => {
    const yaml = generateControllersYaml('Robot', ['joint1']);

    expect(yaml).toContain('update_rate: 50');
  });
});

// =============================================================================
// JOINT TYPE MAPPING TESTS
// =============================================================================

describe('URDFCompiler v2.0 — Joint Type Mapping', () => {
  function compileWithJointType(jointType: string): string {
    const compiler = new URDFCompiler();
    const obj = makeObj(
      'test_link',
      [{ key: 'geometry', value: 'cylinder' }],
      [
        {
          name: 'joint',
          jointType,
          axis: { x: 0, y: 0, z: 1 },
        },
      ]
    );
    return compiler.compile(makeComp({ objects: [obj] }), 'test-token');
  }

  it('maps "hinge" to "revolute"', () => {
    expect(compileWithJointType('hinge')).toContain('type="revolute"');
  });

  it('maps "slider" to "prismatic"', () => {
    expect(compileWithJointType('slider')).toContain('type="prismatic"');
  });

  it('maps "ball" to "floating"', () => {
    expect(compileWithJointType('ball')).toContain('type="floating"');
  });

  it('maps "continuous" to "continuous"', () => {
    expect(compileWithJointType('continuous')).toContain('type="continuous"');
  });

  it('maps "planar" to "planar"', () => {
    expect(compileWithJointType('planar')).toContain('type="planar"');
  });

  it('maps "revolute" to "revolute"', () => {
    expect(compileWithJointType('revolute')).toContain('type="revolute"');
  });

  it('maps "prismatic" to "prismatic"', () => {
    expect(compileWithJointType('prismatic')).toContain('type="prismatic"');
  });

  it('maps "fixed" to "fixed"', () => {
    expect(compileWithJointType('fixed')).toContain('type="fixed"');
  });

  it('maps unknown types to "fixed"', () => {
    expect(compileWithJointType('some_unknown_type')).toContain('type="fixed"');
  });
});

// =============================================================================
// MESH AND SCALE TESTS
// =============================================================================

describe('URDFCompiler v2.0 — Mesh and Scale', () => {
  it('includes scale for mesh geometry with non-uniform scale', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj('scaled_mesh', [
      { key: 'geometry', value: 'robot.stl' },
      { key: 'scale', value: [2, 3, 4] },
    ]);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('scale="2 3 4"');
  });

  it('omits scale for mesh geometry with uniform scale of 1', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj('unscaled_mesh', [
      { key: 'geometry', value: 'robot.stl' },
      { key: 'scale', value: [1, 1, 1] },
    ]);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<mesh filename=');
    expect(xml).not.toContain('scale=');
  });

  it('converts .glb files to .stl', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj('glb_mesh', [{ key: 'geometry', value: 'model.glb' }]);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('model.stl');
    expect(xml).not.toContain('model.glb');
  });

  it('converts .dae files to .stl', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj('dae_mesh', [{ key: 'geometry', value: 'model.dae' }]);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('model.stl');
    expect(xml).not.toContain('model.dae');
  });

  it('converts .obj files to .stl', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj('obj_mesh', [{ key: 'geometry', value: 'model.obj' }]);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('model.stl');
    expect(xml).not.toContain('model.obj');
  });

  it('keeps .stl files as-is', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj('stl_mesh', [{ key: 'geometry', value: 'model.stl' }]);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('model.stl');
  });

  it('uses mesh path prefix for custom meshes', () => {
    const compiler = new URDFCompiler({
      meshPathPrefix: 'package://my_robot/meshes/',
    });
    const obj = makeObj('prefixed_mesh', [
      { key: 'geometry', value: 'gripper.stl' },
    ]);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('package://my_robot/meshes/gripper.stl');
  });

  it('approximates cone as cylinder', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj('cone_obj', [{ key: 'geometry', value: 'cone' }]);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<cylinder');
  });

  it('approximates capsule as cylinder', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj('capsule_obj', [{ key: 'geometry', value: 'capsule' }]);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<cylinder');
  });

  it('approximates plane as thin box', () => {
    const compiler = new URDFCompiler();
    const obj = makeObj('plane_obj', [{ key: 'geometry', value: 'plane' }]);
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('<box');
    expect(xml).toContain('0.01');
  });
});

// =============================================================================
// BACKWARD COMPATIBILITY TESTS
// =============================================================================

describe('URDFCompiler v2.0 — Backward Compatibility', () => {
  it('compile() works without agentToken (optional parameter)', () => {
    const compiler = new URDFCompiler();
    const xml = compiler.compile(makeComp(), 'test-token');

    expect(xml).toContain('<robot');
    expect(xml).toContain('</robot>');
  });

  it('maintains v1.0 XML structure', () => {
    const compiler = new URDFCompiler();
    const xml = compiler.compile(makeComp(), 'test-token');

    expect(xml).toContain('<?xml version="1.0"?>');
    expect(xml).toContain('<robot name="HoloScriptRobot">');
    expect(xml).toContain('<link name="base_link">');
    expect(xml).toContain('</robot>');
  });

  it('v1.0 options still work identically', () => {
    const compiler = new URDFCompiler({
      robotName: 'LegacyRobot',
      includeVisual: true,
      includeCollision: true,
      includeInertial: true,
      defaultMass: 2.5,
      meshPathPrefix: 'package://legacy/meshes/',
      includeHoloExtensions: true,
    });
    const obj = makeObj(
      'legacy_link',
      [
        { key: 'geometry', value: 'box' },
        { key: 'position', value: [1, 2, 3] },
      ],
      ['physics', 'collidable']
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('name="LegacyRobot"');
    expect(xml).toContain('<visual>');
    expect(xml).toContain('<collision>');
    expect(xml).toContain('<inertial>');
    expect(xml).toContain('<mass value="2.5"/>');
    expect(xml).toContain('<!-- HoloScript Extensions -->');
  });

  it('new options default to non-breaking values', () => {
    const compiler = new URDFCompiler();
    const xml = compiler.compile(makeComp(), 'test-token');

    // Gazebo plugins off by default
    expect(xml).not.toContain('<!-- Gazebo Plugins -->');
    // ros2_control off by default
    expect(xml).not.toContain('<ros2_control');
    // No transmissions by default
    expect(xml).not.toContain('<transmission');
  });

  it('re-compiling resets internal state', () => {
    const compiler = new URDFCompiler({ includeGazeboPlugins: true });
    const obj = makeObj(
      'sensor_link',
      [{ key: 'geometry', value: 'box' }],
      [{ name: 'sensor', sensorType: 'camera' }]
    );
    const comp = makeComp({ objects: [obj] });

    // Compile once
    const xml1 = compiler.compile(comp, 'test-token');
    // Compile again - should not accumulate sensors
    const xml2 = compiler.compile(comp, 'test-token');

    // Both outputs should be identical
    expect(xml1).toEqual(xml2);
  });
});

// =============================================================================
// INTEGRATION: COMPLETE ROBOT WITH ALL V2.0 FEATURES
// =============================================================================

describe('URDFCompiler v2.0 — Full Integration', () => {
  it('compiles a complete robot with sensors, actuators, and Gazebo plugins', () => {
    const compiler = new URDFCompiler({
      robotName: 'HoloBot',
      includeGazeboPlugins: true,
      includeROS2Control: true,
      enableSelfCollision: true,
      packageName: 'holobot_description',
    });

    const comp = makeComp({
      name: 'HoloBot',
      objects: [
        // Base with contact sensor
        makeObj(
          'base',
          [
            { key: 'geometry', value: 'cylinder' },
            { key: 'position', value: [0, 0, 0] },
            { key: 'scale', value: 0.5 },
            { key: 'physics', value: { mass: 10 } },
            { key: 'color', value: 'gray' },
          ],
          ['physics', 'collidable']
        ),
        // Shoulder joint with revolute
        makeObj(
          'shoulder',
          [
            { key: 'geometry', value: 'cylinder' },
            { key: 'position', value: [0, 0, 0.3] },
            { key: 'physics', value: { mass: 2 } },
          ],
          [
            'physics',
            {
              name: 'joint',
              jointType: 'revolute',
              connectedBody: 'base',
              axis: { x: 0, y: 0, z: 1 },
              limits: { min: -180, max: 180, effort: 100, velocity: 2 },
              damping: 0.5,
              friction: 0.1,
            },
            {
              name: 'actuator',
              actuatorName: 'shoulder_motor',
              mechanicalReduction: 80,
            },
          ]
        ),
        // Camera on end effector
        makeObj(
          'camera_mount',
          [
            { key: 'geometry', value: 'box' },
            { key: 'position', value: [0, 0, 0.8] },
            { key: 'physics', value: { mass: 0.2 } },
            { key: 'color', value: '#333333' },
          ],
          [
            'physics',
            {
              name: 'sensor',
              sensorType: 'camera',
              fov: 1.39,
              width: 1280,
              height: 720,
            },
          ]
        ),
      ],
      environment: { skybox: 'industrial' },
    });

    const xml = compiler.compile(comp, 'test-token');

    // Robot structure
    expect(xml).toContain('<robot name="HoloBot">');
    expect(xml).toContain('<link name="base_link">');
    expect(xml).toContain('<link name="base">');
    expect(xml).toContain('<link name="shoulder">');
    expect(xml).toContain('<link name="camera_mount">');

    // Articulated joint
    expect(xml).toContain('type="revolute"');
    expect(xml).toContain('<axis xyz="0 0 1"/>');
    expect(xml).toContain('<dynamics damping="0.5" friction="0.1"/>');

    // Transmission
    expect(xml).toContain('<!-- Transmissions -->');
    expect(xml).toContain('<transmission name="shoulder_transmission">');
    expect(xml).toContain('<mechanicalReduction>80</mechanicalReduction>');

    // ros2_control
    expect(xml).toContain('<ros2_control');
    expect(xml).toContain('gz_ros2_control/GazeboSimSystem');

    // Gazebo plugins
    expect(xml).toContain('<!-- Gazebo Plugins -->');
    expect(xml).toContain('<self_collide>true</self_collide>');
    expect(xml).toContain('gz_ros2_control-system');
    expect(xml).toContain('holobot_description');

    // Material colors
    expect(xml).toContain('Gazebo/Grey');

    // Camera sensor
    expect(xml).toContain('<sensor name="camera_mount_camera_sensor"');
    expect(xml).toContain('<width>1280</width>');
    expect(xml).toContain('<height>720</height>');
    expect(xml).toContain('libgazebo_ros_camera.so');

    // HoloScript extensions
    expect(xml).toContain('<!-- HoloScript Extensions -->');
    expect(xml).toContain('<!-- Environment skybox: industrial -->');
    expect(xml).toContain('<!-- Sensors:');
  });

  it('generates matching launch file and controllers YAML for a robot', () => {
    // Generate URDF
    const obj = makeObj(
      'shoulder',
      [{ key: 'geometry', value: 'cylinder' }],
      [
        {
          name: 'joint',
          jointType: 'revolute',
          axis: { x: 0, y: 0, z: 1 },
          limits: { min: -90, max: 90 },
        },
      ]
    );
    const xml = compileForROS2(makeComp({ objects: [obj] }), {
      robotName: 'TestArm',
      packageName: 'test_arm_pkg',
    });

    // Generate launch file
    const launch = generateROS2LaunchFile('test_arm_pkg', 'test_arm.urdf');

    // Generate controllers YAML
    const yaml = generateControllersYaml('TestArm', [
      'base_link_to_shoulder_joint',
    ]);

    // Verify URDF has ros2_control
    expect(xml).toContain('<ros2_control');

    // Verify launch file references package
    expect(launch).toContain("'test_arm_pkg'");
    expect(launch).toContain("'test_arm.urdf'");

    // Verify YAML references joint name
    expect(yaml).toContain('- base_link_to_shoulder_joint');
    expect(yaml).toContain('# Robot: TestArm');
  });
});

// =============================================================================
// COMPILE HEADER AND VERSION TESTS
// =============================================================================

describe('URDFCompiler v2.0 — Version and Headers', () => {
  it('includes v2.0 version in comment header', () => {
    const compiler = new URDFCompiler();
    const xml = compiler.compile(makeComp({ name: 'VersionTest' }), 'test-token');

    expect(xml).toContain('Auto-generated by HoloScript URDFCompiler v2.0');
  });

  it('includes source composition name', () => {
    const compiler = new URDFCompiler();
    const xml = compiler.compile(makeComp({ name: 'MyCustomComposition' }), 'test-token');

    expect(xml).toContain('Source: composition "MyCustomComposition"');
  });

  it('includes target platform list', () => {
    const compiler = new URDFCompiler();
    const xml = compiler.compile(makeComp(), 'test-token');

    expect(xml).toContain('Target: ROS 2 / Gazebo / MoveIt 2 / RViz2');
  });
});

// =============================================================================
// PACKAGE NAME OPTION TESTS
// =============================================================================

describe('URDFCompiler v2.0 — Package Name', () => {
  it('uses custom package name in Gazebo ros2_control plugin path', () => {
    const compiler = new URDFCompiler({
      includeGazeboPlugins: true,
      includeROS2Control: true,
      packageName: 'custom_robot_pkg',
    });
    const obj = makeObj(
      'actuated',
      [{ key: 'geometry', value: 'cylinder' }],
      [
        {
          name: 'joint',
          jointType: 'revolute',
          axis: { x: 0, y: 0, z: 1 },
          limits: { min: -90, max: 90 },
        },
      ]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('$(find custom_robot_pkg)');
  });

  it('defaults to holoscript_robot when no package name specified', () => {
    const compiler = new URDFCompiler({
      includeGazeboPlugins: true,
      includeROS2Control: true,
    });
    const obj = makeObj(
      'actuated',
      [{ key: 'geometry', value: 'cylinder' }],
      [
        {
          name: 'joint',
          jointType: 'revolute',
          axis: { x: 0, y: 0, z: 1 },
          limits: { min: -90, max: 90 },
        },
      ]
    );
    const xml = compiler.compile(makeComp({ objects: [obj] }), 'test-token');

    expect(xml).toContain('$(find holoscript_robot)');
  });
});
