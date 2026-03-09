/**
 * HoloScript Agent Proof-of-Possession (PoP)
 *
 * Implements RFC 9440 HTTP Message Signatures for agent request signing.
 *
 * Features:
 * - Ed25519 signature generation for HTTP requests
 * - Signature base construction per RFC 9440
 * - Public key derivation from private key
 * - Token replay attack prevention
 * - Nonce-based freshness guarantee
 *
 * @see https://datatracker.ietf.org/doc/html/rfc9440
 * @version 1.0.0
 */

import * as crypto from 'crypto';
import { AgentKeyPair } from './AgentIdentity';

/**
 * HTTP request signature components
 */
export interface SignatureComponents {
  /** HTTP method (e.g., GET, POST) */
  '@method': string;

  /** Target URI (e.g., /api/compile) */
  '@target-uri': string;

  /** Request timestamp (Unix seconds) */
  '@request-timestamp': number;

  /** Nonce for replay prevention */
  '@nonce': string;

  /** Authorization header (JWT token) */
  authorization?: string;

  /** Content-Type header */
  'content-type'?: string;

  /** Content-Digest header (SHA-256 of body) */
  'content-digest'?: string;
}

/**
 * Signature metadata
 */
export interface SignatureMetadata {
  /** Key ID from agent key pair */
  keyid: string;

  /** Signature algorithm (always 'ed25519') */
  alg: 'ed25519';

  /** Created timestamp (Unix seconds) */
  created: number;

  /** Nonce for replay prevention */
  nonce: string;
}

/**
 * HTTP Message Signature
 */
export interface HTTPSignature {
  /** Signature base64url-encoded */
  signature: string;

  /** Signature metadata */
  metadata: SignatureMetadata;

  /** Component identifiers used in signature */
  components: string[];
}

/**
 * Signature verification result
 */
export interface SignatureVerificationResult {
  valid: boolean;
  error?: string;
  errorCode?: 'EXPIRED' | 'INVALID_SIGNATURE' | 'REPLAY_ATTACK' | 'MISSING_COMPONENTS';
}

/**
 * Maximum allowed clock skew (5 minutes)
 */
const MAX_CLOCK_SKEW_SECONDS = 300;

/**
 * Maximum request age (10 minutes)
 */
const MAX_REQUEST_AGE_SECONDS = 600;

/**
 * Nonce cache for replay prevention (in-memory, replace with Redis in production)
 */
const nonceCache = new Map<string, number>();

/**
 * Clean expired nonces every 5 minutes
 */
setInterval(
  () => {
    const now = Math.floor(Date.now() / 1000);
    const entries = Array.from(nonceCache.entries());
    for (const [nonce, timestamp] of entries) {
      if (now - timestamp > MAX_REQUEST_AGE_SECONDS) {
        nonceCache.delete(nonce);
      }
    }
  },
  5 * 60 * 1000
);

/**
 * Generate nonce for request signature
 *
 * Creates a cryptographically secure random nonce for replay prevention.
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64url');
}

/**
 * Calculate content digest (SHA-256 of request body)
 *
 * Per RFC 9530 Digest Fields specification.
 */
export function calculateContentDigest(body: string | Buffer): string {
  const hash = crypto.createHash('sha256');
  hash.update(body);
  return `sha-256=:${hash.digest('base64')}:`;
}

/**
 * Construct canonical signature base
 *
 * Per RFC 9440 Section 2.5:
 * "@method": POST
 * "@target-uri": /api/compile
 * "@request-timestamp": 1735257600
 * "@nonce": abc123xyz
 * "authorization": Bearer eyJhbGc...
 * "content-type": application/json
 * "content-digest": sha-256=:X48E9qOokqqrvdts8nOJRJN3OWDUoyWxBf7kbu9DBPE=:
 * "@signature-params": ("@method" "@target-uri" "@request-timestamp" "@nonce" "authorization" "content-type" "content-digest");created=1735257600;keyid="agent:code_generator#2026-02-27T00:00:00.000Z";alg="ed25519";nonce="abc123xyz"
 */
