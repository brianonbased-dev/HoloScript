/**
 * SignalingProtocol Test Suite
 *
 * Tests for message creation, parsing, serialization, and type validation
 * for the WebRTC signaling protocol layer.
 */

import { describe, it, expect } from 'vitest';
import {
  createSignalingMessage,
  parseSignalingMessage,
  serializeSignalingMessage,
  type JoinMessage,
  type LeaveMessage,
  type OfferMessage,
  type AnswerMessage,
  type IceCandidateMessage,
  type PeerJoinedMessage,
  type PeerLeftMessage,
  type RoomStateMessage,
  type ErrorMessage,
  type SignalingPayload,
} from '../signaling/SignalingProtocol';

describe('SignalingProtocol', () => {
  // =========================================================================
  // createSignalingMessage
  // =========================================================================

  describe('createSignalingMessage', () => {
    it('should create a join message with required fields', () => {
      const msg = createSignalingMessage<JoinMessage>('join', 'room-1', 'peer-a', {
        metadata: { name: 'Alice' },
      });

      expect(msg.type).toBe('join');
      expect(msg.roomId).toBe('room-1');
      expect(msg.peerId).toBe('peer-a');
      expect(msg.timestamp).toBeGreaterThan(0);
      expect(msg.metadata).toEqual({ name: 'Alice' });
    });

    it('should create a leave message', () => {
      const msg = createSignalingMessage<LeaveMessage>('leave', 'room-1', 'peer-a', {
        reason: 'user disconnect',
      });

      expect(msg.type).toBe('leave');
      expect(msg.reason).toBe('user disconnect');
    });

    it('should create an offer message with SDP', () => {
      const sdp: RTCSessionDescriptionInit = { type: 'offer', sdp: 'v=0\r\n...' };
      const msg = createSignalingMessage<OfferMessage>('offer', 'room-1', 'peer-a', {
        targetPeerId: 'peer-b',
        sdp,
      });

      expect(msg.type).toBe('offer');
      expect(msg.targetPeerId).toBe('peer-b');
      expect(msg.sdp).toEqual(sdp);
    });

    it('should create an answer message with SDP', () => {
      const sdp: RTCSessionDescriptionInit = { type: 'answer', sdp: 'v=0\r\nanswer...' };
      const msg = createSignalingMessage<AnswerMessage>('answer', 'room-1', 'peer-a', {
        targetPeerId: 'peer-b',
        sdp,
      });

      expect(msg.type).toBe('answer');
      expect(msg.targetPeerId).toBe('peer-b');
      expect(msg.sdp.type).toBe('answer');
    });

    it('should create an ice-candidate message', () => {
      const candidate: RTCIceCandidateInit = {
        candidate: 'candidate:1 1 UDP 2013266431 192.168.1.1 50000 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      };
      const msg = createSignalingMessage<IceCandidateMessage>('ice-candidate', 'room-1', 'peer-a', {
        targetPeerId: 'peer-b',
        candidate,
      });

      expect(msg.type).toBe('ice-candidate');
      expect(msg.candidate).toEqual(candidate);
    });

    it('should create an ice-candidate message with null candidate (end-of-candidates)', () => {
      const msg = createSignalingMessage<IceCandidateMessage>('ice-candidate', 'room-1', 'peer-a', {
        targetPeerId: 'peer-b',
        candidate: null,
      });

      expect(msg.candidate).toBeNull();
    });

    it('should create a peer-joined message', () => {
      const msg = createSignalingMessage<PeerJoinedMessage>('peer-joined', 'room-1', 'server', {
        newPeerId: 'peer-c',
        metadata: { agent: true },
      });

      expect(msg.type).toBe('peer-joined');
      expect(msg.newPeerId).toBe('peer-c');
      expect(msg.metadata).toEqual({ agent: true });
    });

    it('should create a peer-left message', () => {
      const msg = createSignalingMessage<PeerLeftMessage>('peer-left', 'room-1', 'server', {
        leftPeerId: 'peer-c',
        reason: 'timeout',
      });

      expect(msg.type).toBe('peer-left');
      expect(msg.leftPeerId).toBe('peer-c');
    });

    it('should create a room-state message', () => {
      const msg = createSignalingMessage<RoomStateMessage>('room-state', 'room-1', 'server', {
        peers: [
          { peerId: 'peer-a', joinedAt: 1000 },
          { peerId: 'peer-b', metadata: { role: 'viewer' }, joinedAt: 2000 },
        ],
      });

      expect(msg.type).toBe('room-state');
      expect(msg.peers).toHaveLength(2);
      expect(msg.peers[0].peerId).toBe('peer-a');
      expect(msg.peers[1].metadata?.role).toBe('viewer');
    });

    it('should create an error message', () => {
      const msg = createSignalingMessage<ErrorMessage>('error', 'room-1', 'server', {
        code: 'ROOM_FULL',
        message: 'The room is at capacity',
      });

      expect(msg.type).toBe('error');
      expect(msg.code).toBe('ROOM_FULL');
      expect(msg.message).toBe('The room is at capacity');
    });

    it('should create ping/pong messages', () => {
      const ping = createSignalingMessage('ping', 'room-1', 'peer-a', {});
      expect(ping.type).toBe('ping');

      const pong = createSignalingMessage('pong', 'room-1', 'server', {});
      expect(pong.type).toBe('pong');
    });

    it('should set timestamp close to Date.now()', () => {
      const before = Date.now();
      const msg = createSignalingMessage('join', 'room-1', 'peer-a', {});
      const after = Date.now();

      expect(msg.timestamp).toBeGreaterThanOrEqual(before);
      expect(msg.timestamp).toBeLessThanOrEqual(after);
    });

    it('should create a message without extra fields', () => {
      const msg = createSignalingMessage('join', 'room-1', 'peer-a', {});
      expect(msg.type).toBe('join');
      expect(msg.roomId).toBe('room-1');
      expect(msg.peerId).toBe('peer-a');
    });
  });

  // =========================================================================
  // parseSignalingMessage
  // =========================================================================

  describe('parseSignalingMessage', () => {
    it('should parse a valid JSON signaling message', () => {
      const json = JSON.stringify({
        type: 'join',
        roomId: 'room-1',
        peerId: 'peer-a',
        timestamp: Date.now(),
      });

      const result = parseSignalingMessage(json);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('join');
      expect(result!.roomId).toBe('room-1');
    });

    it('should return null for invalid JSON', () => {
      expect(parseSignalingMessage('not json at all')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseSignalingMessage('')).toBeNull();
    });

    it('should return null for missing type field', () => {
      const json = JSON.stringify({ roomId: 'room-1', peerId: 'peer-a' });
      expect(parseSignalingMessage(json)).toBeNull();
    });

    it('should return null for missing roomId field', () => {
      const json = JSON.stringify({ type: 'join', peerId: 'peer-a' });
      expect(parseSignalingMessage(json)).toBeNull();
    });

    it('should return null for non-string type', () => {
      const json = JSON.stringify({ type: 42, roomId: 'room-1' });
      expect(parseSignalingMessage(json)).toBeNull();
    });

    it('should return null for non-string roomId', () => {
      const json = JSON.stringify({ type: 'join', roomId: 123 });
      expect(parseSignalingMessage(json)).toBeNull();
    });

    it('should parse a round-tripped offer message', () => {
      const original = createSignalingMessage<OfferMessage>('offer', 'room-1', 'peer-a', {
        targetPeerId: 'peer-b',
        sdp: { type: 'offer', sdp: 'v=0\r\n...' },
      });

      const json = serializeSignalingMessage(original);
      const parsed = parseSignalingMessage(json);

      expect(parsed).not.toBeNull();
      expect((parsed as OfferMessage).targetPeerId).toBe('peer-b');
      expect((parsed as OfferMessage).sdp.type).toBe('offer');
    });

    it('should parse an ice-candidate with null candidate', () => {
      const original = createSignalingMessage<IceCandidateMessage>(
        'ice-candidate',
        'room-1',
        'peer-a',
        {
          targetPeerId: 'peer-b',
          candidate: null,
        }
      );

      const json = serializeSignalingMessage(original);
      const parsed = parseSignalingMessage(json) as IceCandidateMessage;

      expect(parsed.candidate).toBeNull();
    });
  });

  // =========================================================================
  // serializeSignalingMessage
  // =========================================================================

  describe('serializeSignalingMessage', () => {
    it('should serialize to valid JSON string', () => {
      const msg = createSignalingMessage('join', 'room-1', 'peer-a', {});
      const json = serializeSignalingMessage(msg);

      expect(typeof json).toBe('string');
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should preserve all fields through serialization', () => {
      const msg = createSignalingMessage<OfferMessage>('offer', 'room-1', 'peer-a', {
        targetPeerId: 'peer-b',
        sdp: { type: 'offer', sdp: 'test-sdp-content' },
      });

      const json = serializeSignalingMessage(msg);
      const parsed = JSON.parse(json);

      expect(parsed.type).toBe('offer');
      expect(parsed.roomId).toBe('room-1');
      expect(parsed.peerId).toBe('peer-a');
      expect(parsed.targetPeerId).toBe('peer-b');
      expect(parsed.sdp.sdp).toBe('test-sdp-content');
    });

    it('should handle room-state with multiple peers', () => {
      const msg = createSignalingMessage<RoomStateMessage>('room-state', 'room-1', 'server', {
        peers: [
          { peerId: 'a', joinedAt: 100 },
          { peerId: 'b', joinedAt: 200 },
          { peerId: 'c', metadata: { role: 'host' }, joinedAt: 300 },
        ],
      });

      const json = serializeSignalingMessage(msg);
      const parsed = JSON.parse(json);

      expect(parsed.peers).toHaveLength(3);
    });
  });

  // =========================================================================
  // Round-trip integrity
  // =========================================================================

  describe('round-trip integrity', () => {
    const messageTypes: Array<{ create: () => SignalingPayload; desc: string }> = [
      {
        desc: 'join',
        create: () => createSignalingMessage<JoinMessage>('join', 'r', 'p', { metadata: { x: 1 } }),
      },
      {
        desc: 'leave',
        create: () => createSignalingMessage<LeaveMessage>('leave', 'r', 'p', { reason: 'bye' }),
      },
      {
        desc: 'offer',
        create: () =>
          createSignalingMessage<OfferMessage>('offer', 'r', 'p', {
            targetPeerId: 'q',
            sdp: { type: 'offer', sdp: 'sdp-data' },
          }),
      },
      {
        desc: 'answer',
        create: () =>
          createSignalingMessage<AnswerMessage>('answer', 'r', 'p', {
            targetPeerId: 'q',
            sdp: { type: 'answer', sdp: 'sdp-data' },
          }),
      },
      {
        desc: 'ice-candidate',
        create: () =>
          createSignalingMessage<IceCandidateMessage>('ice-candidate', 'r', 'p', {
            targetPeerId: 'q',
            candidate: { candidate: 'c', sdpMid: '0', sdpMLineIndex: 0 },
          }),
      },
      {
        desc: 'peer-joined',
        create: () =>
          createSignalingMessage<PeerJoinedMessage>('peer-joined', 'r', 'server', {
            newPeerId: 'new',
          }),
      },
      {
        desc: 'peer-left',
        create: () =>
          createSignalingMessage<PeerLeftMessage>('peer-left', 'r', 'server', {
            leftPeerId: 'gone',
          }),
      },
      {
        desc: 'room-state',
        create: () =>
          createSignalingMessage<RoomStateMessage>('room-state', 'r', 'server', {
            peers: [{ peerId: 'p', joinedAt: 100 }],
          }),
      },
      {
        desc: 'error',
        create: () =>
          createSignalingMessage<ErrorMessage>('error', 'r', 'server', {
            code: 'ERR',
            message: 'bad',
          }),
      },
      {
        desc: 'ping',
        create: () => createSignalingMessage('ping', 'r', 'p', {}),
      },
      {
        desc: 'pong',
        create: () => createSignalingMessage('pong', 'r', 'server', {}),
      },
    ];

    for (const { desc, create } of messageTypes) {
      it(`should round-trip ${desc} message`, () => {
        const original = create();
        const json = serializeSignalingMessage(original);
        const parsed = parseSignalingMessage(json);

        expect(parsed).not.toBeNull();
        expect(parsed!.type).toBe(original.type);
        expect(parsed!.roomId).toBe(original.roomId);
        expect(parsed!.peerId).toBe(original.peerId);
        expect(parsed!.timestamp).toBe(original.timestamp);
      });
    }
  });
});
