import {
  type CAELTrace,
  type CAELTraceEntry,
  hashCAELEntry,
  verifyCAELHashChain,
} from './CAELTrace';
import { sha256Bytes, type HashMode } from './sha256';

export type RoboticsJsonValue =
  | string
  | number
  | boolean
  | null
  | RoboticsJsonValue[]
  | { [key: string]: RoboticsJsonValue };

export type RoboticsArtifactFormat = 'urdf' | 'sdf' | 'usd-physics';
export type RoboticsSimulatorTarget = 'isaac_sim' | 'gazebo' | 'ros2';
export type RoboticsRequiredSensorType = 'camera' | 'lidar' | 'imu';

export interface RoboticsArtifactProvenance {
  compiler: 'URDFCompiler' | 'SDFCompiler' | 'USDPhysicsCompiler';
  sourceComposition: string;
  sourceHash: string;
  generatedAt: string;
  options?: Record<string, RoboticsJsonValue>;
}

export interface RoboticsArtifact {
  id: string;
  format: RoboticsArtifactFormat;
  targetContext: RoboticsSimulatorTarget;
  content: string;
  provenance?: RoboticsArtifactProvenance;
  path?: string;
}

export interface RoboticsCameraMetadata {
  width: number;
  height: number;
  horizontalFovRadians: number;
  format: string;
}

export interface RoboticsLidarMetadata {
  samples: number;
  minRangeMeters: number;
  maxRangeMeters: number;
  horizontalFovRadians: number;
}

export interface RoboticsImuMetadata {
  noiseDensity: number;
  biasStability?: number;
}

export interface RoboticsSensorMetadata {
  name: string;
  type: RoboticsRequiredSensorType;
  parentLink: string;
  frameName: string;
  topicName: string;
  updateRateHz: number;
  camera?: RoboticsCameraMetadata;
  lidar?: RoboticsLidarMetadata;
  imu?: RoboticsImuMetadata;
}

export interface RoboticsRos2TopicMapping {
  sensorName: string;
  sensorType: RoboticsRequiredSensorType;
  topicName: string;
  messageType: string;
  frameName: string;
}

export interface RoboticsRos2TopicProof {
  topicName: string;
  messageType: string;
  publisher: string;
  subscriber: string;
  messagesPublished: number;
  messagesReceived: number;
}

export interface RoboticsRos2PubSubProof {
  mode: 'simulated' | 'real';
  nodeName: string;
  transport: 'rclnodejs' | 'ros2-cli' | 'simulated-bridge';
  topics: readonly RoboticsRos2TopicProof[];
}

export interface RoboticsSyntheticDataExportFixture {
  exportId: string;
  format: 'coco' | 'rosbag2' | 'jsonl' | 'parquet';
  frameCount: number;
  sensorNames: readonly string[];
  labels: readonly string[];
  artifactHash: string;
}

export interface RoboticsImportScenario {
  name: string;
  description?: string;
  simulatorTargets?: readonly RoboticsSimulatorTarget[];
  physicsStepHz: number;
  durationSeconds: number;
  checks: readonly string[];
}

export interface RoboticsImportValidationInput {
  artifacts: readonly RoboticsArtifact[];
  sensors: readonly RoboticsSensorMetadata[];
  ros2TopicMappings: readonly RoboticsRos2TopicMapping[];
  ros2Proof: RoboticsRos2PubSubProof;
  syntheticData: RoboticsSyntheticDataExportFixture;
  scenario: RoboticsImportScenario;
  holokey?: string;
}

export interface RoboticsArtifactHashReceipt {
  id: string;
  format: RoboticsArtifactFormat;
  targetContext: RoboticsSimulatorTarget;
  hash: string;
  compiler: string;
  sourceComposition?: string;
  sourceHash?: string;
  path?: string;
}

export interface RoboticsSensorCoverageReceipt {
  required: readonly RoboticsRequiredSensorType[];
  covered: RoboticsRequiredSensorType[];
  missing: RoboticsRequiredSensorType[];
  sensors: readonly RoboticsSensorMetadata[];
}

export interface RoboticsRos2ProofReceipt {
  mode: 'simulated' | 'real';
  explicitlySimulated: boolean;
  transport: RoboticsRos2PubSubProof['transport'];
  nodeName: string;
  topics: readonly RoboticsRos2TopicProof[];
  missingTopics: string[];
  passed: boolean;
}

