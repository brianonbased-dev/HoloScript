/**
 * Tests for auth-utils — signed manifest fallback (replaces deprecated env-key fallback).
 *
 * task_1778299058189_f8ur
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as crypto from 'crypto';
import type http from 'http';
import { hasBearerCapability, resolveRequestingAgent } from '../auth-utils';
import type { RegisteredAgent } from '../types';

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
    expect(caller.agent?.authSource).toBe('signed-manifest');
    expect(caller.agent?.capabilities).toEqual([]);
    expect(hasBearerCapability(caller.agent!, 'read')).toBe(false);
    expect(hasBearerCapability(caller.agent!, 'sign')).toBe(false);
  });

  it('copies signed-manifest bearer capabilities and fail-closes omitted grants', () => {
    const readOnly = {
      id: 'hololand-readonly',
      name: 'Read Only',
      walletAddress: '0xABCDef1234567890abcdef1234567890ABCDef12',
      capabilities: ['read'],
    };
    const omitted = {
      id: 'hololand-omitted',
      name: 'Omitted Caps',
      walletAddress: '0xABCDef1234567890abcdef1234567890ABCDef12',
    };
    const empty = {
      id: 'hololand-empty',
      name: 'Empty Caps',
      walletAddress: '0xABCDef1234567890abcdef1234567890ABCDef12',
      capabilities: [],
    };

    const readSigned = createSignedManifest(readOnly, keyPair);
    const omittedSigned = createSignedManifest(omitted, keyPair);
    const emptySigned = createSignedManifest(empty, keyPair);

    const readOnlyCaller = resolveRequestingAgent(
      mockReq({
        'x-agent-manifest': readSigned.manifestB64,
        'x-agent-manifest-sig': readSigned.signatureB64,
      })
    );
    const omittedCaller = resolveRequestingAgent(
      mockReq({
        'x-agent-manifest': omittedSigned.manifestB64,
        'x-agent-manifest-sig': omittedSigned.signatureB64,
      })
    );
    const emptyCaller = resolveRequestingAgent(
      mockReq({
        'x-agent-manifest': emptySigned.manifestB64,
        'x-agent-manifest-sig': emptySigned.signatureB64,
      })
    );

    expect(readOnlyCaller.authenticated).toBe(true);
    expect(readOnlyCaller.agent?.capabilities).toEqual(['read']);
    expect(hasBearerCapability(readOnlyCaller.agent!, 'read')).toBe(true);
    expect(hasBearerCapability(readOnlyCaller.agent!, 'sign')).toBe(false);
    expect(hasBearerCapability(readOnlyCaller.agent!, 'claim')).toBe(false);
    expect(hasBearerCapability(readOnlyCaller.agent!, 'message')).toBe(false);

    expect(omittedCaller.authenticated).toBe(true);
    expect(omittedCaller.agent?.capabilities).toEqual([]);
    expect(hasBearerCapability(omittedCaller.agent!, 'read')).toBe(false);
    expect(hasBearerCapability(omittedCaller.agent!, 'sign')).toBe(false);

    expect(emptyCaller.authenticated).toBe(true);
    expect(emptyCaller.agent?.capabilities).toEqual([]);
    expect(hasBearerCapability(emptyCaller.agent!, 'sign')).toBe(false);
  });

  it('keeps legacy unrestricted behavior when capabilities are missing', () => {
    const legacy: RegisteredAgent = {
      id: 'legacy-agent',
      apiKey: 'legacy-key',
      name: 'Legacy',
      traits: [],
      reputation: 0,
      createdAt: new Date().toISOString(),
    };
    expect(hasBearerCapability(legacy, 'sign')).toBe(true);
    expect(hasBearerCapability(legacy, 'claim')).toBe(true);
    expect(hasBearerCapability({ ...legacy, capabilities: [] }, 'sign')).toBe(true);
    expect(
      hasBearerCapability({ ...legacy, capabilities: ['read', 'message'] }, 'claim')
    ).toBe(false);
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
