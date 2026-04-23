/**
 * HoloObject executor — extracted from HoloScriptRuntime (W1-T4 slice 25)
 *
 * Converts a `HoloObjectDecl` (parser AST) into an `OrbNode` (runtime
 * AST) and delegates to executeOrb for actual execution. The conversion:
 *
 *   1. Flatten properties via resolveHoloValue (slice 13).
 *   2. Fold in state.properties (state is a nested sub-block).
 *   3. Extract position + hologram shape/color/size/glow/interactive
 *      (with documented defaults).
 *   4. Accumulate directives from: node.directives, node.traits
 *      (translated to directive shape), and the linked template's
 *      directives (if `node.template` is set).
 *   5. Build the traits Map.
 *   6. Inherit template state + properties (only where the object
 *      hasn't already set them — object-level wins).
 *   7. Delegate to executeOrb (still in HSR until its own slice).
 *
 * **Pattern**: 2-callback context (pattern 5 minimal). `getTemplate`
 * for the registry lookup, `executeOrb` for the terminal delegate.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 *
 * **See**: W1-T4 slice 25 / board task task_1776940617322_ee53
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 2097-2164)
 *         packages/core/src/runtime/holo-value.ts (slice 13)
 */

import type {
  ASTNode,
  ExecutionResult,
  HologramProperties,
  HoloObjectDecl,
  HoloScriptValue,
  HoloTemplate,
  OrbNode,
  SpatialPosition,
  VRTraitName,
} from '../types';
import { resolveHoloValue } from './holo-value';

// ──────────────────────────────────────────────────────────────────
// Default hologram values (used when HoloObjectDecl omits them)
// ──────────────────────────────────────────────────────────────────

/** Default hologram shape when node.properties.geometry is absent. */
const DEFAULT_SHAPE = 'sphere';
/** Default hologram color when node.properties.color is absent. */
const DEFAULT_COLOR = '#ffffff';
/** Default hologram size when node.properties.scale/size are absent. */
const DEFAULT_SIZE = 1;

/** Context threaded in by the runtime — 2 callbacks. */
export interface HoloObjectContext {
  /** Template registry lookup — used for `using <template>` inheritance. */
  getTemplate: (name: string) => HoloTemplate | undefined;
  /** Terminal executor — runs the derived OrbNode. */
  executeOrb: (orbNode: OrbNode) => Promise<ExecutionResult>;
}

/**
 * Execute a `HoloObjectDecl` AST node — convert to OrbNode +
 * delegate. Template inheritance is object-wins (object-level
 * properties override template properties).
 */
export async function executeHoloObject(
  node: HoloObjectDecl,
  ctx: HoloObjectContext,
): Promise<ExecutionResult> {
  const properties: Record<string, HoloScriptValue> = {};

  // Phase 1: flatten HoloObjectDecl properties
  for (const prop of node.properties) {
    properties[prop.key] = resolveHoloValue(prop.value);
  }

  // Phase 2: fold in state.properties (state is a named sub-block)
  if (node.state) {
    for (const prop of node.state.properties) {
      properties[prop.key] = resolveHoloValue(prop.value);
    }
  }

  // Phase 3: extract position + hologram
  const position = properties.position as SpatialPosition | undefined;

  const hologram: HologramProperties = {
    shape: (properties.geometry as string) || DEFAULT_SHAPE,
    color: (properties.color as string) || DEFAULT_COLOR,
    size:
      (properties.scale as number) || (properties.size as number) || DEFAULT_SIZE,
    glow: (properties.glow as boolean) || false,
    // interactive defaults to true unless explicitly set false
    interactive: properties.interactive !== false,
  } as HologramProperties;

  // Phase 4-5: build directives + traits Map. Template directives
  // come last so object/trait directives take priority.
  const template = node.template ? ctx.getTemplate(node.template) : undefined;

  const orbNode: OrbNode = {
    type: 'orb',
    name: node.name,
    position,
    hologram,
    properties,
    // @ts-expect-error — directive shape is intentionally loose here;
    //   downstream dispatch normalizes.
    directives: [
      ...(node.directives || []),
      ...(node.traits || []).map((t) => ({
        type: 'trait' as const,
        name: t.name,
        ...t.config,
      })),
      ...(template?.directives || []),
    ],
    traits: new Map(
      (node.traits || []).map((t) => [t.name as VRTraitName, t.config]),
    ),
    children: (node.children as unknown as ASTNode[]) || [],
  };

  // Phase 6: inherit template state + properties (object-wins policy)
  if (template) {
    if (template.state) {
      for (const prop of template.state.properties) {
        if (properties[prop.key] === undefined) {
          properties[prop.key] = resolveHoloValue(prop.value);
        }
      }
    }
    for (const prop of template.properties) {
      if (properties[prop.key] === undefined) {
        properties[prop.key] = resolveHoloValue(prop.value);
      }
    }
  }

  // Phase 7: delegate to executeOrb (stays in HSR until its own slice)
  return ctx.executeOrb(orbNode);
}
