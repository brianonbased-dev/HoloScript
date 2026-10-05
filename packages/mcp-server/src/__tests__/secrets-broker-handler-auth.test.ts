/**
 * Tests for the optional auth gate on handleSecretsBrokerTool.
 *
 * Coverage:
 * - Legacy path: no signingCtx → gate is a no-op (preserves ungated behavior
 *   for the existing TOOL_DISPATCH_REGISTRY callers that don't yet thread
 *   SigningContext).
 * - Gated path: signingCtx + correct capability scope → tool runs.
 * - Gated path rejection: signingCtx without the required capability →
 *   returns a structured SecretsBrokerAuthError, never executes the tool.
 *
 * Discipline: G.GOLD.013 paired FALSE+TRUE for every tool × gate combination.
 *
 * Companion to F.051 canary task_1778596074561_adcf — this is the first
 * concrete step closing the holo_secrets_* authorization gap. The dispatch
 * chain upgrade (handlers.ts threading SigningContext through to per-tool
 * handlers) is a follow-up; this commit ships the primitive ready to be
 * adopted with no breaking changes.
 */
import { describe, it, expect } from 'vitest';
import type { Capability } from '@holoscript/secrets-broker';
import {
  handleSecretsBrokerTool,
  gateSecretsBrokerTool,
  SECRETS_BROKER_TOOL_CAPABILITIES,
  type SecretsBrokerAuthError,
} from '../secrets-broker-handler';
import type { SigningContext } from '../holomesh/identity/signing-middleware';

// ── Test fixtures ─────────────────────────────────────────────────────

function capabilityCtx(scope: Capability): SigningContext {
  return {
    signedRequest: true,
    signingValid: true,
    signer: 'claude1',
    signingProtocol: 'capability',
    capabilityScope: scope,
  };
}

function classicalCtx(scopes: string[] = []): SigningContext {
  return {
    signedRequest: true,
    signingValid: true,
    signer: '0xcafe',
    signingProtocol: 'classical',
    scopes,
  };
}

function dualCtx(): SigningContext {
  return {
    signedRequest: true,
    signingValid: true,
    signer: '0xcafe',
    signingProtocol: 'dual',
    dualMode: 'dual',
  };
}

function unsignedCtx(): SigningContext {
  return {
    signedRequest: false,
    signingValid: true,
    signer: null,
    signingProtocol: 'classical',
    signingReason: 'unsigned-grace',
  };
}

function bearerScopeCtx(scopes: string[], signer = 'agent_api_key'): SigningContext {
  return {
    signedRequest: false,
    signingValid: true,
    signer,
    scopes,
  };
}

const validGrantArgs = {
  namespaceId: 'ns_test',
  agentId: 'agent1',
  secretRef: 'secret://namespace/ns_test/holoscript/orchestrator/api-key',
  capabilityRef: 'cap://daemon/secrets/broker-only',
  purpose: 'unit-test',
};

// ── gateSecretsBrokerTool (pure helper) ────────────────────────────────

/** Run `body` with HOLOSCRIPT_MCP_TRANSPORT set to `transport` (or unset), then restore it. */
async function onTransport<T>(transport: string | undefined, body: () => T | Promise<T>) {
  const saved = process.env.HOLOSCRIPT_MCP_TRANSPORT;
  if (transport === undefined) delete process.env.HOLOSCRIPT_MCP_TRANSPORT;
  else process.env.HOLOSCRIPT_MCP_TRANSPORT = transport;
  try {
    return await body();
  } finally {
    if (saved === undefined) delete process.env.HOLOSCRIPT_MCP_TRANSPORT;
    else process.env.HOLOSCRIPT_MCP_TRANSPORT = saved;
  }
}

