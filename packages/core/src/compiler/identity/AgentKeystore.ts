/**
 * HoloScript Compiler Agent Keystore
 *
 * Secure storage and rotation for agent credentials (JWT tokens and PoP keys).
 *
 * Features:
 * - Encrypted key storage using AES-256-GCM
 * - Automatic key rotation (24-hour lifecycle)
 * - In-memory credential cache with TTL
 * - Audit logging for security events
 *
 * @version 1.0.0
 */

import * as crypto from 'crypto';
import { z } from 'zod';
import { AgentRole, AgentKeyPair, generateAgentKeyPair } from './AgentIdentity';
import { safeJsonParse } from '../../errors/safeJsonParse';

/**
 * Zod schema for the serialized credential payload stored inside an
 * {@link EncryptedCredential}. Kept loose (`z.unknown()`) on the keyPair slot
 * since keypair shape is governed by AgentIdentity and validated downstream.
 */
const SerializedCredentialSchema = z.object({
  role: z.string(),
  token: z.string(),
  keyPair: z.unknown(),
  createdAt: z.string(),
  expiresAt: z.string(),
});

/**
 * Encrypted credential storage
 */
export interface EncryptedCredential {
  /** Encrypted data (AES-256-GCM) */
  ciphertext: string;

  /** Initialization vector */
  iv: string;

  /** Authentication tag */
  authTag: string;

  /** Key derivation salt */
  salt: string;

  /** Encryption algorithm */
  algorithm: 'aes-256-gcm';

  /** Creation timestamp */
  createdAt: string;

  /** Expiration timestamp */
  expiresAt: string;
}

/**
 * Agent credential (token + key pair)
 */
export interface AgentCredential {
  role: AgentRole;
  token: string;
  keyPair: AgentKeyPair;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Keystore configuration
 */
export interface KeystoreConfig {
  /** Master encryption key (32 bytes for AES-256) */
  masterKey?: Buffer;

  /** Default token lifetime (milliseconds) */
  tokenLifetime?: number;

  /** Enable audit logging */
  enableAuditLog?: boolean;

  /** Audit log path */
  auditLogPath?: string;
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  timestamp: string;
  event:
    | 'key_generated'
    | 'key_rotated'
    | 'key_accessed'
    | 'key_expired'
    | 'key_deleted'
    | 'key_parse_failed';
  agentRole: AgentRole;
  details?: Record<string, unknown>;
}

const DEFAULT_TOKEN_LIFETIME = 24 * 60 * 60 * 1000; // 24 hours
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 64; // 512 bits

/**
 * Secure keystore for agent credentials
 *
 * Stores JWT tokens and Ed25519 key pairs with encryption at rest.
 * Implements automatic rotation when credentials expire.
 */
export class AgentKeystore {
  private masterKey: Buffer;
  private tokenLifetime: number;
  private enableAuditLog: boolean;
  private auditLogPath: string;

  /** In-memory credential cache (ephemeral, cleared on restart) */
  private credentialCache: Map<AgentRole, AgentCredential> = new Map();

  /** Persistent encrypted storage (simulated with Map, replace with file/db in production) */
  private encryptedStorage: Map<AgentRole, EncryptedCredential> = new Map();

  /** Secondary index: JWK thumbprint → AgentRole, for fast PoP key lookup */
  private thumbprintIndex: Map<string, AgentRole> = new Map();

  /** Audit log buffer */
  private auditLog: AuditLogEntry[] = [];

  constructor(config: KeystoreConfig = {}) {
    // Generate or use provided master key
    this.masterKey = config.masterKey || crypto.randomBytes(KEY_LENGTH);

    this.tokenLifetime = config.tokenLifetime || DEFAULT_TOKEN_LIFETIME;
    this.enableAuditLog = config.enableAuditLog ?? true;
    this.auditLogPath = config.auditLogPath || './agent-keystore.audit.log';

    // Security warning if using default key
    if (!config.masterKey && process.env.NODE_ENV === 'production') {
      console.warn(
        '[KEYSTORE] Using generated master key. Set AGENT_KEYSTORE_MASTER_KEY environment variable in production.'
      );
    }
  }

  /**
   * Encrypt sensitive data using AES-256-GCM
   */
  private encrypt(plaintext: string): EncryptedCredential {
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);

