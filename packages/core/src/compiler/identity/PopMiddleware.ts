/**
 * HoloScript PoP Express Middleware
 *
 * Express middleware for HTTP Message Signature verification with PoP tokens.
 *
 * Features:
 * - Automatic signature verification
 * - JWT token extraction and validation
 * - Public key extraction from token claims
 * - Backward compatibility for legacy agents (no signature)
 * - Detailed error responses
 *
 * @version 1.0.0
 */

import {
  constructSignatureBase,
  verifySignature,
  parseSignatureHeaders,
  SignatureComponents,
  SignatureMetadata,
} from './AgentPoP';
import {
  extractComponentsFromRequest,
  hasSignatureHeaders,
  formatSignatureError,
} from './PopUtils';
import { AgentTokenIssuer, getTokenIssuer } from './AgentTokenIssuer';
import { IntentTokenPayload } from './AgentIdentity';
import { AgentKeystore, getKeystore } from './AgentKeystore';
import { verifyJwkThumbprint } from './JwkThumbprint';

/**
 * HTTP Request interface (compatible with Express)
 */
export interface HttpRequest {
  method: string;
  url: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body?: any;
}

/**
 * HTTP Response interface (compatible with Express)
 */
export interface HttpResponse {
  status(code: number): HttpResponse;
  json(body: any): void;
}

/**
 * Next function type (compatible with Express)
 */
export type NextFunction = (error?: any) => void;

/**
 * PoP middleware configuration
 */
export interface PopMiddlewareConfig {
  /** Token issuer for JWT verification */
  tokenIssuer?: AgentTokenIssuer;

  /** Enable backward compatibility (allow requests without signatures) */
  allowLegacy?: boolean;

  /** Paths to exclude from PoP verification (e.g., ['/health', '/metrics']) */
  excludePaths?: string[];

  /** Custom error handler */
  onError?: (error: Error, req: HttpRequest, res: HttpResponse) => void;

  /**
   * Keystore for public-key fallback lookup by JWK thumbprint.
   * Used when the JWT does not embed a `publicKey` claim directly.
   * Defaults to the global keystore if not provided.
   */
  keystore?: AgentKeystore;
}

/**
 * Extended HTTP Request with agent identity
 */
export interface AuthenticatedRequest extends HttpRequest {
  /** Verified agent token payload */
  agent?: IntentTokenPayload;

  /** Original JWT token */
  agentToken?: string;
}

/**
 * Create PoP verification middleware
 *
 * Usage:
 * ```typescript
 * import { createPopMiddleware } from '@holoscript/core/compiler/identity';
 *
 * const app = express();
 * app.use(createPopMiddleware({
 *   allowLegacy: false,
 *   excludePaths: ['/health'],
 * }));
 * ```
 */
