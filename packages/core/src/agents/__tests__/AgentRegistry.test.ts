import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentRegistry } from '../AgentRegistry';
import type { AgentManifest } from '../AgentManifest';

function makeManifest(id: string, overrides: Partial<AgentManifest> = {}): AgentManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    capabilities: [{ type: 'compute', domain: 'general' }],
    status: 'online',
    trustLevel: 'local',
    endpoints: [{ protocol: 'http', address: 'localhost' }],
    ...overrides,
  } as AgentManifest;
}

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry({ autoCleanup: false });
  });

  afterEach(() => {
    registry.stop();
  });

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  it('register adds an agent', async () => {
    await registry.register(makeManifest('agent-1'));
    expect(registry.size).toBe(1); // size is a getter
  });

  it('has returns true for registered agent', async () => {
    await registry.register(makeManifest('agent-1'));
    expect(registry.has('agent-1')).toBe(true);
    expect(registry.has('nope')).toBe(false);
  });

  it('get returns manifest', async () => {
    await registry.register(makeManifest('agent-1'));
    const m = registry.get('agent-1');
    expect(m).toBeDefined();
    expect(m!.id).toBe('agent-1');
  });

  it('register allows updating same ID', async () => {
    await registry.register(makeManifest('agent-1'));
    // Registering the same ID again is an update, not an error
    await registry.register(makeManifest('agent-1', { version: '2.0.0' }));
    expect(registry.size).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Deregistration
  // ---------------------------------------------------------------------------

  it('deregister removes an agent', async () => {
    await registry.register(makeManifest('agent-1'));
    await registry.deregister('agent-1');
    expect(registry.size).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Heartbeat
  // ---------------------------------------------------------------------------

  it('heartbeat updates agent entry', async () => {
    await registry.register(makeManifest('agent-1'));
    await registry.heartbeat('agent-1');
    expect(registry.has('agent-1')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Discovery
  // ---------------------------------------------------------------------------

  it('discover finds matching agents', async () => {
    await registry.register(
      makeManifest('a1', { capabilities: [{ type: 'compute', domain: 'general' }] })
    );
    await registry.register(
      makeManifest('a2', { capabilities: [{ type: 'render', domain: 'graphics' }] })
    );
    const results = await registry.discover({ type: 'compute' });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('findBest returns the best match', async () => {
    await registry.register(
      makeManifest('a1', { capabilities: [{ type: 'compute', domain: 'general' }] })
    );
    const best = await registry.findBest({ type: 'compute' });
    expect(best).not.toBeNull();
    expect(best!.id).toBe('a1');
  });

  it('findBest returns null when no match', async () => {
    const best = await registry.findBest({ type: 'compute' });
    expect(best).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // getAllManifests
  // ---------------------------------------------------------------------------

  it('getAllManifests returns all agents', async () => {
    await registry.register(makeManifest('a1'));
    await registry.register(makeManifest('a2'));
    expect(registry.getAllManifests()).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // Status Counts
  // ---------------------------------------------------------------------------

  it('getStatusCounts reports by status', async () => {
    await registry.register(makeManifest('a1'));
    const counts = registry.getStatusCounts();
    expect(counts['online']).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Clear
  // ---------------------------------------------------------------------------

  it('clear removes all agents', async () => {
    await registry.register(makeManifest('a1'));
    await registry.register(makeManifest('a2'));
    registry.clear();
    expect(registry.size).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  it('export returns registry snapshot', async () => {
    await registry.register(makeManifest('a1'));
    const data = registry.export();
    expect(data.agents).toHaveLength(1);
    expect(data.timestamp).toBeGreaterThan(0);
  });
});
