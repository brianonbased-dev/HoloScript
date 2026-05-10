import { describe, expect, it } from 'vitest';
import { createSecretGrant } from '../secretBroker';

describe('createSecretGrant', () => {
  it('issues a deterministic brokered handle receipt without plaintext', () => {
    const grant = createSecretGrant({
      workspaceId: 'ws_octocat',
      agentId: 'agent_secret_custodian',
      secretRef: 'secret://workspace/ws_octocat/holoscript/orchestrator/api-key',
      capabilityRef: 'cap://daemon/secrets/broker-only',
      purpose: 'Run HoloScript MCP tool through broker',
      ttlSeconds: 300,
      now: new Date('2026-05-10T10:00:00.000Z'),
    });

    expect(grant).toMatchObject({
      workspaceId: 'ws_octocat',
      agentId: 'agent_secret_custodian',
      accessMode: 'brokered-handle',
      plaintextReturned: false,
      issuedAt: '2026-05-10T10:00:00.000Z',
      expiresAt: '2026-05-10T10:05:00.000Z',
    });
    expect(grant.grantId).toMatch(/^sgrant_[a-f0-9]{24}$/);
    expect(grant.receiptHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(grant)).not.toContain('sk-');
    expect(JSON.stringify(grant)).not.toContain('gho_');
  });

  it('rejects secret refs outside the workspace', () => {
    expect(() =>
      createSecretGrant({
        workspaceId: 'ws_octocat',
        agentId: 'agent_builder',
        secretRef: 'secret://workspace/ws_other/github/oauth/access-token',
        capabilityRef: 'cap://daemon/secrets/broker-only',
        purpose: 'Use GitHub API',
      })
    ).toThrow(/scoped to the workspace/);
  });

  it('rejects non-secret daemon capabilities', () => {
    expect(() =>
      createSecretGrant({
        workspaceId: 'ws_octocat',
        agentId: 'agent_builder',
        secretRef: 'secret://workspace/ws_octocat/github/oauth/access-token',
        capabilityRef: 'cap://daemon/code/write-scoped',
        purpose: 'Use GitHub API',
      })
    ).toThrow(/daemon secret capability/);
  });
});
