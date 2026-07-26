/**
 * QR Decode Trait
 *
 * Declares QR decoding as DATA (F.126). Consumed by compile targets — the Quest target emits a ZXing
 * MultiFormatReader (try-harder + inverted + center-crop fallback) driven by this config. The handler
 * holds no platform code; the decode emit lives in the compiler walking the trait.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface QrDecodeCenterCrop {
  width: number;
  height: number;
}

export interface QrDecodeReceiptConfig {
  /** Persist a scan-decision receipt for local diagnostics and custody proof. */
  enabled: boolean;
  /** Platform-neutral storage intent. */
  storage: 'memory' | 'device_private';
  /** Digest used for payload commitments and receipt chaining. */
  digest_algorithm: 'sha256';
  /** Link each receipt to the digest of its predecessor. */
  hash_chain: boolean;
  /** Privacy boundary: production scanners should keep this false. */
  include_payload: boolean;
  /** Maximum retained receipts before rotation. */
  max_entries: number;
}

export interface QrDecodeConfig {
  /** Decode library (Quest is GMS-free, so 'zxing-core'). */
  library: string;
  /** Barcode formats to attempt. */
  formats: string[];
  /** Always run the thorough read (no weak pre-pass gate). */
  try_harder: boolean;
  /** Also attempt inverted (dark-mode / light-on-dark) codes. */
  also_inverted: boolean;
  /** Second-pass search region for a small centered code. */
  center_crop: QrDecodeCenterCrop;
  /** Decode cadence throttle (ms) — controls battery, not fidelity. */
  decode_interval_ms: number;
  /** Suppress re-reporting the same value within this window (ms). */
  dedupe_window_ms: number;
  /** Maximum decoded payload size admitted for semantic classification. */
  max_payload_chars: number;
  /** Allow decoded payload values in platform logs. Privacy-safe default is false. */
  log_payload_values: boolean;
  /** Privacy-preserving receipt policy for scan decisions. */
  receipts?: QrDecodeReceiptConfig;
}

// =============================================================================
// HANDLER
// =============================================================================

export const qrDecodeHandler: TraitHandler<QrDecodeConfig> = {
  name: 'qr_decode',

  defaultConfig: {
    library: 'zxing-core',
    formats: ['QR_CODE'],
    try_harder: true,
    also_inverted: true,
    center_crop: { width: 640, height: 480 },
    decode_interval_ms: 200,
    dedupe_window_ms: 2500,
    max_payload_chars: 4096,
    log_payload_values: false,
    receipts: {
      enabled: false,
      storage: 'device_private',
      digest_algorithm: 'sha256',
      hash_chain: true,
      include_payload: false,
      max_entries: 1000,
    },
  },

  onEvent(node, _config, context, event) {
    if (event.type === 'camera:frame') {
      context.emit?.('qr:decode_request', { node: node.id });
    } else if (event.type === 'qr:decoded') {
      context.emit?.('qr:result', { node: node.id, text: event.payload?.text });
    }
  },
};

export default qrDecodeHandler;
