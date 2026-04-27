/**
 * ActorTrait — comprehensive tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { actorHandler } from '../ActorTrait';

function makeNode(): Record<string, unknown> {
  return {};
}

function makeContext() {
  return { emit: vi.fn() };
}

function makeConfig(overrides: Partial<{ mailbox_size: number }> = {}) {
  return { mailbox_size: 1000, ...overrides };
}

describe('actorHandler — metadata', () => {
  it('has name "actor"', () => {
    expect(actorHandler.name).toBe('actor');
  });

  it('has defaultConfig mailbox_size 1000', () => {
    expect(actorHandler.defaultConfig?.mailbox_size).toBe(1000);
  });
});

describe('actorHandler — onAttach', () => {
  it('initializes __actorState with empty mailbox and processed=0', () => {
    const node = makeNode();
    actorHandler.onAttach!(node as never);
    const state = node.__actorState as { mailbox: unknown[]; processed: number };
    expect(state).toBeDefined();
    expect(state.mailbox).toEqual([]);
    expect(state.processed).toBe(0);
  });
});

describe('actorHandler — onDetach', () => {
  it('removes __actorState', () => {
    const node = makeNode();
    actorHandler.onAttach!(node as never);
    actorHandler.onDetach!(node as never);
    expect(node.__actorState).toBeUndefined();
  });
});

describe('actorHandler — onUpdate', () => {
  it('is a no-op', () => {
    const node = makeNode();
    actorHandler.onAttach!(node as never);
    expect(() => actorHandler.onUpdate!(node as never, makeConfig(), makeContext() as never)).not.toThrow();
  });
});

describe('actorHandler — actor:send', () => {
  it('pushes message to mailbox and emits actor:received', () => {
    const node = makeNode();
    actorHandler.onAttach!(node as never);
    const ctx = makeContext();
    actorHandler.onEvent!(node as never, makeConfig(), ctx as never, {
      type: 'actor:send',
      message: 'hello',
      from: 'sender1',
    } as never);
    const state = node.__actorState as { mailbox: unknown[]; processed: number };
    expect(state.mailbox).toEqual(['hello']);
    expect(ctx.emit).toHaveBeenCalledWith('actor:received', { from: 'sender1', queueSize: 1 });
  });

  it('sends multiple messages accumulate in mailbox', () => {
    const node = makeNode();
    actorHandler.onAttach!(node as never);
    const ctx = makeContext();
    actorHandler.onEvent!(node as never, makeConfig(), ctx as never, {
      type: 'actor:send', message: 'msg1', from: 'a',
    } as never);
    actorHandler.onEvent!(node as never, makeConfig(), ctx as never, {
      type: 'actor:send', message: 'msg2', from: 'b',
    } as never);
    const state = node.__actorState as { mailbox: unknown[] };
    expect(state.mailbox).toEqual(['msg1', 'msg2']);
  });

  it('emits actor:overflow when mailbox is full', () => {
    const node = makeNode();
    actorHandler.onAttach!(node as never);
    const config = makeConfig({ mailbox_size: 2 });
    const ctx = makeContext();
    actorHandler.onEvent!(node as never, config, ctx as never, {
      type: 'actor:send', message: 'a', from: 'x',
    } as never);
    actorHandler.onEvent!(node as never, config, ctx as never, {
      type: 'actor:send', message: 'b', from: 'x',
    } as never);
    // Mailbox full (size=2) — next send should overflow
    actorHandler.onEvent!(node as never, config, ctx as never, {
      type: 'actor:send', message: 'c', from: 'x',
    } as never);
    expect(ctx.emit).toHaveBeenCalledWith('actor:overflow', { mailboxSize: 2 });
    const state = node.__actorState as { mailbox: unknown[] };
    expect(state.mailbox.length).toBe(2);
  });

  it('does not emit overflow when mailbox has exactly one slot left', () => {
    const node = makeNode();
    actorHandler.onAttach!(node as never);
    const config = makeConfig({ mailbox_size: 1 });
    const ctx = makeContext();
    actorHandler.onEvent!(node as never, config, ctx as never, {
      type: 'actor:send', message: 'x', from: 'a',
    } as never);
    expect(ctx.emit).toHaveBeenCalledWith('actor:received', expect.anything());
    expect(ctx.emit).not.toHaveBeenCalledWith('actor:overflow', expect.anything());
  });
});

describe('actorHandler — actor:process', () => {
  it('shifts first message, increments processed, emits actor:processed', () => {
    const node = makeNode();
    actorHandler.onAttach!(node as never);
    const ctx = makeContext();
    // Fill mailbox
    actorHandler.onEvent!(node as never, makeConfig(), ctx as never, {
      type: 'actor:send', message: 'task1', from: 'a',
    } as never);
    actorHandler.onEvent!(node as never, makeConfig(), ctx as never, {
      type: 'actor:send', message: 'task2', from: 'b',
    } as never);
    ctx.emit.mockClear();
    actorHandler.onEvent!(node as never, makeConfig(), ctx as never, { type: 'actor:process' } as never);
    const state = node.__actorState as { mailbox: unknown[]; processed: number };
    expect(state.mailbox).toEqual(['task2']);
    expect(state.processed).toBe(1);
    expect(ctx.emit).toHaveBeenCalledWith('actor:processed', { message: 'task1', processed: 1 });
  });

  it('does nothing if mailbox is empty', () => {
    const node = makeNode();
    actorHandler.onAttach!(node as never);
    const ctx = makeContext();
    actorHandler.onEvent!(node as never, makeConfig(), ctx as never, { type: 'actor:process' } as never);
    const state = node.__actorState as { processed: number };
    expect(state.processed).toBe(0);
    expect(ctx.emit).not.toHaveBeenCalledWith('actor:processed', expect.anything());
  });

  it('increments processed count across multiple process calls', () => {
    const node = makeNode();
    actorHandler.onAttach!(node as never);
    const ctx = makeContext();
    for (let i = 0; i < 3; i++) {
      actorHandler.onEvent!(node as never, makeConfig(), ctx as never, {
        type: 'actor:send', message: `m${i}`, from: 'src',
      } as never);
    }
    for (let i = 0; i < 3; i++) {
      actorHandler.onEvent!(node as never, makeConfig(), ctx as never, { type: 'actor:process' } as never);
    }
    const state = node.__actorState as { processed: number };
    expect(state.processed).toBe(3);
  });
});

describe('actorHandler — edge cases', () => {
  it('ignores unknown event types', () => {
    const node = makeNode();
    actorHandler.onAttach!(node as never);
    const ctx = makeContext();
    expect(() =>
      actorHandler.onEvent!(node as never, makeConfig(), ctx as never, { type: 'actor:unknown' } as never)
    ).not.toThrow();
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('accepts string event gracefully (does not crash)', () => {
    const node = makeNode();
    actorHandler.onAttach!(node as never);
    const ctx = makeContext();
    expect(() =>
      actorHandler.onEvent!(node as never, makeConfig(), ctx as never, 'actor:process' as never)
    ).not.toThrow();
  });

  it('no-ops when __actorState is missing (no onAttach)', () => {
    const node = makeNode();
    const ctx = makeContext();
    expect(() =>
      actorHandler.onEvent!(node as never, makeConfig(), ctx as never, { type: 'actor:send', message: 'x', from: 'a' } as never)
    ).not.toThrow();
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});
