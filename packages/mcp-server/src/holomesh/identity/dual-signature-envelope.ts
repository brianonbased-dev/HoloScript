/**
 * Post-quantum dual-signature envelope — design + verifier scaffolding for
 * the 2030 NIST ECDSA deprecation (NIST IR 8547 prohibits classical PKC after
 * 2035; ASD Australia cuts off at 2030).
 *
 * Companion to:
 *   - request-signing.ts (classical EIP-191 / ECDSA verifier, current path)
 *   - signing-middleware.ts (per-request signing context helper)
 *   - signing/signer.ts (chain-anchor Signer interface for the live Trezor path)
 *
 * What ships here:
 *   1. DualSignatureEnvelope type + version byte for forward compatibility.
 *   2. Deterministic length-prefixed binary serializer + matching parser.
 *      Round-trips losslessly across all three modes.
 *   3. verifyDualSignature() — verifies classical-only / pqc-only / dual modes
 *      using @noble/post-quantum's ml_dsa65 (FIPS-204 Category-3) for the PQC
 *      side and viem's verifyMessage for the classical side (matches the
 *      existing request-signing.ts call path).
 *   4. signDual() + IPQCSigner injection point. The PQC signer is a stub
 *      (NoopPQCSigner throws) because the live Trezor PQC firmware doesn't
 *      exist yet — see scoping doc §5.
 *
 * What does NOT ship:
 *   - Live Trezor coordination for the classical signer (already wired
 *     through request-signing.ts + the seat-wallet protocol — we just point at
 *     it via the IClassicalSigner interface).
 *   - Live Trezor PQC firmware. Trezor's open roadmap discusses ML-DSA support
 *     but no firmware ships it today; NoopPQCSigner throws so callers fail
 *     loud the moment they try to sign in PQC or dual mode.
 *
 * Algorithm pick: ML-DSA-65 (CRYSTALS-Dilithium, Category 3 / ~AES-192).
 *   - 1952-byte public key, ~3309-byte signature
 *   - Lattice-based, no floating-point (vs Falcon's Gaussian sampling, which
 *     is hostile to deterministic hardware-wallet implementations)
 *   - Selected by NIST as a primary standard (FIPS-204, Aug 2024)
 *   - vs SLH-DSA-192: SLH-DSA is more conservative (hash-based, no lattice
 *     assumptions) but produces 17-50 KB signatures — too heavy for the
 *     per-mutation envelope path that fires on every HoloMesh team API call.
 *
 * Spec: research/2026-05-12_pqc-dual-sign-design.md
 *
 * @module holomesh/identity/dual-signature-envelope
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';

// ── Constants ─────────────────────────────────────────────────────────

/**
 * Envelope format version. Bumped when the wire layout changes in a way that
 * breaks parsers. Parsers reject any version they don't know how to handle.
 *
 * v1: ML-DSA-65 PQC + ECDSA-P256 classical, length-prefixed binary.
 */
export const DUAL_SIG_ENVELOPE_VERSION_V1 = 0x01;

/** ML-DSA-65 algorithm tag — written into the envelope so a future PQC-algo
 * migration (e.g. to ML-DSA-87 or a successor) doesn't ambiguate the parser. */
export const PQC_ALGO_ML_DSA_65 = 0x01;

/** ECDSA-P256 / EIP-191 personal_sign — matches request-signing.ts. */
export const CLASSICAL_ALGO_ECDSA_P256 = 0x01;

/** Mode field — written into the envelope as a 1-byte discriminant. */
export type DualSignatureMode = 'classical_only' | 'pqc_only' | 'dual';

const MODE_CLASSICAL_ONLY = 0x01;
const MODE_PQC_ONLY = 0x02;
const MODE_DUAL = 0x03;

function modeToByte(mode: DualSignatureMode): number {
  switch (mode) {
    case 'classical_only':
      return MODE_CLASSICAL_ONLY;
    case 'pqc_only':
      return MODE_PQC_ONLY;
    case 'dual':
      return MODE_DUAL;
  }
}

function modeFromByte(b: number): DualSignatureMode | null {
  switch (b) {
    case MODE_CLASSICAL_ONLY:
      return 'classical_only';
    case MODE_PQC_ONLY:
      return 'pqc_only';
    case MODE_DUAL:
      return 'dual';
    default:
      return null;
  }
}

// ── Envelope type ─────────────────────────────────────────────────────

