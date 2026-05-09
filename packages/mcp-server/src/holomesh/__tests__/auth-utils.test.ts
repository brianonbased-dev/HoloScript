/**
 * Tests for auth-utils — signed manifest fallback (replaces deprecated env-key fallback).
 *
 * task_1778299058189_f8ur
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as crypto from 'crypto';
import type http from 'http';
import { resolveRequestingAgent } from '../auth-utils';

// Mock process.env
const originalEnv = { ...process.env };

function mockReq(headers: Record<string, string>): http.IncomingMessage {
  return {
    headers,
  } as unknown as http.IncomingMessage;
}

function createSignedManifest(
  manifest: Record<string, unknown>,
  keyPair: { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject }
): { manifestB64: string; signatureB64: string } {
  const payload = JSON.stringify(manifest);
  const signature = crypto.sign(null, Buffer.from(payload), keyPair.privateKey);
  return {
    manifestB64: Buffer.from(JSON.stringify(manifest)).toString('base64'),
    signatureB64: signature.toString('base64'),
  };
}

describe('resolveRequestingAgent', () => {
  let keyPair: { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject };
  let publicKeyB64: string;

  beforeEach(() => {
    keyPair = crypto.generateKeyPairSync('ed25519');
    const publicKeyDer = keyPair.publicKey.export({ type: 'spki', format: 'der' });
    publicKeyB64 = publicKeyDer.toString('base64');
    process.env.HOLOSCRIPT_PLATFORM_PUBLIC_KEY = publicKeyB64;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('resolves anonymous when no auth headers present', () => {
    const req = mockReq({});
    const caller = resolveRequestingAgent(req);
    expect(caller.authenticated).toBe(false);
    expect(caller.id).toBe('anonymous');
  });

  it('resolves agent from signed manifest when platform key is configured', () => {
    const manifest = {
      id: 'hololand-agent-1',
      name: 'HoloLand Agent',
      walletAddress: '0xABCDef1234567890abcdef1234567890ABCDef12',
      capabilities: ['render', 'spatial'],
    };
    const { manifestB64, signatureB64 } = createSignedManifest(manifest, keyPair);
    const req = mockReq({
      'x-agent-manifest': manifestB64,
      'x-agent-manifest-sig': signatureB64,
    });

    const caller = resolveRequestingAgent(req);
    expect(caller.authenticated).toBe(true);
    expect(caller.id).toBe('hololand-agent-1');
    expect(caller.name).toBe('HoloLand Agent');
    expect(caller.wallet).toBe('0xABCDef1234567890abcdef1234567890ABCDef12');
    expect(caller.isFounder).toBe(false);
    expect(caller.agent?.traits).toEqual(['render', 'spatial']);
  });

  it('rejects tampered manifest (signature mismatch)', () => {
    const manifest = {
      id: 'hololand-agent-1',
      name: 'HoloLand Agent',
      walletAddress: '0xABCDef1234567890abcdef1234567890ABCDef12',
    };
    const { manifestB64 } = createSignedManifest(manifest, keyPair);
    const req = mockReq({
      'x-agent-manifest': manifestB64,
      'x-agent-manifest-sig': 'aW52YWxpZHNpZw==', // invalid sig
    });

    const caller = resolveRequestingAgent(req);
    expect(caller.authenticated).toBe(false);
    expect(caller.id).toBe('anonymous');
  });

  it('rejects manifest when platform public key is not configured', () => {
    delete process.env.HOLOSCRIPT_PLATFORM_PUBLIC_KEY;
    const manifest = {
      id: 'hololand-agent-1',
      name: 'HoloLand Agent',
      walletAddress: '0xABCDef1234567890abcdef1234567890ABCDef12',
    };
    const { manifestB64, signatureB64 } = createSignedManifest(manifest, keyPair);
    const req = mockReq({
      'x-agent-manifest': manifestB64,
      'x-agent-manifest-sig': signatureB64,
    });

    const caller = resolveRequestingAgent(req);
    expect(caller.authenticated).toBe(false);
  });

  it('rejects manifest with missing required fields', () => {
    const manifest = { id: 'only-id' };
    const { manifestB64, signatureB64 } = createSignedManifest(manifest as any, keyPair);
    const req = mockReq({
      'x-agent-manifest': manifestB64,
      'x-agent-manifest-sig': signatureB64,
    });

    const caller = resolveRequestingAgent(req);
    expect(caller.authenticated).toBe(false);
  });
});
