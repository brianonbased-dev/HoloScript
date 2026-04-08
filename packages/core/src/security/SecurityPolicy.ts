/**
 * Security Policy Definitions
 *
 * Defines sandbox, network, and code execution policies for HoloScript.
 * Provides factory functions for creating default, strict, and merged policies.
 *
 * @version 9.0.0
 * @Sprint Sprint 9: Security Hardening
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * File system access level for sandboxed execution.
 * - 'none': No file system access
 * - 'readonly': Read-only access to workspace files
 * - 'workspace': Read/write access limited to workspace directory
 */
export type FileSystemAccess = 'none' | 'readonly' | 'workspace';

/**
 * Security policy governing sandbox, network, and code constraints.
 */
export interface SecurityPolicy {
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

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a default security policy with reasonable limits.
 * Suitable for development and trusted environments.
 */
export function createDefaultPolicy(): SecurityPolicy {
  return {
    sandbox: {
      enabled: true,
      memoryLimit: 256,
      cpuTimeLimit: 30,
      syscallAllowlist: [
        'read',
        'write',
        'open',
        'close',
        'stat',
        'fstat',
        'mmap',
        'mprotect',
        'brk',
      ],
      fileSystemAccess: 'workspace',
    },
    network: {
      allowedHosts: ['*'],
      maxConnections: 10,
      rateLimitPerSecond: 100,
    },
    code: {
      maxObjectCount: 1000,
      maxTraitDepth: 16,
      disallowedTraits: [],
      requireSignedPackages: false,
    },
  };
}

/**
 * Create a strict security policy for untrusted code execution.
 * Locks down network, file system, and resource limits.
 */
export function createStrictPolicy(): SecurityPolicy {
  return {
    sandbox: {
      enabled: true,
      memoryLimit: 64,
      cpuTimeLimit: 5,
      syscallAllowlist: ['read', 'write', 'brk'],
      fileSystemAccess: 'none',
    },
    network: {
      allowedHosts: [],
      maxConnections: 0,
      rateLimitPerSecond: 10,
    },
    code: {
      maxObjectCount: 100,
      maxTraitDepth: 8,
      disallowedTraits: ['@unsafe', '@raw_memory', '@system_exec', '@native_call', '@eval'],
      requireSignedPackages: true,
    },
  };
}

/**
 * Deep-merge a base policy with partial overrides.
 * Override values take precedence over base values.
 * Arrays in overrides fully replace base arrays (no merging).
 */
export function mergePolicy(
  base: SecurityPolicy,
  overrides: DeepPartial<SecurityPolicy>
): SecurityPolicy {
  return {
    sandbox: {
      ...base.sandbox,
      ...(overrides.sandbox ?? {}),
    },
    network: {
      ...base.network,
      ...(overrides.network ?? {}),
    },
    code: {
      ...base.code,
      ...(overrides.code ?? {}),
    },
  };
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Recursive partial type for deep overrides.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<any> ? T[P] : T[P] extends object ? DeepPartial<T[P]> : T[P];
};
