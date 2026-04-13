import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebRTCTransport } from '@holoscript/core';

// Improve Global Mocks
class MockRTCPeerConnection {
  onicecandidate: any;
  onconnectionstatechange: any;
  ondatachannel: any;
  ontrack: any;
  connectionState = 'new';

  addTrack = vi.fn();
  addTransceiver = vi.fn();
  createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' });
  setLocalDescription = vi.fn().mockResolvedValue(undefined);
  setRemoteDescription = vi.fn().mockResolvedValue(undefined);
  createAnswer = vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-answer-sdp' });
  addIceCandidate = vi.fn().mockResolvedValue(undefined);
  close = vi.fn();

  constructor(config: any) {}
}

class MockWebSocket {
  onopen: any;
  onmessage: any;
  onerror: any;
  onclose: any;
  send = vi.fn();
  close = vi.fn();
  constructor(url: string) {}
}

// Assign to global
vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection);
vi.stubGlobal(
  'RTCSessionDescription',
  vi.fn().mockImplementation((init) => init)
);
vi.stubGlobal(
  'RTCIceCandidate',
  vi.fn().mockImplementation((init) => init)
);
vi.stubGlobal('WebSocket', MockWebSocket);

describe('WebRTCTransport - Voice Chat', () => {
  let transport: WebRTCTransport;
  let mockStream: any;
  let mockTrack: any;

  beforeEach(() => {
    transport = new WebRTCTransport({
      signalingServerUrl: 'ws://localhost:8080',
      roomId: 'test-room',
      peerId: 'local-peer',
    });

    mockTrack = { kind: 'audio', id: 'track-1' };
    mockStream = {
      getTracks: () => [mockTrack],
      getAudioTracks: () => [mockTrack],
      id: 'stream-1',
    };
  });

  it('should add stream tracks to existing peers', async () => {
    // Simulate a connected peer
    await transport.connectToPeer('remote-peer');

    // Add stream
    transport.addStream(mockStream);

    // Check if track was added to peer connection
    // access private peers map via any cast or if we expose a getter
    const peer = (transport as any).peers.get('remote-peer');
    expect(peer.connection.addTrack).toHaveBeenCalledWith(mockTrack, mockStream);
  });

  it('should store local stream and add to new peers', async () => {
    // Add stream first
    transport.addStream(mockStream);

    // Then connect peer
    await transport.connectToPeer('remote-peer-2');

    const peer = (transport as any).peers.get('remote-peer-2');
    expect(peer.connection.addTrack).toHaveBeenCalledWith(mockTrack, mockStream);
  });

  it('should emit stream-added event when remote track is received', async () => {
    const onStreamAdded = vi.fn();
    (transport as any).on('stream-added', onStreamAdded);

    // Use public API to connect
    await transport.connectToPeer('remote-peer');

    // Get the properly initialized peer
    const peer = (transport as any).peers.get('remote-peer');
    expect(peer).toBeDefined();

    const mockEvent = {
      streams: [mockStream],
      track: mockTrack,
    };

    // Trigger the handler
    if (peer.connection.ontrack) {
      peer.connection.ontrack(mockEvent);
    } else {
      throw new Error('ontrack handler was not attached by connectToPeer');
    }

    expect(onStreamAdded).toHaveBeenCalledWith({
      peerId: 'remote-peer',
      stream: mockStream,
      track: mockTrack,
    });
  });
});
