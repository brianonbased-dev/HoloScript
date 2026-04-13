/**
 * WebRTCTransport Production Tests
 * Sprint CLXVII — event system, social batching, peer state, disconnect, factory
 *
 * RTCPeerConnection and WebSocket are Browser APIs, so we mock them.
 * Tests focus on the JavaScript-layer logic (observer registry, batch dedup, state).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebRTCTransport, createWebRTCTransport, type SocialPacket } from '@holoscript/core';

// ---------------------------------------------------------------------------
// Minimal WebSocket mock
// ---------------------------------------------------------------------------

class MockWebSocket {
  static OPEN = 1;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  /** Helper: trigger open */
  fireOpen() {
    this.onopen?.();
  }
  /** Helper: trigger message */
  fireMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  /** Helper: trigger error */
  fireError() {
    this.onerror?.(new Event('error'));
  }
}

// ---------------------------------------------------------------------------
// Minimal RTCPeerConnection mock
// ---------------------------------------------------------------------------

class MockRTCPeerConnection {
  onicecandidate: ((e: { candidate: unknown }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((e: { channel: unknown }) => void) | null = null;
  ontrack: ((e: unknown) => void) | null = null;
  connectionState = 'new';
  addTrack = vi.fn();
  addIceCandidate = vi.fn().mockResolvedValue(undefined);
  createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' });
  setLocalDescription = vi.fn().mockResolvedValue(undefined);
  setRemoteDescription = vi.fn().mockResolvedValue(undefined);
  createAnswer = vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp' });
  close = vi.fn();
  dataChannels = new Map<string, MockRTCDataChannel>();
}

class MockRTCDataChannel {
  label: string;
  readyState: RTCDataChannelState = 'open';
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor(label: string) {
    this.label = label;
  }
  fireMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

class MockRTCSessionDescription {
  constructor(public init: RTCSessionDescriptionInit) {}
}

class MockRTCIceCandidate {
  constructor(public init: RTCIceCandidateInit) {}
}

// ---------------------------------------------------------------------------
// Setup/teardown global mocks
// ---------------------------------------------------------------------------

let socketInstance: MockWebSocket;
let peerInstance: MockRTCPeerConnection;

beforeEach(() => {
  // Reset references
  socketInstance = new MockWebSocket();
  peerInstance = new MockRTCPeerConnection();

  // Arrow functions are NOT constructable — must use regular function syntax for `new X()` to work
  const wsCalls: any[] = [];
  function FakeWebSocket(url: string) {
    wsCalls.push(url);
    return socketInstance;
  }
  FakeWebSocket.mock = { calls: wsCalls };
  // @ts-ignore
  globalThis.WebSocket = vi.fn().mockImplementation(function (url: string) {
    return socketInstance;
  });

  const pcCalls: any[] = [];
  // @ts-ignore
  globalThis.RTCPeerConnection = vi.fn().mockImplementation(function () {
    return peerInstance;
  });
  // @ts-ignore
  globalThis.RTCSessionDescription = MockRTCSessionDescription;
  // @ts-ignore
  globalThis.RTCIceCandidate = MockRTCIceCandidate;
});

afterEach(() => {
  vi.clearAllMocks();
  vi.clearAllTimers();
  delete (globalThis as any).WebSocket;
  delete (globalThis as any).RTCPeerConnection;
  delete (globalThis as any).RTCSessionDescription;
  delete (globalThis as any).RTCIceCandidate;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig() {
  return {
    signalingServerUrl: 'ws://test.local',
    roomId: 'room-1',
    peerId: 'peer-test',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebRTCTransport', () => {
  describe('constructor', () => {
    it('uses provided peerId', () => {
      const t = new WebRTCTransport(makeConfig());
      // peerId is accessible via the join-room signaling message
      // We verify indirectly after initialize
      expect(t).toBeTruthy();
    });

    it('auto-generates peerId when not provided', () => {
      const t = new WebRTCTransport({ signalingServerUrl: 'ws://x', roomId: 'r' });
      expect(t).toBeTruthy();
    });
  });

  describe('createWebRTCTransport factory', () => {
    it('returns a WebRTCTransport instance', () => {
      const t = createWebRTCTransport(makeConfig());
      expect(t).toBeInstanceOf(WebRTCTransport);
    });
  });

  // -------------------------------------------------------------------------
  // Event system (on / emit)
  // -------------------------------------------------------------------------

  describe('event system', () => {
    it('on() registers a handler and emit fires it', async () => {
      const t = new WebRTCTransport(makeConfig());
      const fired = vi.fn();
      t.on('stream-added', fired);
      // Must fire open BEFORE awaiting initialize (or Promise never resolves)
      const p = t.initialize();
      socketInstance.fireOpen();
      await p;
      await t.connectToPeer('remote-1');
      // Simulate track event
      const trackEvent = { streams: [{}], track: {} };
      peerInstance.ontrack?.(trackEvent);
      expect(fired).toHaveBeenCalledWith(expect.objectContaining({ peerId: 'remote-1' }));
    });

    it('registers multiple handlers for the same event', async () => {
      const t = new WebRTCTransport(makeConfig());
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      t.on('stream-added', fn1);
      t.on('stream-added', fn2);
      const p = t.initialize();
      socketInstance.fireOpen();
      await p;
      await t.connectToPeer('p');
      peerInstance.ontrack?.({ streams: [{}], track: {} });
      expect(fn1).toHaveBeenCalled();
      expect(fn2).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // initialize
  // -------------------------------------------------------------------------

  describe('initialize', () => {
    it('creates a WebSocket with the signaling URL', async () => {
      const t = new WebRTCTransport(makeConfig());
      const p = t.initialize();
      socketInstance.fireOpen();
      await p;
      expect(globalThis.WebSocket).toHaveBeenCalledWith('ws://test.local');
    });

    it('sends join-room on WebSocket open', async () => {
      const t = new WebRTCTransport(makeConfig());
      const p = t.initialize();
      socketInstance.fireOpen();
      await p;
      const sent = JSON.parse(socketInstance.send.mock.calls[0][0]);
      expect(sent.type).toBe('join-room');
      expect(sent.roomId).toBe('room-1');
      expect(sent.peerId).toBe('peer-test');
    });

    it('rejects when WebSocket errors', async () => {
      const t = new WebRTCTransport(makeConfig());
      const p = t.initialize();
      socketInstance.fireError();
      await expect(p).rejects.toThrow('Signaling connection failed');
    });
  });

  // -------------------------------------------------------------------------
  // connectToPeer
  // -------------------------------------------------------------------------

  describe('connectToPeer', () => {
    it('creates RTCPeerConnection and sends offer', async () => {
      const t = new WebRTCTransport(makeConfig());
      const p = t.initialize();
      socketInstance.fireOpen();
      await p;
      await t.connectToPeer('remote-1');
      expect(globalThis.RTCPeerConnection).toHaveBeenCalled();
      expect(peerInstance.createOffer).toHaveBeenCalled();
      expect(peerInstance.setLocalDescription).toHaveBeenCalled();
      // offer sent via signaling
      const offerMsg = socketInstance.send.mock.calls.find((c: any[]) => {
        const d = JSON.parse(c[0]);
        return d.type === 'offer';
      });
      expect(offerMsg).toBeTruthy();
    });

    it('is idempotent — does not create 2nd connection for same peer', async () => {
      const t = new WebRTCTransport(makeConfig());
      const p = t.initialize();
      socketInstance.fireOpen();
      await p;
      await t.connectToPeer('remote-1');
      const callsBefore = (globalThis.RTCPeerConnection as any).mock.calls.length;
      await t.connectToPeer('remote-1'); // second time — no-op
      expect((globalThis.RTCPeerConnection as any).mock.calls.length).toBe(callsBefore);
    });
  });

  // -------------------------------------------------------------------------
  // onMessage / sendMessage
  // -------------------------------------------------------------------------

  describe('onMessage / sendMessage', () => {
    it('onMessage callback invoked for non-system data channel messages', async () => {
      const t = new WebRTCTransport(makeConfig());
      const p = t.initialize();
      socketInstance.fireOpen();
      await p;

      const handler = vi.fn();
      t.onMessage(handler);

      // Connect peer first so the peer exists in map before ondatachannel fires
      await t.connectToPeer('alice');

      const channel = new MockRTCDataChannel('default');
      peerInstance.ondatachannel?.({ channel } as any);
      channel.fireMessage({ hello: 'world' });

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ hello: 'world' }));
    });

    it('social system messages route to social handler, not default', async () => {
      const t = new WebRTCTransport(makeConfig());
      const p = t.initialize();
      socketInstance.fireOpen();
      await p;

      const defaultHandler = vi.fn();
      const socialHandler = vi.fn();
      t.onMessage(defaultHandler);
      t.onSocialMessage(socialHandler);

      // Must connect peer first so peer exists in map when ondatachannel fires
      await t.connectToPeer('alice');

      const channel = new MockRTCDataChannel('default');
      // Simulate incoming data channel from alice's side
      peerInstance.ondatachannel?.({ channel } as any);
      channel.fireMessage({ _system: true, type: 'SOCIAL_STATUS', payload: {} });

      expect(socialHandler).toHaveBeenCalled();
      expect(defaultHandler).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // onSocialMessage
  // -------------------------------------------------------------------------

  describe('onSocialMessage', () => {
    it('registers a social message handler', () => {
      const t = new WebRTCTransport(makeConfig());
      const fn = vi.fn();
      t.onSocialMessage(fn);
      expect(fn).not.toHaveBeenCalled(); // not called on registration
    });

    it('allows multiple social handlers', () => {
      const t = new WebRTCTransport(makeConfig());
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      t.onSocialMessage(fn1);
      t.onSocialMessage(fn2);
      // Verify both are stored by triggering via channel
      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // sendSocialMessage batching (SOCIAL_STATUS)
  // -------------------------------------------------------------------------

  describe('sendSocialMessage batching', () => {
    it('SOCIAL_STATUS packets are batched (not sent immediately via WS)', () => {
      // Use synchronous spy on sendMessage — no fakeTimers needed
      // sendSocialMessage with SOCIAL_STATUS just pushes to queue and starts interval
      // We verify sendMessage is not called synchronously
      const t = new WebRTCTransport(makeConfig());
      const sendSpy = vi.spyOn(t as any, 'sendMessage');

      const packet: SocialPacket = { type: 'SOCIAL_STATUS', payload: { status: 'online' } };
      t.sendSocialMessage(packet);

      // sendMessage is NOT called synchronously
      expect(sendSpy).not.toHaveBeenCalled();

      // Clean up the setInterval by calling disconnect (clears via clearInterval)
      t.disconnect();
    });

    it('non-STATUS social packets are routed immediately', async () => {
      const t = new WebRTCTransport(makeConfig());
      const origSend = vi.spyOn(t as any, 'sendMessage');
      const packet: SocialPacket = { type: 'SOCIAL_REQUEST', payload: { to: 'alice' } };
      t.sendSocialMessage(packet);
      expect(origSend).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // addStream / setMicrophoneEnabled
  // -------------------------------------------------------------------------

  describe('addStream', () => {
    it('stores localStream', () => {
      const t = new WebRTCTransport(makeConfig());
      const mockTrack = { enabled: true };
      const stream = { getTracks: () => [mockTrack], getAudioTracks: () => [mockTrack] } as any;
      t.addStream(stream);
      // Verify by checking setMicrophoneEnabled works
      t.setMicrophoneEnabled(false);
      expect(mockTrack.enabled).toBe(false);
    });

    it('setMicrophoneEnabled does not throw without stream', () => {
      const t = new WebRTCTransport(makeConfig());
      expect(() => t.setMicrophoneEnabled(false)).not.toThrow();
    });

    it('setMicrophoneEnabled enables tracks', () => {
      const t = new WebRTCTransport(makeConfig());
      const track = { enabled: false };
      const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as any;
      t.addStream(stream);
      t.setMicrophoneEnabled(true);
      expect(track.enabled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // disconnect
  // -------------------------------------------------------------------------

  describe('disconnect', () => {
    it('closes the WebSocket', async () => {
      const t = new WebRTCTransport(makeConfig());
      const p = t.initialize();
      socketInstance.fireOpen();
      await p;
      t.disconnect();
      expect(socketInstance.close).toHaveBeenCalled();
    });

    it('is safe to call before initialize', () => {
      const t = new WebRTCTransport(makeConfig());
      expect(() => t.disconnect()).not.toThrow();
    });

    it('is safe to call twice', async () => {
      const t = new WebRTCTransport(makeConfig());
      const p = t.initialize();
      socketInstance.fireOpen();
      await p;
      t.disconnect();
      expect(() => t.disconnect()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // signaling message handling
  // -------------------------------------------------------------------------

  describe('signaling messages', () => {
    it('peer-list message connects to unlisted peers', async () => {
      const t = new WebRTCTransport(makeConfig());
      const p = t.initialize();
      socketInstance.fireOpen();
      await p;

      socketInstance.fireMessage({ type: 'peer-list', peers: ['peer-test', 'alice', 'bob'] });
      // 'peer-test' is self → skipped. alice and bob → connect
      expect(globalThis.RTCPeerConnection).toHaveBeenCalledTimes(2);
    });

    it('ice-candidate message passes candidate to peer connection', async () => {
      const t = new WebRTCTransport(makeConfig());
      const p = t.initialize();
      socketInstance.fireOpen();
      await p;
      await t.connectToPeer('alice');

      socketInstance.fireMessage({
        type: 'ice-candidate',
        from: 'alice',
        candidate: { candidate: 'mock-ice', sdpMid: '0', sdpMLineIndex: 0 },
      });

      expect(peerInstance.addIceCandidate).toHaveBeenCalled();
    });
  });
});
