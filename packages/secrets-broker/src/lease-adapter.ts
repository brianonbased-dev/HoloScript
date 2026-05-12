/**
 * Lease adapter — bridge between the secrets broker and a vault-lease registry.
 *
 * The broker itself never stores leases. It delegates to an adapter that
 * wraps a vault implementation (e.g. HoloMesh vault-lease-registry,
 * HashiCorp Vault, AWS Secrets Manager, or an in-memory mock for tests).
 *
 * @module secrets-broker/lease-adapter
 */

import { type SecretRef, type LeaseAdapter } from './types';

/**
 * In-memory lease adapter for tests and local development.
 * NOT for production — secrets are not persisted and leases evaporate
 * on process exit.
 */
export function createMemoryLeaseAdapter(): LeaseAdapter {
  const leases = new Map<
    string,
    {
      leaseId: string;
      taskId: string;
      agentId: string;
      scope: SecretRef[];
      expiresAt: string;
      revoked?: boolean;
    }
  >();

  return {
    async issueLease(params) {
      const leaseId = `lease-mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const durationMs = params.durationMs ?? 15 * 60 * 1000;
      const expiresAt = new Date(Date.now() + durationMs).toISOString();
      leases.set(leaseId, {
        leaseId,
        taskId: params.taskId,
        agentId: params.agentId,
        scope: [...params.scope],
        expiresAt,
      });
      return { leaseId, expiresAt };
    },

    async resolveLease(params) {
      const lease = leases.get(params.leaseId);
      if (!lease) return { ok: false, reason: 'lease_not_found' };
      if (lease.revoked) return { ok: false, reason: 'lease_revoked' };
      if (new Date(lease.expiresAt) <= new Date()) return { ok: false, reason: 'lease_expired' };
      if (lease.agentId !== params.agentId) return { ok: false, reason: 'lease_agent_mismatch' };
      if (!lease.scope.includes(params.secretRef)) return { ok: false, reason: 'lease_scope_violation' };
      return { ok: true };
    },

    async revokeLease(params) {
      const lease = leases.get(params.leaseId);
      if (!lease) return { ok: false };
      lease.revoked = true;
      return { ok: true };
    },
  };
}

/**
 * No-op lease adapter that always denies. Useful as a safe default
 * when no vault is configured.
 */
export function createNoOpLeaseAdapter(): LeaseAdapter {
  return {
    async issueLease() {
      return { leaseId: 'noop', expiresAt: new Date().toISOString() };
    },
    async resolveLease() {
      return { ok: false, reason: 'no_op_adapter' };
    },
    async revokeLease() {
      return { ok: false };
    },
  };
}