/**
 * DualSignatureEnvelope — a container for a payload plus zero, one, or both of
 * its signatures (classical ECDSA + post-quantum ML-DSA-65).
 *
 * `payloadHash` is the SHA-256 of the canonicalized payload bytes. The
 * envelope NEVER carries the full payload — verifier callers must supply it
 * out of band (same shape as the existing request-signing.ts protocol, where
 * the body lives outside the signature). This keeps the envelope under ~5 KB
 * even when the payload is megabytes.
 *
 * Mode invariants (enforced by serializer + verifier):
 *   - `classical_only`: classicalSignature MUST be non-empty; pqcSignature
 *     bytes MAY be empty (serializer writes a 0-length record).
 *   - `pqc_only`: pqcSignature MUST be non-empty; classicalSignature MAY be
 *     empty.
 *   - `dual`: BOTH MUST be non-empty.
 */
export interface DualSignatureEnvelope {
  /** Format version byte (DUAL_SIG_ENVELOPE_VERSION_V1 today). */
  version: number;
  /** Signing mode discriminant. */
  mode: DualSignatureMode;
  /** SHA-256 of canonicalized payload bytes (32 bytes). */
  payloadHash: Uint8Array;
  /** Classical algorithm tag (CLASSICAL_ALGO_ECDSA_P256 today). */
  classicalAlgo: number;
  /** Classical signature bytes — empty Uint8Array when mode=pqc_only. */
  classicalSignature: Uint8Array;
  /** Classical signer 0x-address (20 bytes hex, 42 chars) — empty when pqc_only. */
  classicalSignerAddress: string;
  /** PQC algorithm tag (PQC_ALGO_ML_DSA_65 today). */
  pqcAlgo: number;
  /** PQC signature bytes — empty Uint8Array when mode=classical_only. */
  pqcSignature: Uint8Array;
  /** PQC public key bytes — empty Uint8Array when mode=classical_only. */
  pqcPublicKey: Uint8Array;
}

// ── Serialization ─────────────────────────────────────────────────────

/**
 * Magic prefix — 4-byte tag so a parser confronted with arbitrary bytes can
 * quickly reject non-envelopes. Spells "HDSE" (HoloMesh Dual Sig Envelope).
 */
const MAGIC = Uint8Array.of(0x48, 0x44, 0x53, 0x45);

/** Maximum payload-hash length — SHA-256 is always 32 bytes; reject anything else. */
const PAYLOAD_HASH_LEN = 32;

/**
 * Maximum byte length we'll accept for any length-prefixed field. Defends the
 * parser against DoS via 4 GB length headers in malformed input. The largest
 * legitimate field is the ML-DSA-65 signature at ~3309 bytes; ECDSA-P256 sigs
 * are 65 bytes (r||s||v); ML-DSA-65 pubkeys are 1952 bytes. 64 KB is comfortable.
 */
const MAX_FIELD_LEN = 64 * 1024;

/**
 * Write a u32 big-endian into a Uint8Array at offset.
 * Defensive choice: big-endian is the wire-format default in every cryptographic
 * spec we care about (TLS, IPsec, SSH), so parsers across languages will read
 * the same number out of these bytes.
 */
function writeU32BE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

function readU32BE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] << 24) >>> 0 |
    (buf[offset + 1] << 16) |
    (buf[offset + 2] << 8) |
    buf[offset + 3]
  );
}

/**
 * Encode a Uint8Array as a length-prefixed (u32-BE) record.
 * Returns the concatenated bytes.
 */
function encodeLP(field: Uint8Array): Uint8Array {
  if (field.length > MAX_FIELD_LEN) {
    throw new Error(
      `dual-sig-envelope: field length ${field.length} exceeds MAX_FIELD_LEN ${MAX_FIELD_LEN}`
    );
  }
  const out = new Uint8Array(4 + field.length);
  writeU32BE(out, 0, field.length);
  out.set(field, 4);
  return out;
}

/**
 * Read a length-prefixed record. Returns { bytes, nextOffset } or null on
 * malformed input (length > MAX_FIELD_LEN, or runs past end-of-buffer).
 */
function decodeLP(
  buf: Uint8Array,
  offset: number
): { bytes: Uint8Array; nextOffset: number } | null {
  if (offset + 4 > buf.length) return null;
  const len = readU32BE(buf, offset);
  if (len > MAX_FIELD_LEN) return null;
  if (offset + 4 + len > buf.length) return null;
  const bytes = buf.slice(offset + 4, offset + 4 + len);
  return { bytes, nextOffset: offset + 4 + len };
}

