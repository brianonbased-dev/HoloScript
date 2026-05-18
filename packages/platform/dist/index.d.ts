import { z } from 'zod';
import { HSPlusNode } from '@holoscript/core-types/ast';
import { HoloComposition } from '@holoscript/core-types/composition';
import { PlatformTarget, EffectASTNode, SafetyReport, SafetyPassResult, SafetyVerdict } from '@holoscript/core';
export { ANSCapabilityPath, ANSCapabilityPathValue } from '@holoscript/core-types';
export { AdaptiveFrameRateManager, AdaptiveFrameRateManagerOptions, BudgetCategory, BudgetConfig, BudgetSnapshot, DEFAULT_BUDGET_CONFIG, DEFAULT_QUALITY_POLICY, DEFAULT_THRESHOLDS, FrameBudgetReport, FrameDeadlineEnforcer, FrameDeadlineEnforcerOptions, FrameSample, GaussianBudget, HololandRenderer, HololandRendererOptions, InferenceIsolationBarrier, InferenceIsolationBarrierOptions, InferenceMetrics, InferencePriority, InferencePriorityScheduler, InferencePrioritySchedulerOptions, InferenceResult, InferenceTask, LODPolicy, QualityManager, QualityPolicy, RenderFeature, RenderSafeInferenceReader, RenderSafeInferenceReaderOptions, ThermalState, ThermalThresholds, VRPerformanceBudget, VRPerformanceBudgetOptions } from './renderer.js';

/**
 * Security Utilities
 *
 * Production-grade cryptographic utilities using Web Crypto API.
 * Replaces placeholder security implementations with proper crypto.
 *
 * @version 3.3.0
 * @Sprint Sprint 3: Safety & Testing
 */
/**
 * Generate SHA-256 hash of data
 */
declare function sha256(data: string | ArrayBuffer): Promise<string>;
/**
 * Generate SHA-512 hash of data
 */
declare function sha512(data: string | ArrayBuffer): Promise<string>;
/**
 * Generate HMAC-SHA256 signature
 */
declare function hmacSha256(data: string, secret: string): Promise<string>;
/**
 * Verify HMAC-SHA256 signature
 */
declare function verifyHmacSha256(data: string, signature: string, secret: string): Promise<boolean>;
/**
 * Encrypt data using AES-GCM
 */
declare function encrypt(data: string, key: CryptoKey): Promise<{
    ciphertext: string;
    iv: string;
}>;
/**
 * Decrypt data using AES-GCM
 */
declare function decrypt(ciphertext: string, iv: string, key: CryptoKey): Promise<string>;
/**
 * Generate AES-256 key for encryption
 */
declare function generateEncryptionKey(): Promise<CryptoKey>;
/**
 * Export encryption key to base64
 */
declare function exportKey(key: CryptoKey): Promise<string>;
/**
 * Import encryption key from base64
 */
declare function importKey(base64Key: string): Promise<CryptoKey>;
/**
 * Generate cryptographically secure random bytes
 */
declare function randomBytes(length: number): Uint8Array;
/**
 * Generate cryptographically secure random hex string
 * @param length - Number of bytes to generate (resulting hex string will be length*2 chars)
 */
declare function randomHex(length: number): string;
/**
 * Generate cryptographically secure UUID v4
 */
declare function randomUUID(): string;
/**
 * Derive key from password using PBKDF2
 */
declare function deriveKey(password: string, salt: string | Uint8Array, iterations?: number): Promise<CryptoKey>;
/**
 * Validate wallet address format
 * @param address - The wallet address to validate
 * @param chain - The blockchain type ('ethereum' or 'solana')
 */
declare function validateWalletAddress(address: string, chain?: 'ethereum' | 'solana'): boolean;
/**
 * Validate API key format
 */
declare function validateApiKey(key: string): boolean;
/**
 * Sanitize user input to prevent XSS - strips all HTML tags and dangerous patterns
 */
declare function sanitizeInput(input: string): string;
/**
 * Validate and sanitize URL
 */
declare function validateUrl(url: string, allowedProtocols?: string[]): boolean;
/**
 * Check rate limit for a key
 */
declare function checkRateLimit(key: string, maxRequests: number, windowMs: number): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
};
/**
 * Reset rate limit for a key
 */
declare function resetRateLimit(key: string): void;
/**
 * Reset all rate limits
 */
declare function resetRateLimits(): void;

/**
 * Package Signer
 *
 * Ed25519 digital signature support for HoloScript packages.
 * Provides key generation, signing, verification, and manifest creation.
 *
 * Uses Node.js crypto module for ed25519 operations with fallback
 * for environments where it is not available.
 *
 * @version 9.0.0
 * @Sprint Sprint 9: Security Hardening
 */
/**
 * Ed25519 key pair for package signing.
 */
interface Ed25519KeyPair {
    /** Base64-encoded public key */
    publicKey: string;
    /** Base64-encoded private key */
    privateKey: string;
}
/**
 * A signed package manifest containing metadata and signature.
 */
interface SigningManifest {
    /** Package name */
    name: string;
    /** Semver version string */
    version: string;
    /** List of file paths included in the package */
    files: string[];
    /** SHA-256 hash of the canonical manifest content (hex) */
    contentHash: string;
    /** ISO 8601 timestamp of when the manifest was created */
    createdAt: string;
}
/**
 * A signed package: manifest plus its cryptographic signature.
 */
interface SignedPackage {
    /** The package manifest */
    manifest: SigningManifest;
    /** Base64-encoded ed25519 signature of the canonical manifest JSON */
    signature: string;
}
/**
 * Generate an ed25519 key pair for package signing.
 *
 * Uses Node.js crypto.generateKeyPairSync when available.
 * Returns keys as base64-encoded strings.
 *
 * @throws {Error} If ed25519 key generation is not available in the current environment
 */
declare function generateKeyPair(): Ed25519KeyPair;
/**
 * Sign content with an ed25519 private key.
 *
 * @param content - The string content to sign
 * @param privateKeyBase64 - Base64-encoded ed25519 private key (PKCS8 DER format)
 * @returns Base64-encoded signature
 * @throws {Error} If signing fails
 */
declare function signPackage(content: string, privateKeyBase64: string): string;
/**
 * Verify an ed25519 signature against content and public key.
 *
 * @param content - The original string content
 * @param signatureBase64 - Base64-encoded signature to verify
 * @param publicKeyBase64 - Base64-encoded ed25519 public key (SPKI DER format)
 * @returns true if the signature is valid, false otherwise
 */
declare function verifySignature(content: string, signatureBase64: string, publicKeyBase64: string): boolean;
/**
 * Create a package manifest for signing.
 *
 * The manifest includes a SHA-256 content hash of the canonical JSON
 * representation (sorted keys, no extra whitespace) to ensure integrity.
 *
 * @param name - Package name
 * @param version - Semver version string
 * @param files - List of file paths in the package
 * @returns Package manifest with content hash
 */
declare function createPackageManifest(name: string, version: string, files: string[]): Promise<SigningManifest>;
/**
 * Serialize a manifest to its canonical JSON string for signing.
 * Uses deterministic key ordering.
 */
declare function canonicalizeManifest(manifest: SigningManifest): string;

/**
 * Security Policy Definitions
 *
 * Defines sandbox, network, and code execution policies for HoloScript.
 * Provides factory functions for creating default, strict, and merged policies.
 *
 * @version 9.0.0
 * @Sprint Sprint 9: Security Hardening
 */
/**
 * File system access level for sandboxed execution.
 * - 'none': No file system access
 * - 'readonly': Read-only access to workspace files
 * - 'workspace': Read/write access limited to workspace directory
 */
type FileSystemAccess = 'none' | 'readonly' | 'workspace';
/**
 * Security policy governing sandbox, network, and code constraints.
 */
interface SecurityPolicy {
    sandbox: {
        /** Whether sandboxing is enabled */
        enabled: boolean;
        /** Memory limit in megabytes */
        memoryLimit: number;
        /** CPU time limit in seconds */
        cpuTimeLimit: number;
        /** Allowed system calls */
        syscallAllowlist: string[];
        /** File system access level */
        fileSystemAccess: FileSystemAccess;
    };
    network: {
        /** Hosts allowed for outbound connections */
        allowedHosts: string[];
        /** Maximum concurrent connections */
        maxConnections: number;
        /** Maximum requests per second */
        rateLimitPerSecond: number;
    };
    code: {
        /** Maximum number of objects in a composition */
        maxObjectCount: number;
        /** Maximum nesting depth for trait inheritance */
        maxTraitDepth: number;
        /** Traits that are not permitted in compositions */
        disallowedTraits: string[];
        /** Whether packages must be cryptographically signed */
        requireSignedPackages: boolean;
    };
}
/**
 * Create a default security policy with reasonable limits.
 * Suitable for development and trusted environments.
 */
declare function createDefaultPolicy(): SecurityPolicy;
/**
 * Create a strict security policy for untrusted code execution.
 * Locks down network, file system, and resource limits.
 */
declare function createStrictPolicy(): SecurityPolicy;
/**
 * Deep-merge a base policy with partial overrides.
 * Override values take precedence over base values.
 * Arrays in overrides fully replace base arrays (no merging).
 */
declare function mergePolicy(base: SecurityPolicy, overrides: DeepPartial<SecurityPolicy>): SecurityPolicy;
/**
 * Recursive partial type for deep overrides.
 */
type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends Array<any> ? T[P] : T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Sandbox Executor
 *
 * Provides a sandboxed execution environment for HoloScript code.
 * Enforces memory limits, CPU time limits, and file system restrictions
 * as defined by a SecurityPolicy.
 *
 * @version 9.0.0
 * @Sprint Sprint 9: Security Hardening
 */

/**
 * Current state of a sandbox.
 */
type SandboxState = 'idle' | 'running' | 'timeout' | 'error' | 'destroyed';
/**
 * Sandbox execution environment with resource tracking.
 */
interface Sandbox {
    /** Unique identifier for this sandbox instance */
    id: string;
    /** Current state of the sandbox */
    state: SandboxState;
    /** The security policy governing this sandbox */
    policy: SecurityPolicy;
    /** Memory usage tracking in bytes */
    memoryUsed: number;
    /** CPU time consumed in milliseconds */
    cpuTimeUsed: number;
    /** When the sandbox was created */
    createdAt: number;
    /** Internal timeout handle (for cleanup) */
    _timeoutHandle?: ReturnType<typeof setTimeout>;
    /** Internal execution context */
    _context: Map<string, unknown>;
}
/**
 * Result of sandbox code execution.
 */
interface SandboxExecutionResult {
    /** Whether execution completed successfully */
    success: boolean;
    /** Return value from execution (if any) */
    result?: unknown;
    /** Error message if execution failed */
    error?: string;
    /** Memory used during execution in bytes */
    memoryUsed: number;
    /** CPU time consumed in milliseconds */
    cpuTimeUsed: number;
}
/**
 * Create a new sandbox execution environment governed by the given policy.
 *
 * The sandbox enforces:
 * - Memory limits (tracked via estimation)
 * - CPU time limits (enforced via setTimeout)
 * - File system access restrictions
 *
 * @param policy - Security policy to enforce
 * @returns A new Sandbox instance in 'idle' state
 */
declare function createSandbox(policy: SecurityPolicy): Sandbox;
/**
 * Execute code within a sandbox, enforcing time and memory limits.
 *
 * The executor:
 * 1. Validates the sandbox is in a valid state
 * 2. Sets a CPU time limit via setTimeout
 * 3. Runs the code in a restricted scope
 * 4. Tracks memory usage (estimated from code size)
 * 5. Returns execution results
 *
 * @param code - The code string to execute
 * @param sandbox - The sandbox environment to use
 * @returns Execution result with timing and memory data
 */
declare function execute(code: string, sandbox: Sandbox): Promise<SandboxExecutionResult>;
/**
 * Destroy a sandbox, releasing all resources.
 *
 * After destruction, the sandbox cannot be reused.
 */
declare function destroy(sandbox: Sandbox): void;

/**
 * Security Enforcer
 *
 * Validates HoloScript compositions and source code against security policies.
 * Performs static analysis for vulnerability patterns and policy violations.
 *
 * @version 9.0.0
 * @Sprint Sprint 9: Security Hardening
 */

/**
 * Severity level for security violations.
 */
type ViolationSeverity = 'error' | 'warning' | 'info';
/**
 * Category of security violation.
 */
type ViolationCategory = 'object_count' | 'trait_depth' | 'disallowed_trait' | 'network_access' | 'code_injection' | 'dangerous_api' | 'script_injection' | 'prototype_pollution';
/**
 * A single security violation found during scanning.
 */
interface SecurityViolation {
    /** Machine-readable violation category */
    category: ViolationCategory;
    /** Severity level */
    severity: ViolationSeverity;
    /** Human-readable description */
    message: string;
    /** Line number where the violation was found (1-based), if applicable */
    line?: number;
    /** Column number where the violation was found (1-based), if applicable */
    column?: number;
}
/**
 * Result of a security scan or validation.
 */
interface SecurityScanResult {
    /** Whether all checks passed with no errors */
    passed: boolean;
    /** List of violations found */
    violations: SecurityViolation[];
}
/**
 * Minimal AST node interface for composition validation.
 * Compatible with HoloScript parser output.
 */
interface ASTNode {
    type: string;
    name?: string;
    traits?: string[];
    children?: ASTNode[];
    [key: string]: unknown;
}
/**
 * Import declaration for network validation.
 */
interface ImportDeclaration {
    /** The source module or URL */
    source: string;
    /** Named imports */
    specifiers?: string[];
}
/**
 * Validate an AST composition against a security policy.
 *
 * Checks:
 * - Maximum object count
 * - Maximum trait nesting depth
 * - Disallowed traits
 */
