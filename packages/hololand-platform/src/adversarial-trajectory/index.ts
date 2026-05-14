import { createHash } from 'node:crypto';

export const ADVERSARIAL_TRAJECTORY_SCHEMA = 'holoscript.adversarial-trajectory.v1' as const;
export const ADVERSARIAL_TRAJECTORY_GENERATOR =
  '@holoscript/hololand-platform/adversarial-trajectory' as const;

export type PredicateName =
  | 'violation'
  | 'novelty'
  | 'learnability'
  | 'regression'
  | 'invalidity';

export type TrajectoryStatus = 'solved' | 'unresolved' | 'invalid';
export type AdversarialActionKind = 'move' | 'rotateCamera' | 'interact';
export type SemanticEventType =
  | 'placement'
  | 'camera-motion'
  | 'contact'
  | 'collision'
  | 'target-progress'
  | 'semantic-violation'
  | 'validity-check';

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface SceneObject {
  id: string;
  label: string;
  semanticRole: 'obstacle' | 'protected' | 'occluder' | 'goal';
  position: Vector3;
  size: Vector3;
  contactPolicy: 'avoid' | 'allowed' | 'goal';
}

export interface DeterministicScene {
  sceneId: string;
  sceneHash: string;
  seed: string;
  description: string;
  worldBounds: {
    min: Vector3;
    max: Vector3;
  };
  agentStart: Vector3;
  cameraStart: Vector3;
  target: Vector3;
  objects: SceneObject[];
  contract: {
    invariant: string;
    failureModes: string[];
  };
}

export interface AdversarialAction {
  step: number;
  kind: AdversarialActionKind;
  intent: string;
  delta?: Vector3;
  yawDelta?: number;
  mutatedParameter: string;
}

export interface SemanticEvent {
  step: number;
  type: SemanticEventType;
  subject: string;
  object?: string;
  value?: number | string;
  message: string;
}

export interface AdversarialObservation {
  step: number;
  agentPosition: Vector3;
  cameraPosition: Vector3;
  cameraYaw: number;
  contacts: string[];
  distanceToTarget: number;
  outOfBounds: boolean;
  eventLog: SemanticEvent[];
}

export interface SemanticPredicateScore {
  name: PredicateName;
  value: number;
  threshold: number;
  passed: boolean;
  weight: number;
  evidence: string[];
}

export interface CurriculumPriority {
  rank: number;
  score: number;
  components: Record<PredicateName, number>;
  reason: string;
}

export interface ValidityAnchor {
  anchorId: string;
  anchorKind:
    | 'scene-hash'
    | 'action-trace-hash'
    | 'observation-trace-hash'
    | 'predicate-hash'
    | 'cael-receipt-hash';
  hash: string;
  command?: string;
  notes: string;
}

export interface ReplayHandle {
  trajectoryId: string;
  sceneHash: string;
  seed: string;
  replayCommand: string;
  actionTraceHash: string;
  observationTraceHash: string;
  expectedPredicateHash: string;
  caelReceiptHash: string;
}

export interface AdversarialTrajectory {
  id: string;
  sceneId: string;
  sceneHash: string;
  seed: string;
  mutator: string;
  actionTrace: AdversarialAction[];
  observationTrace: AdversarialObservation[];
  predicateScores: SemanticPredicateScore[];
  curriculumPriority: CurriculumPriority;
  validityAnchors: ValidityAnchor[];
  replay: ReplayHandle;
  status: TrajectoryStatus;
  statusReason: string;
}

export interface AdversarialTrajectorySummary {
  total: number;
  solved: number;
  unresolved: number;
  invalid: number;
  predicateNames: PredicateName[];
  topPriorityTrajectoryIds: string[];
}

export interface AdversarialTrajectoryReport {
  schemaVersion: typeof ADVERSARIAL_TRAJECTORY_SCHEMA;
  generatedAt: string;
  generatedBy: typeof ADVERSARIAL_TRAJECTORY_GENERATOR;
  taskId?: string;
  scene: DeterministicScene;
  summary: AdversarialTrajectorySummary;
  trajectories: AdversarialTrajectory[];
  reportHash: string;
}

