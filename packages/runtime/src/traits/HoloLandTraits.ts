/**
 * HoloLandTraits — runtime-side adapters for the @stat / @luck / @encounter / @drop_table
 * sovereign trait family (merge 5a8ea2191).
 *
 * Pattern: per-trait runtime wrapper (RULING 2 pilot, same as NeuralAnimationHandler).
 * The core handlers live in @holoscript/core/traits and are event-protocol only.
 * These adapters bridge them to the runtime TraitSystem (THREE.Object3D + PhysicsWorld).
 *
 * Lifecycle:
 *   onApply  → cast object to HSPlusNode, build a minimal core TraitContext with emit,
 *              call core handler onAttach, store core context in data for event reuse
 *   onUpdate → @encounter evaluates proximity/interaction/time/state conditions and
 *              dispatches encounter:check events; other traits are passive
 *   onRemove → call core handler onDetach, clear node state
 *
 * Composition:
 *   @stat + @luck attach to agent/item nodes.
 *   @encounter attaches to scene / trigger-zone nodes.
 *   @drop_table attaches to loot-source nodes.
 *   Consumers compose by sending events (stat:set, luck:roll, drop_table:roll) and
 *   listening for the emitted results.
 */

import * as THREE from 'three';
import type {
  TraitContext as CoreTraitContext,
  HSPlusNode,
  StatConfig,
  LuckConfig,
  EncounterConfig,
  DropTableConfig,
} from '@holoscript/core';
import {
  statHandler,
  luckHandler,
  encounterHandler,
  dropTableHandler,
  extractPayload,
} from '@holoscript/core';
import type { TraitContext, TraitHandler } from './TraitSystem';
import { dispatchCustomEvent } from '../runtime-types';

// =============================================================================
// BRIDGE HELPERS
// =============================================================================

/**
 * Cast a THREE.Object3D to the HSPlusNode shape the core handlers expect.
 * Core handlers only touch `name` and `__*State` properties, so structural
 * compatibility is safe.
 */
function asHSPlusNode(object: THREE.Object3D): HSPlusNode {
  return object as unknown as HSPlusNode;
}

/**
 * Minimal core TraitContext with only `emit` wired to THREE.Object3D custom events.
 * Core handlers for this family only use `emit`; other fields are no-ops.
 */
function makeCoreContext(runtimeCtx: TraitContext): CoreTraitContext {
  return {
    emit: (event: string, payload?: unknown) => {
      dispatchCustomEvent(runtimeCtx.object, {
        type: event,
        ...(payload as Record<string, unknown> ?? {}),
      });
    },
    vr: {
      hands: { left: null, right: null },
      headset: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      getPointerRay: () => null,
      getDominantHand: () => null,
    },
    physics: {
      applyVelocity: () => {},
      applyAngularVelocity: () => {},
      setKinematic: () => {},
      raycast: () => null,
      getBodyPosition: () => null,
      getBodyVelocity: () => null,
    },
    audio: { playSound: () => {} },
    haptics: { pulse: () => {}, rumble: () => {} },
    getState: () => ({}),
    setState: () => {},
    getScaleMultiplier: () => 1,
    setScaleContext: () => {},
  } as unknown as CoreTraitContext;
}

/** Find the first camera in the object's scene graph. */
function findCamera(root: THREE.Object3D): THREE.Camera | null {
  let camera: THREE.Camera | null = null;
  root.traverse((child) => {
    if (!camera && (child as THREE.Camera).isCamera) {
      camera = child as THREE.Camera;
    }
  });
  return camera;
}

/** Find an object by name in the scene graph. */
function findObjectByName(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((child) => {
    if (!found && child.name === name) {
      found = child;
    }
  });
  return found;
}

// =============================================================================
// @stat — Attribute carrier for agent / item nodes
// =============================================================================

export const StatTrait: TraitHandler = {
  name: 'stat',

  onApply(context: TraitContext) {
    const node = asHSPlusNode(context.object);
    const config = context.config as unknown as StatConfig;
    const coreCtx = makeCoreContext(context);
    statHandler.onAttach?.(node, config, coreCtx);
    context.data._coreCtx = coreCtx;
  },

  onUpdate() {
    // Passive — responds to stat:set / stat:modify / stat:query events only
  },

  onRemove(context: TraitContext) {
    const node = asHSPlusNode(context.object);
    const config = context.config as unknown as StatConfig;
    const coreCtx = context.data._coreCtx as CoreTraitContext;
    statHandler.onDetach?.(node, config, coreCtx);
    delete context.data._coreCtx;
  },
};

