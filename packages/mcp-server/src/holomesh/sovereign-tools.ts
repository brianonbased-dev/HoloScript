import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { HoloMeshOrchestratorClient } from './orchestrator-client';

export const sovereignTools: Tool[] = [
  {
    name: 'holomesh_sovereign_topology',
    description: 'Get the graph topology view for sovereign HoloVM clusters.',
    inputSchema: {
      type: 'object',
      properties: {
        clusters: {
          type: 'number',
          description: 'Number of clusters to preview (1-12, default 3).',
        },
        replicas: {
          type: 'number',
          description: 'Number of replicas per cluster (1-64, default 4).',
        },
      },
    },
  },
  {
    name: 'holomesh_sovereign_lifepod_snapshot',
    description: 'Create a signed LifePod snapshot metadata representation for agent state migration.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: {
          type: 'string',
          description: 'The target world ID or name.',
        },
        sourceCluster: {
          type: 'string',
          description: 'The cluster from which the snapshot originates.',
        },
        agentCount: {
          type: 'number',
          description: 'Number of agents included in this LifePod snapshot.',
        },
      },
    },
  },
  {
    name: 'holomesh_sovereign_lifepod_restore',
    description: 'Restore a snapshot into a target cluster (simulated).',
    inputSchema: {
      type: 'object',
      properties: {
        lifePodId: {
          type: 'string',
          description: 'The ID of the LifePod snapshot to restore.',
        },
        targetCluster: {
          type: 'string',
          description: 'The target cluster to which the snapshot is restored.',
        },
      },
      required: ['lifePodId'],
    },
  },
];

export async function handleSovereignTool(
  name: string,
  args: Record<string, unknown>,
  client: HoloMeshOrchestratorClient | null
): Promise<unknown | null> {
  if (!name.startsWith('holomesh_sovereign_')) return null;
  if (!client) {
    return { error: 'HoloMesh orchestrator client is required for Sovereign tools.' };
  }
  
  const baseUrl = client.config.orchestratorUrl;
  const apiKey = client.config.apiKey;

  try {
    switch (name) {
      case 'holomesh_sovereign_topology': {
        const queryParams = new URLSearchParams();
        if (args.clusters) queryParams.set('clusters', String(args.clusters));
        if (args.replicas) queryParams.set('replicas', String(args.replicas));
        const res = await fetch(`${baseUrl}/api/holomesh/sovereign/topology?${queryParams}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        return await res.json();
      }

      case 'holomesh_sovereign_lifepod_snapshot': {
        const res = await fetch(`${baseUrl}/api/holomesh/sovereign/lifepod/snapshot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(args),
        });
        return await res.json();
      }

      case 'holomesh_sovereign_lifepod_restore': {
        const res = await fetch(`${baseUrl}/api/holomesh/sovereign/lifepod/restore`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(args),
        });
        return await res.json();
      }

      default:
        return null;
    }
  } catch (err: unknown) {
    return { error: `Sovereign ops failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
