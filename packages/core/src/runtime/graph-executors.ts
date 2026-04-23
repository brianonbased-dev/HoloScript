/**
 * Graph executors — extracted from HoloScriptRuntime (W1-T4 slice 20)
 *
 * Four medium-complexity executors for HoloScript's visual-graph
 * nodes: `function` / `connection` / `gate` / `stream`. These
 * define computation topology (method definitions, data connections,
 * conditional branches, stream pipelines).
 *
 * **Pattern**: fat context bag (pattern 5). Graph executors touch
 * many runtime concerns, so a single `GraphExecutorContext` exposes
 * the union of state containers + callbacks they need. Each executor
 * uses only a subset.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 *
 * **See**: W1-T4 slice 20 (W4-T3 §Wave-1 split backlog)
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 1481-1607)
 */

import { logger } from '../logger';
import type {
  ASTNode,
  ConnectionNode,
  EventHandler,
  ExecutionResult,
  GateNode,
  HologramProperties,
  HoloScriptValue,
  MethodNode,
  SpatialPosition,
  StreamNode,
  TransformationNode,
} from '../types';

/** Fat context for graph executors — each uses a subset. */
export interface GraphExecutorContext {
  /** Function registry (executeFunction). */
  functions: Map<string, MethodNode>;
  /** Connection registry (executeConnection). */
  connections: ConnectionNode[];
  /** Hologram-state registry (executeFunction). */
  hologramState: Map<string, HologramProperties>;
  /** Spatial memory — connection endpoint lookup. */
  spatialMemory: Map<string, SpatialPosition>;
  /** Event handler registration (executeConnection bidirectional). */
  on: (event: string, handler: EventHandler) => void;
  /** Event emit (executeConnection bidirectional). */
  emit: (event: string, data?: unknown) => void;
  /** Variable read (executeStream source lookup). */
  getVariable: (name: string) => unknown;
  /** Variable write (executeConnection bidirectional, executeStream result). */
  setVariable: (name: string, value: unknown) => void;
  /** Connection stream creation (executeConnection visible edge). */
  createConnectionStream: (
    from: string,
    to: string,
    fromPos: SpatialPosition,
    toPos: SpatialPosition,
    dataType: string,
  ) => void;
  /** Flowing stream creation (executeStream particles). */
  createFlowingStream: (name: string, position: SpatialPosition, data: unknown) => void;
  /** Data-type color lookup (executeConnection cylinder color). */
  getDataTypeColor: (dataType: string) => string;
  /** Expression evaluator (executeGate condition). */
  evaluateCondition: (expr: string | unknown) => boolean;
  /** Program executor (executeGate path). */
  executeProgram: (nodes: ASTNode[], depth: number) => Promise<ExecutionResult[]>;
  /** Call-stack depth accessor (executeGate). */
  callStackDepth: () => number;
  /** Transformation applicator (executeStream pipeline). */
  applyTransformation: (data: unknown, transform: TransformationNode) => Promise<HoloScriptValue>;
}

// ──────────────────────────────────────────────────────────────────
// Default hologram / cosmetic constants
// ──────────────────────────────────────────────────────────────────

const FUNCTION_DEFAULT_HOLOGRAM: Omit<HologramProperties, 'shape' | 'size' | 'color'> & Partial<HologramProperties> = {
  shape: 'cube',
  color: '#ff6b35',
  size: 1.5,
  glow: true,
  interactive: true,
};

const CONNECTION_HOLOGRAM_SIZE = 0.1;
const GATE_HOLOGRAM_SIZE = 1;

/**
 * Execute a `function` (MethodNode) AST node — register the function
 * in context.functions and assign it a hologram for visualization.
 */
export async function executeFunction(
  node: MethodNode,
  ctx: GraphExecutorContext,
): Promise<ExecutionResult> {
  ctx.functions.set(node.name, node);

  const hologram: HologramProperties = {
    ...FUNCTION_DEFAULT_HOLOGRAM,
    ...node.hologram,
  } as HologramProperties;

  ctx.hologramState.set(node.name, hologram);

  logger.info('Function defined', {
    name: node.name,
    params: node.parameters.map((p) => p.name),
  });

  return {
    success: true,
    output: `Function '${node.name}' defined with ${node.parameters.length} parameter(s)`,
    hologram,
    spatialPosition: node.position,
  };
}

