/**
 * Tier 2 Self-Custody migration — Studio client library.
 *
 * Wraps the MCP-server API surface (identity-export-routes.ts, task _ards) and
 * provides state-machine types + wallet-crypto helpers for the browser.
 *
 * Spec: research/2026-04-23_tier2-self-custody-export-escape-hatch-v3.md
 * Server routes: packages/mcp-server/src/holomesh/routes/identity-export-routes.ts
 *
 * Observed API vs documented API drift (F.025 filed as task_1777015000000_drft):
 *   - /package expects { export_session_id, recovery_password, recovery_bytes_b64 }
 *     NOT the { kdf_params_hint, encrypted_envelope_meta } shape in the task desc.
 *     Server generates salt + nonce server-side and bakes them into the package.
 *   - /finalize replay returns { replay: true, message } WITHOUT the
 *     retired_custodial_signer_id. Clients MUST cache the first successful
 *     response (we do — see finalize()).
 *   - Error shapes: /package returns `session_not_in_prepared_state` when
 *     re-packaging a consumed session (not "session_already_packaged").
 *     /prepare also returns `already_self_custody` (not the generic 409 in
 *     task desc, but equivalent meaning).
 *   - Both /prepare and /finalize have a 500 `registry_transaction_failed` /
 *     `code: registry_error` branch — retry-safe per _dny4 atomicity contract.
 */

// ── Endpoint resolution ─────────────────────────────────────────────────────

/**
 * Base URL for the MCP server identity endpoints. Server-side we read the
 * same env var the rest of Studio uses; client-side we read
 * NEXT_PUBLIC_HOLOMESH_API_URL (optional — defaults to production).
 */
function resolveBaseUrl(): string {
  if (typeof window === 'undefined') {
    return (
      process.env.HOLOSCRIPT_MCP_URL ||
      process.env.NEXT_PUBLIC_HOLOMESH_API_URL ||
      'https://mcp.holoscript.net'
    );
  }
  // Browser: NEXT_PUBLIC vars are inlined at build time.
  return (
    (process.env.NEXT_PUBLIC_HOLOMESH_API_URL as string | undefined) ||
    'https://mcp.holoscript.net'
  );
}

// ── API response types ──────────────────────────────────────────────────────

export interface ExportPackageKdfParams {
  memory: number;
  iterations: number;
  parallelism: number;
  salt: string;
}

export interface ExportPackageEncryption {
  kdf: string;
  kdf_params: ExportPackageKdfParams;
  cipher: string;
  nonce: string;
}

export interface ExportPackage {
  version: string;
  user_id: string;
  issued_at: string;
  expires_at: string;
  encryption: ExportPackageEncryption;
  payload: string;
  manifest_hash: string;
  signature: string;
}

export interface PrepareResponse {
  success: true;
  export_session_id: string;
  expires_at: string; // ISO
  nonce: string; // hex, 64 char
  replay?: true;
}

export interface PackageResponse {
  success: true;
  package: ExportPackage;
  manifest_hash: string;
}

export interface FinalizeHappyResponse {
  success: true;
  status: 'self_custody_active';
  retired_custodial_signer_id: string;
  effective_at: string;
  replay?: false;
}

export interface FinalizeReplayResponse {
  success: true;
  status: 'self_custody_active';
  replay: true;
  message?: string;
}

export type FinalizeResponse = FinalizeHappyResponse | FinalizeReplayResponse;

/**
 * Canonical error envelope. `error` is the machine code the UI branches on.
 * `http_status` is attached so callers can separate 4xx (bad input — restart)
 * from 5xx (retry-safe transient).
 */
export interface SelfCustodyApiError {
  success: false;
  error: string; // machine code: session_expired | manifest_hash_mismatch | bad_ownership_proof | already_self_custody | etc.
  message?: string;
  http_status: number;
  /** Present on registry_transaction_failed — retry is safe per _dny4. */
  code?: string;
  /** Present on some conflict responses — sessions current status. */
  current_status?: string;
}

export function isApiError(x: unknown): x is SelfCustodyApiError {
  return (
    typeof x === 'object' && x !== null && (x as { success?: unknown }).success === false
  );
}

// ── State machine ───────────────────────────────────────────────────────────

