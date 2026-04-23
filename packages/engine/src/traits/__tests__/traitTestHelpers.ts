import { vi } from 'vitest';

type AnyRecord = Record<string, any>;

type TraitHandlerLike = {
  onAttach?: (node: AnyRecord, config: AnyRecord, context: AnyRecord) => void;
  onUpdate?: (node: AnyRecord, config: AnyRecord, context: AnyRecord, delta: number) => void;
  onEvent?: (node: AnyRecord, config: AnyRecord, context: AnyRecord, event: AnyRecord) => void;
  onDetach?: (node: AnyRecord, config: AnyRecord, context: AnyRecord) => void;
};

export function createMockNode(name = 'node'): AnyRecord {
  const components = new Map<string, unknown>();

  return {
    id: `${name}-id`,
    name,
    type: 'object',
    parent: null,
    children: [] as AnyRecord[],
    properties: {},
    metadata: {},
    components,
    pose: {
      translation: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },

    addChild: vi.fn((child: AnyRecord) => {
      child.parent = name;
    }),
    removeChild: vi.fn(),

    addComponent: vi.fn((component: unknown) => {
      const key = typeof component === 'string' ? component : `component_${components.size}`;
      components.set(String(key), component);
    }),
    removeComponent: vi.fn((key: string) => components.delete(key)),
    getComponent: vi.fn((key: string) => components.get(key)),
    hasComponent: vi.fn((key: string) => components.has(key)),

    setPose: vi.fn(),
    emit: vi.fn(),
  };
}

export function createMockContext(initialState: AnyRecord = {}): AnyRecord {
  const events: Array<{ type: string; payload?: AnyRecord }> = [];
  const emittedEvents: Array<{ event: string; data?: AnyRecord }> = [];
  let state = { ...initialState };

  return {
    now: vi.fn(() => Date.now()),

    getState: vi.fn(() => state),
    setState: vi.fn((next: AnyRecord) => {
      state = { ...state, ...next };
    }),

    emit: vi.fn((type: string, payload?: AnyRecord) => {
      events.push({ type, payload });
      emittedEvents.push({ event: type, data: payload });
    }),

    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },

    __events: events,
    emittedEvents,
  };
}

export function attachTrait(
  handler: TraitHandlerLike,
  node: AnyRecord,
  config: AnyRecord,
  context: AnyRecord
): void {
  handler.onAttach?.(node, config, context);
}

export function updateTrait(
  handler: TraitHandlerLike,
  node: AnyRecord,
  config: AnyRecord,
  context: AnyRecord,
  delta: number
): void {
  handler.onUpdate?.(node, config, context, delta);
}

export function sendEvent(
  handler: TraitHandlerLike,
  node: AnyRecord,
  config: AnyRecord,
  context: AnyRecord,
  event: AnyRecord
): void {
  handler.onEvent?.(node, config, context, event);
}

export function getEventCount(context: AnyRecord): number {
  return Array.isArray(context?.__events) ? context.__events.length : 0;
}

export function getLastEvent(context: AnyRecord): { type: string; payload?: AnyRecord } | undefined {
  if (!Array.isArray(context?.__events) || context.__events.length === 0) return undefined;
  return context.__events[context.__events.length - 1];
}