/**
 * Execute a `connection` AST node — register in context.connections,
 * create a particle stream between the endpoints if both are
 * positioned, and wire up bidirectional reactive bindings if
 * `node.bidirectional` is set.
 */
export async function executeConnection(
  node: ConnectionNode,
  ctx: GraphExecutorContext,
): Promise<ExecutionResult> {
  ctx.connections.push(node);

  const fromPos = ctx.spatialMemory.get(node.from);
  const toPos = ctx.spatialMemory.get(node.to);

  if (fromPos && toPos) {
    ctx.createConnectionStream(node.from, node.to, fromPos, toPos, node.dataType);
  }

  // Bidirectional reactive binding — any change on either side
  // propagates to the other with a re-emit for cascade awareness.
  if (node.bidirectional) {
    ctx.on(`${node.from}.changed`, async (data) => {
      ctx.setVariable(node.to, data);
      ctx.emit(`${node.to}.changed`, data);
    });
    ctx.on(`${node.to}.changed`, async (data) => {
      ctx.setVariable(node.from, data);
      ctx.emit(`${node.from}.changed`, data);
    });
  }

  logger.info('Connection created', { from: node.from, to: node.to, dataType: node.dataType });

  return {
    success: true,
    output: `Connected '${node.from}' to '${node.to}' (${node.dataType})`,
    hologram: {
      shape: 'cylinder',
      color: ctx.getDataTypeColor(node.dataType),
      size: CONNECTION_HOLOGRAM_SIZE,
      glow: true,
      interactive: false,
    },
  };
}

/**
 * Execute a `gate` (conditional) AST node — pick the true/false
 * path based on condition, execute it, and bubble the return value
 * if an explicit return was hit.
 */
export async function executeGate(
  node: GateNode,
  ctx: GraphExecutorContext,
): Promise<ExecutionResult> {
  try {
    const condition = ctx.evaluateCondition(node.condition);
    const path = condition ? node.truePath : node.falsePath;

    logger.info('Gate evaluation', { condition: node.condition, result: condition });

    if (path.length > 0) {
      const subResults = await ctx.executeProgram(path, ctx.callStackDepth() + 1);

      // If the sub-program ended on an explicit return, bubble that up.
      // executeProgram stops when it encounters a 'return' node.
      const lastResult = subResults[subResults.length - 1];
      const selectedPathContainsReturn = path.some((n) => n.type === 'return');
      if (selectedPathContainsReturn && lastResult?.success && lastResult.output !== undefined) {
        return lastResult;
      }
    }

    return {
      success: true,
      output: `Gate: took ${condition ? 'true' : 'false'} path`,
      hologram: {
        shape: 'pyramid',
        color: condition ? '#00ff00' : '#ff0000',
        size: GATE_HOLOGRAM_SIZE,
        glow: true,
        interactive: true,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Gate execution failed: ${error}`,
    };
  }
}

/**
 * Execute a `stream` AST node — read source variable, apply each
 * transformation in sequence, store the result under `${name}_result`,
 * and create a flowing-stream particle effect.
 */
export async function executeStream(
  node: StreamNode,
  ctx: GraphExecutorContext,
): Promise<ExecutionResult> {
  let data = ctx.getVariable(node.source);

  logger.info('Stream processing', {
    name: node.name,
    source: node.source,
    transforms: node.transformations.length,
  });

  for (const transform of node.transformations) {
    data = await ctx.applyTransformation(data, transform);
  }

  ctx.setVariable(`${node.name}_result`, data);
  ctx.createFlowingStream(node.name, node.position || [0, 0, 0], data);

  return {
    success: true,
    output: `Stream '${node.name}' processed ${Array.isArray(data) ? data.length : 1} item(s)`,
    hologram: node.hologram,
    spatialPosition: node.position,
  };
}