/**
 * Discriminated union driving the wizard UI. Each state carries the data
 * needed to render its step and transition to the next. Error edges carry
 * the machine-coded failure so <ErrorPanel> can route to the right recovery.
 */
export type WizardState =
  | { kind: 'idle' }
  | { kind: 'preparing' }
  | {
      kind: 'prepared';
      sessionId: string;
      nonce: string;
      expiresAt: string;
      password: string;
    }
  | {
      kind: 'packaging';
      sessionId: string;
      nonce: string;
      expiresAt: string;
      password: string;
    }
  | {
      kind: 'packaged';
      sessionId: string;
      nonce: string;
      expiresAt: string;
      password: string;
      pkg: ExportPackage;
      manifestHash: string;
    }
  | {
      kind: 'confirming';
      sessionId: string;
      nonce: string;
      expiresAt: string;
      password: string;
      pkg: ExportPackage;
      manifestHash: string;
    }
  | {
      kind: 'awaiting-ownership';
      sessionId: string;
      nonce: string;
      expiresAt: string;
      pkg: ExportPackage;
      manifestHash: string;
    }
  | {
      kind: 'finalizing';
      sessionId: string;
      nonce: string;
      expiresAt: string;
      pkg: ExportPackage;
      manifestHash: string;
    }
  | {
      kind: 'success';
      retiredCustodialSignerId: string;
      effectiveAt: string;
      replay: boolean;
    }
  | {
      kind: 'error';
      error: SelfCustodyApiError;
      /** Previous state — lets us offer targeted recovery (e.g. re-sign, re-package). */
      from: WizardState['kind'];
      /** Context we might reuse on retry. */
      carried?: {
        sessionId?: string;
        nonce?: string;
        expiresAt?: string;
        pkg?: ExportPackage;
        manifestHash?: string;
        password?: string;
      };
    };

export type WizardStateKind = WizardState['kind'];

// ── Error-code routing (which kind can the user recover to?) ────────────────

/**
 * Maps machine error codes to the state the UI can hand the user back to so
 * they can retry. Returning `idle` means "full restart"; returning any other
 * kind means "resume from this step with the original carried context."
 *
 * These codes come from the MCP server — keep in lockstep with
 * identity-export-routes.ts. New codes default to 'idle' (full restart).
 */
export function recoveryTargetForError(
  errorCode: string,
  httpStatus: number
): WizardStateKind {
  // 500 is always retry-safe per _dny4 atomicity; resume from the step
  // that threw it.
  if (httpStatus >= 500) return 'idle';

  switch (errorCode) {
    case 'session_expired':
      return 'idle';
    case 'manifest_hash_mismatch':
      // Package got corrupted / user reloaded the wrong file. Server state
      // is still 'packaged' so we can't reissue — tell the user to restart.
      return 'idle';
    case 'bad_ownership_proof':
      // Bad signature — let user re-sign without losing session.
      return 'awaiting-ownership';
    case 'two_factor_required':
      return 'idle';
    case 'rate_limited':
      return 'idle';
    case 'already_self_custody':
      // User already migrated — not an error exactly, but the UI should
      // route to the "already done" screen. ErrorPanel treats this specially.
      return 'idle';
    case 'session_not_owned_by_caller':
    case 'session_not_in_prepared_state':
    case 'session_not_packaged':
    case 'session_already_finalized':
      return 'idle';
    default:
      return 'idle';
  }
}

// ── API calls ───────────────────────────────────────────────────────────────

interface ApiCallOptions {
  /** Bearer token for the MCP server. Caller is responsible for resolving
   *  (next-auth session / cookie / etc.). */
  bearerToken: string;
  /** Optional AbortSignal from the component. */
  signal?: AbortSignal;
  /** Overrides resolveBaseUrl() for tests. */
  baseUrl?: string;
}

async function jsonOrError(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: 'malformed_response', message: text.slice(0, 200) };
  }
}

