/**
 * URDFCompiler: the Gazebo Harmonic target (gazeboVersion: 'harmonic').
 *
 * Until this change the option was accepted and never read, so every 'harmonic'
 * compile was byte-identical to 'classic'. These tests parse real .holo source with
 * parseHoloStrict (the production entry), compile it both ways, and check that:
 *  - harmonic differs from classic, and only in the Gazebo tags;
 *  - harmonic carries the gz-sim names (ros2_control plugin class, gpu_lidar, navsat,
 *    depth_camera, <topic>/<gz_frame_id>, explicit material colours, bridge commands);
 *  - harmonic carries none of the Gazebo Classic names (libgazebo_ros_*.so,
 *    Gazebo/<Color> material scripts, gazebo_ros2_control);
 *  - classic output is byte-for-byte what it was before the change (pinned sha256).
 *
 * Upstream sources for the Harmonic names are listed on
 * URDFCompiler.emitGazeboSensorHarmonic.
 */

import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { compileForGazebo, compileForROS2, compileToURDF } from '../URDFCompiler';
import { parseHoloStrict } from '../../parser/HoloCompositionParser';

// The 3-link arm from URDFCompiler.e2e-source.test.ts: two revolute joints, so
// compileForROS2 emits ros2_control. No colours or sensors.
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

// One of every sensor kind the compiler knows, coloured links, a collidable bumper,
// and force-torque sensors behind a revolute joint and behind a fixed joint.
const SENSOR_SOURCE = `composition "SensorBot" {
  object "base_link" {
    @static
    geometry: "box"
    mass: 2.0
    color: "#ff0000"
  }
  object "cam_link" {
    @sensor(sensorType: "camera", fov: 1.5708, width: 1280, height: 720, topic: "/front/image")
    geometry: "box"
    color: "blue"
    position: [0.2, 0, 0.1]
  }
  object "lidar_link" {
    @sensor(sensorType: "lidar", samples: 720, minRange: 0.2, maxRange: 25.0, topic: "/scan")
    geometry: "cylinder"
    position: [0, 0, 0.3]
  }
  object "imu_link" {
    @sensor(sensorType: "imu", noise: 0.01, updateRate: 100)
    geometry: "box"
  }
  object "bumper_link" {
    @sensor(sensorType: "contact", topic: "/bumper")
    @collidable
    geometry: "box"
  }
  object "gps_link" {
    @sensor(sensorType: "gps", topic: "/gps/fix")
    geometry: "box"
  }
  object "depth_link" {
    @sensor(sensorType: "depth_camera")
    geometry: "box"
  }
  object "wrist" {
    @joint_revolute
    joint_parent: "base_link"
    joint_axis: [0, 0, 1]
    joint_limits: [-1.0, 1.0]
    geometry: "cylinder"
    radius: 0.03
    length: 0.1
    position: [0, 0, 0.5]
  }
  object "ft_link" {
    @sensor(sensorType: "force_torque")
    @joint_revolute
    joint_parent: "wrist"
    joint_axis: [0, 1, 0]
    joint_limits: [-1.0, 1.0]
    geometry: "cylinder"
    radius: 0.03
    length: 0.05
    position: [0, 0, 0.6]
  }
  object "ft_fixed_link" {
    @sensor(sensorType: "force_torque", topic: "/ft_fixed")
    geometry: "box"
  }
}`;

// A force-torque sensor on the root link, which has no parent joint.
const ROOT_FT_SOURCE = `composition "RootFT" {
  object "base_link" {
    @static
    @sensor(sensorType: "force_torque")
    geometry: "box"
  }
}`;

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const robotBody = (xml: string) => xml.slice(0, xml.indexOf('<!-- Gazebo Plugins -->'));