export function createPopMiddleware(config: PopMiddlewareConfig = {}) {
  const {
    tokenIssuer = getTokenIssuer(),
    allowLegacy = true, // Default to true for gradual rollout
    excludePaths = [],
    onError,
    keystore,
  } = config;

  return async (
    req: AuthenticatedRequest,
    res: HttpResponse,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Skip excluded paths
      if (excludePaths.some((path) => req.path.startsWith(path))) {
        return next();
      }

      // Extract Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.status(401).json(formatSignatureError('MISSING_AUTH', 'Missing Authorization header'));
        return;
      }

      // Ensure authHeader is a string (not an array)
      const authHeaderStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;
      if (!authHeaderStr) {
        res.status(401).json(formatSignatureError('INVALID_AUTH', 'Authorization header is empty'));
        return;
      }

      // Extract JWT token
      const token = tokenIssuer.extractToken(authHeaderStr);
      if (!token) {
        res
          .status(401)
          .json(formatSignatureError('INVALID_AUTH', 'Invalid Authorization header format'));
        return;
      }

      // Verify JWT token
      const tokenResult = tokenIssuer.verifyToken(token);
      if (!tokenResult.valid || !tokenResult.payload) {
        res
          .status(401)
          .json(
            formatSignatureError(
              tokenResult.errorCode || 'INVALID_TOKEN',
              tokenResult.error || 'Token verification failed'
            )
          );
        return;
      }

      // Attach agent identity to request
      req.agent = tokenResult.payload;
      req.agentToken = token;

      // Check if request has signature headers
      const hasSignature = hasSignatureHeaders(req.headers);

      // If no signature headers and legacy mode is disabled, reject
      if (!hasSignature && !allowLegacy) {
        res
          .status(401)
          .json(
            formatSignatureError(
              'MISSING_SIGNATURE',
              'HTTP Message Signature required. Legacy mode disabled.'
            )
          );
        return;
      }

      // If no signature headers but legacy mode is enabled, allow request
      if (!hasSignature && allowLegacy) {
        console.warn(
          `[POP_MIDDLEWARE] Legacy agent detected: ${tokenResult.payload.agent_role} (no signature)`
        );
        return next();
      }

      // Parse signature headers
      const parsedSignature = parseSignatureHeaders({
        signature: req.headers.signature as string,
        'signature-input': req.headers['signature-input'] as string,
      });

      if (!parsedSignature) {
        res
          .status(400)
          .json(formatSignatureError('INVALID_SIGNATURE_HEADERS', 'Malformed signature headers'));
        return;
      }

      const { signature, metadata, components } = parsedSignature;

      // Extract public key from token claims
      // NOTE: In updated AgentTokenIssuer, we'll add publicKey to token claims
      // For now, we use the JWK thumbprint (cnf.jkt) for key binding
      const jkt = tokenResult.payload.cnf?.jkt;
      if (!jkt) {
        res
          .status(400)
          .json(
            formatSignatureError(
              'MISSING_JKT',
              'Token missing JWK thumbprint (cnf.jkt). Cannot verify PoP.'
            )
          );
        return;
      }

      // Retrieve public key: prefer the embedded claim, fall back to keystore lookup.
      // In all cases, verify that the key's JWK thumbprint matches the cnf.jkt
      // claim so a compromised token cannot redirect verification to a different key.
      let publicKey = tokenResult.payload.publicKey;

      if (publicKey) {
        // Embedded key — verify its thumbprint matches the token claim
        if (!verifyJwkThumbprint(publicKey, jkt)) {
          res
            .status(401)
            .json(
              formatSignatureError(
                'JKT_MISMATCH',
                'Embedded public key does not match JWK thumbprint (cnf.jkt).'
              )
            );
          return;
        }
      } else {
        // No embedded key — look up by thumbprint in the keystore
        const ks = keystore ?? getKeystore();
        const credential = await ks.getCredentialByThumbprint(jkt);
        if (credential) {
          publicKey = credential.keyPair.publicKey;
        }
      }

      if (!publicKey) {
        res
          .status(401)
          .json(
            formatSignatureError(
              'MISSING_PUBLIC_KEY',
              'No public key found for JWK thumbprint. Ensure the agent credential is registered in the keystore.'
            )
          );
        return;
      }

      // Reconstruct signature components from request
      const requestComponents = extractComponentsFromRequest(req);

      // Build component map from parsed signature
      const componentMap: SignatureComponents = {
        '@method': '',
        '@target-uri': '',
        '@request-timestamp': 0,
        '@nonce': '',
      };

      for (const comp of components) {
        if (comp === '@method') componentMap['@method'] = requestComponents['@method'];
        if (comp === '@target-uri') componentMap['@target-uri'] = requestComponents['@target-uri'];
        if (comp === '@request-timestamp') componentMap['@request-timestamp'] = metadata.created;
        if (comp === '@nonce') componentMap['@nonce'] = metadata.nonce;
        if (comp === 'authorization' && requestComponents.authorization) {
          componentMap.authorization = requestComponents.authorization;
        }
        if (comp === 'content-type' && requestComponents['content-type']) {
          componentMap['content-type'] = requestComponents['content-type'];
        }
        if (comp === 'content-digest' && requestComponents['content-digest']) {
          componentMap['content-digest'] = requestComponents['content-digest'];
        }
      }

      // Construct signature base
      const signatureBase = constructSignatureBase(componentMap, metadata);

      // Verify signature
      const verificationResult = verifySignature(signatureBase, signature, publicKey, metadata);

      if (!verificationResult.valid) {
        res
          .status(401)
          .json(
            formatSignatureError(
              verificationResult.errorCode || 'SIGNATURE_VERIFICATION_FAILED',
              verificationResult.error || 'Signature verification failed'
            )
          );
        return;
      }

      // Signature verified successfully
      next();
    } catch (error: unknown) {
      if (onError) {
        onError(error as Error, req, res);
      } else {
        console.error('[POP_MIDDLEWARE] Unexpected error:', error);
        res
          .status(500)
          .json(
            formatSignatureError('INTERNAL_ERROR', 'Internal server error during PoP verification')
          );
      }
    }
  };
}

/**
 * Require specific agent permission middleware
 *
 * Usage:
 * ```typescript
 * app.post('/api/compile',
 *   createPopMiddleware(),
 *   requirePermission(AgentPermission.WRITE_CODE),
 *   compileHandler
 * );
 * ```
 */
export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: HttpResponse, next: NextFunction): void => {
    if (!req.agent) {
      res.status(401).json(formatSignatureError('UNAUTHORIZED', 'Agent identity not verified'));
      return;
    }

    if (!req.agent.permissions.includes(permission as any)) {
      res
        .status(403)
        .json(formatSignatureError('FORBIDDEN', `Agent lacks required permission: ${permission}`));
      return;
    }

    next();
  };
}

/**
 * Require specific workflow step middleware
 *
 * Usage:
 * ```typescript
 * app.post('/api/optimize',
 *   createPopMiddleware(),
 *   requireWorkflowStep(WorkflowStep.APPLY_TRANSFORMS),
 *   optimizeHandler
 * );
 * ```
 */
export function requireWorkflowStep(expectedStep: string) {
  return (req: AuthenticatedRequest, res: HttpResponse, next: NextFunction): void => {
    if (!req.agent) {
      res.status(401).json(formatSignatureError('UNAUTHORIZED', 'Agent identity not verified'));
      return;
    }

    if (req.agent.intent.workflow_step !== expectedStep) {
      res
        .status(403)
        .json(
          formatSignatureError(
            'WORKFLOW_VIOLATION',
            `Expected workflow step: ${expectedStep}, got: ${req.agent.intent.workflow_step}`
          )
        );
      return;
    }

    next();
  };
}
