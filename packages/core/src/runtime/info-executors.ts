/**
 * Info executors — extracted from HoloScriptRuntime (W1-T4 slice 22)
 *
 * Two dispatch-only executors that make runtime data visible or
 * interactive:
 *   - `executeVisualize` — spawn a data-viz particle system for
 *     a variable target; fails gracefully if the variable is undefined.
 *   - `executeUIElement` — register a UI widget (button / slider /
 *     toggle / textinput) in `uiElements` and wire up event handlers.
 *
 * `executeDebug` is intentionally LEFT IN HSR — it snapshots too
 * many state containers (scope vars, functions, connections, call
 * stack, uiElements, animations, execution history, hologramState)
 * to cleanly pass through a context interface.
 *
 * **Pattern**: minimal state-container + callback context.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 *
 * **See**: W1-T4 slice 22 (W4-T3 §Wave-1 split backlog)
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 1534-1597)
 */

import { logger } from '../logger';
import type {
  ASTNode,
  EventHandler,
  ExecutionResult,
  HologramProperties,
  HoloScriptValue,
  SpatialPosition,
  UI2DNode,
  UIElementState,
} from '../types';

/** Context passed in — state containers + callbacks. */
export interface InfoExecutorContext {
  /** Variable read for visualize target. */
  getVariable: (name: string) => unknown;
  /** Data-viz particle creator. */
  createDataVisualization: (
    name: string,
    data: unknown,
    position: SpatialPosition,
  ) => void;
  /** UI element registry (executeUIElement). */
  uiElements: Map<string, UIElementState>;
  /** Event registration (executeUIElement event handlers). */
  on: (event: string, handler: EventHandler) => void;
  /** Function invocation (executeUIElement event callbacks). */
  callFunction: (name: string) => Promise<ExecutionResult>;
}

// ──────────────────────────────────────────────────────────────────
// Default cosmetic holograms
// ──────────────────────────────────────────────────────────────────

const VISUALIZE_HOLOGRAM: HologramProperties = {
  shape: 'cylinder',
  color: '#32cd32',
  size: 1.5,
  glow: true,
  interactive: true,
};

/**
 * Execute a `visualize <target>` AST node — resolve the target
 * variable, and if it exists, spawn a data-viz particle system
 * at the node's position. Failure mode: variable missing returns
 * a success=false envelope with a useful error message.
 */
export async function executeVisualize(
  node: ASTNode & { target?: string },
  ctx: InfoExecutorContext,
): Promise<ExecutionResult> {
  const target = node.target || '';
  const data = ctx.getVariable(target);

  if (data === undefined) {
    return {
      success: false,
      error: `No data found for '${target}'`,
    };
  }

  ctx.createDataVisualization(target, data, node.position || [0, 0, 0]);

  return {
    success: true,
    output: { visualizing: target, data } as HoloScriptValue,
    hologram: VISUALIZE_HOLOGRAM,
  };
}

/**
 * Execute a `ui2d` widget node — register the UI element with
 * initial value + visibility, then wire up named event handlers
 * that invoke host functions by name.
 *
 * Initial-value rules:
 *   - `textinput`: properties.value or '' (empty string)
 *   - `slider`: properties.value, else properties.min, else 0
 *   - `toggle`: properties.checked, else false
 */
export async function executeUIElement(
  node: UI2DNode,
  ctx: InfoExecutorContext,
): Promise<ExecutionResult> {
  const element: UIElementState = {
    type: node.elementType,
    name: node.name,
    properties: { ...node.properties },
    visible: true,
    enabled: true,
  };

  // Set initial value based on element type
  if (node.elementType === 'textinput') {
    element.value = node.properties.value || '';
  } else if (node.elementType === 'slider') {
    element.value = node.properties.value || node.properties.min || 0;
  } else if (node.elementType === 'toggle') {
    element.value = node.properties.checked || false;
  }

  ctx.uiElements.set(node.name, element);

  // Register event handlers — each event name maps to a host function
  if (node.events) {
    for (const [eventName, handlerName] of Object.entries(node.events)) {
      ctx.on(`${node.name}.${eventName}`, async () => {
        await ctx.callFunction(handlerName);
      });
    }
  }

  logger.info('UI element created', { type: node.elementType, name: node.name });

  return {
    success: true,
    output: element as unknown as HoloScriptValue,
  };
}
