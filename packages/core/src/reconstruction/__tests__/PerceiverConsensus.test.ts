/**
 * @cross_perceiver_contract — slice 3 of the Receipt-Bound Surface.
 *
 * ONE composition fans to two STRUCTURALLY-DIFFERENT perceiver compilers
 * (WebGPU = eye, AgentInference = agent). Each emitted artifact is
 * independently re-derived into world facts and diffed into a
 * PerceiverConsensusReceipt; disagreement = falsification.
 *
 * The acceptance test for the whole slice is the RED-FLIP: a hand-broken
 * affordance in ONE artifact must flip the verdict to FALSIFIED naming the
 * dissenting perceiver — and the derivations must be provably independent
 * (parsed from the artifacts only, never the shared input AST).
 */
import { describe, it, expect, vi } from 'vitest';
import { WebGPUCompiler } from '../../compiler/WebGPUCompiler';
import { AgentInferenceCompiler } from '../../compiler/AgentInferenceExportTarget';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import { deriveWebGPUPerception } from '../webgpuPerceiverDerivation';
import { deriveAgentInferencePerception } from '../agentInferencePerceiverDerivation';
import {
  derivePerceiverConsensus,
  PERCEIVER_CONSENSUS_VERSION,
} from '../PerceiverConsensusReceipt';

