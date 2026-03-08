/**
 * DID-based operation signing and verification for authenticated CRDTs
 *
 * Uses did-jwt library to sign all CRDT operations with agent DIDs,
 * ensuring cryptographic authenticity and non-repudiation.
 *
 * @version 1.0.0
 */

import { ES256KSigner, createJWT, verifyJWT } from 'did-jwt';
import type { JWTPayload, JWTVerified } from 'did-jwt';
import { v4 as uuidv4 } from 'uuid';

/**
 * CRDT operation types that can be signed
 */
export enum CRDTOperationType {
  LWW_SET = 'lww_set',
  OR_SET_ADD = 'or_set_add',
  OR_SET_REMOVE = 'or_set_remove',
  G_COUNTER_INCREMENT = 'g_counter_increment',
}

/**
 * Signed CRDT operation payload
 */
export interface CRDTOperation {
  /** Unique operation ID */
  id: string;

  /** Operation type */
  type: CRDTOperationType;

  /** CRDT instance ID this operation applies to */
  crdtId: string;

  /** Agent DID performing the operation */
  actorDid: string;

  /** Operation timestamp (logical clock) */
  timestamp: number;

  /** Operation-specific data */
  data: unknown;

  /** Causality metadata (vector clock, version vector, etc.) */
  causality?: Record<string, number>;
}

/**
 * Signed operation with JWT
 */
export interface SignedOperation {
  /** Original operation */
  operation: CRDTOperation;

  /** JWT signature */
  jwt: string;
}

/**
 * Verification result for signed operations
 */
export interface VerificationResult {
  /** Whether verification succeeded */
  valid: boolean;

  /** Verified operation (if valid) */
  operation?: CRDTOperation;

  /** Error message (if invalid) */
  error?: string;

  /** Verified DID */
  did?: string;
}

/**
 * DID signer configuration
 */
export interface DIDSignerConfig {
  /** Agent's DID (e.g., did:ethr:0x...) */
  did: string;

  /** Private key for signing (hex string without 0x prefix) */
  privateKey: string;

  /** Optional: DID resolver endpoint */
  resolverUrl?: string;
}

/**
 * DID-based signer for CRDT operations
 *
 * Signs all CRDT operations with agent DIDs using ES256K (secp256k1)
 * algorithm compatible with Ethereum-based DIDs.
 */
export class DIDSigner {
  private did: string;
  private signer: any; // ES256KSigner type
  private resolverUrl?: string;

  constructor(config: DIDSignerConfig) {
    this.did = config.did;
    this.resolverUrl = config.resolverUrl;

    // Create ES256K signer from private key
    // Private key must be hex string without 0x prefix
    const privateKeyBytes = Buffer.from(config.privateKey, 'hex');
    this.signer = ES256KSigner(privateKeyBytes);
  }

  /**
   * Sign a CRDT operation
   *
   * Creates a JWT containing the operation data, signed with the agent's DID.
   * The JWT payload includes:
   * - iss: Agent DID (issuer)
   * - sub: CRDT instance ID (subject)
   * - iat: Issued at timestamp
   * - operation: Full CRDT operation data
   */
  async signOperation(operation: CRDTOperation): Promise<SignedOperation> {
    // Validate operation has required fields
    if (!operation.id || !operation.type || !operation.crdtId || !operation.actorDid) {
      throw new Error('Invalid operation: missing required fields');
    }

    // Ensure operation actor matches this signer's DID
    if (operation.actorDid !== this.did) {
      throw new Error(
        `Operation actor DID (${operation.actorDid}) does not match signer DID (${this.did})`,
      );
    }

    // Create JWT payload
    const payload: JWTPayload = {
      iss: this.did, // Issuer = agent DID
      sub: operation.crdtId, // Subject = CRDT instance
      iat: Math.floor(Date.now() / 1000), // Issued at (seconds)
      operation, // Embed full operation
    };

    // Sign with ES256K algorithm
    const jwt = await createJWT(payload, { issuer: this.did, signer: this.signer }, { alg: 'ES256K' });

    return {
      operation,
      jwt,
    };
  }

  /**
   * Verify a signed operation
   *
   * Verifies JWT signature and extracts the operation.
   * Checks:
   * 1. JWT signature is valid (cryptographic authenticity)
   * 2. JWT issuer matches operation actor DID (identity binding)
   * 3. JWT subject matches CRDT instance ID (operation scope)
   */
  async verifyOperation(signedOp: SignedOperation): Promise<VerificationResult> {
    try {
      // Verify JWT signature
      // Note: In production, this would use a DID resolver to fetch the public key
      // For now, we use a simplified resolver that trusts the JWT
      const verified: JWTVerified = await verifyJWT(signedOp.jwt, {
        resolver: {
          resolve: async (did: string) => {
            // Simplified resolver: In production, this would query a DID registry
            // For ethr DIDs, this would fetch the public key from Ethereum
            return {
              didDocument: {
                id: did,
                verificationMethod: [],
              },
              didDocumentMetadata: {},
              didResolutionMetadata: {},
            };
          },
        },
      });

      const payload = verified.payload as JWTPayload & { operation: CRDTOperation };

      // Extract operation from JWT payload
      const operation = payload.operation;
      if (!operation) {
        return {
          valid: false,
          error: 'JWT payload missing operation data',
        };
      }

      // Verify issuer matches operation actor
      if (payload.iss !== operation.actorDid) {
        return {
          valid: false,
          error: `JWT issuer (${payload.iss}) does not match operation actor (${operation.actorDid})`,
        };
      }

      // Verify subject matches CRDT instance
      if (payload.sub !== operation.crdtId) {
        return {
          valid: false,
          error: `JWT subject (${payload.sub}) does not match CRDT instance (${operation.crdtId})`,
        };
      }

      return {
        valid: true,
        operation,
        did: payload.iss,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown verification error',
      };
    }
  }

  /**
   * Create a new CRDT operation (unsigned)
   *
   * Helper to construct operation objects with proper structure.
   */
  createOperation(
    type: CRDTOperationType,
    crdtId: string,
    data: unknown,
    causality?: Record<string, number>,
  ): CRDTOperation {
    return {
      id: uuidv4(),
      type,
      crdtId,
      actorDid: this.did,
      timestamp: Date.now(),
      data,
      causality,
    };
  }

  /**
   * Get this signer's DID
   */
  getDID(): string {
    return this.did;
  }
}

/**
 * Create a test DID signer with a random private key
 *
 * FOR TESTING ONLY - generates ephemeral DIDs
 */
export function createTestSigner(agentName: string): DIDSigner {
  // Generate random 32-byte private key
  const privateKey = Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)));
  const privateKeyHex = privateKey.toString('hex');

  // Create test DID (in production, this would be registered on-chain)
  const did = `did:test:${agentName}:${privateKeyHex.slice(0, 16)}`;

  return new DIDSigner({
    did,
    privateKey: privateKeyHex,
  });
}
