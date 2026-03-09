/**
 * BaseAgentRef / LocalAgentRef — Production Tests
 */
import { describe, it, expect } from 'vitest';
import { LocalAgentRef } from '../BaseAgentRef';

describe('LocalAgentRef — construction', () => {
  it('stores agentId', () => {
    const ref = new LocalAgentRef('agent-1');
    expect(ref.agentId).toBe('agent-1');
  });
  it('constructs without options', () => {
    expect(() => new LocalAgentRef('agent-x')).not.toThrow();
  });
});

describe('LocalAgentRef — isActive()', () => {
  it('returns true by default (no activeCheck)', async () => {
    expect(await new LocalAgentRef('a').isActive()).toBe(true);
  });
  it('returns value from custom activeCheck', async () => {
    const ref = new LocalAgentRef('a', { isActive: () => false });
    expect(await ref.isActive()).toBe(false);
  });
  it('custom activeCheck=true', async () => {
    const ref = new LocalAgentRef('a', { isActive: () => true });
    expect(await ref.isActive()).toBe(true);
  });
});

describe('LocalAgentRef — getState()', () => {
  it('returns {} when no stateProvider', async () => {
    expect(await new LocalAgentRef('a').getState()).toEqual({});
  });
  it('returns value from stateProvider', async () => {
    const ref = new LocalAgentRef('a', { getState: () => ({ hp: 100 }) });
    expect(await ref.getState()).toEqual({ hp: 100 });
  });
  it('stateProvider can return primitives', async () => {
    const ref = new LocalAgentRef<string>('a', { getState: () => 'alive' });
    expect(await ref.getState()).toBe('alive');
  });
});

describe('LocalAgentRef — tell()', () => {
  it('returns without throw when no handler', async () => {
    await expect(new LocalAgentRef('a').tell('msg')).resolves.toBeUndefined();
  });
  it('calls onMessage handler', async () => {
    const calls: string[] = [];
    const ref = new LocalAgentRef<string>('a', {
      onMessage: async (m) => {
        calls.push(m);
        return;
      },
    });
    ref.tell('hello');
    // tell is fire-and-forget; give microtask time to run
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toContain('hello');
  });
  it('swallows errors in handler (fire-and-forget)', async () => {
    const ref = new LocalAgentRef<string>('a', {
      onMessage: async () => {
        throw new Error('boom');
      },
    });
    await expect(ref.tell('msg')).resolves.toBeUndefined();
  });
});

describe('LocalAgentRef — ask()', () => {
  it('resolves with handler response', async () => {
    const ref = new LocalAgentRef<string>('a', {
      onMessage: async (m) => `echo:${m}`,
    });
    const result = await ref.ask<string>('ping', 500);
    expect(result).toBe('echo:ping');
  });
  it('rejects with timeout when no handler', async () => {
    const ref = new LocalAgentRef('a');
    await expect(ref.ask('msg', 10)).rejects.toThrow(/handler/);
  });
  it('includes agentId in timeout error', async () => {
    const ref = new LocalAgentRef('my-special-agent', {
      onMessage: async () =>
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 100)),
    });
    await expect(ref.ask('msg', 10)).rejects.toThrow(/my-special-agent/);
  });
  it('resolves with complex object', async () => {
    const ref = new LocalAgentRef<string>('a', {
      onMessage: async () => ({ status: 'ok', score: 42 }),
    });
    const r = await ref.ask<{ status: string; score: number }>('q', 500);
    expect(r.status).toBe('ok');
    expect(r.score).toBe(42);
  });
  it('resolves with null handler response', async () => {
    const ref = new LocalAgentRef<string>('a', {
      onMessage: async () => null,
    });
    expect(await ref.ask('q', 500)).toBeNull();
  });
});
