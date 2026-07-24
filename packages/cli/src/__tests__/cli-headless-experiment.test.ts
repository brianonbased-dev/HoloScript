import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../args';

const execFileAsync = promisify(execFile);
const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, '../..');
const repoRoot = path.resolve(packageRoot, '../..');
const cliSource = path.join(packageRoot, 'src/cli.ts');
const tsxCli = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');

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

function holoLiteral(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return `[${value.map(holoLiteral).join(', ')}]`;
  if (value && typeof value === 'object') {
    return `{ ${Object.entries(value)
      .map(([key, child]) => `${key}: ${holoLiteral(child)}`)
      .join(', ')} }`;
  }
  throw new Error(`Unsupported HoloScript fixture literal: ${typeof value}`);
}

function planSource(name = 'TwoResidentPlan'): string {
  return `pipeline ${JSON.stringify(name)} {
    source OrderedSchedule {
      type: "list"
      items: ${holoLiteral(planRecords())}
    }

    sink CapturedPlan {
      type: "stdout"
    }
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

  it('executes .hs schedule data and .hsplus actions with isolated observer equivalence', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-headless-experiment-'));
    try {
      const worldPath = path.join(tempDir, 'village.holo');
      const planPath = path.join(tempDir, 'schedule.hs');
      const behaviorPath = path.join(tempDir, 'behavior.hsplus');
      writeFileSync(
        worldPath,
        `composition "Village" {
          object "Commons" @grabbable @mqtt_source {
            position: [0, 0, 0]
            geometry: "box"
          }
        }`
      );
      writeFileSync(planPath, planSource());
      writeFileSync(behaviorPath, behaviorSource());

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
      expect(onReceipt.profile).toBe('deterministic-projection');
      expect(onReceipt.requestedProfile).toBe('headless');
      expect(onReceipt.execution.schema).toBe('holoscript.headless-experiment-run.v1');
      expect(onReceipt.execution.scheduleLedger).toHaveLength(4);
      expect(onReceipt.execution.observationLedger).toHaveLength(2);
      expect(onReceipt.execution.actionLedger).toHaveLength(2);
      expect(onReceipt.execution.publicStateSnapshots.at(-1).payload.publicState).toEqual({
        water: 3,
      });
      expect(onReceipt.executionEngines).toEqual({
        world: 'holoscript-cli-pure-world-projection-v1',
        schedule: 'holoscript-node-pipeline-bridge-v1',
        behavior: 'holoscript-hsplus-vm-action-subset-v1',
      });
      expect(onReceipt.claimBoundary).toMatchObject({
        holoWorldParsedAndProjected: true,
        hsPipelineExecuted: true,
        hsplusActionEntrypointsExecuted: true,
        nativeRustPipelineExecutionClaimed: false,
        nativeEngineHsplusExecutionClaimed: false,
        worldRuntimeLifecycleExecuted: false,
        providerCallsMade: 0,
        liveAuthorizationReplayProtectionClaimed: false,
        externalReplayRegistryAvailable: true,
        vmSecurityBoundaryClaimed: false,
      });
      expect(onReceipt.scene.objects[0].traits).toEqual(['grabbable', 'mqtt_source']);
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
      expect(receipt.scene.objectCount).toBe(1);
      expect(receipt.execution).toBeUndefined();
      expect(receipt.stats).toBeDefined();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects nondeterministic HoloScript+ host capabilities before invocation', async () => {
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
        stderr: expect.stringMatching(/forbidden nondeterministic or host capability/i),
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
        stderr: expect.stringMatching(/custom array key/i),
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects unsafe pipeline metadata and wrong experiment extensions before execution', async () => {
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
        planSource('A*/globalThis.__deterministicPlanMetadataExecuted=1;/*')
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
        stderr: expect.stringMatching(/plan names must use/i),
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
