/**
 * Test Helpers for Handler-based Traits
 *
 * Provides utilities to test TraitHandler implementations
 */

import type { TraitHandler } from '../TraitTypes';
import type { HSPlusNode } from '../../types/HoloScriptPlus';

export interface MockContext {
  emit: (event: string, data: unknown) => void;
  emittedEvents: Array<{ event: string; data: unknown }>;
  clearEvents: () => void;
}

export function createMockContext(): MockContext {
  const emittedEvents: Array<{ event: string; data: unknown }> = [];
  return {
    emit(event: string, data: unknown) {
      emittedEvents.push({ event, data });
    },
    emittedEvents,
    clearEvents() {
      emittedEvents.length = 0;
    },
  };
}

export function createMockNode(id: string = 'test-node'): Record<string, unknown> {
  return { id, name: id };
}

export function getLastEvent(ctx: MockContext, eventType: string) {
  for (let i = ctx.emittedEvents.length - 1; i >= 0; i--) {
    if (ctx.emittedEvents[i].event === eventType) {
      return ctx.emittedEvents[i].data;
    }
  }
  return undefined;
}

export function getEventCount(ctx: MockContext, eventType: string): number {
  return ctx.emittedEvents.filter((e) => e.event === eventType).length;
}

export function attachTrait<T>(
  handler: TraitHandler<T>,
  node: Record<string, unknown>,
  config: Partial<T>,
  ctx: MockContext
): void {
  const fullConfig = { ...handler.defaultConfig, ...config } as T;
  handler.onAttach?.(node as unknown as HSPlusNode, fullConfig, ctx as any);
}

export function sendEvent<T>(
  handler: TraitHandler<T>,
  node: Record<string, unknown>,
  config: Partial<T>,
  ctx: MockContext,
  event: { type: string; [key: string]: unknown }
): void {
  const fullConfig = { ...handler.defaultConfig, ...config } as T;
  handler.onEvent?.(node as unknown as HSPlusNode, fullConfig, ctx as any, event);
}

export function updateTrait<T>(
  handler: TraitHandler<T>,
  node: Record<string, unknown>,
  config: Partial<T>,
  ctx: MockContext,
  delta: number
): void {
  const fullConfig = { ...handler.defaultConfig, ...config } as T;
  handler.onUpdate?.(node as unknown as HSPlusNode, fullConfig, ctx as any, delta);
}
