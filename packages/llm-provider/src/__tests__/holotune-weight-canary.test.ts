import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  planWeightDeltaGraph,
  type AdmissionRequirementStatus,
  type ContentDigest,
  type WeightDeltaGraph,
  type WeightGraphReadiness,
} from '../weight-delta-graph';

interface HoloTuneWeightCanaryFixture {
  evidence: {
    identity: string;
    version: string;
    baseModel: string;
    completionReceipt: { path: string; digest: ContentDigest };
    codingEvaluationReceipt: { path: string; digest: ContentDigest };
    adapterArtifact: { name: string; digest: ContentDigest };
    candidateArtifact: { format: string; digest: ContentDigest };
    tokenizerArtifact: { name: string; digest: ContentDigest };
    promotionGate: { verdict: 'FAIL'; blockers: string[] };
    normalization: { kind: string; note: string };
  };
  graph: WeightDeltaGraph;
  expected: {
    readiness: WeightGraphReadiness;
    promotionGateVerdict: 'FAIL';
    blockers: string[];
    requirementStatuses: Record<string, AdmissionRequirementStatus>;
    rollbackHead: ContentDigest;
  };
}

const fixture = JSON.parse(
  readFileSync(
    new URL('./fixtures/holotune-brittney-edge-v0-5.holoweight.json', import.meta.url),
    'utf8'
  )
) as unknown as HoloTuneWeightCanaryFixture;

describe('HoloTune HoloWeight canary', () => {
  it('replays the real v0.5 promotion failure without losing the admitted v0.4 rollback head', () => {
    const plan = planWeightDeltaGraph(fixture.graph);
    const requirementStatuses = Object.fromEntries(
      plan.admissionRequirements.map(({ requirementId, status }) => [requirementId, status])
    );

    expect(plan.issues).toEqual([]);
    expect(plan.readiness).toBe(fixture.expected.readiness);
    expect(fixture.evidence.promotionGate.verdict).toBe(fixture.expected.promotionGateVerdict);
    expect(fixture.evidence.promotionGate.blockers).toEqual(fixture.expected.blockers);
    expect(requirementStatuses).toEqual(fixture.expected.requirementStatuses);
    expect(plan.rollbackHead).toBe(fixture.expected.rollbackHead);
    expect(plan.steps).toContainEqual({
      kind: 'admit',
      candidateDigest: fixture.evidence.candidateArtifact.digest,
      ready: false,
    });
    expect(plan.steps).toContainEqual({
      kind: 'select-rollback-head',
      head: fixture.expected.rollbackHead,
    });
  });

  it('keeps every planned weight artifact pinned to the captured HoloTune evidence', () => {
    const [delta] = fixture.graph.deltas;

    expect(fixture.graph.id).toBe(
      `holotune:${fixture.evidence.identity}:${fixture.evidence.version}`
    );
    expect(fixture.graph.base.architecture).toBe(fixture.evidence.baseModel);
    expect(fixture.graph.base.tokenizerDigest).toBe(fixture.evidence.tokenizerArtifact.digest);
    expect(fixture.graph.candidateDigest).toBe(fixture.evidence.candidateArtifact.digest);
    expect(delta?.artifact.digest).toBe(fixture.evidence.adapterArtifact.digest);
    expect(
      fixture.graph.receipts?.find(({ requirementId }) => requirementId === 'branch-utility')
        ?.receiptDigest
    ).toBe(fixture.evidence.codingEvaluationReceipt.digest);
  });
});
