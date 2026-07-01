import { describe, expect, it, vi } from 'vitest';
import { SDFCompiler } from '../../../../core/src/compiler/SDFCompiler';
import { compileForROS2 } from '../../../../core/src/compiler/URDFCompiler';
import { compileForIsaacSim as compileUsdForIsaacSim } from '../../../../core/src/compiler/USDPhysicsCompiler';
import type {
  HoloComposition,
  HoloObjectDecl,
} from '../../../../core/src/parser/HoloCompositionTypes';
import { verifyCAELHashChain } from '../CAELTrace';
import {
  runRoboticsImportValidationDemo,
  validateRoboticsImport,
  type RoboticsArtifact,
  type RoboticsImportValidationInput,
  type RoboticsRos2PubSubProof,
  type RoboticsRos2TopicMapping,
  type RoboticsSensorMetadata,
  type RoboticsSyntheticDataExportFixture,
} from '../RoboticsImportValidation';
import { sha256Bytes } from '../sha256';

vi.mock('../../../../core/src/compiler/identity/AgentRBAC', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../core/src/compiler/identity/AgentRBAC')>();
  return {
    ...actual,
    getRBAC: () => ({
      checkAccess: () => ({ allowed: true, reason: 'unit-test compiler access' }),
    }),
  };
});

function deterministicClock(): () => number {
  let tick = Date.parse('2026-07-01T16:30:00.000Z');
  return () => {
    tick += 500;
    return tick;
  };
}

function objectDecl(overrides: Partial<HoloObjectDecl>): HoloObjectDecl {
  return {
    name: 'RobotPart',
    properties: [],
    traits: [],
    ...overrides,
  } as HoloObjectDecl;
}

function roboticsComposition(): HoloComposition {
  return {
    type: 'Composition',
    name: 'CG009RoboticsBridge',
    objects: [
      objectDecl({
        name: 'MobileBase',
        properties: [
          { key: 'geometry', value: 'cube' },
          { key: 'scale', value: [1.2, 0.8, 0.25] },
          { key: 'position', value: [0, 0, 0.2] },
          { key: 'color', value: '#2563eb' },
        ],
        traits: ['physics', 'collidable', { name: 'articulation_root' }],
      }),
      objectDecl({
        name: 'LiftArm',
        properties: [
          { key: 'geometry', value: 'cylinder' },
          { key: 'scale', value: [0.12, 0.12, 1.0] },
          { key: 'position', value: [0.45, 0, 0.9] },
        ],
        traits: [
          'physics',
          'collidable',
          {
            name: 'joint',
            jointType: 'revolute',
            connectedBody: 'MobileBase',
            axis: [0, 0, 1],
            limits: { min: -45, max: 45, effort: 60, velocity: 1.5 },
          },
          { name: 'actuator', actuatorType: 'servo', hardwareInterface: 'position' },
        ],
      }),
      objectDecl({
        name: 'FrontCamera',
        properties: [
          { key: 'geometry', value: 'cube' },
          { key: 'scale', value: [0.08, 0.04, 0.04] },
          { key: 'position', value: [0.7, 0, 0.55] },
        ],
        traits: [
          {
            name: 'sensor',
            sensorType: 'camera',
            topic: '/camera/image_raw',
            frameName: 'front_camera_frame',
            updateRate: 30,
            width: 1280,
            height: 720,
            fov: 1.22173,
            format: 'R8G8B8',
          },
        ],
      }),
      objectDecl({
        name: 'RoofLidar',
        properties: [
          { key: 'geometry', value: 'cylinder' },
          { key: 'scale', value: [0.14, 0.14, 0.08] },
          { key: 'position', value: [0, 0, 0.8] },
        ],
        traits: [
          {
            name: 'sensor',
            sensorType: 'lidar',
            topic: '/scan',
            frameName: 'roof_lidar_frame',
            updateRate: 20,
            samples: 720,
            minRange: 0.15,
            maxRange: 35,
          },
        ],
      }),
      objectDecl({
        name: 'BodyImu',
        properties: [
          { key: 'geometry', value: 'cube' },
          { key: 'scale', value: [0.05, 0.05, 0.03] },
          { key: 'position', value: [0, 0, 0.35] },
        ],
        traits: [
          {
            name: 'sensor',
            sensorType: 'imu',
            topic: '/imu/data',
            frameName: 'base_imu_frame',
            updateRate: 100,
            noise: 0.001,
          },
        ],
      }),
    ],
    templates: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
  } as HoloComposition;
}

function sourceHash(composition: HoloComposition): string {
  return `holo-source-sha-${sha256Bytes(new TextEncoder().encode(JSON.stringify(composition)))}`;
}