export interface AdversarialTrajectoryReportOptions {
  count?: number;
  seed?: string;
  generatedAt?: string;
  reportPath?: string;
  taskId?: string;
}

export interface PredicateReplayDelta {
  name: PredicateName;
  expected: number;
  actual: number;
  delta: number;
  threshold: number;
  stable: boolean;
  expectedPassed: boolean;
  actualPassed: boolean;
}

export interface AdversarialTrajectoryReplayResult {
  trajectoryId: string;
  replayStatus: 'pass' | 'fail';
  expectedStatus: TrajectoryStatus;
  actualStatus: TrajectoryStatus;
  predicateDeltas: PredicateReplayDelta[];
  receiptHashes: {
    sceneHash: string;
    actionTraceHash: string;
    observationTraceHash: string;
    expectedPredicateHash: string;
    actualPredicateHash: string;
    caelReceiptHash: string;
  };
}

interface MutatorProfile {
  name: string;
  baseStepX: number;
  laneBiasZ: number;
  cameraBias: number;
  burstEvery: number;
  burstScale: number;
  intent: string;
}

interface TrajectoryDraft {
  id: string;
  sceneId: string;
  sceneHash: string;
  seed: string;
  mutator: string;
  actionTrace: AdversarialAction[];
  observationTrace: AdversarialObservation[];
  predicateScores: SemanticPredicateScore[];
  priorityScore: number;
  priorityReason: string;
  status: TrajectoryStatus;
  statusReason: string;
}

const DEFAULT_SEED = 'task_1778659494755_41li-prowl-response';
const DEFAULT_REPORT_PATH = 'docs/public/evidence/adversarial-trajectory-report.json';
const PREDICATE_ORDER: PredicateName[] = [
  'violation',
  'novelty',
  'learnability',
  'regression',
  'invalidity',
];

const MUTATORS: MutatorProfile[] = [
  {
    name: 'protected-contact-sweep',
    baseStepX: 0.74,
    laneBiasZ: -0.08,
    cameraBias: -15,
    burstEvery: 5,
    burstScale: 1.08,
    intent: 'probe protected console contact while keeping the scene replayable',
  },
  {
    name: 'occlusion-camera-drift',
    baseStepX: 0.7,
    laneBiasZ: 0.24,
    cameraBias: 22,
    burstEvery: 4,
    burstScale: 1.0,
    intent: 'force camera yaw away from the target near semantic obstacles',
  },
  {
    name: 'goal-approach-regression',
    baseStepX: 0.82,
    laneBiasZ: 0.02,
    cameraBias: -8,
    burstEvery: 6,
    burstScale: 1.05,
    intent: 'replay a prior target-approach regression lane',
  },
  {
    name: 'wide-lane-novelty',
    baseStepX: 0.66,
    laneBiasZ: 0.48,
    cameraBias: 12,
    burstEvery: 3,
    burstScale: 1.0,
    intent: 'search a wide lane for new contact signatures',
  },
  {
    name: 'invalid-speed-spike',
    baseStepX: 1.18,
    laneBiasZ: 0.68,
    cameraBias: 31,
    burstEvery: 2,
    burstScale: 1.36,
    intent: 'mark impossible motion as invalid evidence instead of a solved failure',
  },
];

export function createAdversarialTrajectoryReport(
  options: AdversarialTrajectoryReportOptions = {},
): AdversarialTrajectoryReport {
  const count = Math.max(20, Math.trunc(options.count ?? 20));
  const seed = options.seed ?? DEFAULT_SEED;
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const reportPath = options.reportPath ?? DEFAULT_REPORT_PATH;
  const scene = createDeterministicFailureScene(seed);
  const drafts = Array.from({ length: count }, (_, index) =>
    buildTrajectoryDraft(scene, seed, index),
  );
  const ranked = rankTrajectoryDrafts(drafts).map((draft) =>
    finalizeTrajectoryDraft(draft, reportPath),
  );

  const body = {
    schemaVersion: ADVERSARIAL_TRAJECTORY_SCHEMA,
    generatedAt,
    generatedBy: ADVERSARIAL_TRAJECTORY_GENERATOR,
    ...(options.taskId ? { taskId: options.taskId } : {}),
    scene,
    summary: summarizeTrajectories(ranked),
    trajectories: ranked,
  };

  return {
    ...body,
    reportHash: hashValue(body),
  };
}

