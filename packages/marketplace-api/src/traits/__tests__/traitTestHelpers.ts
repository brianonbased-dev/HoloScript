/**
 * Minimal trait harness for economy / x402 tests (no dependency on core trait test utils).
 */

export interface MockTraitContext {
  emittedEvents: { event: string; data: unknown }[];
  emit: (event: string, data?: unknown) => void;
}

export function createMockContext(): MockTraitContext {
  const emittedEvents: { event: string; data: unknown }[] = [];
  return {
    emittedEvents,
    emit(event: string, data?: unknown) {
      emittedEvents.push({ event, data });
    },
  };
}

export function createMockNode(id: string): Record<string, unknown> {
  return { id };
}

type TraitLike = {
  defaultConfig?: Record<string, unknown>;
  onAttach?: (node: unknown, config: unknown, ctx: unknown) => void;
  onEvent?: (node: unknown, config: unknown, ctx: unknown, event: unknown) => void;
};

export function attachTrait(
  handler: TraitLike,
  node: Record<string, unknown>,
  config: Record<string, unknown>,
  ctx: MockTraitContext
): void {
  const fullConfig = { ...(handler.defaultConfig ?? {}), ...config };
  handler.onAttach?.(node, fullConfig, ctx);
}

export function sendEvent(
  handler: TraitLike,
  node: Record<string, unknown>,
  config: Record<string, unknown>,
  ctx: MockTraitContext,
  event: Record<string, unknown>
): void {
  const fullConfig = { ...(handler.defaultConfig ?? {}), ...config };
  handler.onEvent?.(node, fullConfig, ctx, event);
}

export function getEventCount(ctx: MockTraitContext, name: string): number {
  return ctx.emittedEvents.filter((e) => e.event === name).length;
}

export function getLastEvent(ctx: MockTraitContext, name: string): unknown {
  const list = ctx.emittedEvents.filter((e) => e.event === name);
  return list[list.length - 1]?.data;
}
