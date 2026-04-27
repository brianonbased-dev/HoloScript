/**
 * PushNotificationTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { pushNotificationHandler } from '../PushNotificationTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __pushState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { platform: 'fcm' as const, max_batch: 500 };

describe('PushNotificationTrait', () => {
  it('has name "push_notification"', () => {
    expect(pushNotificationHandler.name).toBe('push_notification');
  });

  it('push:send increments counter and emits push:sent', () => {
    const node = makeNode();
    pushNotificationHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    pushNotificationHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'push:send', token: 'tok1', title: 'Hello',
    } as never);
    expect((node.__pushState as { sent: number }).sent).toBe(1);
    expect(node.emit).toHaveBeenCalledWith('push:sent', expect.objectContaining({ token: 'tok1' }));
  });
});
