/**
 * EmailTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { emailHandler } from '../EmailTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __emailState: undefined as unknown,
});

const defaultConfig = { from: 'test@example.com', max_queue: 5 };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('EmailTrait — metadata', () => {
  it('has name "email"', () => {
    expect(emailHandler.name).toBe('email');
  });

  it('defaultConfig from is noreply@holoscript.dev', () => {
    expect(emailHandler.defaultConfig?.from).toBe('noreply@holoscript.dev');
  });
});

describe('EmailTrait — lifecycle', () => {
  it('onAttach initializes counters to 0', () => {
    const node = makeNode();
    emailHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__emailState as { queued: number; sent: number; failed: number };
    expect(state.queued).toBe(0);
    expect(state.sent).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    emailHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    emailHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__emailState).toBeUndefined();
  });
});

describe('EmailTrait — onEvent', () => {
  it('email:send emits email:sent with messageId and to', () => {
    const node = makeNode();
    emailHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    emailHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'email:send', to: 'user@example.com', subject: 'Hello',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('email:sent', expect.objectContaining({
      to: 'user@example.com', subject: 'Hello', from: 'test@example.com',
    }));
  });

  it('email:send increments sent counter', () => {
    const node = makeNode();
    emailHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    emailHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'email:send', to: 'a@b.com', subject: 'S',
    } as never);
    emailHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'email:send', to: 'c@d.com', subject: 'S2',
    } as never);
    const state = node.__emailState as { sent: number };
    expect(state.sent).toBe(2);
  });

  it('email:get_status emits email:status', () => {
    const node = makeNode();
    emailHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    emailHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'email:get_status',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('email:status', expect.objectContaining({
      queued: 0, sent: 0, failed: 0,
    }));
  });
});