export function createDeterministicFailureScene(seed: string = DEFAULT_SEED): DeterministicScene {
  const sceneBody = {
    sceneId: 'semantic-obstacle-corridor',
    seed,
    description:
      'Deterministic HoloLand corridor with protected console contact, occluder drift, target approach, and replayable camera motion.',
    worldBounds: {
      min: vector(-0.5, 0, -1.75),
      max: vector(9.5, 2.5, 1.75),
    },
    agentStart: vector(0, 0, 0),
    cameraStart: vector(-0.25, 1.55, -0.2),
    target: vector(8.4, 0, 0),
    objects: [
      sceneObject('pillar-a', 'Entry pillar', 'obstacle', vector(2.1, 0, 0.12), vector(0.68, 1.8, 0.68), 'avoid'),
      sceneObject('protected-console', 'Protected console', 'protected', vector(4.35, 0, -0.32), vector(0.72, 1.2, 0.72), 'avoid'),
      sceneObject('occlusion-gate', 'Camera occlusion gate', 'occluder', vector(6.15, 0, 0.46), vector(0.9, 1.7, 0.62), 'avoid'),
      sceneObject('target-beacon', 'Target beacon', 'goal', vector(8.4, 0, 0), vector(0.65, 1, 0.65), 'goal'),
    ],
    contract: {
      invariant:
        'A valid trace may approach the target, but it must not contact protected surfaces or lose target visibility while claiming progress.',
      failureModes: [
        'protected-contact',
        'camera-occlusion-progress',
        'historical-regression-lane',
        'invalid-motion-envelope',
      ],
    },
  };

  return {
    ...sceneBody,
    sceneHash: hashValue(sceneBody),
  };
}

export function simulateScene(
  scene: DeterministicScene,
  actionTrace: AdversarialAction[],
): AdversarialObservation[] {
  let agentPosition = { ...scene.agentStart };
  let cameraYaw = 0;

  return actionTrace.map((action) => {
    const eventLog: SemanticEvent[] = action.step === 0 ? placementEvents(scene) : [];

    if (action.kind === 'move' && action.delta) {
      agentPosition = roundVector(addVector(agentPosition, action.delta));
      eventLog.push({
        step: action.step,
        type: 'target-progress',
        subject: 'agent',
        object: 'target-beacon',
        value: roundNumber(distance(agentPosition, scene.target)),
        message: 'Agent advanced through the semantic corridor.',
      });
    } else if (action.kind === 'rotateCamera') {
      cameraYaw = roundNumber(cameraYaw + (action.yawDelta ?? 0));
      eventLog.push({
        step: action.step,
        type: 'camera-motion',
        subject: 'camera',
        value: cameraYaw,
        message: `Camera yaw changed to ${cameraYaw} degrees.`,
      });
    } else if (action.kind === 'interact') {
      eventLog.push({
        step: action.step,
        type: 'validity-check',
        subject: 'agent',
        message: 'Agent emitted an interaction pulse for contact disambiguation.',
      });
    }

    const contacts = detectContacts(scene, agentPosition);
    for (const objectId of contacts) {
      const object = scene.objects.find((candidate) => candidate.id === objectId);
      const role = object?.semanticRole ?? 'obstacle';
      eventLog.push({
        step: action.step,
        type: 'contact',
        subject: 'agent',
        object: objectId,
        message: `Agent contacted ${objectId}.`,
      });
      if (role !== 'goal') {
        eventLog.push({
          step: action.step,
          type: 'collision',
          subject: 'agent',
          object: objectId,
          message: `Contact with ${objectId} violates the avoid-contact contract.`,
        });
      }
      if (role === 'protected') {
        eventLog.push({
          step: action.step,
          type: 'semantic-violation',
          subject: 'agent',
          object: objectId,
          message: 'Protected console contact is a semantic contract violation.',
        });
      }
    }

    const distanceToTarget = roundNumber(distance(agentPosition, scene.target));
    if (distanceToTarget < 2.8 && Math.abs(cameraYaw) > 55) {
      eventLog.push({
        step: action.step,
        type: 'semantic-violation',
        subject: 'camera',
        object: 'target-beacon',
        value: cameraYaw,
        message: 'Camera yaw excludes target visibility during claimed progress.',
      });
    }

    const outOfBounds = isOutOfBounds(scene, agentPosition);
    if (outOfBounds) {
      eventLog.push({
        step: action.step,
        type: 'validity-check',
        subject: 'agent',
        value: vectorKey(agentPosition),
        message: 'Agent pose left the deterministic scene bounds.',
      });
    }

    return {
      step: action.step,
      agentPosition: roundVector(agentPosition),
      cameraPosition: roundVector(addVector(agentPosition, scene.cameraStart)),
      cameraYaw,
      contacts,
      distanceToTarget,
      outOfBounds,
      eventLog,
    };
  });
}

