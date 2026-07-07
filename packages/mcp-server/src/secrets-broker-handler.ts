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
import {
  interceptToolCall,
  type PolicyInterceptorResult,
} from './policy/PolicyInterceptor';
import { randomUUID } from 'crypto';

// Shared in-memory lease adapter for the MCP server process.
// In production this would be backed by the vault-lease-registry PostgreSQL store.
const leaseAdapter = createMemoryLeaseAdapter();

/**
 * Tools gated by the CG-098 PolicyInterceptor tracer bullet (declarative
 * PolicyPackTrait, additive alongside the SigningContext capability gate
 * above). Scoped to `holo_secrets_grant` only — the narrow tool family named
 * in the board task; `holo_secrets_resolve`/`holo_secrets_revoke` are not
 * gated by this tracer bullet.
 */
const POLICY_INTERCEPTED_TOOLS = new Set(['holo_secrets_grant']);

export interface PolicyInterceptorAuthError {
  readonly authError: true;
  readonly reason: string;
  readonly tool: string;
  readonly policyReceipt: PolicyInterceptorResult['receipt'];
}

/**
 * Run the PolicyInterceptor for a gated tool call. Returns `null` when the
 * call is allowed to proceed (decision is `allow` or `audit` — audit records
 * the decision but does not block execution). Returns a
 * `PolicyInterceptorAuthError` when the decision is `deny` or
 * `approval_required` (both block execution in this tracer bullet — no
 * async approval workflow exists yet, so `approval_required` fails closed).
 *
 * Fail-safe: if the interceptor itself throws (e.g. the fixture is missing
 * or fails to parse), the call is DENIED, never silently allowed — a broken
 * policy source must not become an open gate.
 */
export function gatePolicyInterceptedTool(
  name: string,
  args: Record<string, unknown>,
  callerId: string
): { authError: PolicyInterceptorAuthError | null; result: PolicyInterceptorResult | null } {
  if (!POLICY_INTERCEPTED_TOOLS.has(name)) return { authError: null, result: null };

  const toolCallId = randomUUID();
  let result: PolicyInterceptorResult;
  try {
    result = interceptToolCall({
      callerId,
      tool: name,
      resource: String(args.secretRef ?? args.capabilityRef ?? 'unknown'),
      lane: 'stdio',
      args,
      toolCallId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      authError: {
        authError: true,
        reason: `policy_interceptor_failed: ${message}`,
        tool: name,
        policyReceipt: {
          receiptId: `policy_error_${toolCallId}`,
          schemaVersion: '1.0.0',
          recordedAt: new Date().toISOString(),
          policyId: 'unknown',
          decision: 'deny',
          caller: callerId,
          action: name,
          resource: String(args.secretRef ?? args.capabilityRef ?? 'unknown'),
          reason: 'policy_interceptor_failed',
          toolCallId,
        },
      },
      result: null,
    };
  }

  if (result.decision.decision === 'deny' || result.decision.decision === 'approval_required') {
    return {
      authError: {
        authError: true,
        reason: result.decision.reason,
        tool: name,
        policyReceipt: result.receipt,
      },
      result,
    };
  }

  // 'allow' and 'audit' both proceed; 'audit' still carries a receipt the
  // caller can inspect via `result`.
  return { authError: null, result };
}

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

function hasClassicalBrokerScope(signingCtx: SigningContext, capability: Capability): boolean {
  if (signingCtx.signingProtocol !== 'classical') return false;
  return hasBrokerScope(signingCtx, capability);
}

function hasBrokerScope(signingCtx: SigningContext, capability: Capability): boolean {
  const scopes = new Set((signingCtx.scopes ?? []).map(String));
  return (
    scopes.has('admin:*') ||
    scopes.has('tools:admin') ||
    scopes.has(String(capability))
  );
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
  if (
    cap &&
    !signingCtx.signedRequest &&
    signingCtx.signingValid &&
    signingCtx.signer &&
    hasBrokerScope(signingCtx, cap)
  ) {
    return null;
  }
  if (!cap) return null; // Tool name unknown to the gate — let downstream reject.
  const authOptions = options ?? (
    hasClassicalBrokerScope(signingCtx, cap) ? { allowClassical: true } : undefined
  );
  const auth = requireCapability(signingCtx, cap, authOptions);
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

  // CG-098 PolicyInterceptor gate — declarative PolicyPackTrait decision,
  // additive alongside the SigningContext capability gate above. Runs BEFORE
  // the tool body so a `deny`/`approval_required` decision blocks execution
  // (createSecretGrant / createPolicyGatedSecretGrant never run).
  const callerId = signingCtx?.signer ?? String(args.agentId ?? 'unknown');
  const { authError: policyAuthError, result: policyResult } = gatePolicyInterceptedTool(
    name,
    args,
    callerId
  );
  if (policyAuthError) return policyAuthError;

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
      const policyReceipt = policyResult?.receipt;

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
          policyReceipt,
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
        policyReceipt,
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
