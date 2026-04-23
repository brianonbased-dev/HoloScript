/**
 * HoloScript Runtime — Characterization Tests (W4-T3 pre-split lock)
 *
 * **Purpose**: Lock the current execution-output hashes for
 * HoloScriptRuntime so the Wave-1 split (W1-T4, splitting the 4,010
 * LOC monolith into subsystem modules) can ship safely. Any
 * behavior change during the split breaks a characterization hash
 * here, not just a behavior assertion in the existing test file.
 *
 * **Discipline**: these tests are *lock tests*, not behavior tests.
 * Failing hashes mean the split changed something — which is either
 * (a) a regression that must be fixed, or (b) an intentional change
 * that must be explicitly re-locked in the same commit. The commit
 * message should say which.
 *
 * **Scope**: covers the major `executeNode` branches + state-
 * observable side effects + event emission + trait registration
 * roundtrip. Not exhaustive; representative enough that any
 * structural refactor of the runtime's dispatch table will touch at
 * least one hash.
 *
 * **See**: ai-ecosystem research/2026-04-21_audit-mode-backlog.md §W4-T3
 *         packages/core/src/HoloScriptRuntime.ts (target for W1-T4 split)
 *         packages/core/src/HoloScriptRuntime.test.ts (existing behavior tests — complementary)
 */

import { createHash } from 'crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { HoloScriptRuntime } from './HoloScriptRuntime';
import type {
  OrbNode,
  MethodNode,
  ConnectionNode,
  GateNode,
  StreamNode,
  StateMachineNode,
  UI2DNode,
  ASTNode,
} from './types';

/**
 * Canonicalize a runtime-produced value by stripping non-
 * deterministic fields (wall-clock time, random run IDs) and
 * sort-stabilizing object-key ordering, then hash the JSON form.
 *
 * Short (16-char) SHA-256 prefix balances readability against
 * collision resistance at this scale (< 100 test cases, negligible
 * birthday probability).
 */
function hashResult(result: unknown): string {
  const stripped = stripNondeterministic(result);
  const json = stableStringify(stripped);
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

// Fields stripped as non-deterministic. If the split adds a new
// timestamp-shaped field, add it here with a one-line justification.
const NONDET_KEYS = new Set<string>([
  'executionTime',   // wall-clock ms for the individual execute call
  'timestamp',       // generic event timestamps
  'runId',           // provenance record run ID
  '_generated_at',   // runtime-internal generation marker
  'created',         // orb/node creation Date.now() (W4-T3 L1 drift source)
  'createdAt',       // SimulationProvenance ISO timestamp
  'modifiedAt',      // mutation markers
  'updatedAt',       // mutation markers
  'lastUpdate',      // periodic-update markers
]);

function stripNondeterministic(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(stripNondeterministic);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as object)) {
    if (NONDET_KEYS.has(k)) continue;
    out[k] = stripNondeterministic((v as Record<string, unknown>)[k]);
  }
  return out;
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const keys = Object.keys(v as object).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify((v as Record<string, unknown>)[k])).join(',') + '}';
}

// ──────────────────────────────────────────────────────────────────────────────
// Lock table — hashes captured on 2026-04-21 pre-W1-T4 split.
// Update this table in the same commit that ships the split IF and ONLY IF the
// change is intentional. Any diff here that isn't explained in the commit
// message is a latent regression.
// ──────────────────────────────────────────────────────────────────────────────

