/**
 * Node-type dispatch registry — extracted from HoloScriptRuntime (W1-T4 slice 34).
 *
 * Replaces the 225-LOC switch statement in HoloScriptRuntime.executeNode
 * with a Map<nodeType, handler> registry. Each handler takes `(node, runtime)`
 * and calls the appropriate pure executor with a context the runtime builds
 * on demand.
 *
 * **Design notes**:
 *   - `RuntimeDispatcher` is a STRUCTURAL interface — no import of
 *     HoloScriptRuntime, so this module is free of circular imports.
 *     HSR exposes the matching shape via its `build<X>Context` + inline
 *     `execute<X>` methods; duck typing does the rest.
 *   - Handlers are synchronous in their dispatch but return Promise<ExecutionResult>
 *     so the runtime keeps its async contract.
 *   - Capitalization-sensitive branches (composition vs Composition,
 *     template vs Template) are kept — the case keys are exact matches on
 *     `node.type`. The registry has separate entries for each capitalization.
 *   - `migration` returns a plain success record with no executor call.
 *   - Loop / control-flow / memory / template / target nodes delegate back
 *     to the runtime's methods — those aren't purified yet. When they
 *     land, the registry entries here collapse to direct pure-function
 *     calls (one-line each).
 *
 * Behavior LOCKED by HoloScriptRuntime.characterization.test.ts +
 * the unit suite co-landed with this slice (node-type-registry.test.ts).
 *
 * **See**: W1-T4 slice 34 — handler-registry refactor
 *         board task: task_1776987168509_p8gk
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 509-713, ~205-LOC switch)
 */

import type { ASTNode } from '../parser/types';
import type { ExecutionResult, HoloScriptValue } from '../types';
import type {
  OrbNode,
  NarrativeNode,
  QuestNode,
  DialogueNode,
  VisualMetadataNode,
  MethodNode,
  ConnectionNode,
  GateNode,
  StreamNode,
  ScaleNode,
  FocusNode,
  EnvironmentNode,
  CompositionNode,
  TemplateNode,
  StateMachineNode,
  SystemNode,
  CoreConfigNode,
  ServerNode,
  DatabaseNode,
  FetchNode,
  ExecuteNode,
  UI2DNode,
} from '../types';
import type { HoloComposition } from '../parser/HoloCompositionTypes';

import { executeOrb as executeOrbPure } from './orb-executor';
import {
  executeNarrative as executeNarrativePure,
  executeQuest as executeQuestPure,
  executeDialogue as executeDialoguePure,
  executeVisualMetadata as executeVisualMetadataPure,
} from './narrative-executors';
import {
  executeFunction as executeFunctionPure,
  executeConnection as executeConnectionPure,
  executeGate as executeGatePure,
  executeStream as executeStreamPure,
} from './graph-executors';
import {
  executeCall as executeCallPure,
  executeAssignment as executeAssignmentPure,
  executeReturn as executeReturnPure,
  executeExpressionStatement as executeExpressionStatementPure,
  executeScale as executeScalePure,
  executeFocus as executeFocusPure,
  executeEnvironment as executeEnvironmentPure,
  executeComposition as executeCompositionPure,
  executeStateMachine as executeStateMachinePure,
  executeStructure as executeStructurePure,
  executeHoloTemplate as executeHoloTemplatePure,
} from './simple-executors';
import {
  executeVisualize as executeVisualizePure,
  executeUIElement as executeUIElementPure,
} from './info-executors';
import { executeHoloComposition as executeHoloCompositionPure } from './holo-composition-executor';
import {
  executeSystem as executeSystemPure,
  executeCoreConfig as executeCoreConfigPure,
} from './system-executors';

// Slice 31/32/33 runtime modules — used via the RuntimeDispatcher's build*Ctx methods.
import type { OrbExecutorContext } from './orb-executor';
import type { NarrativeContext } from './narrative-executors';
import type { GraphExecutorContext } from './graph-executors';
import type { SimpleExecutorContext } from './simple-executors';
import type { InfoExecutorContext } from './info-executors';
import type { HoloCompositionContext } from './holo-composition-executor';
import type { HoloObjectContext } from './holo-object-executor';

/**
 * Structural mirror of HoloScriptRuntime's dispatch surface. Includes
 * every `build<X>Context` method used by the registry AND every inline
 * `execute<X>` method the registry still delegates back to. Duck-typed
 * so HSR doesn't need to `implements` it explicitly.
 */
export interface RuntimeDispatcher {
  // Context builders (for pure-executor dispatch)
  buildOrbExecutorContext(): OrbExecutorContext;
  buildNarrativeContext(): NarrativeContext;
  buildGraphExecutorContext(): GraphExecutorContext;
  buildSimpleExecutorContext(): SimpleExecutorContext;
  buildInfoExecutorContext(): InfoExecutorContext;
  buildHoloCompositionContext(): HoloCompositionContext;
  buildHoloObjectContext(): HoloObjectContext;

