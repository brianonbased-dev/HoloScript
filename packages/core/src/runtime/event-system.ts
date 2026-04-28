/**
 * Event system — extracted from HoloScriptRuntime (W1-T4 slice 29).
 *
 * The HARDEST remaining slice per the task description — closes
 * board task task_1776940755302_cbh5. Hard because emit() is
 * deeply recursive: it calls forwardToTraits() which builds a
 * TraitContext whose .emit() callback loops back into emit().
 *
 * The recursion works cleanly inside a single module because
 * both emit and forwardToTraits are plain functions — the
 * TraitContext.emit captures the ctx closure and re-enters
 * emit(event, data, ctx) without going through HSR.
 *
 * Covers five helpers:
 *   - `on(event, handler, ctx)` — register listener
 *   - `off(event, handler?, ctx)` — unregister (all if no handler)
 *   - `emit(event, data, ctx)` — 5-stage dispatch (dotted routing,
 *     agent broadcast, trait forwarding, local handlers, global
 *     bus + state machine transition)
 *   - `forwardToTraits(orb, event, data, ctx)` — invoke trait
 *     `onEvent` handlers with a scale-aware TraitContext
 *   - `triggerUIEvent(elementName, eventType, data, ctx)` —
 *     update element.value + fire a dotted `${element}.${event}`
 *
 * **Pattern**: fat context (pattern 5) — 8 fields, 3 callback
 * delegates. Context bag is built once per HSR method dispatch
 * and reused through the recursion.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts
 * (notably L15 emit unhandled event → absence of effect).
 *
 * **See**: W1-T4 slice 29 / board task task_1776940755302_cbh5
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 1171-1293)
 */

import { logger } from '../logger';
import type { HoloScriptValue, VRTraitName } from '../types';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import type { TraitContext, TraitEvent, TraitHandler } from '../traits/TraitTypes';

type EventHandler = (data?: HoloScriptValue) => void | Promise<void>;

interface AgentRuntime {
  onEvent(event: string, data?: unknown): Promise<void>;
}

interface UIElementState {
  type: string;
  name: string;
  properties: Record<string, HoloScriptValue>;
  value?: HoloScriptValue;
  visible: boolean;
  enabled: boolean;
}

/**
 * Context threaded into every event-system function. 8 fields:
 * 5 state containers + 3 callback delegates for engine-level
 * services (global bus emit + state-machine interpreter + current
 * scale accessor).
 */
export interface EventSystemContext {
  /** Local event-handler registry (on / off / emit local pass). */
  eventHandlers: Map<string, EventHandler[]>;
  /** Agent-runtime registry (emit dotted routing + broadcast). */
  agentRuntimes: Map<string, AgentRuntime>;
  /** Variable registry (emit dotted orb lookup + broadcast scan). */
  variables: Map<string, HoloScriptValue>;
  /** Trait-handler registry (forwardToTraits dispatch). */
  traitHandlers: Map<VRTraitName, TraitHandler<unknown>>;
  /** UI element registry (triggerUIEvent lookup + value update). */
  uiElements: Map<string, UIElementState>;
  /** Current-scale accessor — threaded into TraitContext builders. */
  getCurrentScale: () => number;
  /** Global event-bus emit (shared singleton — one of the last emit stages). */
  globalBusEmit: (event: string, data: HoloScriptValue) => Promise<void>;
  /** State-machine interpreter event dispatch (by node id). */
  sendStateMachineEvent: (id: string, event: string) => void;
}

/**
 * Register an event handler. Appends to the handlers array for
 * `event` (creates the array if absent).
 */
export function onEvent(
  event: string,
  handler: EventHandler,
  ctx: EventSystemContext,
): void {
  const handlers = ctx.eventHandlers.get(event) || [];
  handlers.push(handler);
  ctx.eventHandlers.set(event, handlers);
}

/**
 * Unregister an event handler. If `handler` is absent, removes
 * ALL handlers for the event (mirrors legacy HSR behavior).
 */
export function offEvent(
  event: string,
  handler: EventHandler | undefined,
  ctx: EventSystemContext,
): void {
  if (!handler) {
    ctx.eventHandlers.delete(event);
  } else {
    const handlers = ctx.eventHandlers.get(event) || [];
    ctx.eventHandlers.set(
      event,
      handlers.filter((h) => h !== handler),
    );
  }
}