export function replayTrajectory(
  report: AdversarialTrajectoryReport,
  trajectoryId: string,
): AdversarialTrajectoryReplayResult {
  const index = report.trajectories.findIndex((trajectory) => trajectory.id === trajectoryId);
  if (index < 0) {
    throw new Error(`Unknown trajectory id: ${trajectoryId}`);
  }

  const expected = report.trajectories[index];
  const observationTrace = simulateScene(report.scene, expected.actionTrace);
  const predicateScores = scoreTrajectory({
    scene: report.scene,
    actionTrace: expected.actionTrace,
    observationTrace,
    trajectoryIndex: index,
  });
  const actualStatus = classifyStatus(predicateScores);
  const actualPredicateHash = hashValue(predicateScores);
  const actionTraceHash = hashValue(expected.actionTrace);
  const observationTraceHash = hashValue(observationTrace);
  const caelReceiptHash = buildCaelReceiptHash({
    sceneHash: report.scene.sceneHash,
    trajectoryId,
    actionTraceHash,
    observationTraceHash,
    predicateHash: actualPredicateHash,
    status: actualStatus.status,
  });

  const predicateDeltas = expected.predicateScores.map((score) => {
    const actual = predicateScores.find((candidate) => candidate.name === score.name);
    if (!actual) {
      throw new Error(`Missing replay predicate ${score.name}`);
    }

    const delta = roundNumber(actual.value - score.value, 6);
    return {
      name: score.name,
      expected: score.value,
      actual: actual.value,
      delta,
      threshold: score.threshold,
      stable: Math.abs(delta) <= 0.000001 && actual.passed === score.passed,
      expectedPassed: score.passed,
      actualPassed: actual.passed,
    };
  });

  const hashes = {
    sceneHash: report.scene.sceneHash,
    actionTraceHash,
    observationTraceHash,
    expectedPredicateHash: expected.replay.expectedPredicateHash,
    actualPredicateHash,
    caelReceiptHash,
  };
  const replayStatus =
    predicateDeltas.every((delta) => delta.stable) &&
    expected.status === actualStatus.status &&
    expected.replay.actionTraceHash === actionTraceHash &&
    expected.replay.observationTraceHash === observationTraceHash &&
    expected.replay.caelReceiptHash === caelReceiptHash
      ? 'pass'
      : 'fail';

  return {
    trajectoryId,
    replayStatus,
    expectedStatus: expected.status,
    actualStatus: actualStatus.status,
    predicateDeltas,
    receiptHashes: hashes,
  };
}