export interface RoboticsSyntheticDataReceipt {
  exportId: string;
  format: RoboticsSyntheticDataExportFixture['format'];
  frameCount: number;
  sensorNames: readonly string[];
  labels: readonly string[];
  artifactHash: string;
  missingSensors: string[];
  passed: boolean;
}

export interface RoboticsReceiptTriad {
  semanticReceiptId: string;
  provenanceReceiptId: string;
  replayReceiptId: string;
}

export interface RoboticsCustodyReceipt {
  holokey: string;
  docsUmbrella: 'HoloGate';
  docsUmbrellaRole: 'umbrella term in docs, not an executable tool';
  umbrellaRoute: string;
  concreteTools: readonly string[];
  bridgeContract: 'bridge-and-validate open robotics standards, not an Isaac Sim clone';
}

export interface RoboticsImportValidationReceipt {
  receiptId: string;
  simulatorTarget: RoboticsSimulatorTarget;
  importLane: string;
  pass: boolean;
  failureReasons: string[];
  artifactHashes: RoboticsArtifactHashReceipt[];
  scenario: RoboticsImportScenario;
  sensorCoverage: RoboticsSensorCoverageReceipt;
  ros2Proof: RoboticsRos2ProofReceipt;
  syntheticData: RoboticsSyntheticDataReceipt;
  triad: RoboticsReceiptTriad;
  custody: RoboticsCustodyReceipt;
  traceIndex: number;
  caelTraceHash: string;
  prevHash: string;
}

export interface RoboticsImportValidationResult {
  pass: boolean;
  receipts: RoboticsImportValidationReceipt[];
  trace: CAELTrace;
  verification: ReturnType<typeof verifyCAELHashChain>;
}

export interface RoboticsImportValidationHarnessOptions {
  runId?: string;
  hashMode?: HashMode;
  holokey?: string;
  umbrellaRoute?: string;
  clock?: () => number;
}

const REQUIRED_SENSOR_TYPES: readonly RoboticsRequiredSensorType[] = ['camera', 'lidar', 'imu'];

const TARGET_ORDER: readonly RoboticsSimulatorTarget[] = ['isaac_sim', 'gazebo', 'ros2'];

const EXPECTED_FORMAT_BY_TARGET: Record<RoboticsSimulatorTarget, RoboticsArtifactFormat> = {
  isaac_sim: 'usd-physics',
  gazebo: 'sdf',
  ros2: 'urdf',
};

const IMPORT_LANES: Record<RoboticsSimulatorTarget, string> = {
  isaac_sim: 'isaac-sim-usd-physics-import',
  gazebo: 'gazebo-sdf-import',
  ros2: 'ros2-urdf-topic-bridge',
};

const ROS2_MESSAGE_BY_SENSOR: Record<RoboticsRequiredSensorType, readonly string[]> = {
  camera: ['sensor_msgs/msg/Image', 'sensor_msgs/Image'],
  lidar: ['sensor_msgs/msg/LaserScan', 'sensor_msgs/msg/PointCloud2', 'sensor_msgs/LaserScan'],
  imu: ['sensor_msgs/msg/Imu', 'sensor_msgs/Imu'],
};

const DEFAULT_UMBRELLA_ROUTE = 'simulation.robotics.import-validation.cael-receipts';

const CONCRETE_CUSTODY_TOOLS = [
  'HoloKey',
  'UmbrellaRoute',
  'TriadReceipt',
  'URDFCompiler',
  'SDFCompiler',
  'USDPhysicsCompiler',
  'CAELTrace',
  'ROS2TopicMap',
] as const;

export class RoboticsImportValidationHarness {
  private readonly runId: string;
  private readonly hashMode: HashMode;
  private readonly holokey: string;
  private readonly umbrellaRoute: string;
  private readonly clock: () => number;
  private readonly trace: CAELTrace = [];
  private lastHash = 'cael.genesis';