describe('URDFCompiler gazeboVersion: harmonic', () => {
  const arm = parseHoloStrict(ARM_SOURCE);
  const sensors = parseHoloStrict(SENSOR_SOURCE);

  const classicSensors = compileForGazebo(sensors, { gazeboVersion: 'classic' });
  const harmonicSensors = compileForGazebo(sensors, { gazeboVersion: 'harmonic' });
  const classicArmRos2 = compileForROS2(arm);
  const harmonicArmRos2 = compileForROS2(arm, { gazeboVersion: 'harmonic' });
  const harmonicSensorsRos2 = compileForROS2(sensors, { gazeboVersion: 'harmonic' });

  it('parses the fixtures from source into the expected objects', () => {
    expect(arm.objects.map((o) => o.name)).toEqual(['base_link', 'upper_arm', 'forearm']);
    expect(sensors.objects.map((o) => o.name)).toEqual([
      'base_link',
      'cam_link',
      'lidar_link',
      'imu_link',
      'bumper_link',
      'gps_link',
      'depth_link',
      'wrist',
      'ft_link',
      'ft_fixed_link',
    ]);
    // Every @sensor reached the compiler (the classic output names all eight).
    expect(classicSensors.match(/<sensor name="/g)?.length).toBe(8);
  });

  it('produces different output from classic', () => {
    expect(harmonicSensors).not.toBe(classicSensors);
    expect(harmonicArmRos2).not.toBe(classicArmRos2);
  });

  it('changes only the Gazebo tags: links, joints and ros2_control match classic', () => {
    expect(robotBody(harmonicSensors).length).toBeGreaterThan(0);
    expect(robotBody(harmonicSensors)).toBe(robotBody(classicSensors));
    expect(robotBody(harmonicArmRos2)).toBe(robotBody(classicArmRos2));
  });

  it('loads ros2_control through the class gz_ros2_control registers', () => {
    expect(harmonicArmRos2).toContain(
      '<plugin filename="gz_ros2_control-system" name="gz_ros2_control::GazeboSimROS2ControlPlugin">'
    );
    expect(harmonicArmRos2).toContain('<plugin>gz_ros2_control/GazeboSimSystem</plugin>');
  });

  it('emits gz-sim sensor types with <topic> and <gz_frame_id> instead of ROS plugins', () => {
    expect(harmonicSensors).toContain('<sensor name="cam_link_camera_sensor" type="camera">');
    expect(harmonicSensors).toContain('<topic>/front/image</topic>');
    expect(harmonicSensors).toContain('<gz_frame_id>cam_link_camera_frame</gz_frame_id>');

    expect(harmonicSensors).toContain('<sensor name="lidar_link_lidar_sensor" type="gpu_lidar">');
    expect(harmonicSensors).toMatch(/<lidar>\s*<scan>\s*<horizontal>\s*<samples>720<\/samples>/);
    expect(harmonicSensors).toContain('<topic>/scan</topic>');

    expect(harmonicSensors).toContain('<sensor name="gps_link_gps_sensor" type="navsat">');
    expect(harmonicSensors).toContain(
      '<sensor name="depth_link_depth_camera_sensor" type="depth_camera">'
    );

    // IMU noise is per axis in SDF 1.11 (imu.sdf has no direct <noise> child).
    expect(harmonicSensors).toMatch(
      /<angular_velocity>\s*<x><noise type="gaussian"><mean>0<\/mean><stddev>0\.01<\/stddev><\/noise><\/x>/
    );
    expect(harmonicSensors).toMatch(
      /<linear_acceleration>\s*<x><noise type="gaussian"><mean>0<\/mean><stddev>0\.01<\/stddev><\/noise><\/x>/
    );
    // All six axes, not only x: three under each group.
    const imuBlock = harmonicSensors.slice(
      harmonicSensors.indexOf('<imu>'),
      harmonicSensors.indexOf('</imu>')
    );
    expect(imuBlock.match(/<noise type="gaussian">/g) ?? []).toHaveLength(6);
    for (const group of ['angular_velocity', 'linear_acceleration']) {
      const body = imuBlock.slice(imuBlock.indexOf(`<${group}>`), imuBlock.indexOf(`</${group}>`));
      for (const axis of ['x', 'y', 'z']) {
        expect(body).toMatch(new RegExp(`<${axis}><noise type="gaussian">`));
      }
    }

    // The Contact system reads its topic from inside <contact>.
    expect(harmonicSensors).toMatch(
      /<contact>\s*<collision>bumper_link_collision<\/collision>\s*<topic>\/bumper<\/topic>\s*<\/contact>/
    );
  });

  it('gives each sensor its ros_gz_bridge command and lists the world systems it needs', () => {
    const bridge = 'ros2 run ros_gz_bridge parameter_bridge ';
    for (const args of [
      '/front/image@sensor_msgs/msg/Image[gz.msgs.Image /front/camera_info@sensor_msgs/msg/CameraInfo[gz.msgs.CameraInfo',
      '/scan@sensor_msgs/msg/LaserScan[gz.msgs.LaserScan',
      '/imu_link_imu_sensor@sensor_msgs/msg/Imu[gz.msgs.IMU',
      '/bumper@ros_gz_interfaces/msg/Contacts[gz.msgs.Contacts',
      '/gps/fix@sensor_msgs/msg/NavSatFix[gz.msgs.NavSat',
      '/ft_link_force_torque_sensor@geometry_msgs/msg/WrenchStamped[gz.msgs.Wrench',
    ]) {
      expect(harmonicSensors).toContain(bridge + args);
    }
    for (const system of [
      'gz-sim-sensors-system (gz::sim::systems::Sensors, render_engine ogre2)',
      'gz-sim-imu-system (gz::sim::systems::Imu)',
      'gz-sim-contact-system (gz::sim::systems::Contact)',
      'gz-sim-navsat-system (gz::sim::systems::NavSat)',
      'gz-sim-forcetorque-system (gz::sim::systems::ForceTorque)',
    ]) {
      expect(harmonicSensors).toContain(system);
    }
  });

  it('colours links with explicit SDF material values', () => {
    expect(harmonicSensors).toMatch(
      /<gazebo reference="base_link">\s*<visual>\s*<material>\s*<ambient>1 0 0 1<\/ambient>\s*<diffuse>1 0 0 1<\/diffuse>\s*<specular>1 0 0 1<\/specular>/
    );
    expect(harmonicSensors).toMatch(
      /<gazebo reference="cam_link">\s*<visual>\s*<material>\s*<ambient>0 0 1 1<\/ambient>/
    );
  });

  it('attaches force_torque to the joint above its link, preserving a fixed joint', () => {
    expect(harmonicSensors).toMatch(
      /<gazebo reference="wrist_to_ft_link_joint">\s*<sensor name="ft_link_force_torque_sensor" type="force_torque">/
    );
    expect(harmonicSensors).toMatch(
      /<gazebo reference="base_link_to_ft_fixed_link_joint">\s*<preserveFixedJoint>true<\/preserveFixedJoint>\s*<sensor name="ft_fixed_link_force_torque_sensor" type="force_torque">/
    );
  });

  it('says so instead of putting force_torque on a link with no parent joint', () => {
    const rootFt = parseHoloStrict(ROOT_FT_SOURCE);
    const harmonic = compileForGazebo(rootFt, { gazeboVersion: 'harmonic' });
    expect(harmonic).toContain(
      'Gazebo Harmonic: force_torque sensor "base_link_force_torque_sensor" needs a parent joint, and link "base_link" has none, so it is not emitted'
    );
    expect(harmonic).not.toContain('type="force_torque"');
    expect(harmonic).not.toContain('gz-sim-forcetorque-system');
    // No sensor is emitted, so there is no list of world systems to load either.
    expect(harmonic).not.toContain('the world SDF must load these gz-sim systems');
  });

  it('carries no Gazebo Classic names', () => {
    // The classic output of the same robot does carry them, so the checks below can fail.
    expect(classicSensors).toContain('libgazebo_ros_camera.so');
    expect(classicSensors).toContain('<material>Gazebo/Red</material>');

    for (const xml of [harmonicSensors, harmonicSensorsRos2, harmonicArmRos2]) {
      expect(xml).not.toContain('libgazebo_');
      expect(xml).not.toContain('gazebo_ros2_control/GazeboSystem');
      expect(xml).not.toContain('<material>Gazebo/');
      expect(xml).not.toContain('name="gz_ros2_control"');
      expect(xml).not.toContain('<ray>');
      expect(xml).not.toContain('<frame_name>');
      expect(xml).not.toContain('type="gps"');
      expect(xml).not.toContain('type="depth"');
    }
  });

  it('keeps every XML comment valid when a topic contains "--"', () => {
    const dashed = parseHoloStrict(`composition "DashBot" {
  object "base_link" {
    geometry: "box"
  }
  object "imu_link" {
    @sensor(sensorType: "imu", topic: "/imu--raw")
    geometry: "box"
  }
}`);
    const urdf = compileForGazebo(dashed, { gazeboVersion: 'harmonic' });
    expect(urdf).toContain('ros_gz_bridge');
    const comments = urdf.match(/<!--([\s\S]*?)-->/g) ?? [];
    expect(comments.length).toBeGreaterThan(0);
    for (const comment of comments) {
      // XML forbids "--" inside a comment body.
      expect(comment.slice(4, -3)).not.toContain('--');
    }
  });

  it('keeps classic output byte-identical to before the Harmonic change', () => {
    // sha256 of each output, measured on origin/main 90f9e08aa before gazeboVersion
    // was read. If classic output is changed on purpose, re-measure and update these.
    const rootFt = parseHoloStrict(ROOT_FT_SOURCE);
    const outputs: Record<string, string> = {
      'arm compileForGazebo': compileForGazebo(arm),
      'arm compileForGazebo classic': compileForGazebo(arm, { gazeboVersion: 'classic' }),
      'arm compileForROS2': compileForROS2(arm),
      'arm compileToURDF': compileToURDF(arm),
      'sensors compileForGazebo': compileForGazebo(sensors),
      'sensors compileForROS2': compileForROS2(sensors),
      'sensors compileToURDF': compileToURDF(sensors),
      // compileToURDF emits no Gazebo tags, so the version must not matter there.
      'sensors compileToURDF harmonic': compileToURDF(sensors, { gazeboVersion: 'harmonic' }),
      'rootFt compileForGazebo': compileForGazebo(rootFt),
    };
    const hashes = Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k, sha256(v)]));
    expect(hashes).toEqual(PINNED_CLASSIC_SHA256);
    expect(compileForGazebo(sensors)).toBe(classicSensors);
  });
});