export function scoreTrajectory(input: {
  scene: DeterministicScene;
  actionTrace: AdversarialAction[];
  observationTrace: AdversarialObservation[];
  trajectoryIndex: number;
}): SemanticPredicateScore[] {
  const events = input.observationTrace.flatMap((observation) => observation.eventLog);
  const contactIds = unique(events.filter((event) => event.type === 'contact').map((event) => event.object ?? 'unknown'));
  const collisions = events.filter((event) => event.type === 'collision');
  const protectedHits = events.filter((event) => event.object === 'protected-console');
  const semanticViolations = events.filter((event) => event.type === 'semantic-violation');
  const cameraMotions = events.filter((event) => event.type === 'camera-motion');
  const outOfBoundsCount = input.observationTrace.filter((observation) => observation.outOfBounds).length;
  const highSpeedMoves = input.actionTrace.filter(
    (action) => action.delta && vectorMagnitude(action.delta) > 1.25,
  ).length;
  const minDistance = Math.min(...input.observationTrace.map((observation) => observation.distanceToTarget));
  const zSpread = Math.max(
    ...input.observationTrace.map((observation) => Math.abs(observation.agentPosition.z)),
  );

  const invalidity = clamp(
    outOfBoundsCount * 0.3 + highSpeedMoves * 0.16 + (zSpread > 1.65 ? 0.22 : 0),
  );
  const violation = clamp(
    collisions.length * 0.18 +
      protectedHits.length * 0.16 +
      semanticViolations.length * 0.14 +
      (minDistance < 1.25 ? 0.12 : 0),
  );
  const novelty = clamp(
    0.18 +
      contactIds.length * 0.17 +
      zSpread * 0.14 +
      (Math.abs(input.trajectoryIndex % 7) / 7) * 0.18 +
      (cameraMotions.length > 2 ? 0.08 : 0),
  );
  const learnability = clamp(
    0.28 +
      Math.min(input.actionTrace.length / 14, 1) * 0.32 +
      (semanticViolations.length > 0 ? 0.18 : 0) +
      (contactIds.length <= 3 ? 0.08 : 0) -
      invalidity * 0.42,
  );
  const regression = clamp(
    protectedHits.length > 0
      ? 0.72 + Math.min(protectedHits.length, 2) * 0.08
      : contactIds.includes('occlusion-gate')
        ? 0.58
        : contactIds.includes('pillar-a')
          ? 0.42
          : 0.18,
  );

  const scores: Record<PredicateName, number> = {
    violation: roundScore(violation),
    novelty: roundScore(novelty),
    learnability: roundScore(learnability),
    regression: roundScore(regression),
    invalidity: roundScore(invalidity),
  };

  return PREDICATE_ORDER.map((name) =>
    buildPredicate(name, scores[name], predicateThreshold(name), predicateWeight(name), {
      contactIds,
      collisions: collisions.length,
      protectedHits: protectedHits.length,
      semanticViolations: semanticViolations.length,
      outOfBoundsCount,
      highSpeedMoves,
      minDistance,
    }),
  );
}

export function hashValue(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortForJson(value));
}

function buildTrajectoryDraft(
  scene: DeterministicScene,
  seed: string,
  trajectoryIndex: number,
): TrajectoryDraft {
  const profile = MUTATORS[trajectoryIndex % MUTATORS.length];
  if (!profile) throw new Error(`Missing mutator profile for index ${trajectoryIndex}`);
  const trajectorySeed = `${seed}:trajectory:${trajectoryIndex}`;
  const id = `traj_${String(trajectoryIndex + 1).padStart(3, '0')}_${shortHash({
    sceneHash: scene.sceneHash,
    seed: trajectorySeed,
    mutator: profile.name,
  })}`;
  const actionTrace = buildActionTrace(trajectorySeed, trajectoryIndex, profile);
  const observationTrace = simulateScene(scene, actionTrace);
  const predicateScores = scoreTrajectory({
    scene,
    actionTrace,
    observationTrace,
    trajectoryIndex,
  });
  const status = classifyStatus(predicateScores);
  const priority = calculatePriority(predicateScores);

  return {
    id,
    sceneId: scene.sceneId,
    sceneHash: scene.sceneHash,
    seed: trajectorySeed,
    mutator: profile.name,
    actionTrace,
    observationTrace,
    predicateScores,
    priorityScore: priority.score,
    priorityReason: priority.reason,
    status: status.status,
    statusReason: status.reason,
  };
}

