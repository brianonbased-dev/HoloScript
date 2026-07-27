import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAgentPrompt,
  candidateId,
  counterbalancedOrders,
  parseAgentResponse,
  scoreRanking,
  summarizeObservations,
  validateStudyManifest,
} from './paper-5-visual-agent-study.mjs';

const protocol = {
  protocolId: 'visual-test',
  design: { candidateCount: 2 },
  admission: { minimumQueries: 1, requireAllCategories: false },
  metrics: { bootstrapResamples: 2000, bootstrapSeed: 7 },
  preregisteredSuccess: {
    visualPrecisionAt5DeltaLower95CIGreaterThan: 0,
    visualMrrDeltaLower95CIGreaterThan: 0,
    visualInvalidResponseRateIncreaseAtMost: 0.02,
  },
};

function candidate(file) {
  return { candidateId: candidateId(file), file, symbols: [] };
}

test('counterbalances identical candidate sets without changing IDs', () => {
  const candidates = [candidate('a.ts'), candidate('b.ts'), candidate('c.ts')];
  const orders = counterbalancedOrders(candidates, 'dependency-01');
  assert.deepEqual(
    orders.text.map((item) => item.candidateId).sort(),
    orders.visual.map((item) => item.candidateId).sort()
  );
  assert.deepEqual(
    orders.text.map((item) => item.candidateId),
    [...orders.visual].reverse().map((item) => item.candidateId)
  );
});

test('parses JSON after a bounded think block and rejects unknown IDs', () => {
  const valid = candidateId('a.ts');
  const parsed = parseAgentResponse(
    `<think>private</think>\n{"rankedCandidateIds":["${valid}","cand_unknown"],"confidence":0.8}`,
    [valid]
  );
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.rankedCandidateIds, [valid]);
  assert.deepEqual(parsed.unknownCandidateIds, ['cand_unknown']);
});

test('uses a fixed Precision@5 denominator and first-hit reciprocal rank', () => {
  const score = scoreRanking(['a', 'b', 'c'], ['b', 'c'], 5);
  assert.equal(score.precisionAt5, 0.4);
  assert.equal(score.reciprocalRank, 0.5);
});

test('keeps gold labels out of agent prompts and rejects arm leakage', () => {
  const a = candidate('a.ts');
  const b = candidate('b.ts');
  const studyCase = {
    id: 'dependency-01',
    category: 'dependency',
    query: 'Which candidate is relevant?',
    scoringKey: { goldCandidateIds: [a.candidateId, b.candidateId] },
    arms: {
      text: { candidates: [a, b] },
      visual: {
        candidates: [b, a],
        visualGraphObservation: {
          nodes: [
            { candidateId: a.candidateId, sceneNodeId: 'a', position: [0, 0, 0] },
            { candidateId: b.candidateId, sceneNodeId: 'b', position: [1, 0, 0] },
          ],
          edges: [],
        },
      },
    },
  };
  const manifest = {
    schemaVersion: 'holoscript.paper5.visual-agent-packets.v1',
    protocolId: protocol.protocolId,
    cases: [studyCase],
  };
  assert.equal(validateStudyManifest(manifest, protocol).status, 'pass');
  const prompt = buildAgentPrompt(studyCase, 'visual', protocol);
  assert.doesNotMatch(prompt, /goldCandidateIds|scoringKey|relevanceLabel/iu);

  const leaking = structuredClone(manifest);
  leaking.cases[0].arms.visual.relevanceLabel = 'hidden';
  assert.equal(validateStudyManifest(leaking, protocol).status, 'fail');
});

test('summarizes paired query-level deltas deterministically', () => {
  const observations = [];
  for (let index = 0; index < 20; index += 1) {
    observations.push({
      caseId: `q-${index}`,
      category: index < 7 ? 'dependency' : index < 14 ? 'impact' : 'reasoning',
      arm: 'text',
      precisionAt5: 0,
      reciprocalRank: 0,
      valid: true,
      unknownCandidateIds: [],
      confidence: 0.5,
      latencyMs: 10,
    });
    observations.push({
      caseId: `q-${index}`,
      category: index < 7 ? 'dependency' : index < 14 ? 'impact' : 'reasoning',
      arm: 'visual',
      precisionAt5: 0.2,
      reciprocalRank: 1,
      valid: true,
      unknownCandidateIds: [],
      confidence: 0.8,
      latencyMs: 12,
    });
  }
  const first = summarizeObservations(observations, protocol);
  const second = summarizeObservations(observations, protocol);
  assert.deepEqual(first, second);
  assert.equal(first.preregisteredHypothesis, 'supported');
  assert.deepEqual(first.pairedDelta.precisionAt5.ci95, [0.2, 0.2]);
});