export function constructSignatureBase(
  components: SignatureComponents,
  metadata: SignatureMetadata
): string {
  const lines: string[] = [];

  // Serialize component identifiers in order
  const componentIds: string[] = [];

  // Special components (prefixed with @)
  if (components['@method']) {
    lines.push(`"@method": ${components['@method']}`);
    componentIds.push('"@method"');
  }

  if (components['@target-uri']) {
    lines.push(`"@target-uri": ${components['@target-uri']}`);
    componentIds.push('"@target-uri"');
  }

  if (components['@request-timestamp']) {
    lines.push(`"@request-timestamp": ${components['@request-timestamp']}`);
    componentIds.push('"@request-timestamp"');
  }

  if (components['@nonce']) {
    lines.push(`"@nonce": ${components['@nonce']}`);
    componentIds.push('"@nonce"');
  }

  // Regular headers (lowercase)
  if (components.authorization) {
    lines.push(`"authorization": ${components.authorization}`);
    componentIds.push('"authorization"');
  }

  if (components['content-type']) {
    lines.push(`"content-type": ${components['content-type']}`);
    componentIds.push('"content-type"');
  }

  if (components['content-digest']) {
    lines.push(`"content-digest": ${components['content-digest']}`);
    componentIds.push('"content-digest"');
  }

  // Signature parameters line
  const params = [
    `(${componentIds.join(' ')})`,
    `created=${metadata.created}`,
    `keyid="${metadata.keyid}"`,
    `alg="${metadata.alg}"`,
    `nonce="${metadata.nonce}"`,
  ].join(';');

  lines.push(`"@signature-params": ${params}`);

  return lines.join('\n');
}

/**
 * Sign HTTP request using Ed25519
 *
 * Creates signature over canonical signature base.
 */
export function signRequest(
  components: SignatureComponents,
  keyPair: AgentKeyPair,
  nonce?: string
): HTTPSignature {
  const now = Math.floor(Date.now() / 1000);
  const requestNonce = nonce || generateNonce();

  const metadata: SignatureMetadata = {
    keyid: keyPair.kid,
    alg: 'ed25519',
    created: now,
    nonce: requestNonce,
  };

  // Add nonce and timestamp to components
  const enrichedComponents: SignatureComponents = {
    ...components,
    '@request-timestamp': now,
    '@nonce': requestNonce,
  };

  // Construct signature base
  const signatureBase = constructSignatureBase(enrichedComponents, metadata);

  // Parse private key from PEM
  const privateKey = crypto.createPrivateKey(keyPair.privateKey);

  // Sign using Ed25519
  const signature = crypto.sign(null, Buffer.from(signatureBase, 'utf8'), privateKey);

  // Store nonce for replay prevention
  nonceCache.set(requestNonce, now);

  return {
    signature: signature.toString('base64url'),
    metadata,
    components: Object.keys(enrichedComponents).filter(
      (k) => enrichedComponents[k as keyof SignatureComponents] !== undefined
    ),
  };
}

/**
 * Verify HTTP request signature
 *
 * Validates signature authenticity and freshness.
 */
