import { describe, expect, it } from 'vitest';
import {
  buildHeadlessExperimentReceipt,
  canonicalizeHeadlessValue,
  hashHeadlessValue,
  parseHeadlessExperimentPlan,
  verifyHeadlessExperimentReceipt,
  type HeadlessExperimentReceipt,
  type HeadlessExperimentScheduleEntry,
  type HeadlessJsonValue,
  type ParsedHeadlessExperimentPlan,
} from '../HeadlessExecutionLedger';

const SOURCE_BUNDLE_HASH = hashHeadlessValue({
  world: 'fixture.holo',
  plan: 'fixture.hs',
  behavior: 'fixture.hsplus',
});

function planRecords(): unknown[] {
  return [
    {
      kind: 'manifest',
      schema: 'holoscript.headless-experiment-plan.v1',
      runId: 'two-resident-tracer-001',
      seed: 'zero-provider-seed',
      clock: { startTick: 0, endTick: 2, step: 1 },
      publicStateKeys: ['water'],
      expected: {
        scheduleCount: 4,
        observationCount: 2,
        actionCount: 2,
        finalPublicState: { water: 3 },
      },
      authorization: { required: true, startSequence: 10 },
      observationPolicy: {
        allowedRootKeys: ['resident_id', 'location', 'visible_event_ids', 'bounded_memory_hash'],
        forbiddenKeys: [
          'model_id',
          'adapter',
          'provider',
          'condition',
          'system_prompt',
          'private_memory',
        ],
        forbiddenValues: ['secret-adapter-a'],
      },
    },
    {
      kind: 'observation',
      scheduleEntryId: 'observe-r1',
      order: 0,
      tick: 0,
      phase: 'observe',
      entrypoint: 'observe',
      args: { residentId: 'resident-1' },
      targetIds: ['resident-1'],
      barrierId: 'observation-barrier-0',
    },
    {
      kind: 'observation',
      scheduleEntryId: 'observe-r2',
      order: 1,
      tick: 0,
      phase: 'observe',
      entrypoint: 'observe',
      args: { residentId: 'resident-2' },
      targetIds: ['resident-2'],
      barrierId: 'observation-barrier-0',
    },
    {
      kind: 'action',
      scheduleEntryId: 'contribute-water',
      order: 2,
      tick: 1,
      phase: 'act',
      entrypoint: 'contribute',
      args: { amount: 1 },
      targetIds: ['cistern'],
      authorization: {
        nonce: 'nonce-1',
        sequence: 10,
        turnOpportunityId: 'turn-1',
        safetyReceiptId: 'safety-1',
        decisionReceiptId: 'decision-1',
      },
      expect: { allowed: true, outcome: 'water_added', stateChanged: true },
    },
    {
      kind: 'action',
      scheduleEntryId: 'reject-without-mutation',
      order: 3,
      tick: 2,
      phase: 'act',
      entrypoint: 'reject',
      args: {},
      targetIds: ['external-valve'],
      authorization: {
        nonce: 'nonce-2',
        sequence: 11,
        turnOpportunityId: 'turn-2',
        safetyReceiptId: 'safety-2',
        decisionReceiptId: 'decision-2',
      },
      expect: { allowed: false, outcome: 'blocked_without_world_mutation', stateChanged: false },
    },
  ];
}

