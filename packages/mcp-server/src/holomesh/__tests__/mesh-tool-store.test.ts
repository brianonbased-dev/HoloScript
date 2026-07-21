import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildMeshToolManifest,
  clearMeshToolRegistry,
  discoverMeshTools,
  flushMeshToolStore,
  initMeshToolRegistry,
  publishMeshToolManifest,
  sweepMeshToolRegistry,
} from '../mesh-tool-registry';
import { InMemoryMeshToolStoreBackend } from '../mesh-tool-store';

const publisher = { agentId: 'agent_store_test', name: 'store-test-agent' };

function tunnelManifest(url: string, name = 'holoclaw_route', agentId = publisher.agentId) {
  return buildMeshToolManifest(
    {
      name,
      description: `Mesh tool ${name}`,
      capability_tags: ['routing', name],
      endpoint: { transport: 'mcp-http', toolName: name, url },
      allow_transitive_invocation: false,
    },
    { agentId, name: agentId },
    new Date('2026-07-21T00:00:00.000Z')
  );
}

describe('mesh tool store persistence (task_1784589178204_gnzq)', () => {
  beforeEach(async () => {
    clearMeshToolRegistry();
    await initMeshToolRegistry(new InMemoryMeshToolStoreBackend());
  });

  it('published tools survive a registry restart (deploy-wipe survival)', async () => {
    const backend = new InMemoryMeshToolStoreBackend();
    await initMeshToolRegistry(backend);
    const manifest = publishMeshToolManifest(
      tunnelManifest('https://relay.example.net/t/abc123/mcp')
    );
    await flushMeshToolStore();

    // Simulated process death: cache gone, persistent backend survives.
    clearMeshToolRegistry();
    expect(discoverMeshTools('routing')).toHaveLength(0);

    const restored = await initMeshToolRegistry(backend);
    expect(restored).toBe(1);
    const found = discoverMeshTools('routing');
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(manifest.id);
    expect(found[0].endpoint.url).toBe('https://relay.example.net/t/abc123/mcp');
  });

  it('re-publish with a changed endpoint REPLACES the prior manifest (no stale duplicates)', async () => {
    const backend = new InMemoryMeshToolStoreBackend();
    await initMeshToolRegistry(backend);
    const first = publishMeshToolManifest(tunnelManifest('https://relay.example.net/t/old/mcp'));
    const second = publishMeshToolManifest(tunnelManifest('https://relay.example.net/t/new/mcp'));
    await flushMeshToolStore();

    expect(second.id).not.toBe(first.id); // content-hash id changes with endpoint
    const found = discoverMeshTools('routing');
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(second.id);

    const rows = await backend.getAll();
    expect(rows).toHaveLength(1);
    expect(rows[0].manifest.id).toBe(second.id);
  });

  it('same tool name from a DIFFERENT publisher is not deduped away', async () => {
    await initMeshToolRegistry(new InMemoryMeshToolStoreBackend());
    publishMeshToolManifest(tunnelManifest('https://relay.example.net/t/a/mcp'));
    publishMeshToolManifest(
      tunnelManifest('https://relay.example.net/t/b/mcp', 'holoclaw_route', 'agent_other')
    );
    await flushMeshToolStore();
    expect(discoverMeshTools('routing')).toHaveLength(2);
  });

  it('sweep expires manifests whose endpoint stays unreachable past the TTL, not before', async () => {
    const backend = new InMemoryMeshToolStoreBackend();
    await initMeshToolRegistry(backend);
    const manifest = publishMeshToolManifest(
      tunnelManifest('https://relay.example.net/t/dead/mcp')
    );
    await flushMeshToolStore();

    const publishedAt = Date.parse(manifest.attestation.publishedAt);
    const ttlMs = 60 * 60 * 1000;

    // Unreachable but still inside the TTL window: kept.
    const early = await sweepMeshToolRegistry({
      probe: async () => false,
      ttlMs,
      now: new Date(publishedAt + 30 * 60 * 1000),
    });
    expect(early.expired).toHaveLength(0);
    expect(discoverMeshTools('routing')).toHaveLength(1);

    // Still unreachable past the TTL: expired from cache AND backend.
    const late = await sweepMeshToolRegistry({
      probe: async () => false,
      ttlMs,
      now: new Date(publishedAt + 2 * 60 * 60 * 1000),
    });
    expect(late.expired).toEqual([manifest.id]);
    expect(discoverMeshTools('routing')).toHaveLength(0);
    expect(await backend.getAll()).toHaveLength(0);
  });

  it('a healthy probe refreshes the TTL window and probes the /health sibling of the /mcp url', async () => {
    await initMeshToolRegistry(new InMemoryMeshToolStoreBackend());
    const manifest = publishMeshToolManifest(
      tunnelManifest('https://relay.example.net/t/alive/mcp')
    );
    const publishedAt = Date.parse(manifest.attestation.publishedAt);
    const ttlMs = 60 * 60 * 1000;
    const probedUrls: string[] = [];

    // Healthy probe LONG after publish — refreshes lastHealthyAt.
    const healthy = await sweepMeshToolRegistry({
      probe: async (url) => {
        probedUrls.push(url);
        return true;
      },
      ttlMs,
      now: new Date(publishedAt + 3 * 60 * 60 * 1000),
    });
    expect(healthy.healthy).toBe(1);
    expect(probedUrls).toEqual(['https://relay.example.net/t/alive/health']);

    // Goes dark right after — within the REFRESHED window it must survive.
    const soonAfter = await sweepMeshToolRegistry({
      probe: async () => false,
      ttlMs,
      now: new Date(publishedAt + 3 * 60 * 60 * 1000 + 10 * 60 * 1000),
    });
    expect(soonAfter.expired).toHaveLength(0);
    expect(discoverMeshTools('routing')).toHaveLength(1);
  });

  it('local-transport manifests are never probed or expired', async () => {
    await initMeshToolRegistry(new InMemoryMeshToolStoreBackend());
    publishMeshToolManifest(
      buildMeshToolManifest(
        {
          name: 'parse_hs',
          capability_tags: ['parse'],
          endpoint: { transport: 'local', toolName: 'parse_hs' },
        },
        publisher
      )
    );
    const result = await sweepMeshToolRegistry({
      probe: async () => false,
      ttlMs: 1,
      now: new Date('2027-01-01T00:00:00.000Z'),
    });
    expect(result.probed).toBe(0);
    expect(result.expired).toHaveLength(0);
    expect(discoverMeshTools('parse')).toHaveLength(1);
  });
});
