import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  buildHeadlessExperimentReceipt,
  canonicalizeHeadlessValue,
  createDeterministicHsplusActionRuntime,
  hashHeadlessValue,
  parseHeadlessExperimentPlan,
  type HeadlessExperimentReceipt,
} from '@holoscript/engine/runtime';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../args';
import {
  DETERMINISTIC_HOLO_WORLD_PROJECTION,
  HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA,
  HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA_V3,
  HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY,
  HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY_V3,
  HOLO_WORLD_PROJECTION_COVERAGE,
  HOLO_WORLD_PROJECTION_PROVENANCE_SCHEMA,
  PURE_HOLO_WORLD_PROJECTION,
  verifyHeadlessExperimentSourceRunReceipt,
  type AnyHeadlessExperimentSourceRunReceipt,
  type HeadlessExperimentSourceRunReceipt,
  type HeadlessExperimentSourceRunReceiptV3,
} from '../headless-experiment';
import { executeHsPlanKernel } from '../native-hs-plan-runner';

const execFileAsync = promisify(execFile);
const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, '../..');
const repoRoot = path.resolve(packageRoot, '../..');
const cliSource = path.join(packageRoot, 'src/cli.ts');
const tsxCli = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');
const modelVillageFixtureRoot = path.join(testDir, 'fixtures/model-village');
const modelVillageWorldPath = path.join(modelVillageFixtureRoot, 'village.holo');
const modelVillagePlanPath = path.join(modelVillageFixtureRoot, 'schedule.hs');
const modelVillageBehaviorPath = path.join(modelVillageFixtureRoot, 'behavior.hsplus');

async function runCli(args: string[]) {
  return execFileAsync(process.execPath, [tsxCli, cliSource, ...args], {
    cwd: repoRoot,
    env: process.env,
    maxBuffer: 1024 * 1024 * 16,
    timeout: 90_000,
    windowsHide: true,
  });
}

function planRecords(): unknown[] {
  return [
    {
      kind: 'manifest',
      schema: 'holoscript.headless-experiment-plan.v1',
      runId: 'cli-two-resident-tracer',
      seed: 'zero-provider-cli-seed',
      clock: { startTick: 0, endTick: 2, step: 1 },
      publicStateKeys: ['water'],
      expected: {
        scheduleCount: 4,
        observationCount: 2,
        actionCount: 2,
        finalPublicState: { water: 3 },
      },
      authorization: { required: true, startSequence: 1 },
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
      scheduleEntryId: 'observe-resident-1',
      order: 0,
      tick: 0,
      phase: 'observe',
      entrypoint: 'observe',
      args: { residentId: 'resident-1' },
      targetIds: ['resident-1'],
      barrierId: 'observe-0',
    },
    {
      kind: 'observation',
      scheduleEntryId: 'observe-resident-2',
      order: 1,
      tick: 0,
      phase: 'observe',
      entrypoint: 'observe',
      args: { residentId: 'resident-2' },
      targetIds: ['resident-2'],
      barrierId: 'observe-0',
    },
    {
      kind: 'action',
      scheduleEntryId: 'add-water',
      order: 2,
      tick: 1,
      phase: 'act',
      entrypoint: 'contribute',
      args: { amount: 1 },
      targetIds: ['cistern'],
      authorization: {
        nonce: 'cli-nonce-1',
        sequence: 1,
        turnOpportunityId: 'cli-turn-1',
        safetyReceiptId: 'cli-safety-1',
        decisionReceiptId: 'cli-decision-1',
      },
      expect: { allowed: true, outcome: 'water_added', stateChanged: true },
    },
    {
      kind: 'action',
      scheduleEntryId: 'deny-external',
      order: 3,
      tick: 2,
      phase: 'act',
      entrypoint: 'reject',
      args: {},
      targetIds: ['external-valve'],
      authorization: {
        nonce: 'cli-nonce-2',
        sequence: 2,
        turnOpportunityId: 'cli-turn-2',
        safetyReceiptId: 'cli-safety-2',
        decisionReceiptId: 'cli-decision-2',
      },
      expect: {
        allowed: false,
        outcome: 'blocked_without_world_mutation',
        stateChanged: false,
      },
    },
  ];
}

function planSource(): string {
  const canonicalPlan = canonicalizeHeadlessValue(planRecords());
  return `export function main(): string {
    return ${JSON.stringify(canonicalPlan)}
  }`;
}

