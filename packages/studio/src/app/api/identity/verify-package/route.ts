/**
 * POST /api/identity/verify-package
 *
 * Server-side proxy for the Tier 2 self-custody "confirmation step"
 * (task _rzi7). User enters their recovery password and we attempt to:
 *   1. Recompute the manifest hash and compare to the stored one
 *      (tamper check — rejects if any covered field was modified).
 *   2. Decrypt the payload with the user-supplied password
 *      (recoverability check — proves the user CAN recover their secret
 *      before they finalize the migration and lose the custodial path).
 *
 * CRITICAL: this route does NOT talk to the MCP server. It runs entirely
 * server-side inside Studio's Next.js process using node:crypto so the
 * user's recovery password never leaves Studio.
 *
 * Why this route exists:
 *   - The crypto helpers (verifyManifestHash + decryptPayload) use
 *     scrypt + chacha20-poly1305 which are Node-only primitives. The
 *     browser has no scrypt binding.
 *   - We could ship a WASM scrypt to the browser, but that bloats the
 *     bundle by ~200KB and the user is already inside Studio (they have
 *     server trust). Proxy is the cleaner path.
 *
 * Does NOT log the password or the decrypted recovery bytes. Only the
 * result (ok / error code) is returned and no access log includes the
 * request body.
 */

export const maxDuration = 30;
export const runtime = 'nodejs'; // node:crypto needed; no edge runtime.

import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';

const EXPORT_PACKAGE_VERSION = 'v3.0';
const AUTH_TAG_BYTES = 16;

interface ExportPackageKdfParams {
  memory: number;
  iterations: number;
  parallelism: number;
  salt: string;
}

interface ExportPackageEncryption {
  kdf: string;
  kdf_params: ExportPackageKdfParams;
  cipher: string;
  nonce: string;
}

interface ExportPackage {
  version: string;
  user_id: string;
  issued_at: string;
  expires_at: string;
  encryption: ExportPackageEncryption;
  payload: string;
  manifest_hash: string;
  signature: string;
}

/**
 * Canonical manifest = same byte-exact layout as the MCP server's
 * export-package.ts `canonicalManifest`. If you change this, change the
 * server too — hash breakage is silent and catastrophic.
 */
function canonicalManifest(pkg: ExportPackage): string {
  const manifest = {
    version: pkg.version,
    user_id: pkg.user_id,
    issued_at: pkg.issued_at,
    expires_at: pkg.expires_at,
    encryption: {
      kdf: pkg.encryption.kdf,
      kdf_params: {
        memory: pkg.encryption.kdf_params.memory,
        iterations: pkg.encryption.kdf_params.iterations,
        parallelism: pkg.encryption.kdf_params.parallelism,
        salt: pkg.encryption.kdf_params.salt,
      },
      cipher: pkg.encryption.cipher,
      nonce: pkg.encryption.nonce,
    },
  };
  return JSON.stringify(manifest);
}

function computeManifestHash(pkg: ExportPackage): string {
  const hex = crypto.createHash('sha256').update(canonicalManifest(pkg)).digest('hex');
  return `sha256:${hex}`;
}

function verifyManifestHashLocal(pkg: ExportPackage): boolean {
  if (!pkg || typeof pkg.manifest_hash !== 'string') return false;
  try {
    const recomputed = computeManifestHash(pkg);
    const a = Buffer.from(pkg.manifest_hash);
    const b = Buffer.from(recomputed);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function deriveExportKey(password: string, saltBase64: string, params: ExportPackageKdfParams): Buffer {
  const salt = Buffer.from(saltBase64, 'base64');
  if (salt.length === 0) {
    throw new Error('empty salt');
  }
  // Match server-side scrypt config (N=2^17, r=8, p=1 — see export-package.ts).
  // Pull from kdf_params.* on the package so a future v3.1 with different
  // costs Just Works.
  return crypto.scryptSync(password, salt, 32, {
    N: params.memory,
    r: params.iterations,
    p: params.parallelism,
    maxmem: 256 * params.memory * params.iterations,
  });
}

function decryptPayloadLocal(pkg: ExportPackage, password: string): { ok: true; bytes: Buffer } | { ok: false } {
  if (!pkg || !password) return { ok: false };
  try {
    const key = deriveExportKey(password, pkg.encryption.kdf_params.salt, pkg.encryption.kdf_params);
    const nonce = Buffer.from(pkg.encryption.nonce, 'base64');
    const blob = Buffer.from(pkg.payload, 'base64');
    if (blob.length < AUTH_TAG_BYTES) return { ok: false };
    const ciphertext = blob.subarray(0, blob.length - AUTH_TAG_BYTES);
    const authTag = blob.subarray(blob.length - AUTH_TAG_BYTES);

    const decipher = crypto.createDecipheriv('chacha20-poly1305', key, nonce, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return { ok: true, bytes: plaintext };
  } catch {
    return { ok: false };
  }
}

function isWellFormedPackage(x: unknown): x is ExportPackage {
  if (typeof x !== 'object' || x === null) return false;
  const p = x as Record<string, unknown>;
  if (p.version !== EXPORT_PACKAGE_VERSION) return false;
  if (typeof p.user_id !== 'string') return false;
  if (typeof p.issued_at !== 'string') return false;
  if (typeof p.expires_at !== 'string') return false;
  if (typeof p.payload !== 'string') return false;
  if (typeof p.manifest_hash !== 'string') return false;
  if (typeof p.signature !== 'string') return false;
  const enc = p.encryption as Record<string, unknown> | undefined;
  if (!enc || typeof enc !== 'object') return false;
  if (typeof enc.kdf !== 'string' || typeof enc.cipher !== 'string') return false;
  if (typeof enc.nonce !== 'string') return false;
  const kp = enc.kdf_params as Record<string, unknown> | undefined;
  if (!kp || typeof kp !== 'object') return false;
  if (typeof kp.memory !== 'number' || typeof kp.iterations !== 'number') return false;
  if (typeof kp.parallelism !== 'number' || typeof kp.salt !== 'string') return false;
  return true;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'malformed_json' },
      { status: 400 }
    );
  }

  const bodyObj = body as { package?: unknown; password?: unknown } | null;
  if (!bodyObj || typeof bodyObj !== 'object') {
    return NextResponse.json({ ok: false, error: 'body_required' }, { status: 400 });
  }
  const { package: pkg, password } = bodyObj;

  if (!isWellFormedPackage(pkg)) {
    return NextResponse.json(
      { ok: false, error: 'package_malformed' },
      { status: 400 }
    );
  }
  if (typeof password !== 'string' || password.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'password_required' },
      { status: 400 }
    );
  }

  const manifestOk = verifyManifestHashLocal(pkg);
  // Only attempt decrypt if manifest hash is valid — otherwise the KDF params
  // may have been tampered with and decrypt becomes pointless.
  let decryptOk = false;
  if (manifestOk) {
    const d = decryptPayloadLocal(pkg, password);
    decryptOk = d.ok;
  }

  return NextResponse.json({
    ok: true,
    manifest_hash_ok: manifestOk,
    decrypt_ok: decryptOk,
    user_id: pkg.user_id,
    issued_at: pkg.issued_at,
  });
}