function utf8Encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function utf8Decode(b: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(b);
}

/**
 * Serialize a DualSignatureEnvelope to bytes.
 *
 * Wire layout (v1):
 *   offset  size  field
 *   ------  ----  -----
 *        0     4  MAGIC ("HDSE")
 *        4     1  version
 *        5     1  mode byte (0x01=classical_only, 0x02=pqc_only, 0x03=dual)
 *        6     1  classicalAlgo
 *        7     1  pqcAlgo
 *        8    32  payloadHash (always 32 bytes)
 *       40   4+N  classicalSignature (u32-BE length || bytes)
 *      ...   4+N  classicalSignerAddress (u32-BE length || UTF-8 bytes)
 *      ...   4+N  pqcSignature (u32-BE length || bytes)
 *      ...   4+N  pqcPublicKey (u32-BE length || bytes)
 *
 * Throws if mode invariants are violated (e.g. mode=dual but pqcSignature
 * is empty). This is the EARLIER of two enforcement points — verifyDualSignature
 * also rejects mode-mismatch, but failing here catches buggy callers before
 * the bad envelope hits the wire.
 */
export function serializeDualSignatureEnvelope(env: DualSignatureEnvelope): Uint8Array {
  // ── Validate mode invariants ─────────────────────────────────
  if (env.payloadHash.length !== PAYLOAD_HASH_LEN) {
    throw new Error(
      `dual-sig-envelope: payloadHash must be ${PAYLOAD_HASH_LEN} bytes (got ${env.payloadHash.length})`
    );
  }
  if (env.version !== DUAL_SIG_ENVELOPE_VERSION_V1) {
    throw new Error(`dual-sig-envelope: unsupported version ${env.version}`);
  }
  const needsClassical = env.mode === 'classical_only' || env.mode === 'dual';
  const needsPqc = env.mode === 'pqc_only' || env.mode === 'dual';
  if (needsClassical && env.classicalSignature.length === 0) {
    throw new Error(`dual-sig-envelope: mode=${env.mode} requires classicalSignature`);
  }
  if (needsClassical && env.classicalSignerAddress.length === 0) {
    throw new Error(`dual-sig-envelope: mode=${env.mode} requires classicalSignerAddress`);
  }
  if (needsPqc && env.pqcSignature.length === 0) {
    throw new Error(`dual-sig-envelope: mode=${env.mode} requires pqcSignature`);
  }
  if (needsPqc && env.pqcPublicKey.length === 0) {
    throw new Error(`dual-sig-envelope: mode=${env.mode} requires pqcPublicKey`);
  }

  // ── Build fixed-prefix header ────────────────────────────────
  const header = new Uint8Array(4 + 1 + 1 + 1 + 1 + PAYLOAD_HASH_LEN);
  header.set(MAGIC, 0);
  header[4] = env.version;
  header[5] = modeToByte(env.mode);
  header[6] = env.classicalAlgo;
  header[7] = env.pqcAlgo;
  header.set(env.payloadHash, 8);

  // ── Length-prefix the variable fields ────────────────────────
  const classicalSig = encodeLP(env.classicalSignature);
  const classicalAddr = encodeLP(utf8Encode(env.classicalSignerAddress));
  const pqcSig = encodeLP(env.pqcSignature);
  const pqcPub = encodeLP(env.pqcPublicKey);

  const total =
    header.length + classicalSig.length + classicalAddr.length + pqcSig.length + pqcPub.length;
  const out = new Uint8Array(total);
  let off = 0;
  out.set(header, off);
  off += header.length;
  out.set(classicalSig, off);
  off += classicalSig.length;
  out.set(classicalAddr, off);
  off += classicalAddr.length;
  out.set(pqcSig, off);
  off += pqcSig.length;
  out.set(pqcPub, off);
  return out;
}

/** Parser result — discriminated union: either an envelope or a structured error. */
export type ParseResult =
  | { ok: true; envelope: DualSignatureEnvelope }
  | { ok: false; reason: ParseError };

export type ParseError =
  | 'truncated'
  | 'bad-magic'
  | 'unsupported-version'
  | 'unknown-mode'
  | 'invalid-payload-hash'
  | 'malformed-length-prefix'
  | 'mode-invariant-violated'
  | 'invalid-utf8-address';

