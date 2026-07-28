/**
 * HSI-IR Stage-A vertical slice — acceptance tests (task 9v9q).
 *
 * Covers the board acceptance criteria verbatim:
 *  - empty/skewed IR fails closed;
 *  - alpha-renaming and independent-declaration reorder preserve behavior;
 *  - one semantic-edge intervention changes the expected trace;
 *  - delete/regenerate from source is deterministic;
 *  - targeted compiler tests pass.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseHoloStrict } from '../../parser/HoloCompositionParser';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import {
  HSIAdmissionError,
  HSI_IR_SCHEMA_VERSION,
  HSI_TRACE_SCHEMA_VERSION,
  HSI_LEARNING_GRAPH_SCHEMA_VERSION,
  HSI_AUDIT_SCHEMA_VERSION,
  hsiSha256,
  type HSIScenarioStep,
} from '../HSIIRTypes';
import { HSIIRCompiler, lowerCompositionToHSIIR } from '../HSIIRCompiler';
import { runExactTrace } from '../HSIExactTrace';
import { projectLearningGraph } from '../HSILearningGraph';
import {
  runHSIAudit,
  renameComposition,
  reorderComposition,
  applyIntervention,
  type HSIRenameMap,
} from '../HSIAuditVerifier';

const FIXTURE_PATH = join(
  __dirname,
  '..',
  '..',
  '__tests__',
  'fixtures',
  'hs-core-barrier-world.holo'
);

function loadFixture(): { source: string; composition: HoloComposition } {
  const source = readFileSync(FIXTURE_PATH, 'utf8');
  return { source, composition: parseHoloStrict(source) };
}

const SCENARIO: HSIScenarioStep[] = [
  { kind: 'fire-trigger', machine: 'TraversalControl', input: 'probe' },
  { kind: 'fire-event', event: 'on_inspect' },
  { kind: 'set-input', machine: 'TraversalControl', input: 'clearance', value: 0.2 },
  { kind: 'set-input', machine: 'TraversalControl', input: 'clearance', value: 0.9 },
  { kind: 'fire-event', event: 'on_traverse' },
  { kind: 'set-input', machine: 'TraversalControl', input: 'clearance', value: 0.3 },
];

const RENAME_MAP: HSIRenameMap = {
  Scout: 'Pathfinder',
  Beacon: 'Lodestar',
  GlassPane: 'CrystalPane',
  StoneSlab: 'BasaltSlab',
  VeilPanel: 'ShroudPanel',
  AgentBody: 'RoverBody',
  BeaconCore: 'LodestarCore',
  GlassWall: 'CrystalWall',
  StoneWall: 'BasaltWall',
  VeilWall: 'ShroudWall',
  TraversalControl: 'RouteControl',
  Scanning: 'Surveying',
  Traversing: 'Crossing',
  Inspecting: 'Probing',
  clearance: 'headroom',
  probe: 'sonar',
  scoutZone: 'roverZone',
  goalReached: 'targetReached',
  inspections: 'probes',
  traversals: 'crossings',
};

describe('HSI-IR lowering (Stage A)', () => {
  it('lowers the barrier world into a versioned, digest-bound IR', () => {
    const { source, composition } = loadFixture();
    const ir = lowerCompositionToHSIIR(composition, { sourceText: source });

    expect(ir.schemaVersion).toBe(HSI_IR_SCHEMA_VERSION);
    expect(ir.world.name).toBe('HSCoreBarrierWorld');
    expect(ir.entities.map((e) => e.name).sort()).toEqual([
      'Beacon',
      'GlassPane',
      'Scout',
      'StoneSlab',
      'VeilPanel',
    ]);
    expect(ir.relations).toHaveLength(4);
    expect(ir.state.map((f) => f.key).sort()).toEqual([
      'goalReached',
      'inspections',
      'scoutZone',
      'traversals',
    ]);
    expect(ir.machines).toHaveLength(1);
    expect(ir.machines[0]!.transitions).toHaveLength(4);
    expect(ir.eventHandlers.map((h) => h.event).sort()).toEqual(['on_inspect', 'on_traverse']);
    expect(ir.predicates.map((p) => p.kind).sort()).toEqual([
      'invariant',
      'invariant',
      'precondition',
    ]);

    // Digest custody: recomputing over the digest-free document reproduces it.
    const { provenance, ...rest } = ir;
    const recomputed = hsiSha256({ ...rest, provenance: { compiler: provenance.compiler } });
    expect(provenance.deterministicDigest).toBe(recomputed);
  });

  it('preserves three-state opacity: transparent, opaque, and ABSENT stays unknown', () => {
    const { composition } = loadFixture();
    const ir = lowerCompositionToHSIIR(composition);
    const opacity = Object.fromEntries(ir.entities.map((e) => [e.name, e.opacity]));
    expect(opacity['GlassPane']).toBe('transparent');
    expect(opacity['StoneSlab']).toBe('opaque');
    expect(opacity['VeilPanel']).toBe('unknown');
  });

  it('derives the observation policy with gap-aware access verdicts', () => {
    const { composition } = loadFixture();
    const ir = lowerCompositionToHSIIR(composition);
    const rule = ir.observationPolicy.find((r) => r.id === 'obs:Scout->Beacon');
    expect(rule).toBeDefined();
    expect(rule!.access).toBe('blocked');
    expect(rule!.mediators).toEqual(['GlassPane', 'StoneSlab', 'VeilPanel']);
  });

  it('lowers contract clauses through the fail-closed expression parser', () => {
    const { composition } = loadFixture();
    const ir = lowerCompositionToHSIIR(composition);
    const invariant = ir.predicates.find((p) => p.id === 'invariant:bounded_traversals');
    expect(invariant).toBeDefined();
    expect(invariant!.reads).toEqual(['traversals']);
    expect(invariant!.expression.kind).toBe('BinaryExpression');
  });
});

describe('fail-closed admission', () => {
  it('rejects an empty world', () => {
    const { composition } = loadFixture();
    const empty = {
      ...structuredClone(composition),
      templates: [],
      objects: [],
      state: undefined,
      stateMachines: [],
      contract: undefined,
    } as unknown as HoloComposition;
    (empty as HoloComposition & { connections?: unknown[] }).connections = [];
    (empty as HoloComposition & { logic?: unknown }).logic = undefined;
    expect(() => lowerCompositionToHSIIR(empty)).toThrowError(HSIAdmissionError);
  });

  it('rejects a non-composition input', () => {
    expect(() => lowerCompositionToHSIIR({} as HoloComposition)).toThrowError(/empty-world/);
  });

  it('rejects an object using a missing template', () => {
    const { composition } = loadFixture();
    const skewed = structuredClone(composition);
    skewed.objects[0]!.template = 'GhostTemplate';
    expect(() => lowerCompositionToHSIIR(skewed)).toThrowError(/unknown-archetype/);
  });

  it('rejects a relation to an undeclared entity', () => {
    const { composition } = loadFixture();
    const skewed = structuredClone(composition) as HoloComposition & {
      connections?: { from: string; to: string }[];
    };
    skewed.connections = [...(skewed.connections ?? []), { from: 'Scout', to: 'Nowhere' }];
    expect(() => lowerCompositionToHSIIR(skewed)).toThrowError(/unknown-relation-endpoint/);
  });

  it('rejects a guard reading an undeclared slot', () => {
    const { composition } = loadFixture();
    const skewed = structuredClone(composition);
    const machine = skewed.stateMachines[0]!;
    machine.inputs = (machine.inputs ?? []).filter((i) => i.name !== 'clearance');
    expect(() => lowerCompositionToHSIIR(skewed)).toThrowError(/unknown-slot/);
  });

  it('rejects a handler assigning an undeclared state key', () => {
    const { composition } = loadFixture();
    const skewed = structuredClone(composition);
    skewed.state!.properties = skewed.state!.properties.filter((p) => p.key !== 'traversals');
    expect(() => lowerCompositionToHSIIR(skewed)).toThrowError(HSIAdmissionError);
  });
});

describe('exact trace', () => {
  it('produces the expected deterministic trace for the nominal scenario', () => {
    const { source, composition } = loadFixture();
    const ir = lowerCompositionToHSIIR(composition, { sourceText: source });
    const trace = runExactTrace(ir, SCENARIO);

    expect(trace.schemaVersion).toBe(HSI_TRACE_SCHEMA_VERSION);
    expect(trace.valid).toBe(true);
    expect(trace.preconditionResults).toEqual([
      { id: 'precondition:no_prior_traversals', holds: true },
    ]);

    // Step 0: probe trigger fires Scanning -> Inspecting.
    expect(trace.steps[0]!.transitions).toHaveLength(1);
    expect(trace.steps[0]!.transitions[0]!.to).toBe('Inspecting');
    // Step 3: clearance 0.9 fires Scanning -> Traversing.
    expect(trace.steps[3]!.transitions[0]!.to).toBe('Traversing');
    // Step 4: on_traverse applies three recorded effects with before/after custody.
    const effects = trace.steps[4]!.effects;
    expect(effects.map((e) => `${e.target}:${e.before}->${e.after}`)).toEqual([
      'traversals:0->1',
      'scoutZone:west->east',
      'goalReached:false->true',
    ]);

    expect(trace.final.state).toEqual({
      goalReached: true,
      inspections: 1,
      scoutZone: 'east',
      traversals: 1,
    });
    expect(trace.final.machineStates).toEqual({ TraversalControl: 'Scanning' });
    expect(trace.steps.every((s) => s.invariantViolations.length === 0)).toBe(true);
  });

  it('fails closed on scenario steps addressing unknown inputs or events', () => {
    const { composition } = loadFixture();
    const ir = lowerCompositionToHSIIR(composition);
    expect(() =>
      runExactTrace(ir, [
        { kind: 'set-input', machine: 'TraversalControl', input: 'nope', value: 1 },
      ])
    ).toThrowError(/unknown-slot/);
    expect(() => runExactTrace(ir, [{ kind: 'fire-event', event: 'on_nothing' }])).toThrowError(
      /unknown-slot/
    );
  });
});

describe('metamorphic and counterfactual behavior', () => {
  it('independent-declaration reorder yields a byte-identical IR', () => {
    const { source, composition } = loadFixture();
    const base = lowerCompositionToHSIIR(structuredClone(composition), { sourceText: source });
    const reordered = structuredClone(composition);
    reorderComposition(reordered);
    const again = lowerCompositionToHSIIR(reordered, { sourceText: source });
    expect(again.provenance.deterministicDigest).toBe(base.provenance.deterministicDigest);
  });

  it('alpha-renaming preserves the trace modulo names (via the audit verifier)', () => {
    const { source, composition } = loadFixture();
    const manifest = runHSIAudit({
      composition,
      sourceText: source,
      scenario: SCENARIO,
      renameMap: RENAME_MAP,
    });
    const renameCheck = manifest.checks.find((c) => c.caseId === 'audit:alpha-rename');
    expect(renameCheck?.status).toBe('pass');
  });

  it('one opacity intervention changes the observation verdict (blocked -> unknown)', () => {
    const { composition } = loadFixture();
    const base = lowerCompositionToHSIIR(structuredClone(composition));
    const intervened = structuredClone(composition);
    applyIntervention(intervened, {
      id: 'intervention:flip-opacity',
      kind: 'set-opacity',
      entity: 'StoneSlab',
      opaque: false,
    });
    const ir = lowerCompositionToHSIIR(intervened);
    expect(base.observationPolicy.find((r) => r.id === 'obs:Scout->Beacon')!.access).toBe(
      'blocked'
    );
    // VeilPanel's ABSENT opacity now dominates: the verdict degrades to unknown, not visible.
    expect(ir.observationPolicy.find((r) => r.id === 'obs:Scout->Beacon')!.access).toBe('unknown');
  });

  it('one guard intervention changes the exact trace at the predicted step', () => {
    const { source, composition } = loadFixture();
    const base = runExactTrace(
      lowerCompositionToHSIIR(structuredClone(composition), { sourceText: source }),
      SCENARIO
    );
    const intervened = structuredClone(composition);
    applyIntervention(intervened, {
      id: 'intervention:raise-guard-threshold',
      kind: 'set-guard-literal',
      machine: 'TraversalControl',
      fromState: 'Scanning',
      toState: 'Traversing',
      value: 1e6,
    });
    const trace = runExactTrace(
      lowerCompositionToHSIIR(intervened, { sourceText: source }),
      SCENARIO
    );
    expect(trace.deterministicDigest).not.toBe(base.deterministicDigest);
    expect(base.steps[3]!.transitions).toHaveLength(1);
    expect(trace.steps[3]!.transitions).toHaveLength(0);
    expect(trace.final.machineStates).toEqual({ TraversalControl: 'Scanning' });
  });

  it('renameComposition + reorderComposition compose without breaking admission', () => {
    const { composition } = loadFixture();
    const transformed = structuredClone(composition);
    renameComposition(transformed, RENAME_MAP);
    reorderComposition(transformed);
    const ir = lowerCompositionToHSIIR(transformed);
    expect(ir.entities.map((e) => e.name).sort()).toEqual([
      'BasaltSlab',
      'CrystalPane',
      'Lodestar',
      'Pathfinder',
      'ShroudPanel',
    ]);
  });
});

describe('regeneration determinism', () => {
  it('parse -> lower -> trace twice from the same source is byte-identical', () => {
    const source = readFileSync(FIXTURE_PATH, 'utf8');
    const runOnce = () => {
      const ir = lowerCompositionToHSIIR(parseHoloStrict(source), { sourceText: source });
      const trace = runExactTrace(ir, SCENARIO);
      const graph = projectLearningGraph(ir);
      return { ir: JSON.stringify(ir), trace: JSON.stringify(trace), graph: JSON.stringify(graph) };
    };
    const first = runOnce();
    const second = runOnce();
    expect(second.ir).toBe(first.ir);
    expect(second.trace).toBe(first.trace);
    expect(second.graph).toBe(first.graph);
  });
});

describe('LearningGraph projection', () => {
  it('emits typed nodes/edges with stable ids, splits, and unknown markers', () => {
    const { source, composition } = loadFixture();
    const ir = lowerCompositionToHSIIR(composition, { sourceText: source });
    const graph = projectLearningGraph(ir);

    expect(graph.schemaVersion).toBe(HSI_LEARNING_GRAPH_SCHEMA_VERSION);
    expect(graph.worldDigest).toBe(ir.provenance.deterministicDigest);

    const veil = graph.nodes.find((n) => n.id === 'entity:VeilPanel');
    expect(veil?.unknowns).toEqual(['opacity']);

    const observes = graph.edges.find(
      (e) => e.edgeType === 'observes' && e.from === 'entity:Scout'
    );
    expect(observes?.label).toBe('blocked');

    const affects = graph.edges.filter(
      (e) => e.edgeType === 'affects' && e.from === 'event:on_traverse'
    );
    expect(affects.map((e) => e.to).sort()).toEqual([
      'state:world.goalReached',
      'state:world.scoutZone',
      'state:world.traversals',
    ]);

    expect(graph.nodes.every((n) => n.split === 'train' || n.split === 'eval')).toBe(true);
    expect(new Set(graph.nodes.map((n) => n.id)).size).toBe(graph.nodes.length);
  });
});

describe('audit manifest', () => {
  it('all declared audit cases pass and the manifest digest is recomputable', () => {
    const { source, composition } = loadFixture();
    const manifest = runHSIAudit({
      composition,
      sourceText: source,
      scenario: SCENARIO,
      renameMap: RENAME_MAP,
    });

    expect(manifest.schemaVersion).toBe(HSI_AUDIT_SCHEMA_VERSION);
    const byCase = Object.fromEntries(manifest.checks.map((c) => [c.caseId, c.status]));
    expect(byCase).toEqual({
      'audit:admission-empty': 'pass',
      'audit:admission-missing-archetype': 'pass',
      'audit:admission-dangling-relation': 'pass',
      'audit:alpha-rename': 'pass',
      'audit:declaration-reorder': 'pass',
      'audit:regenerate-determinism': 'pass',
      'audit:counterfactual-opacity': 'pass',
      'audit:counterfactual-guard': 'pass',
    });
    expect(manifest.overall).toBe('pass');

    const { deterministicDigest, ...rest } = manifest;
    expect(hsiSha256(rest)).toBe(deterministicDigest);
  });
});

describe('HSIIRCompiler (CompilerBase wrapper)', () => {
  it('compileToFiles emits deterministic hsi-ir.json', () => {
    const { source, composition } = loadFixture();
    const compiler = new HSIIRCompiler({ sourceText: source });
    const files = compiler.compileToFiles(composition);
    expect(Object.keys(files)).toEqual(['hsi-ir.json']);
    const parsed = JSON.parse(files['hsi-ir.json']!);
    expect(parsed.schemaVersion).toBe(HSI_IR_SCHEMA_VERSION);
    expect(parsed.kind).toBe('HSIIR');
  });
});
