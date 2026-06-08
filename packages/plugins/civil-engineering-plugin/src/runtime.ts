/**
 * Runtime integration for @holoscript/plugin-civil-engineering.
 *
 * Bridges the previously dead-wired `dsm_frame_2d` trait into a behavioral
 * TraitHandler that the HoloScript runtime actually dispatches
 * (HoloScriptRuntime.registerTrait -> applyDirectives / updateTraits).
 *
 * Before this module the plugin declared the trait NAME only
 * (pluginMeta.traits) and exported the Direct-Stiffness-Method solver
 * (`solveFrame2D`, `validateFrame2DModel`, `buildFrame2DReceipt`), but nothing
 * invoked the solver THROUGH the runtime — the trait was built-but-dead-wired.
 * This mirrors government-civic-plugin's reference integration (`civic_decision`
 * -> mcdaAnalysis): it wires the deterministic DSM 2D frame solver
 * (`solveFrame2D`) behind the `dsm_frame_2d` trait so the runtime's directive
 * dispatch can run it.
 */
import { registerPluginTraits } from '@holoscript/core/runtime';
import {
  solveFrame2D,
  validateFrame2DModel,
  type Frame2DModel,
  type Frame2DResult,
} from './frame2d';

/** Stable id for this plugin's trait ownership tagging. */
export const CIVIL_ENGINEERING_PLUGIN_ID = 'civil-engineering' as const;

/**
 * Config carried by an orb's `@dsm_frame_2d` trait directive. Either supply a
 * fully-formed `model`, or the `Frame2DModel` fields inline (the inline fields
 * are assembled into a model). A missing/invalid model emits
 * `dsm_frame_2d_error`.
 */
export interface DsmFrame2dTraitConfig {
  /** Complete frame model to solve. Preferred form. */
  model?: Frame2DModel;
  /** Inline model id (used when `model` is omitted). */
  id?: Frame2DModel['id'];
  /** Inline nodes (used when `model` is omitted). */
  nodes?: Frame2DModel['nodes'];
  /** Inline elements (used when `model` is omitted). */
  elements?: Frame2DModel['elements'];
  /** Inline supports (used when `model` is omitted). */
  supports?: Frame2DModel['supports'];
  /** Inline nodal loads (used when `model` is omitted). */
  nodalLoads?: Frame2DModel['nodalLoads'];
  /** Inline distributed loads (used when `model` is omitted). */
  distributedLoads?: Frame2DModel['distributedLoads'];
}

/** Summary payload emitted on `dsm_frame_2d_solved`. */
export interface DsmFrame2dSolvedEvent {
  nodeId: string;
  /** Solver convergence flag. */
  converged: boolean;
  /** True if all element utilisation ratios < 1.0. */
  structurallyAdequate: boolean;
  /** Maximum absolute nodal displacement (m). */
  maxDisplacementM: number;
  /** Maximum element utilisation ratio. */
  maxUtilisationRatio: number;
  /** Per-node displacements (ux, uy, θz) recovered by the solver. */
  nodeDisplacements: Frame2DResult['nodeDisplacements'];
  /** Support reactions recovered by the solver. */
  reactions: Frame2DResult['reactions'];
  /** Node count in the solved model. */
  nodeCount: number;
  /** Element count in the solved model. */
  elementCount: number;
}

/**
 * Structural view of the runtime trait-handler contract. Matches
 * `@holoscript/core` TraitTypes.TraitHandler at the call sites the runtime
 * actually uses (onAttach / onUpdate receive the node, the directive config,
 * and a context exposing `emit`). Declared locally so the plugin stays
 * decoupled from core's full trait surface.
 */
export interface TraitDispatchContext {
  emit: (event: string, payload?: unknown) => void;
  setState?: (updates: Record<string, unknown>) => void;
}

export interface RuntimeTraitHandler {
  name: string;
  onAttach?: (node: unknown, config: DsmFrame2dTraitConfig, context: TraitDispatchContext) => void;
  onUpdate?: (
    node: unknown,
    config: DsmFrame2dTraitConfig,
    context: TraitDispatchContext,
    delta: number,
  ) => void;
}