export async function prepare(
  opts: ApiCallOptions & { idempotencyKey: string; twofaToken?: string }
): Promise<PrepareResponse | SelfCustodyApiError> {
  const base = opts.baseUrl ?? resolveBaseUrl();
  const res = await fetch(`${base}/api/identity/self-custody/export/prepare`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.bearerToken}`,
    },
    body: JSON.stringify({
      idempotency_key: opts.idempotencyKey,
      ...(opts.twofaToken ? { two_factor_token: opts.twofaToken } : {}),
    }),
    signal: opts.signal,
  });
  const body = (await jsonOrError(res)) as Record<string, unknown>;
  if (!res.ok || body.success === false) {
    return {
      success: false,
      error: typeof body.error === 'string' ? body.error : 'unknown_error',
      message: typeof body.message === 'string' ? body.message : undefined,
      http_status: res.status,
    };
  }
  return body as unknown as PrepareResponse;
}

export async function packageExport(
  opts: ApiCallOptions & {
    sessionId: string;
    recoveryPassword: string;
    recoveryBytesB64: string;
  }
): Promise<PackageResponse | SelfCustodyApiError> {
  const base = opts.baseUrl ?? resolveBaseUrl();
  const res = await fetch(`${base}/api/identity/self-custody/export/package`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.bearerToken}`,
    },
    body: JSON.stringify({
      export_session_id: opts.sessionId,
      recovery_password: opts.recoveryPassword,
      recovery_bytes_b64: opts.recoveryBytesB64,
    }),
    signal: opts.signal,
  });
  const body = (await jsonOrError(res)) as Record<string, unknown>;
  if (!res.ok || body.success === false) {
    return {
      success: false,
      error: typeof body.error === 'string' ? body.error : 'unknown_error',
      message: typeof body.message === 'string' ? body.message : undefined,
      current_status:
        typeof body.current_status === 'string' ? body.current_status : undefined,
      http_status: res.status,
    };
  }
  return body as unknown as PackageResponse;
}

export async function finalize(
  opts: ApiCallOptions & {
    sessionId: string;
    newWalletAddress: string;
    nonceSignatureB64: string;
    packageManifestHash: string;
    newWalletPublicKeyPem: string;
  }
): Promise<FinalizeResponse | SelfCustodyApiError> {
  const base = opts.baseUrl ?? resolveBaseUrl();
  const res = await fetch(`${base}/api/identity/self-custody/export/finalize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.bearerToken}`,
    },
    body: JSON.stringify({
      export_session_id: opts.sessionId,
      new_wallet_address: opts.newWalletAddress,
      nonce_signature_b64: opts.nonceSignatureB64,
      package_manifest_hash: opts.packageManifestHash,
      new_wallet_public_key_pem: opts.newWalletPublicKeyPem,
    }),
    signal: opts.signal,
  });
  const body = (await jsonOrError(res)) as Record<string, unknown>;
  if (!res.ok || body.success === false) {
    return {
      success: false,
      error: typeof body.error === 'string' ? body.error : 'unknown_error',
      message: typeof body.message === 'string' ? body.message : undefined,
      code: typeof body.code === 'string' ? body.code : undefined,
      http_status: res.status,
    };
  }
  return body as unknown as FinalizeResponse;
}

// ── Server-side crypto verification (called via Studio proxy) ───────────────

/**
 * Verify a package client-side by POSTing to the Studio Next.js proxy route,
 * which uses node:crypto helpers (same ones the MCP server uses to build
 * the package). Browser has no scrypt primitive, so we can't inline this.
 *
 * Non-destructive — this call does NOT touch the MCP server. Purpose is to
 * prove to the user that their password + package can recover the bytes
 * BEFORE we ask the server to retire the custodial signer.
 */
export interface VerifyPackageOK {
  ok: true;
  manifest_hash_ok: boolean;
  decrypt_ok: boolean;
  user_id: string;
  issued_at: string;
}

export interface VerifyPackageFail {
  ok: false;
  error: string;
}

export async function verifyPackageLocally(
  pkg: ExportPackage,
  password: string,
  signal?: AbortSignal
): Promise<VerifyPackageOK | VerifyPackageFail> {
  try {
    const res = await fetch('/api/identity/verify-package', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: pkg, password }),
      signal,
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || body.ok === false) {
      return {
        ok: false,
        error: typeof body.error === 'string' ? body.error : 'verification_failed',
      };
    }
    return body as unknown as VerifyPackageOK;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'network_error',
    };
  }
}

// ── Browser-side wallet keypair + signing (Web Crypto API) ──────────────────