  // Inline executors — not yet purified (loops, control flow, memory,
  // template legacy, target, generic).
  executeForLoop(node: ASTNode & {
    variable: string; iterable: string | unknown; body: ASTNode[];
  }): Promise<ExecutionResult>;
  executeForEachLoop(node: ASTNode & {
    variable: string; collection: string | unknown; body: ASTNode[];
  }): Promise<ExecutionResult>;
  executeWhileLoop(node: ASTNode & {
    condition: string | unknown; body: ASTNode[];
  }): Promise<ExecutionResult>;
  executeIfStatement(node: ASTNode & {
    condition: string | unknown; body: ASTNode[]; elseBody?: ASTNode[];
  }): Promise<ExecutionResult>;
  executeMatch(node: ASTNode & {
    subject: string | unknown;
    cases: Array<{
      pattern: string | unknown;
      guard?: string | unknown;
      body: ASTNode[] | unknown;
    }>;
  }): Promise<ExecutionResult>;
  executeMemory(node: import('../types').MemoryNode): Promise<ExecutionResult>;
  executeMemoryDefinition(
    node:
      | import('../types').SemanticMemoryNode
      | import('../types').EpisodicMemoryNode
      | import('../types').ProceduralMemoryNode,
  ): Promise<ExecutionResult>;
  executeGeneric(node: ASTNode): Promise<ExecutionResult>;
  executeTemplate(node: TemplateNode): Promise<ExecutionResult>;
  executeServerNode(node: ServerNode): Promise<ExecutionResult>;
  executeDatabaseNode(node: DatabaseNode): Promise<ExecutionResult>;
  executeFetchNode(node: FetchNode): Promise<ExecutionResult>;
  executeTarget(node: ExecuteNode): Promise<ExecutionResult>;
  executeStateDeclaration(node: ASTNode & {
    directives?: import('../types/AdvancedTypeSystem').HSPlusDirective[];
  }): Promise<ExecutionResult>;
  executeDebug(node: ASTNode & { target?: string }): Promise<ExecutionResult>;

  // Environment read (used by `core_config`)
  readonly context: { environment: Record<string, HoloScriptValue> };
}

/** Handler signature — one per node-type key. */
export type NodeHandler = (
  node: ASTNode,
  runtime: RuntimeDispatcher,
) => Promise<ExecutionResult>;

/**
 * The dispatch registry. 30+ entries, one per supported node.type.
 * Unknown types fall through to the caller's error fallback.
 */
