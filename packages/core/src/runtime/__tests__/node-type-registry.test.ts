/**
 * node-type-registry.test.ts — unit tests for NODE_TYPE_HANDLERS and dispatchNode.
 *
 * Tests verify:
 *  - NODE_TYPE_HANDLERS is a non-empty record containing expected keys
 *  - Each category of handler calls the expected pure executor or runtime method
 *  - Capitalization-sensitive branches (composition/Composition, template/Template)
 *  - migration returns a plain success record without calling any executor
 *  - Context-free nodes (visual_metadata, nexus, building, system) don't call runtime build*
 *  - dispatchNode unknown type returns error result
 *  - dispatchNode known type delegates correctly
 *
 * Pure executors are vi.mock'd to return {success:true,output:'mocked'}.
 * The RuntimeDispatcher is a hand-crafted stub.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── mock all imported pure executors ────────────────────────────────────────

vi.mock('../orb-executor.js', () => ({
  executeOrb: vi.fn(async () => ({ success: true, output: 'orb-mocked' })),
}));

vi.mock('../narrative-executors.js', () => ({
  executeNarrative: vi.fn(async () => ({ success: true, output: 'narrative-mocked' })),
  executeQuest: vi.fn(async () => ({ success: true, output: 'quest-mocked' })),
  executeDialogue: vi.fn(async () => ({ success: true, output: 'dialogue-mocked' })),
}));

vi.mock('../graph-executors.js', () => ({
  executeFunction: vi.fn(async () => ({ success: true, output: 'function-mocked' })),
  executeConnection: vi.fn(async () => ({ success: true, output: 'connection-mocked' })),
  executeGate: vi.fn(async () => ({ success: true, output: 'gate-mocked' })),
  executeStream: vi.fn(async () => ({ success: true, output: 'stream-mocked' })),
}));

vi.mock('../simple-executors.js', () => ({
  executeCall: vi.fn(async () => ({ success: true, output: 'call-mocked' })),
  executeAssignment: vi.fn(async () => ({ success: true, output: 'assign-mocked' })),
  executeReturn: vi.fn(async () => ({ success: true, output: 'return-mocked' })),
  executeExpressionStatement: vi.fn(async () => ({ success: true, output: 'expr-mocked' })),
  executeScale: vi.fn(async () => ({ success: true, output: 'scale-mocked' })),
  executeFocus: vi.fn(async () => ({ success: true, output: 'focus-mocked' })),
  executeEnvironment: vi.fn(async () => ({ success: true, output: 'env-mocked' })),
  executeComposition: vi.fn(async () => ({ success: true, output: 'composition-mocked' })),
  executeStateMachine: vi.fn(async () => ({ success: true, output: 'sm-mocked' })),
  executeStructure: vi.fn(async () => ({ success: true, output: 'structure-mocked' })),
  executeHoloTemplate: vi.fn(async () => ({ success: true, output: 'holo-template-mocked' })),
}));

vi.mock('../info-executors.js', () => ({
  executeVisualize: vi.fn(async () => ({ success: true, output: 'visualize-mocked' })),
  executeUIElement: vi.fn(async () => ({ success: true, output: 'ui-mocked' })),
}));

vi.mock('../holo-composition-executor.js', () => ({
  executeHoloComposition: vi.fn(async () => ({ success: true, output: 'holo-comp-mocked' })),
}));

vi.mock('../system-executors.js', () => ({
  executeSystem: vi.fn(async () => ({ success: true, output: 'system-mocked' })),
  executeCoreConfig: vi.fn(async () => ({ success: true, output: 'core-config-mocked' })),
  executeVisualMetadata: vi.fn(async () => ({ success: true, output: 'visual-metadata-mocked' })),
}));

// ─── imports (after mocks) ───────────────────────────────────────────────────

import { NODE_TYPE_HANDLERS, dispatchNode } from '../node-type-registry.js';
import type { RuntimeDispatcher } from '../node-type-registry.js';

// ─── helper: RuntimeDispatcher stub ──────────────────────────────────────────

const MOCK_RESULT = { success: true as const, output: 'delegated' };

function makeRuntime(): RuntimeDispatcher {
  return {
    buildOrbExecutorContext: vi.fn(() => ({})),
    buildNarrativeContext: vi.fn(() => ({})),
    buildGraphExecutorContext: vi.fn(() => ({})),
    buildSimpleExecutorContext: vi.fn(() => ({})),
    buildInfoExecutorContext: vi.fn(() => ({})),
    buildHoloCompositionContext: vi.fn(() => ({})),
    buildHoloObjectContext: vi.fn(() => ({})),
    executeForLoop: vi.fn(async () => MOCK_RESULT),
    executeForEachLoop: vi.fn(async () => MOCK_RESULT),
    executeWhileLoop: vi.fn(async () => MOCK_RESULT),
    executeIfStatement: vi.fn(async () => MOCK_RESULT),
    executeMatch: vi.fn(async () => MOCK_RESULT),
    executeMemory: vi.fn(async () => MOCK_RESULT),
    executeMemoryDefinition: vi.fn(async () => MOCK_RESULT),
    executeGeneric: vi.fn(async () => MOCK_RESULT),
    executeTemplate: vi.fn(async () => MOCK_RESULT),
    executeServerNode: vi.fn(async () => MOCK_RESULT),
    executeDatabaseNode: vi.fn(async () => MOCK_RESULT),
    executeFetchNode: vi.fn(async () => MOCK_RESULT),
    executeTarget: vi.fn(async () => MOCK_RESULT),
    executeStateDeclaration: vi.fn(async () => MOCK_RESULT),
    executeDebug: vi.fn(async () => MOCK_RESULT),
    context: { environment: {} },
  } as unknown as RuntimeDispatcher;
}

function node(type: string, extra: Record<string, unknown> = {}): import('../../parser/types.js').ASTNode {
  return { type, ...extra } as unknown as import('../../parser/types.js').ASTNode;
}

// ─── NODE_TYPE_HANDLERS structure ────────────────────────────────────────────

describe('NODE_TYPE_HANDLERS', () => {
  it('is a non-empty record', () => {
    expect(typeof NODE_TYPE_HANDLERS).toBe('object');
    expect(Object.keys(NODE_TYPE_HANDLERS).length).toBeGreaterThan(10);
  });

  it('contains expected keys', () => {
    const required = [
      'orb', 'object', 'narrative', 'quest', 'dialogue', 'visual_metadata',
      'method', 'function', 'connection', 'gate', 'stream',
      'call', 'assignment', 'return', 'expression-statement',
      'scale', 'focus', 'environment',
      'visualize', '2d-element',
      'nexus', 'building',
      'composition', 'Composition',
      'template', 'Template',
      'state-machine', 'state-declaration',
      'system', 'core_config',
      'migration',
      'server', 'database', 'fetch', 'execute',
      'memory', 'semantic-memory', 'episodic-memory', 'procedural-memory',
      'for', 'forEach', 'while', 'if', 'match',
      'debug', 'generic',
    ];
    for (const key of required) {
      expect(NODE_TYPE_HANDLERS).toHaveProperty(key);
    }
  });

  it('all entries are functions', () => {
    for (const [key, handler] of Object.entries(NODE_TYPE_HANDLERS)) {
      expect(typeof handler, `handler for "${key}" should be a function`).toBe('function');
    }
  });
});

// ─── handler dispatch — orb/object family ────────────────────────────────────

describe('handler: orb / object', () => {
  it('calls executeOrb and buildOrbExecutorContext for orb', async () => {
    const { executeOrb } = await import('../orb-executor.js');
    const runtime = makeRuntime();
    const n = node('orb');
    await NODE_TYPE_HANDLERS['orb'](n, runtime);
    expect(runtime.buildOrbExecutorContext).toHaveBeenCalled();
    expect(executeOrb).toHaveBeenCalledWith(n, expect.anything());
  });

  it('calls executeOrb for object (same handler)', async () => {
    const { executeOrb } = await import('../orb-executor.js');
    const runtime = makeRuntime();
    const n = node('object');
    await NODE_TYPE_HANDLERS['object'](n, runtime);
    expect(executeOrb).toHaveBeenCalledWith(n, expect.anything());
  });
});

// ─── handler: visual_metadata (no context from runtime) ──────────────────────

describe('handler: visual_metadata', () => {
  it('calls executeVisualMetadata without calling any build* method', async () => {
    const { executeVisualMetadata } = await import('../system-executors.js');
    const runtime = makeRuntime();
    const n = node('visual_metadata');
    await NODE_TYPE_HANDLERS['visual_metadata'](n, runtime);
    expect(executeVisualMetadata).toHaveBeenCalledWith(n);
    expect(runtime.buildOrbExecutorContext).not.toHaveBeenCalled();
  });
});

// ─── handler: nexus / building / system (context-free) ───────────────────────

describe('handler: structure family (context-free)', () => {
  it('calls executeStructure for nexus', async () => {
    const { executeStructure } = await import('../simple-executors.js');
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['nexus'](node('nexus'), runtime);
    expect(executeStructure).toHaveBeenCalled();
    expect(runtime.buildSimpleExecutorContext).not.toHaveBeenCalled();
  });

  it('calls executeStructure for building', async () => {
    const { executeStructure } = await import('../simple-executors.js');
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['building'](node('building'), runtime);
    expect(executeStructure).toHaveBeenCalled();
  });
});

describe('handler: system', () => {
  it('calls executeSystem without build context methods', async () => {
    const { executeSystem } = await import('../system-executors.js');
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['system'](node('system'), runtime);
    expect(executeSystem).toHaveBeenCalled();
    expect(runtime.buildSimpleExecutorContext).not.toHaveBeenCalled();
  });
});

// ─── handler: capitalization-sensitive branches ───────────────────────────────

describe('composition vs Composition', () => {
  it('lowercase "composition" calls executeComposition with buildSimpleExecutorContext', async () => {
    const { executeComposition } = await import('../simple-executors.js');
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['composition'](node('composition'), runtime);
    expect(runtime.buildSimpleExecutorContext).toHaveBeenCalled();
    expect(executeComposition).toHaveBeenCalled();
  });

  it('uppercase "Composition" calls executeHoloComposition with buildHoloCompositionContext', async () => {
    const { executeHoloComposition } = await import('../holo-composition-executor.js');
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['Composition'](node('Composition'), runtime);
    expect(runtime.buildHoloCompositionContext).toHaveBeenCalled();
    expect(executeHoloComposition).toHaveBeenCalled();
    // executeComposition (lowercase) should NOT be called
    const { executeComposition } = await import('../simple-executors.js');
    expect(executeComposition).not.toHaveBeenCalled();
  });
});

describe('template vs Template', () => {
  it('lowercase "template" delegates to runtime.executeTemplate', async () => {
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['template'](node('template'), runtime);
    expect(runtime.executeTemplate).toHaveBeenCalled();
  });

  it('uppercase "Template" calls executeHoloTemplate with buildSimpleExecutorContext', async () => {
    const { executeHoloTemplate } = await import('../simple-executors.js');
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['Template'](node('Template'), runtime);
    expect(runtime.buildSimpleExecutorContext).toHaveBeenCalled();
    expect(executeHoloTemplate).toHaveBeenCalled();
    expect(runtime.executeTemplate).not.toHaveBeenCalled();
  });
});

// ─── handler: migration (no executor call) ────────────────────────────────────

describe('handler: migration', () => {
  it('returns success without calling any executor or runtime method', async () => {
    const runtime = makeRuntime();
    const result = await NODE_TYPE_HANDLERS['migration'](node('migration'), runtime);
    expect(result).toEqual({ success: true, output: 'Migration block registered' });
    expect(runtime.buildOrbExecutorContext).not.toHaveBeenCalled();
    expect(runtime.buildSimpleExecutorContext).not.toHaveBeenCalled();
  });
});

// ─── handler: IO delegates to runtime methods ─────────────────────────────────

describe('handler: IO family', () => {
  it('server delegates to runtime.executeServerNode', async () => {
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['server'](node('server'), runtime);
    expect(runtime.executeServerNode).toHaveBeenCalled();
  });

  it('database delegates to runtime.executeDatabaseNode', async () => {
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['database'](node('database'), runtime);
    expect(runtime.executeDatabaseNode).toHaveBeenCalled();
  });

  it('fetch delegates to runtime.executeFetchNode', async () => {
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['fetch'](node('fetch'), runtime);
    expect(runtime.executeFetchNode).toHaveBeenCalled();
  });

  it('execute delegates to runtime.executeTarget', async () => {
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['execute'](node('execute'), runtime);
    expect(runtime.executeTarget).toHaveBeenCalled();
  });
});

// ─── handler: control-flow delegates ─────────────────────────────────────────

describe('handler: control flow', () => {
  it('for → runtime.executeForLoop', async () => {
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['for'](node('for'), runtime);
    expect(runtime.executeForLoop).toHaveBeenCalled();
  });

  it('forEach → runtime.executeForEachLoop', async () => {
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['forEach'](node('forEach'), runtime);
    expect(runtime.executeForEachLoop).toHaveBeenCalled();
  });

  it('while → runtime.executeWhileLoop', async () => {
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['while'](node('while'), runtime);
    expect(runtime.executeWhileLoop).toHaveBeenCalled();
  });

  it('if → runtime.executeIfStatement', async () => {
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['if'](node('if'), runtime);
    expect(runtime.executeIfStatement).toHaveBeenCalled();
  });

  it('match → runtime.executeMatch', async () => {
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['match'](node('match'), runtime);
    expect(runtime.executeMatch).toHaveBeenCalled();
  });
});

// ─── handler: memory delegates ───────────────────────────────────────────────

describe('handler: memory family', () => {
  it('memory → runtime.executeMemory', async () => {
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['memory'](node('memory'), runtime);
    expect(runtime.executeMemory).toHaveBeenCalled();
  });

  it('semantic-memory → runtime.executeMemoryDefinition', async () => {
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['semantic-memory'](node('semantic-memory'), runtime);
    expect(runtime.executeMemoryDefinition).toHaveBeenCalled();
  });

  it('episodic-memory → runtime.executeMemoryDefinition', async () => {
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['episodic-memory'](node('episodic-memory'), runtime);
    expect(runtime.executeMemoryDefinition).toHaveBeenCalled();
  });

  it('procedural-memory → runtime.executeMemoryDefinition', async () => {
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['procedural-memory'](node('procedural-memory'), runtime);
    expect(runtime.executeMemoryDefinition).toHaveBeenCalled();
  });
});

// ─── handler: debug + generic ────────────────────────────────────────────────

describe('handler: debug and generic', () => {
  it('debug → runtime.executeDebug', async () => {
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['debug'](node('debug'), runtime);
    expect(runtime.executeDebug).toHaveBeenCalled();
  });

  it('generic → runtime.executeGeneric', async () => {
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['generic'](node('generic'), runtime);
    expect(runtime.executeGeneric).toHaveBeenCalled();
  });
});

// ─── handler: core_config uses runtime.context.environment ───────────────────

describe('handler: core_config', () => {
  it('calls executeCoreConfig with runtime.context.environment', async () => {
    const { executeCoreConfig } = await import('../system-executors.js');
    const runtime = makeRuntime();
    await NODE_TYPE_HANDLERS['core_config'](node('core_config'), runtime);
    expect(executeCoreConfig).toHaveBeenCalledWith(expect.anything(), runtime.context.environment);
  });
});

// ─── dispatchNode ─────────────────────────────────────────────────────────────

describe('dispatchNode', () => {
  it('returns error result for unknown node type', async () => {
    const runtime = makeRuntime();
    const result = await dispatchNode(node('unknownType'), runtime);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unknown node type: unknownType/);
  });

  it('dispatches to the correct handler for a known type', async () => {
    const { executeOrb } = await import('../orb-executor.js');
    const runtime = makeRuntime();
    const n = node('orb');
    const result = await dispatchNode(n, runtime);
    expect(result.success).toBe(true);
    expect(executeOrb).toHaveBeenCalledWith(n, expect.anything());
  });

  it('dispatches migration and returns its plain success record', async () => {
    const runtime = makeRuntime();
    const result = await dispatchNode(node('migration'), runtime);
    expect(result).toEqual({ success: true, output: 'Migration block registered' });
  });

  it('dispatches lowercase composition to executeComposition', async () => {
    const { executeComposition } = await import('../simple-executors.js');
    const runtime = makeRuntime();
    await dispatchNode(node('composition'), runtime);
    expect(executeComposition).toHaveBeenCalled();
  });

  it('dispatches uppercase Composition to executeHoloComposition', async () => {
    const { executeHoloComposition } = await import('../holo-composition-executor.js');
    const runtime = makeRuntime();
    await dispatchNode(node('Composition'), runtime);
    expect(executeHoloComposition).toHaveBeenCalled();
  });
});
