/**
 * Per-Server API Key Infrastructure
 *
 * Manages scoped API keys for MCP server registration. Each server gets its
 * own key with associated permissions, replacing the shared `MCP_API_KEY`
 * approach.
 *
 * Environment variable convention:
 *   MCP_KEY_<SERVER_ID_UPPER> = <key>
 *   Example: MCP_KEY_HOLOSCRIPT_TOOLS=abc123
 *            MCP_KEY_HOLOMESH=def456
 *
 * Falls back to MCP_API_KEY if no per-server key is configured (backwards compatible).
 *
 * @module security/server-keys
 */

import type { OAuthScope } from './oauth21';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ServerKeyConfig {
  /** Server ID this key is scoped to */
  serverId: string;
  /** The API key value */
  key: string;
  /** OAuth scopes this key grants */
  scopes: OAuthScope[];
  /** When the key was issued */
  issuedAt: Date;
  /** Optional expiry */
  expiresAt?: Date;
  /** Human-readable label */
  label?: string;
}

export interface ServerKeyValidation {
  valid: boolean;
  serverId?: string;
  scopes?: OAuthScope[];
  reason?: string;
}

// ─── Key Resolution ──────────────────────────────────────────────────────────

/**
 * Resolve the API key for a server.
 *
 * Priority:
 * 1. Per-server env var: MCP_KEY_<SERVER_ID_UPPER>
 * 2. Shared fallback: MCP_API_KEY
 * 3. Empty string (will fail auth)
 */
export function resolveServerKey(serverId: string): string {
  // Convert server-id to MCP_KEY_SERVER_ID
  const envKey = `MCP_KEY_${serverId.toUpperCase().replace(/-/g, '_')}`;
  return process.env[envKey] || process.env.MCP_API_KEY || '';
}

/**
 * Check if a per-server key is configured (not just the shared fallback).
 */
export function hasPerServerKey(serverId: string): boolean {
  const envKey = `MCP_KEY_${serverId.toUpperCase().replace(/-/g, '_')}`;
  return !!process.env[envKey];
}

// ─── Key Registry ────────────────────────────────────────────────────────────

/** In-memory registry of known server keys → scopes */
const serverKeyRegistry = new Map<string, ServerKeyConfig>();

/**
 * Register a server key with its associated scopes.
 * Used at startup to declare what scopes each server's key grants.
 */
export function registerServerKey(config: ServerKeyConfig): void {
  serverKeyRegistry.set(config.serverId, config);
}

/**
 * Validate an incoming API key against the per-server registry.
 *
 * Returns scoped validation if the key matches a registered server,
 * or falls back to checking against the shared MCP_API_KEY.
 */
export function validateServerKey(
  incomingKey: string,
  expectedServerId?: string
): ServerKeyValidation {
  if (!incomingKey) {
    return { valid: false, reason: 'No API key provided' };
  }

  // Check per-server keys
  for (const [serverId, config] of serverKeyRegistry) {
    if (config.key === incomingKey) {
      // Key matches this server
      if (expectedServerId && serverId !== expectedServerId) {
        return {
          valid: false,
          serverId,
          reason: `Key belongs to server "${serverId}" but was used for "${expectedServerId}"`,
        };
      }

      // Check expiry
      if (config.expiresAt && config.expiresAt < new Date()) {
        return {
          valid: false,
          serverId,
          reason: `Key for server "${serverId}" expired at ${config.expiresAt.toISOString()}`,
        };
      }

      return {
        valid: true,
        serverId,
        scopes: config.scopes,
      };
    }
  }

  // Fallback: check shared MCP_API_KEY
  if (incomingKey === process.env.MCP_API_KEY) {
    return {
      valid: true,
      serverId: expectedServerId || 'shared',
      scopes: ['admin:*' as OAuthScope], // Shared key gets full access
    };
  }

  return { valid: false, reason: 'Unknown API key' };
}

// ─── Default Registrations ───────────────────────────────────────────────────

/**
 * Register all known HoloScript servers from environment.
 * Call this at MCP server startup.
 */
export function initializeServerKeys(): void {
  const servers = [
    {
      id: 'holoscript-tools',
      scopes: ['tools:read', 'tools:write', 'tools:codebase'] as OAuthScope[],
      label: 'HoloScript Core Platform',
    },
    {
      id: 'holomesh',
      scopes: ['tools:read', 'tools:write', 'tools:admin'] as OAuthScope[],
      label: 'HoloMesh Spatial Network',
    },
    {
      id: 'absorb-service',
      scopes: ['tools:codebase', 'tools:write'] as OAuthScope[],
      label: 'Absorb Service (codebase intelligence)',
    },
  ];

  for (const server of servers) {
    const key = resolveServerKey(server.id);
    if (key) {
      registerServerKey({
        serverId: server.id,
        key,
        scopes: server.scopes,
        issuedAt: new Date(),
        label: server.label,
      });
    }
  }

  console.log(
    `[ServerKeys] Initialized ${serverKeyRegistry.size} server key(s): ` +
      Array.from(serverKeyRegistry.keys()).join(', ')
  );
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

/**
 * Get a summary of configured server keys (safe for logging — no key values).
 */
export function getServerKeyDiagnostics(): {
  totalKeys: number;
  servers: Array<{ id: string; hasPerServerKey: boolean; scopeCount: number; label?: string }>;
} {
  const servers = Array.from(serverKeyRegistry.values()).map((config) => ({
    id: config.serverId,
    hasPerServerKey: hasPerServerKey(config.serverId),
    scopeCount: config.scopes.length,
    label: config.label,
  }));

  return {
    totalKeys: serverKeyRegistry.size,
    servers,
  };
}