  constructor(options: RoboticsImportValidationHarnessOptions = {}) {
    this.hashMode = options.hashMode ?? 'sha256';
    this.runId =
      options.runId ??
      `cael:robotics-import-validation:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.holokey = options.holokey ?? 'unassigned-holokey';
    this.umbrellaRoute = options.umbrellaRoute ?? DEFAULT_UMBRELLA_ROUTE;
    this.clock = options.clock ?? (() => Date.now());
    this.appendTrace('init', {
      service: 'robotics-import-validation.v1',
      custody: this.custody(),
      hashMode: this.hashMode,
    });
  }

  validate(input: RoboticsImportValidationInput): RoboticsImportValidationResult {
    const targetOrder = resolveTargets(input);
    const sensorCoverage = validateSensorCoverage(input.sensors);
    const ros2Proof = validateRos2Proof(input.sensors, input.ros2TopicMappings, input.ros2Proof);
    const syntheticData = validateSyntheticData(input.sensors, input.syntheticData);
    const scenarioFailures = validateScenario(input.scenario);

    const receipts = targetOrder.map((target) =>
      this.validateTarget(target, input, sensorCoverage, ros2Proof, syntheticData, scenarioFailures)
    );
    const verification = verifyCAELHashChain(this.trace, this.hashMode);

    return {
      pass: receipts.every((receipt) => receipt.pass) && verification.valid,
      receipts,
      trace: this.getTrace(),
      verification,
    };
  }

  getTrace(): CAELTrace {
    return cloneJson(this.trace);
  }

  private validateTarget(
    target: RoboticsSimulatorTarget,
    input: RoboticsImportValidationInput,
    sensorCoverage: ValidationSection<RoboticsSensorCoverageReceipt>,
    ros2Proof: ValidationSection<RoboticsRos2ProofReceipt>,
    syntheticData: ValidationSection<RoboticsSyntheticDataReceipt>,
    scenarioFailures: string[]
  ): RoboticsImportValidationReceipt {
    const artifactsForTarget = input.artifacts.filter(
      (artifact) => artifact.targetContext === target
    );
    const artifactFailures =
      artifactsForTarget.length === 0
        ? [`missing import artifact for simulator target: ${target}`]
        : artifactsForTarget.flatMap((artifact) => validateArtifact(artifact, target));
    const artifactHashes = artifactsForTarget.map(artifactHashReceipt);
    const failureReasons = [
      ...artifactFailures,
      ...sensorCoverage.failureReasons,
      ...ros2Proof.failureReasons,
      ...syntheticData.failureReasons,
      ...scenarioFailures,
    ];
    const pass = failureReasons.length === 0;
    const traceEntry = this.appendTrace('interaction', {
      action: 'robotics-import-validation',
      simulatorTarget: target,
      importLane: IMPORT_LANES[target],
      artifactHashes,
      scenario: input.scenario,
      sensorCoverage: sensorCoverage.receipt,
      ros2Proof: ros2Proof.receipt,
      syntheticData: syntheticData.receipt,
      pass,
      failureReasons,
      bridgeContract: 'bridge-and-validate open robotics standards, not an Isaac Sim clone',
    });
    const triad = this.triadForReceipt(target, traceEntry, artifactHashes, input.scenario, pass);

    return {
      receiptId: stableDigest(
        {
          target,
          traceHash: traceEntry.hash,
          triad,
          pass,
          failureReasons,
        },
        'robotics-import-receipt'
      ),
      simulatorTarget: target,
      importLane: IMPORT_LANES[target],
      pass,
      failureReasons,
      artifactHashes,
      scenario: cloneJson(input.scenario),
      sensorCoverage: sensorCoverage.receipt,
      ros2Proof: ros2Proof.receipt,
      syntheticData: syntheticData.receipt,
      triad,
      custody: this.custody(),
      traceIndex: traceEntry.index,
      caelTraceHash: traceEntry.hash,
      prevHash: traceEntry.prevHash,
    };
  }

  private appendTrace(
    event: CAELTraceEntry['event'],
    payload: Record<string, unknown>
  ): CAELTraceEntry {
    const entryWithoutHash: Omit<CAELTraceEntry, 'hash'> = {
      version: 'cael.v1',
      runId: this.runId,
      index: this.trace.length,
      event,
      timestamp: this.clock(),
      simTime: this.trace.length,
      prevHash: this.lastHash,
      payload: {
        ...payload,
        hashMode: this.hashMode,
      },
    };
    const hash = hashCAELEntry(entryWithoutHash, this.hashMode);
    const entry: CAELTraceEntry = { ...entryWithoutHash, hash };
    this.trace.push(entry);
    this.lastHash = hash;
    return entry;
  }

  private triadForReceipt(
    target: RoboticsSimulatorTarget,
    traceEntry: CAELTraceEntry,
    artifactHashes: readonly RoboticsArtifactHashReceipt[],
    scenario: RoboticsImportScenario,
    pass: boolean
  ): RoboticsReceiptTriad {
    return {
      semanticReceiptId: stableDigest(
        {
          target,
          scenario: scenario.name,
          importLane: IMPORT_LANES[target],
          pass,
        },
        'robotics-semantic'
      ),
      provenanceReceiptId: stableDigest(
        {
          target,
          artifactHashes,
          traceHash: traceEntry.hash,
        },
        'robotics-provenance'
      ),
      replayReceiptId: stableDigest(
        {
          runId: this.runId,
          traceIndex: traceEntry.index,
          traceHash: traceEntry.hash,
          prevHash: traceEntry.prevHash,
        },
        'robotics-replay'
      ),
    };
  }

  private custody(): RoboticsCustodyReceipt {
    return {
      holokey: this.holokey,
      docsUmbrella: 'HoloGate',
      docsUmbrellaRole: 'umbrella term in docs, not an executable tool',
      umbrellaRoute: this.umbrellaRoute,
      concreteTools: CONCRETE_CUSTODY_TOOLS,
      bridgeContract: 'bridge-and-validate open robotics standards, not an Isaac Sim clone',
    };
  }
}

export function validateRoboticsImport(
  input: RoboticsImportValidationInput,
  options: RoboticsImportValidationHarnessOptions = {}
): RoboticsImportValidationResult {
  const harness = new RoboticsImportValidationHarness({
    ...options,
    holokey: input.holokey ?? options.holokey,
  });
  return harness.validate(input);
}

export function runRoboticsImportValidationDemo(
  input: RoboticsImportValidationInput,
  options: RoboticsImportValidationHarnessOptions = {}
): RoboticsImportValidationResult {
  return validateRoboticsImport(input, {
    runId: options.runId ?? 'cael:robotics-import-validation:cg009-demo',
    holokey: options.holokey ?? input.holokey ?? 'openai-codex-cg009-holokey',
    clock: options.clock,
    hashMode: options.hashMode,
    umbrellaRoute: options.umbrellaRoute,
  });
}

interface ValidationSection<T> {
  receipt: T;
  failureReasons: string[];
}

function resolveTargets(input: RoboticsImportValidationInput): RoboticsSimulatorTarget[] {
  const requested = new Set<RoboticsSimulatorTarget>(
    input.scenario.simulatorTargets ?? input.artifacts.map((artifact) => artifact.targetContext)
  );
  const targets = TARGET_ORDER.filter((target) => requested.has(target));
  return targets.length > 0 ? targets : [...TARGET_ORDER];
}

function validateArtifact(artifact: RoboticsArtifact, target: RoboticsSimulatorTarget): string[] {
  const failures: string[] = [];
  const expectedFormat = EXPECTED_FORMAT_BY_TARGET[target];
  if (artifact.format !== expectedFormat) {
    failures.push(
      `${artifact.id}: ${target} lane expects ${expectedFormat}, received ${artifact.format}`
    );
  }
  if (!artifact.provenance) {
    failures.push(`${artifact.id}: missing import artifact provenance`);
  } else {
    if (!artifact.provenance.compiler) failures.push(`${artifact.id}: missing compiler provenance`);
    if (!artifact.provenance.sourceComposition) {
      failures.push(`${artifact.id}: missing source composition provenance`);
    }
    if (!artifact.provenance.sourceHash) {
      failures.push(`${artifact.id}: missing source hash provenance`);
    }
    if (!artifact.provenance.generatedAt) {
      failures.push(`${artifact.id}: missing generation timestamp provenance`);
    }
  }
  if (artifact.content.trim().length === 0) {
    failures.push(`${artifact.id}: empty import artifact content`);
    return failures;
  }

  if (artifact.format === 'urdf' && !artifact.content.includes('<robot')) {
    failures.push(`${artifact.id}: URDF artifact does not contain a <robot> root`);
  }
  if (artifact.format === 'sdf' && !artifact.content.includes('<sdf')) {
    failures.push(`${artifact.id}: SDF artifact does not contain a <sdf> root`);
  }
  if (artifact.format === 'usd-physics') {
    if (!artifact.content.includes('#usda')) {
      failures.push(`${artifact.id}: USD Physics artifact does not contain USDA header`);
    }
    if (!artifact.content.includes('PhysicsScene')) {
      failures.push(`${artifact.id}: USD Physics artifact does not contain a PhysicsScene`);
    }
    if (!artifact.content.includes('holoscript:targetContext = "isaac_sim"')) {
      failures.push(`${artifact.id}: USD Physics artifact is missing isaac_sim targetContext`);
    }
  }

  return failures;
}

function validateSensorCoverage(
  sensors: readonly RoboticsSensorMetadata[]
): ValidationSection<RoboticsSensorCoverageReceipt> {
  const failures: string[] = [];
  const covered = new Set<RoboticsRequiredSensorType>();

  for (const sensor of sensors) {
    if (!sensor.name) failures.push('sensor metadata missing name');
    if (!sensor.parentLink) failures.push(`${sensor.name || 'sensor'}: missing parent link`);
    if (!sensor.frameName) failures.push(`${sensor.name || 'sensor'}: missing frame name`);
    if (!sensor.topicName) failures.push(`${sensor.name || 'sensor'}: missing ROS topic name`);
    if (!Number.isFinite(sensor.updateRateHz) || sensor.updateRateHz <= 0) {
      failures.push(`${sensor.name || 'sensor'}: updateRateHz must be positive`);
    }

    if (sensor.type === 'camera') {
      covered.add('camera');
      if (
        !sensor.camera ||
        sensor.camera.width <= 0 ||
        sensor.camera.height <= 0 ||
        sensor.camera.horizontalFovRadians <= 0 ||
        !sensor.camera.format
      ) {
        failures.push(`${sensor.name || 'camera'}: incomplete camera metadata`);
      }
    } else if (sensor.type === 'lidar') {
      covered.add('lidar');
      if (
        !sensor.lidar ||
        sensor.lidar.samples <= 0 ||
        sensor.lidar.minRangeMeters < 0 ||
        sensor.lidar.maxRangeMeters <= sensor.lidar.minRangeMeters ||
        sensor.lidar.horizontalFovRadians <= 0
      ) {
        failures.push(`${sensor.name || 'lidar'}: incomplete LiDAR metadata`);
      }
    } else if (sensor.type === 'imu') {
      covered.add('imu');
      if (!sensor.imu || sensor.imu.noiseDensity < 0) {
        failures.push(`${sensor.name || 'imu'}: incomplete IMU metadata`);
      }
    }
  }

  const missing = REQUIRED_SENSOR_TYPES.filter((type) => !covered.has(type));
  if (missing.length > 0) {
    failures.push(`missing required sensor metadata: ${missing.join(', ')}`);
  }

  return {
    receipt: {
      required: REQUIRED_SENSOR_TYPES,
      covered: REQUIRED_SENSOR_TYPES.filter((type) => covered.has(type)),
      missing,
      sensors: cloneJson(sensors),
    },
    failureReasons: failures,
  };
}

function validateRos2Proof(
  sensors: readonly RoboticsSensorMetadata[],
  mappings: readonly RoboticsRos2TopicMapping[],
  proof: RoboticsRos2PubSubProof
): ValidationSection<RoboticsRos2ProofReceipt> {
  const failures: string[] = [];
  const missingTopics: string[] = [];

  if (!proof.nodeName) failures.push('missing ROS2 pub/sub proof node name');
  if (proof.topics.length === 0) failures.push('missing ROS2 pub/sub proof topics');

  for (const sensorType of REQUIRED_SENSOR_TYPES) {
    const sensor = sensors.find((candidate) => candidate.type === sensorType);
    const mapping = mappings.find(
      (candidate) =>
        candidate.sensorType === sensorType &&
        (!sensor ||
          candidate.sensorName === sensor.name ||
          candidate.topicName === sensor.topicName)
    );

    if (!mapping) {
      failures.push(`missing ROS2 topic mapping: ${sensorType}`);
      missingTopics.push(sensor?.topicName ?? sensorType);
      continue;
    }
    if (!mapping.topicName) failures.push(`${mapping.sensorName}: missing ROS2 topic name`);
    if (!mapping.frameName) failures.push(`${mapping.sensorName}: missing ROS2 frame name`);
    if (!ROS2_MESSAGE_BY_SENSOR[sensorType].includes(mapping.messageType)) {
      failures.push(`${mapping.sensorName}: unexpected ROS2 message type ${mapping.messageType}`);
    }

    const topicProof = proof.topics.find((topic) => topic.topicName === mapping.topicName);
    if (!topicProof) {
      failures.push(`missing ROS2 pub/sub proof for topic: ${mapping.topicName}`);
      missingTopics.push(mapping.topicName);
      continue;
    }
    if (topicProof.messageType !== mapping.messageType) {
      failures.push(`${mapping.topicName}: proof message type does not match topic mapping`);
    }
    if (topicProof.messagesPublished <= 0 || topicProof.messagesReceived <= 0) {
      failures.push(`${mapping.topicName}: ROS2 pub/sub proof has no delivered messages`);
    }
  }

  return {
    receipt: {
      mode: proof.mode,
      explicitlySimulated: proof.mode === 'simulated',
      transport: proof.transport,
      nodeName: proof.nodeName,
      topics: cloneJson(proof.topics),
      missingTopics,
      passed: failures.length === 0,
    },
    failureReasons: failures,
  };
}

function validateSyntheticData(
  sensors: readonly RoboticsSensorMetadata[],
  syntheticData: RoboticsSyntheticDataExportFixture
): ValidationSection<RoboticsSyntheticDataReceipt> {
  const failures: string[] = [];
  const missingSensors = sensors
    .map((sensor) => sensor.name)
    .filter((sensorName) => !syntheticData.sensorNames.includes(sensorName));

  if (!syntheticData.exportId) failures.push('missing synthetic-data export id');
  if (syntheticData.frameCount <= 0) failures.push('synthetic-data export has no frames');
  if (syntheticData.labels.length === 0) failures.push('synthetic-data export has no labels');
  if (!syntheticData.artifactHash) failures.push('missing synthetic-data artifact hash');
  if (missingSensors.length > 0) {
    failures.push(`synthetic data export missing sensor fixture: ${missingSensors.join(', ')}`);
  }

  return {
    receipt: {
      exportId: syntheticData.exportId,
      format: syntheticData.format,
      frameCount: syntheticData.frameCount,
      sensorNames: [...syntheticData.sensorNames],
      labels: [...syntheticData.labels],
      artifactHash: syntheticData.artifactHash,
      missingSensors,
      passed: failures.length === 0,
    },
    failureReasons: failures,
  };
}

function validateScenario(scenario: RoboticsImportScenario): string[] {
  const failures: string[] = [];
  if (!scenario.name) failures.push('scenario missing name');
  if (!Number.isFinite(scenario.physicsStepHz) || scenario.physicsStepHz <= 0) {
    failures.push('scenario physicsStepHz must be positive');
  }
  if (!Number.isFinite(scenario.durationSeconds) || scenario.durationSeconds <= 0) {
    failures.push('scenario durationSeconds must be positive');
  }
  if (!scenario.checks.some((check) => check.toLowerCase().includes('physics'))) {
    failures.push('scenario missing physics check');
  }
  if (!scenario.checks.some((check) => check.toLowerCase().includes('sensor'))) {
    failures.push('scenario missing sensor check');
  }
  if (!scenario.checks.some((check) => check.toLowerCase().includes('ros2'))) {
    failures.push('scenario missing ROS2 check');
  }
  return failures;
}

function artifactHashReceipt(artifact: RoboticsArtifact): RoboticsArtifactHashReceipt {
  return {
    id: artifact.id,
    format: artifact.format,
    targetContext: artifact.targetContext,
    hash: stableDigest(artifact.content, 'artifact'),
    compiler: artifact.provenance?.compiler ?? 'missing-provenance',
    ...(artifact.provenance?.sourceComposition
      ? { sourceComposition: artifact.provenance.sourceComposition }
      : {}),
    ...(artifact.provenance?.sourceHash ? { sourceHash: artifact.provenance.sourceHash } : {}),
    ...(artifact.path ? { path: artifact.path } : {}),
  };
}

function stableDigest(value: unknown, prefix: string): string {
  const bytes = new TextEncoder().encode(stableStringify(value));
  return `${prefix}-sha-${sha256Bytes(bytes)}`;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortJson(item));
  if (!isRecord(value)) return value;

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const nested = value[key];
    if (nested !== undefined) out[key] = sortJson(nested);
  }
  return out;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