function behaviorSource(extraAction = ''): string {
  return `composition "Two Resident Behavior" {
    state {
      water: 2
      privateAdapter: "secret-adapter-a"
    }

    logic {
      action observe(residentId) {
        return {
          resident_id: residentId,
          location: "commons",
          visible_event_ids: [],
          bounded_memory_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        }
      }

      action contribute(amount) {
        state.water = state.water + amount
        emit("water_added", { amount: amount })
        return { allowed: true, outcome: "water_added" }
      }

      action reject() {
        return { allowed: false, outcome: "blocked_without_world_mutation" }
      }

      ${extraAction}
    }
  }`;
}

function clone<T>(value: T): T {
  return JSON.parse(canonicalizeHeadlessValue(value)) as T;
}

function resealSourceRun<T extends AnyHeadlessExperimentSourceRunReceipt>(
  source: T,
  mutate: (receipt: T) => void
): T {
  const receipt = clone(source);
  mutate(receipt);
  const { sourceRunCommitment: _sourceRunCommitment, ...preimage } = receipt;
  return {
    ...receipt,
    sourceRunCommitment: hashHeadlessValue(preimage),
  } as T;
}

describe('CLI deterministic cross-format headless execution', () => {
  it('rejects invalid or missing observer modes instead of downgrading the command', () => {
    expect(() => parseArgs(['headless', 'world.holo', '--observer', 'yes'])).toThrow(
      /expects exactly/
    );
    expect(() => parseArgs(['headless', 'world.holo', '--observer'])).toThrow(/expects exactly/);
    expect(() => parseArgs(['headless', 'world.holo', '--plan'])).toThrow(/requires a .hs path/);
    expect(() => parseArgs(['headless', 'world.holo', '--behavior', '--json'])).toThrow(
      /requires a .hsplus path/
    );
  });

  it('executes a Rust/WASM-to-UAAL .hs plan and .hsplus actions with observer equivalence', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-headless-experiment-'));
    try {
      const worldPath = path.join(tempDir, 'village.holo');
      const planPath = path.join(tempDir, 'schedule.hs');
      const behaviorPath = path.join(tempDir, 'behavior.hsplus');
      const worldSource = readFileSync(modelVillageWorldPath, 'utf8');
      const authoredPlan = readFileSync(modelVillagePlanPath, 'utf8');
      const authoredBehavior = readFileSync(modelVillageBehaviorPath, 'utf8');
      writeFileSync(worldPath, worldSource);
      writeFileSync(planPath, authoredPlan);
      writeFileSync(behaviorPath, authoredBehavior);

      const on = await runCli([
        'headless',
        worldPath,
        '--plan',
        planPath,
        '--behavior',
        behaviorPath,
        '--observer',
        'on',
        '--json',
      ]);
      const onReceipt = JSON.parse(on.stdout);
      expect(onReceipt.schema).toBe('holoscript-headless-run-receipt-v1');
      expect(Object.keys(onReceipt).sort()).toEqual(
        [
          'schema',
          'input',
          'profile',
          'requestedProfile',
          'tickRate',
          'requestedDurationMs',
          'scene',
          'posePhysics',
          'execution',
          'sourceRunReceipt',
          'executionEngines',
          'claimBoundary',
          'observerProof',
        ].sort()
      );
      expect(onReceipt.profile).toBe('deterministic-projection');
      expect(onReceipt.requestedProfile).toBe('headless');
      expect(onReceipt.execution.schema).toBe('holoscript.headless-experiment-run.v1');
      expect(onReceipt.execution.scheduleLedger).toHaveLength(4);
      expect(onReceipt.execution.observationLedger).toHaveLength(2);
      expect(onReceipt.execution.actionLedger).toHaveLength(2);
      expect(onReceipt.execution.publicStateSnapshots.at(-1).payload.publicState).toEqual({
        water: 3,
      });
      expect(onReceipt.sourceRunReceipt).toMatchObject({
        schema: HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA_V3,
        hashAlgorithm: 'sha256-strict-canonical-json-v1',
        sourceBundleHash: onReceipt.execution.sourceBundleHash,
        verificationBoundary: HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY_V3,
        innerLedger: {
          schema: 'holoscript.headless-experiment-run.v1',
          terminalCommitment: onReceipt.execution.terminal.terminalCommitment,
          canonicalReceiptHash: hashHeadlessValue(onReceipt.execution),
        },
      });
      expect(onReceipt.sourceRunReceipt.sourceRunCommitment).toMatch(/^[a-f0-9]{64}$/);
      expect(onReceipt.executionEngines).toEqual({
        world: DETERMINISTIC_HOLO_WORLD_PROJECTION,
        schedule: 'holoscript-rust-wasm-uaal-plan-kernel-v1',
        behavior: 'holoscript-engine-hsplus-deterministic-action-subset-v1',
      });
      expect(onReceipt.claimBoundary).toMatchObject({
        holoWorldParsedAndProjected: true,
        holoWorldStaticObjectSubsetProjected: true,
        fullHoloWorldProjectionClaimed: false,
        physicsMetadataProjected: true,
        physicsEngineExecuted: false,
        hsPipelineExecuted: false,
        hsPlanEntrypointExecuted: true,
        rustWasmCompilerExecuted: true,
        uaalVmExecuted: true,
        hsPlanReturnParsedAsJson: true,
        fullHsLanguageExecutionClaimed: false,
        hsDynamicJavaScriptEvaluationUsed: false,
        hsplusActionEntrypointsExecuted: true,
        nativeRustPipelineExecutionClaimed: false,
        nativeMachineCodeExecutionClaimed: false,
        executionEngineIdentitySealedInReceipt: true,
        hsCompilerCrateVersionSealedInReceipt: true,
        uaalBytecodeHashSealedInReceipt: true,
        uaalVmExecutionProfileSealedInReceipt: true,
        hsReturnedPlanHashSealedInReceipt: true,
        worldSourceReexecutedDuringVerification: true,
        hsPlanSourceReexecutedDuringVerification: true,
        hsplusBehaviorSourceReexecutedDuringVerification: false,
        compilerArtifactAttested: false,
        sourceRunPublisherAuthenticated: false,
        nativeEngineHsplusExecutionClaimed: false,
        engineOwnedDeterministicHsplusActionSubsetExecuted: true,
        fullHsplusLanguageExecutionClaimed: false,
        hsplusDynamicJavaScriptEvaluationUsed: false,
        worldRuntimeLifecycleExecuted: false,
        providerCallsMade: 0,
        liveAuthorizationReplayProtectionClaimed: false,
        externalReplayRegistryAvailable: true,
        vmSecurityBoundaryClaimed: false,
      });
      expect(onReceipt.sourceRunReceipt.engines).toMatchObject({
        world: {
          schema: HOLO_WORLD_PROJECTION_PROVENANCE_SCHEMA,
          engine: onReceipt.executionEngines.world,
          hashAlgorithm: 'sha256-strict-canonical-json-v1',
          sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          coverage: HOLO_WORLD_PROJECTION_COVERAGE,
          parser: {
            implementation: '@holoscript/core/HoloCompositionParser.parse',
            options: {
              locations: true,
              tolerant: false,
              strict: false,
            },
          },
          result: {
            sceneHash: hashHeadlessValue(onReceipt.execution.scene),
            posePhysicsHash: hashHeadlessValue(onReceipt.execution.posePhysics),
            objectCount: 6,
          },
          provenanceCommitment: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
        schedule: {
          engine: onReceipt.executionEngines.schedule,
          bytecode: {
            hashAlgorithm: 'sha256-uaal-bytecode-canonical-v1',
            sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          },
          vm: {
            profile: {
              limits: {
                maxStackSize: 4,
                maxInstructions: 16,
                maxCallDepth: 2,
              },
              registeredHandlerOpcodes: [],
            },
          },
        },
        behavior: onReceipt.executionEngines.behavior,
      });
      await expect(
        verifyHeadlessExperimentSourceRunReceipt(
          onReceipt.sourceRunReceipt as HeadlessExperimentSourceRunReceiptV3,
          onReceipt.execution as HeadlessExperimentReceipt,
          {
            worldSource,
            planSource: authoredPlan,
            behaviorSource: authoredBehavior,
          }
        )
      ).resolves.toEqual({ valid: true, errors: [] });
      const planKernel = await executeHsPlanKernel(authoredPlan);
      const parsedPlan = parseHeadlessExperimentPlan(planKernel.data);
      const originalBehavior = createDeterministicHsplusActionRuntime(authoredBehavior);
      const forgedWorldExecution = await buildHeadlessExperimentReceipt({
        sourceBundleHash: onReceipt.execution.sourceBundleHash,
        scene: {
          schema: 'holoscript-headless-scene-receipt-v1',
          source: 'forged-world-projection',
          rootId: 'forged',
          objectCount: 0,
          objects: [],
        },
        posePhysics: onReceipt.execution.posePhysics,
        plan: parsedPlan,
        initialState: originalBehavior.initialState,
        invoke: (entry) => originalBehavior.invoke(entry),
      });
      const forgedWorldSourceRun = resealSourceRun(
        onReceipt.sourceRunReceipt as HeadlessExperimentSourceRunReceiptV3,
        (receipt) => {
          receipt.innerLedger.terminalCommitment =
            forgedWorldExecution.terminal.terminalCommitment;
          receipt.innerLedger.canonicalReceiptHash = hashHeadlessValue(forgedWorldExecution);
          receipt.engines.world.result.sceneHash = hashHeadlessValue(forgedWorldExecution.scene);
          receipt.engines.world.result.posePhysicsHash = hashHeadlessValue(
            forgedWorldExecution.posePhysics
          );
          receipt.engines.world.result.objectCount = 0;
          const {
            provenanceCommitment: _provenanceCommitment,
            ...worldProvenancePreimage
          } = receipt.engines.world;
          receipt.engines.world.provenanceCommitment =
            hashHeadlessValue(worldProvenancePreimage);
        }
      );
      await expect(
        verifyHeadlessExperimentSourceRunReceipt(forgedWorldSourceRun, forgedWorldExecution, {
          worldSource,
          planSource: authoredPlan,
          behaviorSource: authoredBehavior,
        })
      ).resolves.toMatchObject({
        valid: false,
        errors: [
          expect.stringMatching(/world provenance failed.*source-backed scene projection differs/i),
        ],
      });

      const forgedBehaviorSource = authoredBehavior.replace(
        'return { allowed: true, outcome: "water_added" }',
        'return { allowed: true, outcome: "water_added", forged_claim: true }'
      );
      // V3 deliberately leaves `.hsplus` at the published hash-anchor
      // boundary. This forged inner behavior remains admissible until a
      // source-backed behavior executor is independently verifiable.
      const forgedBehavior = createDeterministicHsplusActionRuntime(forgedBehaviorSource);
      const forgedBehaviorExecution = await buildHeadlessExperimentReceipt({
        sourceBundleHash: onReceipt.execution.sourceBundleHash,
        scene: onReceipt.execution.scene,
        posePhysics: onReceipt.execution.posePhysics,
        plan: parsedPlan,
        initialState: forgedBehavior.initialState,
        invoke: (entry) => forgedBehavior.invoke(entry),
      });
      const forgedBehaviorSourceRun = resealSourceRun(
        onReceipt.sourceRunReceipt as HeadlessExperimentSourceRunReceiptV3,
        (receipt) => {
          receipt.innerLedger.terminalCommitment =
            forgedBehaviorExecution.terminal.terminalCommitment;
          receipt.innerLedger.canonicalReceiptHash = hashHeadlessValue(forgedBehaviorExecution);
        }
      );
      await expect(
        verifyHeadlessExperimentSourceRunReceipt(
          forgedBehaviorSourceRun,
          forgedBehaviorExecution,
          {
            worldSource,
            planSource: authoredPlan,
            behaviorSource: authoredBehavior,
          }
        )
      ).resolves.toEqual({ valid: true, errors: [] });
      expect(onReceipt.scene.objects).toHaveLength(6);
      expect(onReceipt.scene.objects.map((object: { id: string }) => object.id)).toEqual([
        'commons',
        'cistern',
        'resident-1',
        'resident-2',
        'external-valve',
        'commons-lantern',
      ]);
      expect(onReceipt.posePhysics).toMatchObject({
        coverage: HOLO_WORLD_PROJECTION_COVERAGE,
        complete: false,
        physicsExecutionClaimed: false,
      });
      expect(
        onReceipt.posePhysics.bodies.find((body: { id: string }) => body.id === 'cistern')
      ).toMatchObject({
        transform: { scale: [2.2, 1.8, 2.2] },
        physics: { massKg: 450, kinematic: true },
      });
      expect(onReceipt.observerProof).toMatchObject({
        isolation: 'separate-node-process-serialized-post-seal-v1',
        equivalent: true,
        canonicalPayloadEqual: true,
        sevenFieldsEqual: true,
      });
      expect(onReceipt.observerProof.offCanonicalPayloadHash).toBe(
        onReceipt.observerProof.onCanonicalPayloadHash
      );

      const off = await runCli([
        'headless',
        worldPath,
        '--plan',
        planPath,
        '--behavior',
        behaviorPath,
        '--observer',
        'off',
        '--json',
      ]);
      const offReceipt = JSON.parse(off.stdout);
      expect(offReceipt.observerProof).toBeUndefined();
      expect(offReceipt.execution).toEqual(onReceipt.execution);
      expect(offReceipt.sourceRunReceipt).toEqual(onReceipt.sourceRunReceipt);

      const v3Receipt =
        onReceipt.sourceRunReceipt as unknown as HeadlessExperimentSourceRunReceiptV3;
      const v2Preimage: Omit<HeadlessExperimentSourceRunReceipt, 'sourceRunCommitment'> = {
        schema: HEADLESS_SOURCE_RUN_RECEIPT_SCHEMA,
        hashAlgorithm: v3Receipt.hashAlgorithm,
        sourceBundleHash: v3Receipt.sourceBundleHash,
        verificationBoundary: HEADLESS_SOURCE_RUN_VERIFICATION_BOUNDARY,
        engines: {
          world: PURE_HOLO_WORLD_PROJECTION,
          schedule: v3Receipt.engines.schedule,
          behavior: v3Receipt.engines.behavior,
        },
        innerLedger: v3Receipt.innerLedger,
      };
      const legacyV2Receipt: HeadlessExperimentSourceRunReceipt = {
        ...v2Preimage,
        sourceRunCommitment: hashHeadlessValue(v2Preimage),
      };
      await expect(
        verifyHeadlessExperimentSourceRunReceipt(legacyV2Receipt, onReceipt.execution, {
          worldSource,
          planSource: authoredPlan,
          behaviorSource: authoredBehavior,
        })
      ).resolves.toEqual({ valid: true, errors: [] });

      const forgedInner = clone(onReceipt.execution) as HeadlessExperimentReceipt;
      forgedInner.terminal.terminalCommitment = '0'.repeat(64);
      const forgedSourceRun = resealSourceRun(
        onReceipt.sourceRunReceipt as HeadlessExperimentSourceRunReceiptV3,
        (receipt) => {
          receipt.innerLedger.terminalCommitment = forgedInner.terminal.terminalCommitment;
          receipt.innerLedger.canonicalReceiptHash = hashHeadlessValue(forgedInner);
        }
      );
      await expect(
        verifyHeadlessExperimentSourceRunReceipt(forgedSourceRun, forgedInner, {
          worldSource,
          planSource: authoredPlan,
          behaviorSource: authoredBehavior,
        })
      ).resolves.toMatchObject({
        valid: false,
        errors: [expect.stringMatching(/inner execution receipt failed/i)],
      });

      const shadowInner = clone(onReceipt.execution) as HeadlessExperimentReceipt &
        Record<string, unknown>;
      shadowInner.shadowEvidence = { publisherAuthenticated: true };
      await expect(
        verifyHeadlessExperimentSourceRunReceipt(onReceipt.sourceRunReceipt, shadowInner, {
          worldSource,
          planSource: authoredPlan,
          behaviorSource: authoredBehavior,
        })
      ).resolves.toMatchObject({
        valid: false,
        errors: [expect.stringMatching(/inner execution receipt fields do not match/i)],
      });

      const nestedLedgerShadowCases = [
        ['publicStateSnapshots', /public-state ledger entry.*fields/i],
        ['scheduleLedger', /schedule ledger entry.*fields/i],
        ['observationLedger', /observation ledger entry.*fields/i],
        ['actionLedger', /action ledger entry.*fields/i],
      ] as const;
      for (const [ledgerName, expectedError] of nestedLedgerShadowCases) {
        const shadowLedgerExecution = clone(onReceipt.execution) as HeadlessExperimentReceipt;
        (
          shadowLedgerExecution[ledgerName][0] as unknown as Record<string, unknown>
        ).publisherAuthenticated = true;
        const shadowLedgerSourceRun = resealSourceRun(
          onReceipt.sourceRunReceipt as HeadlessExperimentSourceRunReceiptV3,
          (receipt) => {
            receipt.innerLedger.canonicalReceiptHash =
              hashHeadlessValue(shadowLedgerExecution);
          }
        );
        await expect(
          verifyHeadlessExperimentSourceRunReceipt(
            shadowLedgerSourceRun,
            shadowLedgerExecution,
            {
              worldSource,
              planSource: authoredPlan,
              behaviorSource: authoredBehavior,
            }
          )
        ).resolves.toMatchObject({
          valid: false,
          errors: [expect.stringMatching(expectedError)],
        });
      }

      const shadowClockExecution = clone(onReceipt.execution) as HeadlessExperimentReceipt;
      (
        shadowClockExecution.logicalClock as unknown as Record<string, unknown>
      ).publisherAuthenticated = true;
      shadowClockExecution.canonicalFields.logicalClockHash = hashHeadlessValue(
        shadowClockExecution.logicalClock
      );
      const terminalPreimage = {
        schema: shadowClockExecution.schema,
        hashAlgorithm: shadowClockExecution.hashAlgorithm,
        runId: shadowClockExecution.runId,
        seed: shadowClockExecution.seed,
        sourceBundleHash: shadowClockExecution.sourceBundleHash,
        manifestHash: hashHeadlessValue(shadowClockExecution.manifest),
        finalTick: shadowClockExecution.terminal.finalTick,
        finalPublicStateHash: shadowClockExecution.terminal.finalPublicStateHash,
        expectedCounts: shadowClockExecution.terminal.expectedCounts,
        actualCounts: shadowClockExecution.terminal.actualCounts,
        publicStateHistoryRoot: shadowClockExecution.terminal.publicStateHistoryRoot,
        scheduleRoot: shadowClockExecution.terminal.scheduleRoot,
        observationRoot: shadowClockExecution.terminal.observationRoot,
        actionRoot: shadowClockExecution.terminal.actionRoot,
        canonicalFields: shadowClockExecution.canonicalFields,
      };
      shadowClockExecution.terminal.terminalCommitment = hashHeadlessValue(terminalPreimage);
      const shadowClockSourceRun = resealSourceRun(
        onReceipt.sourceRunReceipt as HeadlessExperimentSourceRunReceiptV3,
        (receipt) => {
          receipt.innerLedger.terminalCommitment =
            shadowClockExecution.terminal.terminalCommitment;
          receipt.innerLedger.canonicalReceiptHash =
            hashHeadlessValue(shadowClockExecution);
        }
      );
      await expect(
        verifyHeadlessExperimentSourceRunReceipt(
          shadowClockSourceRun,
          shadowClockExecution,
          {
            worldSource,
            planSource: authoredPlan,
            behaviorSource: authoredBehavior,
          }
        )
      ).resolves.toMatchObject({
        valid: false,
        errors: [expect.stringMatching(/logical clock fields/i)],
      });

      const downgradedSourceRun = resealSourceRun(
        onReceipt.sourceRunReceipt as HeadlessExperimentSourceRunReceiptV3,
        (receipt) => {
          (receipt as unknown as Record<string, unknown>).schema =
            'holoscript.headless-experiment-source-run.v1';
        }
      );
      await expect(
        verifyHeadlessExperimentSourceRunReceipt(
          downgradedSourceRun,
          onReceipt.execution as HeadlessExperimentReceipt,
          {
            worldSource,
            planSource: authoredPlan,
            behaviorSource: authoredBehavior,
          }
        )
      ).resolves.toMatchObject({
        valid: false,
        errors: [expect.stringMatching(/identity mismatch/i)],
      });

      const shadowSourceRun = resealSourceRun(
        onReceipt.sourceRunReceipt as HeadlessExperimentSourceRunReceiptV3,
        (receipt) => {
          (receipt as unknown as Record<string, unknown>).shadowReceipt = true;
        }
      );
      await expect(
        verifyHeadlessExperimentSourceRunReceipt(
          shadowSourceRun,
          onReceipt.execution as HeadlessExperimentReceipt,
          {
            worldSource,
            planSource: authoredPlan,
            behaviorSource: authoredBehavior,
          }
        )
      ).resolves.toMatchObject({
        valid: false,
        errors: [expect.stringMatching(/fields do not match/i)],
      });

      const falseVerificationBoundary = resealSourceRun(
        onReceipt.sourceRunReceipt as HeadlessExperimentSourceRunReceiptV3,
        (receipt) => {
          (receipt.verificationBoundary as unknown as Record<string, unknown>).world =
            'source-reexecuted-v1';
        }
      );
      await expect(
        verifyHeadlessExperimentSourceRunReceipt(falseVerificationBoundary, onReceipt.execution, {
          worldSource,
          planSource: authoredPlan,
          behaviorSource: authoredBehavior,
        })
      ).resolves.toMatchObject({
        valid: false,
        errors: [expect.stringMatching(/verification boundary mismatch/i)],
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('preserves the legacy headless runtime path when no experiment flags are present', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-headless-legacy-'));
    try {
      const worldPath = path.join(tempDir, 'legacy.holo');
      writeFileSync(
        worldPath,
        `composition "Legacy" {
          object "Cube" {
            position: [0, 0, 0]
            geometry: "box"
          }
        }`
      );

      const legacy = await runCli(['headless', worldPath, '--duration', '1', '--json']);
      const receipt = JSON.parse(legacy.stdout);
      expect(receipt.schema).toBe('holoscript-headless-run-receipt-v1');
      expect(Object.keys(receipt).sort()).toEqual(
        [
          'schema',
          'input',
          'profile',
          'tickRate',
          'requestedDurationMs',
          'stats',
          'scene',
          'posePhysics',
        ].sort()
      );
      expect(receipt.scene.objectCount).toBe(1);
      expect(receipt.execution).toBeUndefined();
      expect(receipt.sourceRunReceipt).toBeUndefined();
      expect(receipt.executionEngines).toBeUndefined();
      expect(receipt.claimBoundary).toBeUndefined();
      expect(receipt.stats).toBeDefined();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects dynamic HoloScript+ host capabilities and unsupported statements before invocation', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-headless-nondeterminism-'));
    try {
      const worldPath = path.join(tempDir, 'village.holo');
      const planPath = path.join(tempDir, 'schedule.hs');
      const behaviorPath = path.join(tempDir, 'behavior.hsplus');
      writeFileSync(worldPath, 'composition "Village" { object "Commons" {} }');
      writeFileSync(planPath, planSource());
      writeFileSync(
        behaviorPath,
        behaviorSource(`action nondeterministic() {
          return { allowed: true, outcome: String(Math.random()) }
        }`)
      );

      await expect(
        runCli(['headless', worldPath, '--plan', planPath, '--behavior', behaviorPath, '--json'])
      ).rejects.toMatchObject({
        stderr: expect.stringMatching(/CallExpression.*not admitted/i),
      });

      writeFileSync(
        behaviorPath,
        behaviorSource().replace(
          'return { allowed: true, outcome: "water_added" }',
          `const decorated = []
          decorated.extra = "omitted-by-json"
          return { allowed: true, outcome: "water_added", detail: decorated }`
        )
      );
      await expect(
        runCli(['headless', worldPath, '--plan', planPath, '--behavior', behaviorPath, '--json'])
      ).rejects.toMatchObject({
        stderr: expect.stringMatching(/VariableDeclaration.*not admitted/i),
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects ambiguous .hs plan entrypoints and wrong experiment extensions before execution', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-headless-plan-gates-'));
    try {
      const worldPath = path.join(tempDir, 'village.holo');
      const wrongPlanPath = path.join(tempDir, 'schedule.txt');
      const unsafePlanPath = path.join(tempDir, 'unsafe.hs');
      const behaviorPath = path.join(tempDir, 'behavior.hsplus');
      writeFileSync(worldPath, 'composition "Village" { object "Commons" {} }');
      writeFileSync(wrongPlanPath, planSource());
      writeFileSync(
        unsafePlanPath,
        `export function helper(): string {
          return "[]"
        }`
      );
      writeFileSync(behaviorPath, behaviorSource());

      await expect(
        runCli([
          'headless',
          worldPath,
          '--plan',
          wrongPlanPath,
          '--behavior',
          behaviorPath,
          '--json',
        ])
      ).rejects.toMatchObject({
        stderr: expect.stringMatching(/--plan must be a \.hs source/i),
      });

      await expect(
        runCli([
          'headless',
          worldPath,
          '--plan',
          unsafePlanPath,
          '--behavior',
          behaviorPath,
          '--json',
        ])
      ).rejects.toMatchObject({
        stderr: expect.stringMatching(/must export main\(\)|main\(\)/i),
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
