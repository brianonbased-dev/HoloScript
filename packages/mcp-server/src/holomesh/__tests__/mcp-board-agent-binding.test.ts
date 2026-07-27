/**
 * Slice A — bind MCP board-tool writes to the transport-authenticated principal
 * (research/2026-07-26_holomesh-mcp-identity-gap.md, task_1785110141929_xx29).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { resolveMcpBoardAgent, authPrincipal } from '../identity/mcp-board-agent-binding';

const FLAG = 'HOLOMESH_BOARD_BIND_SIGNER';
const P = 'agent_1776836330914_1bli'; // a stamped principal

describe('resolveMcpBoardAgent', () => {
  afterEach(() => {
    delete process.env[FLAG];
  });

  // ── No authenticated principal (stdio / local-trust) ──
  it('no principal + no agent_id -> "mcp-agent" (unchanged default)', () => {
    const r = resolveMcpBoardAgent({});
    expect(r).toEqual({ ok: true, agentId: 'mcp-agent', agentName: 'mcp-agent' });
  });
  it('no principal + explicit agent_id -> honored (local trust)', () => {
    const r = resolveMcpBoardAgent({ agent_id: 'claude1', agent_name: 'Claude' });
    expect(r).toEqual({ ok: true, agentId: 'claude1', agentName: 'Claude' });
  });

  // ── Principal present ──
  it('principal + no agent_id -> attributes to the principal (fixes anonymous default)', () => {
    const r = resolveMcpBoardAgent({ __authAgentId: P });
    expect(r).toEqual({ ok: true, agentId: P, agentName: P });
  });
  it('principal + matching agent_id -> ok, principal wins', () => {
    const r = resolveMcpBoardAgent({ __authAgentId: P, agent_id: P, agent_name: 'Seat' });
    expect(r).toEqual({ ok: true, agentId: P, agentName: 'Seat' });
  });

  it('principal + MISMATCHED agent_id, flag OFF -> honored (current behavior preserved)', () => {
    delete process.env[FLAG];
    const r = resolveMcpBoardAgent({ __authAgentId: P, agent_id: 'victim' });
    expect(r).toEqual({ ok: true, agentId: 'victim', agentName: 'victim' });
  });
  it('principal + MISMATCHED agent_id, flag ON -> 403 (impersonation blocked)', () => {
    process.env[FLAG] = '1';
    const r = resolveMcpBoardAgent({ __authAgentId: P, agent_id: 'victim' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.error).toBe('agent-id-not-bound-to-caller');
    }
  });
  it('flag ON + matching agent_id still ok (no false positive)', () => {
    process.env[FLAG] = '1';
    expect(resolveMcpBoardAgent({ __authAgentId: P, agent_id: P }).ok).toBe(true);
  });

  it('authPrincipal reads only the reserved stamp, ignores caller fields', () => {
    expect(authPrincipal({ __authAgentId: P, agent_id: 'x' })).toBe(P);
    expect(authPrincipal({ agent_id: 'x' })).toBe('');
    expect(authPrincipal({ __authAgentId: '  ' })).toBe('');
  });
});