/**
 * Parse bytes into a DualSignatureEnvelope. Returns a discriminated-union
 * result; callers MUST check `ok` before reading `envelope`.
 *
 * Defends against:
 *   - truncated input (any field running past end-of-buffer)
 *   - wrong magic prefix (some random buffer was passed in)
 *   - unsupported version (forward-compat — future parser uses this)
 *   - unknown mode byte
 *   - malformed length prefixes (length > MAX_FIELD_LEN)
 *   - mode invariant violations after parsing (e.g. mode=dual but sig empty)
 */
export function parseDualSignatureEnvelope(buf: Uint8Array): ParseResult {
  if (buf.length < 4 + 1 + 1 + 1 + 1 + PAYLOAD_HASH_LEN) {
    return { ok: false, reason: 'truncated' };
  }
  for (let i = 0; i < MAGIC.length; i++) {
    if (buf[i] !== MAGIC[i]) return { ok: false, reason: 'bad-magic' };
  }
  const version = buf[4];
  if (version !== DUAL_SIG_ENVELOPE_VERSION_V1) {
    return { ok: false, reason: 'unsupported-version' };
  }
  const mode = modeFromByte(buf[5]);
  if (mode === null) return { ok: false, reason: 'unknown-mode' };
  const classicalAlgo = buf[6];
  const pqcAlgo = buf[7];
  const payloadHash = buf.slice(8, 8 + PAYLOAD_HASH_LEN);
  if (payloadHash.length !== PAYLOAD_HASH_LEN) {
    return { ok: false, reason: 'invalid-payload-hash' };
  }

  let off = 8 + PAYLOAD_HASH_LEN;

  const classicalSigRec = decodeLP(buf, off);
  if (!classicalSigRec) return { ok: false, reason: 'malformed-length-prefix' };
  off = classicalSigRec.nextOffset;

  const classicalAddrRec = decodeLP(buf, off);
  if (!classicalAddrRec) return { ok: false, reason: 'malformed-length-prefix' };
  off = classicalAddrRec.nextOffset;

  let classicalSignerAddress: string;
  try {
    classicalSignerAddress = utf8Decode(classicalAddrRec.bytes);
  } catch {
    return { ok: false, reason: 'invalid-utf8-address' };
  }

  const pqcSigRec = decodeLP(buf, off);
  if (!pqcSigRec) return { ok: false, reason: 'malformed-length-prefix' };
  off = pqcSigRec.nextOffset;

  const pqcPubRec = decodeLP(buf, off);
  if (!pqcPubRec) return { ok: false, reason: 'malformed-length-prefix' };

  const env: DualSignatureEnvelope = {
    version,
    mode,
    payloadHash,
    classicalAlgo,
    classicalSignature: classicalSigRec.bytes,
    classicalSignerAddress,
    pqcAlgo,
    pqcSignature: pqcSigRec.bytes,
    pqcPublicKey: pqcPubRec.bytes,
  };

  // ── Validate mode invariants AFTER parse (catches malformed dual-mode bytes) ──
  const needsClassical = env.mode === 'classical_only' || env.mode === 'dual';
  const needsPqc = env.mode === 'pqc_only' || env.mode === 'dual';
  if (needsClassical && env.classicalSignature.length === 0) {
    return { ok: false, reason: 'mode-invariant-violated' };
  }
  if (needsClassical && env.classicalSignerAddress.length === 0) {
    return { ok: false, reason: 'mode-invariant-violated' };
  }
  if (needsPqc && env.pqcSignature.length === 0) {
    return { ok: false, reason: 'mode-invariant-violated' };
  }
  if (needsPqc && env.pqcPublicKey.length === 0) {
    return { ok: false, reason: 'mode-invariant-violated' };
  }

  return { ok: true, envelope: env };
}

// ── Verifier ──────────────────────────────────────────────────────────

export interface VerifyDualSignatureResult {
  /** Top-level verdict — the only bit callers SHOULD branch on for accept/reject. */
  valid: boolean;
  /** Mode echoed from the envelope. */
  mode: DualSignatureMode;
  /** Classical verification verdict — undefined when mode=pqc_only. */
  classicalValid?: boolean;
  /** PQC verification verdict — undefined when mode=classical_only. */
  pqcValid?: boolean;
  /** Failure reason — only present when valid=false. */
  reason?: VerifyFailureReason;
}