function compileRoboticsArtifacts(): RoboticsArtifact[] {
  const composition = roboticsComposition();
  const sourceCompositionHash = sourceHash(composition);
  const generatedAt = '2026-07-01T16:30:00.000Z';
  const sdfCompiler = new SDFCompiler({
    worldName: 'cg009_robotics_world',
    gazeboVersion: 'harmonic',
    physicsEngine: 'ode',
  });

  return [
    {
      id: 'cg009-ros2-urdf',
      format: 'urdf',
      targetContext: 'ros2',
      content: compileForROS2(composition, { robotName: 'cg009_robotics_bridge' }),
      provenance: {
        compiler: 'URDFCompiler',
        sourceComposition: composition.name,
        sourceHash: sourceCompositionHash,
        generatedAt,
        options: { target: 'ros2', includeROS2Control: true },
      },
      path: 'artifacts/cg009/cg009_robotics_bridge.urdf',
    },
    {
      id: 'cg009-gazebo-sdf',
      format: 'sdf',
      targetContext: 'gazebo',
      content: sdfCompiler.compile(composition, 'test-token'),
      provenance: {
        compiler: 'SDFCompiler',
        sourceComposition: composition.name,
        sourceHash: sourceCompositionHash,
        generatedAt,
        options: { target: 'gazebo', gazeboVersion: 'harmonic' },
      },
      path: 'artifacts/cg009/cg009_robotics_world.sdf',
    },
    {
      id: 'cg009-isaac-usd',
      format: 'usd-physics',
      targetContext: 'isaac_sim',
      content: compileUsdForIsaacSim(composition, {
        targetContext: 'isaac_sim',
        provenanceHash: sourceCompositionHash,
      }),
      provenance: {
        compiler: 'USDPhysicsCompiler',
        sourceComposition: composition.name,
        sourceHash: sourceCompositionHash,
        generatedAt,
        options: { targetContext: 'isaac_sim', enableGPUDynamics: true },
      },
      path: 'artifacts/cg009/cg009_robotics_bridge.usda',
    },
  ];
}

function sensorMetadata(): RoboticsSensorMetadata[] {
  return [
    {
      name: 'front_camera',
      type: 'camera',
      parentLink: 'frontcamera',
      frameName: 'front_camera_frame',
      topicName: '/camera/image_raw',
      updateRateHz: 30,
      camera: {
        width: 1280,
        height: 720,
        horizontalFovRadians: 1.22173,
        format: 'rgb8',
      },
    },
    {
      name: 'roof_lidar',
      type: 'lidar',
      parentLink: 'rooflidar',
      frameName: 'roof_lidar_frame',
      topicName: '/scan',
      updateRateHz: 20,
      lidar: {
        samples: 720,
        minRangeMeters: 0.15,
        maxRangeMeters: 35,
        horizontalFovRadians: Math.PI * 2,
      },
    },
    {
      name: 'body_imu',
      type: 'imu',
      parentLink: 'bodyimu',
      frameName: 'base_imu_frame',
      topicName: '/imu/data',
      updateRateHz: 100,
      imu: {
        noiseDensity: 0.001,
        biasStability: 0.0001,
      },
    },
  ];
}

function ros2TopicMappings(): RoboticsRos2TopicMapping[] {
  return [
    {
      sensorName: 'front_camera',
      sensorType: 'camera',
      topicName: '/camera/image_raw',
      messageType: 'sensor_msgs/msg/Image',
      frameName: 'front_camera_frame',
    },
    {
      sensorName: 'roof_lidar',
      sensorType: 'lidar',
      topicName: '/scan',
      messageType: 'sensor_msgs/msg/LaserScan',
      frameName: 'roof_lidar_frame',
    },
    {
      sensorName: 'body_imu',
      sensorType: 'imu',
      topicName: '/imu/data',
      messageType: 'sensor_msgs/msg/Imu',
      frameName: 'base_imu_frame',
    },
  ];
}

function ros2Proof(): RoboticsRos2PubSubProof {
  return {
    mode: 'simulated',
    nodeName: 'cg009_robotics_validation_bridge',
    transport: 'simulated-bridge',
    topics: ros2TopicMappings().map((mapping) => ({
      topicName: mapping.topicName,
      messageType: mapping.messageType,
      publisher: `sim/${mapping.sensorName}/publisher`,
      subscriber: `validation/${mapping.sensorName}/subscriber`,
      messagesPublished: 4,
      messagesReceived: 4,
    })),
  };
}

function syntheticDataFixture(): RoboticsSyntheticDataExportFixture {
  const sensorNames = sensorMetadata().map((sensor) => sensor.name);
  return {
    exportId: 'cg009-synthetic-warehouse-jsonl',
    format: 'jsonl',
    frameCount: 12,
    sensorNames,
    labels: ['mobile_base', 'lift_arm', 'fiducial_marker'],
    artifactHash: `synthetic-sha-${sha256Bytes(new TextEncoder().encode(sensorNames.join('|')))}`,
  };
}