function finalizeTrajectoryDraft(
  draft: TrajectoryDraft & { priorityRank: number },
  reportPath: string,
): AdversarialTrajectory {
  const actionTraceHash = hashValue(draft.actionTrace);
  const observationTraceHash = hashValue(draft.observationTrace);
  const expectedPredicateHash = hashValue(draft.predicateScores);
  const caelReceiptHash = buildCaelReceiptHash({
    sceneHash: draft.sceneHash,
    trajectoryId: draft.id,
    actionTraceHash,
    observationTraceHash,
    predicateHash: expectedPredicateHash,
    status: draft.status,
  });
  const replayCommand = `pnpm --filter @holoscript/hololand-platform run adversarial-trajectory -- replay ${draft.id} --report ${reportPath}`;

  return {
    id: draft.id,
    sceneId: draft.sceneId,
    sceneHash: draft.sceneHash,
    seed: draft.seed,
    mutator: draft.mutator,
    actionTrace: draft.actionTrace,
    observationTrace: draft.observationTrace,
    predicateScores: draft.predicateScores,
    curriculumPriority: {
      rank: draft.priorityRank,
      score: draft.priorityScore,
      components: predicateComponents(draft.predicateScores),
      reason: draft.priorityReason,
    },
    validityAnchors: [
      {
        anchorId: `${draft.id}:scene`,
        anchorKind: 'scene-hash',
        hash: draft.sceneHash,
        notes: 'Scene object placement, target, bounds, and semantic contract hash.',
      },
      {
        anchorId: `${draft.id}:actions`,
        anchorKind: 'action-trace-hash',
        hash: actionTraceHash,
        command: replayCommand,
        notes: 'Seeded action trace hash used for deterministic replay.',
      },
      {
        anchorId: `${draft.id}:observations`,
        anchorKind: 'observation-trace-hash',
        hash: observationTraceHash,
        command: replayCommand,
        notes: 'Re-simulated observation and event log hash.',
      },
      {
        anchorId: `${draft.id}:predicates`,
        anchorKind: 'predicate-hash',
        hash: expectedPredicateHash,
        command: replayCommand,
        notes: 'Violation, novelty, learnability, regression, and invalidity score hash.',
      },
      {
        anchorId: `${draft.id}:cael`,
        anchorKind: 'cael-receipt-hash',
        hash: caelReceiptHash,
        command: replayCommand,
        notes: 'CAEL-style receipt hash binding scene, replay, predicate scores, and status.',
      },
    ],
    replay: {
      trajectoryId: draft.id,
      sceneHash: draft.sceneHash,
      seed: draft.seed,
      replayCommand,
      actionTraceHash,
      observationTraceHash,
      expectedPredicateHash,
      caelReceiptHash,
    },
    status: draft.status,
    statusReason: draft.statusReason,
  };
}

function buildActionTrace(
  seed: string,
  trajectoryIndex: number,
  profile: MutatorProfile,
): AdversarialAction[] {
  const steps = 11 + (trajectoryIndex % 4);
  const actions: AdversarialAction[] = [];
  const laneOffset = profile.laneBiasZ + jitter(seed, 'lane', -0.12, 0.12);

  for (let step = 0; step < steps; step += 1) {
    const phase = step % 4;
    if (phase === 1) {
      actions.push({
        step,
        kind: 'rotateCamera',
        intent: profile.intent,
        yawDelta: roundNumber(profile.cameraBias + jitter(seed, `yaw:${step}`, -14, 14)),
        mutatedParameter: `${profile.name}.cameraYaw`,
      });
      continue;
    }

    if (phase === 3) {
      actions.push({
        step,
        kind: 'interact',
        intent: 'emit a semantic contact marker without changing pose',
        mutatedParameter: `${profile.name}.contactDisambiguation`,
      });
      continue;
    }

    const burst =
      profile.burstEvery > 0 && step > 0 && step % profile.burstEvery === 0
        ? profile.burstScale
        : 1;
    const delta = vector(
      roundNumber((profile.baseStepX + jitter(seed, `x:${step}`, -0.08, 0.1)) * burst),
      0,
      roundNumber(laneOffset + jitter(seed, `z:${step}`, -0.18, 0.18)),
    );
    actions.push({
      step,
      kind: 'move',
      intent: profile.intent,
      delta,
      mutatedParameter: `${profile.name}.delta`,
    });
  }

  return actions;
}