export function verifySignature(
  signatureBase: string,
  signatureB64: string,
  publicKey: string,
  metadata: SignatureMetadata
): SignatureVerificationResult {
  const now = Math.floor(Date.now() / 1000);

  // Check timestamp freshness (prevent replay of old requests)
  const age = now - metadata.created;
  if (age > MAX_REQUEST_AGE_SECONDS) {
    return {
      valid: false,
      error: `Request too old: ${age} seconds (max ${MAX_REQUEST_AGE_SECONDS})`,
      errorCode: 'EXPIRED',
    };
  }

  // Allow some clock skew
  if (metadata.created > now + MAX_CLOCK_SKEW_SECONDS) {
    return {
      valid: false,
      error: `Request timestamp in future: ${metadata.created} > ${now}`,
      errorCode: 'EXPIRED',
    };
  }

  // Check nonce for replay attack
  if (nonceCache.has(metadata.nonce)) {
    const cachedTimestamp = nonceCache.get(metadata.nonce)!;
    if (now - cachedTimestamp < MAX_REQUEST_AGE_SECONDS) {
      return {
        valid: false,
        error: `Nonce already used: ${metadata.nonce}`,
        errorCode: 'REPLAY_ATTACK',
      };
    }
  }

  try {
    // Parse public key from PEM
    const pubKey = crypto.createPublicKey(publicKey);

    // Verify signature
    const signatureBuffer = Buffer.from(signatureB64, 'base64url');
    const isValid = crypto.verify(
      null,
      Buffer.from(signatureBase, 'utf8'),
      pubKey,
      signatureBuffer
    );

    if (!isValid) {
      return {
        valid: false,
        error: 'Invalid signature',
        errorCode: 'INVALID_SIGNATURE',
      };
    }

    // Store nonce to prevent replay
    nonceCache.set(metadata.nonce, metadata.created);

    return { valid: true };
  } catch (error: any) {
    return {
      valid: false,
      error: `Signature verification failed: ${error.message}`,
      errorCode: 'INVALID_SIGNATURE',
    };
  }
}

/**
 * Extract public key from private key (for testing/debugging)
 *
 * In production, public key should come from JWT token claims.
 */
export function derivePublicKey(privateKeyPem: string): string {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const publicKey = crypto.createPublicKey(privateKey);
  return publicKey.export({ type: 'spki', format: 'pem' }) as string;
}

/**
 * Format signature for HTTP headers
 *
 * Returns:
 * - `Signature-Input`: sig1=("@method" "@target-uri"...);created=1735257600;...
 * - `Signature`: sig1=:base64url-signature:
 */
export function formatSignatureHeaders(httpSignature: HTTPSignature): {
  'Signature-Input': string;
  Signature: string;
} {
  const { signature, metadata, components } = httpSignature;

  // Signature-Input header
  const componentList = components.map((c) => `"${c}"`).join(' ');
  const params = [
    `(${componentList})`,
    `created=${metadata.created}`,
    `keyid="${metadata.keyid}"`,
    `alg="${metadata.alg}"`,
    `nonce="${metadata.nonce}"`,
  ].join(';');

  return {
    'Signature-Input': `sig1=${params}`,
    Signature: `sig1=:${signature}:`,
  };
}

/**
 * Parse signature headers from HTTP request
 *
 * Extracts signature and metadata from Signature and Signature-Input headers.
 */
export function parseSignatureHeaders(headers: {
  signature?: string;
  'signature-input'?: string;
}): {
  signature: string;
  metadata: SignatureMetadata;
  components: string[];
} | null {
  const signatureHeader = headers.signature || headers['signature-input'];
  const signatureInputHeader = headers['signature-input'];

  if (!signatureHeader || !signatureInputHeader) {
    return null;
  }

  try {
    // Parse Signature header: sig1=:base64url-signature:
    const signatureMatch = signatureHeader.match(/sig1=:([^:]+):/);
    if (!signatureMatch) return null;
    const signature = signatureMatch[1];

    // Parse Signature-Input header: sig1=(...);created=...;keyid=...;alg=...;nonce=...
    const inputMatch = signatureInputHeader.match(/sig1=\(([^)]+)\);(.+)/);
    if (!inputMatch) return null;

    const componentList = inputMatch[1].split(' ').map((c) => c.replace(/"/g, ''));
    const paramsStr = inputMatch[2];

    // Parse parameters
    const params: Record<string, string> = {};
    paramsStr.split(';').forEach((param) => {
      const [key, value] = param.split('=');
      params[key.trim()] = value.replace(/"/g, '');
    });

    const metadata: SignatureMetadata = {
      keyid: params.keyid,
      alg: params.alg as 'ed25519',
      created: parseInt(params.created, 10),
      nonce: params.nonce,
    };

    return {
      signature,
      metadata,
      components: componentList,
    };
  } catch (error) {
    return null;
  }
}