export const NODE_TYPE_HANDLERS: Record<string, NodeHandler> = {
  // Orbs / objects (same handler, both keys)
  orb: (node, r) => executeOrbPure(node as OrbNode, r.buildOrbExecutorContext()),
  object: (node, r) => executeOrbPure(node as OrbNode, r.buildOrbExecutorContext()),

  // Narrative family
  narrative: (node, r) => executeNarrativePure(node as NarrativeNode, r.buildNarrativeContext()),
  quest: (node, r) => executeQuestPure(node as QuestNode, r.buildNarrativeContext()),
  dialogue: (node, r) => executeDialoguePure(node as DialogueNode, r.buildNarrativeContext()),
  visual_metadata: (node) => executeVisualMetadataPure(node as VisualMetadataNode),

  // Graph family
  method: (node, r) => executeFunctionPure(node as MethodNode, r.buildGraphExecutorContext()),
  function: (node, r) => executeFunctionPure(node as MethodNode, r.buildGraphExecutorContext()),
  connection: (node, r) =>
    executeConnectionPure(node as ConnectionNode, r.buildGraphExecutorContext()),
  gate: (node, r) => executeGatePure(node as GateNode, r.buildGraphExecutorContext()),
  stream: (node, r) => executeStreamPure(node as StreamNode, r.buildGraphExecutorContext()),

  // Simple / expression family
  call: (node, r) =>
    executeCallPure(
      node as ASTNode & { target?: string; args?: unknown[] },
      r.buildSimpleExecutorContext(),
    ),
  assignment: (node, r) =>
    executeAssignmentPure(
      node as ASTNode & { name: string; value: unknown },
      r.buildSimpleExecutorContext(),
    ),
  return: (node, r) =>
    executeReturnPure(node as ASTNode & { value: unknown }, r.buildSimpleExecutorContext()),
  'expression-statement': (node, r) =>
    executeExpressionStatementPure(
      node as ASTNode & { expression: string },
      r.buildSimpleExecutorContext(),
    ),
  scale: (node, r) => executeScalePure(node as ScaleNode, r.buildSimpleExecutorContext()),
  focus: (node, r) => executeFocusPure(node as FocusNode, r.buildSimpleExecutorContext()),
  environment: (node, r) =>
    executeEnvironmentPure(node as EnvironmentNode, r.buildSimpleExecutorContext()),

  // Info / UI family
  visualize: (node, r) => executeVisualizePure(node, r.buildInfoExecutorContext()),
  '2d-element': (node, r) =>
    executeUIElementPure(node as unknown as UI2DNode, r.buildInfoExecutorContext()),

  // Structure family (nexus + building = same handler)
  nexus: (node) => executeStructurePure(node),
  building: (node) => executeStructurePure(node),

  // Capitalization-sensitive branches (composition vs Composition, template vs Template)
  composition: (node, r) =>
    executeCompositionPure(node as CompositionNode, r.buildSimpleExecutorContext()),
  Composition: (node, r) =>
    executeHoloCompositionPure(
      node as unknown as HoloComposition,
      r.buildHoloCompositionContext(),
    ),
  template: (node, r) => r.executeTemplate(node as TemplateNode),
  Template: (node, r) =>
    executeHoloTemplatePure(
      node as unknown as { name: string } & Record<string, unknown>,
      r.buildSimpleExecutorContext(),
    ),

  // State family
  'state-machine': (node, r) =>
    executeStateMachinePure(node as StateMachineNode, r.buildSimpleExecutorContext()),
  'state-declaration': (node, r) =>
    r.executeStateDeclaration(
      node as ASTNode & {
        directives?: import('../types/AdvancedTypeSystem').HSPlusDirective[];
      },
    ),

  // System
  system: (node) => executeSystemPure(node as SystemNode),
  core_config: (node, r) =>
    executeCoreConfigPure(
      node as CoreConfigNode,
      r.context.environment as Record<string, HoloScriptValue>,
    ),

  // Migration: accepted but no executor — plain success record
  migration: async () => ({
    success: true,
    output: 'Migration block registered',
  }),

  // IO family (slice 32 delegates)
  server: (node, r) => r.executeServerNode(node as ServerNode),
  database: (node, r) => r.executeDatabaseNode(node as DatabaseNode),
  fetch: (node, r) => r.executeFetchNode(node as FetchNode),
  execute: (node, r) => r.executeTarget(node as ExecuteNode),

  // Memory family
  memory: (node, r) => r.executeMemory(node as import('../types').MemoryNode),
  'semantic-memory': (node, r) =>
    r.executeMemoryDefinition(
      node as
        | import('../types').SemanticMemoryNode
        | import('../types').EpisodicMemoryNode
        | import('../types').ProceduralMemoryNode,
    ),
  'episodic-memory': (node, r) =>
    r.executeMemoryDefinition(
      node as
        | import('../types').SemanticMemoryNode
        | import('../types').EpisodicMemoryNode
        | import('../types').ProceduralMemoryNode,
    ),
  'procedural-memory': (node, r) =>
    r.executeMemoryDefinition(
      node as
        | import('../types').SemanticMemoryNode
        | import('../types').EpisodicMemoryNode
        | import('../types').ProceduralMemoryNode,
    ),

  // Control-flow family
  for: (node, r) =>
    r.executeForLoop(
      node as ASTNode & { variable: string; iterable: string | unknown; body: ASTNode[] },
    ),
  forEach: (node, r) =>
    r.executeForEachLoop(
      node as ASTNode & { variable: string; collection: string | unknown; body: ASTNode[] },
    ),
  while: (node, r) =>
    r.executeWhileLoop(
      node as ASTNode & { condition: string | unknown; body: ASTNode[] },
    ),
  if: (node, r) =>
    r.executeIfStatement(
      node as ASTNode & {
        condition: string | unknown;
        body: ASTNode[];
        elseBody?: ASTNode[];
      },
    ),
  match: (node, r) =>
    r.executeMatch(
      node as ASTNode & {
        subject: string | unknown;
        cases: Array<{
          pattern: string | unknown;
          guard?: string | unknown;
          body: ASTNode[] | unknown;
        }>;
      },
    ),

  // Debug + generic
  debug: (node, r) => r.executeDebug(node as ASTNode & { target?: string }),
  generic: (node, r) => r.executeGeneric(node),
};

/**
 * Dispatch a node to its registered handler. Returns an Unknown-node-type
 * error result if no handler is registered. Caller owns the surrounding
 * bookkeeping (executionStack push/pop, startTime, history append, catch).
 */
export async function dispatchNode(
  node: ASTNode,
  runtime: RuntimeDispatcher,
): Promise<ExecutionResult> {
  const nodeType = (node as unknown as Record<string, unknown>).type as string;
  const handler = NODE_TYPE_HANDLERS[nodeType];
  if (!handler) {
    return {
      success: false,
      error: `Unknown node type: ${node.type}`,
    };
  }
  return handler(node, runtime);
}