export type VerifyFailureReason =
  | 'payload-hash-mismatch'
  | 'classical-signature-invalid'
  | 'pqc-signature-invalid'
  | 'classical-verify-threw'
  | 'pqc-verify-threw'
  | 'unsupported-classical-algo'
  | 'unsupported-pqc-algo'
  | 'mode-mismatch';

/**
 * Adapter for the classical signature verifier. Production wiring uses
 * viem's verifyMessage (matches request-signing.ts call path).
 *
 * Why an adapter? Two reasons:
 *   1. The existing verifier in request-signing.ts uses a personal-sign
 *      payload of `canonicalizeBody({body, nonce, timestamp})` — for the dual
 *      envelope path the "payload" is the raw payloadHash bytes (callers
 *      have already canonicalized + hashed before signing). Centralizing the
 *      message-shape decision behind an interface keeps the verifier path
 *      independent of the higher-level envelope orchestration.
 *   2. Unit tests inject a deterministic verifier so they don't need to
 *      generate real ECDSA signatures (the test for classical-side correctness
 *      already exists at request-signing.test.ts).
 */
export interface IClassicalVerifier {
  /**
   * Return true if `signature` is a valid signature over `payloadHash` by the
   * holder of `signerAddress`. Implementations MUST treat thrown errors as
   * verification failure (caller will translate to 'classical-verify-threw').
   */
  verify(
    payloadHash: Uint8Array,
    signature: Uint8Array,
    signerAddress: string
  ): Promise<boolean>;
}

/**
 * Default classical verifier — wraps viem.verifyMessage with the same
 * personal_sign semantics as request-signing.ts. The "message" verified is
 * the hex-encoded payload hash (callers can substitute a different adapter
 * if they want raw-bytes EIP-191 semantics).
 *
 * Note on test path: tests use a MockClassicalVerifier that returns true/false
 * synchronously without touching viem.
 */
export class ViemClassicalVerifier implements IClassicalVerifier {
  async verify(
    payloadHash: Uint8Array,
    signature: Uint8Array,
    signerAddress: string
  ): Promise<boolean> {
    const { verifyMessage } = await import('viem');
    const sigHex = '0x' + bytesToHex(signature);
    const msgHex = '0x' + bytesToHex(payloadHash);
    return verifyMessage({
      address: signerAddress as `0x${string}`,
      message: msgHex,
      signature: sigHex as `0x${string}`,
    });
  }
}

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) {
    s += b[i].toString(16).padStart(2, '0');
  }
  return s;
}

/**
 * Verify a DualSignatureEnvelope.
 *
 * Behavior:
 *   - `classical_only`: verify ECDSA only; pass if ECDSA valid; ignore PQC fields.
 *   - `pqc_only`: verify PQC only; pass if PQC valid; ignore ECDSA fields.
 *   - `dual`: verify BOTH; pass only if both valid; expose individual flags.
 *
 * `payload` is the raw bytes the signer committed to. The verifier
 * canonicalizes it the same way the signer did (SHA-256) and rejects if the
 * recomputed hash doesn't match the envelope's payloadHash field. This catches
 * the case where an attacker tampered with the payload but left the
 * signatures+envelope intact.
 */
