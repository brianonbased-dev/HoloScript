/**
 * RecursiveLinkTrait — signed structured-state collaboration link.
 *
 * Carries PillarSlice fields without claiming that they are model hidden
 * states. Equal-content text/JSON matched the typed frame in the P32 protocol
 * tournament; this handler's admitted value is schema, replay, and custody.
 *
 * Inner loop (Domain/Layer Pillars): high-frequency refinement.
 * Outer loop (Intent/Temporal Pillars): low-frequency optimization.
 *
 * Every exchange is sealed with a SimulationContract receipt for integrity.
 * Works with closed-API agents (Claude/GPT/Gemini/Grok) because it operates
 * on structured Pillar state, not raw hidden states.
 *
 * References:
 *   RecursiveMAS — arxiv:2604.25917 (UIUC/Stanford/NVIDIA/MIT, 2026-04)
 *   Pillar-Slice Framework — research/2026-05-20_paper26-pillar-slice-scope.md
 *   SemanticCollaborationContract — for the message envelope + receipt + Two-Axis integrity
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from '../TraitTypes';
import type { PillarSlice, SemanticCollaborationMessage } from './SemanticCollaborationContract';
import { getSemanticCustodyReceipt, type SemanticCustodyReceipt } from './SemanticCustody';

// --- Types -------------------------------------------------------------------

export interface RecursiveLinkMessage {
  from: string;
  to: string;
  loop: 'inner' | 'outer';
  slice: PillarSlice;
  receipt?: string; // SimulationContract evidence hash
  timestamp_ms: number;
  metadata?: Record<string, unknown>;
  /**
   * Admitted v2 semantic message that binds this link's action, endpoints,
   * nonce, axis IDs, and payload to a signed HoloMesh envelope.
   */
  semantic_message?: SemanticCollaborationMessage;
  /** Deterministic local receipt emitted only after admission succeeds. */
  custody_receipt?: SemanticCustodyReceipt;
}

export interface RecursiveLinkConfig {
  /** Whether to require a receipt on every send */
  require_receipt: boolean;
  /** Default loop for new links */
  default_loop: 'inner' | 'outer';
  /** Migration preserves legacy links; strict requires signed v2 custody. */
  custody_mode: 'migration' | 'strict';
}

// --- Trait Implementation ----------------------------------------------------

// Internal per-node state
interface RecursiveLinkState {
  sentCount: number;
  receivedCount: number;
}

function extractField<T>(event: TraitEvent, key: string): T | undefined {
  const direct = (event as Record<string, unknown>)[key];
  if (direct !== undefined) return direct as T;
  return (event.payload as Record<string, unknown> | undefined)?.[key] as T | undefined;
}