function makeInvoker(
  options: {
    observationLeak?: boolean;
    emptyObservation?: boolean;
    hashedObservationLeak?: boolean;
    observationPrivateMutation?: boolean;
    deniedMutation?: boolean;
    deniedPrivateMutation?: boolean;
    deniedEvent?: boolean;
    actionLeak?: boolean;
    eventLeak?: boolean;
    actionDetail?: string;
  } = {}
) {
  let state: Record<string, unknown> = {
    water: 2,
    privateAdapter: 'secret-adapter-a',
  };

  return {
    initialState: { ...state },
    invoke: async (entry: HeadlessExperimentScheduleEntry) => {
      if (entry.kind === 'observation') {
        const residentId = String(entry.args?.residentId);
        const observation: Record<string, HeadlessJsonValue> = {
          resident_id: residentId,
          location: 'commons',
          visible_event_ids: [],
          bounded_memory_hash: hashHeadlessValue([residentId, entry.tick]),
        };
        if (options.observationLeak) {
          observation.private_memory = {
            adapter: 'secret-adapter-a',
          };
        }
        if (options.hashedObservationLeak) {
          observation.bounded_memory_hash = hashHeadlessValue('secret-adapter-a');
        }
        if (options.observationPrivateMutation) {
          state = { ...state, privateAdapter: 'mutated-during-observation' };
        }
        return {
          value: options.emptyObservation ? {} : observation,
          state: { ...state },
        };
      }

      if (entry.entrypoint === 'contribute') {
        state = {
          ...state,
          water: Number(state.water) + Number(entry.args?.amount),
        };
        return {
          value: {
            allowed: true,
            outcome: 'water_added',
            ...(options.actionDetail ? { detail: options.actionDetail } : {}),
            ...(options.actionLeak ? { adapter: 'secret-adapter-a' } : {}),
          },
          state: { ...state },
          emittedEvents: [
            {
              type: 'water_added',
              amount: entry.args?.amount ?? null,
              ...(options.eventLeak ? { adapter: 'secret-adapter-a' } : {}),
            },
          ],
        };
      }

      if (options.deniedMutation) {
        state = { ...state, water: Number(state.water) + 100 };
      }
      if (options.deniedPrivateMutation) {
        state = { ...state, privateAdapter: 'mutated-by-denied-action' };
      }
      return {
        value: {
          allowed: false,
          outcome: 'blocked_without_world_mutation',
        },
        state: { ...state },
        ...(options.deniedEvent ? { emittedEvents: [{ type: 'denied_action_side_effect' }] } : {}),
      };
    },
  };
}

async function buildReceipt(
  plan: ParsedHeadlessExperimentPlan = parseHeadlessExperimentPlan(planRecords()),
  invokerOptions: Parameters<typeof makeInvoker>[0] = {}
): Promise<HeadlessExperimentReceipt> {
  const executor = makeInvoker(invokerOptions);
  return buildHeadlessExperimentReceipt({
    sourceBundleHash: SOURCE_BUNDLE_HASH,
    scene: {
      schema: 'holoscript-headless-scene-receipt-v1',
      objectCount: 1,
      objects: [{ id: 'commons', type: 'object' }],
    },
    posePhysics: {
      schema: 'holoscript-headless-pose-physics-receipt-v1',
      objects: [{ id: 'commons', position: [0, 0, 0] }],
    },
    plan,
    initialState: executor.initialState,
    invoke: executor.invoke,
  });
}

function mutableReceipt(receipt: HeadlessExperimentReceipt): HeadlessExperimentReceipt {
  return JSON.parse(JSON.stringify(receipt)) as HeadlessExperimentReceipt;
}

