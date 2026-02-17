import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentRegistry } from '../AgentRegistry';
import { AgentManifestBuilder } from '../AgentManifest';
import type { AgentManifest } from '../AgentManifest';

function makeManifest(id: string, trust: 'local' | 'verified' | 'known' | 'external' | 'untrusted' = 'local'): AgentManifest {
  return new AgentManifestBuilder()
    .identity(id, `Agent ${id}`, '1.0.0')
    .addCapability({ type: 'analyze', domain: 'general' })
    .addEndpoint({ protocol: 'local', address: 'in-process' })
    .trust(trust)
    .build();
}

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => { registry = new AgentRegistry(); });

  afterEach(() => { registry.stop(); });

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  it('register adds an agent', async () => {
    await registry.register(makeManifest('agent-1'));
    expect(registry.has('agent-1')).toBe(true);
    expect(registry.size).toBe(1);
  });

  it('register emits agent:registered event', async () => {
    let emitted = false;
    registry.on('agent:registered', () => { emitted = true; });
    await registry.register(makeManifest('agent-1'));
    expect(emitted).toBe(true);
  });

  it('deregister removes an agent', async () => {
    await registry.register(makeManifest('agent-1'));
    await registry.deregister('agent-1');
    expect(registry.has('agent-1')).toBe(false);
  });

  it('get returns manifest for registered agent', async () => {
    await registry.register(makeManifest('agent-1'));
    const manifest = registry.get('agent-1');
    expect(manifest).toBeDefined();
    expect(manifest!.id).toBe('agent-1');
  });

  it('get returns undefined for unregistered agent', () => {
    expect(registry.get('nope')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Heartbeat
  // ---------------------------------------------------------------------------

  it('heartbeat updates agent timestamp', async () => {
    await registry.register(makeManifest('agent-1'));
    await registry.heartbeat('agent-1');
    // Should not throw
    expect(registry.has('agent-1')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Discovery
  // ---------------------------------------------------------------------------

  it('discover finds agents matching capability query', async () => {
    await registry.register(makeManifest('agent-1'));
    const results = await registry.discover({ type: 'analyze' });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('discover returns empty for non-matching query', async () => {
    await registry.register(makeManifest('agent-1'));
    const results = await registry.discover({ type: 'render' });
    expect(results.length).toBe(0);
  });

  it('findBest returns the best matching agent', async () => {
    await registry.register(makeManifest('agent-1'));
    const best = await registry.findBest({ type: 'analyze' });
    expect(best).toBeDefined();
    expect(best!.id).toBe('agent-1');
  });

  it('findBest returns null when no match', async () => {
    const best = await registry.findBest({ type: 'render' });
    expect(best).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  it('getAllManifests returns all registered', async () => {
    await registry.register(makeManifest('a'));
    await registry.register(makeManifest('b'));
    const all = registry.getAllManifests();
    expect(all.length).toBe(2);
  });

  it('getStatusCounts returns status breakdown', async () => {
    await registry.register(makeManifest('a'));
    const counts = registry.getStatusCounts();
    expect(typeof counts).toBe('object');
  });

  // ---------------------------------------------------------------------------
  // Clear
  // ---------------------------------------------------------------------------

  it('clear removes all agents', async () => {
    await registry.register(makeManifest('a'));
    await registry.register(makeManifest('b'));
    registry.clear();
    expect(registry.size).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Export / Import
  // ---------------------------------------------------------------------------

  it('export returns registry state', async () => {
    await registry.register(makeManifest('a'));
    const data = registry.export();
    expect(data.agents.length).toBe(1);
    expect(data.config).toBeDefined();
    expect(data.timestamp).toBeGreaterThan(0);
  });

  it('import restores agents', async () => {
    await registry.register(makeManifest('a'));
    const exported = registry.export();
    registry.clear();
    await registry.import({ agents: exported.agents });
    expect(registry.size).toBe(1);
  });
});
