import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalAgentRef } from '../BaseAgentRef';

describe('LocalAgentRef', () => {
  // ---- Construction ----

  it('stores agentId', () => {
    const ref = new LocalAgentRef('agent-1');
    expect(ref.agentId).toBe('agent-1');
  });

  // ---- tell ----

  it('tell calls onMessage handler', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const ref = new LocalAgentRef('a', { onMessage: handler });
    await ref.tell('hello');
    // Fire-and-forget — handler called but not awaited
    await new Promise((r) => setTimeout(r, 10));
    expect(handler).toHaveBeenCalledWith('hello');
  });

  it('tell without handler does nothing', async () => {
    const ref = new LocalAgentRef('a');
    await expect(ref.tell('msg')).resolves.toBeUndefined();
  });

  // ---- ask ----

  it('ask returns handler response', async () => {
    const ref = new LocalAgentRef<string>('a', {
      onMessage: async (msg) => `echo: ${msg}`,
    });
    const result = await ref.ask<string>('hi');
    expect(result).toBe('echo: hi');
  });

  it('ask throws if no handler', async () => {
    const ref = new LocalAgentRef('a');
    await expect(ref.ask('msg')).rejects.toThrow('no message handler');
  });

  // ---- getState ----

  it('getState returns provider result', async () => {
    const ref = new LocalAgentRef('a', { getState: () => ({ count: 42 }) });
    const state = await ref.getState();
    expect(state).toEqual({ count: 42 });
  });

  it('getState returns empty object without provider', async () => {
    const ref = new LocalAgentRef('a');
    expect(await ref.getState()).toEqual({});
  });

  // ---- isActive ----

  it('isActive returns check result', async () => {
    const ref = new LocalAgentRef('a', { isActive: () => false });
    expect(await ref.isActive()).toBe(false);
  });

  it('isActive defaults to true', async () => {
    const ref = new LocalAgentRef('a');
    expect(await ref.isActive()).toBe(true);
  });
});
