/**
 * Skills + directives — extracted from HoloScriptRuntime (W1-T4 slice 27)
 *
 * Four related orb/skill-lifecycle helpers:
 *   - `loadSkill` — register procedural skill, merge successRate with
 *     existing, broadcast over mesh via StateSynchronizer.
 *   - `applyDirectives` — walk orb.directives invoking trait handlers,
 *     merge @state into properties, run @lifecycle on_mount hooks.
 *   - `isAgent` — predicate: does this orb have an llm_agent / agent /
 *     companion trait directive?
 *   - `updateTraits` — per-frame: for each orb with trait directives,
 *     invoke handler.onUpdate with a TraitContext (emit, position sync,
 *     node lookup, state read/write).
 *
 * **Pattern**: mixed — isAgent is pure (pattern 1), loadSkill is
 * state-container (pattern 4), applyDirectives + updateTraits use
 * multi-callback context (pattern 5).
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 *
 * **See**: W1-T4 slice 27 / board task task_1776941604694_1bqh
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 2423-2440, 2511-2554, 2576-2584, 2615-2668)
 */

import { logger } from '../logger';
import type {
  ASTNode,
  HologramShape,
  HoloScriptValue,
  HSPlusNode,
  HSPlusDirective,
  OrbNode,
  ProceduralSkill,
  ReactiveState,
  TraitContext,
  TraitHandler,
  VRTraitName,
} from '../types';

/** One tick at 60fps — used as the dt for trait.onUpdate calls. */
const TRAIT_UPDATE_DT = 1 / 60;
/** Logging cadence: every 60th of a day (Julian) ≈ every 60 ticks. */
const TRAIT_UPDATE_LOG_MODULO = 60;

// ──────────────────────────────────────────────────────────────────
// loadSkill
// ──────────────────────────────────────────────────────────────────

/**
 * Context for loadSkill: the caller owns the skills Map + the mesh
 * broadcast callback (avoids pulling StateSynchronizer into the module).
 */
export interface LoadSkillContext {
  proceduralSkills: Map<string, ProceduralSkill>;
  broadcastSkill: (skill: ProceduralSkill) => void;
}

/**
 * Register a procedural skill. If a skill with the same id already
 * exists, the successRate is averaged with the incoming value (mesh
 * deduplication behavior). Broadcasts the registered skill via the
 * supplied callback so peers on the mesh learn about it.
 */
export function loadSkill(skill: ProceduralSkill, ctx: LoadSkillContext): void {
  logger.info(`[Procedural] Loading skill: ${skill.name} (${skill.id})`);

  const existing = ctx.proceduralSkills.get(skill.id);
  if (existing) {
    skill.successRate = (existing.successRate + (skill.successRate || 0)) / 2;
  } else {
    skill.successRate = skill.successRate || 0;
  }

  ctx.proceduralSkills.set(skill.id, skill);
  ctx.broadcastSkill(skill);
}

// ──────────────────────────────────────────────────────────────────
// isAgent
// ──────────────────────────────────────────────────────────────────

/** Trait names that mark an orb as an LLM-backed agent. */
const AGENT_TRAIT_NAMES = new Set(['llm_agent', 'agent', 'companion']);

/**
 * Predicate: does this orb carry an agent-trait directive?
 * Pure — no state, no callbacks.
 */
export function isAgent(node: OrbNode): boolean {
  return !!node.directives?.some(
    (d) => d.type === 'trait' && AGENT_TRAIT_NAMES.has((d as { name: string }).name),
  );
}

// ──────────────────────────────────────────────────────────────────
// applyDirectives
// ──────────────────────────────────────────────────────────────────

/** Context for applyDirectives — trait handlers, emit, state, expression eval. */
export interface ApplyDirectivesContext {
  traitHandlers: Map<VRTraitName, TraitHandler<Record<string, unknown>>>;
  emit: (event: string, payload?: unknown) => void;
  getCurrentScale: () => number;
  state: ReactiveState;
  evaluateExpression: (expr: string) => HoloScriptValue;
}

/**
 * Walk `node.directives` applying each by type:
 *   - `trait` — invoke handler.onAttach with a minimal TraitContext.
 *               Special-case: `chat` trait emits `show-chat`.
 *   - `state` — for orb nodes, merge state body into properties
 *               (defaults-only — never overwrite runtime-modified
 *               values). Then apply to global reactive state.
 *   - `lifecycle` — on_mount / mount hooks evaluate their body.
 *
 * No-op if `node.directives` is absent.
 */
