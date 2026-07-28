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
import { URDFCompiler } from '../../compiler/URDFCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import { deriveWebGPUPerception } from '../webgpuPerceiverDerivation';
import { deriveAgentInferencePerception } from '../agentInferencePerceiverDerivation';
import { deriveUrdfPerception } from '../urdfPerceiverDerivation';
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
  const urdfArtifact = new URDFCompiler({}).compile(comp, 'test-token');
  return { webgpuArtifact, agentFiles, urdfArtifact };
}

describe('@cross_perceiver_contract — 2-perceiver consensus (webgpu + agent-inference)', () => {
  it('DERIVES (eye): agent entity with NAMED offers via the HoloScene Manifest — from the artifact only', () => {
    const { webgpuArtifact } = compileBoth();
    expect(webgpuArtifact).toContain('const holoSceneManifest = '); // the manifest IS delivered bytes
    const d = deriveWebGPUPerception(webgpuArtifact);
    expect(d.perceiver).toBe('webgpu');
    expect(d.sourceName).toBe('consensusProbe');
    expect(d.entities).toHaveLength(1); // DoorHandle is not agent-kind — out of the comparison domain
    expect(d.entities[0]).toMatchObject({ id: 'HandleBot', kind: 'agent', offerCount: 2 });
    // rycr: the manifest names actions — full affordance parity with the agent perceiver.
    expect(d.entities[0].offers?.map((o) => o.action)).toEqual(['grab_handle', 'release_handle']);
    expect(d.expresses).toContain('affordance-names');
    expect(d.coverageGaps).toEqual([]);
    expect(d.artifactHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('DERIVES (eye, pre-manifest fallback): an old artifact without a manifest still counts affordances', () => {
    const { webgpuArtifact } = compileBoth();
    // Simulate an older artifact: strip the manifest block entirely.
    const legacy = webgpuArtifact.replace(/\/\/ === HoloScene Manifest[\s\S]*?\n\n/, '');
    expect(legacy).not.toContain('holoSceneManifest');
    const d = deriveWebGPUPerception(legacy);
    expect(d.entities[0]).toMatchObject({ id: 'HandleBot', kind: 'agent', offerCount: 2 });
    expect(d.entities[0].offers).toBeUndefined(); // names inexpressible pre-manifest
    expect(d.coverageGaps).toContain('affordance-action-names');
  });

  it('MALFORMED manifest fails LOUD — never silently falls back to the regex path', () => {
    const { webgpuArtifact } = compileBoth();
    const broken = webgpuArtifact.replace(
      /const holoSceneManifest = \{/,
      'const holoSceneManifest = {not json'
    );
    expect(() => deriveWebGPUPerception(broken)).toThrow(/not valid JSON/);
  });

  it('RED-FLIP (rycr acceptance): a RENAMED tool — same count — falsifies on the action set', () => {
    const { webgpuArtifact, agentFiles } = compileBoth();
    // Codegen renames an affordance: count stays 2, so 3b's count diff passes —
    // only name parity catches it.
    const config = JSON.parse(agentFiles['config.json']);
    config.agents[0].tool_details = config.agents[0].tool_details.map((t: { name: string }) =>
      t.name === 'release_handle' ? { ...t, name: 'open_sesame' } : t
    );
    const broken = { ...agentFiles, 'config.json': JSON.stringify(config, null, 2) };

    const receipt = derivePerceiverConsensus([
      deriveWebGPUPerception(webgpuArtifact),
      deriveAgentInferencePerception(broken),
    ]);
    expect(receipt.verdict).toBe('FALSIFIED');
    expect(receipt.disagreements).toHaveLength(1);
    expect(receipt.disagreements[0].fact).toBe('entity:HandleBot:offerActions');
    expect(receipt.disagreements[0].claims['webgpu']).toBe('grab_handle,release_handle');
    expect(receipt.disagreements[0].claims['agent-inference']).toBe('grab_handle,open_sesame');
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
    // Simulate codegen dropping an affordance: remove one tool from config.json
    // (both the name array and the structured tool_details the derivation reads).
    const config = JSON.parse(agentFiles['config.json']);
    config.agents[0].tools = config.agents[0].tools.filter((t: string) => t !== 'release_handle');
    config.agents[0].tool_details = config.agents[0].tool_details.filter(
      (t: { name: string }) => t.name !== 'release_handle'
    );
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
    // from the HoloScene Manifest (the facts source the derivation reads).
    const broken = webgpuArtifact.replace(
      '"traits":["agent","tool","tool"]',
      '"traits":["tool","tool"]'
    );
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
    // The agent perceiver cannot see geometry/positions — a declared coverage
    // gap, and the verdict stays CONSENSUS regardless (one-sided ≠ disagreement).
    expect(receipt.verdict).toBe('CONSENSUS');
    const gaps = Object.fromEntries(receipt.perceivers.map((p) => [p.perceiver, p.coverageGaps]));
    expect(gaps['agent-inference']).toContain('geometry');
    expect(gaps['agent-inference']).toContain('spatial-position');
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

describe('@cross_perceiver_contract 3b — the URDF robot perceiver', () => {
  it('DERIVES (robot): visual links as canonical physical entities; kinematic plumbing excluded; agent facts abstained', () => {
    const { urdfArtifact } = compileBoth();
    const d = deriveUrdfPerception(urdfArtifact);
    expect(d.perceiver).toBe('urdf');
    expect(d.sourceName).toBe('consensusProbe');
    // base_link has no <visual> — structurally excluded, not by name convention.
    expect(d.physicalEntities?.map((e) => e.id).sort()).toEqual(['doorhandle', 'handlebot']);
    expect(d.physicalEntities?.find((e) => e.id === 'handlebot')).toMatchObject({
      geometry: 'sphere',
      position: [1, 2, 3],
    });
    expect(d.physicalEntities?.find((e) => e.id === 'doorhandle')).toMatchObject({
      geometry: 'box',
      position: [1, 2.5, 3],
    });
    // The robot stack has no agent vocabulary — it abstains rather than claiming absence.
    expect(d.entities).toEqual([]);
    expect(d.expresses).not.toContain('agent-entities');
    expect(d.coverageGaps).toContain('agent-entities');
  });

  it('ID CONTRACT: the eye folds HandleBot to the same canonical physical id the robot emits', () => {
    const { webgpuArtifact } = compileBoth();
    const d = deriveWebGPUPerception(webgpuArtifact);
    expect(d.physicalEntities?.map((e) => e.id).sort()).toEqual(['doorhandle', 'handlebot']);
    expect(d.physicalEntities?.find((e) => e.id === 'handlebot')?.label).toBe('HandleBot');
  });

  it('3-WAY CONSENSUS: eye + agent + robot agree on every mutually-expressible fact', () => {
    const { webgpuArtifact, agentFiles, urdfArtifact } = compileBoth();
    const receipt = derivePerceiverConsensus([
      deriveWebGPUPerception(webgpuArtifact),
      deriveAgentInferencePerception(agentFiles),
      deriveUrdfPerception(urdfArtifact),
    ]);
    expect(receipt.verdict).toBe('CONSENSUS');
    expect(receipt.disagreements).toEqual([]);
    expect(receipt.perceivers.map((p) => p.perceiver)).toEqual([
      'agent-inference',
      'urdf',
      'webgpu',
    ]);
    // Physical facts now actually compared: presence x2 + geometry x2 + position x2
    // on top of sourceName + agent presence + offerCount.
    expect(receipt.comparedFacts).toBeGreaterThanOrEqual(9);
  });

  it('RED-FLIP (robot geometry): a hand-broken link geometry falsifies with the named fact', () => {
    const { webgpuArtifact, agentFiles, urdfArtifact } = compileBoth();
    const broken = urdfArtifact.replace('<sphere radius="0.5"/>', '<box size="1 1 1"/>');
    expect(broken).not.toBe(urdfArtifact);

    const receipt = derivePerceiverConsensus([
      deriveWebGPUPerception(webgpuArtifact),
      deriveAgentInferencePerception(agentFiles),
      deriveUrdfPerception(broken),
    ]);
    expect(receipt.verdict).toBe('FALSIFIED');
    expect(receipt.disagreements).toHaveLength(1);
    expect(receipt.disagreements[0].fact).toBe('physical:handlebot:geometry');
    expect(receipt.disagreements[0].claims).toEqual({ webgpu: 'sphere', urdf: 'box' });
  });

  it('RED-FLIP (robot presence): a deleted link falsifies presence — and the agent abstains', () => {
    const { webgpuArtifact, agentFiles, urdfArtifact } = compileBoth();
    const broken = urdfArtifact.replace(/<link\s+name="doorhandle">[\s\S]*?<\/link>/, '');
    expect(broken).not.toBe(urdfArtifact);

    const receipt = derivePerceiverConsensus([
      deriveWebGPUPerception(webgpuArtifact),
      deriveAgentInferencePerception(agentFiles),
      deriveUrdfPerception(broken),
    ]);
    expect(receipt.verdict).toBe('FALSIFIED');
    expect(receipt.disagreements[0].fact).toBe('physical:doorhandle');
    // ONLY physical-fact perceivers appear in the claims — the agent perceiver
    // cannot express physical entities, so it is never recorded as 'absent'.
    expect(receipt.disagreements[0].claims).toEqual({ webgpu: 'present', urdf: 'absent' });
  });

  it('RED-FLIP (robot position): a shifted visual origin falsifies beyond epsilon', () => {
    const { webgpuArtifact, agentFiles, urdfArtifact } = compileBoth();
    const broken = urdfArtifact.replaceAll('xyz="1 2 3"', 'xyz="1 2 9"');
    expect(broken).not.toBe(urdfArtifact);

    const receipt = derivePerceiverConsensus([
      deriveWebGPUPerception(webgpuArtifact),
      deriveAgentInferencePerception(agentFiles),
      deriveUrdfPerception(broken),
    ]);
    expect(receipt.verdict).toBe('FALSIFIED');
    expect(receipt.disagreements[0].fact).toBe('physical:handlebot:position');
    expect(receipt.disagreements[0].claims).toEqual({
      webgpu: '[1,2,3]',
      urdf: '[1,2,9]',
    });
  });

  it('ABSTENTION (agent facts): a broken affordance count never implicates the robot', () => {
    const { webgpuArtifact, agentFiles, urdfArtifact } = compileBoth();
    const config = JSON.parse(agentFiles['config.json']);
    config.agents[0].tools = config.agents[0].tools.slice(0, 1);
    config.agents[0].tool_details = config.agents[0].tool_details.slice(0, 1);
    const broken = { ...agentFiles, 'config.json': JSON.stringify(config, null, 2) };

    const receipt = derivePerceiverConsensus([
      deriveWebGPUPerception(webgpuArtifact),
      deriveAgentInferencePerception(broken),
      deriveUrdfPerception(urdfArtifact),
    ]);
    expect(receipt.verdict).toBe('FALSIFIED');
    expect(receipt.disagreements[0].fact).toBe('entity:HandleBot:offerCount');
    expect(Object.keys(receipt.disagreements[0].claims).sort()).toEqual([
      'agent-inference',
      'webgpu',
    ]);
  });

  it('INDEPENDENCE: the robot extractor rejects foreign artifact kinds, and vice versa', () => {
    const { webgpuArtifact, urdfArtifact } = compileBoth();
    expect(() => deriveUrdfPerception(webgpuArtifact)).toThrow(/not a URDF robot description/);
    expect(() => deriveWebGPUPerception(urdfArtifact)).toThrow(/not a WebGPU compile artifact/);
  });
});

describe('@cross_perceiver_contract 3c — affordance grounding (reachability v0)', () => {
  /** Like composition(), but grab_handle DECLARES its world target; optionally
   *  a far-away beacon with a tool targeting it, or a ghost target. */
  function groundedComposition(opts: { farTool?: boolean; ghostTool?: boolean } = {}) {
    const tools: Array<{ name: string; config: Record<string, unknown> }> = [
      {
        name: 'tool',
        config: { name: 'grab_handle', description: 'Grab the door handle', target: 'DoorHandle' },
      },
    ];
    if (opts.farTool) {
      tools.push({
        name: 'tool',
        config: { name: 'press_beacon', description: 'Press the beacon', target: 'FarBeacon' },
      });
    }
    if (opts.ghostTool) {
      tools.push({
        name: 'tool',
        config: { name: 'haunt', description: 'Touch the ghost', target: 'Ghost' },
      });
    }
    return {
      name: 'groundedProbe',
      npcs: [],
      objects: [
        {
          name: 'HandleBot',
          traits: [{ name: 'agent', config: { role: 'manipulator' } }, ...tools],
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
        {
          name: 'FarBeacon',
          traits: [],
          properties: [
            { key: 'geometry', value: 'box' },
            { key: 'position', value: [50, 0, 0] },
          ],
        },
      ],
    } as unknown as HoloComposition;
  }

  function compileGrounded(opts: Parameters<typeof groundedComposition>[0] = {}) {
    const comp = groundedComposition(opts);
    return {
      webgpuArtifact: new WebGPUCompiler({}).compile(comp, 'test-token'),
      agentFiles: new AgentInferenceCompiler({ language: 'typescript' }).compile(
        comp,
        'test-token'
      ),
      urdfArtifact: new URDFCompiler({}).compile(comp, 'test-token'),
    };
  }

  it('ARTIFACT (itxz): config.json is the complete structured facts file — source, tool_details with target, state', () => {
    const { agentFiles } = compileGrounded();
    const config = JSON.parse(agentFiles['config.json']);
    expect(config.source).toBe('groundedProbe'); // structured, no banner regex needed
    expect(config.agents[0].tool_details).toEqual([
      { name: 'grab_handle', description: 'Grab the door handle', target: 'DoorHandle' },
    ]);
    expect(config.agents[0].tools).toEqual(['grab_handle']); // name array preserved (compat)
    expect(Array.isArray(config.agents[0].state)).toBe(true);
  });

  it('DERIVES (robot): extents and fixed mobility from the URDF visual primitives + joints', () => {
    const { urdfArtifact } = compileGrounded();
    const d = deriveUrdfPerception(urdfArtifact);
    const bot = d.physicalEntities!.find((e) => e.id === 'handlebot')!;
    const handle = d.physicalEntities!.find((e) => e.id === 'doorhandle')!;
    expect(bot.extent).toBeCloseTo(0.5, 6); // sphere radius
    expect(handle.extent).toBeCloseTo(Math.hypot(1, 1, 1) / 2, 6); // box half-diagonal
    expect(bot.mobility).toBe('fixed');
  });

  it('GROUNDED CONSENSUS: a declared target within the fixed reach envelope stays CONSENSUS', () => {
    const { webgpuArtifact, agentFiles, urdfArtifact } = compileGrounded();
    const receipt = derivePerceiverConsensus([
      deriveWebGPUPerception(webgpuArtifact),
      deriveAgentInferencePerception(agentFiles),
      deriveUrdfPerception(urdfArtifact),
    ]);
    // dist(HandleBot, DoorHandle) = 0.5 <= 0.5 + 0.866 — physically groundable.
    expect(receipt.verdict).toBe('CONSENSUS');
    expect(receipt.disagreements).toEqual([]);
  });

  it('RED-FLIP (the kinematic falsification): every spatial fact AGREES, yet the far affordance is impossible', () => {
    const { webgpuArtifact, agentFiles, urdfArtifact } = compileGrounded({ farTool: true });
    const receipt = derivePerceiverConsensus([
      deriveWebGPUPerception(webgpuArtifact),
      deriveAgentInferencePerception(agentFiles),
      deriveUrdfPerception(urdfArtifact),
    ]);
    // No artifact was corrupted — positions, geometry, presence all agree.
    // The ONLY lie is physical: FarBeacon is ~49 units away from a fixed actor.
    expect(receipt.verdict).toBe('FALSIFIED');
    expect(receipt.disagreements).toHaveLength(1);
    expect(receipt.disagreements[0].fact).toBe('grounding:HandleBot:press_beacon');
    expect(receipt.disagreements[0].claims['agent-inference']).toBe('press_beacon@FarBeacon');
    expect(receipt.disagreements[0].claims['urdf']).toMatch(/unreachable \(dist 49\./);
    expect(receipt.disagreements[0].detail).toMatch(/no reachable affordance/);
  });

  it('RED-FLIP (ungrounded target): an affordance on a nonexistent entity is falsified', () => {
    const { webgpuArtifact, agentFiles, urdfArtifact } = compileGrounded({ ghostTool: true });
    const receipt = derivePerceiverConsensus([
      deriveWebGPUPerception(webgpuArtifact),
      deriveAgentInferencePerception(agentFiles),
      deriveUrdfPerception(urdfArtifact),
    ]);
    expect(receipt.verdict).toBe('FALSIFIED');
    const ghost = receipt.disagreements.filter((d) => d.fact === 'grounding:HandleBot:haunt');
    // BOTH physical perceivers independently report the missing target.
    expect(ghost).toHaveLength(2);
    const dissenters = ghost.flatMap((d) => Object.keys(d.claims)).sort();
    expect(dissenters).toEqual(['agent-inference', 'agent-inference', 'urdf', 'webgpu']);
    expect(ghost[0].detail).toMatch(/no physical target/);
  });

  /** Actuated actor: a prismatic slider with `travel` of reach along +x,
   *  offering a grab on a target placed `dist` away along +x. */
  function actuatedComposition(travel: number, targetX: number) {
    return {
      name: 'actuatedProbe',
      npcs: [],
      objects: [
        {
          name: 'SliderBot',
          traits: [
            { name: 'agent', config: { role: 'manipulator' } },
            {
              name: 'joint',
              config: { jointType: 'slider', axis: [1, 0, 0], limits: { min: 0, max: travel } },
            },
            {
              name: 'tool',
              config: { name: 'grab_far', description: 'Grab the target', target: 'FarTarget' },
            },
          ],
          properties: [
            { key: 'geometry', value: 'sphere' },
            { key: 'position', value: [0, 0, 0] },
          ],
        },
        {
          name: 'FarTarget',
          traits: [],
          properties: [
            { key: 'geometry', value: 'sphere' },
            { key: 'position', value: [targetX, 0, 0] },
          ],
        },
      ],
    } as unknown as HoloComposition;
  }

  function compileActuated(travel: number, targetX: number) {
    const comp = actuatedComposition(travel, targetX);
    return {
      webgpuArtifact: new WebGPUCompiler({}).compile(comp, 'test-token'),
      agentFiles: new AgentInferenceCompiler({ language: 'typescript' }).compile(
        comp,
        'test-token'
      ),
      urdfArtifact: new URDFCompiler({}).compile(comp, 'test-token'),
    };
  }

  it('DERIVES (3d): a prismatic joint yields an actuated OUTER reach envelope from its travel limits', () => {
    const { urdfArtifact } = compileActuated(5, 4);
    const d = deriveUrdfPerception(urdfArtifact);
    const bot = d.physicalEntities!.find((e) => e.id === 'sliderbot')!;
    expect(bot.mobility).toBe('actuated');
    // radius = |V−J| (0 here) + sphere extent 0.5 + max(|0|,|5|) travel
    expect(bot.reachRadius).toBeCloseTo(5.5, 6);
  });

  it('GROUNDED (3d): an actuated actor whose travel covers the distance stays CONSENSUS', () => {
    // dist 4 <= reach 5.5 + target extent 0.5 — the slider can get there.
    const { webgpuArtifact, agentFiles, urdfArtifact } = compileActuated(5, 4);
    const receipt = derivePerceiverConsensus([
      deriveWebGPUPerception(webgpuArtifact),
      deriveAgentInferencePerception(agentFiles),
      deriveUrdfPerception(urdfArtifact),
    ]);
    expect(receipt.verdict).toBe('CONSENSUS');
    expect(receipt.disagreements).toEqual([]);
  });

  it('RED-FLIP (3d, the kinematic falsification proper): travel exists but cannot cover the distance', () => {
    // Same slider, target at 40: even the most generous outer envelope
    // (0.5 + 5 travel + 0.5 target) cannot touch it — 3c would have ABSTAINED
    // on an actuated actor; 3d falsifies it.
    const { webgpuArtifact, agentFiles, urdfArtifact } = compileActuated(5, 40);
    const receipt = derivePerceiverConsensus([
      deriveWebGPUPerception(webgpuArtifact),
      deriveAgentInferencePerception(agentFiles),
      deriveUrdfPerception(urdfArtifact),
    ]);
    expect(receipt.verdict).toBe('FALSIFIED');
    expect(receipt.disagreements).toHaveLength(1);
    expect(receipt.disagreements[0].fact).toBe('grounding:SliderBot:grab_far');
    expect(receipt.disagreements[0].claims['urdf']).toMatch(/unreachable \(dist 40\./);
    expect(receipt.disagreements[0].detail).toMatch(/actuated-mobility outer reach envelope/);
  });

  it('ID CONTRACT (hostile names, whu2): unicode/space/symbol names fold identically through BOTH real compilers', () => {
    const comp = {
      name: 'hostileProbe',
      npcs: [],
      objects: [
        {
          name: 'Händlé Bot #2', // unicode + space + symbol — URDF must sanitize this
          traits: [],
          properties: [
            { key: 'geometry', value: 'sphere' },
            { key: 'position', value: [1, 2, 3] },
          ],
        },
      ],
    } as unknown as HoloComposition;
    const webgpu = deriveWebGPUPerception(new WebGPUCompiler({}).compile(comp, 'test-token'));
    const urdf = deriveUrdfPerception(new URDFCompiler({}).compile(comp, 'test-token'));
    // Both perceivers converge on the same canonical physical id...
    expect(webgpu.physicalEntities?.[0]?.id).toBe('h_ndl__bot__2');
    expect(urdf.physicalEntities?.[0]?.id).toBe('h_ndl__bot__2');
    // ...and keep their literal spellings as labels for the human reader.
    expect(webgpu.physicalEntities?.[0]?.label).toBe('Händlé Bot #2');
    // Presence therefore AGREES — no false absence from name sanitization.
    const receipt = derivePerceiverConsensus([
      webgpu,
      deriveAgentInferencePerception(
        new AgentInferenceCompiler({ language: 'typescript' }).compile(comp, 'test-token')
      ),
      urdf,
    ]);
    expect(receipt.disagreements.filter((d) => d.fact.startsWith('physical:'))).toEqual([]);
  });

  it('DERIVED COVERAGE (whu2): receipt gaps are the complement of expresses — cannot go stale', () => {
    const { webgpuArtifact, agentFiles, urdfArtifact } = compileBoth();
    const receipt = derivePerceiverConsensus([
      deriveWebGPUPerception(webgpuArtifact),
      deriveAgentInferencePerception(agentFiles),
      deriveUrdfPerception(urdfArtifact),
    ]);
    const gaps = Object.fromEntries(receipt.perceivers.map((p) => [p.perceiver, p.coverageGaps]));
    // urdf never declared these in its extractor notes — the differ DERIVES them:
    expect(gaps['urdf']).toContain('affordance-names');
    expect(gaps['urdf']).toContain('agent-entities');
    // agent-inference: derived fact-class gaps + its own free-text notes coexist:
    expect(gaps['agent-inference']).toContain('position'); // derived (fact class)
    expect(gaps['agent-inference']).toContain('spatial-position'); // extractor note
    // webgpu with a manifest expresses everything — no fact-class gaps:
    expect(gaps['webgpu']).toEqual([]);
  });

  /** Spatial group at [10,0,0] holding a child at local [0,0.5,0] — world truth [10,0.5,0]. */
  function groupedComposition() {
    return {
      name: 'groupProbe',
      npcs: [],
      objects: [],
      spatialGroups: [
        {
          name: 'LegGroup',
          properties: [{ key: 'position', value: [10, 0, 0] }],
          objects: [
            {
              name: 'Foot',
              traits: [],
              properties: [
                { key: 'geometry', value: 'box' },
                { key: 'position', value: [0, 0.5, 0] },
              ],
            },
          ],
        },
      ],
    } as unknown as HoloComposition;
  }

  it('GROUP WORLD TRUTH (3e): both perceivers derive the WORLD position of a grouped child', () => {
    // Before 3e this was a FALSE CONSENSUS at local [0,0.5,0]: the eye renders
    // with the GroupXform offset while the robot dropped the group placement
    // entirely — the runtimes disagreed and the receipt could not see it.
    const comp = groupedComposition();
    const w = deriveWebGPUPerception(new WebGPUCompiler({}).compile(comp, 'test-token'));
    const u = deriveUrdfPerception(new URDFCompiler({}).compile(comp, 'test-token'));
    expect(w.physicalEntities?.find((e) => e.id === 'foot')?.position).toEqual([10, 0.5, 0]);
    expect(u.physicalEntities?.find((e) => e.id === 'foot')?.position).toEqual([10, 0.5, 0]);
    const receipt = derivePerceiverConsensus([w, u]);
    expect(receipt.verdict).toBe('CONSENSUS');
  });

  it('RED-FLIP (3e): a dropped group placement in the robot description falsifies position', () => {
    const comp = groupedComposition();
    const webgpuArtifact = new WebGPUCompiler({}).compile(comp, 'test-token');
    const urdfArtifact = new URDFCompiler({}).compile(comp, 'test-token');
    // Simulate the pre-3e compiler bug: the group joint loses its origin.
    const broken = urdfArtifact.replace('xyz="10 0 0"', 'xyz="0 0 0"');
    expect(broken).not.toBe(urdfArtifact);

    const receipt = derivePerceiverConsensus([
      deriveWebGPUPerception(webgpuArtifact),
      deriveUrdfPerception(broken),
    ]);
    expect(receipt.verdict).toBe('FALSIFIED');
    expect(receipt.disagreements[0].fact).toBe('physical:foot:position');
    expect(receipt.disagreements[0].claims).toEqual({
      webgpu: '[10,0.5,0]',
      urdf: '[0,0.5,0]',
    });
  });

  it('COVERAGE: offers without a declared target never enter the grounding contract', () => {
    // The original composition declares no targets — grounding contributes no
    // facts and cannot falsify (backward compatible with slice 3/3b receipts).
    const { webgpuArtifact, agentFiles, urdfArtifact } = compileBoth();
    const receipt = derivePerceiverConsensus([
      deriveWebGPUPerception(webgpuArtifact),
      deriveAgentInferencePerception(agentFiles),
      deriveUrdfPerception(urdfArtifact),
    ]);
    expect(receipt.verdict).toBe('CONSENSUS');
    expect(receipt.disagreements.filter((d) => d.fact.startsWith('grounding:'))).toEqual([]);
  });
});