declare function validateComposition(ast: ASTNode | ASTNode[], policy: SecurityPolicy): SecurityScanResult;
/**
 * Validate import declarations against network policy.
 *
 * Checks that URL-based imports only reference allowed hosts.
 */
declare function validateImports(imports: ImportDeclaration[], policy: SecurityPolicy): SecurityScanResult;
/**
 * Scan source code for common vulnerability patterns.
 *
 * Performs regex-based static analysis to detect:
 * - eval() and new Function() usage
 * - innerHTML/document.write XSS vectors
 * - Script tag injection
 * - Prototype pollution patterns
 * - Dangerous API usage (child_process, exec)
 */
declare function scanForVulnerabilities(code: string): SecurityScanResult;

/**
 * @holoscript/core Security Framework
 *
 * Production-grade cryptographic and authorization utilities
 *
 * @version 3.1
 * @Sprint v3.1 Security Hardening
 */

/**
 * Hash a token using PBKDF2 + SHA256
 * Production-grade alternative to simple hashing
 */
declare function secureHashToken(token: string, salt?: Buffer, iterations?: number): {
    hash: string;
    salt: string;
};
/**
 * Verify a token against its hash
 */
declare function verifyToken(token: string, storedHash: string, storedSalt: string, iterations?: number): boolean;
/**
 * Generate random token
 */
declare function generateRandomToken(length?: number): string;
/**
 * Encrypt data using AES-256-GCM
 */
declare function encryptData(data: string, encryptionKey: string): {
    encrypted: string;
    iv: string;
    authTag: string;
};
/**
 * Decrypt data encrypted with encryptData
 */
declare function decryptData(encrypted: string, encryptionKey: string, iv: string, authTag: string): string;
/**
 * Scene validation schema
 */
declare const SceneSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    owner: z.ZodString;
    visibility: z.ZodDefault<z.ZodEnum<{
        public: "public";
        private: "private";
        shared: "shared";
    }>>;
    objects: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<{
            custom: "custom";
            cube: "cube";
            sphere: "sphere";
            cylinder: "cylinder";
            cone: "cone";
        }>;
        position: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
        rotation: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
        scale: z.ZodDefault<z.ZodNumber>;
        properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>>>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    createdAt: z.ZodOptional<z.ZodDate>;
    updatedAt: z.ZodOptional<z.ZodDate>;
}, z.core.$strip>;
type Scene = z.infer<typeof SceneSchema>;
/**
 * User validation schema
 */
declare const UserSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    username: z.ZodString;
    passwordHash: z.ZodString;
    passwordSalt: z.ZodString;
    role: z.ZodDefault<z.ZodEnum<{
        user: "user";
        admin: "admin";
        moderator: "moderator";
    }>>;
    permissions: z.ZodOptional<z.ZodArray<z.ZodString>>;
    createdAt: z.ZodOptional<z.ZodDate>;
    updatedAt: z.ZodOptional<z.ZodDate>;
    lastLogin: z.ZodOptional<z.ZodDate>;
}, z.core.$strip>;
type User = z.infer<typeof UserSchema>;
/**
 * API request validation
 */
