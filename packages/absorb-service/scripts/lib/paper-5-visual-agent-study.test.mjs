import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAgentBatchJsonSchema,
  buildAgentBatchPrompt,
  buildAgentPrompt,
  buildRelationalObservation,
  candidateId,
  counterbalancedArmOrders,
  counterbalancedOrders,
  parseAgentBatchResponse,
  parseAgentResponse,
  protocolArmIds,
  scoreRanking,
  summarizeMultiArmObservations,
  summarizeObservations,
  validateStudyManifest,
} from './paper-5-visual-agent-study.mjs';

const protocol = {
  schemaVersion: 'holoscript.paper5.visual-agent-study-protocol.v1',
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

const v3Protocol = {
  schemaVersion: 'holoscript.paper5.visual-agent-study-protocol.v3',
  protocolId: 'visual-test-v3',
  design: {
    candidateCount: 2,
    promptEncoding: 'compact-v3',
    arms: [{ id: 'text' }, { id: 'topology' }, { id: 'relations' }],
  },
  admission: { minimumQueries: 1, requireAllCategories: false },
  metrics: {
    bootstrapResamples: 2000,
    bootstrapSeed: 11,
    pairwiseComparisons: [
      { id: 'topology-vs-text', treatment: 'topology', control: 'text' },
      { id: 'relations-vs-text', treatment: 'relations', control: 'text' },
      { id: 'relations-vs-topology', treatment: 'relations', control: 'topology' },
    ],
  },
  engineeringGate: { maximumInvalidResponses: 0 },
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

test('rotates identical candidate sets across every v3 arm', () => {
  const candidates = [candidate('a.ts'), candidate('b.ts'), candidate('c.ts')];
  const arms = protocolArmIds(v3Protocol);
  const orders = counterbalancedArmOrders(candidates, 'dependency-01', arms);
  const reference = orders.text.map((item) => item.candidateId).sort();
  assert.deepEqual(arms, ['text', 'topology', 'relations']);
  for (const arm of arms) {
    assert.deepEqual(orders[arm].map((item) => item.candidateId).sort(), reference);
  }
  assert.equal(
    new Set(arms.map((arm) => orders[arm].map((item) => item.candidateId).join(','))).size,
    3
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

test('builds and parses same-arm blinded batches', () => {
  const a = candidate('a.ts');
  const b = candidate('b.ts');
  const studyCase = {
    id: 'dependency-01',
    category: 'dependency',
    query: 'Which candidate is relevant?',
    arms: {
      text: { candidates: [a, b] },
      visual: {
        candidates: [b, a],
        visualGraphObservation: { nodes: [], edges: [] },
      },
    },
  };
  const compactProtocol = {
    ...protocol,
    design: { ...protocol.design, promptEncoding: 'compact-v2' },
  };
  const prompt = buildAgentBatchPrompt([studyCase], 'text', compactProtocol);
  assert.doesNotMatch(prompt, /goldCandidateIds|scoringKey|relevanceLabel/iu);
  assert.match(prompt, /"rankedCandidateIds":\["c1"\]/u);
  assert.doesNotMatch(prompt, /cand_example/u);
  const parsed = parseAgentBatchResponse(
    JSON.stringify({
      answers: {
        'dependency-01': {
          rankedCandidateIds: [a.candidateId],
          confidence: 0.7,
        },
      },
    }),
    [studyCase],
    'text'
  );
  assert.equal(parsed['dependency-01'].valid, true);
  assert.deepEqual(parsed['dependency-01'].rankedCandidateIds, [a.candidateId]);
});

test('builds a strict case-keyed JSON schema from arm-local aliases', () => {
  const studyCases = [
    {
      id: 'dependency-01',
      arms: { relations: { candidates: [candidate('a.ts'), candidate('b.ts')] } },
    },
    {
      id: 'impact-01',
      arms: { relations: { candidates: [candidate('c.ts'), candidate('d.ts')] } },
    },
  ];
  const schema = buildAgentBatchJsonSchema(studyCases, 'relations');
  assert.deepEqual(schema.properties.answers.required, ['dependency-01', 'impact-01']);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.answers.additionalProperties, false);
  assert.deepEqual(
    schema.properties.answers.properties['dependency-01'].properties.rankedCandidateIds.items.enum,
    ['c1', 'c2']
  );
  assert.doesNotMatch(JSON.stringify(schema), /gold|relevance|cand_/iu);
});

test('projects directional relations without coordinates or labels', () => {
  const a = candidate('a.ts');
  const b = candidate('b.ts');
  const relation = buildRelationalObservation(
    [a, b],
    {
      nodes: [
        {
          candidateId: a.candidateId,
          community: 'community_one',
          position: [1, 2, 3],
          importDegree: { outgoing: 3, incoming: 0 },
          visibleCandidateNeighbors: { importsTo: [b.candidateId], importedBy: [] },
        },
        {
          candidateId: b.candidateId,
          community: 'community_one',
          position: [2, 2, 3],
          importDegree: { outgoing: 0, incoming: 2 },
          visibleCandidateNeighbors: { importsTo: [], importedBy: [a.candidateId] },
        },
      ],
    },
    { category: 'dependency' }
  );
  assert.deepEqual(relation.relations, [
    {
      fromCandidateId: a.candidateId,
      toCandidateId: b.candidateId,
      type: 'imports',
    },
  ]);
  assert.equal(relation.nodes[0].externalImportsTo, 2);
  assert.equal(relation.focus.emphasis, 'dependency-direction');
  assert.doesNotMatch(JSON.stringify(relation), /position|gold|relevanceLabel/iu);

  const studyCase = {
    id: 'dependency-01',
    category: 'dependency',
    query: 'Which file imports the other?',
    arms: {
      relations: {
        candidates: [a, b],
        relationalGraphObservation: relation,
      },
    },
  };
  const prompt = buildAgentBatchPrompt([studyCase], 'relations', v3Protocol);
  assert.match(prompt, /"type":"imports"/u);
  assert.match(prompt, /"from":"c1","to":"c2"/u);
  assert.doesNotMatch(prompt, /position|goldCandidateIds|cand_/iu);
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

test('validates and summarizes v3 multi-arm diagnostics without claim promotion', () => {
  const a = candidate('a.ts');
  const b = candidate('b.ts');
  const visualNodes = [
    {
      candidateId: a.candidateId,
      sceneNodeId: 'node-a',
      position: [0, 0, 0],
      community: 'community_one',
      importDegree: { outgoing: 1, incoming: 0 },
      visibleCandidateNeighbors: { importsTo: [b.candidateId], importedBy: [] },
    },
    {
      candidateId: b.candidateId,
      sceneNodeId: 'node-b',
      position: [1, 0, 0],
      community: 'community_one',
      importDegree: { outgoing: 0, incoming: 1 },
      visibleCandidateNeighbors: { importsTo: [], importedBy: [a.candidateId] },
    },
  ];
  const relation = buildRelationalObservation(
    [b, a],
    { nodes: visualNodes },
    { category: 'dependency' }
  );
  const studyCase = {
    id: 'dependency-01',
    category: 'dependency',
    query: 'Which file imports the other?',
    scoringKey: { goldCandidateIds: [a.candidateId, b.candidateId] },
    arms: {
      text: { candidates: [a, b] },
      topology: {
        candidates: [b, a],
        visualGraphObservation: { nodes: visualNodes, edges: [] },
      },
      relations: {
        candidates: [b, a],
        relationalGraphObservation: relation,
      },
    },
  };
  const manifest = {
    schemaVersion: 'holoscript.paper5.visual-agent-packets.v2',
    protocolId: v3Protocol.protocolId,
    cases: [studyCase],
  };
  assert.deepEqual(validateStudyManifest(manifest, v3Protocol).errors, []);

  const observations = ['text', 'topology', 'relations'].map((arm, index) => ({
    caseId: studyCase.id,
    category: studyCase.category,
    arm,
    precisionAt5: index * 0.1,
    reciprocalRank: index * 0.5,
    valid: true,
    unknownCandidateIds: [],
    confidence: 0.5,
    latencyMs: 10,
  }));
  const summary = summarizeMultiArmObservations(observations, v3Protocol);
  assert.equal(summary.pairedQueries, 1);
  assert.equal(summary.engineeringGate, 'pass');
  assert.equal(summary.superiorityClaimEligible, false);
  assert.equal(summary.pairwise['relations-vs-text'].precisionAt5.estimate, 0.2);
});
