/**
 * WebRTC Signaling Protocol
 *
 * Message types and utilities for WebRTC connection negotiation.
 *
 * @version 3.3.0
 * @sprint Sprint 2: Performance Optimization
 */

/** Signaling message types */
export type SignalingMessageType =
  | 'join'
  | 'leave'
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'peer-joined'
  | 'peer-left'
  | 'room-state'
  | 'error'
  | 'ping'
  | 'pong';

/** Base signaling message */
export interface SignalingMessage {
  type: SignalingMessageType;
  roomId: string;
  peerId: string;
  timestamp: number;
}

/** Join request */
export interface JoinMessage extends SignalingMessage {
  type: 'join';
  metadata?: Record<string, unknown>;
}

/** Leave notification */
export interface LeaveMessage extends SignalingMessage {
  type: 'leave';
  reason?: string;
}

/** SDP Offer */
export interface OfferMessage extends SignalingMessage {
  type: 'offer';
  targetPeerId: string;
  sdp: RTCSessionDescriptionInit;
}

/** SDP Answer */
export interface AnswerMessage extends SignalingMessage {
  type: 'answer';
  targetPeerId: string;
  sdp: RTCSessionDescriptionInit;
}

/** ICE Candidate */
export interface IceCandidateMessage extends SignalingMessage {
  type: 'ice-candidate';
  targetPeerId: string;
  candidate: RTCIceCandidateInit | null;
}

/** Peer joined notification */
export interface PeerJoinedMessage extends SignalingMessage {
  type: 'peer-joined';
  newPeerId: string;
  metadata?: Record<string, unknown>;
}

/** Peer left notification */
export interface PeerLeftMessage extends SignalingMessage {
  type: 'peer-left';
  leftPeerId: string;
  reason?: string;
}

/** Room state response */
export interface RoomStateMessage extends SignalingMessage {
  type: 'room-state';
  peers: Array<{
    peerId: string;
    metadata?: Record<string, unknown>;
    joinedAt: number;
  }>;
}

/** Error message */
export interface ErrorMessage extends SignalingMessage {
  type: 'error';
  code: string;
  message: string;
}

/** Union type for all signaling messages */
export type SignalingPayload =
  | JoinMessage
  | LeaveMessage
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage
  | PeerJoinedMessage
  | PeerLeftMessage
  | RoomStateMessage
  | ErrorMessage
  | (SignalingMessage & { type: 'ping' | 'pong' });

/**
 * Create a signaling message
 */
export function createSignalingMessage<T extends SignalingPayload>(
  type: T['type'],
  roomId: string,
  peerId: string,
  extra?: Omit<T, 'type' | 'roomId' | 'peerId' | 'timestamp'>
): T {
  return {
    type,
    roomId,
    peerId,
    timestamp: Date.now(),
    ...extra,
  } as T;
}

/**
 * Parse a signaling message from JSON
 */
export function parseSignalingMessage(json: string): SignalingPayload | null {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed.type !== 'string' || typeof parsed.roomId !== 'string') {
      return null;
    }
    return parsed as SignalingPayload;
  } catch {
    return null;
  }
}

/**
 * Serialize a signaling message to JSON
 */
export function serializeSignalingMessage(message: SignalingPayload): string {
  return JSON.stringify(message);
}
