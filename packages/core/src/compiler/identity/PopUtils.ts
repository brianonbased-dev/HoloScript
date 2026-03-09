/**
 * HoloScript PoP Utility Functions
 *
 * Helper functions for HTTP Message Signature construction and parsing.
 *
 * @version 1.0.0
 */

import { SignatureComponents, SignatureMetadata } from './AgentPoP';

/**
 * Serialize component value for signature base
 *
 * Per RFC 9440 Section 2.1:
 * - Structured fields use serialization algorithm
 * - Strings are wrapped in quotes
 * - Special components (@method, @target-uri) are bare values
 */
export function serializeComponent(name: string, value: string | number): string {
  // Special components (@-prefixed) are serialized as bare values
  if (name.startsWith('@')) {
    return String(value);
  }

  // Regular headers are serialized as strings
  return String(value);
}

/**
 * Validate signature components
 *
 * Ensures all required components are present.
 */
export function validateComponents(components: SignatureComponents): {
  valid: boolean;
  missing?: string[];
} {
  const required = ['@method', '@target-uri', '@request-timestamp', '@nonce'];
  const missing: string[] = [];

  for (const field of required) {
    if (!(field in components) || components[field as keyof SignatureComponents] === undefined) {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    return { valid: false, missing };
  }

  return { valid: true };
}

/**
 * Extract components from HTTP request
 *
 * Builds SignatureComponents from Express request object.
 */
export function extractComponentsFromRequest(req: {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: any;
}): SignatureComponents {
  const components: SignatureComponents = {
    '@method': req.method.toUpperCase(),
    '@target-uri': req.url,
    '@request-timestamp': 0, // Will be set by signRequest
    '@nonce': '', // Will be set by signRequest
  };

  // Add authorization header if present
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && typeof authHeader === 'string') {
    components.authorization = authHeader;
  }

  // Add content-type if present
  const contentType = req.headers['content-type'] || req.headers['Content-Type'];
  if (contentType && typeof contentType === 'string') {
    components['content-type'] = contentType;
  }

  // Add content-digest if present
  const contentDigest = req.headers['content-digest'] || req.headers['Content-Digest'];
  if (contentDigest && typeof contentDigest === 'string') {
    components['content-digest'] = contentDigest;
  }

  return components;
}

/**
 * Build signature parameters string
 *
 * Per RFC 9440 Section 2.3:
 * (@component1 @component2 ...);created=timestamp;keyid="key";alg="ed25519";nonce="xyz"
 */
export function buildSignatureParams(componentIds: string[], metadata: SignatureMetadata): string {
  const quotedComponents = componentIds.map((id) => `"${id}"`);
  return [
    `(${quotedComponents.join(' ')})`,
    `created=${metadata.created}`,
    `keyid="${metadata.keyid}"`,
    `alg="${metadata.alg}"`,
    `nonce="${metadata.nonce}"`,
  ].join(';');
}

/**
 * Parse signature parameters string
 *
 * Inverse of buildSignatureParams.
 */
export function parseSignatureParams(paramsStr: string): {
  components: string[];
  metadata: Partial<SignatureMetadata>;
} | null {
  try {
    // Extract component list: (...);...
    const componentMatch = paramsStr.match(/\(([^)]+)\)/);
    if (!componentMatch) return null;

    const componentIds = componentMatch[1].split(' ').map((c) => c.trim().replace(/"/g, ''));

    // Extract parameters: ;key=value;...
    const paramsMatch = paramsStr.match(/\);(.+)/);
    if (!paramsMatch) return null;

    const params: Record<string, string> = {};
    paramsMatch[1].split(';').forEach((param) => {
      const [key, value] = param.split('=');
      if (key && value) {
        params[key.trim()] = value.trim().replace(/"/g, '');
      }
    });

    const metadata: Partial<SignatureMetadata> = {
      created: params.created ? parseInt(params.created, 10) : undefined,
      keyid: params.keyid,
      alg: params.alg as 'ed25519',
      nonce: params.nonce,
    };

    return {
      components: componentIds,
      metadata,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Normalize header name
 *
 * Converts header names to lowercase per HTTP/2 specification.
 */
export function normalizeHeaderName(name: string): string {
  return name.toLowerCase();
}

/**
 * Extract nonce from request headers
 *
 * Looks for nonce in Signature-Input header or generates a warning.
 */
export function extractNonce(
  headers: Record<string, string | string[] | undefined>
): string | null {
  const signatureInput = headers['signature-input'] || headers['Signature-Input'];
  if (!signatureInput || typeof signatureInput !== 'string') {
    return null;
  }

  const nonceMatch = signatureInput.match(/nonce="([^"]+)"/);
  return nonceMatch ? nonceMatch[1] : null;
}

/**
 * Check if request has valid signature headers
 */
export function hasSignatureHeaders(
  headers: Record<string, string | string[] | undefined>
): boolean {
  const hasSignature = !!(headers.signature || headers.Signature);
  const hasSignatureInput = !!(headers['signature-input'] || headers['Signature-Input']);
  return hasSignature && hasSignatureInput;
}

/**
 * Format error response for signature validation failures
 */
export function formatSignatureError(
  errorCode: string,
  message: string
): {
  error: string;
  code: string;
  message: string;
  timestamp: string;
} {
  return {
    error: 'Signature Verification Failed',
    code: errorCode,
    message,
    timestamp: new Date().toISOString(),
  };
}
