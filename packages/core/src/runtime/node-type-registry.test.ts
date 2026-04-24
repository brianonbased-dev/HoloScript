/**
 * Unit tests for node-type-registry — BUILD/AUDIT-mode coverage.
 *
 * Closes the follow-up flagged in `2026-04-23_monolith-split-discipline-
 * W1-T4-addendum-slices-30-34.md` §6: "A dedicated node-type-registry.test.ts
 * would be trivially passing — 'given handler in the map, calling
 * dispatchNode routes there' — without adding meaningful coverage.
 * Alternative: a test asserting all current node.type values have
 * registered handlers (audit-drift detector). Worth filing as a follow-up."
 *
 * This file ships BOTH:
 *   (a) the trivial-but-required dispatch-mechanism tests
 *   (b) the audit-drift detector cross-referencing the executeNode
 *       switch-case set against NODE_TYPE_HANDLERS
 *
 * **See**: packages/core/src/runtime/node-type-registry.ts (slice 34)
 *         research/2026-04-23_monolith-split-discipline-W1-T4-addendum-slices-30-34.md §6
 */

import { describe, it, expect, vi } from 'vitest';
import {
  dispatchNode,
  NODE_TYPE_HANDLERS,
  type RuntimeDispatcher,
} from './node-type-registry';
import type { ASTNode } from '../parser/types';

// ──────────────────────────────────────────────────────────────────
// Minimal stub RuntimeDispatcher — every method is a no-op stub. The
// tests in this file focus on DISPATCH BEHAVIOR, not the downstream
// executors (those are tested in their own module test files).
// ──────────────────────────────────────────────────────────────────

function makeStubRuntime(): RuntimeDispatcher {
  const okResult = async () => ({ success: true, output: 'stub' });
  return {
    buildOrbExecutorContext: vi.fn(() => ({}) as never),
    buildNarrativeContext: vi.fn(() => ({
      quests: new Map(),
      setActiveQuestId: vi.fn(),
      setDialogueState: vi.fn(),
    }) as never),
    buildGraphExecutorContext: vi.fn(() => ({}) as never),
    buildSimpleExecutorContext: vi.fn(() => ({}) as never),
    buildInfoExecutorContext: vi.fn(() => ({}) as never),
    buildHoloCompositionContext: vi.fn(() => ({}) as never),
    buildHoloObjectContext: vi.fn(() => ({}) as never),
    executeForLoop: vi.fn(okResult),
    executeForEachLoop: vi.fn(okResult),
    executeWhileLoop: vi.fn(okResult),
    executeIfStatement: vi.fn(okResult),
    executeMatch: vi.fn(okResult),
    executeMemory: vi.fn(okResult),
    executeMemoryDefinition: vi.fn(okResult),
    executeGeneric: vi.fn(okResult),
    executeTemplate: vi.fn(okResult),
    executeServerNode: vi.fn(okResult),
    executeDatabaseNode: vi.fn(okResult),
    executeFetchNode: vi.fn(okResult),
    executeTarget: vi.fn(okResult),
    executeStateDeclaration: vi.fn(okResult),
    executeDebug: vi.fn(okResult),
    context: { environment: {} },
  } as never;
}

// ──────────────────────────────────────────────────────────────────
// Dispatch mechanism
// ──────────────────────────────────────────────────────────────────

