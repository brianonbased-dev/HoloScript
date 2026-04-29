/**
 * LiveUpdateProtocol — Message types for hot-reload push between
 * Studio editor and the preview/renderer.
 *
 * Transport-agnostic: can be sent over WebSocket, SSE, or BroadcastChannel.
 *
 * @package @holoscript/studio
 */

import type { ASTMutation } from '../StudioBridge';

export type LiveUpdateMessage =
  | MutationBatchMessage
  | FullSceneMessage
  | PingMessage
  | PongMessage
  | ErrorMessage;

export interface MutationBatchMessage {
  type: 'mutationBatch';
  /** Unique batch ID for deduplication / ack */
  batchId: string;
  /** Mutations to apply in order */
  mutations: ASTMutation[];
  /** Object names affected (for UI highlight) */
  affectedObjectNames: string[];
  /** Timestamp from the editor */
  timestamp: number;
}

export interface FullSceneMessage {
  type: 'fullScene';
  /** Complete HoloComposition JSON (for initial load or fallback) */
  scene: unknown;
  /** Timestamp */
  timestamp: number;
}

export interface PingMessage {
  type: 'ping';
  timestamp: number;
}

export interface PongMessage {
  type: 'pong';
  timestamp: number;
}

export interface ErrorMessage {
  type: 'error';
  /** Original batchId if this is a mutation failure */
  batchId?: string;
  /** Human-readable error */
  message: string;
  /** Per-mutation errors if available */
  mutationErrors?: Array<{ index: number; message: string }>;
}

/** Generate a unique batch ID */
export function makeBatchId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Create a mutation-batch message from diff result */
export function createMutationBatch(
  mutations: ASTMutation[],
  affectedObjectNames: string[]
): MutationBatchMessage {
  return {
    type: 'mutationBatch',
    batchId: makeBatchId(),
    mutations,
    affectedObjectNames,
    timestamp: Date.now(),
  };
}

/** Create a full-scene fallback message */
export function createFullScene(scene: unknown): FullSceneMessage {
  return {
    type: 'fullScene',
    scene,
    timestamp: Date.now(),
  };
}

/** Serialize a message for transport (adds protocol version envelope) */
export function serializeMessage(msg: LiveUpdateMessage): string {
  return JSON.stringify({ v: 1, payload: msg });
}

/** Deserialize a message from transport */
export function deserializeMessage(raw: string): LiveUpdateMessage | null {
  try {
    const envelope = JSON.parse(raw) as { v: number; payload: LiveUpdateMessage };
    if (envelope.v !== 1) return null;
    return envelope.payload;
  } catch {
    return null;
  }
}