describe('gateSecretsBrokerTool — pure helper', () => {
  it('FALSE: no signingCtx on the stdio server → null (the local user, legacy ungated path)', async () => {
    await onTransport('stdio', () =>
      expect(gateSecretsBrokerTool('holo_secrets_grant', undefined)).toBeNull()
    );
  });

  // task mplw: off the stdio server a missing context is a call that lost its caller, not the
  // local user, so a secrets tool refuses it.
  it('TRUE: no signingCtx over HTTP → SecretsBrokerAuthError (nobody is not the local user)', async () => {
    await onTransport('http', () => {
      const err = gateSecretsBrokerTool('holo_secrets_resolve', undefined);
      expect(err).toMatchObject({ authError: true, tool: 'holo_secrets_resolve' });
      expect(err?.reason).toMatch(/no caller/);
    });
  });

  it('TRUE: no signingCtx and no transport marker → SecretsBrokerAuthError', async () => {
    await onTransport(undefined, () =>
      expect(gateSecretsBrokerTool('holo_secrets_grant', undefined)).toMatchObject({
        authError: true,
      })
    );
  });

  it('FALSE: unknown tool name → null (gate defers to downstream)', () => {
    expect(
      gateSecretsBrokerTool('holo_secrets_unknown', capabilityCtx('mesh:read' as Capability))
    ).toBeNull();
  });

  it('TRUE: capability ctx with matching scope → null (authorized)', () => {
    const ctx = capabilityCtx('secrets:grant.create' as Capability);
    expect(gateSecretsBrokerTool('holo_secrets_grant', ctx)).toBeNull();
  });

  it('FALSE: capability ctx with WRONG scope → SecretsBrokerAuthError', () => {
    const ctx = capabilityCtx('mesh:read' as Capability);
    const r = gateSecretsBrokerTool('holo_secrets_grant', ctx);
    expect(r).not.toBeNull();
    expect(r!.authError).toBe(true);
    expect(r!.tool).toBe('holo_secrets_grant');
    expect(r!.requiredCapability).toBe('secrets:grant.create');
    expect(r!.reason).toBe('capability-scope-mismatch');
  });

  it('FALSE: classical ctx without allowClassical → capability-required', () => {
    const r = gateSecretsBrokerTool('holo_secrets_grant', classicalCtx());
    expect(r).not.toBeNull();
    expect(r!.reason).toBe('capability-required');
  });

  it('TRUE: classical ctx WITH allowClassical → null (authorized)', () => {
    const r = gateSecretsBrokerTool('holo_secrets_grant', classicalCtx(), {
      allowClassical: true,
    });
    expect(r).toBeNull();
  });

  it('TRUE: classical ctx with admin scope authorizes broker tool', () => {
    expect(gateSecretsBrokerTool('holo_secrets_grant', classicalCtx(['admin:*']))).toBeNull();
  });

  it('TRUE: classical ctx with exact broker capability authorizes that tool', () => {
    expect(
      gateSecretsBrokerTool('holo_secrets_resolve', classicalCtx(['secrets:grant.resolve']))
    ).toBeNull();
  });

  it('TRUE: dual ctx (default allowDual=true) → null (authorized)', () => {
    expect(gateSecretsBrokerTool('holo_secrets_grant', dualCtx())).toBeNull();
  });

  it('FALSE: dual ctx with allowDual=false → capability-required', () => {
    const r = gateSecretsBrokerTool('holo_secrets_grant', dualCtx(), { allowDual: false });
    expect(r).not.toBeNull();
    expect(r!.reason).toBe('capability-required');
  });

  it('FALSE: unsigned ctx → unsigned (regardless of tool)', () => {
    const r = gateSecretsBrokerTool('holo_secrets_grant', unsignedCtx());
    expect(r).not.toBeNull();
    expect(r!.reason).toBe('unsigned');
  });

  it('TRUE: bearer/API-key ctx with admin scope authorizes broker tools', () => {
    expect(gateSecretsBrokerTool('holo_secrets_grant', bearerScopeCtx(['admin:*']))).toBeNull();
  });

  it('TRUE: bearer/API-key ctx with exact broker scope authorizes only that tool', () => {
    expect(
      gateSecretsBrokerTool('holo_secrets_resolve', bearerScopeCtx(['secrets:grant.resolve']))
    ).toBeNull();
    const wrongTool = gateSecretsBrokerTool(
      'holo_secrets_revoke',
      bearerScopeCtx(['secrets:grant.resolve'])
    );
    expect(wrongTool?.reason).toBe('unsigned');
  });
});

// ── Per-tool capability map ──────────────────────────────────────────

describe('SECRETS_BROKER_TOOL_CAPABILITIES', () => {
  it('TRUE: maps each of the 3 holo_secrets_* tools to its own capability', () => {
    expect(SECRETS_BROKER_TOOL_CAPABILITIES['holo_secrets_grant']).toBe('secrets:grant.create');
    expect(SECRETS_BROKER_TOOL_CAPABILITIES['holo_secrets_resolve']).toBe('secrets:grant.resolve');
    expect(SECRETS_BROKER_TOOL_CAPABILITIES['holo_secrets_revoke']).toBe('secrets:grant.revoke');
  });

  it('TRUE: scopes are distinct (no privilege escalation between tools)', () => {
    const scopes = Object.values(SECRETS_BROKER_TOOL_CAPABILITIES);
    expect(new Set(scopes).size).toBe(scopes.length);
  });
});

// ── handleSecretsBrokerTool integration ──────────────────────────────