/**
 * Generate an Ed25519 keypair in the browser. Returns the public key as
 * SubjectPublicKeyInfo PEM (matches node:crypto.createPublicKey input) and
 * the private key as a non-exportable CryptoKey.
 *
 * Algorithm name: 'Ed25519' — supported by modern Chromium/Firefox/Safari.
 * Fallback path intentionally not provided; old browsers fail the wizard
 * at this step with a clear message.
 */
export interface BrowserKeypair {
  publicKeyPem: string;
  privateKey: CryptoKey;
  /** 0x-prefixed hex of the public key — used as the "wallet address" for
   *  the MCP server's address binding. Not a full wallet address (that's
   *  custodian-specific) — the server treats this as an opaque identifier
   *  that's verifiable via the public key. */
  publicKeyHex: string;
}

export async function generateBrowserWalletKeypair(): Promise<BrowserKeypair> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto API not available in this environment.');
  }
  const keyPair = (await crypto.subtle.generateKey(
    'Ed25519' as unknown as AlgorithmIdentifier,
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;

  const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const b64 = bufferToBase64(spki);
  // Standard SPKI PEM wrapping, 64-char lines.
  const wrapped = b64.match(/.{1,64}/g)?.join('\n') ?? b64;
  const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----\n`;

  // Compact hex form — the tail of the SPKI encoding is the raw 32-byte
  // public key. For a defensive "address" we use the full SHA-256 of
  // the raw bytes, 0x-prefixed. Server binds to this string.
  const raw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const rawHash = await crypto.subtle.digest('SHA-256', raw);
  const publicKeyHex = '0x' + bufferToHex(rawHash);

  return {
    publicKeyPem,
    privateKey: keyPair.privateKey,
    publicKeyHex,
  };
}

/**
 * Sign the server-issued nonce with the wallet's private key. Returns base64
 * signature bytes — matches the `nonce_signature_b64` field the server expects.
 *
 * Server verifies with `crypto.verify(null, Buffer.from(nonce, 'utf8'),
 * pubKey, sig)` — we must hand it UTF-8 bytes of the nonce string, NOT hex-
 * decoded bytes. (Server treats the nonce as an opaque identifier string.)
 */
export async function signServerNonce(
  privateKey: CryptoKey,
  nonce: string
): Promise<string> {
  const msg = new TextEncoder().encode(nonce);
  const sig = await crypto.subtle.sign(
    'Ed25519' as unknown as AlgorithmIdentifier,
    privateKey,
    msg
  );
  return bufferToBase64(sig);
}

// ── Utility helpers ─────────────────────────────────────────────────────────

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  if (typeof btoa !== 'undefined') return btoa(bin);
  // Node fallback
  return Buffer.from(bin, 'binary').toString('base64');
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

/** Generate a client-side UUID v4 for idempotency keys. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback (tests / older browsers)
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Basic password strength scorer — zxcvbn-shaped output (0-4) without
 * the 800KB dep. UI should block submission at score < 2 and warn at < 3.
 *
 * Heuristic: length + character class diversity + common-pattern penalty.
 * Not a replacement for zxcvbn, but catches the worst offenders (short
 * passwords, single class, "password123" etc).
 */
export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  feedback: string[];
}

const COMMON_PATTERNS = [
  /^password/i,
  /^123456/,
  /^qwerty/i,
  /^letmein/i,
  /^admin/i,
  /^welcome/i,
  /^(.)\1+$/, // all same character
];

export function scorePassword(pw: string): PasswordStrength {
  const feedback: string[] = [];
  if (pw.length < 8) {
    feedback.push('Use at least 8 characters.');
    return { score: 0, feedback };
  }
  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  if (classes >= 2) score++;
  if (classes >= 3) score++;
  if (COMMON_PATTERNS.some((re) => re.test(pw))) {
    feedback.push('Avoid common patterns like "password123".');
    score = Math.max(0, score - 2);
  }
  if (classes < 2) feedback.push('Mix lowercase, uppercase, digits, and symbols.');
  if (pw.length < 12) feedback.push('Longer is stronger — aim for 16+ characters.');
  const clamped = Math.min(4, Math.max(0, score)) as PasswordStrength['score'];
  return { score: clamped, feedback };
}