function validationInput(overrides: Partial<RoboticsImportValidationInput> = {}) {
  return {
    artifacts: compileRoboticsArtifacts(),
    sensors: sensorMetadata(),
    ros2TopicMappings: ros2TopicMappings(),
    ros2Proof: ros2Proof(),
    syntheticData: syntheticDataFixture(),
    scenario: {
      name: 'warehouse-pickup-physics-sensor-smoke',
      description:
        'Two seconds of physics stepping with camera, LiDAR, IMU, and ROS2 bridge proof.',
      simulatorTargets: ['isaac_sim', 'gazebo', 'ros2'],
      physicsStepHz: 60,
      durationSeconds: 2,
      checks: ['physics-step', 'sensor-frame-delivery', 'ros2-pubsub'],
    },
    holokey: 'openai-codex-cg009-test-holokey',
    ...overrides,
  } satisfies RoboticsImportValidationInput;
}

describe('RoboticsImportValidation CG-009 receipts', () => {
  it('validates HoloScript-generated URDF, SDF, and Isaac Sim USD Physics lanes', () => {
    const artifacts = compileRoboticsArtifacts();
    const urdf = artifacts.find((artifact) => artifact.format === 'urdf')?.content;
    expect(urdf).toContain('<robot');
    expect(urdf).toContain('front_camera_frame');
    expect(artifacts.find((artifact) => artifact.format === 'sdf')?.content).toContain('<sdf');
    expect(artifacts.find((artifact) => artifact.format === 'usd-physics')?.content).toContain(
      'holoscript:targetContext = "isaac_sim"'
    );

    const result = runRoboticsImportValidationDemo(validationInput({ artifacts }), {
      clock: deterministicClock(),
    });

    expect(result.pass).toBe(true);
    expect(result.verification.valid).toBe(true);
    expect(verifyCAELHashChain(result.trace, 'sha256').valid).toBe(true);
    expect(result.receipts.map((receipt) => receipt.simulatorTarget)).toEqual([
      'isaac_sim',
      'gazebo',
      'ros2',
    ]);

    for (const receipt of result.receipts) {
      expect(receipt.pass).toBe(true);
      expect(receipt.failureReasons).toEqual([]);
      expect(receipt.artifactHashes).toHaveLength(1);
      expect(receipt.artifactHashes[0].hash).toMatch(/^artifact-sha-[0-9a-f]{64}$/);
      expect(receipt.scenario.name).toBe('warehouse-pickup-physics-sensor-smoke');
      expect(receipt.sensorCoverage.covered).toEqual(['camera', 'lidar', 'imu']);
      expect(receipt.syntheticData.passed).toBe(true);
      expect(receipt.ros2Proof).toMatchObject({
        mode: 'simulated',
        explicitlySimulated: true,
        passed: true,
      });
      expect(receipt.triad.semanticReceiptId).toMatch(/^robotics-semantic-sha-/);
      expect(receipt.triad.provenanceReceiptId).toMatch(/^robotics-provenance-sha-/);
      expect(receipt.triad.replayReceiptId).toMatch(/^robotics-replay-sha-/);
      expect(receipt.caelTraceHash).toMatch(/^cael-sha-[0-9a-f]{64}$/);
    }

    const isaacReceipt = result.receipts.find((receipt) => receipt.simulatorTarget === 'isaac_sim');
    expect(isaacReceipt?.artifactHashes[0].compiler).toBe('USDPhysicsCompiler');
    expect(isaacReceipt?.importLane).toBe('isaac-sim-usd-physics-import');
  });

  it('fails when sensor metadata, ROS topic mapping, or artifact provenance is missing', () => {
    const brokenArtifacts = compileRoboticsArtifacts().map((artifact) =>
      artifact.targetContext === 'ros2' ? { ...artifact, provenance: undefined } : artifact
    );
    const result = validateRoboticsImport(
      validationInput({
        artifacts: brokenArtifacts,
        sensors: sensorMetadata().filter((sensor) => sensor.type !== 'imu'),
        ros2TopicMappings: ros2TopicMappings().filter((mapping) => mapping.sensorType !== 'lidar'),
      }),
      {
        runId: 'cael:robotics-import-validation:cg009-failure-test',
        clock: deterministicClock(),
      }
    );

    const failures = result.receipts.flatMap((receipt) => receipt.failureReasons).join('\n');
    expect(result.pass).toBe(false);
    expect(failures).toContain('cg009-ros2-urdf: missing import artifact provenance');
    expect(failures).toContain('missing required sensor metadata: imu');
    expect(failures).toContain('missing ROS2 topic mapping: lidar');
  });

  it('keeps HoloGate as documentation umbrella while naming concrete tools', () => {
    const result = runRoboticsImportValidationDemo(validationInput(), {
      clock: deterministicClock(),
    });
    const custody = result.receipts[0].custody;

    expect(custody.docsUmbrella).toBe('HoloGate');
    expect(custody.docsUmbrellaRole).toBe('umbrella term in docs, not an executable tool');
    expect(custody.concreteTools).toContain('HoloKey');
    expect(custody.concreteTools).toContain('UmbrellaRoute');
    expect(custody.concreteTools).toContain('TriadReceipt');
    expect(custody.concreteTools).not.toContain('HoloGate');
    expect(custody.bridgeContract).toBe(
      'bridge-and-validate open robotics standards, not an Isaac Sim clone'
    );
  });
});
