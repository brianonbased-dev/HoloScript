/**
 * MCP Secrets Broker Handlers
 *
 * Implements the logic for `holo_secrets_*` MCP tools.
 * Delegates to `@holoscript/secrets-broker` for grant logic and
 * `@holoscript/secrets-broker/lease-adapter` for lease resolution.
 *
 * Authorization: when called with a SigningContext (caller has access to a
 * verified per-request signing envelope), each tool is gated via
 * `requireCapability` so a caller MUST present a capability-token-scoped
 * envelope or an explicitly-permitted classical/dual envelope. Calls without
 * a signing context preserve the legacy ungated behavior — this matches the
 * existing TOOL_DISPATCH_REGISTRY path which threads only (name, args) per
 * the MCP tool contract. Once the dispatch chain is upgraded to pass
 * SigningContext through (canary task_1778596074561_adcf), every call gets
 * the gate automatically without any change here.
 *
 * Per-tool capability scopes:
 *   - holo_secrets_grant   → 'secrets:grant.create'
 *   - holo_secrets_resolve → 'secrets:grant.resolve'
 *   - holo_secrets_revoke  → 'secrets:grant.revoke'
 *
 * @module mcp-server/secrets-broker-handler
 */

import {
  createSecretGrant,
  createPolicyGatedSecretGrant,
  createMemoryLeaseAdapter,
} from '@holoscript/secrets-broker';
import type { Capability, SecretBrokerPolicy } from '@holoscript/secrets-broker';
import {
  requireCapability,
  type SigningContext,
  type RequireCapabilityOptions,
} from './holomesh/identity/signing-middleware';

// Shared in-memory lease adapter for the MCP server process.
// In production this would be backed by the vault-lease-registry PostgreSQL store.
const leaseAdapter = createMemoryLeaseAdapter();

/**
 * Per-tool capability requirements. The MCP dispatch path passes a
 * SigningContext through when available; each tool is gated against the
 * capability listed here. Tools NOT listed here run ungated (legacy path).
 */
export const SECRETS_BROKER_TOOL_CAPABILITIES: Record<string, Capability> = {
  holo_secrets_grant: 'secrets:grant.create' as Capability,
  holo_secrets_resolve: 'secrets:grant.resolve' as Capability,
  holo_secrets_revoke: 'secrets:grant.revoke' as Capability,
};

export interface SecretsBrokerAuthError {
  readonly authError: true;
  readonly reason: string;
  readonly tool: string;
  readonly requiredCapability: Capability;
}

/**
 * Gate a secrets-broker tool call against the SigningContext.
 *
 * Returns `null` when authorized (or when no signingCtx is provided —
 * matches legacy ungated behavior). Returns a `SecretsBrokerAuthError` when
 * a signingCtx is provided but the request is not authorized for `name`.
 */
export function gateSecretsBrokerTool(
  name: string,
  signingCtx?: SigningContext,
  options?: RequireCapabilityOptions
): SecretsBrokerAuthError | null {
  if (!signingCtx) return null; // Legacy ungated path.
  const cap = SECRETS_BROKER_TOOL_CAPABILITIES[name];
  if (!cap) return null; // Tool name unknown to the gate — let downstream reject.
  const auth = requireCapability(signingCtx, cap, options);
  if (auth.authorized) return null;
  return { authError: true, reason: auth.reason, tool: name, requiredCapability: cap };
}

export async function handleSecretsBrokerTool(
  name: string,
  args: Record<string, unknown>,
  signingCtx?: SigningContext,
  authOptions?: RequireCapabilityOptions
): Promise<unknown | null> {
  // Authorization gate — runs only when caller threads a SigningContext.
  // Legacy callers (current TOOL_DISPATCH_REGISTRY entries) omit this and
  // keep working unchanged.
  const authError = gateSecretsBrokerTool(name, signingCtx, authOptions);
  if (authError) return authError;

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
