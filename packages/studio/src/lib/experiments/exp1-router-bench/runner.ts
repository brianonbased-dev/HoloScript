/**
 * EXP-1 runner — executes the 3-arm bench and aggregates per-arm metrics.
 *
 * For each task × arm: render the arm prompt, call the (injected) ArmModel,
 * grade the emitted mutation with the REAL SimContractGate oracle, check
 * provenance coverage, and record the outcome. No GPU, no training — the arms
 * are injected (mock in tests; brittney/provider.ts adapter at run time).
 */

import {
  verifySceneMutation,
  type ContractResolver,
} from '../../brittney/SimContractGate';
import {
  ARMS,
  type Arm,
  type ArmAggregate,
  type ArmModel,
  type BenchReport,
  type BenchTask,
  type ProvenanceChecker,
  type TaskArmOutcome,
} from './types';

export interface BenchArms {
  A: ArmModel;
  B: ArmModel;
  C: ArmModel;
}

/** Arm A reads the NL prompt; B and C read the HoloScript-IR prompt (C's offload lives in its model). */
function renderPrompt(task: BenchTask, arm: Arm): string {
  return arm === 'A' ? task.prompt.A : task.prompt.B;
}

/** Build a single-contract resolver from the task's declared contract (null → always unresolved). */
function resolverFor(task: BenchTask): ContractResolver {
  return (ref: string) =>
    task.contract && ref === task.contract.id ? task.contract : null;
}

export async function runBench(
  tasks: BenchTask[],
  arms: BenchArms,
  provenance: ProvenanceChecker
): Promise<BenchReport> {
  const outcomes: TaskArmOutcome[] = [];

  for (const task of tasks) {
    const resolver = resolverFor(task);
    for (const arm of ARMS) {
      const model = arms[arm];
      const prompt = renderPrompt(task, arm);
      const result = await model(prompt, { task, arm });

      const oracle = result.mutation
        ? verifySceneMutation(task.sceneContext, result.mutation, resolver)
        : { passed: false, contractId: 'no-mutation', mutation: { tool: '', input: {} }, reason: 'model emitted no mutation' };

      // Anti-gaming: a contract-passing no-op does not count unless it accomplishes the task.
      const accomplished = result.mutation
        ? task.acceptableTools.includes(result.mutation.tool)
        : false;

      const prov = await provenance(result, task);
      const provenanceCoverage = prov.totalClaims === 0 ? 1 : prov.tracedClaims / prov.totalClaims;

      outcomes.push({
        taskId: task.id,
        arm,
        passed: oracle.passed && accomplished,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        provenanceCoverage,
        oracleContractId: oracle.contractId,
        note: !accomplished
          ? 'mutation did not accomplish the instruction (or none emitted)'
          : oracle.reason,
      });
    }
  }

  return { taskCount: tasks.length, arms: aggregate(outcomes), outcomes };
}

function aggregate(outcomes: TaskArmOutcome[]): Record<Arm, ArmAggregate> {
  const byArm = {} as Record<Arm, ArmAggregate>;
  for (const arm of ARMS) {
    const rows = outcomes.filter((o) => o.arm === arm);
    const n = rows.length;
    const mean = (sel: (o: TaskArmOutcome) => number) =>
      n === 0 ? 0 : rows.reduce((s, o) => s + sel(o), 0) / n;
    byArm[arm] = {
      arm,
      n,
      passRate: n === 0 ? 0 : rows.filter((o) => o.passed).length / n,
      meanInputTokens: mean((o) => o.inputTokens),
      meanOutputTokens: mean((o) => o.outputTokens),
      provenanceCoverage: mean((o) => o.provenanceCoverage),
    };
  }
  return byArm;
}
