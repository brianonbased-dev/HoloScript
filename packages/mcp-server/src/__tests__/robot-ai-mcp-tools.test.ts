/**
 * Robot / AI MCP Tools — unit tests
 *
 * Covers: identity CRUD, safety envelope CRUD, permission CRUD,
 * robot actuation, AI invocation, receipt capture, dispatcher, registry clear.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleRobotAiMcpTool,
  clearRobotAiRegistries,
  robotAiMcpTools,
  twinEarthIdentityRegistry,
  twinEarthReceiptRegistry,
} from '../robot-ai-mcp-tools';

// evaluateActuation is imported by the SUT; vitest auto-mocks @holoscript/framework
// if a __mocks__ exists, otherwise we let it run its real (lightweight) logic.

async function registerIdentity(overrides?: Record<string, unknown>) {
  return handleRobotAiMcpTool('twin_earth_register_identity', {
    walletAddress: '0x1234',
    handle: 'test-bot',
    attestation: 'sig-abc',
    kind: 'robot',
    ...overrides,
  });
}

async function registerAI(overrides?: Record<string, unknown>) {
  return handleRobotAiMcpTool('twin_earth_register_identity', {
    walletAddress: '0xabcd',
    handle: 'test-ai',
    attestation: 'sig-def',
    kind: 'ai',
    ...overrides,
  });
}

describe('robot-ai-mcp-tools', () => {
  beforeEach(() => {
    clearRobotAiRegistries();
  });

  // ===========================================================================
  // Tool definitions
  // ===========================================================================

  it('exports 17 tool definitions', async () => {
    expect(robotAiMcpTools).toHaveLength(17);
  });

  it('each tool has name and inputSchema', () => {
    for (const tool of robotAiMcpTools) {
      expect(tool.name).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
    }
  });

  // ===========================================================================
  // Dispatcher
  // ===========================================================================

  it('dispatcher returns error for unknown tool', async () => {
    const result = await handleRobotAiMcpTool('twin_earth_unknown', {});
    expect(result).toMatchObject({
      error: expect.stringContaining('Unknown robot/AI tool'),
    });
  });

  // ===========================================================================
  // Identity CRUD
  // ===========================================================================

  describe('twin_earth_register_identity', () => {
    it('registers a robot identity', async () => {
      const result = (await registerIdentity()) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.agentId).toMatch(/^agent_\d+_[a-z0-9]+$/);
      expect(result.handle).toBe('test-bot');
      expect(result.kind).toBe('robot');
    });

    it('registers an AI identity', async () => {
      const result = (await registerAI()) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.kind).toBe('ai');
    });

    it('rejects missing walletAddress', async () => {
      const result = await handleRobotAiMcpTool('twin_earth_register_identity', {
        handle: 'x',
        attestation: 'x',
        kind: 'robot',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('walletAddress') });
    });

    it('rejects missing handle', async () => {
      const result = await handleRobotAiMcpTool('twin_earth_register_identity', {
        walletAddress: '0x1',
        attestation: 'x',
        kind: 'robot',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('handle') });
    });

    it('rejects missing attestation', async () => {
      const result = await handleRobotAiMcpTool('twin_earth_register_identity', {
        walletAddress: '0x1',
        handle: 'x',
        kind: 'robot',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('attestation') });
    });

    it('rejects invalid kind', async () => {
      const result = await handleRobotAiMcpTool('twin_earth_register_identity', {
        walletAddress: '0x1',
        handle: 'x',
        attestation: 'x',
        kind: 'human',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('kind') });
    });

    it('uses provided agentId', async () => {
      const result = (await registerIdentity({ agentId: 'my-robot' })) as Record<string, unknown>;
      expect(result.agentId).toBe('my-robot');
    });
  });

  describe('twin_earth_get_identity', () => {
    it('gets existing identity', async () => {
      await registerIdentity({ agentId: 'get-test' });
      const result = (await handleRobotAiMcpTool('twin_earth_get_identity', {
        agentId: 'get-test',
      })) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect((result.identity as Record<string, unknown>).agentId).toBe('get-test');
    });

    it('returns error for missing identity', async () => {
      const result = await handleRobotAiMcpTool('twin_earth_get_identity', {
        agentId: 'missing',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('not found') });
    });
  });

  describe('twin_earth_update_identity', () => {
    it('updates handle and role', async () => {
      await registerIdentity({ agentId: 'upd-test' });
      const result = (await handleRobotAiMcpTool('twin_earth_update_identity', {
        agentId: 'upd-test',
        handle: 'new-handle',
        role: 'steward',
      })) as Record<string, unknown>;
      expect(result.success).toBe(true);
      const identity = result.identity as Record<string, unknown>;
      expect(identity.handle).toBe('new-handle');
      expect(identity.role).toBe('steward');
    });

    it('rejects update of revoked identity', async () => {
      await registerIdentity({ agentId: 'rev-upd', role: 'founder' });
      await handleRobotAiMcpTool('twin_earth_revoke_identity', {
        agentId: 'rev-upd',
        granterId: 'rev-upd',
        revocationSignature: 'sig',
      });
      const result = await handleRobotAiMcpTool('twin_earth_update_identity', {
        agentId: 'rev-upd',
        handle: 'x',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('revoked') });
    });

    it('returns error for missing identity', async () => {
      const result = await handleRobotAiMcpTool('twin_earth_update_identity', {
        agentId: 'missing',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('not found') });
    });
  });

  describe('twin_earth_revoke_identity', () => {
    it('revokes with founder role', async () => {
      await registerIdentity({ agentId: 'revoker', role: 'founder' });
      await registerIdentity({ agentId: 'victim' });
      const result = (await handleRobotAiMcpTool('twin_earth_revoke_identity', {
        agentId: 'victim',
        granterId: 'revoker',
        revocationSignature: 'sig',
      })) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.revoked).toBe(true);
    });

    it('rejects revocation without founder/steward role', async () => {
      await registerIdentity({ agentId: 'revoker', role: 'robot' });
      await registerIdentity({ agentId: 'victim' });
      const result = await handleRobotAiMcpTool('twin_earth_revoke_identity', {
        agentId: 'victim',
        granterId: 'revoker',
        revocationSignature: 'sig',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('founder or steward') });
    });

    it('rejects missing revocationSignature', async () => {
      await registerIdentity({ agentId: 'revoker', role: 'founder' });
      await registerIdentity({ agentId: 'victim' });
      const result = await handleRobotAiMcpTool('twin_earth_revoke_identity', {
        agentId: 'victim',
        granterId: 'revoker',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('revocationSignature') });
    });

    it('deletes safety envelopes on revoke', async () => {
      await registerIdentity({ agentId: 'revoker', role: 'founder' });
      await registerIdentity({ agentId: 'victim' });
      await handleRobotAiMcpTool('twin_earth_create_safety_envelope', {
        agentId: 'victim',
      });
      expect(Array.from(twinEarthIdentityRegistry.values()).length).toBe(2);
      await handleRobotAiMcpTool('twin_earth_revoke_identity', {
        agentId: 'victim',
        granterId: 'revoker',
        revocationSignature: 'sig',
      });
      const envs = await handleRobotAiMcpTool('twin_earth_list_safety_envelopes', {});
      expect((envs as Record<string, unknown>).total).toBe(0);
    });
  });

  describe('twin_earth_list_identities', () => {
    it('lists with role filter', async () => {
      await registerIdentity({ agentId: 'r1', role: 'robot' });
      await registerIdentity({ agentId: 'r2', role: 'founder' });
      const result = (await handleRobotAiMcpTool('twin_earth_list_identities', {
        role: 'founder',
      })) as Record<string, unknown>;
      expect(result.total).toBe(1);
      expect((result.identities as unknown[])[0]).toMatchObject({ agentId: 'r2' });
    });

    it('lists with kind filter', async () => {
      await registerIdentity({ agentId: 'bot1', kind: 'robot' });
      await registerAI({ agentId: 'ai1' });
      const result = (await handleRobotAiMcpTool('twin_earth_list_identities', {
        kind: 'ai',
      })) as Record<string, unknown>;
      expect(result.total).toBe(1);
      expect((result.identities as unknown[])[0]).toMatchObject({ agentId: 'ai1' });
    });

    it('respects limit and offset', async () => {
      await registerIdentity({ agentId: 'a' });
      await registerIdentity({ agentId: 'b' });
      await registerIdentity({ agentId: 'c' });
      const result = (await handleRobotAiMcpTool('twin_earth_list_identities', {
        limit: 1,
        offset: 1,
      })) as Record<string, unknown>;
      expect(result.total).toBe(3);
      expect((result.identities as unknown[])).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Safety Envelope CRUD
  // ===========================================================================

  describe('twin_earth_create_safety_envelope', () => {
    it('creates envelope for valid identity', async () => {
      await registerIdentity({ agentId: 'env-owner' });
      const result = (await handleRobotAiMcpTool('twin_earth_create_safety_envelope', {
        agentId: 'env-owner',
      })) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.envelopeId).toMatch(/^env_\d+_[a-z0-9]+$/);
      expect(result.substrateEnforced).toBe(true);
    });

    it('rejects missing agentId', async () => {
      const result = await handleRobotAiMcpTool('twin_earth_create_safety_envelope', {});
      expect(result).toMatchObject({ error: expect.stringContaining('agentId') });
    });

    it('rejects unknown identity', async () => {
      const result = await handleRobotAiMcpTool('twin_earth_create_safety_envelope', {
        agentId: 'missing',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('not found') });
    });

    it('rejects for revoked identity', async () => {
      await registerIdentity({ agentId: 'rev', role: 'founder' });
      await handleRobotAiMcpTool('twin_earth_revoke_identity', {
        agentId: 'rev',
        granterId: 'rev',
        revocationSignature: 'sig',
      });
      const result = await handleRobotAiMcpTool('twin_earth_create_safety_envelope', {
        agentId: 'rev',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('revoked') });
    });
  });

  describe('twin_earth_get_safety_envelope', () => {
    it('gets existing envelope', async () => {
      await registerIdentity({ agentId: 'env-get' });
      const created = (await handleRobotAiMcpTool('twin_earth_create_safety_envelope', {
        agentId: 'env-get',
        envelopeId: 'my-env',
      })) as Record<string, unknown>;
      const result = (await handleRobotAiMcpTool('twin_earth_get_safety_envelope', {
        envelopeId: 'my-env',
      })) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect((result.envelope as Record<string, unknown>).id).toBe('my-env');
    });

    it('returns error for missing envelope', async () => {
      const result = await handleRobotAiMcpTool('twin_earth_get_safety_envelope', {
        envelopeId: 'missing',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('not found') });
    });
  });

  describe('twin_earth_update_safety_envelope', () => {
    it('updates mutable fields', async () => {
      await registerIdentity({ agentId: 'env-upd' });
      await handleRobotAiMcpTool('twin_earth_create_safety_envelope', {
        agentId: 'env-upd',
        envelopeId: 'upd-env',
      });
      const result = (await handleRobotAiMcpTool('twin_earth_update_safety_envelope', {
        envelopeId: 'upd-env',
        maxTickDurationMs: 5000,
        localOnly: true,
      })) as Record<string, unknown>;
      expect(result.success).toBe(true);
      const env = result.envelope as Record<string, unknown>;
      expect(env.maxTickDurationMs).toBe(5000);
      expect(env.localOnly).toBe(true);
    });

    it('returns error for missing envelope', async () => {
      const result = await handleRobotAiMcpTool('twin_earth_update_safety_envelope', {
        envelopeId: 'missing',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('not found') });
    });
  });

  describe('twin_earth_delete_safety_envelope', () => {
    it('deletes with founder role', async () => {
      await registerIdentity({ agentId: 'del-founder', role: 'founder' });
      await registerIdentity({ agentId: 'env-del' });
      await handleRobotAiMcpTool('twin_earth_create_safety_envelope', {
        agentId: 'env-del',
        envelopeId: 'del-env',
      });
      const result = (await handleRobotAiMcpTool('twin_earth_delete_safety_envelope', {
        envelopeId: 'del-env',
        granterId: 'del-founder',
      })) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.deleted).toBe(true);
    });

    it('rejects without founder/steward role', async () => {
      await registerIdentity({ agentId: 'del-robot', role: 'robot' });
      const result = await handleRobotAiMcpTool('twin_earth_delete_safety_envelope', {
        envelopeId: 'x',
        granterId: 'del-robot',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('founder or steward') });
    });

    it('returns error for missing envelope', async () => {
      await registerIdentity({ agentId: 'del-founder2', role: 'founder' });
      const result = await handleRobotAiMcpTool('twin_earth_delete_safety_envelope', {
        envelopeId: 'missing',
        granterId: 'del-founder2',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('not found') });
    });
  });

  describe('twin_earth_list_safety_envelopes', () => {
    it('lists with agentId filter', async () => {
      await registerIdentity({ agentId: 'e1' });
      await registerIdentity({ agentId: 'e2' });
      await handleRobotAiMcpTool('twin_earth_create_safety_envelope', { agentId: 'e1', envelopeId: 'env1' });
      await handleRobotAiMcpTool('twin_earth_create_safety_envelope', { agentId: 'e2', envelopeId: 'env2' });
      const result = (await handleRobotAiMcpTool('twin_earth_list_safety_envelopes', {
        agentId: 'e1',
      })) as Record<string, unknown>;
      expect(result.total).toBe(1);
      expect((result.envelopes as unknown[])[0]).toMatchObject({ id: 'env1' });
    });
  });

  // ===========================================================================
  // Permission CRUD
  // ===========================================================================

  describe('twin_earth_grant_permission', () => {
    it('grants permission', async () => {
      await registerIdentity({ agentId: 'grantee' });
      await registerIdentity({ agentId: 'granter' });
      const result = (await handleRobotAiMcpTool('twin_earth_grant_permission', {
        granteeId: 'grantee',
        granterId: 'granter',
        action: 'actuator:move',
        scope: 'ctx-1',
      })) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.grantHash).toBeDefined();
      expect(result.action).toBe('actuator:move');
    });

    it('rejects missing required fields', async () => {
      const result = await handleRobotAiMcpTool('twin_earth_grant_permission', {
        granteeId: 'x',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('required') });
    });

    it('rejects revoked grantee', async () => {
      await registerIdentity({ agentId: 'grantee', role: 'founder' });
      await registerIdentity({ agentId: 'granter' });
      await handleRobotAiMcpTool('twin_earth_revoke_identity', {
        agentId: 'grantee',
        granterId: 'grantee',
        revocationSignature: 'sig',
      });
      const result = await handleRobotAiMcpTool('twin_earth_grant_permission', {
        granteeId: 'grantee',
        granterId: 'granter',
        action: 'x',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('revoked') });
    });
  });

  describe('twin_earth_revoke_permission', () => {
    it('revokes with founder role', async () => {
      await registerIdentity({ agentId: 'granter', role: 'founder' });
      await registerIdentity({ agentId: 'grantee' });
      const grant = (await handleRobotAiMcpTool('twin_earth_grant_permission', {
        granteeId: 'grantee',
        granterId: 'granter',
        action: 'x',
      })) as Record<string, unknown>;
      const result = (await handleRobotAiMcpTool('twin_earth_revoke_permission', {
        grantHash: grant.grantHash as string,
        granterId: 'granter',
        revocationSignature: 'sig',
      })) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.revoked).toBe(true);
    });

    it('rejects non-original granter', async () => {
      await registerIdentity({ agentId: 'g1', role: 'founder' });
      await registerIdentity({ agentId: 'g2', role: 'founder' });
      await registerIdentity({ agentId: 'grantee' });
      const grant = (await handleRobotAiMcpTool('twin_earth_grant_permission', {
        granteeId: 'grantee',
        granterId: 'g1',
        action: 'x',
      })) as Record<string, unknown>;
      const result = await handleRobotAiMcpTool('twin_earth_revoke_permission', {
        grantHash: grant.grantHash as string,
        granterId: 'g2',
        revocationSignature: 'sig',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('original granter') });
    });

    it('rejects missing revocationSignature', async () => {
      await registerIdentity({ agentId: 'granter', role: 'founder' });
      await registerIdentity({ agentId: 'grantee' });
      const grant = (await handleRobotAiMcpTool('twin_earth_grant_permission', {
        granteeId: 'grantee',
        granterId: 'granter',
        action: 'x',
      })) as Record<string, unknown>;
      const result = await handleRobotAiMcpTool('twin_earth_revoke_permission', {
        grantHash: grant.grantHash as string,
        granterId: 'granter',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('revocationSignature') });
    });
  });

  describe('twin_earth_validate_permission', () => {
    it('validates active grant', async () => {
      await registerIdentity({ agentId: 'grantee' });
      await registerIdentity({ agentId: 'granter' });
      await handleRobotAiMcpTool('twin_earth_grant_permission', {
        granteeId: 'grantee',
        granterId: 'granter',
        action: 'actuator:move',
        scope: 'ctx-1',
      });
      const result = (await handleRobotAiMcpTool('twin_earth_validate_permission', {
        granteeId: 'grantee',
        action: 'actuator:move',
        scope: 'ctx-1',
      })) as Record<string, unknown>;
      expect(result.valid).toBe(true);
    });

    it('rejects non-matching action', async () => {
      await registerIdentity({ agentId: 'grantee' });
      await registerIdentity({ agentId: 'granter' });
      await handleRobotAiMcpTool('twin_earth_grant_permission', {
        granteeId: 'grantee',
        granterId: 'granter',
        action: 'actuator:move',
        scope: 'ctx-1',
      });
      const result = await handleRobotAiMcpTool('twin_earth_validate_permission', {
        granteeId: 'grantee',
        action: 'actuator:grip',
        scope: 'ctx-1',
      });
      expect(result).toMatchObject({ valid: false });
    });

    it('rejects non-matching scope', async () => {
      await registerIdentity({ agentId: 'grantee' });
      await registerIdentity({ agentId: 'granter' });
      await handleRobotAiMcpTool('twin_earth_grant_permission', {
        granteeId: 'grantee',
        granterId: 'granter',
        action: 'actuator:move',
        scope: 'ctx-1',
      });
      const result = await handleRobotAiMcpTool('twin_earth_validate_permission', {
        granteeId: 'grantee',
        action: 'actuator:move',
        scope: 'ctx-2',
      });
      expect(result).toMatchObject({ valid: false });
    });
  });

  describe('twin_earth_list_permissions', () => {
    it('filters by grantee', async () => {
      await registerIdentity({ agentId: 'g1' });
      await registerIdentity({ agentId: 'g2' });
      await registerIdentity({ agentId: 'granter' });
      await handleRobotAiMcpTool('twin_earth_grant_permission', { granteeId: 'g1', granterId: 'granter', action: 'a' });
      await handleRobotAiMcpTool('twin_earth_grant_permission', { granteeId: 'g2', granterId: 'granter', action: 'b' });
      const result = (await handleRobotAiMcpTool('twin_earth_list_permissions', {
        granteeId: 'g1',
      })) as Record<string, unknown>;
      expect(result.total).toBe(1);
      expect((result.grants as unknown[])[0]).toMatchObject({ granteeId: 'g1' });
    });
  });

  // ===========================================================================
  // Robot Actuation
  // ===========================================================================

  describe('twin_earth_robot_actuate', () => {
    it('blocks missing identity', async () => {
      const result = await handleRobotAiMcpTool('twin_earth_robot_actuate', {
        agentId: 'missing',
        command: 'move',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('not found') });
    });

    it('blocks non-robot identity', async () => {
      await registerAI({ agentId: 'ai-only' });
      const result = await handleRobotAiMcpTool('twin_earth_robot_actuate', {
        agentId: 'ai-only',
        command: 'move',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('not a robot') });
    });

    it('blocks revoked identity', async () => {
      await registerIdentity({ agentId: 'rev-robot', role: 'founder' });
      await handleRobotAiMcpTool('twin_earth_revoke_identity', {
        agentId: 'rev-robot',
        granterId: 'rev-robot',
        revocationSignature: 'sig',
      });
      const result = await handleRobotAiMcpTool('twin_earth_robot_actuate', {
        agentId: 'rev-robot',
        command: 'move',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('revoked') });
    });

    it('blocks without safety envelope', async () => {
      await registerIdentity({ agentId: 'no-env' });
      const result = await handleRobotAiMcpTool('twin_earth_robot_actuate', {
        agentId: 'no-env',
        command: 'move',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('No active safety envelope') });
    });

    it('blocks localOnly envelope', async () => {
      await registerIdentity({ agentId: 'local-bot' });
      await handleRobotAiMcpTool('twin_earth_create_safety_envelope', {
        agentId: 'local-bot',
        localOnly: true,
      });
      const result = await handleRobotAiMcpTool('twin_earth_robot_actuate', {
        agentId: 'local-bot',
        command: 'move',
      });
      expect(result).toMatchObject({
        error: expect.stringContaining('localOnly'),
        rejectedByEnvelope: true,
      });
    });

    it('simulates actuation when permitted', async () => {
      await registerIdentity({ agentId: 'act-bot' });
      await registerIdentity({ agentId: 'granter' });
      await handleRobotAiMcpTool('twin_earth_create_safety_envelope', {
        agentId: 'act-bot',
        envelopeId: 'act-env',
      });
      await handleRobotAiMcpTool('twin_earth_grant_permission', {
        granteeId: 'act-bot',
        granterId: 'granter',
        action: 'robot:move',
        scope: '*',
      });
      const result = (await handleRobotAiMcpTool('twin_earth_robot_actuate', {
        agentId: 'act-bot',
        command: 'move',
        parameters: { x: 1, y: 2 },
      })) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.command).toBe('move');
      expect(result.simulated).toBe(true);
      expect(result.receiptId).toMatch(/^act_\d+_[a-z0-9]+$/);
      expect(twinEarthReceiptRegistry.size).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // AI Invocation
  // ===========================================================================

  describe('twin_earth_ai_invoke', () => {
    it('blocks missing identity', async () => {
      const result = await handleRobotAiMcpTool('twin_earth_ai_invoke', {
        agentId: 'missing',
        prompt: 'hello',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('not found') });
    });

    it('blocks non-AI identity', async () => {
      await registerIdentity({ agentId: 'robot-only' });
      const result = await handleRobotAiMcpTool('twin_earth_ai_invoke', {
        agentId: 'robot-only',
        prompt: 'hello',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('not an AI') });
    });

    it('blocks without safety envelope', async () => {
      await registerAI({ agentId: 'no-env-ai' });
      const result = await handleRobotAiMcpTool('twin_earth_ai_invoke', {
        agentId: 'no-env-ai',
        prompt: 'hello',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('No active safety envelope') });
    });

    it('blocks localOnly envelope', async () => {
      await registerAI({ agentId: 'local-ai' });
      await handleRobotAiMcpTool('twin_earth_create_safety_envelope', {
        agentId: 'local-ai',
        localOnly: true,
      });
      const result = await handleRobotAiMcpTool('twin_earth_ai_invoke', {
        agentId: 'local-ai',
        prompt: 'hello',
      });
      expect(result).toMatchObject({
        error: expect.stringContaining('localOnly'),
        rejectedByEnvelope: true,
      });
    });

    it('blocks without permission grant', async () => {
      await registerAI({ agentId: 'no-perm-ai' });
      await handleRobotAiMcpTool('twin_earth_create_safety_envelope', {
        agentId: 'no-perm-ai',
        envelopeId: 'np-env',
      });
      const result = await handleRobotAiMcpTool('twin_earth_ai_invoke', {
        agentId: 'no-perm-ai',
        prompt: 'hello',
      });
      expect(result).toMatchObject({
        error: expect.stringContaining('No permission grant'),
        permissionDenied: true,
      });
    });

    it('simulates invocation when permitted', async () => {
      await registerAI({ agentId: 'inv-ai' });
      await registerIdentity({ agentId: 'granter' });
      await handleRobotAiMcpTool('twin_earth_create_safety_envelope', {
        agentId: 'inv-ai',
        envelopeId: 'inv-env',
      });
      await handleRobotAiMcpTool('twin_earth_grant_permission', {
        granteeId: 'inv-ai',
        granterId: 'granter',
        action: 'ai:invoke',
        scope: '*',
      });
      const result = (await handleRobotAiMcpTool('twin_earth_ai_invoke', {
        agentId: 'inv-ai',
        prompt: 'hello',
      })) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.simulated).toBe(true);
      expect(result.receiptId).toMatch(/^inv_\d+_[a-z0-9]+$/);
    });
  });

  // ===========================================================================
  // Receipt Capture
  // ===========================================================================

  describe('twin_earth_capture_receipt', () => {
    it('captures a receipt', async () => {
      await registerIdentity({ agentId: 'rec-actor' });
      const result = (await handleRobotAiMcpTool('twin_earth_capture_receipt', {
        actorId: 'rec-actor',
        action: 'test:action',
        status: 'success',
        envelopeId: 'env-1',
      })) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(result.receiptId).toMatch(/^rec_\d+_[a-z0-9]+$/);
      expect(result.status).toBe('success');
    });

    it('rejects missing required fields', async () => {
      const result = await handleRobotAiMcpTool('twin_earth_capture_receipt', {
        actorId: 'x',
        action: 'y',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('required') });
    });

    it('rejects unknown actor', async () => {
      const result = await handleRobotAiMcpTool('twin_earth_capture_receipt', {
        actorId: 'missing',
        action: 'test',
        status: 'success',
        envelopeId: 'env-1',
      });
      expect(result).toMatchObject({ error: expect.stringContaining('not found') });
    });
  });

  // ===========================================================================
  // Registry clear
  // ===========================================================================

  it('clearRobotAiRegistries empties all registries', async () => {
    await registerIdentity({ agentId: 'clear-test' });
    await handleRobotAiMcpTool('twin_earth_create_safety_envelope', {
      agentId: 'clear-test',
      envelopeId: 'clear-env',
    });
    expect(twinEarthIdentityRegistry.size).toBeGreaterThan(0);
    clearRobotAiRegistries();
    expect(twinEarthIdentityRegistry.size).toBe(0);
  });
});