vi.mock('../../compiler/identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

/** One agent-bearing spatial object (2 tool affordances) + one plain scene object. */
function composition(): HoloComposition {
  return {
    name: 'consensusProbe',
    npcs: [],
    objects: [
      {
        name: 'HandleBot',
        traits: [
          { name: 'agent', config: { role: 'manipulator' } },
          { name: 'tool', config: { name: 'grab_handle', description: 'Grab the door handle' } },
          { name: 'tool', config: { name: 'release_handle', description: 'Release the handle' } },
        ],
        properties: [
          { key: 'geometry', value: 'sphere' },
          { key: 'position', value: [1, 2, 3] },
        ],
      },
      {
        name: 'DoorHandle',
        traits: [{ name: 'interactable', config: {} }],
        properties: [
          { key: 'geometry', value: 'box' },
          { key: 'position', value: [1, 2.5, 3] },
        ],
      },
    ],
  } as unknown as HoloComposition;
}

function compileBoth() {
  const comp = composition();
  const webgpuArtifact = new WebGPUCompiler({}).compile(comp, 'test-token');
  const agentFiles = new AgentInferenceCompiler({ language: 'typescript' }).compile(
    comp,
    'test-token'
  );
  return { webgpuArtifact, agentFiles };
}

describe('@cross_perceiver_contract — 2-perceiver consensus (webgpu + agent-inference)', () => {
  it('DERIVES (eye): agent entity, affordance COUNT, spatial extras, source name — from the artifact only', () => {
    const { webgpuArtifact } = compileBoth();
    const d = deriveWebGPUPerception(webgpuArtifact);
    expect(d.perceiver).toBe('webgpu');
    expect(d.sourceName).toBe('consensusProbe');
    expect(d.entities).toHaveLength(1); // DoorHandle is not agent-kind — out of the comparison domain
    expect(d.entities[0]).toMatchObject({ id: 'HandleBot', kind: 'agent', offerCount: 2 });
    expect(d.entities[0].offers).toBeUndefined(); // the eye cannot NAME affordances
    expect(d.coverageGaps).toContain('affordance-action-names');
    expect(d.artifactHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('DERIVES (agent): same entity with NAMED offers — from the artifact files only', () => {
    const { agentFiles } = compileBoth();
    const d = deriveAgentInferencePerception(agentFiles);
    expect(d.perceiver).toBe('agent-inference');
    expect(d.sourceName).toBe('consensusProbe');
    expect(d.entities).toHaveLength(1);
    expect(d.entities[0]).toMatchObject({ id: 'HandleBot', kind: 'agent', offerCount: 2 });
    expect(d.entities[0].offers?.map((o) => o.action)).toEqual(['grab_handle', 'release_handle']);
    expect(d.coverageGaps).toContain('spatial-position');
  });

  it('CONSENSUS: unbroken artifacts agree on every mutually-expressible fact', () => {
    const { webgpuArtifact, agentFiles } = compileBoth();
    const receipt = derivePerceiverConsensus([
      deriveWebGPUPerception(webgpuArtifact),
      deriveAgentInferencePerception(agentFiles),
    ]);
    expect(receipt.version).toBe(PERCEIVER_CONSENSUS_VERSION);
    expect(receipt.verdict).toBe('CONSENSUS');
    expect(receipt.sourceName).toBe('consensusProbe');
    expect(receipt.disagreements).toEqual([]);
    // sourceName + entity presence + offerCount all actually compared:
    expect(receipt.comparedFacts).toBeGreaterThanOrEqual(3);
    expect(receipt.perceivers.map((p) => p.perceiver)).toEqual(['agent-inference', 'webgpu']);
    expect(receipt.receiptHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('RED-FLIP (acceptance): a hand-broken affordance in the AGENT artifact falsifies with the named fact', () => {
    const { webgpuArtifact, agentFiles } = compileBoth();
    // Simulate codegen dropping an affordance: remove one tool from config.json.
    const config = JSON.parse(agentFiles['config.json']);
    config.agents[0].tools = config.agents[0].tools.filter((t: string) => t !== 'release_handle');
    const broken = { ...agentFiles, 'config.json': JSON.stringify(config, null, 2) };

    const receipt = derivePerceiverConsensus([
      deriveWebGPUPerception(webgpuArtifact),
      deriveAgentInferencePerception(broken),
    ]);
    expect(receipt.verdict).toBe('FALSIFIED');
    expect(receipt.disagreements).toHaveLength(1);
    expect(receipt.disagreements[0].fact).toBe('entity:HandleBot:offerCount');
    expect(receipt.disagreements[0].claims).toEqual({ webgpu: 2, 'agent-inference': 1 });
    expect(receipt.disagreements[0].detail).toMatch(/webgpu derives 2/);
    expect(receipt.disagreements[0].detail).toMatch(/agent-inference derives 1/);
  });

  it('RED-FLIP (symmetric): an entity broken out of the EYE artifact falsifies presence', () => {
    const { webgpuArtifact, agentFiles } = compileBoth();
    // Simulate the renderer dropping the agent: strip the "agent" trait marker
    // from the scene-registry literal, so the eye no longer sees an agent there.
    const broken = webgpuArtifact.replace('traits: ["agent","tool","tool"]', 'traits: ["tool","tool"]');
    expect(broken).not.toBe(webgpuArtifact); // the corruption actually landed

    const receipt = derivePerceiverConsensus([
      deriveWebGPUPerception(broken),
      deriveAgentInferencePerception(agentFiles),
    ]);
    expect(receipt.verdict).toBe('FALSIFIED');
    expect(receipt.disagreements[0].fact).toBe('entity:HandleBot');
    expect(receipt.disagreements[0].claims).toEqual({
      webgpu: 'absent',
      'agent-inference': 'present',
    });
    expect(receipt.disagreements[0].detail).toMatch(/invisible to webgpu/);
  });

  it('INDEPENDENCE GUARD: corrupting one artifact never moves the other derivation', () => {
    const { webgpuArtifact, agentFiles } = compileBoth();
    const before = deriveAgentInferencePerception(agentFiles);
    // Corrupt the webgpu artifact heavily; the agent derivation must be byte-identical.
    void deriveWebGPUPerception(webgpuArtifact.replace(/"agent"/g, '"corrupted"'));
    const after = deriveAgentInferencePerception(agentFiles);
    expect(after).toEqual(before);
    // And each extractor REJECTS the other perceiver's artifact kind outright —
    // the derivations cannot share an input even by accident.
    expect(() => deriveWebGPUPerception(agentFiles as unknown as string)).toThrow(
      /not a WebGPU compile artifact/
    );
    expect(() =>
      deriveAgentInferencePerception(webgpuArtifact as unknown as Record<string, string>)
    ).toThrow(/not an agent-inference artifact/);
  });

  it('ANTI-CIRCULARITY: single-perceiver and duplicate-perceiver consensus are refused', () => {
    const { webgpuArtifact } = compileBoth();
    const d = deriveWebGPUPerception(webgpuArtifact);
    expect(() => derivePerceiverConsensus([d])).toThrow(/>= 2 independent perceivers/);
    expect(() => derivePerceiverConsensus([d, { ...d }])).toThrow(/duplicate perceiver ids/);
  });

  it('COVERAGE, not disagreement: one-sided facts (tool names, geometry) never falsify', () => {
    const { webgpuArtifact, agentFiles } = compileBoth();
    const receipt = derivePerceiverConsensus([
      deriveWebGPUPerception(webgpuArtifact),
      deriveAgentInferencePerception(agentFiles),
    ]);
    // The eye cannot name affordances and the agent cannot see geometry — both
    // are declared coverage gaps, and the verdict stays CONSENSUS regardless.
    expect(receipt.verdict).toBe('CONSENSUS');
    const gaps = Object.fromEntries(receipt.perceivers.map((p) => [p.perceiver, p.coverageGaps]));
    expect(gaps['webgpu']).toContain('affordance-action-names');
    expect(gaps['agent-inference']).toContain('geometry');
  });

  it('RECEIPT BINDS TO DELIVERED BYTES: any artifact change moves artifactHash and receiptHash', () => {
    const { webgpuArtifact, agentFiles } = compileBoth();
    const clean = derivePerceiverConsensus([
      deriveWebGPUPerception(webgpuArtifact),
      deriveAgentInferencePerception(agentFiles),
    ]);
    // A byte-level change that does NOT alter derived facts still re-keys the
    // receipt — the attestation covers what was delivered, not just the summary.
    const touched = derivePerceiverConsensus([
      deriveWebGPUPerception(webgpuArtifact + '\n// touched'),
      deriveAgentInferencePerception(agentFiles),
    ]);
    expect(touched.verdict).toBe('CONSENSUS');
    expect(touched.receiptHash).not.toBe(clean.receiptHash);
  });

  it('MALFORMED artifact fails LOUD, never derives an empty agreeing world', () => {
    const { agentFiles } = compileBoth();
    expect(() =>
      deriveAgentInferencePerception({ ...agentFiles, 'config.json': '{not json' })
    ).toThrow(/not valid JSON/);
    expect(() =>
      deriveAgentInferencePerception({ ...agentFiles, 'config.json': '{"agents": "nope"}' })
    ).toThrow(/no agents\[\]/);
  });
});