/** Send a `stat:set` event to a node with @stat attached. */
export function setStat(context: TraitContext, value: number): void {
  const node = asHSPlusNode(context.object);
  const config = context.config as unknown as StatConfig;
  const coreCtx = context.data._coreCtx as CoreTraitContext;
  if (!coreCtx) return;
  statHandler.onEvent?.(node, config, coreCtx, {
    type: 'stat:set',
    payload: { value },
  });
}

/** Send a `stat:modify` event to a node with @stat attached. */
export function modifyStat(context: TraitContext, source: string, delta: number): void {
  const node = asHSPlusNode(context.object);
  const config = context.config as unknown as StatConfig;
  const coreCtx = context.data._coreCtx as CoreTraitContext;
  if (!coreCtx) return;
  statHandler.onEvent?.(node, config, coreCtx, {
    type: 'stat:modify',
    payload: { source, delta },
  });
}

/** Send a `stat:query` event to a node with @stat attached. */
export function queryStat(context: TraitContext, queryId?: string): void {
  const node = asHSPlusNode(context.object);
  const config = context.config as unknown as StatConfig;
  const coreCtx = context.data._coreCtx as CoreTraitContext;
  if (!coreCtx) return;
  statHandler.onEvent?.(node, config, coreCtx, {
    type: 'stat:query',
    payload: { queryId },
  });
}

// =============================================================================
// @luck — Seeded RNG modifier for agent / item nodes
// =============================================================================

export const LuckTrait: TraitHandler = {
  name: 'luck',

  onApply(context: TraitContext) {
    const node = asHSPlusNode(context.object);
    const config = context.config as unknown as LuckConfig;
    const coreCtx = makeCoreContext(context);
    luckHandler.onAttach?.(node, config, coreCtx);
    context.data._coreCtx = coreCtx;
  },

  onUpdate() {
    // Passive — responds to luck:roll events only
  },

  onRemove(context: TraitContext) {
    const node = asHSPlusNode(context.object);
    const config = context.config as unknown as LuckConfig;
    const coreCtx = context.data._coreCtx as CoreTraitContext;
    luckHandler.onDetach?.(node, config, coreCtx);
    delete context.data._coreCtx;
  },
};

/** Send a `luck:roll` event to a node with @luck attached. */
export function rollLuck(context: TraitContext, threshold?: number, rollId?: string): void {
  const node = asHSPlusNode(context.object);
  const config = context.config as unknown as LuckConfig;
  const coreCtx = context.data._coreCtx as CoreTraitContext;
  if (!coreCtx) return;
  luckHandler.onEvent?.(node, config, coreCtx, {
    type: 'luck:roll',
    payload: { threshold, rollId },
  });
}

// =============================================================================
// @encounter — Trigger registry for scene / zone nodes
// =============================================================================

export const EncounterTrait: TraitHandler = {
  name: 'encounter',

  onApply(context: TraitContext) {
    const node = asHSPlusNode(context.object);
    const config = context.config as unknown as EncounterConfig;
    const coreCtx = makeCoreContext(context);
    encounterHandler.onAttach?.(node, config, coreCtx);
    context.data._coreCtx = coreCtx;
    context.data._lastCheckMs = 0;
    context.data._checkIntervalMs = (context.config.check_interval as number) ?? 200;
  },

  onUpdate(context: TraitContext, delta: number) {
    const now = Date.now();
    const lastCheck = (context.data._lastCheckMs as number) ?? 0;
    const interval = (context.data._checkIntervalMs as number) ?? 200;
    if (now - lastCheck < interval) return;
    context.data._lastCheckMs = now;

    const config = context.config as unknown as EncounterConfig;
    const node = asHSPlusNode(context.object);
    const coreCtx = context.data._coreCtx as CoreTraitContext;
    if (!coreCtx) return;

    let conditionMet = false;
    const triggerType = config.triggerType;

    if (triggerType === 'proximity') {
      conditionMet = checkProximityTrigger(context);
    } else if (triggerType === 'interaction') {
      conditionMet = checkInteractionTrigger(context);
    } else if (triggerType === 'time') {
      conditionMet = checkTimeTrigger(context, now);
    } else if (triggerType === 'state') {
      conditionMet = checkStateTrigger(context);
    }

    if (conditionMet) {
      encounterHandler.onEvent?.(node, config, coreCtx, {
        type: 'encounter:check',
        payload: { conditionMet: true, now, data: context.object.userData.encounterData },
      });
    }
  },

  onRemove(context: TraitContext) {
    const node = asHSPlusNode(context.object);
    const config = context.config as unknown as EncounterConfig;
    const coreCtx = context.data._coreCtx as CoreTraitContext;
    encounterHandler.onDetach?.(node, config, coreCtx);
    delete context.data._coreCtx;
    delete context.data._lastCheckMs;
    delete context.data._checkIntervalMs;
  },
};

