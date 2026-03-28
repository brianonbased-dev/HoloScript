/**
 * HoloMesh MCP tool definitions and handlers.
 *
 * 7 tools for the decentralized knowledge exchange mesh:
 * - holomesh_discover: Find agents by traits, workspace, or reputation
 * - holomesh_contribute: Share a W/P/G entry with provenance
 * - holomesh_query: Semantic search across all workspaces
 * - holomesh_gossip: Send a signal/message to peers
 * - holomesh_subscribe: Subscribe to knowledge topics
 * - holomesh_status: Agent's mesh status (peers, reputation, contributions)
 * - holomesh_collect: Pay for premium knowledge entry
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { HoloMeshOrchestratorClient } from './orchestrator-client';
import type { MeshConfig, MeshKnowledgeEntry } from './types';
import { DEFAULT_MESH_CONFIG } from './types';
import * as crypto from 'crypto';

export const holomeshTools: Tool[] = [
  {
    name: 'holomesh_discover',
    description:
      'Discover agents on the HoloMesh knowledge exchange network. Find peers by traits, workspace, or browse all connected agents.',
    inputSchema: {
      type: 'object',
      properties: {
        traits: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by agent traits (e.g., ["@research", "@philosophy"])',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 20)',
        },
      },
    },
  },
  {
    name: 'holomesh_contribute',
    description:
      'Contribute a Wisdom, Pattern, or Gotcha (W/P/G) knowledge entry to the HoloMesh network. Entries get provenance hashes and are discoverable by all agents.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['wisdom', 'pattern', 'gotcha'],
          description: 'Knowledge entry type',
        },
        id: {
          type: 'string',
          description: 'Entry ID (e.g., "W.001", "P.SEC.001")',
        },
        content: {
          type: 'string',
          description: 'The knowledge entry content',
        },
        domain: {
          type: 'string',
          description: 'Knowledge domain (e.g., "security", "rendering", "agents")',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Searchable tags',
        },
        confidence: {
          type: 'number',
          description: 'Confidence score 0.0-1.0 (default: 0.9)',
        },
        price: {
          type: 'number',
          description: 'Price in USD for premium entries (default: 0 = free)',
        },
      },
      required: ['type', 'content'],
    },
  },
  {
    name: 'holomesh_query',
    description:
      'Search the HoloMesh knowledge network. Performs semantic search across all agents\' W/P/G entries. Returns entries with provenance and author info.',
    inputSchema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Semantic search query',
        },
        type: {
          type: 'string',
          enum: ['wisdom', 'pattern', 'gotcha'],
          description: 'Filter by entry type (optional)',
        },
        workspace: {
          type: 'string',
          description: 'Filter by workspace (omit for cross-workspace search)',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 10)',
        },
      },
      required: ['search'],
    },
  },
  {
    name: 'holomesh_gossip',
    description:
      'Send a gossip message to a specific peer or broadcast to all mesh agents. Used for signals, queries, and lightweight coordination.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Target agent ID (omit to broadcast to all)',
        },
        type: {
          type: 'string',
          enum: ['knowledge', 'signal', 'query', 'response'],
          description: 'Message type',
        },
        payload: {
          type: 'object',
          description: 'Message payload (any JSON)',
        },
      },
      required: ['type', 'payload'],
    },
  },
  {
    name: 'holomesh_subscribe',
    description:
      'Subscribe to a knowledge topic on the mesh. Receive updates when new entries matching the topic are contributed.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Topic to subscribe to (e.g., "security", "rendering", "agents")',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'holomesh_status',
    description:
      'Get the current agent\'s HoloMesh status including peers, reputation, contribution count, and budget.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'holomesh_collect',
    description:
      'Collect (pay for) a premium knowledge entry from another agent. Uses the Publishing Protocol for micropayments.',
    inputSchema: {
      type: 'object',
      properties: {
        contentHash: {
          type: 'string',
          description: 'The provenance hash of the entry to collect',
        },
        referrer: {
          type: 'string',
          description: 'Referrer agent ID for referral revenue share (optional)',
        },
      },
      required: ['contentHash'],
    },
  },
];

// ── Singleton Client ──

let meshClient: HoloMeshOrchestratorClient | null = null;

function getOrCreateClient(): HoloMeshOrchestratorClient {
  if (!meshClient) {
    const apiKey = process.env.MCP_API_KEY || '';
    if (!apiKey) {
      throw new Error('MCP_API_KEY not configured. Set it to enable HoloMesh.');
    }
    const config: MeshConfig = {
      ...DEFAULT_MESH_CONFIG,
      apiKey,
      orchestratorUrl: process.env.MCP_ORCHESTRATOR_URL || DEFAULT_MESH_CONFIG.orchestratorUrl,
      workspace: process.env.HOLOMESH_WORKSPACE || DEFAULT_MESH_CONFIG.workspace,
      agentName: process.env.HOLOMESH_AGENT_NAME || DEFAULT_MESH_CONFIG.agentName,
    };
    meshClient = new HoloMeshOrchestratorClient(config);
  }
  return meshClient;
}

export function getHoloMeshClient(): HoloMeshOrchestratorClient | null {
  return meshClient;
}

export function hasHoloMeshKey(): boolean {
  return !!process.env.MCP_API_KEY;
}

// ── Handler ──

export async function handleHoloMeshTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown | null> {
  if (!name.startsWith('holomesh_')) return null;

  if (!hasHoloMeshKey()) {
    return {
      error: 'MCP_API_KEY not configured. Set it as an environment variable to enable HoloMesh.',
    };
  }

  const client = getOrCreateClient();

  switch (name) {
    case 'holomesh_discover':
      return handleDiscover(client, args);
    case 'holomesh_contribute':
      return handleContribute(client, args);
    case 'holomesh_query':
      return handleQuery(client, args);
    case 'holomesh_gossip':
      return handleGossip(client, args);
    case 'holomesh_subscribe':
      return handleSubscribe(client, args);
    case 'holomesh_status':
      return handleStatus(client);
    case 'holomesh_collect':
      return handleCollect(client, args);
    default:
      return null;
  }
}

// ── Individual Handlers ──

async function handleDiscover(client: HoloMeshOrchestratorClient, args: Record<string, unknown>) {
  try {
    // Auto-register if not on mesh yet
    if (!client.getAgentId()) {
      await client.registerAgent(['@knowledge-exchange']);
    }

    const traits = args.traits as string[] | undefined;
    const peers = await client.discoverPeers({ traits });
    const limit = (args.limit as number) || 20;

    return {
      success: true,
      peers: peers.slice(0, limit),
      count: Math.min(peers.length, limit),
      total: peers.length,
    };
  } catch (err: any) {
    return { error: `Discovery failed: ${err.message}` };
  }
}

async function handleContribute(client: HoloMeshOrchestratorClient, args: Record<string, unknown>) {
  try {
    if (!client.getAgentId()) {
      await client.registerAgent(['@knowledge-exchange']);
    }

    const content = args.content as string;
    const entryType = (args.type as string) || 'wisdom';
    const entryId = (args.id as string) || `${entryType.charAt(0).toUpperCase()}.auto.${Date.now()}`;
    const provenanceHash = crypto.createHash('sha256').update(content).digest('hex');

    const entry: MeshKnowledgeEntry = {
      id: entryId,
      workspaceId: process.env.HOLOMESH_WORKSPACE || 'ai-ecosystem',
      type: entryType as any,
      content,
      provenanceHash,
      authorId: client.getAgentId()!,
      authorName: process.env.HOLOMESH_AGENT_NAME || 'holomesh-agent',
      price: (args.price as number) || 0,
      queryCount: 0,
      reuseCount: 0,
      domain: args.domain as string,
      tags: args.tags as string[],
      confidence: (args.confidence as number) || 0.9,
      createdAt: new Date().toISOString(),
    };

    const synced = await client.contributeKnowledge([entry]);

    return {
      success: true,
      entryId,
      provenanceHash,
      synced,
      type: entryType,
    };
  } catch (err: any) {
    return { error: `Contribute failed: ${err.message}` };
  }
}

async function handleQuery(client: HoloMeshOrchestratorClient, args: Record<string, unknown>) {
  try {
    const search = args.search as string;
    const results = await client.queryKnowledge(search, {
      type: args.type as string,
      limit: (args.limit as number) || 10,
      workspaceId: args.workspace as string,
    });

    return {
      success: true,
      results,
      count: results.length,
      query: search,
    };
  } catch (err: any) {
    return { error: `Query failed: ${err.message}` };
  }
}

async function handleGossip(client: HoloMeshOrchestratorClient, args: Record<string, unknown>) {
  try {
    if (!client.getAgentId()) {
      await client.registerAgent(['@knowledge-exchange']);
    }

    const to = args.to as string | undefined;
    const payload = {
      type: args.type as string,
      payload: args.payload,
      timestamp: new Date().toISOString(),
    };

    let sent: boolean;
    if (to) {
      sent = await client.sendMessage(to, payload);
    } else {
      sent = await client.broadcast(payload);
    }

    return {
      success: sent,
      target: to || 'broadcast',
      messageType: args.type,
    };
  } catch (err: any) {
    return { error: `Gossip failed: ${err.message}` };
  }
}

async function handleSubscribe(client: HoloMeshOrchestratorClient, args: Record<string, unknown>) {
  try {
    if (!client.getAgentId()) {
      await client.registerAgent(['@knowledge-exchange']);
    }

    const topic = args.topic as string;
    const ok = await client.subscribe(topic);

    return {
      success: ok,
      topic,
      agentId: client.getAgentId(),
    };
  } catch (err: any) {
    return { error: `Subscribe failed: ${err.message}` };
  }
}

async function handleStatus(client: HoloMeshOrchestratorClient) {
  try {
    const agentId = client.getAgentId();
    if (!agentId) {
      return {
        success: true,
        status: 'not_registered',
        message: 'Call holomesh_discover or holomesh_contribute to auto-register.',
      };
    }

    const agentName = process.env.HOLOMESH_AGENT_NAME || 'holomesh-agent';
    const [peers, reputation, inbox] = await Promise.all([
      client.discoverPeers(),
      client.getAgentReputation(agentId, agentName),
      client.readInbox(),
    ]);

    return {
      success: true,
      agentId,
      agentName,
      status: 'active',
      peers: peers.length,
      reputation,
      unreadMessages: inbox.length,
    };
  } catch (err: any) {
    return { error: `Status failed: ${err.message}` };
  }
}

async function handleCollect(client: HoloMeshOrchestratorClient, args: Record<string, unknown>) {
  try {
    const contentHash = args.contentHash as string;
    const referrer = args.referrer as string | undefined;

    // Query the entry by its provenance hash
    const results = await client.queryKnowledge(contentHash, { limit: 1 });
    if (results.length === 0) {
      return { error: `No entry found with provenance hash: ${contentHash}` };
    }

    const entry = results[0];
    if (entry.price <= 0) {
      return {
        success: true,
        message: 'Entry is free — no payment needed.',
        entry,
      };
    }

    // V1: Log the collection intent. V2: trigger Publishing Protocol micropayment.
    return {
      success: true,
      message: `Collection recorded. Payment of $${entry.price} would be processed via Publishing Protocol in V2.`,
      entry,
      price: entry.price,
      referrer,
    };
  } catch (err: any) {
    return { error: `Collect failed: ${err.message}` };
  }
}
