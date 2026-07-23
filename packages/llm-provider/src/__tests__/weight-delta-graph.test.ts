import { describe, expect, it } from 'vitest';
import {
  planWeightDeltaGraph,
  type ContentDigest,
  type EvaluationReceiptRef,
  type EvaluationRequirement,
  type WeightDeltaGraph,
} from '../weight-delta-graph';

const digest = (hex: string): ContentDigest => `sha256:${hex.repeat(64)}`;

const BASE_DIGEST = digest('a');
const TOKENIZER_DIGEST = digest('b');
const CANDIDATE_DIGEST = digest('c');
const DELTA_DIGEST = digest('d');
const RECEIPT_DIGEST = digest('e');
const SUITE_DIGEST = digest('f');
const PREVIOUS_HEAD = digest('1');

const codeRequirement: EvaluationRequirement = {
  id: 'code-heldout',
  subject: 'holo.code_repair',
  metric: 'pass_at_1',
  suiteDigest: SUITE_DIGEST,
  rule: { kind: 'improves_by', value: 0.05 },
  minSeeds: 3,
  evaluatorPolicy: 'provenance_independent',
};

const abstentionRequirement: EvaluationRequirement = {
  id: 'honest-abstention',
  subject: 'holo.honest_abstention',
  metric: 'abstention_rate',
  suiteDigest: digest('2'),
  rule: { kind: 'non_regression', tolerance: 0.01 },
  minSeeds: 3,
  evaluatorPolicy: 'cross_family',
};

function receipt(
  requirementId: string,
  overrides: Partial<EvaluationReceiptRef> = {}
): EvaluationReceiptRef {
  return {
    requirementId,
    candidateDigest: CANDIDATE_DIGEST,
    receiptDigest: RECEIPT_DIGEST,
    evaluatorRef: 'falsifier:deterministic-suite-v1',
    seedCount: 3,
    passed: true,
    ...overrides,
  };
}

function graph(overrides: Partial<WeightDeltaGraph> = {}): WeightDeltaGraph {
  return {
    schema: 'holoweight.graph.v1',
    id: 'brittney-code-v2',
    candidateDigest: CANDIDATE_DIGEST,
    base: {
      artifact: { digest: BASE_DIGEST, format: 'safetensors' },
      architecture: 'qwen2_5_coder',
      tokenizerDigest: TOKENIZER_DIGEST,
    },
    deltas: [
      {
        id: 'code-repair',
        artifact: { digest: DELTA_DIGEST, format: 'peft' },
        compatibility: {
          baseDigest: BASE_DIGEST,
          architecture: 'qwen2_5_coder',
          tokenizerDigest: TOKENIZER_DIGEST,
          targetModules: ['q_proj', 'v_proj'],
          dtype: 'bfloat16',
          rank: 16,
        },
        provides: ['holo.code_repair'],
        mustPreserve: ['holo.honest_abstention'],
        producerRef: 'builder:adapter-train-v1',
      },
    ],
    compositions: [],
    requirements: [codeRequirement, abstentionRequirement],
    ...overrides,
  };
}

