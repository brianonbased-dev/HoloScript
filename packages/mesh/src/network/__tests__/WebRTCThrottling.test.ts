import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebRTCTransport, SocialPacket } from '@holoscript/core';

// Mock WebSocket
global.WebSocket = vi.fn().mockImplementation(() => ({
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

describe('WebRTCTransport Throttling', () => {
  let transport: WebRTCTransport;

  beforeEach(() => {
    vi.useFakeTimers();
    transport = new WebRTCTransport({
      signalingServerUrl: 'ws://test',
      roomId: 'test-room',
      peerId: 'test-peer',
    });

    // Mock sendMessage to avoid needing real peers/connections
    transport.sendMessage = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should throttle frequent SOCIAL_STATUS updates', () => {
    // Send 3 status updates rapidly
    transport.sendSocialMessage({ type: 'SOCIAL_STATUS', payload: { status: 'online' } });
    transport.sendSocialMessage({ type: 'SOCIAL_STATUS', payload: { status: 'away' } });
    transport.sendSocialMessage({ type: 'SOCIAL_STATUS', payload: { status: 'busy' } });

    // Should not have sent anything yet (queued)
    expect(transport.sendMessage).not.toHaveBeenCalled();

    // Fast forward 50ms
    vi.advanceTimersByTime(50);

    // Should have sent ONLY the last one ('busy')
    expect(transport.sendMessage).toHaveBeenCalledTimes(1);
    expect(transport.sendMessage).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        _system: true,
        type: 'SOCIAL_STATUS',
        payload: { status: 'busy' },
      })
    );
  });

  it('should send non-status messages immediately', () => {
    transport.sendSocialMessage({ type: 'SOCIAL_REQUEST', payload: {} });
    expect(transport.sendMessage).toHaveBeenCalledTimes(1);
  });
});
