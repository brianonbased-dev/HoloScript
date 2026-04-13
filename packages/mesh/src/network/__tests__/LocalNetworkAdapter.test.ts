import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalNetworkAdapter } from '../LocalNetworkAdapter';

// Mock BroadcastChannel
class BroadCastChannelMock {
  onmessage: ((event: MessageEvent) => void) | null = null;
  name: string;
  static instances: BroadCastChannelMock[] = [];

  constructor(name: string) {
    this.name = name;
    BroadCastChannelMock.instances.push(this);
  }

  postMessage(data: any) {
    // Simulate broadcast to other instances
    BroadCastChannelMock.instances.forEach((instance) => {
      if (instance !== this && instance.name === this.name && instance.onmessage) {
        instance.onmessage({ data } as MessageEvent);
      }
    });
  }

  close() {
    const index = BroadCastChannelMock.instances.indexOf(this);
    if (index > -1) BroadCastChannelMock.instances.splice(index, 1);
  }
}

vi.stubGlobal('BroadcastChannel', BroadCastChannelMock);

describe('LocalNetworkAdapter', () => {
  beforeEach(() => {
    BroadCastChannelMock.instances = [];
  });

  it('should connect and generate a unique sender ID', () => {
    const adapter = new LocalNetworkAdapter();
    adapter.connect();
    expect(adapter.getSenderId()).toBeDefined();
    expect(adapter.getSenderId().length).toBeGreaterThan(5);
    adapter.disconnect();
  });

  it('should broadcast messages to other connected instances', () => {
    const adapter1 = new LocalNetworkAdapter('test-project');
    const adapter2 = new LocalNetworkAdapter('test-project');

    const callback2 = vi.fn();
    adapter1.connect();
    adapter2.connect();
    adapter2.subscribe(callback2);

    adapter1.broadcast('entity-1', 'property', { color: 'red' });

    expect(callback2).toHaveBeenCalled();
    const update = callback2.mock.calls[0][0];
    expect(update.entityId).toBe('entity-1');
    expect(update.payload.color).toBe('red');
    expect(update.senderId).toBe(adapter1.getSenderId());

    adapter1.disconnect();
    adapter2.disconnect();
  });

  it('should not receive its own messages', () => {
    const adapter = new LocalNetworkAdapter('test-project');
    const callback = vi.fn();

    adapter.connect();
    adapter.subscribe(callback);
    adapter.broadcast('entity-1', 'state', { active: true });

    expect(callback).not.toHaveBeenCalled();
    adapter.disconnect();
  });

  it('should respect channel names (project IDs)', () => {
    const adapter1 = new LocalNetworkAdapter('project-A');
    const adapter2 = new LocalNetworkAdapter('project-B');

    const callback2 = vi.fn();
    adapter1.connect();
    adapter2.connect();
    adapter2.subscribe(callback2);

    adapter1.broadcast('entity-1', 'event', { type: 'click' });

    expect(callback2).not.toHaveBeenCalled();

    adapter1.disconnect();
    adapter2.disconnect();
  });
});
