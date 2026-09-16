/**
 * The verifier the whole agent_id binding rests on.
 *
 * Every oauth test passes `provenAgentId` in as a parameter, so the grants were
 * covered while the thing that DECIDES that value had no test at all. The proof
 * could have been rewritten to trust a caller-supplied header and all 24 oauth
 * tests would still pass. These tests exercise the resolver itself.
 *
 * What must hold:
 *   - a live registry key resolves to exactly the agent it was issued to;
 *   - an expired key proves nothing;
 *   - an unknown key proves nothing (undefined, never a default identity);
 *   - the SHARED legacy key header cannot be upgraded into a proven identity.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the store at a temp dir before importing state, so importing it cannot
// touch the real data directory.
process.env.HOLOMESH_DATA_DIR = mkdtempSync(join(tmpdir(), 'proven-agent-id-'));

const { keyRegistry } = await import('../../holomesh/state');
const { resolveProvenAgentId } = await import('../proven-agent-id');

const LIVE_KEY = 'live-key-owned-by-one-agent';
const EXPIRED_KEY = 'expired-key-value';
const SHARED_LEGACY_KEY = 'shared-legacy-key-every-caller-holds';

function seedKey(key: string, agentId: string, expiresAt?: string): void {
  keyRegistry.set(key, {
    key,
    walletAddress: `0x${'1'.repeat(40)}`,
    agentId,
    agentName: agentId,
    scopes: ['*'],
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    rotationCount: 0,
    lastRotatedAt: null,
    isFounder: false,
    ...(expiresAt ? { expiresAt } : {}),
  });
}

describe('resolveProvenAgentId', () => {
  beforeEach(() => {
    keyRegistry.clear();
  });

  it('resolves a registry-seeded key to the agent it was issued to', () => {
    seedKey(LIVE_KEY, 'agent_owner');

    expect(resolveProvenAgentId({ 'x-agent-key': LIVE_KEY })).toBe('agent_owner');
    expect(resolveProvenAgentId({ 'x-mcp-api-key': LIVE_KEY })).toBe('agent_owner');
    expect(resolveProvenAgentId({ authorization: `Bearer ${LIVE_KEY}` })).toBe('agent_owner');
  });

  it('proves nothing with an expired key', () => {
    seedKey(EXPIRED_KEY, 'agent_owner', new Date(Date.now() - 60_000).toISOString());

    expect(resolveProvenAgentId({ 'x-agent-key': EXPIRED_KEY })).toBeUndefined();
    expect(resolveProvenAgentId({ 'x-mcp-api-key': EXPIRED_KEY })).toBeUndefined();
    expect(resolveProvenAgentId({ authorization: `Bearer ${EXPIRED_KEY}` })).toBeUndefined();
  });

  it('still honours a key whose expiry is in the future', () => {
    seedKey(LIVE_KEY, 'agent_owner', new Date(Date.now() + 60_000).toISOString());

    expect(resolveProvenAgentId({ 'x-agent-key': LIVE_KEY })).toBe('agent_owner');
  });

  it('returns undefined for an unknown key rather than any default identity', () => {
    seedKey(LIVE_KEY, 'agent_owner');

    expect(resolveProvenAgentId({ 'x-agent-key': 'never-issued' })).toBeUndefined();
    expect(resolveProvenAgentId({ 'x-mcp-api-key': 'never-issued' })).toBeUndefined();
    expect(resolveProvenAgentId({ authorization: 'Bearer never-issued' })).toBeUndefined();
  });

  it('returns undefined when the request presents no key at all', () => {
    seedKey(LIVE_KEY, 'agent_owner');

    expect(resolveProvenAgentId({})).toBeUndefined();
    expect(resolveProvenAgentId({ 'x-agent-key': '   ' })).toBeUndefined();
    expect(resolveProvenAgentId({ authorization: 'Basic abc' })).toBeUndefined();
  });

  it('refuses to upgrade the shared legacy x-api-key into a proven identity', () => {
    // HOLOSCRIPT_API_KEY is both the shared legacy key AND a seeded registry
    // key, so honouring x-api-key here would let every holder of the common
    // key speak as whatever agent that record names.
    seedKey(SHARED_LEGACY_KEY, 'agent_env_holoscript_api_key');

    expect(resolveProvenAgentId({ 'x-api-key': SHARED_LEGACY_KEY })).toBeUndefined();
  });

  it('ignores a repeated header rather than trusting the second copy', () => {
    seedKey(LIVE_KEY, 'agent_owner');

    // Node hands duplicated headers over as an array; only the first is read.
    expect(resolveProvenAgentId({ 'x-agent-key': ['never-issued', LIVE_KEY] })).toBeUndefined();
  });
});
