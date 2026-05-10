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

export async function encryptGitHubDeviceToken(token: string): Promise<string | null> {
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

export async function decryptGitHubDeviceToken(value: string): Promise<string | null> {
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

export async function getGitHubDeviceToken(req?: NextRequest): Promise<string | null> {
  const cookieValue = req?.cookies.get(GITHUB_DEVICE_TOKEN_COOKIE)?.value;
  if (!cookieValue) return null;

  return decryptGitHubDeviceToken(cookieValue);
}

export async function setGitHubDeviceTokenCookie(
  response: NextResponse,
  token: string
): Promise<boolean> {
  const encryptedToken = await encryptGitHubDeviceToken(token);
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
