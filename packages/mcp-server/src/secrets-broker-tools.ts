/**
 * MCP Secrets Broker Tools
 *
 * Wraps `@holoscript/secrets-broker` into MCP tool definitions so any AI agent
 * can issue, resolve, and revoke brokered secret grants through the protocol.
 *
 * Tools:
 *   - holo_secrets_grant   : Issue a brokered secret handle (no plaintext returned)
 *   - holo_secrets_resolve : Check whether a lease permits a secret ref
 *   - holo_secrets_revoke  : Revoke an active lease
 *
 * @module mcp-server/secrets-broker-tools
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const secretsBrokerTools: Tool[] = [
  {
    name: 'holo_secrets_grant',
    description:
      'Issue a brokered secret grant receipt. The agent receives a handle (not the plaintext) ' +
      'scoped to a namespace, secret ref, and capability. The grant is time-bounded and auditable. ' +
      'Returns a signed receipt with grantId, expiry, and receiptHash. NEVER returns secret values.',
    inputSchema: {
      type: 'object',
      properties: {
        namespaceId: {
          type: 'string',
          description: 'Namespace that scopes the secret (workspace, team, or project id)',
        },
        agentId: {
          type: 'string',
          description: 'Registered agent identity (x402 seat, HoloMesh agentId, etc.)',
        },
        secretRef: {
          type: 'string',
          description:
            'Canonical secret reference, e.g. secret://namespace/{id}/holoscript/orchestrator/api-key',
        },
        capabilityRef: {
          type: 'string',
          description: 'Daemon capability being requested, e.g. cap://daemon/secrets/broker-only',
        },
        purpose: {
          type: 'string',
          description: 'Human-readable purpose for audit and compliance',
        },
        ttlSeconds: {
          type: 'number',
          description: 'Time-to-live in seconds (default 900, max 3600)',
        },
        policy: {
          type: 'object',
          description: 'Optional HoloDoor policy gate to enforce before issuance',
          properties: {
            secretGrants: {
              type: 'object',
              properties: {
                allowedSecretRefPrefixes: { type: 'array', items: { type: 'string' } },
                blockedSecretRefPrefixes: { type: 'array', items: { type: 'string' } },
                allowedCapabilityRefs: { type: 'array', items: { type: 'string' } },
                blockedCapabilityRefs: { type: 'array', items: { type: 'string' } },
                allowedAgentIds: { type: 'array', items: { type: 'string' } },
                blockedAgentIds: { type: 'array', items: { type: 'string' } },
                maxTtlSeconds: { type: 'number' },
                requirePurpose: { type: 'boolean' },
              },
            },
            enforcement: {
              type: 'object',
              properties: {
                onViolation: { type: 'string', enum: ['warn', 'block'] },
              },
            },
          },
        },
      },
      required: ['namespaceId', 'agentId', 'secretRef', 'capabilityRef', 'purpose'],
    },
  },
  {
    name: 'holo_secrets_resolve',
    description:
      'Resolve whether an active lease permits reading a secret ref. ' +
      'Returns { ok, reason? } — the actual secret value is fetched by a separate secret-store adapter.',
    inputSchema: {
      type: 'object',
      properties: {
        leaseId: {
          type: 'string',
          description: 'Lease id returned by holo_secrets_grant or the lease adapter',
        },
        agentId: {
          type: 'string',
          description: 'Agent id that holds the lease',
        },
        secretRef: {
          type: 'string',
          description: 'Canonical secret reference to resolve',
        },
      },
      required: ['leaseId', 'agentId', 'secretRef'],
    },
  },
  {
    name: 'holo_secrets_revoke',
    description:
      'Revoke an active lease early (task done, agent compromise, rotation, etc.). ' +
      'Idempotent on already-revoked leases.',
    inputSchema: {
      type: 'object',
      properties: {
        leaseId: {
          type: 'string',
          description: 'Lease id to revoke',
        },
        reason: {
          type: 'string',
          enum: ['task_completed', 'task_released', 'agent_compromise', 'expired_sweep', 'rotation', 'manual'],
          description: 'Reason for revocation',
        },
        by: {
          type: 'string',
          description: 'Agent id or system identifier performing the revocation',
        },
      },
      required: ['leaseId', 'reason', 'by'],
    },
  },
];
