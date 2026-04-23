/**
 * Runtime context factory — extracted from HoloScriptRuntime (W1-T4 slice 10)
 *
 * Produces a fresh `RuntimeContext` with empty containers for every
 * mutable runtime field (variables, functions, spatial memory,
 * state machines, quests, …). Called on construction and on reset.
 *
 * **Pattern**: pure factory — no parameters, no `this` binding, no
 * side effects. Pattern 1 (pure helper).
 *
 * **Defaults rationale**:
 *   - `currentScale: 1` / `scaleMagnitude: 'standard'` — Scale
 *     stack starts at neutral; ScaleNode execution stacks multipliers.
 *   - `environment: {}` — EnvironmentNode.settings spreads into this.
 *   - `state: createState({})` — empty reactive state root.
 *   - `completedQuests: new Set()` — completion tracker for
 *     QuestNode lifecycle; separate from `quests` Map so iteration
 *     order is preserved there.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 *
 * **See**: W1-T4 slice 10 (W4-T3 §Wave-1 split backlog)
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 2415-2437)
 */

import { createState } from '../ReactiveState';
import type { RuntimeContext } from '../types';

/**
 * Build a fresh, empty runtime context. Every call produces an
 * independent set of Maps / Sets / arrays — no shared mutable state
 * between returned contexts.
 */
export function createEmptyContext(): RuntimeContext {
  return {
    variables: new Map(),
    functions: new Map(),
    exports: new Map(),
    connections: [],
    spatialMemory: new Map(),
    hologramState: new Map(),
    executionStack: [],
    currentScale: 1,
    scaleMagnitude: 'standard',
    focusHistory: [],
    environment: {},
    templates: new Map(),
    // HS+ State
    state: createState({}),
    // Phase 13: State Machines
    stateMachines: new Map(),
    // Narrative & Story State
    quests: new Map(),
    completedQuests: new Set(),
  };
}