    // Derive encryption key from master key + salt
    const key = crypto.pbkdf2Sync(this.masterKey, salt, 100000, KEY_LENGTH, 'sha256');

    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      salt: salt.toString('hex'),
      algorithm: ENCRYPTION_ALGORITHM,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.tokenLifetime).toISOString(),
    };
  }

  /**
   * Decrypt sensitive data
   */
  private decrypt(encrypted: EncryptedCredential): string {
    const iv = Buffer.from(encrypted.iv, 'hex');
    const salt = Buffer.from(encrypted.salt, 'hex');
    const authTag = Buffer.from(encrypted.authTag, 'hex');

    // Derive decryption key
    const key = crypto.pbkdf2Sync(this.masterKey, salt, 100000, KEY_LENGTH, 'sha256');

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  }

  /**
   * Log audit event
   */
  private logAudit(entry: AuditLogEntry): void {
    if (!this.enableAuditLog) return;

    this.auditLog.push(entry);

    // In production, write to persistent storage
    if (process.env.NODE_ENV === 'production') {
      console.info(`[AUDIT] ${entry.event} - ${entry.agentRole} - ${entry.timestamp}`);
    }
  }

  /**
   * Store agent credential securely
   */
  async storeCredential(credential: AgentCredential): Promise<void> {
    // Update thumbprint index: remove old entry if role already has a credential
    const existing = this.credentialCache.get(credential.role);
    if (existing) {
      this.thumbprintIndex.delete(existing.keyPair.thumbprint);
    }

    // Cache in memory
    this.credentialCache.set(credential.role, credential);
    this.thumbprintIndex.set(credential.keyPair.thumbprint, credential.role);

    // Encrypt and persist
    const serialized = JSON.stringify({
      role: credential.role,
      token: credential.token,
      keyPair: credential.keyPair,
      createdAt: credential.createdAt.toISOString(),
      expiresAt: credential.expiresAt.toISOString(),
    });

    const encrypted = this.encrypt(serialized);
    this.encryptedStorage.set(credential.role, encrypted);

    this.logAudit({
      timestamp: new Date().toISOString(),
      event: 'key_generated',
      agentRole: credential.role,
      details: {
        kid: credential.keyPair.kid,
        expiresAt: credential.expiresAt.toISOString(),
      },
    });
  }

  /**
   * Retrieve agent credential
   *
   * Returns cached credential if valid, otherwise decrypts from storage.
   * Automatically rotates if expired.
   */
  async getCredential(role: AgentRole): Promise<AgentCredential | null> {
    // Check cache first
    const cached = this.credentialCache.get(role);
    if (cached && cached.expiresAt > new Date()) {
      this.logAudit({
        timestamp: new Date().toISOString(),
        event: 'key_accessed',
        agentRole: role,
        details: { source: 'cache' },
      });
      return cached;
    }

    // Decrypt from storage
    const encrypted = this.encryptedStorage.get(role);
    if (!encrypted) {
      return null;
    }

    // Check expiration
    if (new Date(encrypted.expiresAt) < new Date()) {
      this.logAudit({
        timestamp: new Date().toISOString(),
        event: 'key_expired',
        agentRole: role,
      });

      // Auto-rotate expired credential
      await this.rotateCredential(role);
      return this.getCredential(role);
    }

    // Decrypt and parse
    const decrypted = this.decrypt(encrypted);
    const parseResult = safeJsonParse(decrypted, SerializedCredentialSchema);
    if (!parseResult.ok) {
      this.logAudit({
        timestamp: new Date().toISOString(),
        event: 'key_parse_failed',
        agentRole: role,
        details: {
          source: 'storage',
          error: parseResult.error.message,
          kind: parseResult.error.kind,
        },
      });
      return null;
    }
    const parsed = parseResult.value;

    const credential: AgentCredential = {
      role: parsed.role as AgentRole,
      token: parsed.token,
      keyPair: parsed.keyPair as AgentKeyPair,
      createdAt: new Date(parsed.createdAt),
      expiresAt: new Date(parsed.expiresAt),
    };

    // Update cache
    this.credentialCache.set(role, credential);

    this.logAudit({
      timestamp: new Date().toISOString(),
      event: 'key_accessed',
      agentRole: role,
      details: { source: 'storage' },
    });

    return credential;
  }

  /**
   * Rotate agent credential (generate new keys and token)
   */
  async rotateCredential(role: AgentRole): Promise<AgentCredential> {
    // Generate new key pair
    const keyPair = await generateAgentKeyPair(role);

    // Create new credential (token will be signed by orchestrator)
    const credential: AgentCredential = {
      role,
      token: '', // Placeholder, will be set by token issuer
      keyPair,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.tokenLifetime),
    };

    await this.storeCredential(credential);

    this.logAudit({
      timestamp: new Date().toISOString(),
      event: 'key_rotated',
      agentRole: role,
      details: {
        oldKid: this.credentialCache.get(role)?.keyPair.kid,
        newKid: keyPair.kid,
      },
    });

    return credential;
  }

  /**
   * Retrieve credential by JWK thumbprint (for PoP token verification).
   *
   * Returns the credential whose key pair matches the given JWK SHA-256
   * thumbprint, or null if no matching credential is found.
   *
   * Primary lookup uses the in-memory index; falls back to decrypting all
   * stored credentials when the index doesn't contain the thumbprint (e.g.
   * credentials stored before the index was introduced).
   */
  async getCredentialByThumbprint(thumbprint: string): Promise<AgentCredential | null> {
    // Fast path: use secondary thumbprint index
    const role = this.thumbprintIndex.get(thumbprint);
    if (role) {
      return this.getCredential(role);
    }

    // Slow path: scan all stored credentials to backfill index
    for (const [storedRole, encrypted] of this.encryptedStorage.entries()) {
      if (new Date(encrypted.expiresAt) < new Date()) {
        continue; // skip expired
      }
      const credential = await this.getCredential(storedRole); // decrypts + caches
      if (credential) {
        // getCredential already cached; also update thumbprint index
        this.thumbprintIndex.set(credential.keyPair.thumbprint, storedRole);
        if (credential.keyPair.thumbprint === thumbprint) {
          return credential;
        }
      }
    }

    return null;
  }

  /**
   * Delete agent credential
   */
  async deleteCredential(role: AgentRole): Promise<void> {
    // Remove associated thumbprint from index
    const credential = this.credentialCache.get(role);
    if (credential) {
      this.thumbprintIndex.delete(credential.keyPair.thumbprint);
    }
    this.credentialCache.delete(role);
    this.encryptedStorage.delete(role);

    this.logAudit({
      timestamp: new Date().toISOString(),
      event: 'key_deleted',
      agentRole: role,
    });
  }

  /**
   * List all stored credentials (metadata only)
   */
  listCredentials(): Array<{
    role: AgentRole;
    createdAt: string;
    expiresAt: string;
    isExpired: boolean;
  }> {
    return Array.from(this.encryptedStorage.entries()).map(([role, encrypted]) => ({
      role,
      createdAt: encrypted.createdAt,
      expiresAt: encrypted.expiresAt,
      isExpired: new Date(encrypted.expiresAt) < new Date(),
    }));
  }

  /**
   * Get audit log
   */
  getAuditLog(): AuditLogEntry[] {
    return [...this.auditLog];
  }

  /**
   * Clear all credentials (use with caution)
   */
  clearAll(): void {
    this.credentialCache.clear();
    this.encryptedStorage.clear();
    this.thumbprintIndex.clear();

    this.logAudit({
      timestamp: new Date().toISOString(),
      event: 'key_deleted',
      agentRole: AgentRole.ORCHESTRATOR,
      details: { action: 'clear_all' },
    });
  }
}

/**
 * Global keystore instance
 */
let globalKeystore: AgentKeystore | null = null;

/**
 * Get or create global keystore
 */
export function getKeystore(config?: KeystoreConfig): AgentKeystore {
  if (!globalKeystore) {
    // Load master key from environment in production
    const masterKeyHex = process.env.AGENT_KEYSTORE_MASTER_KEY;
    const masterKey = masterKeyHex ? Buffer.from(masterKeyHex, 'hex') : undefined;

    globalKeystore = new AgentKeystore({
      ...config,
      masterKey,
    });
  }
  return globalKeystore;
}

/**
 * Reset global keystore (for testing)
 */
export function resetKeystore(): void {
  globalKeystore = null;
}