describe('planWeightDeltaGraph', () => {
  it('produces the same candidate plan for the same compatible graph', () => {
    const input = graph();
    const first = planWeightDeltaGraph(input);
    const second = planWeightDeltaGraph(input);

    expect(first).toEqual(second);
    expect(first.readiness).toBe('candidate');
    expect(first.steps.map((step) => step.kind)).toEqual([
      'select-base',
      'apply-delta',
      'evaluate',
      'evaluate',
      'admit',
    ]);
    expect(first.semanticLabels).toEqual({
      provides: ['holo.code_repair'],
      mustPreserve: ['holo.honest_abstention'],
    });
  });

  it('rejects a delta pinned to a different base with a stable issue', () => {
    const input = graph();
    input.deltas[0]!.compatibility.baseDigest = digest('3');

    const plan = planWeightDeltaGraph(input);

    expect(plan.readiness).toBe('invalid');
    expect(plan.issues).toContainEqual(
      expect.objectContaining({
        code: 'WEIGHT_BASE_MISMATCH',
        path: 'deltas[0].compatibility.baseDigest',
      })
    );
  });

  it('rejects tokenizer and architecture mismatches independently', () => {
    const input = graph();
    input.deltas[0]!.compatibility.tokenizerDigest = digest('4');
    input.deltas[0]!.compatibility.architecture = 'different_architecture';

    const plan = planWeightDeltaGraph(input);

    expect(plan.readiness).toBe('invalid');
    expect(plan.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['WEIGHT_TOKENIZER_MISMATCH', 'WEIGHT_ARCHITECTURE_MISMATCH'])
    );
  });

  it('rejects missing and forward composition references', () => {
    const input = graph({
      compositions: [
        { id: 'first-merge', inputs: ['later-merge'], method: 'linear' },
        { id: 'later-merge', inputs: ['code-repair'], method: 'linear' },
        { id: 'missing-merge', inputs: ['not-declared'], method: 'ties' },
      ],
    });

    const plan = planWeightDeltaGraph(input);

    expect(plan.readiness).toBe('invalid');
    expect(plan.issues).toContainEqual(
      expect.objectContaining({
        code: 'COMPOSITION_INPUT_FORWARD_REFERENCE',
        path: 'compositions[0].inputs[0]',
      })
    );
    expect(plan.issues).toContainEqual(
      expect.objectContaining({
        code: 'COMPOSITION_INPUT_NOT_FOUND',
        path: 'compositions[2].inputs[0]',
      })
    );
  });

  it('rejects an evaluation subject that no delta declares', () => {
    const input = graph({
      requirements: [{ ...codeRequirement, subject: 'holo.never_declared' }],
    });

    const plan = planWeightDeltaGraph(input);

    expect(plan.readiness).toBe('invalid');
    expect(plan.issues).toContainEqual(
      expect.objectContaining({
        code: 'REQUIREMENT_SUBJECT_NOT_DECLARED',
        path: 'requirements[0].subject',
      })
    );
  });

  it('keeps a physically valid graph without receipts in candidate state', () => {
    const plan = planWeightDeltaGraph(graph());

    expect(plan.readiness).toBe('candidate');
    expect(plan.admissionRequirements).toEqual([
      expect.objectContaining({ requirementId: 'code-heldout', status: 'missing' }),
      expect.objectContaining({ requirementId: 'honest-abstention', status: 'missing' }),
    ]);
  });

  it('keeps a passing but under-seeded receipt in candidate state', () => {
    const input = graph({
      requirements: [codeRequirement],
      receipts: [receipt('code-heldout', { seedCount: 2 })],
    });

    const plan = planWeightDeltaGraph(input);

    expect(plan.readiness).toBe('candidate');
    expect(plan.admissionRequirements).toEqual([
      expect.objectContaining({ requirementId: 'code-heldout', status: 'under_seeded' }),
    ]);
  });

  it('keeps a failed receipt visible and blocks readiness', () => {
    const failedReceipt = receipt('code-heldout', { passed: false });
    const input = graph({
      requirements: [codeRequirement],
      receipts: [failedReceipt],
    });

    const plan = planWeightDeltaGraph(input);

    expect(plan.readiness).toBe('candidate');
    expect(plan.admissionRequirements).toEqual([
      expect.objectContaining({
        requirementId: 'code-heldout',
        status: 'failed',
        receipt: failedReceipt,
      }),
    ]);
  });

  it('becomes ready only when every receipt matches, passes, and has enough seeds', () => {
    const input = graph({
      receipts: [
        receipt('code-heldout'),
        receipt('honest-abstention', { receiptDigest: digest('5') }),
      ],
    });

    const plan = planWeightDeltaGraph(input);

    expect(plan.readiness).toBe('ready');
    expect(plan.admissionRequirements.every((requirement) => requirement.status === 'satisfied')).toBe(
      true
    );
  });

  it('selects an immutable prior head for rollback without inverse arithmetic', () => {
    const plan = planWeightDeltaGraph(graph({ previousAdmittedHead: PREVIOUS_HEAD }));

    expect(plan.rollbackHead).toBe(PREVIOUS_HEAD);
    expect(plan.steps).toContainEqual({
      kind: 'select-rollback-head',
      head: PREVIOUS_HEAD,
    });
    expect(JSON.stringify(plan.steps)).not.toContain('inverse');
    expect(JSON.stringify(plan.steps)).not.toContain('subtract');
  });
});