/**
 * Emit an event through all five dispatch stages:
 *   1. Dotted routing: `target.event` routes to the agent runtime
 *      named `target` AND forwards to that orb's trait handlers.
 *   2. Agent broadcast: every registered agentRuntime receives
 *      the full event name.
 *   3. Trait broadcast: every orb in variables receives the
 *      event through its trait handlers.
 *   4. Local handlers: registered `on(event, ...)` callbacks fire.
 *   5. Global bus + state-machine transition: emitted to shared
 *      bus; if data.id is present, state-machine interpreter
 *      receives the event.
 */
export async function emit(
  event: string,
  data: unknown,
  ctx: EventSystemContext,
): Promise<void> {
  logger.info(`[Runtime] Emitting event: ${event}`, data as Record<string, unknown>);

  // Stage 1: dotted routing
  if (event.includes('.')) {
    const [target, eventName] = event.split('.');
    const agent = ctx.agentRuntimes.get(target);
    if (agent) {
      await agent.onEvent(eventName, data);
    }

    const orb = ctx.variables.get(target);
    if (orb && typeof orb === 'object' && (orb as Record<string, unknown>).__type === 'orb') {
      await forwardToTraits(orb as Record<string, unknown>, eventName, data, ctx);
    }
  }

  // Stage 2 + 3: broadcast to agents and orbs
  const orbs = Array.from(ctx.variables.values()).filter(
    (v) => v && typeof v === 'object' && (v as Record<string, unknown>).__type === 'orb',
  );
  for (const agent of ctx.agentRuntimes.values()) {
    await agent.onEvent(event, data);
  }

  for (const variable of orbs) {
    await forwardToTraits(variable as Record<string, unknown>, event, data, ctx);
  }

  // Stage 4: local listeners
  const handlers = ctx.eventHandlers.get(event) || [];
  for (const handler of handlers) {
    try {
      await handler(data as HoloScriptValue);
    } catch (error) {
      logger.error('Event handler error', { event, error });
    }
  }

  // Stage 5: global bus + state machine transition
  await ctx.globalBusEmit(event, data as HoloScriptValue);

  if (data && typeof data === 'object' && (data as Record<string, unknown>).id) {
    ctx.sendStateMachineEvent((data as Record<string, unknown>).id as string, event);
  }
}

/**
 * Invoke trait `onEvent` handlers on an orb's directives.
 * Builds a minimal TraitContext whose `.emit()` callback loops
 * back through `emit(..., ctx)` so trait-triggered emits follow
 * the same full dispatch chain as direct calls.
 */
export async function forwardToTraits(
  orb: Record<string, unknown>,
  event: string,
  data: unknown,
  ctx: EventSystemContext,
): Promise<void> {
  if (!orb.directives) return;

  for (const d of orb.directives as Array<Record<string, unknown>>) {
    if (d.type !== 'trait') continue;

    const handler = ctx.traitHandlers.get(d.name as VRTraitName);
    if (!handler || !handler.onEvent) continue;

    const traitNode = orb as unknown as HSPlusNode;
    const eventPayload: TraitEvent = {
      type: event,
      ...(data && typeof data === 'object' ? (data as Record<string, unknown>) : {}),
    };
    await handler.onEvent(
      traitNode,
      (d.config as Record<string, unknown>) || {},
      {
        emit: async (e: string, p: HoloScriptValue) => await emit(e, p, ctx),
        getScaleMultiplier: () => ctx.getCurrentScale() || 1,
      } as unknown as TraitContext,
      eventPayload,
    );
  }
}

/**
 * Trigger a UI event. Updates element.value on `change` events
 * with a defined data payload, then emits the dotted
 * `${elementName}.${eventType}` event through the full chain.
 */
export async function triggerUIEvent(
  elementName: string,
  eventType: string,
  data: unknown,
  ctx: EventSystemContext,
): Promise<void> {
  const element = ctx.uiElements.get(elementName);
  if (!element) {
    logger.warn('UI element not found', { elementName });
    return;
  }

  if (eventType === 'change' && data !== undefined) {
    element.value = data as HoloScriptValue;
  }

  await emit(`${elementName}.${eventType}`, data, ctx);
}