describe('dispatchNode — unknown node type', () => {
  it('returns error result without throwing', async () => {
    const runtime = makeStubRuntime();
    const result = await dispatchNode(
      { type: 'totally-invented-type' } as ASTNode,
      runtime,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown node type');
    expect(result.error).toContain('totally-invented-type');
  });

  it('does NOT throw on null/undefined node.type', async () => {
    const runtime = makeStubRuntime();
    const result = await dispatchNode({ type: undefined } as never, runtime);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown node type');
  });
});

describe('dispatchNode — delegates to registered handlers', () => {
  it('for-loop node calls runtime.executeForLoop', async () => {
    const runtime = makeStubRuntime();
    await dispatchNode(
      { type: 'for', variable: 'i', iterable: 'arr', body: [] } as ASTNode,
      runtime,
    );
    expect(runtime.executeForLoop).toHaveBeenCalledTimes(1);
  });

  it('while node calls runtime.executeWhileLoop', async () => {
    const runtime = makeStubRuntime();
    await dispatchNode({ type: 'while', condition: 'x', body: [] } as ASTNode, runtime);
    expect(runtime.executeWhileLoop).toHaveBeenCalledTimes(1);
  });

  it('match node calls runtime.executeMatch', async () => {
    const runtime = makeStubRuntime();
    await dispatchNode({ type: 'match', subject: 'x', cases: [] } as ASTNode, runtime);
    expect(runtime.executeMatch).toHaveBeenCalledTimes(1);
  });

  it('if node calls runtime.executeIfStatement', async () => {
    const runtime = makeStubRuntime();
    await dispatchNode(
      { type: 'if', condition: 'true', body: [] } as ASTNode,
      runtime,
    );
    expect(runtime.executeIfStatement).toHaveBeenCalledTimes(1);
  });

  it('memory node calls runtime.executeMemory', async () => {
    const runtime = makeStubRuntime();
    await dispatchNode({ type: 'memory' } as ASTNode, runtime);
    expect(runtime.executeMemory).toHaveBeenCalledTimes(1);
  });

  it('debug node calls runtime.executeDebug', async () => {
    const runtime = makeStubRuntime();
    await dispatchNode({ type: 'debug', target: 't' } as ASTNode, runtime);
    expect(runtime.executeDebug).toHaveBeenCalledTimes(1);
  });

  it('generic node calls runtime.executeGeneric', async () => {
    const runtime = makeStubRuntime();
    await dispatchNode({ type: 'generic' } as ASTNode, runtime);
    expect(runtime.executeGeneric).toHaveBeenCalledTimes(1);
  });
});

describe('dispatchNode — migration returns plain success', () => {
  it('does NOT call any runtime method', async () => {
    const runtime = makeStubRuntime();
    const result = await dispatchNode({ type: 'migration' } as ASTNode, runtime);
    expect(result.success).toBe(true);
    expect(result.output).toBe('Migration block registered');
    // No delegate called
    expect(runtime.executeMemory).not.toHaveBeenCalled();
    expect(runtime.executeGeneric).not.toHaveBeenCalled();
  });
});

describe('dispatchNode — capitalization-sensitive dispatch decision (composition/Composition, template/Template)', () => {
  // These tests verify the DISPATCH DECISION (which context builder fires)
  // not the downstream executor's output. The pure executors would crash
  // on empty-stub contexts, so we catch the expected failure and assert
  // only on the builder invocation.
  async function dispatchSafe(node: ASTNode, runtime: RuntimeDispatcher): Promise<void> {
    await dispatchNode(node, runtime).catch(() => void 0);
  }

  it('lowercase composition dispatches via executeCompositionPure (simple-executors path)', async () => {
    const runtime = makeStubRuntime();
    await dispatchSafe(
      { type: 'composition', name: 'c', children: [] } as ASTNode,
      runtime,
    );
    expect(runtime.buildSimpleExecutorContext).toHaveBeenCalled();
    expect(runtime.buildHoloCompositionContext).not.toHaveBeenCalled();
  });

  it('uppercase Composition dispatches via executeHoloCompositionPure (Holo path)', async () => {
    const runtime = makeStubRuntime();
    await dispatchSafe(
      { type: 'Composition', name: 'c', templates: [], objects: [] } as ASTNode,
      runtime,
    );
    expect(runtime.buildHoloCompositionContext).toHaveBeenCalled();
  });

  it('lowercase template delegates to runtime.executeTemplate', async () => {
    const runtime = makeStubRuntime();
    await dispatchSafe({ type: 'template', name: 't' } as ASTNode, runtime);
    expect(runtime.executeTemplate).toHaveBeenCalled();
  });

  it('uppercase Template dispatches via executeHoloTemplatePure (simple-executors, not runtime.executeTemplate)', async () => {
    const runtime = makeStubRuntime();
    await dispatchSafe({ type: 'Template', name: 'T' } as ASTNode, runtime);
    expect(runtime.buildSimpleExecutorContext).toHaveBeenCalled();
    expect(runtime.executeTemplate).not.toHaveBeenCalled();
  });
});

describe('dispatchNode — dual aliases (orb/object, method/function, nexus/building)', () => {
  async function dispatchSafe(node: ASTNode, runtime: RuntimeDispatcher): Promise<void> {
    await dispatchNode(node, runtime).catch(() => void 0);
  }

  it('orb and object both trigger buildOrbExecutorContext', async () => {
    const runtime = makeStubRuntime();
    await dispatchSafe({ type: 'orb', name: 'a' } as ASTNode, runtime);
    await dispatchSafe({ type: 'object', name: 'b' } as ASTNode, runtime);
    expect(runtime.buildOrbExecutorContext).toHaveBeenCalledTimes(2);
  });

  it('method and function both trigger buildGraphExecutorContext', async () => {
    const runtime = makeStubRuntime();
    await dispatchSafe({ type: 'method', name: 'f1' } as ASTNode, runtime);
    await dispatchSafe({ type: 'function', name: 'f2' } as ASTNode, runtime);
    expect(runtime.buildGraphExecutorContext).toHaveBeenCalledTimes(2);
  });

  it('nexus and building both dispatch via executeStructurePure (no context builder, no delegate)', async () => {
    const runtime = makeStubRuntime();
    await dispatchSafe({ type: 'nexus' } as ASTNode, runtime);
    await dispatchSafe({ type: 'building' } as ASTNode, runtime);
    // Pure structural executor — no builder, no runtime delegate
    expect(runtime.buildSimpleExecutorContext).not.toHaveBeenCalled();
    expect(runtime.buildGraphExecutorContext).not.toHaveBeenCalled();
    expect(runtime.executeGeneric).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────
// AUDIT DRIFT DETECTOR — the key follow-up from the addendum.
//
// Any node.type that executeNode in HSR recognized in its switch
// statement must be registered in NODE_TYPE_HANDLERS. If a peer adds
// a new case to executeNode without a registry entry, this test
// flags it as drift.
// ──────────────────────────────────────────────────────────────────

describe('AUDIT drift detector — known node types coverage', () => {
  /**
   * CANONICAL NODE TYPES observed in the HSR switch statement as of
   * slice 34. Update this set when new node types are legitimately
   * added to the runtime. A failure here means either the new type
   * needs a handler added to NODE_TYPE_HANDLERS, or this list needs
   * updating to match.
   */
  const CANONICAL_NODE_TYPES = [
    // Orb / object
    'orb', 'object',
    // Narrative
    'narrative', 'quest', 'dialogue', 'visual_metadata',
    // Graph
    'method', 'function', 'connection', 'gate', 'stream',
    // Simple / expression
    'call', 'assignment', 'return', 'expression-statement',
    'scale', 'focus', 'environment',
    // Info / UI
    'visualize', '2d-element',
    // Structure
    'nexus', 'building',
    // Capitalization-sensitive
    'composition', 'Composition', 'template', 'Template',
    // State
    'state-machine', 'state-declaration',
    // System
    'system', 'core_config',
    // Migration (plain success)
    'migration',
    // IO
    'server', 'database', 'fetch', 'execute',
    // Memory
    'memory', 'semantic-memory', 'episodic-memory', 'procedural-memory',
    // Control flow
    'for', 'forEach', 'while', 'if', 'match',
    // Debug + generic
    'debug', 'generic',
  ];

  it('every canonical node type has a registered handler', () => {
    const missing = CANONICAL_NODE_TYPES.filter((t) => !(t in NODE_TYPE_HANDLERS));
    expect(missing).toEqual([]); // empty = all covered
  });

  it('registry does not carry entries for unknown types (catches spurious additions)', () => {
    const registryKeys = Object.keys(NODE_TYPE_HANDLERS);
    const unknown = registryKeys.filter((k) => !CANONICAL_NODE_TYPES.includes(k));
    // If this fails, either a peer added a new legitimate type (update
    // CANONICAL_NODE_TYPES above) or there's a stale entry to remove.
    expect(unknown).toEqual([]);
  });

  it('registry has exactly CANONICAL_NODE_TYPES.length entries', () => {
    expect(Object.keys(NODE_TYPE_HANDLERS).length).toBe(CANONICAL_NODE_TYPES.length);
  });
});
