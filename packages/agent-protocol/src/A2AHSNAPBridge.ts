/**
 * A2A ↔ HSNAP compatibility bridge.
 *
 * Provides a concrete, discoverable API for translating between:
 * - canonical task envelopes
 * - A2A sendMessage JSON-RPC payloads
 * - HSNAP source payloads
 *
 * The underlying wire/schema helpers live in `task-bridge-schema.ts`.
 */

import {
  a2aSendMessageToCanonicalTaskEnvelope,
  canonicalTaskToA2ASendMessage,
  canonicalTaskToHSNAPSource,
  createCanonicalTaskEnvelope,
  hsnapSourceToCanonicalTaskEnvelope,
  type A2ASendMessageRequest,
  type CanonicalTaskEnvelope,
} from './task-bridge-schema';
import type { HSNAPTaskMetadata } from './hsnap-router';

export interface BridgeEnvelopeOptions {
  requestId?: string;
  timestamp?: string;
  compositionName?: string;
}

/**
 * Thin orchestration wrapper over the canonical bridge schema helpers.
 */
export class A2AHSNAPBridge {
  toCanonicalTask(task: HSNAPTaskMetadata): CanonicalTaskEnvelope {
    return createCanonicalTaskEnvelope(task);
  }

  toA2AMessage(
    envelope: CanonicalTaskEnvelope,
    options: BridgeEnvelopeOptions = {}
  ): A2ASendMessageRequest {
    return canonicalTaskToA2ASendMessage(
      envelope,
      options.requestId ?? 'a2a-hsnap-bridge',
      options.timestamp
    );
  }

  fromA2AMessage(payload: unknown): CanonicalTaskEnvelope | null {
    return a2aSendMessageToCanonicalTaskEnvelope(payload);
  }

  toHSNAPSource(envelope: CanonicalTaskEnvelope, options: BridgeEnvelopeOptions = {}): string {
    return canonicalTaskToHSNAPSource(envelope, options.compositionName);
  }

  fromHSNAPSource(source: string): CanonicalTaskEnvelope {
    return hsnapSourceToCanonicalTaskEnvelope(source);
  }

  translateA2AToHSNAP(payload: unknown, options: BridgeEnvelopeOptions = {}): string | null {
    const envelope = this.fromA2AMessage(payload);
    if (!envelope) return null;
    return this.toHSNAPSource(envelope, options);
  }

  translateHSNAPToA2A(source: string, options: BridgeEnvelopeOptions = {}): A2ASendMessageRequest {
    const envelope = this.fromHSNAPSource(source);
    return this.toA2AMessage(envelope, options);
  }
}