describe('HeadlessExecutionLedger', () => {
  it('emits byte-identical receipts and verifies all seven canonical fields', async () => {
    const plan = parseHeadlessExperimentPlan(planRecords());
    const first = await buildReceipt(plan);
    const second = await buildReceipt(plan);

    expect(canonicalizeHeadlessValue(first)).toBe(canonicalizeHeadlessValue(second));
    expect(Object.keys(first.canonicalFields)).toEqual([
      'canonicalSceneHash',
      'canonicalPoseHash',
      'logicalClockHash',
      'publicStateHash',
      'executedScheduleHash',
      'residentObservationHash',
      'actionReceiptRoot',
    ]);
    expect(Object.values(first.canonicalFields)).toSatisfy((values: unknown[]) =>
      values.every((value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
    );
    expect(first.logicalClock.executed_ticks).toEqual([0, 1, 2]);
    expect(first.publicStateSnapshots.at(-1)?.payload.publicState).toEqual({ water: 3 });
    expect(first.actionLedger[1].payload.allowed).toBe(false);
    expect(first.actionLedger[1].payload.stateChanged).toBe(false);

    expect(
      verifyHeadlessExperimentReceipt(first, {
        expectedSourceBundleHash: SOURCE_BUNDLE_HASH,
        expectedSchedule: plan.schedule,
        expectedTerminalCommitment: first.terminal.terminalCommitment,
      })
    ).toEqual({ valid: true, errors: [] });
  });

  it('rejects payload tampering, valid-prefix rollback, and rollback-reference changes', async () => {
    const receipt = await buildReceipt();

    const tamperedObservation = mutableReceipt(receipt);
    (
      tamperedObservation.observationLedger[0].payload.observation as Record<string, unknown>
    ).location = 'private-lab';
    expect(verifyHeadlessExperimentReceipt(tamperedObservation)).toMatchObject({
      valid: false,
    });
    expect(verifyHeadlessExperimentReceipt(tamperedObservation).errors[0]).toContain(
      'entry hash mismatch'
    );

    const truncated = mutableReceipt(receipt);
    truncated.actionLedger.pop();
    expect(verifyHeadlessExperimentReceipt(truncated).errors[0]).toContain('ledger count mismatch');

    const badRollback = mutableReceipt(receipt);
    badRollback.actionLedger[1].payload.rollbackReference.preStateSnapshotId = 'state-0';
    expect(verifyHeadlessExperimentReceipt(badRollback).errors[0]).toContain('entry hash mismatch');

    const sequenceGap = mutableReceipt(receipt);
    sequenceGap.scheduleLedger[1].sequence = 9;
    expect(verifyHeadlessExperimentReceipt(sequenceGap).errors[0]).toContain('ledger sequence gap');

    const downgrade = mutableReceipt(receipt);
    downgrade.hashAlgorithm = 'sha1' as typeof downgrade.hashAlgorithm;
    expect(verifyHeadlessExperimentReceipt(downgrade).errors[0]).toContain(
      'hash algorithm mismatch'
    );
  });

  it('uses external schedule and terminal anchors against fully resealed alternatives', async () => {
    const originalPlan = parseHeadlessExperimentPlan(planRecords());
    const original = await buildReceipt(originalPlan);

    const reorderedRecords = planRecords();
    const firstObservation = reorderedRecords[1] as Record<string, unknown>;
    const secondObservation = reorderedRecords[2] as Record<string, unknown>;
    reorderedRecords[1] = { ...secondObservation, order: 0 };
    reorderedRecords[2] = { ...firstObservation, order: 1 };
    const reorderedPlan = parseHeadlessExperimentPlan(reorderedRecords);
    const resealedReorder = await buildReceipt(reorderedPlan);
    const reorderVerification = verifyHeadlessExperimentReceipt(resealedReorder, {
      expectedSourceBundleHash: SOURCE_BUNDLE_HASH,
      expectedSchedule: originalPlan.schedule,
    });
    expect(reorderVerification.valid).toBe(false);
    expect(reorderVerification.errors[0]).toContain('external source anchor');

    const alternateOutcome = await buildReceipt(originalPlan, {
      actionDetail: 'resealed-but-different',
    });
    const terminalVerification = verifyHeadlessExperimentReceipt(alternateOutcome, {
      expectedTerminalCommitment: original.terminal.terminalCommitment,
    });
    expect(terminalVerification.valid).toBe(false);
    expect(terminalVerification.errors[0]).toContain('external anchor');
  });

  it('fails closed on identity leaks, duplicate authorization, and denied mutation', async () => {
    await expect(buildReceipt(undefined, { observationLeak: true })).rejects.toThrow(
      /root keys|not allowed|forbidden key/i
    );
    await expect(buildReceipt(undefined, { emptyObservation: true })).rejects.toThrow(/root keys/i);
    await expect(buildReceipt(undefined, { hashedObservationLeak: true })).rejects.toThrow(
      /forbidden value or digest/i
    );
    await expect(buildReceipt(undefined, { observationPrivateMutation: true })).rejects.toThrow(
      /observation mutated executor state/i
    );
    await expect(buildReceipt(undefined, { actionLeak: true })).rejects.toThrow(/forbidden key/i);
    await expect(buildReceipt(undefined, { eventLeak: true })).rejects.toThrow(/forbidden key/i);
    await expect(buildReceipt(undefined, { deniedMutation: true })).rejects.toThrow(
      /denied action mutated public state/i
    );
    await expect(buildReceipt(undefined, { deniedPrivateMutation: true })).rejects.toThrow(
      /denied action mutated executor state/i
    );
    await expect(buildReceipt(undefined, { deniedEvent: true })).rejects.toThrow(
      /denied action emitted host-visible events/i
    );

    const duplicateAuthorization = planRecords();
    const secondAction = duplicateAuthorization[4] as {
      authorization: Record<string, unknown>;
    };
    secondAction.authorization.nonce = 'nonce-1';
    expect(() => parseHeadlessExperimentPlan(duplicateAuthorization)).toThrow(
      /duplicate authorization nonce/i
    );
  });

  it('rejects permissive JSON edge cases before hashing', () => {
    expect(() => canonicalizeHeadlessValue({ missing: undefined })).toThrow(/undefined/);
    expect(() => canonicalizeHeadlessValue({ nonFinite: Number.POSITIVE_INFINITY })).toThrow(
      /non-finite/
    );
    expect(() => canonicalizeHeadlessValue({ negativeZero: -0 })).toThrow(/negative zero/);
    expect(() => canonicalizeHeadlessValue({ date: new Date(0) })).toThrow(/non-plain object/);

    const sparse = new Array(1);
    expect(() => canonicalizeHeadlessValue(sparse)).toThrow(/sparse array hole/i);

    const customArray: unknown[] & { extra?: string } = [];
    customArray.extra = 'omitted-by-json';
    expect(() => canonicalizeHeadlessValue(customArray)).toThrow(/custom array key/i);

    const symbolObject: Record<string, unknown> & { [key: symbol]: unknown } = {};
    symbolObject[Symbol('omitted-by-json')] = 'secret';
    expect(() => canonicalizeHeadlessValue(symbolObject)).toThrow(/symbol key/i);

    const hiddenObject = { visible: true };
    Object.defineProperty(hiddenObject, 'hidden', {
      enumerable: false,
      value: 'omitted-by-json',
    });
    expect(() => canonicalizeHeadlessValue(hiddenObject)).toThrow(/enumerable data property/i);

    const unreachableClock = planRecords();
    const manifest = unreachableClock[0] as {
      clock: { startTick: number; endTick: number; step: number };
    };
    manifest.clock = { startTick: 0, endTick: 3, step: 2 };
    expect(() => parseHeadlessExperimentPlan(unreachableClock)).toThrow(
      /reachable by exact step increments/i
    );
  });

  it('supports external live replay admission without changing deterministic receipts', async () => {
    const original = await buildReceipt();
    const alternate = await buildReceipt(undefined, {
      actionDetail: 'different-terminal-same-authorizations',
    });

    const duplicateRegistry = {
      terminalCommitments: new Set<string>(),
      authorizationIds: new Set<string>(),
    };
    expect(
      verifyHeadlessExperimentReceipt(original, { replayRegistry: duplicateRegistry })
    ).toEqual({ valid: true, errors: [] });
    expect(
      verifyHeadlessExperimentReceipt(original, { replayRegistry: duplicateRegistry }).errors[0]
    ).toContain('duplicate full receipt replay');

    const authorizationRegistry = {
      terminalCommitments: new Set<string>(),
      authorizationIds: new Set<string>(),
    };
    expect(
      verifyHeadlessExperimentReceipt(original, { replayRegistry: authorizationRegistry })
    ).toEqual({ valid: true, errors: [] });
    expect(
      verifyHeadlessExperimentReceipt(alternate, {
        replayRegistry: authorizationRegistry,
      }).errors[0]
    ).toContain('cross-run authorization replay');
  });
});
