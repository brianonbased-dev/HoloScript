/**
 * HoloScript UCAN Capability Token Issuer
 *
 * Utility class for creating, signing, verifying, and delegating UCAN-style
 * capability tokens. Uses Ed25519 signing from the existing AgentIdentity
 * framework.
 *
 * Key design decisions:
 * - Attenuation enforcement: delegated tokens can ONLY narrow scope (never widen)
 * - Self-certifying tokens: each token is signed by the issuer's Ed25519 key
 * - Proof chain resolution: tokens carry references to parent tokens
 * - Replay protection: every token has a unique nonce
 * - Expiration monotonicity: child tokens cannot outlive their parents
 *
 * @version 1.0.0
 */

import * as crypto from 'crypto';
import {
  AgentRole,
  AgentPermission,
  AgentKeyPair,
  generateAgentKeyPair,
  getDefaultPermissions,
} from './AgentIdentity';

import type {
  Capability,
  CapabilitySemantics,
  CapabilityToken,
  CapabilityTokenHeader,
  CapabilityTokenPayload,
  CapabilityVerificationResult,
  AttenuationChain,
  DelegationLink,
  RootTokenOptions,
  DelegationOptions,
} from './CapabilityToken';

import {
  HOLOSCRIPT_RESOURCE_SCHEME,
  HOLOSCRIPT_RESOURCE_ALL,
  CapabilityActions,
  PERMISSION_TO_ACTION,
} from './CapabilityToken';

// ---------------------------------------------------------------------------
// Base64url helpers (avoid external dependencies)
// ---------------------------------------------------------------------------

function base64urlEncode(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  return buf.toString('base64url');
}

