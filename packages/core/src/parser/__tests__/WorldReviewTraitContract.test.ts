import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { HoloCompositionParser } from '../HoloCompositionParser';

const CONTRACT_PATH = fileURLToPath(
  new URL('../../../../../examples/integration/world-review-trait-contract.holo', import.meta.url),
);

type HoloTraitNode = {
  name?: string;
  config?: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  expect(value).toBeTruthy();
  expect(typeof value).toBe('object');
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  expect(Array.isArray(value)).toBe(true);
  return value as Array<Record<string, unknown>>;
}

function asStringArray(value: unknown): string[] {
  expect(Array.isArray(value)).toBe(true);
  return value as string[];
}

function loadContract(): Record<string, unknown> {
  const source = readFileSync(CONTRACT_PATH, 'utf8');
  const parser = new HoloCompositionParser();
  const result = parser.parse(source);

  expect(result.success).toBe(true);

  const traits = (result.ast?.traits || []) as HoloTraitNode[];
  const contract = traits.find((trait) => trait.name === 'world_review_trait');
  expect(contract).toBeDefined();
  return asRecord(contract?.config);
}

describe('WorldReviewTrait contract', () => {
  it('parses the post-compile review contract as a native HoloScript declaration', () => {
    const contract = loadContract();

    expect(contract.id).toBe('holoscript-world-review-trait-v0');
    expect(contract.source_gap).toBe('CG-093');
    expect(contract.board_task).toBe('task_1782775100484_owsp');
    expect(contract.phase).toBe('phase_1_contract');
    expect(contract.native_bar).toBe('post_compile_review_and_fix_plan');
  });

  it('hooks review after compile and HoloCI receipt-producing entrypoints', () => {
    const contract = loadContract();
    const entrypoints = asRecordArray(contract.post_compile_entrypoints);

    expect(entrypoints.map((entrypoint) => entrypoint.holoscript_tool)).toEqual([
      'compile_holoscript',
      'holo_ci_dispatch',
    ]);
    expect(entrypoints.map((entrypoint) => entrypoint.receipt_policy)).toEqual([
      'compile_receipt_required',
      'holo_ci_receipt_required',
    ]);
  });

  it('orders the review pipeline through gates, critic, conformance, and fix planning', () => {
    const contract = loadContract();
    const reviewPipeline = asRecordArray(contract.review_pipeline);

    expect(reviewPipeline.map((step) => step.step)).toEqual([
      'compile_receipt_intake',
      'quality_gate_pipeline',
      'critic_review',
      'conformance_review',
      'fix_plan',
      'scaffold_draft',
    ]);

    const toolNames = reviewPipeline
      .map((step) => step.holoscript_tool || step.source_tool || step.local_module)
      .filter(Boolean);

    expect(toolNames).toEqual([
      'compile_holoscript',
      'QualityGatePipeline.createDefault',
      'holo_critic',
      'conformance_check_artifact',
      'holo_generate_refactor_plan',
      'holo_scaffold_code',
    ]);
  });

  it('sets thresholds that block bad reviews before fix generation is trusted', () => {
    const contract = loadContract();
    const thresholds = asRecord(contract.thresholds);

    expect(thresholds.min_critic_verdict).toBe('ADEQUATE');
    expect(thresholds.max_critical_findings).toBe(0);
    expect(thresholds.max_high_findings).toBe(0);
    expect(thresholds.require_quality_gate_pass).toBe(true);
    expect(thresholds.require_conformance_pass).toBe(true);
    expect(thresholds.require_cael_trace).toBe(true);
  });

  it('preserves the receipt fields needed for CAEL, critic, conformance, and human review', () => {
    const contract = loadContract();
    const fields = asStringArray(contract.evidence_receipt_fields);

    expect(fields).toEqual(expect.arrayContaining([
      'compile_job_id',
      'compile_target',
      'cael_trace_id',
      'trace_jsonl_sha256',
      'verify_url',
      'quality_gate_tier',
      'critic_verdict',
      'conformance_report_id',
      'fix_plan_id',
      'human_review_url',
    ]));
  });

  it('keeps phase 1 in review-plan mode rather than automatic production mutation', () => {
    const contract = loadContract();
    const mutationBoundary = asRecord(contract.mutation_boundary);
    const nonGoals = asStringArray(contract.non_goals);

    expect(mutationBoundary.default_mode).toBe('review_report_only');
    expect(mutationBoundary.fix_generation_mode).toBe('patch_plan_or_draft_only');
    expect(mutationBoundary.branch_creation).toBe('request_only');
    expect(mutationBoundary.production_write).toBe('forbidden');
    expect(mutationBoundary.required_approval).toBe('human_review');

    expect(nonGoals).toEqual(expect.arrayContaining([
      'paid_provider_cloud',
      'local_accelerator_proof',
      'automatic_production_write',
      'automatic_branch_mutation',
      'github_lock_in',
      'hosted_provider_agent_deployment',
      'production_readiness_claim',
    ]));
  });
});