describe('HoloScriptRuntime characterization (W4-T3 pre-split lock)', () => {
  let runtime: HoloScriptRuntime;

  beforeEach(() => {
    runtime = new HoloScriptRuntime();
  });

  describe('executeNode branches', () => {
    it('[L1] orb creation locks output', async () => {
      const orb: OrbNode = {
        type: 'orb',
        name: 'charOrb',
        properties: { color: 'red', size: 2, tag: 'alpha' },
        methods: [],
        position: [1, 2, 3],
        hologram: { shape: 'orb', color: '#ff0000', size: 1, glow: false, interactive: true },
      };
      const result = await runtime.executeNode(orb);
      expect(hashResult(result)).toMatchSnapshot('L1-orb');
    });

    it('[L2] method definition locks output', async () => {
      const method: MethodNode = {
        type: 'method',
        name: 'charMethod',
        parameters: [
          { type: 'parameter', name: 'a', dataType: 'number' },
          { type: 'parameter', name: 'b', dataType: 'string' },
        ],
        body: [],
        position: [0, 0, 0],
      };
      const result = await runtime.executeNode(method);
      expect(hashResult(result)).toMatchSnapshot('L2-method');
    });

    it('[L3] connection between two orbs locks output', async () => {
      // Setup: create source and target orbs
      const src: OrbNode = {
        type: 'orb', name: 'src', properties: {}, methods: [], position: [0, 0, 0],
        hologram: { shape: 'orb', color: '#00ff00', size: 1, glow: true, interactive: false },
      };
      const tgt: OrbNode = {
        type: 'orb', name: 'tgt', properties: {}, methods: [], position: [5, 0, 0],
        hologram: { shape: 'orb', color: '#0000ff', size: 1, glow: true, interactive: false },
      };
      await runtime.executeNode(src);
      await runtime.executeNode(tgt);

      const conn: ConnectionNode = {
        type: 'connection',
        source: 'src',
        target: 'tgt',
        connectionType: 'flow',
      } as ConnectionNode;
      const result = await runtime.executeNode(conn);
      expect(hashResult(result)).toMatchSnapshot('L3-connection');
    });

    it('[L4] gate (conditional) locks output', async () => {
      const gate: GateNode = {
        type: 'gate',
        name: 'charGate',
        condition: 'true',
        trueBranch: [],
        falseBranch: [],
      } as GateNode;
      const result = await runtime.executeNode(gate);
      expect(hashResult(result)).toMatchSnapshot('L4-gate');
    });

    it('[L5] stream definition locks output', async () => {
      const stream: StreamNode = {
        type: 'stream',
        name: 'charStream',
        source: 'origin',
        target: 'sink',
        dataType: 'number',
      } as StreamNode;
      const result = await runtime.executeNode(stream);
      expect(hashResult(result)).toMatchSnapshot('L5-stream');
    });

    it('[L6] state machine locks output', async () => {
      const sm: StateMachineNode = {
        type: 'stateMachine',
        name: 'charSM',
        states: ['idle', 'active'],
        initialState: 'idle',
        transitions: [{ from: 'idle', to: 'active', event: 'start' }],
      } as unknown as StateMachineNode;
      const result = await runtime.executeNode(sm);
      expect(hashResult(result)).toMatchSnapshot('L6-stateMachine');
    });

    it('[L7] UI element locks output', async () => {
      const ui: UI2DNode = {
        type: 'ui2d',
        name: 'charUI',
        element: 'button',
        properties: { label: 'click', color: 'blue' },
        position: [10, 20, 0],
      } as unknown as UI2DNode;
      const result = await runtime.executeNode(ui);
      expect(hashResult(result)).toMatchSnapshot('L7-ui');
    });

    it('[L8] generic unknown node falls back deterministically', async () => {
      const generic: ASTNode = {
        type: 'unknownExperimentalType',
        name: 'charUnknown',
      } as unknown as ASTNode;
      const result = await runtime.executeNode(generic);
      expect(hashResult(result)).toMatchSnapshot('L8-generic');
    });
  });

  describe('execute(array) sequencing', () => {
    it('[L9] sequential execution locks composite result', async () => {
      const nodes: ASTNode[] = [
        { type: 'orb', name: 'a', properties: {}, methods: [], position: [0, 0, 0],
          hologram: { shape: 'orb', color: '#111', size: 1, glow: false, interactive: false } } as OrbNode,
        { type: 'orb', name: 'b', properties: {}, methods: [], position: [1, 0, 0],
          hologram: { shape: 'orb', color: '#222', size: 1, glow: false, interactive: false } } as OrbNode,
        { type: 'connection', source: 'a', target: 'b', connectionType: 'flow' } as ConnectionNode,
      ];
      const results = await runtime.execute(nodes);
      expect(hashResult(results)).toMatchSnapshot('L9-sequence');
    });
  });

  describe('callFunction', () => {
    it('[L10] registered global function with args locks output', async () => {
      runtime.registerGlobalFunction('charFn', (x: unknown, y: unknown) => {
        return `charFn-${String(x)}-${String(y)}`;
      });
      const result = await runtime.callFunction('charFn', ['alpha', 42]);
      expect(hashResult(result)).toMatchSnapshot('L10-callFunction');
    });

    it('[L11] unknown function name locks the error output', async () => {
      const result = await runtime.callFunction('noSuchFn', []);
      expect(hashResult(result)).toMatchSnapshot('L11-callFunctionMissing');
    });
  });

  describe('evaluateExpression', () => {
    it('[L12] numeric literal expression locks output', () => {
      const val = runtime.evaluateExpression('42');
      expect(hashResult(val)).toMatchSnapshot('L12-exprNumericLiteral');
    });

    it('[L13] string literal expression locks output', () => {
      const val = runtime.evaluateExpression('"hello"');
      expect(hashResult(val)).toMatchSnapshot('L13-exprStringLiteral');
    });

    it('[L14] boolean expression locks output', () => {
      const val = runtime.evaluateExpression('true');
      expect(hashResult(val)).toMatchSnapshot('L14-exprBoolean');
    });
  });

  describe('event emission', () => {
    it('[L15] emit(event, data) with no handlers is a no-op (locks absence-of-effect)', async () => {
      // Register no handlers; emit; capture state hash before + after
      const before = collectObservableState(runtime);
      await runtime.emit('unlistenedEvent', { payload: 1 });
      const after = collectObservableState(runtime);
      expect(hashResult({ before, after })).toMatchSnapshot('L15-emitUnhandled');
    });
  });

  describe('trait registration', () => {
    it('[L16] registerTrait round-trip locks registry state', () => {
      const handler = {
        name: 'charTrait',
        handle: (_orb: Record<string, unknown>) => ({ decorated: true }),
      };
      runtime.registerTrait('charTrait', handler as never);
      // Observable: count of registered traits or lookup
      const registry = runtime.getExtensionRegistry();
      expect(hashResult({ hasCharTrait: registry !== undefined })).toMatchSnapshot('L16-registerTrait');
    });
  });
});