export async function verifyDualSignature(
  envelope: DualSignatureEnvelope,
  payload: Uint8Array,
  options: {
    classicalVerifier?: IClassicalVerifier;
  } = {}
): Promise<VerifyDualSignatureResult> {
  const classicalVerifier = options.classicalVerifier ?? new ViemClassicalVerifier();

  // ── Payload-hash check (defends against payload tampering) ───
  const recomputed = await sha256(payload);
  if (!constantTimeEqual(recomputed, envelope.payloadHash)) {
    return { valid: false, mode: envelope.mode, reason: 'payload-hash-mismatch' };
  }

  // ── Algorithm-tag checks ─────────────────────────────────────
  const needsClassical = envelope.mode === 'classical_only' || envelope.mode === 'dual';
  const needsPqc = envelope.mode === 'pqc_only' || envelope.mode === 'dual';

  if (needsClassical && envelope.classicalAlgo !== CLASSICAL_ALGO_ECDSA_P256) {
    return { valid: false, mode: envelope.mode, reason: 'unsupported-classical-algo' };
  }
  if (needsPqc && envelope.pqcAlgo !== PQC_ALGO_ML_DSA_65) {
    return { valid: false, mode: envelope.mode, reason: 'unsupported-pqc-algo' };
  }

  // ── Mode-mismatch checks (parser also catches this; defense-in-depth) ──
  if (needsClassical && envelope.classicalSignature.length === 0) {
    return { valid: false, mode: envelope.mode, reason: 'mode-mismatch' };
  }
  if (needsPqc && envelope.pqcSignature.length === 0) {
    return { valid: false, mode: envelope.mode, reason: 'mode-mismatch' };
  }

  // ── Classical verification ───────────────────────────────────
  let classicalValid: boolean | undefined;
  if (needsClassical) {
    try {
      classicalValid = await classicalVerifier.verify(
        envelope.payloadHash,
        envelope.classicalSignature,
        envelope.classicalSignerAddress
      );
    } catch {
      return {
        valid: false,
        mode: envelope.mode,
        classicalValid: false,
        reason: 'classical-verify-threw',
      };
    }
  }

  // ── PQC verification ─────────────────────────────────────────
  let pqcValid: boolean | undefined;
  if (needsPqc) {
    try {
      pqcValid = ml_dsa65.verify(
        envelope.pqcSignature,
        envelope.payloadHash,
        envelope.pqcPublicKey
      );
    } catch {
      return {
        valid: false,
        mode: envelope.mode,
        classicalValid,
        pqcValid: false,
        reason: 'pqc-verify-threw',
      };
    }
  }

  // ── Combine verdicts per mode ────────────────────────────────
  let valid: boolean;
  let reason: VerifyFailureReason | undefined;
  switch (envelope.mode) {
    case 'classical_only':
      valid = classicalValid === true;
      if (!valid) reason = 'classical-signature-invalid';
      break;
    case 'pqc_only':
      valid = pqcValid === true;
      if (!valid) reason = 'pqc-signature-invalid';
      break;
    case 'dual':
      valid = classicalValid === true && pqcValid === true;
      if (!valid) {
        // Pick the more informative reason; both can be exposed via the flags.
        if (classicalValid !== true) reason = 'classical-signature-invalid';
        else reason = 'pqc-signature-invalid';
      }
      break;
  }

  return { valid, mode: envelope.mode, classicalValid, pqcValid, reason };
}

// ── Signer interfaces (live signing is founder-gated) ─────────────────

/**
 * Adapter for the classical signer. Production wiring delegates to the
 * existing seat-wallet Trezor + Rabby flow (see chain-anchor pattern in
 * F.041 / W.GOLD.514 — eth_sendTransaction with EIP-712 hash as calldata).
 *
 * FOUNDER-GATED: live signing requires Trezor hardware coordination. The
 * concrete wire-up of an `IClassicalSigner` that talks to Rabby+Trezor is
 * already designed (signing/signer.ts EthersSigner + the founder-gated
 * TrezorSigner task task_1778132312944_bcup).
 */
export interface IClassicalSigner {
  /** 0x-prefixed Ethereum address this signer will use. */
  getAddress(): Promise<string>;
  /** Sign the payload-hash bytes. MUST return ECDSA-P256 / EIP-191 signature. */
  sign(payloadHash: Uint8Array): Promise<Uint8Array>;
}

/**
 * Adapter for the post-quantum signer. ZERO production implementations exist
 * today because Trezor firmware does not yet support ML-DSA-65 — see the
 * scoping doc §5 for the founder coordination checklist.
 *
 * The dev-time signer for testing the verifier path generates an ML-DSA-65
 * keypair via @noble/post-quantum and signs in software. That signer ships
 * (TestPQCSigner below) but is explicitly marked dev-only.
 */
export interface IPQCSigner {
  /** ML-DSA-65 public key bytes. */
  getPublicKey(): Promise<Uint8Array>;
  /** Sign payload-hash bytes. MUST return an ML-DSA-65 signature. */
  sign(payloadHash: Uint8Array): Promise<Uint8Array>;
}

/**
 * NoopPQCSigner — throws on every call. Use as the default IPQCSigner so any
 * code path that tries to sign in PQC or dual mode WITHOUT explicitly wiring a
 * real signer fails loud rather than silently producing an
 * envelope-without-PQC-signature.
 *
 * FOUNDER-GATED: replace with a real Trezor-backed signer once firmware lands.
 */
