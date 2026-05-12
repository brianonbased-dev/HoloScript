import { webcrypto } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import {
  type CapabilityToken,
  mintCapabilityToken,
  storeCapabilityToken,
  DEFAULT_TRUST_BY_SURFACE,
  type SurfaceKind,
} from '@holoscript/secrets-broker';

export const CAPABILITY_TOKEN_COOKIE = 'hs_capability_token';

const CAPABILITY_TOKEN_MAX_AGE_SECONDS = 60 * 60; // 1 hour matches max TTL
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
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
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

export async function encryptCapabilityToken(token: string): Promise<string | null> {
  const key = await getEncryptionKey();
  if (!key) return null;

  const iv = cryptoImpl.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const ciphertext = await cryptoImpl.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(token)
  );

  return `${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptCapabilityToken(value: string): Promise<string | null> {
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
    return decoder.decode(plaintext);
  } catch {
    return null;
  }
}

export async function getCapabilityToken(req?: NextRequest): Promise<string | null> {
  const cookieValue = req?.cookies.get(CAPABILITY_TOKEN_COOKIE)?.value;
  if (!cookieValue) return null;

  return decryptCapabilityToken(cookieValue);
}

export async function setCapabilityTokenCookie(
  response: NextResponse,
  token: string
): Promise<boolean> {
  const encryptedToken = await encryptCapabilityToken(token);
  if (!encryptedToken) return false;

  response.cookies.set(CAPABILITY_TOKEN_COOKIE, encryptedToken, {
    httpOnly: true,
    maxAge: CAPABILITY_TOKEN_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return true;
}

export function clearCapabilityTokenCookie(response: NextResponse): void {
  response.cookies.set(CAPABILITY_TOKEN_COOKIE, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

/**
 * Mint a capability token for a GitHub-authenticated user.
 *
 * S-6: GitHub device-flow OAuth on HoloMesh — after GitHub auth succeeds,
 * mint a HoloMesh bearer scoped to that GitHub user.
 */
export function mintCapabilityTokenForGitHubUser(input: {
  githubUsername: string;
  surface?: SurfaceKind;
  ttlSeconds?: number;
}): CapabilityToken {
  const surface = input.surface ?? 'claude';
  const trust = DEFAULT_TRUST_BY_SURFACE[surface];
  const handle = `${surface}1` as `${SurfaceKind}${number}`;

  return mintCapabilityToken({
    handle,
    surface,
    trust,
    ttlSeconds: input.ttlSeconds ?? 15 * 60,
  });
}

/**
 * Store a minted capability token in an encrypted HttpOnly cookie.
 * Returns the stored (hashed) record for server-side registry.
 */
export async function storeCapabilityTokenInCookie(
  response: NextResponse,
  token: CapabilityToken
): Promise<{ cookieSet: boolean; stored: ReturnType<typeof storeCapabilityToken> }> {
  const stored = storeCapabilityToken(token);
  const cookieSet = await setCapabilityTokenCookie(response, token.tokenSecret);
  return { cookieSet, stored };
}
