/**
 * Primitive command handlers — extracted from HoloScriptRuntime (W1-T4 slice 8)
 *
 * The ten "primitive" builtins — `shop`, `inventory`, `purchase`,
 * `presence`, `invite`, `share`, `physics`, `gravity`, `collide`,
 * `animate` — all follow the same shape: parse a short argv, fire an
 * event through the runtime's emit bus, return a small success
 * envelope.
 *
 * Extracting them to one module:
 *   - centralizes the event-name / envelope-shape contract
 *   - makes each primitive trivially unit-testable with a mock emit
 *   - shrinks HSR by 10 methods (no wrappers needed: all 10 are
 *     only invoked through `builtins.set(name, fn)` in initBuiltins)
 *
 * **Pattern**: callback injection — each primitive takes `emit` as a
 * function parameter rather than binding to `this`. Emits are
 * fire-and-forget (async but not awaited by the dispatcher,
 * matching pre-extraction behavior).
 *
 * Default gravity value (9.81 m/s²) is retained as a bare literal
 * here — it's the same physical constant used in `physics-math.ts`,
 * but the two uses are semantically distinct (arc gravity is
 * compensation; gravity primitive is a world-gravity setpoint).
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 *
 * **See**: W1-T4 slice 8 (W4-T3 §Wave-1 split backlog)
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 2213-2294 — 10 methods deleted, inline lambdas in
 *         initBuiltins now point here)
 */

import type { HoloScriptValue } from '../types';

/** Fire-and-forget event emitter; dispatcher does not await. */
export type EmitFn = (event: string, data?: unknown) => void;

// ──────────────────────────────────────────────────────────────────
// Commerce primitives
// ──────────────────────────────────────────────────────────────────

export function handleShop(args: HoloScriptValue[], emit: EmitFn): HoloScriptValue {
  const config = args[0] || {};
  emit('shop', config);
  return { success: true, type: 'shop', config };
}

export function handleInventory(args: HoloScriptValue[], emit: EmitFn): HoloScriptValue {
  const item = args[0];
  const action = args[1] || 'add';
  emit('inventory', { item, action });
  return { success: true, item, action };
}

export function handlePurchase(args: HoloScriptValue[], emit: EmitFn): HoloScriptValue {
  const productId = args[0];
  emit('purchase', { productId });
  return { success: true, productId, status: 'pending' };
}

// ──────────────────────────────────────────────────────────────────
// Social primitives
// ──────────────────────────────────────────────────────────────────

export function handlePresence(args: HoloScriptValue[], emit: EmitFn): HoloScriptValue {
  const config = args[0] || {};
  emit('presence', config);
  return { success: true, active: true };
}

export function handleInvite(args: HoloScriptValue[], emit: EmitFn): HoloScriptValue {
  const userId = args[0];
  emit('invite', { userId });
  return { success: true, userId };
}

export function handleShare(args: HoloScriptValue[], emit: EmitFn): HoloScriptValue {
  const scriptId = args[0];
  const targetUserId = args[1];
  emit('share', { scriptId, targetUserId });
  return { success: true, scriptId };
}

// ──────────────────────────────────────────────────────────────────
// Physics primitives
// ──────────────────────────────────────────────────────────────────

export function handlePhysics(args: HoloScriptValue[], emit: EmitFn): HoloScriptValue {
  const config = args[0] || {};
  emit('physics', config);
  return {
    success: true,
    enabled: (config as Record<string, unknown>).enabled !== false,
  };
}

export function handleGravity(args: HoloScriptValue[], emit: EmitFn): HoloScriptValue {
  const value = args[0] ?? 9.81;
  emit('gravity', { value });
  return { success: true, value };
}

export function handleCollide(args: HoloScriptValue[], emit: EmitFn): HoloScriptValue {
  const target = args[0];
  const handler = args[1];
  emit('collide', { target, handler });
  return { success: true, target };
}

// ──────────────────────────────────────────────────────────────────
// Animation primitive
// ──────────────────────────────────────────────────────────────────

export function handleAnimate(args: HoloScriptValue[], emit: EmitFn): HoloScriptValue {
  const options = args[0] || {};
  emit('animate', options);
  return { success: true, options };
}
