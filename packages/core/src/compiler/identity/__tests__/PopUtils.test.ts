/**
 * Tests for PopUtils — pure helpers for HTTP Message Signature construction,
 * parsing, and request-component extraction (RFC 9421-style PoP).
 *
 * Previously untested (zero references in repo). These helpers feed the PoP
 * middleware's signature-base reconstruction, so parsing fidelity (especially
 * the buildSignatureParams ↔ parseSignatureParams round-trip) is a
 * correctness boundary for proof-of-possession verification.
 */

import { describe, it, expect } from 'vitest';
import {
  serializeComponent,
  validateComponents,
  extractComponentsFromRequest,
  buildSignatureParams,
  parseSignatureParams,
  normalizeHeaderName,
  extractNonce,
  hasSignatureHeaders,
  formatSignatureError,
} from '../PopUtils';
import type { SignatureComponents, SignatureMetadata } from '../AgentPoP';

const META: SignatureMetadata = {
  keyid: 'agent:code_generator#2026-02-27T00:00:00.000Z',
  alg: 'ed25519',
  created: 1735257600,
  nonce: 'abc123',
};

describe('PopUtils', () => {
  describe('serializeComponent', () => {
    it('serializes @-prefixed components as bare values', () => {
      expect(serializeComponent('@method', 'POST')).toBe('POST');
      expect(serializeComponent('@request-timestamp', 1735257600)).toBe('1735257600');
    });

    it('serializes regular headers as strings', () => {
      expect(serializeComponent('content-type', 'application/json')).toBe('application/json');
    });
  });

  describe('validateComponents', () => {
    it('accepts a fully-populated component set', () => {
      const components: SignatureComponents = {
        '@method': 'POST',
        '@target-uri': '/api/compile',
        '@request-timestamp': 1735257600,
        '@nonce': 'abc123',
      };
      expect(validateComponents(components)).toEqual({ valid: true });
    });

    it('reports each missing required field', () => {
      const components = {
        '@method': 'POST',
        '@target-uri': '/api/compile',
      } as unknown as SignatureComponents;
      const result = validateComponents(components);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('@request-timestamp');
      expect(result.missing).toContain('@nonce');
    });
  });

  describe('extractComponentsFromRequest', () => {
    it('uppercases the method and copies the url', () => {
      const components = extractComponentsFromRequest({
        method: 'post',
        url: '/api/compile',
        headers: {},
      });
      expect(components['@method']).toBe('POST');
      expect(components['@target-uri']).toBe('/api/compile');
    });

    it('captures authorization, content-type, and content-digest when present', () => {
      const components = extractComponentsFromRequest({
        method: 'POST',
        url: '/api/data',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
          'content-digest': 'sha-256=:abc:',
        },
      });
      expect(components.authorization).toBe('Bearer token');
      expect(components['content-type']).toBe('application/json');
      expect(components['content-digest']).toBe('sha-256=:abc:');
    });

    it('omits optional headers that are absent', () => {
      const components = extractComponentsFromRequest({
        method: 'GET',
        url: '/health',
        headers: {},
      });
      expect(components.authorization).toBeUndefined();
      expect(components['content-type']).toBeUndefined();
    });
  });

  describe('buildSignatureParams / parseSignatureParams', () => {
    it('round-trips component ids and metadata', () => {
      const componentIds = ['@method', '@target-uri', '@request-timestamp', '@nonce'];
      const params = buildSignatureParams(componentIds, META);

      const parsed = parseSignatureParams(params);
      expect(parsed).not.toBeNull();
      expect(parsed!.components).toEqual(componentIds);
      expect(parsed!.metadata.created).toBe(META.created);
      expect(parsed!.metadata.keyid).toBe(META.keyid);
      expect(parsed!.metadata.alg).toBe('ed25519');
      expect(parsed!.metadata.nonce).toBe(META.nonce);
    });

    it('returns null for a malformed params string', () => {
      expect(parseSignatureParams('not-a-valid-params-string')).toBeNull();
    });
  });

  describe('normalizeHeaderName', () => {
    it('lowercases header names', () => {
      expect(normalizeHeaderName('Content-Type')).toBe('content-type');
      expect(normalizeHeaderName('AUTHORIZATION')).toBe('authorization');
    });
  });

  describe('extractNonce', () => {
    it('pulls the nonce out of a signature-input header', () => {
      expect(extractNonce({ 'signature-input': 'sig1=("@method");created=1;nonce="xyz789"' })).toBe(
        'xyz789'
      );
    });

    it('returns null when no signature-input header is present', () => {
      expect(extractNonce({})).toBeNull();
    });

    it('returns null when the header has no nonce', () => {
      expect(extractNonce({ 'signature-input': 'sig1=("@method");created=1' })).toBeNull();
    });
  });

  describe('hasSignatureHeaders', () => {
    it('is true only when both signature and signature-input are present', () => {
      expect(
        hasSignatureHeaders({ signature: 'sig1=:abc:', 'signature-input': 'sig1=(...)' })
      ).toBe(true);
      expect(hasSignatureHeaders({ signature: 'sig1=:abc:' })).toBe(false);
      expect(hasSignatureHeaders({ 'signature-input': 'sig1=(...)' })).toBe(false);
      expect(hasSignatureHeaders({})).toBe(false);
    });

    it('accepts capitalized header variants', () => {
      expect(
        hasSignatureHeaders({ Signature: 'sig1=:abc:', 'Signature-Input': 'sig1=(...)' })
      ).toBe(true);
    });
  });

  describe('formatSignatureError', () => {
    it('returns a structured error envelope', () => {
      const err = formatSignatureError('REPLAY_ATTACK', 'nonce already seen');
      expect(err.code).toBe('REPLAY_ATTACK');
      expect(err.message).toBe('nonce already seen');
      expect(err.error).toBe('Signature Verification Failed');
      expect(typeof err.timestamp).toBe('string');
    });
  });
});