function checkProximityTrigger(context: TraitContext): boolean {
  const radius = (context.config.proximity_radius as number) ?? 5;
  const targetName = (context.config.proximity_target as string) || '';

  let root: THREE.Object3D | null = context.object;
  while (root && root.parent) {
    root = root.parent;
  }
  if (!root) return false;

  let target: THREE.Object3D | null = null;
  if (targetName) {
    target = findObjectByName(root, targetName);
  }
  if (!target) {
    // Default to camera / player
    target = findCamera(root);
  }
  if (!target) return false;

  const selfPos = new THREE.Vector3();
  context.object.getWorldPosition(selfPos);
  const targetPos = new THREE.Vector3();
  target.getWorldPosition(targetPos);
  return selfPos.distanceTo(targetPos) <= radius;
}

function checkInteractionTrigger(context: TraitContext): boolean {
  const interacted = context.object.userData.interacted === true;
  if (interacted) {
    // Consume the one-shot flag so it doesn't re-fire immediately
    context.object.userData.interacted = false;
  }
  return interacted;
}

function checkTimeTrigger(context: TraitContext, now: number): boolean {
  const intervalMs = (context.config.time_interval as number) ?? 60000;
  const lastFire = (context.object.userData._encounterLastFire as number) ?? 0;
  if (now - lastFire >= intervalMs) {
    context.object.userData._encounterLastFire = now;
    return true;
  }
  return false;
}

function checkStateTrigger(context: TraitContext): boolean {
  const key = (context.config.state_key as string) || '';
  const expected = context.config.state_value;
  if (!key) return false;
  return context.object.userData[key] === expected;
}

/** Manually reset an encounter's cooldown. */
export function resetEncounter(context: TraitContext): void {
  const node = asHSPlusNode(context.object);
  const config = context.config as unknown as EncounterConfig;
  const coreCtx = context.data._coreCtx as CoreTraitContext;
  if (!coreCtx) return;
  encounterHandler.onEvent?.(node, config, coreCtx, {
    type: 'encounter:reset',
    payload: {},
  });
}

// =============================================================================
// @drop_table — Weighted picker for loot / outcome nodes
// =============================================================================

export const DropTableTrait: TraitHandler = {
  name: 'drop_table',

  onApply(context: TraitContext) {
    const node = asHSPlusNode(context.object);
    const config = context.config as unknown as DropTableConfig;
    const coreCtx = makeCoreContext(context);
    dropTableHandler.onAttach?.(node, config, coreCtx);
    context.data._coreCtx = coreCtx;
  },

  onUpdate() {
    // Passive — responds to drop_table:roll events only
  },

  onRemove(context: TraitContext) {
    const node = asHSPlusNode(context.object);
    const config = context.config as unknown as DropTableConfig;
    const coreCtx = context.data._coreCtx as CoreTraitContext;
    dropTableHandler.onDetach?.(node, config, coreCtx);
    delete context.data._coreCtx;
  },
};

/** Send a `drop_table:roll` event to a node with @drop_table attached. */
export function rollDropTable(
  context: TraitContext,
  opts?: { rollId?: string; luckBonus?: number; seed?: number }
): void {
  const node = asHSPlusNode(context.object);
  const config = context.config as unknown as DropTableConfig;
  const coreCtx = context.data._coreCtx as CoreTraitContext;
  if (!coreCtx) return;
  dropTableHandler.onEvent?.(node, config, coreCtx, {
    type: 'drop_table:roll',
    payload: opts ?? {},
  });
}
