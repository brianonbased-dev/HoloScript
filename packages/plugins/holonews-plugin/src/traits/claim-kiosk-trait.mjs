/**
 * ClaimKioskTrait — pure ESM implementation of the @claim_kiosk trait handler.
 *
 * Binds a CAEL receipt to a renderable in-zone HoloLand object and enforces
 * the proof-adjacency wall invariant (G.910.01).
 *
 * This file is pure .mjs so it can be imported by Node-native scripts tests
 * (scripts/__tests__/holonews-proof-adjacency.test.mjs) without a TS loader.
 * The TypeScript wrapper (ClaimKioskTrait.ts) re-exports from this file.
 */

import { buildKioskDisplayModel, auditReceiptForWallInvariant } from './proof-adjacency-guard.mjs';

// ── defaultConfig ──────────────────────────────────────────────────────────

export const defaultClaimKioskConfig = {
  canRenderWall: true,
  label: 'Verified Claim Kiosk',
  showEnvelope: true,
  loudAuditFailures: true,
};

// ── Handler factory ────────────────────────────────────────────────────────

/**
 * Create the @claim_kiosk trait handler.
 *
 * @returns {{ name: string, defaultConfig: object, onAttach: Function,
 *             onDetach: Function, onUpdate: Function, onEvent: Function }}
 */
export function createClaimKioskHandler() {
  return {
    name: 'claim_kiosk',
    defaultConfig: defaultClaimKioskConfig,

    onAttach(node, _config, ctx) {
      node.__kioskState = {
        receipt: null,
        displayModel: null,
        envelopeOverrides: {},
        idle: true,
      };
      ctx.emit?.('kiosk:ready');
    },

    onDetach(node, _config, ctx) {
      delete node.__kioskState;
      ctx.emit?.('kiosk:offline');
    },

    onUpdate(_node, _config, _ctx, _deltaMs) {
      // Event-driven — no continuous update logic.
    },

    onEvent(node, config, ctx, event) {
      const state = node.__kioskState;
      if (!state) return;

      // ── kiosk:receipt_bind ────────────────────────────────────────────
      if (event.type === 'kiosk:receipt_bind') {
        const receipt = event.payload?.receipt;
        if (!receipt) {
          ctx.emit?.('kiosk:error', { reason: 'receipt_bind received no receipt in payload' });
          return;
        }

        const violations = auditReceiptForWallInvariant(receipt);
        if (violations.length > 0 && config.loudAuditFailures) {
          ctx.emit?.('kiosk:audit_violation', { violations, receiptId: receipt.receiptId });
        }

        const displayModel = buildKioskDisplayModel(receipt, config.canRenderWall);

        state.receipt = receipt;
        state.displayModel = displayModel;
        state.envelopeOverrides = {};
        state.idle = false;

        ctx.emit?.('kiosk:display_ready', { displayModel });

        if (displayModel.showBadge) {
          // Badge shown — wall MUST be co-rendered (enforced by policy='badge-with-wall').
          ctx.emit?.('kiosk:badge_render', {
            claimText: displayModel.claimText,
            wallText: displayModel.wallText,
            verifyUrl: displayModel.verifyUrl,
          });
        } else if (displayModel.policy === 'badge-suppressed-rerun-only') {
          ctx.emit?.('kiosk:badge_suppressed', {
            claimText: displayModel.claimText,
            verifyUrl: displayModel.verifyUrl,
            reason:
              receipt.notProvenWall == null || receipt.notProvenWall.trim() === ''
                ? 'missing_wall_text'
                : 'target_cannot_render_wall',
          });
        }
        // policy === 'no-badge': labeled or pending — no badge event.
        return;
      }

      // ── kiosk:envelope_update ─────────────────────────────────────────
      if (event.type === 'kiosk:envelope_update') {
        if (!state.receipt?.envelope) {
          ctx.emit?.('kiosk:error', {
            reason: 'envelope_update received but no envelope on receipt',
          });
          return;
        }
        const paramName = event.payload?.paramName;
        const value = event.payload?.value;
        if (paramName == null || value == null) {
          ctx.emit?.('kiosk:error', { reason: 'envelope_update missing paramName or value' });
          return;
        }
        const param = state.receipt.envelope.params.find((p) => p.name === paramName);
        if (!param) {
          ctx.emit?.('kiosk:error', {
            reason: `envelope_update: unknown param "${paramName}"`,
          });
          return;
        }
        const clamped = Math.min(Math.max(value, param.min), param.max);
        state.envelopeOverrides[paramName] = clamped;

        ctx.emit?.('kiosk:envelope_changed', {
          paramName,
          value: clamped,
          allOverrides: { ...state.envelopeOverrides },
          boundaryDescription: state.receipt.envelope.boundaryDescription,
        });
        return;
      }

      // ── kiosk:rerun_request ───────────────────────────────────────────
      if (event.type === 'kiosk:rerun_request') {
        if (!state.receipt) {
          ctx.emit?.('kiosk:error', { reason: 'rerun_request but no receipt bound' });
          return;
        }
        ctx.emit?.('kiosk:rerun_initiated', {
          verifyUrl: state.receipt.verifyUrl,
          traceId: state.receipt.traceId,
          envelopeOverrides: { ...state.envelopeOverrides },
        });
        return;
      }

      // ── kiosk:reset ───────────────────────────────────────────────────
      if (event.type === 'kiosk:reset') {
        state.receipt = null;
        state.displayModel = null;
        state.envelopeOverrides = {};
        state.idle = true;
        ctx.emit?.('kiosk:ready');
      }
    },
  };
}

// ── buildCaelReceipt ───────────────────────────────────────────────────────

/**
 * Build a CaelReceipt from verify_cael_trace output fields plus the required
 * human-authored claim text and not-proven wall.
 *
 * @param {{
 *   receiptId: string, traceId: string, verifyUrl: string,
 *   hashChainValid: boolean, replayValid: boolean,
 *   claimText: string, notProvenWall: string,
 *   sealedAt?: string,
 *   envelope?: object,
 * }} opts
 */
export function buildCaelReceipt(opts) {
  const verdict = opts.hashChainValid && opts.replayValid ? 'proven' : 'labeled';
  return {
    receiptId: opts.receiptId,
    traceId: opts.traceId,
    verifyUrl: opts.verifyUrl,
    verdict,
    hashChainValid: opts.hashChainValid,
    replayValid: opts.replayValid,
    sealedAt: opts.sealedAt ?? new Date().toISOString(),
    claimText: opts.claimText,
    notProvenWall: opts.notProvenWall,
    ...(opts.envelope != null ? { envelope: opts.envelope } : {}),
  };
}