function classifyStatus(predicateScores: SemanticPredicateScore[]): {
  status: TrajectoryStatus;
  reason: string;
} {
  const scores = predicateComponents(predicateScores);
  if (scores.invalidity >= predicateThreshold('invalidity')) {
    return {
      status: 'invalid',
      reason: 'Motion envelope or bounds invalidated this trace.',
    };
  }
  if (
    scores.violation >= predicateThreshold('violation') &&
    scores.learnability >= predicateThreshold('learnability')
  ) {
    return {
      status: 'solved',
      reason: 'Valid replayable trace exposes a learnable semantic violation.',
    };
  }
  return {
    status: 'unresolved',
    reason: 'Trace remains valid but below the violation or learnability threshold.',
  };
}

function calculatePriority(predicateScores: SemanticPredicateScore[]): {
  score: number;
  reason: string;
} {
  const scores = predicateComponents(predicateScores);
  const score = roundScore(
    scores.violation * 0.34 +
      scores.novelty * 0.2 +
      scores.learnability * 0.2 +
      scores.regression * 0.18 -
      scores.invalidity * 0.4,
  );
  const reason =
    scores.invalidity >= predicateThreshold('invalidity')
      ? 'deprioritized because replay validity is suspect'
      : scores.violation >= predicateThreshold('violation')
        ? 'prioritized because a valid semantic violation reproduced'
        : 'kept for curriculum diversity and future mutator expansion';

  return {
    score: Math.max(0, score),
    reason,
  };
}

function rankTrajectoryDrafts(drafts: TrajectoryDraft[]): Array<TrajectoryDraft & { priorityRank: number }> {
  const ranks = new Map<string, number>();
  [...drafts]
    .sort((left, right) => right.priorityScore - left.priorityScore || left.id.localeCompare(right.id))
    .forEach((draft, index) => ranks.set(draft.id, index + 1));

  return drafts.map((draft) => ({
    ...draft,
    priorityRank: ranks.get(draft.id) ?? drafts.length,
  }));
}

function summarizeTrajectories(
  trajectories: AdversarialTrajectory[],
): AdversarialTrajectorySummary {
  const solved = trajectories.filter((trajectory) => trajectory.status === 'solved').length;
  const unresolved = trajectories.filter((trajectory) => trajectory.status === 'unresolved').length;
  const invalid = trajectories.filter((trajectory) => trajectory.status === 'invalid').length;

  return {
    total: trajectories.length,
    solved,
    unresolved,
    invalid,
    predicateNames: PREDICATE_ORDER,
    topPriorityTrajectoryIds: [...trajectories]
      .sort((left, right) => left.curriculumPriority.rank - right.curriculumPriority.rank)
      .slice(0, 5)
      .map((trajectory) => trajectory.id),
  };
}

function buildPredicate(
  name: PredicateName,
  value: number,
  threshold: number,
  weight: number,
  evidenceInput: {
    contactIds: string[];
    collisions: number;
    protectedHits: number;
    semanticViolations: number;
    outOfBoundsCount: number;
    highSpeedMoves: number;
    minDistance: number;
  },
): SemanticPredicateScore {
  return {
    name,
    value,
    threshold,
    passed: value >= threshold,
    weight,
    evidence: evidenceForPredicate(name, evidenceInput),
  };
}

function evidenceForPredicate(
  name: PredicateName,
  input: {
    contactIds: string[];
    collisions: number;
    protectedHits: number;
    semanticViolations: number;
    outOfBoundsCount: number;
    highSpeedMoves: number;
    minDistance: number;
  },
): string[] {
  if (name === 'violation') {
    return [
      `${input.collisions} collision events`,
      `${input.protectedHits} protected-console contacts`,
      `${input.semanticViolations} semantic violation events`,
    ];
  }
  if (name === 'novelty') {
    return [
      `contact signature: ${input.contactIds.join(',') || 'none'}`,
      `target distance floor: ${roundNumber(input.minDistance)}`,
    ];
  }
  if (name === 'learnability') {
    return [
      'deterministic seed and action trace are replayable',
      `${input.semanticViolations} semantically labeled violation events`,
    ];
  }
  if (name === 'regression') {
    return [
      input.protectedHits > 0
        ? 'protected-console regression lane reproduced'
        : 'no protected-console regression lane',
    ];
  }
  return [
    `${input.outOfBoundsCount} out-of-bounds observations`,
    `${input.highSpeedMoves} high-speed motion spikes`,
  ];
}