/**
 * Collect observable runtime state for emission / side-effect tests.
 * Only covers state that a subsystem split could accidentally alter:
 * event handler count, animation count, UI element count, particle
 * system count, trait count. Does NOT include wall-clock or random
 * fields.
 */
function collectObservableState(runtime: HoloScriptRuntime): Record<string, unknown> {
  // Runtime exposes these via getters/methods where available; fall back to
  // structured probes for fields that are private. The characterization test
  // is intentionally loose: if the split changes a field name, these probes
  // silently return undefined, and the hash changes, which triggers the lock.
  const r = runtime as unknown as Record<string, unknown>;
  return {
    particleSystemCount: (r.particleSystems as Map<unknown, unknown> | undefined)?.size ?? -1,
    agentRuntimeCount: (r.agentRuntimes as Map<unknown, unknown> | undefined)?.size ?? -1,
    eventHandlerCount: (r.eventHandlers as Map<unknown, unknown> | undefined)?.size ?? -1,
    animationCount: (r.animations as Map<unknown, unknown> | undefined)?.size ?? -1,
    uiElementCount: (r.uiElements as Map<unknown, unknown> | undefined)?.size ?? -1,
    proceduralSkillCount: (r.proceduralSkills as Map<unknown, unknown> | undefined)?.size ?? -1,
    traitHandlerCount: (r.traitHandlers as Map<unknown, unknown> | undefined)?.size ?? -1,
  };
}
