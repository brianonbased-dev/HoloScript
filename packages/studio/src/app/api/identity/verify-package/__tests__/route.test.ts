import { describe, it, expect } from 'vitest';
import { POST } from '../route';
import * as crypto from 'node:crypto';

/**
 * Tests for the /api/identity/verify-package proxy route. Builds a
 * real export package with node:crypto, then POSTs it back to the route
 * with valid + invalid passwords and asserts the verification result.
 *
 * Keeps the algorithm parameters in lockstep with
 * packages/mcp-server/src/holomesh/export-package.ts — if those change,
 * this test should catch the breakage.
 */

const SCRYPT_N = 131072; // 2^17
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function buildPackage(user_id: string, recovery: Buffer, password: string) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const nonce = crypto.randomBytes(NONCE_BYTES);

  const key = crypto.scryptSync(password, salt, 32, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 256 * SCRYPT_N * SCRYPT_R,
  });

  const cipher = crypto.createCipheriv('chacha20-poly1305', key, nonce, {
    authTagLength: AUTH_TAG_BYTES,
  });
  const ciphertext = Buffer.concat([cipher.update(recovery), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([ciphertext, authTag]).toString('base64');

  const partial = {
    version: 'v3.0' as const,
    user_id,
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400_000).toISOString(),
    encryption: {
      kdf: 'scrypt' as const,
      kdf_params: {
        memory: SCRYPT_N,
        iterations: SCRYPT_R,
        parallelism: SCRYPT_P,
        salt: salt.toString('base64'),
      },
      cipher: 'chacha20-poly1305' as const,
      nonce: nonce.toString('base64'),
    },
    payload,
    manifest_hash: '',
    signature: 'ZmFrZXNpZw==', // sig not checked by this route
  };
  const canonical = JSON.stringify({
    version: partial.version,
    user_id: partial.user_id,
    issued_at: partial.issued_at,
    expires_at: partial.expires_at,
    encryption: {
      kdf: partial.encryption.kdf,
      kdf_params: {
        memory: partial.encryption.kdf_params.memory,
        iterations: partial.encryption.kdf_params.iterations,
        parallelism: partial.encryption.kdf_params.parallelism,
        salt: partial.encryption.kdf_params.salt,
      },
      cipher: partial.encryption.cipher,
      nonce: partial.encryption.nonce,
    },
  });
  const manifestHex = crypto.createHash('sha256').update(canonical).digest('hex');
  partial.manifest_hash = `sha256:${manifestHex}`;
  return partial;
}

async function call(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const req = new Request('http://localhost/api/identity/verify-package', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req as unknown as import('next/server').NextRequest);
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

describe('/api/identity/verify-package', () => {
  it('returns ok=true with both checks passing for a well-formed package + correct password', async () => {
    const pw = 'correct-horse-battery-staple';
    const pkg = buildPackage('user_abc', Buffer.from('secret-recovery-bytes'), pw);
    const { status, json } = await call({ package: pkg, password: pw });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.manifest_hash_ok).toBe(true);
    expect(json.decrypt_ok).toBe(true);
    expect(json.user_id).toBe('user_abc');
  });

  it('returns decrypt_ok=false when the password is wrong', async () => {
    const pw = 'correct-horse-battery-staple';
    const pkg = buildPackage('user_abc', Buffer.from('secret-recovery-bytes'), pw);
    const { status, json } = await call({ package: pkg, password: 'wrong' });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.manifest_hash_ok).toBe(true);
    expect(json.decrypt_ok).toBe(false);
  });

  it('returns manifest_hash_ok=false when a covered field is tampered', async () => {
    const pw = 'correct-horse-battery-staple';
    const pkg = buildPackage('user_abc', Buffer.from('secret'), pw);
    pkg.user_id = 'user_xyz'; // tamper covered field
    const { status, json } = await call({ package: pkg, password: pw });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.manifest_hash_ok).toBe(false);
    // decrypt_ok may be false (and is) because we short-circuit on bad manifest.
    expect(json.decrypt_ok).toBe(false);
  });

  it('rejects malformed package with 400', async () => {
    const { status, json } = await call({ package: { bogus: true }, password: 'x' });
    expect(status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toBe('package_malformed');
  });

  it('rejects missing password with 400', async () => {
    const pkg = buildPackage('user_a', Buffer.from('s'), 'pw');
    const { status, json } = await call({ package: pkg, password: '' });
    expect(status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toBe('password_required');
  });

  it('rejects missing body with 400', async () => {
    const req = new Request('http://localhost/api/identity/verify-package', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('malformed_json');
  });
});
