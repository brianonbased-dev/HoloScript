/**
 * HoloComposition executor — extracted from HoloScriptRuntime (W1-T4 slice 24)
 *
 * Runs a `HoloComposition` AST node in three phases:
 *   1. Template registration — each child template is run through
 *      the slice-17 executeHoloTemplate helper.
 *   2. Environment setup — environment.properties are flattened
 *      through resolveHoloValue (slice 13) and merged into the
 *      runtime's environment record.
 *   3. Object execution — each object runs through the caller's
 *      `executeHoloObject` callback (which stays in HSR until its
 *      own extraction slice lands).
 *
 * **Pattern**: multi-callback context (pattern 5). Depends on
 * executeHoloTemplate (slice 17) and resolveHoloValue (slice 13) —
 * third cross-slice composition inside the runtime/ namespace
 * (after control-flow→pattern-match and animation-system→easing).
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 *
 * **See**: W1-T4 slice 24 (W4-T3 §Wave-1 split backlog)
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 2085-2114)
 *         packages/core/src/runtime/simple-executors.ts (slice 17)
 *         packages/core/src/runtime/holo-value.ts (slice 13)
 */

import type { ExecutionResult, HoloComposition, HoloObjectDecl, HoloScriptValue } from '../types';
import type { HoloValue } from '../types';
import { resolveHoloValue } from './holo-value';
import { executeHoloTemplate, type SimpleExecutorContext } from './simple-executors';

/**
 * Context passed in by the caller — supplies the executeHoloObject
 * delegate (which stays in HSR for now) and the SimpleExecutorContext
 * needed by the slice-17 executeHoloTemplate helper, plus
 * get/setEnvironment callbacks for the environment merge.
 */
export interface HoloCompositionContext {
  /** SimpleExecutorContext for executeHoloTemplate delegation. */
  simpleExecutorContext: SimpleExecutorContext;
  /** executeHoloObject delegate — stays in HSR until its own slice lands. */
  executeHoloObject: (node: HoloObjectDecl) => Promise<ExecutionResult>;
  /** Environment record read — used to preserve prior settings in the merge. */
  getEnvironment: () => Record<string, HoloScriptValue>;
  /** Environment record reassignment — spreads new settings on top of old. */
  setEnvironment: (env: Record<string, HoloScriptValue>) => void;
}

/**
 * Execute a `HoloComposition` AST node — register templates,
 * apply environment settings, execute all objects.
 */
export async function executeHoloComposition(
  node: HoloComposition,
  ctx: HoloCompositionContext,
): Promise<ExecutionResult> {
  // Phase 1: register templates
  for (const template of node.templates) {
    await executeHoloTemplate(
      template as unknown as { name: string } & Record<string, unknown>,
      ctx.simpleExecutorContext,
    );
  }

  // Phase 2: execute environment — flatten properties via resolveHoloValue,
  // merge on top of the runtime's current environment.
  if (node.environment) {
    const envSettings: Record<string, HoloScriptValue> = {};
    for (const prop of node.environment.properties) {
      envSettings[prop.key] = resolveHoloValue(prop.value as HoloValue);
    }
    ctx.setEnvironment({ ...ctx.getEnvironment(), ...envSettings });
  }

  // Phase 3: execute objects — delegated to HSR's executeHoloObject
  // until its own slice lands.
  const results: ExecutionResult[] = [];
  for (const object of node.objects) {
    results.push(await ctx.executeHoloObject(object));
  }

  return {
    success: results.every((r) => r.success),
    output: `HoloComposition ${node.name} executed`,
  };
}