export const recursiveLinkHandler: TraitHandler<RecursiveLinkConfig> = {
  name: 'recursive_link',

  defaultConfig: {
    require_receipt: true,
    default_loop: 'inner',
    custody_mode: 'migration',
  },

  onAttach(node: HSPlusNode, _config: RecursiveLinkConfig, _context: TraitContext): void {
    const state: RecursiveLinkState = { sentCount: 0, receivedCount: 0 };
    node.__recursiveLinkState = state;
  },

  onDetach(node: HSPlusNode, _config: RecursiveLinkConfig, _context: TraitContext): void {
    delete node.__recursiveLinkState;
  },

  onUpdate(): void {},

  onEvent(
    node: HSPlusNode,
    config: RecursiveLinkConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__recursiveLinkState as RecursiveLinkState | undefined;
    if (!state) return;

    // ── recursive_link:send ───────────────────────────────────────────────────
    if (event.type === 'recursive_link:send') {
      const to = extractField<string>(event, 'to');
      const slice = extractField<PillarSlice>(event, 'slice');
      const loop = extractField<'inner' | 'outer'>(event, 'loop') ?? config.default_loop;
      const receipt = extractField<string>(event, 'receipt');
      const metadata = extractField<Record<string, unknown>>(event, 'metadata');
      const semanticMessage = extractField<SemanticCollaborationMessage>(event, 'semantic_message');

      if (!slice || !to) {
        context.emit?.('recursive_link:error', {
          code: 'INVALID_MESSAGE',
          message: 'slice and to are required',
        });
        return;
      }
      if (config.require_receipt && !receipt && config.custody_mode === 'strict') {
        context.emit?.('recursive_link:error', {
          code: 'RECEIPT_REQUIRED',
          message: 'strict recursive links require a SimulationContract receipt',
        });
        return;
      }

      const custody = validateRecursiveCustody(
        semanticMessage,
        {
          from: extractField<string>(event, 'from') ?? 'unknown',
          to,
          loop,
          slice,
          receipt,
        },
        config.custody_mode
      );
      if (!custody.ok) {
        context.emit?.('recursive_link:error', {
          code: custody.code,
          message: custody.message,
        });
        return;
      }

      const fullMsg: RecursiveLinkMessage = {
        from: extractField<string>(event, 'from') ?? 'unknown',
        to,
        loop,
        slice,
        receipt: config.require_receipt && !receipt ? `receipt_${Date.now()}` : receipt,
        timestamp_ms: Date.now(),
        metadata,
        semantic_message: semanticMessage,
        custody_receipt: custody.receipt,
      };

      state.sentCount++;
      if (custody.migrationRequired) {
        context.emit?.('recursive_link:migration_required', {
          from: fullMsg.from,
          to: fullMsg.to,
          action: 'recursive_link',
        });
      } else if (custody.receipt) {
        context.emit?.('recursive_link:custody_receipt', { receipt: custody.receipt });
      }
      context.emit?.('recursive_link:sent', fullMsg);
      return;
    }

    // ── recursive_link:receive ────────────────────────────────────────────────
    if (event.type === 'recursive_link:receive') {
      const incoming =
        extractField<RecursiveLinkMessage>(event, 'message') ??
        (event as unknown as RecursiveLinkMessage);

      const custody = validateRecursiveCustody(
        incoming.semantic_message,
        incoming,
        config.custody_mode
      );
      if (!custody.ok) {
        context.emit?.('recursive_link:error', {
          code: custody.code,
          message: custody.message,
        });
        return;
      }

      state.receivedCount++;
      if (custody.migrationRequired) {
        context.emit?.('recursive_link:migration_required', {
          from: incoming.from,
          to: incoming.to,
          action: 'recursive_link',
        });
      } else if (custody.receipt) {
        incoming.custody_receipt = custody.receipt;
        context.emit?.('recursive_link:custody_receipt', { receipt: custody.receipt });
      }
      context.emit?.('recursive_link:received', incoming);
      return;
    }

    // ── pillar:slice — opportunistic forwarding ───────────────────────────────
    if (event.type === 'pillar:slice') {
      const slicePayload =
        extractField<{ slice: PillarSlice }>(event, 'slice') ??
        (event.payload as { slice: PillarSlice } | undefined);
      const slice: PillarSlice | undefined = (slicePayload as unknown as PillarSlice)?.pillar_id
        ? (slicePayload as unknown as PillarSlice)
        : (slicePayload as { slice: PillarSlice } | undefined)?.slice;

      if (!slice) return;

      const innerDomains: PillarSlice['pillar_domain'][] = [
        'physics',
        'rendering',
        'solver',
        'trait',
      ];
      const loop: 'inner' | 'outer' = innerDomains.includes(slice.pillar_domain)
        ? 'inner'
        : 'outer';

      context.emit?.('recursive_link:send', {
        to: '*',
        loop,
        slice,
        from: 'pillar_registry',
      });
      return;
    }
  },
};

type RecursiveCustodyResult =
  | {
      ok: true;
      receipt?: SemanticCustodyReceipt;
      migrationRequired: boolean;
    }
  | {
      ok: false;
      code: 'CUSTODY_REQUIRED' | 'CUSTODY_MISMATCH' | 'RECEIPT_REQUIRED';
      message: string;
    };

function validateRecursiveCustody(
  semanticMessage: SemanticCollaborationMessage | undefined,
  link: Pick<RecursiveLinkMessage, 'from' | 'to' | 'loop' | 'slice' | 'receipt'>,
  mode: RecursiveLinkConfig['custody_mode']
): RecursiveCustodyResult {
  if (!semanticMessage) {
    if (mode === 'strict') {
      return {
        ok: false,
        code: 'CUSTODY_REQUIRED',
        message: 'strict recursive links require an admitted semantic_message',
      };
    }
    return { ok: true, migrationRequired: true };
  }

  const receipt = getSemanticCustodyReceipt(semanticMessage);
  const payloadLoop =
    semanticMessage.payload && typeof semanticMessage.payload.loop === 'string'
      ? semanticMessage.payload.loop
      : undefined;
  const payloadReceipt =
    semanticMessage.payload && typeof semanticMessage.payload.link_receipt === 'string'
      ? semanticMessage.payload.link_receipt
      : undefined;
  if (mode === 'strict' && !link.receipt) {
    return {
      ok: false,
      code: 'RECEIPT_REQUIRED',
      message: 'strict recursive links require a SimulationContract receipt',
    };
  }
  if (
    semanticMessage.version !== '2.0' ||
    semanticMessage.action !== 'recursive_link' ||
    !receipt ||
    semanticMessage.from !== link.from ||
    semanticMessage.to !== link.to ||
    !sameSlice(semanticMessage.pillar_slice, link.slice) ||
    payloadLoop !== link.loop ||
    payloadReceipt !== link.receipt
  ) {
    return {
      ok: false,
      code: 'CUSTODY_MISMATCH',
      message:
        'semantic custody must bind recursive_link action, endpoints, loop payload, receipt, and complete slice',
    };
  }

  return { ok: true, receipt, migrationRequired: false };
}

function sameSlice(left: PillarSlice, right: PillarSlice): boolean {
  return (
    left.axis_1_id === right.axis_1_id &&
    left.axis_2_id === right.axis_2_id &&
    left.pos_1 === right.pos_1 &&
    left.pos_2 === right.pos_2 &&
    left.pillar_id === right.pillar_id &&
    left.pillar_domain === right.pillar_domain
  );
}

export default recursiveLinkHandler;