function base64urlDecode(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

// ---------------------------------------------------------------------------
// Default capability semantics for HoloScript
// ---------------------------------------------------------------------------

/**
 * Default HoloScript capability semantics.
 *
 * Resource containment:
 *   `holoscript://*` contains every `holoscript://...` URI.
 *   A parent path contains any child path (e.g. `holoscript://packages`
 *   contains `holoscript://packages/core/ast`).
 *
 * Action containment:
 *   `*` contains every action.
 *   An action `a/b` contains `a/b` (exact match only, no hierarchy).
 */
export class HoloScriptCapabilitySemantics implements CapabilitySemantics {
  /**
   * Check whether `child` is a valid attenuation (subset) of `parent`.
   */
  isSubsetOf(child: Capability, parent: Capability): boolean {
    // Action check
    if (parent.can !== CapabilityActions.ALL && parent.can !== child.can) {
      return false;
    }

    // Resource check
    if (parent.with === HOLOSCRIPT_RESOURCE_ALL) {
      // Wildcard parent contains everything in the holoscript scheme
      return child.with.startsWith(HOLOSCRIPT_RESOURCE_SCHEME);
    }

    // Exact match or child is a sub-path of parent
    if (child.with === parent.with) {
      return true;
    }

    // Path containment: parent "holoscript://a/b" contains "holoscript://a/b/c"
    const parentNormalized = parent.with.endsWith('/') ? parent.with : parent.with + '/';
    if (child.with.startsWith(parentNormalized)) {
      return true;
    }

    return false;
  }

  /**
   * Check if `capability` authorises the given resource + action.
   */
  canAccess(capability: Capability, resource: string, action: string): boolean {
    // Action match
    if (capability.can !== CapabilityActions.ALL && capability.can !== action) {
      return false;
    }

    // Resource match
    if (capability.with === HOLOSCRIPT_RESOURCE_ALL) {
      return resource.startsWith(HOLOSCRIPT_RESOURCE_SCHEME);
    }

    if (capability.with === resource) {
      return true;
    }

    const capNormalized = capability.with.endsWith('/') ? capability.with : capability.with + '/';
    return resource.startsWith(capNormalized);
  }

  /**
   * Convert a legacy AgentPermission into a Capability.
   */
  fromPermission(permission: AgentPermission, scope?: string): Capability {
    const action = PERMISSION_TO_ACTION[permission] || permission;
    const resource = scope
      ? `${HOLOSCRIPT_RESOURCE_SCHEME}${scope}`
      : HOLOSCRIPT_RESOURCE_ALL;

    return {
      with: resource,
      can: action,
    };
  }
}

// ---------------------------------------------------------------------------
// Issuer configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the CapabilityTokenIssuer.
 */
export interface CapabilityTokenIssuerConfig {
  /** Default token lifetime in seconds (default: 86400 = 24 h) */
  defaultLifetimeSec?: number;

  /** Maximum allowed delegation depth (default: 10) */
  maxDelegationDepth?: number;

  /** Capability semantics implementation */
  semantics?: CapabilitySemantics;

  /** Enable strict expiration monotonicity checks (default: true) */
  strictExpiration?: boolean;
}

// ---------------------------------------------------------------------------
// Token store for proof resolution
// ---------------------------------------------------------------------------

/**
 * In-memory store for issued tokens, keyed by their nonce (nnc).
 * In production this would be replaced by a persistent CID-based store.
 */
type TokenStore = Map<string, CapabilityToken>;

// ---------------------------------------------------------------------------
// CapabilityTokenIssuer
// ---------------------------------------------------------------------------

/**
 * Central utility for UCAN capability token lifecycle management.
 *
 * Handles:
 * - Root token issuance (for top-level authorities like the orchestrator)
 * - Delegated token issuance with attenuation enforcement
 * - Token verification and chain resolution
 * - Conversion between legacy RBAC permissions and capabilities
 */
export class CapabilityTokenIssuer {
  private defaultLifetimeSec: number;
  private maxDelegationDepth: number;
  private semantics: CapabilitySemantics;
  private strictExpiration: boolean;

  /** Token store for proof resolution */
  private tokenStore: TokenStore = new Map();

  /** Nonce set for replay detection */
  private usedNonces: Set<string> = new Set();

  constructor(config: CapabilityTokenIssuerConfig = {}) {
    this.defaultLifetimeSec = config.defaultLifetimeSec ?? 86400;
    this.maxDelegationDepth = config.maxDelegationDepth ?? 10;
    this.semantics = config.semantics ?? new HoloScriptCapabilitySemantics();
    this.strictExpiration = config.strictExpiration ?? true;
  }

  // -----------------------------------------------------------------------
  // Root token issuance
  // -----------------------------------------------------------------------

  /**
   * Issue a root capability token (no parent proofs).
   *
   * Root tokens are typically issued by the orchestrator or a top-level
   * identity provider to grant initial capabilities.
   *
   * @param options  Token creation options
   * @param keyPair  Ed25519 key pair of the issuer (used for signing)
   * @returns        Signed CapabilityToken
   */
  async issueRoot(options: RootTokenOptions, keyPair: AgentKeyPair): Promise<CapabilityToken> {
    const now = Math.floor(Date.now() / 1000);
    const lifetime = options.lifetimeSec ?? this.defaultLifetimeSec;
    const nonce = crypto.randomUUID();

    const payload: CapabilityTokenPayload = {
      iss: options.issuer,
      aud: options.audience,
      att: options.capabilities,
      prf: [], // root — no proofs
      exp: now + lifetime,
      nbf: options.notBeforeOffsetSec != null ? now + options.notBeforeOffsetSec : undefined,
      nnc: nonce,
      fct: options.facts,
    };

    const token = this.sign(payload, keyPair);

    // Store for future proof resolution
    this.tokenStore.set(nonce, token);

    return token;
  }

  // -----------------------------------------------------------------------
  // Delegation with attenuation
  // -----------------------------------------------------------------------

  /**
   * Delegate (attenuate) an existing capability token to a new audience.
   *
   * Enforces:
   * 1. Every capability in the child MUST be a subset of at least one
   *    capability in the parent.
   * 2. Child expiration MUST NOT exceed parent expiration.
   * 3. Delegation depth MUST NOT exceed `maxDelegationDepth`.
   *
   * @param options  Delegation options including the parent token
   * @param keyPair  Ed25519 key pair of the delegator (current holder)
   * @returns        New signed CapabilityToken
   * @throws         Error if attenuation invariants are violated
   */
  async delegate(options: DelegationOptions, keyPair: AgentKeyPair): Promise<CapabilityToken> {
    const { parentToken, audience, capabilities, lifetimeSec, facts } = options;
    const parentPayload = parentToken.payload;

    // --- Attenuation check ---
    for (const childCap of capabilities) {
      const covered = parentPayload.att.some((parentCap) =>
        this.semantics.isSubsetOf(childCap, parentCap)
      );
      if (!covered) {
        throw new Error(
          `Attenuation violation: capability {with: "${childCap.with}", can: "${childCap.can}"} ` +
            `is not a subset of any parent capability. Delegations can only narrow scope.`
        );
      }
    }

    // --- Expiration monotonicity ---
    const now = Math.floor(Date.now() / 1000);
    const requestedLifetime = lifetimeSec ?? this.defaultLifetimeSec;
    const childExp = now + requestedLifetime;

    if (this.strictExpiration && childExp > parentPayload.exp) {
      throw new Error(
        `Expiration violation: delegated token expires at ${childExp} ` +
          `but parent expires at ${parentPayload.exp}. ` +
          `Child tokens cannot outlive their parents.`
      );
    }

    const effectiveExp = Math.min(childExp, parentPayload.exp);

    // --- Delegation depth ---
    const currentDepth = parentPayload.prf.length + 1;
    if (currentDepth > this.maxDelegationDepth) {
      throw new Error(
        `Delegation depth ${currentDepth} exceeds maximum of ${this.maxDelegationDepth}.`
      );
    }

    // Build proof chain (parent's proofs + parent's nonce)
    const proofs = [...parentPayload.prf, parentPayload.nnc];

    const nonce = crypto.randomUUID();
    const payload: CapabilityTokenPayload = {
      iss: parentPayload.aud, // delegator is the audience of the parent
      aud: audience,
      att: capabilities,
      prf: proofs,
      exp: effectiveExp,
      nbf: now,
      nnc: nonce,
      fct: facts,
    };

    const token = this.sign(payload, keyPair);

    // Store
    this.tokenStore.set(nonce, token);

    return token;
  }

  // -----------------------------------------------------------------------
  // Signing
  // -----------------------------------------------------------------------

  /**
   * Sign a capability token payload with an Ed25519 key pair.
   *
   * Produces a JWT-like structure: base64url(header).base64url(payload).base64url(sig)
   */
  sign(payload: CapabilityTokenPayload, keyPair: AgentKeyPair): CapabilityToken {
    const header: CapabilityTokenHeader = {
      alg: 'EdDSA',
      typ: 'JWT',
      ucv: '0.10.0',
    };

    const headerB64 = base64urlEncode(JSON.stringify(header));
    const payloadB64 = base64urlEncode(JSON.stringify(payload));

    const signingInput = `${headerB64}.${payloadB64}`;

    const privateKeyObj = crypto.createPrivateKey(keyPair.privateKey);
    const signatureBuffer = crypto.sign(null, Buffer.from(signingInput, 'utf-8'), privateKeyObj);
    const signatureB64 = signatureBuffer.toString('base64url');

    const raw = `${headerB64}.${payloadB64}.${signatureB64}`;

    return {
      header,
      payload,
      signature: signatureB64,
      raw,
    };
  }

  // -----------------------------------------------------------------------
  // Verification
  // -----------------------------------------------------------------------

  /**
   * Verify a capability token.
   *
   * Checks:
   * 1. Structural validity (three-part JWT)
   * 2. Ed25519 signature
   * 3. Expiration / not-before
   * 4. Replay (nonce uniqueness)
   * 5. Proof chain integrity (attenuation invariants)
   *
   * @param raw       The raw JWT string (or a CapabilityToken object)
   * @param publicKey PEM-encoded Ed25519 public key of the issuer
   * @returns         Verification result
   */
  verify(
    raw: string | CapabilityToken,
    publicKey: string
  ): CapabilityVerificationResult {
    const rawStr = typeof raw === 'string' ? raw : raw.raw;
    const parts = rawStr.split('.');
    if (parts.length !== 3) {
      return {
        valid: false,
        error: 'Malformed token: expected 3 parts',
        errorCode: 'INVALID_SIGNATURE',
      };
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // --- Signature verification ---
    try {
      const pubKeyObj = crypto.createPublicKey(publicKey);
      const signingInput = `${headerB64}.${payloadB64}`;
      const signatureBuffer = base64urlDecode(signatureB64);
      const isValid = crypto.verify(
        null,
        Buffer.from(signingInput, 'utf-8'),
        pubKeyObj,
        signatureBuffer
      );
      if (!isValid) {
        return {
          valid: false,
          error: 'Invalid Ed25519 signature',
          errorCode: 'INVALID_SIGNATURE',
        };
      }
    } catch {
      return {
        valid: false,
        error: 'Signature verification failed',
        errorCode: 'INVALID_SIGNATURE',
      };
    }

    // --- Decode payload ---
    let payload: CapabilityTokenPayload;
    try {
      payload = JSON.parse(base64urlDecode(payloadB64).toString('utf-8'));
    } catch {
      return {
        valid: false,
        error: 'Malformed payload',
        errorCode: 'INVALID_SIGNATURE',
      };
    }

    // --- Expiration ---
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
      return {
        valid: false,
        payload,
        error: 'Token expired',
        errorCode: 'EXPIRED',
      };
    }

    // --- Not-before ---
    if (payload.nbf != null && payload.nbf > now) {
      return {
        valid: false,
        payload,
        error: `Token not yet valid (nbf: ${payload.nbf}, now: ${now})`,
        errorCode: 'NOT_YET_VALID',
      };
    }

    // --- Replay check ---
    if (this.usedNonces.has(payload.nnc)) {
      return {
        valid: false,
        payload,
        error: 'Nonce already used (replay detected)',
        errorCode: 'REPLAY_DETECTED',
      };
    }

    // Record nonce as used
    this.usedNonces.add(payload.nnc);

    // --- Proof chain verification ---
    const chainResult = this.resolveChain(payload);

    return {
      valid: true,
      payload,
      chain: chainResult,
    };
  }

  // -----------------------------------------------------------------------
  // Proof chain resolution
  // -----------------------------------------------------------------------

  /**
   * Resolve and verify the proof chain for a token payload.
   *
   * Walks back through `prf` references, checking attenuation invariants
   * at each step.
   */
  resolveChain(payload: CapabilityTokenPayload): AttenuationChain | undefined {
    if (payload.prf.length === 0) {
      // Root token — trivial chain
      return {
        links: [
          {
            tokenId: payload.nnc,
            issuer: payload.iss,
            audience: payload.aud,
            capabilities: payload.att,
            issuedAt: payload.nbf ?? Math.floor(Date.now() / 1000),
            expiresAt: payload.exp,
          },
        ],
        rootAuthority: payload.iss,
        verified: true,
        verifiedAt: new Date().toISOString(),
      };
    }

    const links: DelegationLink[] = [];

    // Walk proof chain backwards
    for (const proofNonce of payload.prf) {
      const parentToken = this.tokenStore.get(proofNonce);
      if (!parentToken) {
        // Cannot resolve full chain — partial chain
        return {
          links,
          rootAuthority: links.length > 0 ? links[0].issuer : payload.iss,
          verified: false,
        };
      }

      links.push({
        tokenId: parentToken.payload.nnc,
        issuer: parentToken.payload.iss,
        audience: parentToken.payload.aud,
        capabilities: parentToken.payload.att,
        issuedAt: parentToken.payload.nbf ?? 0,
        expiresAt: parentToken.payload.exp,
      });
    }

    // Add current token as final link
    links.push({
      tokenId: payload.nnc,
      issuer: payload.iss,
      audience: payload.aud,
      capabilities: payload.att,
      issuedAt: payload.nbf ?? 0,
      expiresAt: payload.exp,
    });

    // Verify attenuation invariants between adjacent links
    let chainValid = true;
    for (let i = 1; i < links.length; i++) {
      const parent = links[i - 1];
      const child = links[i];

      // Audience/issuer continuity
      if (child.issuer !== parent.audience) {
        chainValid = false;
        break;
      }

      // Attenuation: every child capability must be subset of some parent capability
      for (const childCap of child.capabilities) {
        const covered = parent.capabilities.some((parentCap) =>
          this.semantics.isSubsetOf(childCap, parentCap)
        );
        if (!covered) {
          chainValid = false;
          break;
        }
      }
      if (!chainValid) break;

      // Expiration monotonicity
      if (child.expiresAt > parent.expiresAt) {
        chainValid = false;
        break;
      }
    }

    return {
      links,
      rootAuthority: links[0].issuer,
      verified: chainValid,
      verifiedAt: chainValid ? new Date().toISOString() : undefined,
    };
  }

  // -----------------------------------------------------------------------
  // Convenience: issue from AgentRole
  // -----------------------------------------------------------------------

  /**
   * Issue a root capability token for a given AgentRole.
   *
   * Automatically maps role permissions to capabilities using the bridge
   * mappings defined in CapabilityToken.ts.
   *
   * @param role      Agent role
   * @param audience  Audience identifier
   * @param keyPair   Ed25519 key pair
   * @param scope     Optional resource scope restriction
   * @returns         Signed root CapabilityToken
   */
  async issueForRole(
    role: AgentRole,
    audience: string,
    keyPair: AgentKeyPair,
    scope?: string
  ): Promise<CapabilityToken> {
    const permissions = getDefaultPermissions(role);
    const capabilities = permissions.map((perm) =>
      this.semantics.fromPermission(perm, scope)
    );

    const issuer = `agent:${role}`;

    return this.issueRoot(
      {
        issuer,
        audience,
        capabilities,
      },
      keyPair
    );
  }

  // -----------------------------------------------------------------------
  // Capability query
  // -----------------------------------------------------------------------

  /**
   * Check whether a token grants access to a specific resource + action.
   *
   * Does NOT verify the signature — call `verify()` first if the token
   * has not been verified yet.
   */
  hasCapability(token: CapabilityToken, resource: string, action: string): boolean {
    return token.payload.att.some((cap) => this.semantics.canAccess(cap, resource, action));
  }

  // -----------------------------------------------------------------------
  // Store management
  // -----------------------------------------------------------------------

  /**
   * Retrieve a stored token by its nonce (for proof resolution).
   */
  getStoredToken(nonce: string): CapabilityToken | undefined {
    return this.tokenStore.get(nonce);
  }

  /**
   * Store an externally-created token (e.g. received from another agent).
   */
  storeToken(token: CapabilityToken): void {
    this.tokenStore.set(token.payload.nnc, token);
  }

  /**
   * Clear all stored tokens and nonces (for testing).
   */
  reset(): void {
    this.tokenStore.clear();
    this.usedNonces.clear();
  }

  /**
   * Get the semantics engine used by this issuer.
   */
  getSemantics(): CapabilitySemantics {
    return this.semantics;
  }
}

// ---------------------------------------------------------------------------
// Global singleton
// ---------------------------------------------------------------------------

let globalCapabilityIssuer: CapabilityTokenIssuer | null = null;

/**
 * Get or create the global CapabilityTokenIssuer instance.
 */
export function getCapabilityTokenIssuer(
  config?: CapabilityTokenIssuerConfig
): CapabilityTokenIssuer {
  if (!globalCapabilityIssuer) {
    globalCapabilityIssuer = new CapabilityTokenIssuer(config);
  }
  return globalCapabilityIssuer;
}

/**
 * Reset the global CapabilityTokenIssuer (for testing).
 */
export function resetCapabilityTokenIssuer(): void {
  globalCapabilityIssuer = null;
}
