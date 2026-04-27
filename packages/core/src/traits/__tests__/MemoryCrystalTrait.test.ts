/**
 * MemoryCrystalTrait — comprehensive tests
 */
import { describe, it, expect } from 'vitest';
import { memoryCrystalHandler, type MemoryCrystalConfig } from '../MemoryCrystalTrait';
import type { AgentMemoryState, Memory } from '../AgentMemoryTrait';
import type { HSPlusNode, TraitContext } from '../TraitTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CrystalNode = HSPlusNode & {
  __memoryCrystalState?: unknown;
  __agentMemoryState?: AgentMemoryState;
  traits?: Set<string>;
};

function makeNode(): CrystalNode {
  return { traits: new Set() } as CrystalNode;
}

function makeContext() {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  const context: TraitContext = {
    emit: (type: string, payload?: unknown) => emitted.push({ type, payload }),
  };
  return { context, emitted };
}

const BASE_CONFIG: MemoryCrystalConfig = {
  ...(memoryCrystalHandler.defaultConfig as MemoryCrystalConfig),
};

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  const now = Date.now();
  return {
    id: `m-${Math.random().toString(36).slice(2)}`,
    key: `k-${Math.random().toString(36).slice(2)}`,
    content: 'memory content',
    tags: ['t'],
    embedding: null,
    createdAt: now,
    accessedAt: now,
    accessCount: 1,
    ttl: null,
    source: 'test',
    ...overrides,
  };
}

function setup(
  cfg: Partial<MemoryCrystalConfig> = {},
  withMemory = false,
  includeForgetPolicy = false
): {
  node: CrystalNode;
  config: MemoryCrystalConfig;
  context: TraitContext;
  emitted: Array<{ type: string; payload: unknown }>;
} {
  const node = makeNode();
  if (includeForgetPolicy) node.traits?.add('forget_policy');

  if (withMemory) {
    node.__agentMemoryState = {
      memories: new Map(),
      db: null,
      isReady: true,
      totalStored: 0,
      totalRecalled: 0,
      totalCompressed: 0,
    };
  }

  const { context, emitted } = makeContext();
  const config: MemoryCrystalConfig = { ...BASE_CONFIG, ...cfg };
  memoryCrystalHandler.onAttach(node, config, context);
  emitted.length = 0;
  return { node, config, context, emitted };
}

// ---------------------------------------------------------------------------
// onAttach
// ---------------------------------------------------------------------------