const PINNED_CLASSIC_SHA256: Record<string, string> = {
  'arm compileForGazebo': '3b9e68d1082e7b2a3209cd6dd3481da47f97824afa87c1e05cbe8c07c20e25bb',
  'arm compileForGazebo classic':
    '3b9e68d1082e7b2a3209cd6dd3481da47f97824afa87c1e05cbe8c07c20e25bb',
  'arm compileForROS2': 'd1cfc2192d8802965376ababacb90815bc3c176b356173c64248b2a21735479b',
  'arm compileToURDF': '52bf9d918bdae6c7ebc15cae841699b9b7261958d1a79047b8facabbfd87a052',
  'sensors compileForGazebo': '509a1a00913259e6c66a4e5ab53a821848e0e00a1d22c0560a04b99e93f207d6',
  'sensors compileForROS2': '1f3742638f53745cc7d516d1123f325e39a2874f32f916b0615f567b089d09b2',
  'sensors compileToURDF': '55ef263cbef83611469e42470b7611ce0ed9a88c86318078c49ae2806d3a4dd6',
  'sensors compileToURDF harmonic':
    '55ef263cbef83611469e42470b7611ce0ed9a88c86318078c49ae2806d3a4dd6',
  'rootFt compileForGazebo': 'cf329aed7f7523a7635d195d99ae012062bdd3c96efb743daaaef34dbc95455b',
};
