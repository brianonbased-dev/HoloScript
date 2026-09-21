import { webcrypto } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';

export const GITHUB_DEVICE_TOKEN_COOKIE = 'hs_github_device_token';

const GITHUB_DEVICE_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const AES_GCM_IV_BYTES = 12;

const cryptoImpl = globalThis.crypto ?? webcrypto;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getTokenSecret(): string | undefined {
  return process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim() || undefined;
}

function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function decodeBase64Url(value: string): ArrayBuffer {
  const buffer = Buffer.from(value, 'base64url');
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
}

async function getEncryptionKey(): Promise<CryptoKey | null> {
  const secret = getTokenSecret();
  if (!secret) return null;

  const digest = await cryptoImpl.subtle.digest('SHA-256', encoder.encode(secret));
  return cryptoImpl.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * What the cookie holds: the GitHub credential, and the Studio user who linked
 * it.
 *
 * WHY THE USER ID IS IN HERE. This is a BROWSER credential — 30 days, path '/',
 * HttpOnly, and until now it carried nothing that said whose it was. It
 * outlives the session that obtained it, so the next person to sign in on the
 * same browser inherited the previous person's GitHub token. That was
 * survivable while the token only stood for a capability ("read this repo").
 * It is not survivable now that provisioning asks GitHub *who this credential
 * belongs to* and mints a founder-tier key for the answer: an unbound cookie
 * would let the browser, rather than the sign-in, decide who the founder is.
 *
 * `userId: null` means a cookie minted BEFORE this binding existed. Such a
 * cookie is not forged — it is unattributable, which is a different thing and
 * is handled separately in {@link getGitHubDeviceToken}.
 */
export interface GitHubDeviceTokenRecord {
  token: string;
  userId: string | null;
}

const BOUND_PAYLOAD_VERSION = 1;

interface BoundDevicePayload {
  v: number;
  /** The GitHub credential. */
  t: string;
  /** The Studio user id this credential was linked by. */
  u: string;
}

function isBoundDevicePayload(value: unknown): value is BoundDevicePayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.v === BOUND_PAYLOAD_VERSION &&
    typeof payload.t === 'string' &&
    payload.t.length > 0 &&
    typeof payload.u === 'string' &&
    payload.u.length > 0
  );
}

function encodeDevicePlaintext(token: string, userId?: string | null): string {
  const owner = typeof userId === 'string' ? userId.trim() : '';
  if (!owner) return token;
  const payload: BoundDevicePayload = { v: BOUND_PAYLOAD_VERSION, t: token, u: owner };
  return JSON.stringify(payload);
}

/**
 * A legacy cookie holds the raw token, which is not JSON. So anything that does
 * not parse as a binding IS the token: reading it that way is what keeps
 * already-linked browsers working instead of unlinking everyone at deploy.
 */
function decodeDevicePlaintext(plaintext: string): GitHubDeviceTokenRecord {
  try {
    const parsed: unknown = JSON.parse(plaintext);
    if (isBoundDevicePayload(parsed)) return { token: parsed.t, userId: parsed.u };
  } catch {
    // Not JSON — a cookie minted before the binding existed.
  }
  return { token: plaintext, userId: null };
}

export async function encryptGitHubDeviceToken(
  token: string,
  userId?: string | null
): Promise<string | null> {
  const key = await getEncryptionKey();
  if (!key) return null;

  const iv = cryptoImpl.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const ciphertext = await cryptoImpl.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(encodeDevicePlaintext(token, userId))
  );

  return `${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptGitHubDeviceTokenRecord(
  value: string
): Promise<GitHubDeviceTokenRecord | null> {
  const [ivValue, ciphertextValue] = value.split('.');
  if (!ivValue || !ciphertextValue) return null;

  const key = await getEncryptionKey();
  if (!key) return null;

  try {
    const plaintext = await cryptoImpl.subtle.decrypt(
      { name: 'AES-GCM', iv: decodeBase64Url(ivValue) },
      key,
      decodeBase64Url(ciphertextValue)
    );
    return decodeDevicePlaintext(decoder.decode(plaintext));
  } catch {
    return null;
  }
}

export async function decryptGitHubDeviceToken(value: string): Promise<string | null> {
  const record = await decryptGitHubDeviceTokenRecord(value);
  return record?.token ?? null;
}

export interface GitHubDeviceTokenReadOptions {
  /** The Studio user this request is acting as, taken from the verified session. */
  userId?: string | null;
  /**
   * Accept a cookie minted before binding existed, which names no owner.
   *
   * Default FALSE, for the same reason `/api` now defaults to closed: a
   * credential nobody can attribute is refused unless a caller states, with a
   * reason, that being unattributable is acceptable there. It is acceptable
   * where the token is only a capability, and never where it answers "who is
   * this caller" — which is exactly the `userOnly` distinction the GitHub
   * helper already draws.
   */
  allowUnbound?: boolean;
}

export async function getGitHubDeviceToken(
  req?: NextRequest,
  options: GitHubDeviceTokenReadOptions = {}
): Promise<string | null> {
  const cookieValue = req?.cookies.get(GITHUB_DEVICE_TOKEN_COOKIE)?.value;
  if (!cookieValue) return null;

  const record = await decryptGitHubDeviceTokenRecord(cookieValue);
  if (!record) return null;

  if (record.userId === null) {
    return options.allowUnbound === true ? record.token : null;
  }

  const caller = typeof options.userId === 'string' ? options.userId.trim() : '';
  return caller.length > 0 && caller === record.userId ? record.token : null;
}

export async function setGitHubDeviceTokenCookie(
  response: NextResponse,
  token: string,
  /** The verified session this credential is being linked by. Required: an
   * unowned cookie is what this binding exists to stop being minted. */
  userId: string
): Promise<boolean> {
  if (typeof userId !== 'string' || userId.trim().length === 0) return false;

  const encryptedToken = await encryptGitHubDeviceToken(token, userId);
  if (!encryptedToken) return false;

  response.cookies.set(GITHUB_DEVICE_TOKEN_COOKIE, encryptedToken, {
    httpOnly: true,
    maxAge: GITHUB_DEVICE_TOKEN_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return true;
}

export function clearGitHubDeviceTokenCookie(response: NextResponse): void {
  response.cookies.set(GITHUB_DEVICE_TOKEN_COOKIE, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}