declare const APIRequestSchema: z.ZodObject<{
    method: z.ZodEnum<{
        GET: "GET";
        POST: "POST";
        PUT: "PUT";
        DELETE: "DELETE";
        PATCH: "PATCH";
    }>;
    path: z.ZodString;
    headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    body: z.ZodOptional<z.ZodUnknown>;
    timestamp: z.ZodNumber;
    signature: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type APIRequest = z.infer<typeof APIRequestSchema>;
/**
 * Validate and parse input safely
 */
declare function validateInput<T>(schema: z.ZodSchema, input: unknown): T;
interface TokenBucketConfig {
    capacity: number;
    refillRate: number;
    windowMs: number;
}
/**
 * Token bucket rate limiter
 */
declare class RateLimiter {
    private buckets;
    private config;
    constructor(config?: Partial<TokenBucketConfig>);
    /**
     * Check if request is allowed
     */
    isAllowed(key: string, tokensNeeded?: number): boolean;
    /**
     * Get remaining tokens
     */
    getRemainingTokens(key: string): number;
    /**
     * Reset bucket for a key
     */
    reset(key: string): void;
    /**
     * Clear all buckets (on shutdown)
     */
    clearAll(): void;
}
/**
 * Permission levels
 */
declare enum Permission {
    CREATE_SCENE = "create_scene",
    EDIT_SCENE = "edit_scene",
    DELETE_SCENE = "delete_scene",
    VIEW_SCENE = "view_scene",
    SHARE_SCENE = "share_scene",
    CREATE_USER = "create_user",
    EDIT_USER = "edit_user",
    DELETE_USER = "delete_user",
    VIEW_USER = "view_user",
    MANAGE_PERMISSIONS = "manage_permissions",
    VIEW_LOGS = "view_logs",
    MANAGE_SYSTEM = "manage_system",
    ADMIN_ALL = "admin_all"
}
/**
 * Role definitions with permissions
 */
declare const ROLES: Record<string, Permission[]>;
/**
 * Check if user has permission
 */
declare function hasPermission(userRole: string, permission: Permission | string): boolean;
/**
 * Check if role can manage workspace members
 */
declare function canManageMembers(role: string): boolean;
/**
 * Check if role can publish packages
 */
declare function canPublishPackages(role: string): boolean;
/**
 * Check multiple permissions (AND logic)
 */
declare function hasAllPermissions(userRole: string, permissions: Permission[]): boolean;
/**
 * Check multiple permissions (OR logic)
 */
declare function hasAnyPermission(userRole: string, permissions: Permission[]): boolean;
interface AuditEntry {
    id: string;
    timestamp: number;
    userId: string;
    action: string;
    resource: string;
    resourceId: string;
    changes?: Record<string, unknown>;
    result: 'success' | 'failure';
    reason?: string;
    ipAddress?: string;
}
/**
 * Audit logger
 */
declare class AuditLogger {
    private entries;
    private maxEntries;
    /**
     * Log an action
     */
    log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry;
    /**
     * Query audit log
     */
    query(filters: {
        userId?: string;
        action?: string;
        resource?: string;
        startTime?: number;
        endTime?: number;
    }): AuditEntry[];
    /**
     * Get recent entries
     */
    getRecent(count?: number): AuditEntry[];
    /**
     * Export to JSON
     */
    export(): string;
    /**
     * Clear all entries
     */
    clear(): void;
}
/**
 * Global audit logger instance
 */
declare const auditLogger: AuditLogger;
/**
 * Generate secure random number between min and max
 */
declare function secureRandom(min: number, max: number): number;
/**
 * Validate API signature
 */
declare function validateSignature(payload: string, signature: string, secret: string): boolean;
/**
 * Generate API signature
 */
declare function generateSignature(payload: string, secret: string): string;

/**
 * HoloScript Package Certification System
 *
 * Automated verification program for high-quality packages.
 * Certified packages receive a badge and are featured in the registry.
 */
/**
 * Certification check categories
 */
type CheckCategory = 'code_quality' | 'documentation' | 'security' | 'maintenance';
/**
 * Check result status
 */
type CheckStatus = 'passed' | 'failed' | 'warning' | 'skipped';
/**
 * Individual check result
 */
interface CheckResult {
    id: string;
    name: string;
    category: CheckCategory;
    status: CheckStatus;
    message: string;
    details?: Record<string, unknown>;
    required: boolean;
}
/**
 * Overall certification result
 */
interface CertificationResult {
    packageName: string;
    packageVersion: string;
    timestamp: string;
    certified: boolean;
    score: number;
    maxScore: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    checks: CheckResult[];
    summary: {
        passed: number;
        failed: number;
        warnings: number;
        skipped: number;
    };
    expiresAt?: string;
    certificateId?: string;
}
/**
 * Package manifest for certification
 */
interface CertificationManifest {
    name: string;
    version: string;
    description?: string;
    author?: string | {
        name: string;
        email?: string;
    };
    license?: string;
    repository?: string | {
        url: string;
    };
    readme?: string;
    changelog?: string;
    keywords?: string[];
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    holoscript?: {
        traits?: string[];
        minVersion?: string;
    };
}
interface Package {
    name: string;
    version: string;
    author?: string;
    downloads?: number;
    tags?: string[];
    createdAt?: Date;
    updatedAt?: Date;
}
interface LegacyCertificationIssue {
    severity: 'error' | 'warning' | 'info';
    category: string;
    check: string;
    message: string;
}
interface LegacyCertificationCategory {
    name: 'codeQuality' | 'documentation' | 'security' | 'maintenance';
    score: number;
    maxScore: number;
}
interface LegacyCertificationResult {
    certified: boolean;
    level?: 'bronze' | 'silver' | 'gold' | 'platinum';
    score: number;
    maxScore: number;
    categories: LegacyCertificationCategory[];
    issues: LegacyCertificationIssue[];
    certifiedAt?: Date;
    expiresAt?: Date;
}
interface CertificationBadge {
    packageName: string;
    version: string;
    level: 'bronze' | 'silver' | 'gold' | 'platinum';
    score: number;
    issuedAt: string;
    expiresAt: string;
    fingerprint: string;
    signature: string;
}
declare const CERTIFICATION_LEVELS: {
    readonly bronze: {
        readonly minScore: 60;
        readonly requiredCategories: readonly ["codeQuality", "documentation"];
        readonly weights: {
            readonly codeQuality: 1;
            readonly documentation: 1;
            readonly security: 0.8;
            readonly maintenance: 0.8;
        };
    };
    readonly silver: {
        readonly minScore: 75;
        readonly requiredCategories: readonly ["codeQuality", "documentation", "security"];
        readonly weights: {
            readonly codeQuality: 1.05;
            readonly documentation: 1;
            readonly security: 1;
            readonly maintenance: 0.9;
        };
    };
    readonly gold: {
        readonly minScore: 85;
        readonly requiredCategories: readonly ["codeQuality", "documentation", "security", "maintenance"];
        readonly weights: {
            readonly codeQuality: 1.1;
            readonly documentation: 1;
            readonly security: 1.1;
            readonly maintenance: 1;
        };
    };
    readonly platinum: {
        readonly minScore: 95;
        readonly requiredCategories: readonly ["codeQuality", "documentation", "security", "maintenance"];
        readonly weights: {
            readonly codeQuality: 1.2;
            readonly documentation: 1.1;
            readonly security: 1.2;
            readonly maintenance: 1.1;
        };
    };
};
/**
 * Package files for analysis
 */
interface PackageFiles {
    manifest: CertificationManifest;
    readme?: string;
    changelog?: string;
    license?: string;
    sourceFiles: Array<{
        path: string;
        content: string;
    }>;
    testFiles: Array<{
        path: string;
        content: string;
    }>;
}
/**
 * Certification configuration
 */
interface CertificationConfig {
    requiredCoverage: number;
    maxComplexity: number;
    requireChangelog: boolean;
    requireLicense: boolean;
    allowedLicenses: string[];
    securityAuditRequired: boolean;
}
/**
 * Default certification configuration
 */
declare const DEFAULT_CERTIFICATION_CONFIG: CertificationConfig;
/**
 * Certification Checker for HoloScript packages
 */
declare class CertificationChecker {
    private config;
    private legacyPkg?;
    private legacyFiles?;
    constructor(config?: Partial<CertificationConfig>);
    constructor(pkg: Package, files: Map<string, string>);
    /**
     * Backward-compatible API expected by certification-levels tests.
     */
    check(): Promise<LegacyCertificationResult>;
    /**
     * Run all certification checks on a package
     */
    certify(files: PackageFiles): Promise<CertificationResult>;
    /**
     * Code quality checks
     */
    private checkCodeQuality;
    /**
     * Documentation checks
     */
    private checkDocumentation;
    /**
     * Security checks
     */
    private checkSecurity;
    /**
     * Maintenance checks
     */
    private checkMaintenance;
    private checkTyped;
    private checkLinting;
    private checkComplexity;
    private checkTestCoverage;
    private checkNoConsoleLogs;
    private checkReadme;
    private checkReadmeExamples;
    private checkChangelog;
    private checkLicense;
    private checkDescription;
    private checkVulnerabilities;
    private checkNetworkCalls;
    private checkDependencyTree;
    private checkDangerousPatterns;
    private checkSemver;
    private checkRepository;
    private checkAuthor;
    private calculateSummary;
    private calculateScore;
    private isCertified;
    private generateCertificateId;
    private simpleHash;
    private calculateExpiryDate;
    private toPackageFiles;
    private toLegacyResult;
}
/**
 * Create a certification checker instance
 */
declare function createCertificationChecker(config?: Partial<CertificationConfig>): CertificationChecker;
/**
 * Backward-compatible helper expected by certification-levels tests.
 */
declare function generateBadge(result: LegacyCertificationResult, packageName: string, version: string): CertificationBadge | null;

/**
 * HoloScript Certification Badge System
 *
 * Generates and validates certification badges for packages.
 */

/**
 * Badge display format
 */
type BadgeFormat = 'text' | 'markdown' | 'html' | 'svg' | 'json';
/**
 * Badge style
 */
type BadgeStyle = 'flat' | 'flat-square' | 'plastic' | 'for-the-badge';
/**
 * Badge options
 */
interface BadgeOptions {
    format: BadgeFormat;
    style?: BadgeStyle;
    includeExpiry?: boolean;
    includeGrade?: boolean;
}
/**
 * Certificate data stored in registry
 */
interface Certificate {
    id: string;
    packageName: string;
    packageVersion: string;
    issuedAt: string;
    expiresAt: string;
    grade: 'A' | 'B';
    score: number;
    issuer: string;
    signature?: string;
}
declare class BadgeGenerator {
    private readonly baseUrl;
    /**
     * Generate a badge for a certification result
     */
    generateBadge(result: CertificationResult, options: BadgeOptions): string;
    /**
     * Generate a badge URL for shields.io style badges
     */
    generateBadgeUrl(packageName: string, options?: {
        style?: BadgeStyle;
    }): string;
    /**
     * Verify a certificate is valid
     */
    verifyCertificate(certificate: Certificate): {
        valid: boolean;
        reason?: string;
    };
    /**
     * Compute HMAC-SHA256 signature for a certificate.
     */
    signCertificate(certificate: Certificate): string;
    /**
     * Verify a certificate's HMAC-SHA256 signature.
     */
    private verifySignature;
    /**
     * Create a certificate from certification result
     */
    createCertificate(result: CertificationResult): Certificate | null;
    private generateTextBadge;
    private generateMarkdownBadge;
    private generateHtmlBadge;
    private generateSvgBadge;
    private generateJsonBadge;
    private generateNotCertifiedBadge;
    private padRight;
    private formatDate;
    private escapeHtml;
    private calculateExpiry;
}
/**
 * Create a badge generator instance
 */
declare function createBadgeGenerator(): BadgeGenerator;
/**
 * Default badge generator instance
 */
declare const defaultBadgeGenerator: BadgeGenerator;
declare function issueBadge(packageName: string, version: string, result: LegacyCertificationResult): CertificationBadge | null;
declare function verifyBadge(badge: CertificationBadge): {
    valid: boolean;
    reason?: string;
    badge?: CertificationBadge;
};
declare function generateBadgeSVG(badge: CertificationBadge): string;
declare function generateMarkdownBadge(badge: CertificationBadge): string;
declare function storeBadge(badge: CertificationBadge): void;
declare function getBadge(packageName: string, version: string): CertificationBadge | undefined;
declare function listBadges(): CertificationBadge[];
declare function revokeBadge(packageName: string, version: string): boolean;
declare function isActivelyCertified(packageName: string, version: string): boolean;

/**
 * LocalRegistry and PackageResolver
 *
 * In-process package registry for testing, local development, and composing
 * multi-package scenes without a remote registry.
 */
interface LocalPackageInput {
    name: string;
    version: string;
    description?: string;
    author?: string;
    tags?: string[];
    content?: string;
}
interface LocalVersionEntry {
    version: string;
    description?: string;
    content?: string;
    checksum: string;
    publishedAt: string;
}
interface LocalPackageManifest {
    name: string;
    description?: string;
    author?: string;
    tags?: string[];
    latest: string;
    downloads: number;
    versions: LocalVersionEntry[];
}
/**
 * In-memory package registry.  Supports publish, search, list, clear.
 */
declare class LocalRegistry {
    private readonly _packages;
    /** Number of packages registered */
    get size(): number;
    private checksum;
    /**
     * Publish a package version.
     * Re-publishing the same name+version throws.
     */
    publish(pkg: LocalPackageInput): LocalPackageManifest;
    /**
     * Retrieve the manifest for a named package (or undefined).
     */
    getPackage(name: string): LocalPackageManifest | undefined;
    /**
     * Retrieve a specific version entry (or undefined).
     */
    getVersion(name: string, version: string): LocalVersionEntry | undefined;
    /**
     * Case-insensitive substring search across name, description, and tags.
     */
    search(query: string): LocalPackageManifest[];
    /**
     * Return all registered packages, optionally filtered by tag.
     */
    list(tag?: string): LocalPackageManifest[];
    /** Increment package download count. */
    recordDownload(name: string): void;
    /** Remove an entire package. */
    unpublish(name: string): boolean;
    /** Remove one version from a package. */
    unpublishVersion(name: string, version: string): boolean;
    /**
     * Remove all packages.
     */
    clear(): void;
}
/**
 * Resolve SemVer ranges against a LocalRegistry.
 *
 * Supported range syntax: exact version, `*`, `^major.minor.patch`, `~major.minor.patch`
 */
declare class PackageResolver {
    private readonly registry;
    constructor(registry: LocalRegistry);
    /**
     * Returns true when `version` satisfies `range`.
     *
     * - `*`         → any version
     * - `1.2.3`     → exact match
     * - `^1.2.3`    → same major, >= minor+patch
     * - `~1.2.3`    → same major+minor, >= patch
     */
    satisfies(version: string, range: string): boolean;
    /**
     * Resolve the best (latest matching) version for a package.
     * Returns null when no match.
     */
    resolve(name: string, range: string): LocalVersionEntry | null;
    /**
     * All version entries that satisfy `range` for the named package.
     */
    getMatchingVersions(name: string, range: string): LocalVersionEntry[];
}

/**
 * Package Registry
 *
 * Sprint 5 Priority 5: Package Registry MVP
 * Sprint 6 Priority 2: Private Packages & Access Control
 *
 * Provides package management for HoloScript:
 * - Package manifest (package.holo.json)
 * - Registry client for browsing/searching
 * - Dependency resolution
 * - Version management (semver)
 * - Organization-scoped private packages
 * - Access control (read/write/admin permissions)
 * - Token-based authentication
 *
 * @version 2.0.0
 */
/**
 * Semantic version
 */
interface SemVer {
    major: number;
    minor: number;
    patch: number;
    prerelease?: string;
    build?: string;
}
/**
 * Package dependency
 */
interface PackageDependency {
    name: string;
    version: string;
    optional?: boolean;
    dev?: boolean;
}
/**
 * Package manifest (package.holo.json)
 */
interface PackageManifest {
    /** Package name (scoped: @scope/name or unscoped) */
    name: string;
    /** Semantic version */
    version: string;
    /** Short description */
    description?: string;
    /** Package keywords for search */
    keywords?: string[];
    /** Author information */
    author?: string | {
        name: string;
        email?: string;
        url?: string;
    };
    /** License identifier (SPDX) */
    license?: string;
    /** Repository URL */
    repository?: string | {
        type: string;
        url: string;
    };
    /** Homepage URL */
    homepage?: string;
    /** Bug tracker URL */
    bugs?: string | {
        url?: string;
        email?: string;
    };
    /** Main entry point */
    main?: string;
    /** Export map */
    exports?: Record<string, string>;
    /** Dependencies */
    dependencies?: Record<string, string>;
    /** Dev dependencies */
    devDependencies?: Record<string, string>;
    /** Peer dependencies */
    peerDependencies?: Record<string, string>;
    /** HoloScript engine version requirement */
    engines?: {
        holoscript?: string;
        node?: string;
    };
    /** Package type */
    type?: 'library' | 'application' | 'template' | 'trait-pack';
    /** Trait definitions this package provides */
    traits?: string[];
    /** Template definitions this package provides */
    templates?: string[];
    /** Custom metadata */
    holoscript?: {
        minVersion?: string;
        maxVersion?: string;
        platforms?: ('web' | 'vr' | 'ar' | 'mobile')[];
    };
}
/**
 * Package metadata from registry
 */
interface PackageMetadata$1 extends PackageManifest {
    /** Creation timestamp */
    created: string;
    /** Last modified timestamp */
    modified: string;
    /** All published versions */
    versions: string[];
    /** Download count */
    downloads?: number;
    /** Stars/likes count */
    stars?: number;
    /** Maintainers */
    maintainers?: Array<{
        name: string;
        email?: string;
    }>;
    /** Dist tags (latest, next, etc.) */
    distTags?: Record<string, string>;
    /** Package visibility (public/private) */
    visibility?: PackageVisibility;
    /** Access control list */
    access?: PackageAccess[];
    /** Owner organization for scoped packages */
    organization?: string;
}
/**
 * Search result item
 */
interface SearchResult {
    name: string;
    version: string;
    description?: string;
    keywords?: string[];
    author?: string;
    modified: string;
    downloads?: number;
    score?: number;
}
/**
 * Permission level for package access
 */
type PackagePermission = 'read' | 'write' | 'admin';
/**
 * Organization membership role
 */
type OrgRole = 'owner' | 'admin' | 'member';
/**
 * Package visibility
 */
type PackageVisibility = 'public' | 'private';
/**
 * Organization definition
 */
interface Organization {
    /** Organization name (without @) */
    name: string;
    /** Display name */
    displayName?: string;
    /** Creation timestamp */
    created: string;
    /** Organization members */
    members: Array<{
        userId: string;
        role: OrgRole;
    }>;
}
/**
 * Access control entry for a package
 */
interface PackageAccess {
    /** User or organization ID */
    principalId: string;
    /** Whether this is a user or org */
    principalType: 'user' | 'org';
    /** Permission level */
    permission: PackagePermission;
}
/**
 * Authentication token
 */
interface AuthToken {
    /** Token ID */
    id: string;
    /** Hashed token value */
    tokenHash: string;
    /** User who owns this token */
    userId: string;
    /** Token name/label */
    name: string;
    /** Read-only token */
    readonly: boolean;
    /** Scopes this token can access */
    scopes?: string[];
    /** Creation timestamp */
    created: string;
    /** Expiration timestamp */
    expires?: string;
    /** Last used timestamp */
    lastUsed?: string;
}
/**
 * Resolved dependency tree node
 */
interface ResolvedDependency {
    name: string;
    version: string;
    resolved: string;
    dependencies: ResolvedDependency[];
    dev: boolean;
    optional: boolean;
}
/**
 * Installation result
 */
interface InstallResult {
    installed: Array<{
        name: string;
        version: string;
    }>;
    updated: Array<{
        name: string;
        from: string;
        to: string;
    }>;
    removed: string[];
    warnings: string[];
    errors: string[];
}
/**
 * Parse semver string
 */
declare function parseSemVer(version: string): SemVer | null;
/**
 * Format semver to string
 */
declare function formatSemVer(ver: SemVer): string;
/**
 * Compare two semver versions
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
declare function compareSemVer(a: SemVer, b: SemVer): number;
/**
 * Check if version satisfies range
 */
declare function satisfiesRange(version: string, range: string): boolean;
/**
 * Find best matching version from available versions
 */
declare function findBestMatch(versions: string[], range: string): string | null;
/**
 * Validate package name
 */
declare function validatePackageName(name: string): {
    valid: boolean;
    error?: string;
};
/**
 * Validate package manifest
 */
declare function validateManifest(manifest: Partial<PackageManifest>): {
    valid: boolean;
    errors: string[];
};
/**
 * Package Registry Client (MVP - in-memory storage)
 */
declare class PackageRegistry {
    private baseUrl;
    private packages;
    private packageVersions;
    constructor(baseUrl?: string);
    /**
     * Publish a package
     */
    publish(manifest: PackageManifest): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Get package metadata
     */
    getPackage(name: string): Promise<PackageMetadata$1 | null>;
    /**
     * Get specific version
     */
    getVersion(name: string, version: string): Promise<PackageManifest | null>;
    /**
     * Search packages
     */
    search(query: string, options?: {
        limit?: number;
    }): Promise<SearchResult[]>;
    /**
     * List all packages
     */
    list(options?: {
        limit?: number;
        offset?: number;
    }): Promise<SearchResult[]>;
    /**
     * Resolve dependencies for a package
     */
    resolveDependencies(dependencies: Record<string, string>, _options?: {
        includeDev?: boolean;
    }): Promise<ResolvedDependency[]>;
    /**
     * Create a new package manifest
     */
    createManifest(name: string, version?: string): PackageManifest;
    /**
     * Increment version
     */
    incrementVersion(version: string, type: 'major' | 'minor' | 'patch'): string;
    /**
     * Get count of registered packages
     */
    getPackageCount(): number;
    /**
     * Clear all packages (for testing)
     */
    clear(): void;
    private organizations;
    private tokens;
    /**
     * Create an organization
     */
    createOrganization(name: string, ownerId: string, displayName?: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Get an organization
     */
    getOrganization(name: string): Promise<Organization | null>;
    /**
     * Add member to organization
     */
    addOrgMember(orgName: string, userId: string, role: OrgRole, requesterId: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Remove member from organization
     */
    removeOrgMember(orgName: string, userId: string, requesterId: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Grant access to a package
     */
    grantAccess(packageName: string, principalId: string, principalType: 'user' | 'org', permission: PackagePermission, requesterId: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Revoke access to a package
     */
    revokeAccess(packageName: string, principalId: string, requesterId: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * List access for a package
     */
    listAccess(packageName: string): Promise<PackageAccess[]>;
    /**
     * Check if user has permission on package
     */
    hasPermission(pkg: PackageMetadata$1, userId: string, requiredPermission: PackagePermission): boolean;
    /**
     * Check if granted permission satisfies required permission
     */
    private permissionSatisfies;
    /**
     * Set package visibility
     */
    setVisibility(packageName: string, visibility: PackageVisibility, requesterId: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Create an authentication token
     */
    createToken(userId: string, name: string, options?: {
        readonly?: boolean;
        scopes?: string[];
        expiresInDays?: number;
    }): Promise<{
        success: boolean;
        token?: string;
        tokenId?: string;
        error?: string;
    }>;
    /**
     * Revoke a token
     */
    revokeToken(tokenId: string, userId: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Validate a token
     */
    validateToken(tokenValue: string): Promise<{
        valid: boolean;
        userId?: string;
        readonly?: boolean;
        scopes?: string[];
    }>;
    /**
     * List user's tokens
     */
    listTokens(userId: string): Promise<Array<Omit<AuthToken, 'tokenHash'>>>;
    /**
     * Generate a random token value
     */
    private generateTokenValue;
    /**
     * Generate a token ID
     */
    private generateTokenId;
    /**
     * Simple hash function for tokens (in production, use crypto)
     */
    private hashToken;
}
/**
 * Create a new package registry client
 */
declare function createPackageRegistry(baseUrl?: string): PackageRegistry;
/**
 * Global default registry instance
 */
declare const defaultRegistry: PackageRegistry;

/**
 * HoloScript Team Workspaces
 *
 * Collaborative workspaces for teams with shared configurations,
 * role-based access control, secrets management, and activity feeds.
 */
/**
 * Workspace member roles
 */
type WorkspaceRole = 'owner' | 'admin' | 'developer' | 'viewer';
/**
 * Role permissions
 */
declare const ROLE_PERMISSIONS: Record<WorkspaceRole, string[]>;
/**
 * Workspace member
 */
interface WorkspaceMember {
    userId: string;
    username: string;
    email?: string;
    role: WorkspaceRole;
    joinedAt: string;
    invitedBy?: string;
}
/**
 * Workspace settings
 */
interface WorkspaceSettings {
    formatter?: {
        tabWidth?: number;
        useTabs?: boolean;
        printWidth?: number;
    };
    linter?: {
        rules?: Record<string, 'off' | 'warn' | 'error'>;
    };
    compiler?: {
        target?: string;
        strictMode?: boolean;
    };
    packages?: Record<string, string>;
}
/**
 * Activity types
 */
type ActivityType = 'workspace:created' | 'workspace:updated' | 'member:joined' | 'member:left' | 'member:role_changed' | 'package:published' | 'settings:updated' | 'secret:added' | 'secret:removed';
/**
 * Activity entry
 */
interface ActivityEntry {
    id: string;
    type: ActivityType;
    actor: string;
    timestamp: string;
    details: Record<string, unknown>;
}
/**
 * Encrypted secret
 */
interface WorkspaceSecret {
    name: string;
    encryptedValue: string;
    createdAt: string;
    createdBy: string;
    updatedAt?: string;
}
/**
 * Workspace definition
 */
interface Workspace {
    id: string;
    name: string;
    displayName: string;
    description?: string;
    ownerId: string;
    members: WorkspaceMember[];
    settings: WorkspaceSettings;
    secrets: WorkspaceSecret[];
    activity: ActivityEntry[];
    createdAt: string;
    updatedAt: string;
}
/**
 * Create workspace options
 */
interface CreateWorkspaceOptions {
    name: string;
    displayName?: string;
    description?: string;
    settings?: WorkspaceSettings;
}
/**
 * Workspace Manager for team collaboration
 */
declare class WorkspaceManager {
    private workspaces;
    private userWorkspaces;
    /**
     * Create a new workspace
     */
    createWorkspace(ownerId: string, options: CreateWorkspaceOptions): Workspace;
    /**
     * Get a workspace by name
     */
    getWorkspace(name: string): Workspace | undefined;
    /**
     * Get all workspaces for a user
     */
    getUserWorkspaces(userId: string): Workspace[];
    /**
     * Update workspace settings
     */
    updateSettings(workspaceName: string, actorId: string, settings: Partial<WorkspaceSettings>): Workspace;
    /**
     * Invite a member to the workspace
     */
    inviteMember(workspaceName: string, actorId: string, userId: string, username: string, role?: WorkspaceRole): WorkspaceMember;
    /**
     * Remove a member from the workspace
     */
    removeMember(workspaceName: string, actorId: string, userId: string): void;
    /**
     * Change a member's role
     */
    changeMemberRole(workspaceName: string, actorId: string, userId: string, newRole: WorkspaceRole): void;
    /**
     * Add a secret to the workspace
     */
    addSecret(workspaceName: string, actorId: string, name: string, value: string): void;
    /**
     * Remove a secret from the workspace
     */
    removeSecret(workspaceName: string, actorId: string, name: string): void;
    /**
     * Get secret value (decrypted)
     */
    getSecretValue(workspaceName: string, actorId: string, name: string): string | undefined;
    /**
     * List secret names (not values)
     */
    listSecrets(workspaceName: string, actorId: string): string[];
    /**
     * Get activity feed
     */
    getActivity(workspaceName: string, actorId: string, limit?: number): ActivityEntry[];
    /**
     * Delete a workspace
     */
    deleteWorkspace(workspaceName: string, actorId: string): void;
    /**
     * Check if user has permission
     */
    hasPermission(workspaceName: string, userId: string, permission: string): boolean;
    private getWorkspaceOrThrow;
    private checkPermission;
    private addUserWorkspace;
    private removeUserWorkspace;
    private addActivity;
    private isValidWorkspaceName;
    private generateId;
    private encryptSecret;
    private decryptSecret;
}
/**
 * Create a workspace manager instance
 */
declare function createWorkspaceManager(): WorkspaceManager;
/**
 * Default workspace manager instance
 */
declare const defaultWorkspaceManager: WorkspaceManager;

/**
 * Tenant Manager
 *
 * Core tenant management for multi-tenant HoloScript isolation.
 * Handles CRUD operations for tenants with in-memory or custom storage.
 *
 * @version 3.9.0
 * @Sprint Sprint 9: Multi-Tenant Isolation
 */
interface QuotaConfig {
    maxCompilationsPerHour: number;
    maxStorageBytes: number;
    maxProjectsPerTenant: number;
    maxDeploymentsPerDay: number;
}
interface TenantSettings {
    maxUsers: number;
    maxProjects: number;
    maxStorageBytes: number;
    allowedFeatures: string[];
    customDomain?: string;
}
type TenantPlan = 'free' | 'pro' | 'enterprise';
interface Tenant {
    id: string;
    name: string;
    plan: TenantPlan;
    quotas: QuotaConfig;
    settings: TenantSettings;
    createdAt: Date;
    metadata: Record<string, unknown>;
}
type TenantPermission = 'read' | 'write' | 'admin' | 'compile' | 'deploy' | 'publish';
interface TenantContext {
    tenantId: string;
    userId?: string;
    sessionId: string;
    permissions: TenantPermission[];
}
interface CreateTenantConfig {
    id?: string;
    name: string;
    plan?: TenantPlan;
    quotas?: Partial<QuotaConfig>;
    settings?: Partial<TenantSettings>;
    metadata?: Record<string, unknown>;
}
interface TenantFilter {
    plan?: TenantPlan;
}
interface TenantStore {
    get(id: string): Tenant | undefined;
    set(id: string, tenant: Tenant): void;
    delete(id: string): boolean;
    values(): IterableIterator<Tenant>;
    has(id: string): boolean;
}
/**
 * Manages tenant lifecycle and storage.
 * Supports in-memory storage by default, or a custom store implementation.
 */
declare class TenantManager {
    private readonly store;
    constructor(store?: TenantStore);
    /**
     * Create a new tenant with the given configuration.
     * Applies plan-based defaults for quotas and settings when not specified.
     */
    createTenant(config: CreateTenantConfig): Tenant;
    /**
     * Retrieve a tenant by ID.
     * Throws if the tenant does not exist.
     */
    getTenant(id: string): Tenant;
    /**
     * Update a tenant's configuration.
     * Supports partial updates to quotas, settings, and metadata.
     */
    updateTenant(id: string, updates: Partial<Pick<Tenant, 'name' | 'plan' | 'metadata'>> & {
        quotas?: Partial<QuotaConfig>;
        settings?: Partial<TenantSettings>;
    }): Tenant;
    /**
     * Delete a tenant by ID.
     * Throws if the tenant does not exist.
     */
    deleteTenant(id: string): void;
    /**
     * List all tenants, optionally filtered by plan.
     */
    listTenants(filter?: TenantFilter): Tenant[];
    /**
     * Check if a tenant exists.
     */
    hasTenant(id: string): boolean;
}

/**
 * Isolation Enforcer
 *
 * Enforces strict resource isolation between tenants.
 * Prevents cross-tenant access and provides namespace-based isolation.
 *
 * @version 3.9.0
 * @Sprint Sprint 9: Multi-Tenant Isolation
 */

declare class TenantIsolationError extends Error {
    readonly requestingTenantId: string;
    readonly resourceTenantId: string;
    constructor(requestingTenantId: string, resourceTenantId: string, detail?: string);
}
/**
 * Validate that a context is allowed to access a resource belonging to a specific tenant.
 * Throws TenantIsolationError if the context's tenant does not match the resource's tenant.
 *
 * @param context - The requesting tenant context
 * @param resourceTenantId - The tenant that owns the resource
 */
declare function validateResourceAccess(context: TenantContext, resourceTenantId: string): void;
/**
 * Run a function with an isolated execution namespace.
 * The function receives the tenant-scoped namespace prefix.
 * Ensures no cross-tenant data leakage by binding the execution to the tenant context.
 *
 * @param context - The tenant context for isolation
 * @param fn - The function to execute in isolation, receives the tenant namespace prefix
 * @returns The return value of fn
 */
declare function isolateExecution<T>(context: TenantContext, fn: (namespacePrefix: string) => T | Promise<T>): Promise<T>;
/**
 * Validate that a namespace belongs to the given tenant context.
 * Throws TenantIsolationError if the namespace does not match the tenant.
 *
 * @param context - The tenant context
 * @param namespace - The namespace to validate
 */
declare function validateNamespace(context: TenantContext, namespace: string): void;
/**
 * Get an isolated namespace name for a tenant.
 * Returns a tenant-prefixed version of the given name.
 *
 * @param context - The tenant context
 * @param name - The base namespace name
 * @returns The tenant-prefixed namespace
 */
declare function getIsolatedNamespace(context: TenantContext, name: string): string;

/**
 * Namespace Manager
 *
 * Manages tenant-isolated namespaces for resource organization.
 * Each tenant's namespaces are fully isolated from other tenants.
 *
 * @version 3.9.0
 * @Sprint Sprint 9: Multi-Tenant Isolation
 */
interface Namespace {
    tenantId: string;
    name: string;
    createdAt: Date;
    data: Map<string, unknown>;
}
interface NamespaceInfo {
    tenantId: string;
    name: string;
    createdAt: Date;
    dataKeyCount: number;
}
/**
 * Manages namespaces per tenant, providing data isolation between tenants.
 * Each namespace is scoped to a tenant and can store arbitrary key-value data.
 */
declare class NamespaceManager {
    /**
     * Outer map: tenantId -> (inner map: namespace name -> Namespace)
     */
    private readonly namespaces;
    /**
     * Create a new namespace for a tenant.
     * Throws if the namespace already exists for this tenant.
     *
     * @param tenantId - The tenant that owns the namespace
     * @param name - The namespace name
     */
    createNamespace(tenantId: string, name: string): Namespace;
    /**
     * Retrieve a namespace by tenant ID and name.
     * Throws if the namespace does not exist.
     *
     * @param tenantId - The tenant that owns the namespace
     * @param name - The namespace name
     */
    getNamespace(tenantId: string, name: string): Namespace;
    /**
     * List all namespaces for a tenant.
     *
     * @param tenantId - The tenant whose namespaces to list
     * @returns Array of namespace info (without raw data map)
     */
    listNamespaces(tenantId: string): NamespaceInfo[];
    /**
     * Delete a namespace for a tenant.
     * Throws if the namespace does not exist.
     *
     * @param tenantId - The tenant that owns the namespace
     * @param name - The namespace name to delete
     */
    deleteNamespace(tenantId: string, name: string): void;
    /**
     * Store data in a tenant's namespace.
     * Throws if the namespace does not exist.
     *
     * @param tenantId - The tenant that owns the namespace
     * @param name - The namespace name
     * @param key - The data key
     * @param value - The data value
     */
    setNamespaceData(tenantId: string, name: string, key: string, value: unknown): void;
    /**
     * Retrieve data from a tenant's namespace.
     * Returns undefined if the key does not exist.
     * Throws if the namespace does not exist.
     *
     * @param tenantId - The tenant that owns the namespace
     * @param name - The namespace name
     * @param key - The data key
     */
    getNamespaceData(tenantId: string, name: string, key: string): unknown;
    /**
     * Check if a namespace exists for a tenant.
     */
    hasNamespace(tenantId: string, name: string): boolean;
    private getOrCreateTenantMap;
}

/**
 * Tenant Context
 *
 * Request-scoped tenant context management using AsyncLocalStorage.
 * Provides ambient tenant context for any code running within a tenant scope.
 *
 * @version 3.9.0
 * @Sprint Sprint 9: Multi-Tenant Isolation
 */

interface ResourceDescriptor {
    tenantId: string;
    type: string;
    name: string;
}
/**
 * Create a new tenant context with a generated session ID.
 *
 * @param tenantId - The tenant this context belongs to
 * @param userId - Optional user ID within the tenant
 * @param permissions - Permissions granted for this context (defaults to ['read'])
 */
declare function createContext(tenantId: string, userId?: string, permissions?: TenantPermission[]): TenantContext;
/**
 * Validate whether a context has the required permission for a resource.
 *
 * @param context - The tenant context to check
 * @param resource - The resource being accessed
 * @param permission - The required permission
 * @returns true if access is allowed
 */
declare function validateAccess(context: TenantContext, resource: ResourceDescriptor, permission: TenantPermission): boolean;
/**
 * Run a function within a tenant context scope.
 * The context is available via getCurrentContext() for the duration of the function.
 *
 * @param context - The tenant context to bind
 * @param fn - The function to execute within the context
 * @returns The return value of fn
 */
declare function withTenantContext<T>(context: TenantContext, fn: () => T): T;
/**
 * Get the current tenant context from async local storage.
 * Returns undefined if no context is active.
 */
declare function getCurrentContext(): TenantContext | undefined;
/**
 * Get the current tenant context, throwing if none is active.
 */
declare function requireContext(): TenantContext;

/**
 * Quota Manager
 *
 * Production-grade usage quota tracking with daily and monthly periods.
 * Supports per-key usage tracking with automatic period rotation.
 *
 * @version 9.4.0
 * @Sprint Sprint 9: Rate Limiting & Quotas
 */
/**
 * Configuration for quota limits.
 * Use -1 for unlimited quotas.
 */
interface RateLimitQuotaConfig {
    daily: {
        parseOperations: number;
        compileOperations: number;
        generateOperations: number;
    };
    monthly: {
        totalBytes: number;
        apiCalls: number;
    };
}
/**
 * Supported quota operation types.
 */
type QuotaOperation = 'parseOperations' | 'compileOperations' | 'generateOperations' | 'totalBytes' | 'apiCalls';
/**
 * Result of a quota check.
 */
interface QuotaResult {
    /** Whether the operation is within quota */
    allowed: boolean;
    /** Current usage for the operation */
    currentUsage: number;
    /** The configured limit (-1 = unlimited) */
    limit: number;
    /** Remaining quota (Infinity if unlimited) */
    remaining: number;
    /** When the quota period resets (ISO string) */
    resetsAt: string;
}
/**
 * Full usage snapshot for a key.
 */
interface UsageSnapshot {
    key: string;
    daily: {
        parseOperations: number;
        compileOperations: number;
        generateOperations: number;
        periodStart: string;
    };
    monthly: {
        totalBytes: number;
        apiCalls: number;
        periodStart: string;
    };
}
/**
 * Manages usage quotas per key with automatic daily/monthly period rotation.
 *
 * Daily quotas cover: parseOperations, compileOperations, generateOperations
 * Monthly quotas cover: totalBytes, apiCalls
 *
 * A limit of -1 means unlimited.
 */
declare class QuotaManager {
    private readonly config;
    private readonly usage;
    constructor(config: RateLimitQuotaConfig);
    /**
     * Get the configuration for this quota manager.
     */
    getConfig(): Readonly<RateLimitQuotaConfig>;
    /**
     * Check whether an operation is within quota for a key.
     * Does NOT record any usage.
     *
     * @param key - The quota key (e.g., user ID, API key)
     * @param operation - The operation type to check
     * @param count - Number of units to check (default: 1)
     */
    checkQuota(key: string, operation: QuotaOperation, count?: number): QuotaResult;
    /**
     * Record usage for an operation. Returns the quota result after recording.
     * If the usage would exceed the quota, it is NOT recorded and the result shows allowed: false.
     *
     * @param key - The quota key
     * @param operation - The operation type
     * @param count - Number of units to record (default: 1)
     */
    recordUsage(key: string, operation: QuotaOperation, count?: number): QuotaResult;
    /**
     * Get the full usage snapshot for a key.
     */
    getUsage(key: string): UsageSnapshot;
    /**
     * Reset all daily quotas for all keys.
     */
    resetDaily(): void;
    /**
     * Reset all monthly quotas for all keys.
     */
    resetMonthly(): void;
    /**
     * Remove all tracked usage.
     */
    resetAll(): void;
    /**
     * Remove usage for a specific key.
     */
    resetKey(key: string): void;
    /**
     * Get the number of tracked keys.
     */
    get size(): number;
    private getOrCreateUsage;
    private rotatePeriods;
    private getOperationInfo;
    private addUsage;
    private getResetTime;
    /**
     * Get the UTC midnight timestamp for the start of the day containing `timestamp`.
     */
    static getDayStart(timestamp: number): number;
    /**
     * Get the UTC midnight timestamp for the 1st of the month containing `timestamp`.
     */
    static getMonthStart(timestamp: number): number;
}

/**
 * Token Bucket Rate Limiter
 *
 * Production-grade rate limiting using the token bucket algorithm.
 * Supports per-key rate limiting with configurable refill rates and burst sizes.
 *
 * @version 9.4.0
 * @Sprint Sprint 9: Rate Limiting & Quotas
 */
/**
 * Configuration for rate limiting behavior.
 */
interface RateLimitConfig {
    /** Maximum sustained tokens allowed per second */
    tokensPerSecond: number;
    /** Maximum tokens allowed per minute (soft cap for sustained usage) */
    tokensPerMinute: number;
    /** Maximum tokens that can accumulate (burst capacity) */
    burstSize: number;
}
/**
 * Result of a rate limit check.
 */
interface RateLimitResult {
    /** Whether the request is allowed */
    allowed: boolean;
    /** Remaining tokens after this check */
    remaining: number;
    /** Milliseconds to wait before retrying (0 if allowed) */
    retryAfterMs: number;
    /** The configured limit (burst size) */
    limit: number;
}
/**
 * Token bucket rate limiter with per-key isolation.
 *
 * The token bucket algorithm works by:
 * 1. Each key has a bucket that starts full (burstSize tokens)
 * 2. Tokens are consumed when requests are made
 * 3. Tokens refill at a steady rate (tokensPerSecond)
 * 4. The bucket never exceeds burstSize tokens
 * 5. A per-minute cap provides an additional layer of protection
 */
declare class TokenBucketRateLimiter {
    private readonly config;
    private readonly buckets;
    constructor(config: RateLimitConfig);
    /**
     * Get the configuration for this rate limiter.
     */
    getConfig(): Readonly<RateLimitConfig>;
    /**
     * Check if a request is allowed for the given key without consuming tokens.
     */
    checkLimit(key: string): RateLimitResult;
    /**
     * Consume tokens for the given key.
     * Returns the rate limit result. If not enough tokens, no tokens are consumed.
     *
     * @param key - The rate limit key (e.g., user ID, API key)
     * @param count - Number of tokens to consume (default: 1)
     */
    consumeTokens(key: string, count?: number): RateLimitResult;
    /**
     * Get the remaining tokens for a key without consuming any.
     */
    getRemainingTokens(key: string): number;
    /**
     * Reset rate limit state for a specific key.
     */
    resetKey(key: string): void;
    /**
     * Reset all rate limit state.
     */
    resetAll(): void;
    /**
     * Get the number of tracked keys.
     */
    get size(): number;
    private getOrCreateBucket;
    private refillBucket;
}

/**
 * Rate Limit & Quota Tier Definitions
 *
 * Predefined tier configurations for free, pro, and enterprise users.
 *
 * @version 9.4.0
 * @Sprint Sprint 9: Rate Limiting & Quotas
 */

/**
 * Supported tier names.
 */
type TierName = 'free' | 'pro' | 'enterprise';
/**
 * Predefined rate limit configurations by tier.
 *
 * - free: Light usage, suitable for evaluation and small projects
 * - pro: Production usage for individual developers and small teams
 * - enterprise: High-throughput usage for large teams and CI/CD pipelines
 */
declare const RATE_LIMIT_TIERS: Record<TierName, RateLimitConfig>;
/**
 * Predefined quota configurations by tier.
 *
 * A value of -1 means unlimited.
 *
 * - free: Conservative limits for evaluation
 * - pro: Generous limits for production use
 * - enterprise: Unlimited (all limits set to -1)
 */
declare const QUOTA_TIERS: Record<TierName, RateLimitQuotaConfig>;
/**
 * Get the rate limit configuration for a tier.
 */
declare function getRateLimitConfig(tier: TierName): RateLimitConfig;
/**
 * Get the quota configuration for a tier.
 */
declare function getQuotaConfig(tier: TierName): RateLimitQuotaConfig;

/**
 * W3C WoT Thing Description Generator
 *
 * Generates W3C Thing Description 1.1 JSON from HoloScript objects
 * with @wot_thing trait.
 *
 * @see https://www.w3.org/TR/wot-thing-description11/
 * @version 1.0.0
 */

type SecurityScheme = NoSecurityScheme | BasicSecurityScheme | BearerSecurityScheme | OAuth2SecurityScheme | APIKeySecurityScheme;
interface NoSecurityScheme {
    scheme: 'nosec';
}
interface BasicSecurityScheme {
    scheme: 'basic';
    in?: 'header' | 'query' | 'body' | 'cookie';
    name?: string;
}
interface BearerSecurityScheme {
    scheme: 'bearer';
    in?: 'header' | 'query' | 'body' | 'cookie';
    name?: string;
    authorization?: string;
    alg?: string;
    format?: string;
}
interface OAuth2SecurityScheme {
    scheme: 'oauth2';
    flow: 'code' | 'client' | 'implicit' | 'device';
    authorization?: string;
    token?: string;
    refresh?: string;
    scopes?: string[];
}
interface APIKeySecurityScheme {
    scheme: 'apikey';
    in: 'header' | 'query' | 'body' | 'cookie';
    name: string;
}
interface DataSchema {
    '@type'?: string | string[];
    title?: string;
    description?: string;
    type?: 'boolean' | 'integer' | 'number' | 'string' | 'object' | 'array' | 'null';
    const?: unknown;
    default?: unknown;
    unit?: string;
    oneOf?: DataSchema[];
    enum?: unknown[];
    readOnly?: boolean;
    writeOnly?: boolean;
    format?: string;
    items?: DataSchema;
    minItems?: number;
    maxItems?: number;
    properties?: Record<string, DataSchema>;
    required?: string[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
}
interface Form {
    href: string;
    contentType?: string;
    contentCoding?: string;
    subprotocol?: string;
    security?: string | string[];
    scopes?: string | string[];
    op?: string | string[];
}
interface PropertyAffordance extends DataSchema {
    forms?: Form[];
    observable?: boolean;
}
interface ActionAffordance {
    '@type'?: string | string[];
    title?: string;
    description?: string;
    forms?: Form[];
    input?: DataSchema;
    output?: DataSchema;
    safe?: boolean;
    idempotent?: boolean;
    synchronous?: boolean;
}
interface EventAffordance {
    '@type'?: string | string[];
    title?: string;
    description?: string;
    forms?: Form[];
    subscription?: DataSchema;
    data?: DataSchema;
    dataResponse?: DataSchema;
    cancellation?: DataSchema;
}
interface Link {
    href: string;
    type?: string;
    rel?: string;
    anchor?: string;
    hreflang?: string | string[];
}
interface ThingDescription {
    '@context': string | (string | Record<string, string>)[];
    '@type'?: string | string[];
    id?: string;
    title: string;
    titles?: Record<string, string>;
    description?: string;
    descriptions?: Record<string, string>;
    version?: {
        instance: string;
        model?: string;
    };
    created?: string;
    modified?: string;
    support?: string;
    base?: string;
    properties?: Record<string, PropertyAffordance>;
    actions?: Record<string, ActionAffordance>;
    events?: Record<string, EventAffordance>;
    links?: Link[];
    forms?: Form[];
    security: string | string[];
    securityDefinitions: Record<string, SecurityScheme>;
}
interface WoTThingConfig {
    title: string;
    description?: string;
    security: 'nosec' | 'basic' | 'bearer' | 'oauth2' | 'apikey';
    base?: string;
    id?: string;
    version?: string;
}
interface ThingDescriptionGeneratorOptions {
    /** Base URL for form hrefs */
    baseUrl?: string;
    /** Default content type for forms */
    contentType?: string;
    /** Include observable flag for all properties */
    defaultObservable?: boolean;
    /** Custom security definitions */
    securityDefinitions?: Record<string, SecurityScheme>;
}
declare class ThingDescriptionGenerator {
    private options;
    constructor(options?: ThingDescriptionGeneratorOptions);
    /**
     * Generate a Thing Description from a HoloScript node with @wot_thing trait
     */
    generate(node: HSPlusNode): ThingDescription | null;
    /**
     * Generate Thing Descriptions for all nodes with @wot_thing trait
     */
    generateAll(nodes: HSPlusNode[]): ThingDescription[];
    /**
     * Find @wot_thing directive in node
     */
    private findWoTTrait;
    /**
     * Parse @wot_thing config from directive
     */
    private parseWoTConfig;
    /**
     * Extract TD properties from @state block
     */
    private extractStateProperties;
    /**
     * Map state object to TD properties
     */
    private mapStateToProperties;
    /**
     * Extract TD actions from @on_* handlers
     */
    private extractActions;
    /**
     * Extract TD events from emit() calls
     */
    private extractEvents;
    /**
     * Build security definitions based on config
     */
    private buildSecurityDefinitions;
    /**
     * Extract input schema from args object
     */
    private extractInputSchema;
    /**
     * Infer JSON Schema type from value
     */
    private inferType;
    /**
     * Convert snake_case or camelCase to Title Case
     */
    private toTitleCase;
}
/**
 * Generate a Thing Description from a HoloScript node
 */
declare function generateThingDescription(node: HSPlusNode, options?: ThingDescriptionGeneratorOptions): ThingDescription | null;
/**
 * Generate Thing Descriptions for all nodes in a composition
 */
declare function generateAllThingDescriptions(nodes: HSPlusNode[], options?: ThingDescriptionGeneratorOptions): ThingDescription[];
/**
 * Serialize Thing Description to JSON
 */
declare function serializeThingDescription(td: ThingDescription, pretty?: boolean): string;
/**
 * Validate a Thing Description (basic validation)
 */
declare function validateThingDescription(td: ThingDescription): {
    valid: boolean;
    errors: string[];
};

/**
 * AgentOutputSchemaValidator -- Schema validation gate for agent outputs.
 *
 * Extends the AgentRBAC confabulation risk layer with structured schema
 * validation to ensure agent-generated outputs conform to expected types
 * before they reach compiler targets.
 *
 * This module adds:
 * 1. Output schema definitions for each compiler target (R3F, GLTF, Unity, Unreal)
 * 2. Runtime type checking for agent-produced compositions
 * 3. Risk scoring based on deviation from expected schemas
 * 4. Integration point for AgentRBAC.checkAccessWithSchemaGate()
 *
 * TARGET: packages/core/src/compiler/identity/AgentOutputSchemaValidator.ts
 *
 * @version 1.0.0
 */

/**
 * Supported value types for schema validation.
 */
type SchemaValueType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'vector2' | 'vector3' | 'vector4' | 'quaternion' | 'color' | 'enum' | 'null' | 'any';
/**
 * Schema for a single property in an output object.
 */
interface OutputPropertySchema {
    /** Property name (dot-separated for nested paths) */
    name: string;
    /** Expected type */
    type: SchemaValueType;
    /** Whether the property is required in output */
    required: boolean;
    /** For enum types, the allowed values */
    enumValues?: string[];
    /** For number types, minimum value */
    min?: number;
    /** For number types, maximum value */
    max?: number;
    /** For array types, expected element type */
    elementType?: SchemaValueType;
    /** For array types, expected length */
    length?: number;
    /** Default value if not provided */
    defaultValue?: unknown;
    /** Human-readable description */
    description?: string;
}
/**
 * Schema for a complete output object (e.g., a compiled mesh, material, etc.)
 */
interface OutputObjectSchema {
    /** Schema name (e.g., 'R3FMesh', 'GLTFNode') */
    name: string;
    /** Target compiler this schema applies to */
    target: CompilerTarget;
    /** Properties in this schema */
    properties: OutputPropertySchema[];
}
/**
 * Compiler targets supported by the schema validator.
 */
type CompilerTarget = 'r3f' | 'gltf' | 'unity' | 'unreal' | 'generic';
/**
 * Result of schema validation on agent output.
 */
interface SchemaValidationResult {
    /** Whether the output passed all schema checks */
    valid: boolean;
    /** Overall risk score (0-100) */
    riskScore: number;
    /** Individual validation errors */
    errors: SchemaValidationError[];
    /** Non-blocking warnings */
    warnings: SchemaValidationWarning[];
    /** Schemas checked */
    schemasChecked: number;
    /** Properties validated */
    propertiesValidated: number;
    /** Validation time in ms */
    validationTimeMs: number;
}
/**
 * A schema validation error (blocks output).
 */
interface SchemaValidationError {
    code: SchemaErrorCode;
    message: string;
    path: string;
    expectedType?: SchemaValueType;
    actualType?: string;
    riskContribution: number;
}
/**
 * A schema validation warning (non-blocking).
 */
interface SchemaValidationWarning {
    code: string;
    message: string;
    path: string;
    riskContribution: number;
}
/**
 * Error codes for schema validation.
 */
declare enum SchemaErrorCode {
    MISSING_REQUIRED = "SCHEMA_MISSING_REQUIRED",
    TYPE_MISMATCH = "SCHEMA_TYPE_MISMATCH",
    VALUE_OUT_OF_RANGE = "SCHEMA_VALUE_OUT_OF_RANGE",
    INVALID_ENUM = "SCHEMA_INVALID_ENUM",
    INVALID_ARRAY_LENGTH = "SCHEMA_INVALID_ARRAY_LENGTH",
    INVALID_VECTOR = "SCHEMA_INVALID_VECTOR",
    UNKNOWN_PROPERTY = "SCHEMA_UNKNOWN_PROPERTY",
    STRUCTURAL_ANOMALY = "SCHEMA_STRUCTURAL_ANOMALY"
}
interface AgentOutputSchemaValidatorConfig {
    /** Risk score threshold (default: 50) */
    riskThreshold?: number;
    /** Treat unknown properties as errors (default: false) */
    strictUnknownProperties?: boolean;
    /** Additional schemas */
    customSchemas?: OutputObjectSchema[];
    /** Target compiler for validation context */
    target?: CompilerTarget;
}
declare class AgentOutputSchemaValidator {
    private readonly schemas;
    private readonly config;
    constructor(config?: AgentOutputSchemaValidatorConfig);
    /**
     * Validate an agent-produced value against a schema type.
     */
    private validateType;
    /**
     * Resolve a dot-separated property path on an object.
     */
    private resolvePath;
    /**
     * Validate a single output object against a schema.
     */
    validateObject(obj: Record<string, any>, schema: OutputObjectSchema): SchemaValidationResult;
    /**
     * Validate a full composition's objects against the appropriate schema.
     */
    validateComposition(composition: HoloComposition): SchemaValidationResult;
    /**
     * Get all registered schemas.
     */
    getSchemas(): OutputObjectSchema[];
    /**
     * Register a custom schema.
     */
    registerSchema(schema: OutputObjectSchema): void;
}
declare function getOutputSchemaValidator(config?: AgentOutputSchemaValidatorConfig): AgentOutputSchemaValidator;
declare function resetOutputSchemaValidator(): void;

/**
 * Capability-token validator for cross-reality operations.
 *
 * Validates that a {@link CapabilityToken} authorises a requested
 * (resource, action) pair, while enforcing:
 *
 * - Token expiry
 * - Nonce replay detection (single-use tokens)
 * - Explicit revocation
 * - Scope matching (resource + action + optional constraints)
 *
 * @module identity/CapabilityValidator
 */
interface CapabilityScope {
    /** The resource this scope grants access to (e.g. 'mvc.decisionHistory'). */
    resource: string;
    /** Allowed actions on the resource. */
    actions: ('read' | 'write' | 'delete')[];
    /** Optional additional constraints. */
    constraints?: {
        maxPayloadBytes?: number;
        allowedFormFactors?: string[];
        expiresAt?: number;
    };
}
interface CapabilityToken {
    /** DID of the agent that issued the token. */
    issuer: string;
    /** DID of the agent authorised by the token. */
    subject: string;
    /** Capability scopes granted by this token. */
    scopes: CapabilityScope[];
    /** Unix epoch (ms) when the token was issued. */
    issuedAt: number;
    /** Unix epoch (ms) when the token expires. */
    expiresAt: number;
    /** Single-use nonce to prevent replay attacks. */
    nonce: string;
}
interface ValidationResult {
    /** Whether the token is valid for the requested operation. */
    valid: boolean;
    /** Human-readable reason when `valid` is false. */
    reason?: string;
    /** The scopes from the token that matched the request. */
    matchedScopes?: CapabilityScope[];
}
declare class CapabilityValidator {
    private usedNonces;
    private revokedTokens;
    /**
     * Validate that `token` authorises (`resource`, `action`).
     *
     * Checks are performed in the following order:
     * 1. Revocation
     * 2. Replay (nonce already used)
     * 3. Expiry
     * 4. Scope matching
     */
    validate(token: CapabilityToken, resource: string, action: 'read' | 'write' | 'delete'): ValidationResult;
    /** Revoke a token identified by its nonce. */
    revoke(nonce: string): void;
    /** Check whether a nonce has been revoked. */
    isRevoked(nonce: string): boolean;
    /** Mark a nonce as consumed (prevents future replay). */
    markUsed(nonce: string): void;
    /** Check whether a nonce has already been consumed. */
    isUsed(nonce: string): boolean;
    /**
     * Remove nonces that were recorded before `beforeTimestamp`.
     *
     * Because `Set` does not store timestamps we cannot do a precise prune
     * based on insertion time. Instead, callers should pass nonce values
     * through an external time-indexed structure. This method accepts
     * `beforeTimestamp` for API symmetry and removes **all** tracked nonces
     * that were added, returning the count removed.
     *
     * In a production system the nonce store would be backed by a TTL map;
     * here we clear all nonces and return the count for simplicity.
     */
    pruneExpiredNonces(beforeTimestamp: number): number;
}

/**
 * @fileoverview Marketplace Submission Pipeline
 * @module @holoscript/core/marketplace
 *
 * The full lifecycle for submitting HoloScript creations to the marketplace:
 * 1. Package — bundle source, assets, metadata
 * 2. Verify — run safety pass, check capabilities, validate budget
 * 3. Sign — generate safety certificate, attach DID signature
 * 4. Publish — submit to registry
 *
 * This bridges the compile-time safety system to the marketplace.
 *
 * @version 1.0.0
 */

/** Categories of marketplace content */
type ContentCategory = 'world' | 'object' | 'agent' | 'trait' | 'shader' | 'vfx' | 'audio' | 'template' | 'plugin';
/** Version following semver */
interface SemanticVersion {
    major: number;
    minor: number;
    patch: number;
}
/** Publisher identity */
interface Publisher {
    id: string;
    name: string;
    did: string;
    verified: boolean;
    trustLevel: 'new' | 'verified' | 'trusted' | 'official';
}
/** Package metadata */
interface PackageMetadata {
    /** Unique package ID (e.g., @publisher/package-name) */
    id: string;
    /** Display name */
    name: string;
    /** Description */
    description: string;
    /** Category */
    category: ContentCategory;
    /** Version */
    version: SemanticVersion;
    /** Publisher */
    publisher: Publisher;
    /** Tags for search */
    tags: string[];
    /** Target platforms */
    platforms: PlatformTarget[];
    /** License */
    license: string;
    /** Dependencies */
    dependencies: {
        id: string;
        version: string;
    }[];
    /** Creation timestamp */
    createdAt: string;
    /** Last update */
    updatedAt: string;
}
/** A marketplace package ready for submission */
interface MarketplacePackage {
    metadata: PackageMetadata;
    /** Bundled AST nodes for safety verification */
    nodes: EffectASTNode[];
    /** Asset manifest (file paths → sizes) */
    assets: {
        path: string;
        sizeBytes: number;
        hash: string;
    }[];
    /** Total bundle size in bytes */
    bundleSizeBytes: number;
}
/** Submission status */
type SubmissionStatus = 'draft' | 'verifying' | 'verified' | 'rejected' | 'published' | 'delisted';
/** A marketplace submission */
interface MarketplaceSubmission {
    /** Submission ID */
    id: string;
    /** Package */
    package: MarketplacePackage;
    /** Current status */
    status: SubmissionStatus;
    /** Safety report (after verification) */
    safetyReport?: SafetyReport;
    /** Safety pass result */
    safetyResult?: SafetyPassResult;
    /** Rejection reasons */
    rejectionReasons?: string[];
    /** Timestamps */
    submittedAt: string;
    verifiedAt?: string;
    publishedAt?: string;
}
/** Submission configuration */
interface SubmissionConfig {
    /** Maximum bundle size (bytes) */
    maxBundleSize: number;
    /** Minimum publisher trust level for auto-publish */
    autoPublishTrustLevel: 'verified' | 'trusted' | 'official';
    /** Target platforms to verify against */
    verifyPlatforms: PlatformTarget[];
    /** Trust level for safety checking */
    defaultTrustLevel: string;
    /** Allow warnings to be published */
    allowWarnings: boolean;
}
/**
 * Step 1: Package — create a submission from source.
 */
declare function createSubmission(pkg: MarketplacePackage): MarketplaceSubmission;
/**
 * Step 2: Verify — run safety pass on the package.
 */
declare function verifySubmission(submission: MarketplaceSubmission, config?: Partial<SubmissionConfig>): MarketplaceSubmission;
/**
 * Step 3: Publish — move from verified to published.
 */
declare function publishSubmission(submission: MarketplaceSubmission, config?: Partial<SubmissionConfig>): MarketplaceSubmission;
/**
 * Get a human-readable submission summary.
 */
declare function submissionSummary(submission: MarketplaceSubmission): string;

/**
 * @fileoverview Marketplace Registry — Store, Search, Install
 * @module @holoscript/core/marketplace
 *
 * The in-memory marketplace registry for HoloScript packages.
 * Supports publishing, searching, versioned installs, and
 * dependency resolution.
 *
 * In production, this would be backed by a database and CDN.
 *
 * @version 1.0.0
 */

/** A published package listing */
interface PackageListing {
    /** Package metadata */
    metadata: PackageMetadata;
    /** Safety report from verification */
    safetyReport: SafetyReport;
    /** Download count */
    downloads: number;
    /** Rating (0-5) */
    rating: number;
    /** Number of reviews */
    reviewCount: number;
    /** Published versions */
    versions: SemanticVersion[];
    /** Featured flag */
    featured: boolean;
    /** Published timestamp */
    publishedAt: string;
}
/** Search filters */
interface SearchFilters {
    query?: string;
    category?: ContentCategory;
    publisher?: string;
    platform?: PlatformTarget;
    minRating?: number;
    safetyVerdict?: SafetyVerdict;
    tags?: string[];
    featured?: boolean;
    sortBy?: 'downloads' | 'rating' | 'recent' | 'name';
    limit?: number;
    offset?: number;
}
/** Search result */
interface MarketplaceSearchResult {
    listings: PackageListing[];
    total: number;
    offset: number;
    limit: number;
}
/** Install manifest — what gets deployed to a HoloLand world */
interface InstallManifest {
    packageId: string;
    version: SemanticVersion;
    safetyVerdict: SafetyVerdict;
    dangerScore: number;
    requiredCapabilities: string[];
    targetPlatforms: PlatformTarget[];
    dependencies: {
        id: string;
        version: string;
    }[];
    installedAt: string;
}
/**
 * MarketplaceRegistry — the HoloScript package store.
 */
declare class MarketplaceRegistry {
    private packages;
    private installed;
    /**
     * Publish a verified submission to the registry.
     */
    publish(submission: MarketplaceSubmission): PackageListing;
    /**
     * Get a package listing by ID.
     */
    get(packageId: string): PackageListing | undefined;
    /**
     * Search the registry.
     */
    search(filters?: SearchFilters): MarketplaceSearchResult;
    /**
     * Install a package into a HoloLand world.
     */
    install(packageId: string, worldId: string): InstallManifest;
    /**
     * Uninstall a package from a world.
     */
    uninstall(packageId: string, worldId: string): boolean;
    /**
     * Get installed packages for a world.
     */
    getInstalled(worldId: string): InstallManifest[];
    /**
     * Rate a package.
     */
    rate(packageId: string, rating: number): boolean;
    /**
     * Feature/unfeature a package.
     */
    setFeatured(packageId: string, featured: boolean): boolean;
    /**
     * Get registry statistics.
     */
    stats(): {
        totalPackages: number;
        totalDownloads: number;
        totalInstalls: number;
        categories: Record<string, number>;
    };
}

/**
 * Web3Connector Protocol
 *
 * Lightweight interface for pluggable web3 implementations.
 * Core traits (WalletTrait, NFTTrait, TokenGatedTrait) emit request events;
 * the connector fulfills them and dispatches responses back via emit().
 *
 * marketplace-api provides the production implementation using viem.
 * Tests can use MockWeb3Connector (zero dependencies).
 */
interface Web3ConnectorConfig {
    /** Default chain identifier (e.g. 'base', 'ethereum', 'polygon') */
    chain?: string;
    /** Optional RPC endpoint override */
    rpcUrl?: string;
}
interface Web3Connector {
    /** Unique name for this connector implementation */
    readonly name: string;
    /** Connect a wallet */
    connectWallet(params: {
        provider: string;
        chainId: number;
    }): Promise<{
        address: string;
        chainId: number;
    }>;
    /** Verify NFT ownership on-chain */
    verifyNFTOwnership(params: {
        chain: string;
        contractAddress: string;
        tokenId: string;
        standard?: string;
        rpcEndpoint?: string;
    }): Promise<{
        ownerAddress: string;
        standard: string;
    }>;
    /** Check token balance for gating */
    checkTokenBalance(params: {
        chain: string;
        contractAddress: string;
        tokenId?: string;
        tokenType: string;
        address: string;
    }): Promise<{
        balance: number;
    }>;
    /** Resolve ENS name and avatar */
    resolveENS?(params: {
        address: string;
    }): Promise<{
        ensName: string | null;
        ensAvatar: string | null;
    }>;
    /** Get wallet balance */
    getBalance?(params: {
        address: string;
        chainId: number;
    }): Promise<{
        balance: string;
    }>;
    /** Switch wallet chain */
    switchChain?(params: {
        targetChainId: number;
    }): Promise<void>;
    /** Sign a message */
    signMessage?(params: {
        address: string;
        message: string;
    }): Promise<{
        signature: string;
    }>;
    /** Initiate NFT transfer */
    transferNFT?(params: {
        chain: string;
        contract: string;
        tokenId: string;
        from: string;
        to: string;
    }): Promise<{
        txHash: string;
        newOwner: string;
    }>;
}
declare class MockWeb3Connector implements Web3Connector {
    readonly name = "mock";
    connectWallet(params: {
        provider: string;
        chainId: number;
    }): Promise<{
        address: string;
        chainId: number;
    }>;
    verifyNFTOwnership(params: {
        chain: string;
        contractAddress: string;
        tokenId: string;
    }): Promise<{
        ownerAddress: string;
        standard: string;
    }>;
    checkTokenBalance(): Promise<{
        balance: number;
    }>;
    resolveENS(): Promise<{
        ensName: null;
        ensAvatar: null;
    }>;
    getBalance(): Promise<{
        balance: string;
    }>;
    switchChain(): Promise<void>;
    signMessage(): Promise<{
        signature: string;
    }>;
    transferNFT(): Promise<{
        txHash: string;
        newOwner: string;
    }>;
}
type EmitFn = (event: string, data: Record<string, unknown>) => void;
/**
 * Creates an event bridge that listens for web3 request events from traits
 * and dispatches them to the provided connector, emitting response events.
 *
 * Usage:
 *   const bridge = createWeb3EventBridge(connector, context.emit);
 *   bridge.handle('wallet_request_connect', eventData);
 */
declare function createWeb3EventBridge(connector: Web3Connector, emit: EmitFn): {
    /** Handle a single web3 event. Returns true if the event was handled. */
    handle(event: string, data: Record<string, unknown>): boolean;
    /** All event names this bridge can handle */
    readonly supportedEvents: string[];
};

/**
 * Web3Provider Stub
 *
 * This file replaces the original Web3Provider which was migrated to
 * @holoscript/marketplace-api. It exists solely to satisfy legacy
 * internal dependencies in MarketplacePanel.ts and the Sprint21 acceptance tests.
 */
interface NFTAsset {
    id: string;
    name: string;
    contractAddress: string;
    tokenId: string;
    imageUrl: string;
    modelUrl?: string;
    chainId: number;
}
declare class Web3Provider {
    private static instance;
    isConnected: boolean;
    walletAddress: string | null;
    chainId: number;
    static getInstance(): Web3Provider;
    connect(): Promise<string>;
    disconnect(): Promise<void>;
    getMyAssets(): Promise<NFTAsset[]>;
    mint(_params: {
        name: string;
    }): Promise<{
        transactionHash: string;
        tokenId: string;
    }>;
}

/**
 * TraitBehavioralContract -- Behavioral contract specification for HoloScript traits.
 *
 * Traits can declare pre-conditions (what must be true before applying the trait),
 * post-conditions (what must be true after), and invariants (what must remain
 * true throughout the trait's lifetime).
 *
 * This enables:
 * - Design-by-contract programming for spatial compositions
 * - Automatic runtime validation in debug builds
 * - Static analysis for the LSP/linter
 * - Confabulation detection (AI-generated configs that violate contracts)
 *
 * TARGET: packages/core/src/traits/TraitBehavioralContract.ts
 *
 * @version 1.0.0
 */
/**
 * A condition that can be evaluated against an object's state.
 */
interface ContractCondition {
    /** Human-readable description of the condition */
    description: string;
    /**
     * Evaluate the condition against an object's property bag.
     * Returns true if the condition is satisfied.
     */
    evaluate: (props: Record<string, unknown>) => boolean;
    /** Error message when the condition fails */
    errorMessage?: string;
    /** Severity: 'error' blocks execution, 'warning' logs but continues */
    severity: 'error' | 'warning';
}
/**
 * A behavioral contract for a trait.
 */
interface TraitContract {
    /** The trait this contract applies to */
    traitName: string;
    /** Pre-conditions: must be true BEFORE the trait is applied */
    preconditions: ContractCondition[];
    /** Post-conditions: must be true AFTER the trait is applied */
    postconditions: ContractCondition[];
    /** Invariants: must remain true throughout the trait's lifetime */
    invariants: ContractCondition[];
    /** Other traits that must be present (stronger than 'requires') */
    dependencies: string[];
    /** Other traits that must NOT be present */
    exclusions: string[];
}
/**
 * Result of contract validation.
 */
interface ContractValidationResult {
    /** Whether all conditions passed */
    valid: boolean;
    /** Violations found */
    violations: ContractViolation[];
    /** Trait name being validated */
    traitName: string;
    /** Phase where validation occurred */
    phase: 'precondition' | 'postcondition' | 'invariant' | 'dependency';
}
interface ContractViolation {
    /** Which condition was violated */
    condition: ContractCondition;
    /** Phase of the violation */
    phase: 'precondition' | 'postcondition' | 'invariant' | 'dependency';
    /** The trait name */
    traitName: string;
    /** Additional context */
    context?: string;
}
/**
 * Fluent builder for creating trait contracts.
 *
 * Usage:
 *   const contract = TraitContractBuilder.for('physics')
 *     .requires('collidable')
 *     .excludes('static')
 *     .pre('mass must be positive', props => (props.mass as number) > 0)
 *     .post('velocity initialized', props => props.velocity !== undefined)
 *     .invariant('mass never negative', props => (props.mass as number) >= 0)
 *     .build();
 */
declare class TraitContractBuilder {
    private contract;
    private constructor();
    /** Create a new contract builder for a trait. */
    static for(traitName: string): TraitContractBuilder;
    /** Add a dependency on another trait. */
    requires(traitName: string): this;
    /** Add an exclusion (this trait cannot coexist with another). */
    excludes(traitName: string): this;
    /** Add a pre-condition. */
    pre(description: string, evaluate: (props: Record<string, unknown>) => boolean, severity?: 'error' | 'warning'): this;
    /** Add a post-condition. */
    post(description: string, evaluate: (props: Record<string, unknown>) => boolean, severity?: 'error' | 'warning'): this;
    /** Add an invariant. */
    invariant(description: string, evaluate: (props: Record<string, unknown>) => boolean, severity?: 'error' | 'warning'): this;
    /** Build the final contract. */
    build(): TraitContract;
}
/**
 * Registry of behavioral contracts for traits.
 */
declare class TraitContractRegistry {
    private contracts;
    /** Register a contract. */
    register(contract: TraitContract): void;
    /** Get a contract by trait name. */
    get(traitName: string): TraitContract | undefined;
    /** Check if a contract exists. */
    has(traitName: string): boolean;
    /** Get all registered contracts. */
    getAll(): TraitContract[];
    /** Remove a contract. */
    remove(traitName: string): boolean;
    /** Get the number of registered contracts. */
    get size(): number;
}
/**
 * Validates trait contracts against object state.
 */
declare class ContractValidator {
    private registry;
    constructor(registry: TraitContractRegistry);
    /**
     * Validate pre-conditions for a trait before it is applied.
     */
    validatePreconditions(traitName: string, props: Record<string, unknown>, appliedTraits?: string[]): ContractValidationResult;
    /**
     * Validate post-conditions after a trait has been applied.
     */
    validatePostconditions(traitName: string, props: Record<string, unknown>): ContractValidationResult;
    /**
     * Validate invariants during the trait's lifetime.
     */
    validateInvariants(traitName: string, props: Record<string, unknown>): ContractValidationResult;
    /**
     * Validate all contract phases for a trait (pre, post, invariants).
     */
    validateAll(traitName: string, props: Record<string, unknown>, appliedTraits?: string[]): ContractValidationResult[];
}
/**
 * Create the default contract registry with built-in contracts for core traits.
 */
declare function createDefaultContractRegistry(): TraitContractRegistry;
declare function getContractRegistry(): TraitContractRegistry;
declare function resetContractRegistry(): void;

/**
 * HybridCryptoProvider -- Post-quantum cryptography wrapper for HoloScript.
 *
 * Wraps existing classical crypto (ECDSA, X25519) with post-quantum algorithms
 * (ML-KEM/Kyber for key encapsulation, ML-DSA/Dilithium for signatures)
 * using the @noble/post-quantum library.
 *
 * The hybrid approach provides defense-in-depth: if either the classical or
 * post-quantum algorithm is broken, the other still provides security.
 *
 * TARGET: packages/core/src/compiler/identity/HybridCryptoProvider.ts
 *
 * @version 1.0.0
 */
/**
 * Supported classical algorithms.
 */
type ClassicalAlgorithm = 'ecdsa-p256' | 'ecdsa-p384' | 'ed25519' | 'x25519';
/**
 * Supported post-quantum algorithms.
 */
type PQAlgorithm = 'ml-kem-768' | 'ml-kem-1024' | 'ml-dsa-65' | 'ml-dsa-87';
/**
 * Hybrid key pair combining classical and post-quantum keys.
 */
interface HybridKeyPair {
    /** Unique identifier for this key pair */
    id: string;
    /** Classical public key (base64-encoded) */
    classicalPublicKey: string;
    /** Classical private key (base64-encoded) */
    classicalPrivateKey: string;
    /** Post-quantum public key (base64-encoded) */
    pqPublicKey: string;
    /** Post-quantum private key (base64-encoded) */
    pqPrivateKey: string;
    /** Classical algorithm used */
    classicalAlgorithm: ClassicalAlgorithm;
    /** Post-quantum algorithm used */
    pqAlgorithm: PQAlgorithm;
    /** When the key was generated */
    createdAt: string;
}
/**
 * Hybrid signature combining classical and post-quantum signatures.
 */
interface HybridSignature {
    /** Classical signature (base64-encoded) */
    classicalSignature: string;
    /** Post-quantum signature (base64-encoded) */
    pqSignature: string;
    /** Classical algorithm used */
    classicalAlgorithm: ClassicalAlgorithm;
    /** Post-quantum algorithm used */
    pqAlgorithm: PQAlgorithm;
    /** Combined signature bytes (base64-encoded) */
    combined: string;
}
/**
 * Hybrid encapsulated key (for key exchange).
 */
interface HybridEncapsulation {
    /** Classical ciphertext (base64-encoded) */
    classicalCiphertext: string;
    /** Post-quantum ciphertext (base64-encoded) */
    pqCiphertext: string;
    /** Combined shared secret (base64-encoded, derived from both) */
    sharedSecret: string;
}
/**
 * Result of hybrid signature verification.
 */
interface HybridVerificationResult {
    /** Whether BOTH signatures verified */
    valid: boolean;
    /** Classical signature verification result */
    classicalValid: boolean;
    /** Post-quantum signature verification result */
    pqValid: boolean;
    /** If either failed, the error message */
    error?: string;
}
/**
 * Configuration for the HybridCryptoProvider.
 */
interface HybridCryptoConfig {
    /** Classical algorithm for signatures (default: 'ed25519') */
    signatureAlgorithm?: ClassicalAlgorithm;
    /** Post-quantum algorithm for signatures (default: 'ml-dsa-65') */
    pqSignatureAlgorithm?: PQAlgorithm;
    /** Classical algorithm for key exchange (default: 'x25519') */
    keyExchangeAlgorithm?: ClassicalAlgorithm;
    /** Post-quantum algorithm for key exchange (default: 'ml-kem-768') */
    pqKeyExchangeAlgorithm?: PQAlgorithm;
    /** Whether to require both algorithms to pass (default: true) */
    requireBoth?: boolean;
    /** Logging function for audit trail */
    logger?: (message: string) => void;
}
/**
 * HybridCryptoProvider -- Main class for hybrid classical+PQ cryptography.
 *
 * This provider implements the "hybrid" approach recommended by NIST for
 * the transition to post-quantum cryptography:
 * - Key exchange: X25519 + ML-KEM-768 (Kyber)
 * - Signatures: Ed25519 + ML-DSA-65 (Dilithium)
 *
 * Both algorithms must verify for the operation to succeed, providing
 * defense-in-depth against compromise of either algorithm family.
 */
declare class HybridCryptoProvider {
    private config;
    private pqModule;
    private classicalModule;
    constructor(config?: HybridCryptoConfig);
    /**
     * Lazy-load the @noble/post-quantum module.
     * This allows the provider to be instantiated even if the module isn't installed,
     * failing gracefully only when PQ operations are actually attempted.
     */
    private loadPQModule;
    /**
     * Generate a hybrid key pair for digital signatures.
     *
     * Produces both a classical Ed25519 key pair and a post-quantum ML-DSA
     * key pair. Both are needed for signing and verification.
     */
    generateSigningKeyPair(): Promise<HybridKeyPair>;
    /**
     * Generate a hybrid key pair for key encapsulation (key exchange).
     */
    generateKEMKeyPair(): Promise<HybridKeyPair>;
    /**
     * Sign a message with hybrid (classical + PQ) signatures.
     */
    sign(message: Uint8Array, keyPair: HybridKeyPair): Promise<HybridSignature>;
    /**
     * Verify a hybrid signature.
     * Both classical and post-quantum signatures must verify.
     */
    verify(message: Uint8Array, signature: HybridSignature, publicKeys: {
        classicalPublicKey: string;
        pqPublicKey: string;
    }): Promise<HybridVerificationResult>;
    /**
     * Perform hybrid key encapsulation (key exchange).
     * Generates a shared secret using both classical and PQ key exchange.
     */
    encapsulate(recipientPublicKeys: {
        classicalPublicKey: string;
        pqPublicKey: string;
    }): Promise<HybridEncapsulation>;
    /**
     * Decapsulate -- recover the shared secret from encapsulation ciphertexts
     * using the recipient's private KEM key pair.
     */
    decapsulate(encapsulation: HybridEncapsulation, recipientKeyPair: HybridKeyPair): Promise<Uint8Array>;
    /**
     * Encrypt plaintext using a hybrid-derived shared secret (AES-256-GCM).
     *
     * The sharedSecret should be the base64-encoded output from encapsulate().
     * Returns base64-encoded ciphertext (iv + authTag + encrypted data).
     */
    encrypt(plaintext: Uint8Array, sharedSecretB64: string): Promise<string>;
    /**
     * Decrypt ciphertext using a hybrid-derived shared secret (AES-256-GCM).
     *
     * The ciphertextB64 should be the base64 string returned from encrypt().
     * The sharedSecretB64 should match the key used for encryption.
     */
    decrypt(ciphertextB64: string, sharedSecretB64: string): Promise<Uint8Array>;
    /**
     * Get the provider's configuration.
     */
    getConfig(): Readonly<Required<HybridCryptoConfig>>;
    /**
     * Check if @noble/post-quantum is available.
     */
    isAvailable(): Promise<boolean>;
}
declare function getHybridCryptoProvider(config?: HybridCryptoConfig): HybridCryptoProvider;
declare function resetHybridCryptoProvider(): void;

/**
 * RBAC Types for Compiler Identity
 *
 * Platform-level stubs for types/functions the compiler system imports.
 * These are duplicated from core/compiler/identity to avoid circular deps.
 */
declare enum ResourceType {
    SOURCE_FILE = "source_file",
    AST = "ast",
    IR = "ir",
    CODE = "code",
    OUTPUT = "output"
}
declare enum WorkflowStep {
    PARSE_TOKENS = "parse_tokens",
    BUILD_AST = "build_ast",
    ANALYZE_AST = "analyze_ast",
    APPLY_TRANSFORMS = "apply_transforms",
    SELECT_INSTRUCTIONS = "select_instructions",
    EMIT_CODE = "emit_code",
    OPTIMIZE = "optimize",
    LINK = "link"
}
interface AccessDecision {
    allowed: boolean;
    reason?: string;
    requiredPermission?: string;
}
/** Minimal RBAC interface for compiler authorization */
interface AgentRBAC {
    checkAccess(resource: ResourceType, action: string): AccessDecision;
}
/** Capability-aware RBAC wrapper */
declare class CapabilityRBAC {
    constructor(config?: {
        rbac?: AgentRBAC;
    });
    checkAccess(resource: ResourceType, action: string): AccessDecision;
}
/** Get default RBAC instance (permissive by default) */
declare function getRBAC(): AgentRBAC;
/** Get capability-aware RBAC instance */
declare function getCapabilityRBAC(): CapabilityRBAC;

/**
 * Token Manager — platform re-export
 *
 * Sprint 6 Priority 2: Private packages / CI token auth
 *
 * Generates, validates, and revokes bearer tokens for registry authentication.
 * Tokens are scoped to an organization and carry permission levels.
 */
type TokenPermission = 'read' | 'publish' | 'admin';
interface TokenRecord {
    id: string;
    token: string;
    name: string;
    orgScope: string;
    permissions: TokenPermission[];
    createdAt: Date;
    expiresAt?: Date;
    lastUsedAt?: Date;
    readonly?: boolean;
    revoked: boolean;
}
interface CreateTokenOptions {
    name: string;
    orgScope: string;
    permissions?: TokenPermission[];
    readonly?: boolean;
    /** Expiry in seconds from now */
    expiresIn?: number;
}
interface ValidateResult {
    valid: boolean;
    record?: TokenRecord;
    reason?: string;
}
declare class TokenManager {
    private tokens;
    /**
     * Generate a new registry token.
     * Returns the raw token (shown once) and the stored record.
     */
    create(options: CreateTokenOptions): {
        rawToken: string;
        record: TokenRecord;
    };
    /**
     * Validate a raw token string.
     */
    validate(rawToken: string): ValidateResult;
    /**
     * Revoke a token by its id.
     */
    revoke(id: string): boolean;
    /**
     * List all tokens for an org scope.
     */
    listByScope(orgScope: string): TokenRecord[];
    /**
     * Get a token record by id.
     */
    getById(id: string): TokenRecord | undefined;
    /**
     * Check if a (already validated) record has a given permission.
     */
    hasPermission(record: TokenRecord, permission: TokenPermission): boolean;
    /**
     * Delete all tokens (for testing).
     */
    clear(): void;
    get size(): number;
    private hash;
}
declare function createTokenManager(): TokenManager;

/**
 * Access Control
 *
 * Sprint 6: Private packages – org scopes + per-package ACL
 * Internal types use AC suffix to avoid name conflicts with PackageRegistry exports.
 */
type OrgRoleAC = 'owner' | 'admin' | 'member';
type PackageAccessAC = 'read' | 'write' | 'admin';
type PackageVisibilityAC = 'public' | 'private';
interface OrganizationAC {
    id: string;
    name: string;
    displayName?: string;
    createdAt: Date;
}
interface OrgMembershipAC {
    orgId: string;
    userId: string;
    role: OrgRoleAC;
    joinedAt: Date;
}
interface PackagePermissionAC {
    packageName: string;
    userId: string;
    access: PackageAccessAC;
    grantedAt: Date;
    grantedBy: string;
}
interface PackageVisibilityRecordAC {
    packageName: string;
    visibility: PackageVisibilityAC;
    orgScope?: string;
}
declare class AccessControl {
    private orgs;
    private memberships;
    private packagePermissions;
    private packageVisibility;
    createOrg(name: string, ownerId: string, displayName?: string): OrganizationAC;
    getOrg(name: string): OrganizationAC | undefined;
    listOrgs(): OrganizationAC[];
    addMember(orgId: string, userId: string, role?: OrgRoleAC): OrgMembershipAC;
    removeMember(orgId: string, userId: string): boolean;
    getMembers(orgId: string): OrgMembershipAC[];
    getMembership(orgId: string, userId: string): OrgMembershipAC | undefined;
    isMember(orgId: string, userId: string): boolean;
    hasOrgRole(orgId: string, userId: string, role: OrgRoleAC): boolean;
    setVisibility(packageName: string, visibility: PackageVisibilityAC, orgScope?: string): void;
    getVisibility(packageName: string): PackageVisibilityRecordAC;
    isPublic(packageName: string): boolean;
    grantAccess(packageName: string, userId: string, access: PackageAccessAC, grantedBy: string): PackagePermissionAC;
    revokeAccess(packageName: string, userId: string): boolean;
    getPermissions(packageName: string): PackagePermissionAC[];
    getUserAccess(packageName: string, userId: string): PackageAccessAC | null;
    canAccess(packageName: string, userId: string, required: PackageAccessAC): boolean;
    visiblePackages(allPackageNames: string[], userId: string): string[];
    clear(): void;
}
declare function createAccessControl(): AccessControl;

export { type APIKeySecurityScheme, type APIRequest, APIRequestSchema, type ASTNode, AccessControl, type AccessDecision, type ActionAffordance, type ActivityEntry, type ActivityType, AgentOutputSchemaValidator, type AgentOutputSchemaValidatorConfig, type AgentRBAC, type AuditEntry, AuditLogger, type AuthToken, type BadgeFormat, BadgeGenerator, type BadgeOptions, type BadgeStyle, type BasicSecurityScheme, type BearerSecurityScheme, CERTIFICATION_LEVELS, CapabilityRBAC, type CapabilityScope, type CapabilityToken, CapabilityValidator, type Certificate, type CertificationBadge, CertificationChecker, type CertificationConfig, type CertificationManifest, type CertificationResult, type CheckCategory, type CheckResult, type CheckStatus, type ClassicalAlgorithm, type CompilerTarget, type ContentCategory, type ContractCondition, type ContractValidationResult, ContractValidator, type ContractViolation, type CreateTenantConfig, type CreateTokenOptions, type CreateWorkspaceOptions, DEFAULT_CERTIFICATION_CONFIG, type DataSchema, type DeepPartial, type Ed25519KeyPair, type EventAffordance, type FileSystemAccess, type Form, type HybridCryptoConfig, HybridCryptoProvider, type HybridEncapsulation, type HybridKeyPair, type HybridSignature, type HybridVerificationResult, type ImportDeclaration, type InstallManifest, type InstallResult, type LegacyCertificationCategory, type LegacyCertificationIssue, type LegacyCertificationResult, type Link, type LocalPackageInput, type LocalPackageManifest, LocalRegistry, type LocalVersionEntry, type MarketplacePackage, type PackageMetadata as MarketplacePackageMetadata, MarketplaceRegistry, type MarketplaceSearchResult, type MarketplaceSubmission, MockWeb3Connector, type NFTAsset, type Namespace, type NamespaceInfo, NamespaceManager, type NoSecurityScheme, type OAuth2SecurityScheme, type OrgRole, type Organization, type OutputObjectSchema, type OutputPropertySchema, type PQAlgorithm, type Package, type PackageAccess, type PackageDependency, type PackageFiles, type PackageListing, type PackageManifest, type PackageMetadata$1 as PackageMetadata, type PackagePermission, PackageRegistry, PackageResolver, type PackageVisibility, Permission, type PropertyAffordance, type Publisher, QUOTA_TIERS, type QuotaConfig, QuotaManager, type QuotaOperation, type QuotaResult, RATE_LIMIT_TIERS, ROLES, ROLE_PERMISSIONS, type RateLimitConfig, type RateLimitQuotaConfig, type RateLimitResult, RateLimiter, type ResolvedDependency, type ResourceDescriptor, ResourceType, type Sandbox, type SandboxExecutionResult, type SandboxState, type Scene, SceneSchema, SchemaErrorCode, type SchemaValidationError, type SchemaValidationResult, type SchemaValidationWarning, type SchemaValueType, type SearchFilters, type SearchResult, type SecurityPolicy, type SecurityScanResult, type SecurityScheme, type SecurityViolation, type SemVer, type SemanticVersion, type SignedPackage, type SigningManifest, type SubmissionConfig, type SubmissionStatus, type Tenant, type TenantContext, type TenantFilter, TenantIsolationError, TenantManager, type TenantPermission, type TenantPlan, type TenantSettings, type TenantStore, type ThingDescription, ThingDescriptionGenerator, type ThingDescriptionGeneratorOptions, type TierName, TokenBucketRateLimiter, TokenManager, type TokenPermission, type TokenRecord, type TraitContract, TraitContractBuilder, TraitContractRegistry, type UsageSnapshot, type User, UserSchema, type ValidateResult, type ValidationResult, type ViolationCategory, type ViolationSeverity, type Web3Connector, type Web3ConnectorConfig, Web3Provider, type WoTThingConfig, WorkflowStep, type Workspace, WorkspaceManager, type WorkspaceMember, type WorkspaceRole, type WorkspaceSecret, type WorkspaceSettings, auditLogger, canManageMembers, canPublishPackages, canonicalizeManifest, checkRateLimit, compareSemVer, createAccessControl, createBadgeGenerator, createCertificationChecker, createContext, createDefaultContractRegistry, createDefaultPolicy, createPackageManifest, createPackageRegistry, createSandbox, createStrictPolicy, createSubmission, createTokenManager, createWeb3EventBridge, createWorkspaceManager, decrypt, decryptData, defaultBadgeGenerator, defaultRegistry, defaultWorkspaceManager, deriveKey, destroy, encrypt, encryptData, execute, exportKey, findBestMatch, formatSemVer, generateAllThingDescriptions, generateBadge, generateBadgeSVG, generateEncryptionKey, generateKeyPair, generateMarkdownBadge, generateRandomToken, generateSignature, generateThingDescription, getBadge, getCapabilityRBAC, getContractRegistry, getCurrentContext, getHybridCryptoProvider, getIsolatedNamespace, getOutputSchemaValidator, getQuotaConfig, getRBAC, getRateLimitConfig, hasAllPermissions, hasAnyPermission, hasPermission, hmacSha256, importKey, isActivelyCertified, isolateExecution, issueBadge, listBadges, mergePolicy, parseSemVer, publishSubmission, randomBytes, randomHex, randomUUID, requireContext, resetContractRegistry, resetHybridCryptoProvider, resetOutputSchemaValidator, resetRateLimit, resetRateLimits, revokeBadge, sanitizeInput, satisfiesRange, scanForVulnerabilities, secureHashToken, secureRandom, serializeThingDescription, sha256, sha512, signPackage, storeBadge, submissionSummary, validateAccess, validateApiKey, validateComposition, validateImports, validateInput, validateManifest, validateNamespace, validatePackageName, validateResourceAccess, validateSignature, validateThingDescription, validateUrl, validateWalletAddress, verifyBadge, verifyHmacSha256, verifySignature, verifySubmission, verifyToken, withTenantContext };