describe('handleSecretsBrokerTool — auth integration', () => {
  it('FALSE: legacy call (no signingCtx) on the stdio server → tool runs ungated (the local user)', async () => {
    const result = (await onTransport('stdio', () =>
      handleSecretsBrokerTool('holo_secrets_grant', validGrantArgs)
    )) as {
      status?: string;
      grant?: { grantId?: string };
    };
    expect(result.status).toBe('granted');
    expect(result.grant?.grantId).toBeDefined();
  });

  it('TRUE: the same call with no signingCtx over HTTP → auth error, no grant made (task mplw)', async () => {
    const result = (await onTransport('http', () =>
      handleSecretsBrokerTool('holo_secrets_grant', validGrantArgs)
    )) as SecretsBrokerAuthError & { status?: string };
    expect(result.authError).toBe(true);
    expect(result.status).toBeUndefined();
  });

  it('TRUE: gated call with correct capability scope → tool runs', async () => {
    const ctx = capabilityCtx('secrets:grant.create' as Capability);
    const result = (await handleSecretsBrokerTool('holo_secrets_grant', validGrantArgs, ctx)) as {
      status?: string;
      grant?: { grantId?: string };
      authError?: boolean;
    };
    expect(result.authError).toBeUndefined();
    expect(result.status).toBe('granted');
  });

  it('FALSE: gated call with WRONG capability scope → SecretsBrokerAuthError, tool not run', async () => {
    const ctx = capabilityCtx('mesh:read' as Capability);
    const result = (await handleSecretsBrokerTool(
      'holo_secrets_grant',
      validGrantArgs,
      ctx
    )) as SecretsBrokerAuthError;
    expect(result.authError).toBe(true);
    expect(result.tool).toBe('holo_secrets_grant');
    expect(result.reason).toBe('capability-scope-mismatch');
  });

  it('FALSE: gated call without signing → unsigned auth error', async () => {
    const result = (await handleSecretsBrokerTool(
      'holo_secrets_grant',
      validGrantArgs,
      unsignedCtx()
    )) as SecretsBrokerAuthError;
    expect(result.authError).toBe(true);
    expect(result.reason).toBe('unsigned');
  });

  it('TRUE: each tool gates against its own capability (no cross-grant)', async () => {
    // Token scoped to "grant.create" must NOT be able to call holo_secrets_revoke.
    const grantCtx = capabilityCtx('secrets:grant.create' as Capability);
    const revokeResult = (await handleSecretsBrokerTool(
      'holo_secrets_revoke',
      { leaseId: 'l1', reason: 'test', by: 'tester' },
      grantCtx
    )) as SecretsBrokerAuthError;
    expect(revokeResult.authError).toBe(true);
    expect(revokeResult.requiredCapability).toBe('secrets:grant.revoke');
  });

  it('TRUE: revoke-scoped token CAN call holo_secrets_revoke', async () => {
    const revokeCtx = capabilityCtx('secrets:grant.revoke' as Capability);
    const result = (await handleSecretsBrokerTool(
      'holo_secrets_revoke',
      { leaseId: 'unknown-lease', reason: 'test', by: 'tester' },
      revokeCtx
    )) as { ok?: boolean; authError?: boolean };
    // Auth passes; downstream returns ok: false because leaseId doesn't exist.
    // What matters here is that the auth gate did NOT short-circuit.
    expect(result.authError).toBeUndefined();
    expect(result).toHaveProperty('ok');
  });

  it('TRUE: classical-with-allowClassical opt-in → tool runs even on capability-scoped tools', async () => {
    const result = (await handleSecretsBrokerTool(
      'holo_secrets_grant',
      validGrantArgs,
      classicalCtx(),
      { allowClassical: true }
    )) as { status?: string; authError?: boolean };
    expect(result.authError).toBeUndefined();
    expect(result.status).toBe('granted');
  });

  it('TRUE: classical signed request with HTTP admin scope authorizes broker tool', async () => {
    const result = (await handleSecretsBrokerTool(
      'holo_secrets_grant',
      validGrantArgs,
      classicalCtx(['admin:*'])
    )) as { status?: string; authError?: boolean };
    expect(result.authError).toBeUndefined();
    expect(result.status).toBe('granted');
  });

  it('TRUE: HTTP/API-key bearer admin context authorizes broker tool', async () => {
    const result = (await handleSecretsBrokerTool(
      'holo_secrets_grant',
      validGrantArgs,
      bearerScopeCtx(['tools:admin'])
    )) as { status?: string; authError?: boolean };
    expect(result.authError).toBeUndefined();
    expect(result.status).toBe('granted');
  });
});