interface DsmFrame2dNode {
  id?: string;
  name?: string;
  properties?: Record<string, unknown>;
  __frame2dResult?: Frame2DResult;
}

/** Resolve a `Frame2DModel` from the directive config (explicit model or inline fields). */
function resolveModel(config: DsmFrame2dTraitConfig | undefined): Frame2DModel | undefined {
  if (!config) return undefined;
  if (config.model) return config.model;
  if (config.nodes && config.elements && config.supports) {
    return {
      id: config.id ?? 'dsm_frame_2d',
      nodes: config.nodes,
      elements: config.elements,
      supports: config.supports,
      nodalLoads: config.nodalLoads,
      distributedLoads: config.distributedLoads,
    };
  }
  return undefined;
}

/** Run the DSM solver on the directive config, write the result onto the node, and emit. */
function solveOntoNode(
  node: unknown,
  config: DsmFrame2dTraitConfig | undefined,
  context: TraitDispatchContext,
): void {
  const carrier = node as DsmFrame2dNode;
  const nodeId = carrier.id ?? carrier.name ?? 'unknown';

  const model = resolveModel(config);
  if (!model) {
    context.emit('dsm_frame_2d_error', {
      nodeId,
      error:
        'dsm_frame_2d trait requires config.model (Frame2DModel) or inline config.nodes + config.elements + config.supports',
    });
    return;
  }

  // Validate BEFORE solving so a malformed/under-constrained model surfaces a
  // descriptive error instead of a bare "singular stiffness matrix" throw.
  const validation = validateFrame2DModel(model);
  if (!validation.valid) {
    context.emit('dsm_frame_2d_error', {
      nodeId,
      error: `invalid frame model: ${validation.errors.join('; ')}`,
      errors: validation.errors,
    });
    return;
  }

  try {
    const result = solveFrame2D(model);
    carrier.__frame2dResult = result;
    carrier.properties = {
      ...(carrier.properties ?? {}),
      frame2dConverged: result.converged,
      frame2dStructurallyAdequate: result.structurallyAdequate,
      frame2dMaxDisplacementM: result.maxDisplacementM,
      frame2dMaxUtilisationRatio: result.maxUtilisationRatio,
    };
    const summary: DsmFrame2dSolvedEvent = {
      nodeId,
      converged: result.converged,
      structurallyAdequate: result.structurallyAdequate,
      maxDisplacementM: result.maxDisplacementM,
      maxUtilisationRatio: result.maxUtilisationRatio,
      nodeDisplacements: result.nodeDisplacements,
      reactions: result.reactions,
      nodeCount: model.nodes.length,
      elementCount: model.elements.length,
    };
    context.setState?.({ [`dsm_frame_2d:${nodeId}`]: summary });
    context.emit('dsm_frame_2d_solved', summary);
  } catch (error) {
    context.emit('dsm_frame_2d_error', {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Behavioral handler for the civil-engineering `dsm_frame_2d` trait. Runs the
 * deterministic Direct-Stiffness-Method 2D frame solver whenever an orb carrying
 * the trait is attached (and on each per-frame update), writing the result onto
 * the node and emitting `dsm_frame_2d_solved` / `dsm_frame_2d_error`.
 */
export const dsmFrame2dHandler: RuntimeTraitHandler = {
  name: 'dsm_frame_2d',
  onAttach: (node, config, context) => solveOntoNode(node, config, context),
  onUpdate: (node, config, context) => solveOntoNode(node, config, context),
};

/** A runtime that can register behavioral trait handlers. */
export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

/**
 * Register civil-engineering behavioral trait handlers into a runtime that
 * exposes `registerTrait(name, handler)` — e.g. `@holoscript/core`
 * HoloScriptRuntime. This is the consumption path the dead-wired tier was
 * missing: after this call the runtime's directive dispatch (applyDirectives /
 * updateTraits) will invoke the DSM frame solver for `@dsm_frame_2d` orbs.
 */
export function registerCivilEngineeringTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, CIVIL_ENGINEERING_PLUGIN_ID, [dsmFrame2dHandler]);
}
