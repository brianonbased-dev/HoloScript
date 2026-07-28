/**
 * buildPortableMind — the D.102 portable-mind acquisition (Quest-side client half).
 *
 * Asserts: identity wallet is DERIVED from the signing key (anchor coherence — the W.820 class of
 * declared-vs-key drift cannot occur through this path); the bearer is resolved via the broker
 * (wallet-ownership proof) unless an explicit bearer is given; and the resulting mind round-trips
 * memory through the live client. Headless: broker fetch is mocked, the private store is a temp JSONL.
 */
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPortableMind } from '../portable-mind';

// Hardhat account #0 — deterministic test key → checksummed address.
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

function brokerFetch() {
  return vi.fn(async (url: unknown) => {
    const u = String(url);
    if (u.endsWith('/key/challenge')) return { ok: true, json: async () => ({ nonce: 'nonce-1' }) };
    if (u.endsWith('/key/recover'))
      return { ok: true, json: async () => ({ agent: { api_key: 'broker-bearer' } }) };
    throw new Error('unexpected fetch ' + u);
  });
}

describe('buildPortableMind', () => {
  it('derives the identity wallet from the signing key (anchor coherence — W.820)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-'));
    try {
      const fetchImpl = brokerFetch();
      const mind = await buildPortableMind({
        privateKey: KEY,
        meshApiBase: 'https://x/api',
        teamId: 't',
        localKnowledgePath: join(dir, 'k.jsonl'),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      // identity wallet == address of KEY (not a separately-declared address that could drift).
      expect(mind.identity().wallet).toBe(ADDR);
      expect(mind.identity().agentId).toBe(ADDR);
      expect(fetchImpl).toHaveBeenCalledTimes(2); // /key/challenge + /key/recover
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('round-trips memory through the live client (write then recall)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-'));
    try {
      const mind = await buildPortableMind({
        privateKey: KEY,
        meshApiBase: 'https://x/api',
        teamId: 't',
        bearer: 'explicit',
        localKnowledgePath: join(dir, 'k.jsonl'),
        fetchImpl: brokerFetch() as unknown as typeof fetch,
      });
      await mind.rememberOutcome({ content: 'portable mind reached the headset' });
      const recalled = await mind.loadMemory('headset');
      expect(recalled).toHaveLength(1);
      expect(recalled[0].content).toBe('portable mind reached the headset');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('explicit bearer skips the broker round-trip; honours agentId', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-'));
    try {
      const fetchImpl = brokerFetch();
      const mind = await buildPortableMind({
        privateKey: KEY,
        meshApiBase: 'https://x/api',
        teamId: 't',
        bearer: 'explicit-bearer',
        agentId: 'brittney',
        localKnowledgePath: join(dir, 'k.jsonl'),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect(mind.identity().agentId).toBe('brittney');
      expect(mind.identity().wallet).toBe(ADDR); // still key-derived
      expect(fetchImpl).not.toHaveBeenCalled(); // no broker when bearer supplied
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
