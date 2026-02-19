/**
 * AgentRegistry — Production Test Suite
 *
 * Covers: register, deregister, heartbeat, discover, findBest,
 * get, has, getAllManifests, size, getStatusCounts, clear, export/import.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentRegistry } from '../AgentRegistry';
import type { AgentManifest } from '../AgentManifest';

function mkManifest(id: string, extra: Partial<AgentManifest> = {}): AgentManifest {
  return {
    id,
    name: `Agent ${id}`,
    version: '1.0.0',
    capabilities: [{ type: 'compute', domain: 'physics' }],
    endpoints: [{ protocol: 'http', address: 'localhost', port: 3000 }],
    trustLevel: 'local',
    status: 'online',
    ...extra,
  } as AgentManifest;
}

describe('AgentRegistry — Production', () => {
  let reg: AgentRegistry;

  beforeEach(() => { reg = new AgentRegistry({ autoCleanup: false }); });
  afterEach(() => { reg.stop(); });

  // ─── Registration ────────────────────────────────────────────────
  it('register adds an agent', async () => {
    await reg.register(mkManifest('a1'));
    expect(reg.has('a1')).toBe(true);
    expect(reg.size).toBe(1);   // size is a getter
  });

  it('register updates existing agent (no reject)', async () => {
    await reg.register(mkManifest('a1'));
    await reg.register(mkManifest('a1', { version: '2.0.0' }));
    // Duplicate register updates, not rejects
    expect(reg.size).toBe(1);
    expect(reg.get('a1')!.version).toBe('2.0.0');
  });

  it('deregister removes an agent', async () => {
    await reg.register(mkManifest('a1'));
    await reg.deregister('a1');
    expect(reg.has('a1')).toBe(false);
    expect(reg.size).toBe(0);
  });

  // ─── Heartbeat ───────────────────────────────────────────────────
  it('heartbeat updates agent entry', async () => {
    await reg.register(mkManifest('a1'));
    await reg.heartbeat('a1');
    expect(reg.has('a1')).toBe(true);
  });

  it('heartbeat on unknown agent throws', async () => {
    await expect(reg.heartbeat('unknown')).rejects.toThrow();
  });

  // ─── Discovery ───────────────────────────────────────────────────
  it('discover returns matching agents', async () => {
    await reg.register(mkManifest('a1', { capabilities: [{ type: 'compute', domain: 'physics' }] } as any));
    await reg.register(mkManifest('a2', { capabilities: [{ type: 'render', domain: 'graphics' }] } as any));
    const results = await reg.discover({ type: 'compute' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(r => r.id === 'a1')).toBe(true);
  });

  it('findBest returns best matching agent', async () => {
    await reg.register(mkManifest('a1'));
    const best = await reg.findBest({ type: 'compute' });
    expect(best).not.toBeNull();
    expect(best!.id).toBe('a1');
  });

  // ─── Getters ─────────────────────────────────────────────────────
  it('get returns manifest by ID', async () => {
    await reg.register(mkManifest('a1'));
    const m = reg.get('a1');
    expect(m).toBeDefined();
    expect(m!.name).toBe('Agent a1');
  });

  it('getAllManifests returns all', async () => {
    await reg.register(mkManifest('a1'));
    await reg.register(mkManifest('a2'));
    expect(reg.getAllManifests().length).toBe(2);
  });

  it('getStatusCounts counts agents by status', async () => {
    await reg.register(mkManifest('a1', { status: 'online' }));
    const counts = reg.getStatusCounts();
    expect(counts['online']).toBeGreaterThanOrEqual(1);
  });

  // ─── Clear ───────────────────────────────────────────────────────
  it('clear removes all agents', async () => {
    await reg.register(mkManifest('a1'));
    await reg.register(mkManifest('a2'));
    reg.clear();
    expect(reg.size).toBe(0);
  });

  // ─── Export/Import ───────────────────────────────────────────────
  it('export and import round-trip', async () => {
    await reg.register(mkManifest('a1'));
    const data = reg.export();
    expect(data.agents.length).toBe(1);
    const reg2 = new AgentRegistry({ autoCleanup: false });
    await reg2.import(data);
    expect(reg2.has('a1')).toBe(true);
    reg2.stop();
  });
});
