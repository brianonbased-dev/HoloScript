import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server } from 'http';
import { WebSocketServer } from 'ws';
import { WebRTCSignalingServer } from '../holomesh/webrtc-signaling';
import { WebSocketSignaler } from '@holoscript/core';

describe('WebRTC Handshake E2E Flow', () => {
  let server: Server;
  let signalingServer: WebRTCSignalingServer;
  let PORT = 4004;

  beforeAll(async () => {
    server = createServer();
    signalingServer = new WebRTCSignalingServer(server);

    await new Promise<void>((resolve) => {
      server.listen(PORT, () => resolve());
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should successfully establish signaling channels and exchange signals (Pillar 3)', async () => {
    // 1. Initialize two peer clients
    const endpoint = `ws://localhost:${PORT}/webrtc-signaling`;
    const aliceId = 'peer-alice-01';
    const bobId = 'peer-bob-02';

    const aliceSignaler = new WebSocketSignaler(endpoint, aliceId, bobId);
    const bobSignaler = new WebSocketSignaler(endpoint, bobId, aliceId);

    // Track received signals
    const aliceReceived: any[] = [];
    const bobReceived: any[] = [];

    // 2. Register handlers
    aliceSignaler.onReceiveSignal((payload: any) => aliceReceived.push(payload));
    bobSignaler.onReceiveSignal((payload: any) => bobReceived.push(payload));

    // 3. Connect to the bridge
    await Promise.all([
      aliceSignaler.connect(),
      bobSignaler.connect()
    ]);

    // Give the server a tiny tick to register peer IDs from identify messages
    await new Promise(resolve => setTimeout(resolve, 50));

    // 4. Bob sends an offer to Alice
    const mockOffer = { type: 'offer' as const, sdp: { type: 'offer' as const, sdp: 'v=0...' } };
    await bobSignaler.sendSignal(mockOffer);

    // Give time to traverse the WebSocket server
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(aliceReceived).toHaveLength(1);
    expect(aliceReceived[0].type).toBe('offer');
    expect(aliceReceived[0].sdp.sdp).toBe('v=0...');
    expect(bobReceived).toHaveLength(0);

    // 5. Alice responds with an answer
    const mockAnswer = { type: 'answer' as const, sdp: { type: 'answer' as const, sdp: 'v=0...a' } };
    await aliceSignaler.sendSignal(mockAnswer);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(bobReceived).toHaveLength(1);
    expect(bobReceived[0].type).toBe('answer');
    expect(bobReceived[0].sdp.sdp).toBe('v=0...a');

    // 6. ICE Candidate exchange
    const mockCandidate = { type: 'ice-candidate' as const, candidate: { candidate: 'candidate:1 1 UDP 1234', sdpMid: '0', sdpMLineIndex: 0 } };
    await aliceSignaler.sendSignal(mockCandidate);
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(bobReceived).toHaveLength(2);
    expect(bobReceived[1].type).toBe('ice-candidate');
    expect(bobReceived[1].candidate.candidate).toBe('candidate:1 1 UDP 1234');

    // Cleanup
    aliceSignaler.disconnect();
    bobSignaler.disconnect();
  });
});