describe('memoryCrystalHandler.onAttach', () => {
  it('initializes crystal state', () => {
    const { node } = setup();
    expect(node.__memoryCrystalState).toBeDefined();
  });

  it('emits crystal_initialized', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    memoryCrystalHandler.onAttach(node, BASE_CONFIG, context);
    expect(emitted.some(e => e.type === 'crystal_initialized')).toBe(true);
  });

  it('crystal_initialized payload includes capacity/backend', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    memoryCrystalHandler.onAttach(node, BASE_CONFIG, context);
    const ev = emitted.find(e => e.type === 'crystal_initialized');
    expect((ev!.payload as any).capacity).toBe(BASE_CONFIG.capacity);
    expect((ev!.payload as any).backend).toBe(BASE_CONFIG.backend);
  });

  it('warns when warn_unpaired=true and forget_policy missing', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    memoryCrystalHandler.onAttach(node, { ...BASE_CONFIG, warn_unpaired: true }, context);
    expect(emitted.some(e => e.type === 'crystal_threshold_warn')).toBe(true);
  });

  it('does not warn unpaired when forget_policy is present', () => {
    const node = makeNode();
    node.traits?.add('forget_policy');
    const { context, emitted } = makeContext();
    memoryCrystalHandler.onAttach(node, { ...BASE_CONFIG, warn_unpaired: true }, context);
    const warns = emitted.filter(e => e.type === 'crystal_threshold_warn');
    expect(warns.length).toBe(0);
  });

  it('does not warn unpaired when warn_unpaired=false', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    memoryCrystalHandler.onAttach(node, { ...BASE_CONFIG, warn_unpaired: false }, context);
    const warns = emitted.filter(e => e.type === 'crystal_threshold_warn');
    expect(warns.length).toBe(0);
  });

  it('emits crystal_error for prune_threshold < 0', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    memoryCrystalHandler.onAttach(node, { ...BASE_CONFIG, prune_threshold: -0.1 }, context);
    expect(emitted.some(e => e.type === 'crystal_error')).toBe(true);
  });

  it('emits crystal_error for prune_threshold > 1', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    memoryCrystalHandler.onAttach(node, { ...BASE_CONFIG, prune_threshold: 1.1 }, context);
    expect(emitted.some(e => e.type === 'crystal_error')).toBe(true);
  });

  it('warns semantic mode fallback when memory state has no db', () => {
    const node = makeNode();
    node.__agentMemoryState = {
      memories: new Map(),
      db: null,
      isReady: true,
      totalStored: 0,
      totalRecalled: 0,
      totalCompressed: 0,
    };
    const { context, emitted } = makeContext();
    memoryCrystalHandler.onAttach(node, { ...BASE_CONFIG, capacity: 'semantic' }, context);
    expect(
      emitted.some(
        e =>
          e.type === 'crystal_threshold_warn' &&
          String((e.payload as any).warning).includes('embedding-capable backend')
      )
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// onDetach
// ---------------------------------------------------------------------------

describe('memoryCrystalHandler.onDetach', () => {
  it('removes __memoryCrystalState', () => {
    const { node } = setup();
    memoryCrystalHandler.onDetach(node);
    expect(node.__memoryCrystalState).toBeUndefined();
  });

  it('is safe if called without state', () => {
    const node = makeNode();
    expect(() => memoryCrystalHandler.onDetach(node)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// onUpdate prerequisites
// ---------------------------------------------------------------------------

describe('memoryCrystalHandler.onUpdate prerequisites', () => {
  it('does nothing if crystal state missing', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    memoryCrystalHandler.onUpdate(node, BASE_CONFIG, context);
    expect(emitted.length).toBe(0);
  });

  it('does nothing if agent memory state missing', () => {
    const { node, config, context, emitted } = setup();
    memoryCrystalHandler.onUpdate(node, config, context);
    expect(emitted.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// onUpdate pruning
// ---------------------------------------------------------------------------

describe('memoryCrystalHandler.onUpdate pruning', () => {
  it('does not prune below threshold', () => {
    const { node, config, context, emitted } = setup(
      { max_entries: 10, prune_threshold: 0.8, capacity: 'raw' },
      true
    );
    const mem = node.__agentMemoryState!;
    for (let i = 0; i < 7; i++) mem.memories.set(`k${i}`, makeMemory({ key: `k${i}` })); // 70%
    memoryCrystalHandler.onUpdate(node, config, context);
    expect(mem.memories.size).toBe(7);
    expect(emitted.some(e => e.type === 'crystal_prune')).toBe(false);
  });

  it('prunes in raw mode by oldest first', () => {
    const { node, config, context, emitted } = setup(
      { max_entries: 10, prune_threshold: 0.5, capacity: 'raw' },
      true
    );
    const mem = node.__agentMemoryState!;
    // targetCount = floor(10*0.5*0.9)=4 ; with 8 entries => remove 4 oldest
    for (let i = 0; i < 8; i++) {
      mem.memories.set(`k${i}`, makeMemory({ key: `k${i}`, createdAt: Date.now() - (1000 + i) }));
    }
    memoryCrystalHandler.onUpdate(node, config, context);
    expect(mem.memories.size).toBe(4);
    // raw mode removes oldest by createdAt ascending; with createdAt=(now-(1000+i)), k7 is oldest
    expect(mem.memories.has('k7')).toBe(false);
    expect(mem.memories.has('k0')).toBe(true);
    expect(emitted.some(e => e.type === 'crystal_prune')).toBe(true);
  });

  it('prunes in semantic mode by lowest accessCount first', () => {
    const { node, config, context } = setup(
      { max_entries: 10, prune_threshold: 0.5, capacity: 'semantic' },
      true
    );
    const mem = node.__agentMemoryState!;
    for (let i = 0; i < 8; i++) {
      mem.memories.set(`k${i}`, makeMemory({ key: `k${i}`, accessCount: i }));
    }
    memoryCrystalHandler.onUpdate(node, config, context);
    // lowest four (0..3) removed
    expect(mem.memories.has('k0')).toBe(false);
    expect(mem.memories.has('k3')).toBe(false);
    expect(mem.memories.has('k7')).toBe(true);
  });

  it('prunes in time-window mode by TTL age', () => {
    const { node, config, context } = setup(
      {
        max_entries: 10,
        prune_threshold: 0.5,
        capacity: 'time-window',
        time_window_ttl: 1000,
      },
      true
    );
    const mem = node.__agentMemoryState!;
    mem.memories.set('old', makeMemory({ key: 'old', createdAt: Date.now() - 5000 }));
    mem.memories.set('new', makeMemory({ key: 'new', createdAt: Date.now() - 100 }));
    // size=2, usage=0.2 below threshold -> force threshold exceed
    for (let i = 0; i < 4; i++) mem.memories.set(`x${i}`, makeMemory({ key: `x${i}` })); // now 6/10
    memoryCrystalHandler.onUpdate(node, config, context);
    expect(mem.memories.has('old')).toBe(false);
    expect(mem.memories.has('new')).toBe(true);
  });

  it('emits crystal_prune payload with prunedCount/remaining/capacity', () => {
    const { node, config, context, emitted } = setup(
      { max_entries: 10, prune_threshold: 0.5, capacity: 'raw' },
      true
    );
    const mem = node.__agentMemoryState!;
    for (let i = 0; i < 8; i++) mem.memories.set(`k${i}`, makeMemory({ key: `k${i}` }));
    memoryCrystalHandler.onUpdate(node, config, context);
    const ev = emitted.find(e => e.type === 'crystal_prune');
    expect((ev!.payload as any)).toHaveProperty('prunedCount');
    expect((ev!.payload as any)).toHaveProperty('remaining');
    expect((ev!.payload as any).capacity).toBe('raw');
  });

  it('does not emit crystal_prune when nothing pruned', () => {
    const { node, config, context, emitted } = setup(
      { max_entries: 10, prune_threshold: 0.1, capacity: 'time-window', time_window_ttl: 99999999 },
      true
    );
    const mem = node.__agentMemoryState!;
    for (let i = 0; i < 2; i++) mem.memories.set(`k${i}`, makeMemory({ key: `k${i}` }));
    memoryCrystalHandler.onUpdate(node, config, context);
    expect(emitted.some(e => e.type === 'crystal_prune')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// onEvent memory_stored
// ---------------------------------------------------------------------------

describe('memory_stored event', () => {
  it('emits crystal_write with key/capacity/writeCount', () => {
    const { node, config, context, emitted } = setup({ capacity: 'raw' }, true);
    const m = makeMemory({ key: 'abc' });
    memoryCrystalHandler.onEvent(node, config, context, { type: 'memory_stored', memory: m });
    const ev = emitted.find(e => e.type === 'crystal_write');
    expect(ev).toBeDefined();
    expect((ev!.payload as any).key).toBe('abc');
    expect((ev!.payload as any).capacity).toBe('raw');
    expect((ev!.payload as any).writeCount).toBe(1);
  });

  it('increments writeCount across multiple writes', () => {
    const { node, config, context, emitted } = setup({}, true);
    memoryCrystalHandler.onEvent(node, config, context, { type: 'memory_stored', memory: makeMemory() });
    memoryCrystalHandler.onEvent(node, config, context, { type: 'memory_stored', memory: makeMemory() });
    const writes = emitted.filter(e => e.type === 'crystal_write');
    expect((writes[1].payload as any).writeCount).toBe(2);
  });

  it('in time-window capacity, assigns ttl if null', () => {
    const { node, config, context } = setup(
      { capacity: 'time-window', time_window_ttl: 12345 },
      true
    );
    const m = makeMemory({ ttl: null });
    memoryCrystalHandler.onEvent(node, config, context, { type: 'memory_stored', memory: m });
    expect(m.ttl).toBe(12345);
  });

  it('in time-window capacity, preserves existing ttl', () => {
    const { node, config, context } = setup(
      { capacity: 'time-window', time_window_ttl: 12345 },
      true
    );
    const m = makeMemory({ ttl: 999 });
    memoryCrystalHandler.onEvent(node, config, context, { type: 'memory_stored', memory: m });
    expect(m.ttl).toBe(999);
  });

  it('emits threshold warning at 90% of threshold', () => {
    const { node, config, context, emitted } = setup(
      { max_entries: 10, prune_threshold: 0.8 },
      true
    );
    const mem = node.__agentMemoryState!;
    // usage=0.8 => >= 0.72 (0.9*threshold)
    for (let i = 0; i < 8; i++) mem.memories.set(`k${i}`, makeMemory({ key: `k${i}` }));
    memoryCrystalHandler.onEvent(node, config, context, {
      type: 'memory_stored',
      memory: makeMemory({ key: 'new' }),
    });
    expect(
      emitted.some(
        e =>
          e.type === 'crystal_threshold_warn' &&
          typeof (e.payload as any).usage === 'number' &&
          typeof (e.payload as any).threshold === 'number'
      )
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// onEvent crystal_force_prune
// ---------------------------------------------------------------------------

describe('crystal_force_prune event', () => {
  it('forces prune and emits crystal_prune with forced=true', () => {
    const { node, config, context, emitted } = setup(
      { max_entries: 10, capacity: 'raw' },
      true
    );
    const mem = node.__agentMemoryState!;
    for (let i = 0; i < 10; i++) mem.memories.set(`k${i}`, makeMemory({ key: `k${i}` }));
    memoryCrystalHandler.onEvent(node, config, context, {
      type: 'crystal_force_prune',
      keep_percent: 0.5,
    });
    expect(mem.memories.size).toBe(5);
    const ev = emitted.find(e => e.type === 'crystal_prune');
    expect((ev!.payload as any).forced).toBe(true);
  });

  it('defaults keep_percent to 0.5 when missing', () => {
    const { node, config, context } = setup({ max_entries: 10, capacity: 'raw' }, true);
    const mem = node.__agentMemoryState!;
    for (let i = 0; i < 10; i++) mem.memories.set(`k${i}`, makeMemory({ key: `k${i}` }));
    memoryCrystalHandler.onEvent(node, config, context, { type: 'crystal_force_prune' });
    expect(mem.memories.size).toBe(5);
  });

  it('no-op when memory state missing', () => {
    const { node, config, context } = setup();
    expect(() =>
      memoryCrystalHandler.onEvent(node, config, context, {
        type: 'crystal_force_prune',
        keep_percent: 0.5,
      })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// handler metadata
// ---------------------------------------------------------------------------

describe('handler metadata/defaults', () => {
  it('name is memory_crystal', () => {
    expect(memoryCrystalHandler.name).toBe('memory_crystal');
  });

  it('default prune_threshold is 0.8', () => {
    expect(BASE_CONFIG.prune_threshold).toBe(0.8);
  });

  it('default capacity is semantic', () => {
    expect(BASE_CONFIG.capacity).toBe('semantic');
  });

  it('default backend is kv', () => {
    expect(BASE_CONFIG.backend).toBe('kv');
  });
});