export class NoopPQCSigner implements IPQCSigner {
  async getPublicKey(): Promise<Uint8Array> {
    throw new Error(
      'FOUNDER-GATED: Trezor PQC firmware not yet wired. ' +
        'Pass a real IPQCSigner (e.g. TestPQCSigner in unit tests) ' +
        'or use mode="classical_only" until firmware ships.'
    );
  }
  async sign(_payloadHash: Uint8Array): Promise<Uint8Array> {
    throw new Error(
      'FOUNDER-GATED: Trezor PQC firmware not yet wired. ' +
        'Pass a real IPQCSigner (e.g. TestPQCSigner in unit tests) ' +
        'or use mode="classical_only" until firmware ships.'
    );
  }
}

/**
 * TestPQCSigner — software ML-DSA-65 signer for tests + dev exercising the
 * verifier round-trip. NOT for production — there is no hardware-rooted
 * private-key custody here.
 *
 * Constructed with a 32-byte seed (or random if omitted) so tests can
 * deterministically regenerate the same keypair.
 */
export class TestPQCSigner implements IPQCSigner {
  private readonly keys: { publicKey: Uint8Array; secretKey: Uint8Array };

  constructor(seed?: Uint8Array) {
    if (seed && seed.length !== 32) {
      throw new Error(`TestPQCSigner: seed must be 32 bytes (got ${seed.length})`);
    }
    this.keys = ml_dsa65.keygen(seed);
  }

  async getPublicKey(): Promise<Uint8Array> {
    return this.keys.publicKey;
  }

  async sign(payloadHash: Uint8Array): Promise<Uint8Array> {
    return ml_dsa65.sign(payloadHash, this.keys.secretKey);
  }
}

/**
 * Sign a payload, producing a DualSignatureEnvelope.
 *
 * FOUNDER-GATED: the classical signer points at the existing seat-wallet path
 * (see signing/signer.ts) — for testing it can be a software ECDSA signer; for
 * production it MUST be the Trezor-backed adapter. The PQC signer is
 * NoopPQCSigner by default — passing it through to mode=pqc_only or
 * mode=dual throws.
 *
 * Tests inject TestPQCSigner + a mock classical signer to exercise the
 * round-trip. Production callers building toward the 2030 cutover use
 * mode='dual' once both signers are wired.
 */
export async function signDual(
  payload: Uint8Array,
  mode: DualSignatureMode,
  signers: {
    classical?: IClassicalSigner;
    pqc?: IPQCSigner;
  }
): Promise<DualSignatureEnvelope> {
  const needsClassical = mode === 'classical_only' || mode === 'dual';
  const needsPqc = mode === 'pqc_only' || mode === 'dual';

  if (needsClassical && !signers.classical) {
    throw new Error(`signDual: mode=${mode} requires a classical signer`);
  }
  if (needsPqc && !signers.pqc) {
    throw new Error(`signDual: mode=${mode} requires a pqc signer`);
  }

  const payloadHash = await sha256(payload);

  let classicalSignature = new Uint8Array(0);
  let classicalSignerAddress = '';
  if (needsClassical && signers.classical) {
    classicalSignerAddress = await signers.classical.getAddress();
    classicalSignature = (await signers.classical.sign(payloadHash)) as Uint8Array<ArrayBuffer>;
  }

  let pqcSignature = new Uint8Array(0);
  let pqcPublicKey = new Uint8Array(0);
  if (needsPqc && signers.pqc) {
    pqcPublicKey = (await signers.pqc.getPublicKey()) as Uint8Array<ArrayBuffer>;
    pqcSignature = (await signers.pqc.sign(payloadHash)) as Uint8Array<ArrayBuffer>;
  }

  return {
    version: DUAL_SIG_ENVELOPE_VERSION_V1,
    mode,
    payloadHash,
    classicalAlgo: CLASSICAL_ALGO_ECDSA_P256,
    classicalSignature,
    classicalSignerAddress,
    pqcAlgo: PQC_ALGO_ML_DSA_65,
    pqcSignature,
    pqcPublicKey,
  };
}

// ── Utilities ─────────────────────────────────────────────────────────

/**
 * SHA-256 hash via Node's built-in `crypto` module. Async to match the
 * WebCrypto shape (subtle.digest is async); makes drop-in browser/runtime
 * substitution straightforward if we ever need to verify in-browser.
 */
async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const { createHash } = await import('crypto');
  const h = createHash('sha256');
  h.update(bytes);
  return new Uint8Array(h.digest());
}

/**
 * Constant-time byte-array comparison. Used for payloadHash equality so a
 * tampered envelope can't time-leak which bytes diverged.
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