function predicateThreshold(name: PredicateName): number {
  if (name === 'violation') return 0.55;
  if (name === 'novelty') return 0.45;
  if (name === 'learnability') return 0.5;
  if (name === 'regression') return 0.5;
  return 0.55;
}

function predicateWeight(name: PredicateName): number {
  if (name === 'violation') return 0.34;
  if (name === 'novelty') return 0.2;
  if (name === 'learnability') return 0.2;
  if (name === 'regression') return 0.18;
  return -0.4;
}

function predicateComponents(predicateScores: SemanticPredicateScore[]): Record<PredicateName, number> {
  const components = {
    violation: 0,
    novelty: 0,
    learnability: 0,
    regression: 0,
    invalidity: 0,
  };
  for (const score of predicateScores) {
    components[score.name] = score.value;
  }
  return components;
}

function buildCaelReceiptHash(input: {
  sceneHash: string;
  trajectoryId: string;
  actionTraceHash: string;
  observationTraceHash: string;
  predicateHash: string;
  status: TrajectoryStatus;
}): string {
  return hashValue({
    protocol: 'CAEL',
    receiptVersion: 1,
    ...input,
  });
}

function detectContacts(scene: DeterministicScene, position: Vector3): string[] {
  const agentRadius = 0.18;
  return scene.objects
    .filter((object) => {
      const xLimit = object.size.x / 2 + agentRadius;
      const zLimit = object.size.z / 2 + agentRadius;
      return (
        Math.abs(position.x - object.position.x) <= xLimit &&
        Math.abs(position.z - object.position.z) <= zLimit
      );
    })
    .map((object) => object.id);
}

function placementEvents(scene: DeterministicScene): SemanticEvent[] {
  return scene.objects.map((object) => ({
    step: 0,
    type: 'placement',
    subject: object.id,
    value: vectorKey(object.position),
    message: `${object.label} placed as ${object.semanticRole}.`,
  }));
}

function isOutOfBounds(scene: DeterministicScene, position: Vector3): boolean {
  return (
    position.x < scene.worldBounds.min.x ||
    position.y < scene.worldBounds.min.y ||
    position.z < scene.worldBounds.min.z ||
    position.x > scene.worldBounds.max.x ||
    position.y > scene.worldBounds.max.y ||
    position.z > scene.worldBounds.max.z
  );
}

function sceneObject(
  id: string,
  label: string,
  semanticRole: SceneObject['semanticRole'],
  position: Vector3,
  size: Vector3,
  contactPolicy: SceneObject['contactPolicy'],
): SceneObject {
  return {
    id,
    label,
    semanticRole,
    position,
    size,
    contactPolicy,
  };
}

function vector(x: number, y: number, z: number): Vector3 {
  return {
    x: roundNumber(x),
    y: roundNumber(y),
    z: roundNumber(z),
  };
}

function addVector(left: Vector3, right: Vector3): Vector3 {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
  };
}

function roundVector(input: Vector3): Vector3 {
  return vector(input.x, input.y, input.z);
}

function vectorMagnitude(input: Vector3): number {
  return Math.sqrt(input.x ** 2 + input.y ** 2 + input.z ** 2);
}

function vectorKey(input: Vector3): string {
  return `${roundNumber(input.x)},${roundNumber(input.y)},${roundNumber(input.z)}`;
}

function distance(left: Vector3, right: Vector3): number {
  return Math.sqrt((left.x - right.x) ** 2 + (left.y - right.y) ** 2 + (left.z - right.z) ** 2);
}

function jitter(seed: string, salt: string, min: number, max: number): number {
  return min + seededUnit(seed, salt) * (max - min);
}

function seededUnit(seed: string, salt: string): number {
  const hex = createHash('sha256').update(`${seed}:${salt}`).digest('hex').slice(0, 12);
  return Number.parseInt(hex, 16) / 0xffffffffffff;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function roundScore(value: number): number {
  return roundNumber(clamp(value), 4);
}

function roundNumber(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function shortHash(value: unknown): string {
  return hashValue(value).replace('sha256:', '').slice(0, 8);
}

function sortForJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (!value || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const child = record[key];
    if (child !== undefined) sorted[key] = sortForJson(child);
  }
  return sorted;
}
