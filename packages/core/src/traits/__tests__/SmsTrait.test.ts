/**
 * SmsTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { smsHandler } from '../SmsTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __smsState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { provider: 'default', max_length: 160 };

describe('SmsTrait', () => {
  it('has name "sms"', () => {
    expect(smsHandler.name).toBe('sms');
  });

  it('sms:send emits sms:sent for valid message', () => {
    const node = makeNode();
    smsHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    smsHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'sms:send', to: '+1234567890', message: 'Hello',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('sms:sent', expect.objectContaining({ to: '+1234567890' }));
  });

  it('sms:send emits sms:error when message too long', () => {
    const node = makeNode();
    smsHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    smsHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'sms:send', to: '+1', message: 'x'.repeat(161),
    } as never);
    expect(node.emit).toHaveBeenCalledWith('sms:error', expect.objectContaining({ to: '+1' }));
  });
});