export function applyDirectives(node: ASTNode, ctx: ApplyDirectivesContext): void {
  if (!node.directives) return;

  for (const d of node.directives) {
    if (d.type === 'trait') {
      logger.info(`Applying trait ${d.name} to ${node.type}`);

      const handler = ctx.traitHandlers.get(d.name as VRTraitName);
      if (handler) {
        handler.onAttach?.(node as unknown as HSPlusNode, d.config || {}, {
          emit: (event: string, payload: unknown) => ctx.emit(event, payload),
          getScaleMultiplier: () => ctx.getCurrentScale() || 1,
        } as unknown as TraitContext);
      }

      // Special case: chat trait emits show-chat event
      if (d.name === 'chat') {
        ctx.emit('show-chat', d.config);
      }
    } else if (d.type === 'state') {
      // For orb nodes: merge state body into properties (defaults-only,
      // never overwrite runtime-modified values)
      if (node && (node as unknown as Record<string, unknown>).__type === 'orb') {
        const stateBody = d.body as Record<string, HoloScriptValue>;
        const existingProps =
          ((node as unknown as Record<string, unknown>).properties as Record<
            string,
            HoloScriptValue
          >) || {};
        for (const [key, val] of Object.entries(stateBody)) {
          if (existingProps[key] === undefined) {
            existingProps[key] = val;
          }
        }
        (node as unknown as Record<string, unknown>).properties = existingProps;
      }
      ctx.state.update(d.body as Record<string, HoloScriptValue>);
    } else if (d.type === 'lifecycle') {
      if (d.hook === 'on_mount' || d.hook === 'mount') {
        ctx.evaluateExpression(d.body);
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────
// updateTraits
// ──────────────────────────────────────────────────────────────────

/** Context for per-frame trait updates. */
export interface UpdateTraitsContext {
  variables: Map<string, HoloScriptValue>;
  traitHandlers: Map<VRTraitName, TraitHandler<Record<string, unknown>>>;
  emit: (event: string, payload?: unknown) => void | Promise<void>;
  getCurrentScale: () => number;
  setOrbPosition: (name: string, position: [number, number, number]) => void;
  getState: () => Record<string, HoloScriptValue>;
  setState: (updates: Record<string, HoloScriptValue>) => void;
}

/**
 * Per-frame trait update. For each orb in variables with trait
 * directives, invoke handler.onUpdate with a full TraitContext
 * (emit with position_update sync, node lookup, state read/write,
 * scale accessor, julianDate).
 *
 * Position updates emitted by traits are intercepted and routed
 * through `setOrbPosition` so the visualizer stays in sync with
 * the authoritative variable key.
 */
export function updateTraits(julianDate: number, ctx: UpdateTraitsContext): void {
  const delta = TRAIT_UPDATE_DT;
  const _isLogFrame = Math.floor(julianDate * 1440) % TRAIT_UPDATE_LOG_MODULO === 0;
  // Logging kept off by default — uncomment in the handler below if useful
  void _isLogFrame;

  for (const [name, value] of ctx.variables.entries()) {
    if (value && typeof value === 'object' && (value as Record<string, unknown>).__type === 'orb') {
      const orb = value as Record<string, unknown>;
      if (!orb.directives) continue;

      for (const d of (orb.directives as Array<Record<string, unknown>>) || []) {
        if (d.type !== 'trait') continue;

        const handler = ctx.traitHandlers.get(d.name as VRTraitName);
        if (!handler || !handler.onUpdate) continue;

        const traitNode = orb as unknown as HSPlusNode;
        handler.onUpdate(
          traitNode,
          (d.config as Record<string, unknown>) || {},
          {
            emit: (event: string, payload: unknown) => {
              if (event === 'position_update') {
                const posPayload = payload as Record<string, unknown> | undefined;
                if (posPayload?.position) {
                  const p = posPayload.position as [number, number, number];
                  const tuple: [number, number, number] = Array.isArray(p)
                    ? p
                    : [p[0], p[1], p[2]];
                  ctx.setOrbPosition(name, tuple);
                }
              }
              return ctx.emit(event, payload);
            },
            getScaleMultiplier: () => ctx.getCurrentScale() || 1,
            julianDate,
            getNode: (nodeName: string) => ctx.variables.get(nodeName),
            getState: () => ctx.getState(),
            setState: (updates: Record<string, HoloScriptValue>) => ctx.setState(updates),
          } as unknown as TraitContext,
          delta,
        );
      }
    }
  }

  // Reference unused import so tree-shaking preserves type compat.
  void (0 as unknown as HologramShape);
}
