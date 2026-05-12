/**
 * MCP Secrets Broker Handlers
 *
 * Implements the logic for `holo_secrets_*` MCP tools.
 * Delegates to `@holoscript/secrets-broker` for grant logic and
 * `@holoscript/secrets-broker/lease-adapter` for lease resolution.
 *
 * @module mcp-server/secrets-broker-handler
 */

import {
  createSecretGrant,
  createPolicyGatedSecretGrant,
  createMemoryLeaseAdapter,
} from '@holoscript/secrets-broker';
import type { SecretBrokerPolicy } from '@holoscript/secrets-broker';

// Shared in-memory lease adapter for the MCP server process.
// In production this would be backed by the vault-lease-registry PostgreSQL store.
const leaseAdapter = createMemoryLeaseAdapter();

export async function handleSecretsBrokerTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  switch (name) {
    case 'holo_secrets_grant': {
      const namespaceId = String(args.namespaceId ?? '');
      const agentId = String(args.agentId ?? '');
      const secretRef = String(args.secretRef ?? '');
      const capabilityRef = String(args.capabilityRef ?? '');
      const purpose = String(args.purpose ?? '');
      const ttlSeconds =
        typeof args.ttlSeconds === 'number' && Number.isFinite(args.ttlSeconds)
          ? args.ttlSeconds
          : undefined;
      const policy = (args.policy as SecretBrokerPolicy | undefined) ?? undefined;

      if (policy) {
        const result = createPolicyGatedSecretGrant(
          { namespaceId, agentId, secretRef, capabilityRef, purpose, ttlSeconds },
          policy
        );
        // Also issue a lease so resolve/revoke work end-to-end.
        const lease = await leaseAdapter.issueLease({
          taskId: result.grant.grantId,
          agentId,
          scope: [secretRef],
          durationMs: (ttlSeconds ?? 15 * 60) * 1000,
        });
        return {
          status: 'granted',
          grant: result.grant,
          policyDecision: result.policyDecision,
          leaseId: lease.leaseId,
          leaseExpiresAt: lease.expiresAt,
        };
      }

      const grant = createSecretGrant({
        namespaceId,
        agentId,
        secretRef,
        capabilityRef,
        purpose,
        ttlSeconds,
      });
      const lease = await leaseAdapter.issueLease({
        taskId: grant.grantId,
        agentId,
        scope: [secretRef],
        durationMs: (ttlSeconds ?? 15 * 60) * 1000,
      });
      return {
        status: 'granted',
        grant,
        leaseId: lease.leaseId,
        leaseExpiresAt: lease.expiresAt,
      };
    }

    case 'holo_secrets_resolve': {
      const leaseId = String(args.leaseId ?? '');
      const agentId = String(args.agentId ?? '');
      const secretRef = String(args.secretRef ?? '');
      const result = await leaseAdapter.resolveLease({ leaseId, agentId, secretRef });
      return {
        ok: result.ok,
        reason: result.reason,
        leaseId,
        agentId,
        secretRef,
      };
    }

    case 'holo_secrets_revoke': {
      const leaseId = String(args.leaseId ?? '');
      const reason = String(args.reason ?? 'manual');
      const by = String(args.by ?? 'system');
      const result = await leaseAdapter.revokeLease({ leaseId, reason, by });
      return {
        ok: result.ok,
        leaseId,
        reason,
        by,
      };
    }

    default:
      return null;
  }
}
