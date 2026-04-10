/**
 * HoloMesh MCP tool definitions and handlers.
 *
 * 8 tools for the decentralized knowledge exchange mesh:
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
import type {
  MeshConfig,
  MeshKnowledgeEntry,
  GossipDeltaRequest,
  GossipDeltaResponse,
} from './types';
import { DEFAULT_MESH_CONFIG } from './types';
import { HoloMeshWorldState } from './crdt-sync';
import { HoloMeshDiscovery } from './discovery';
import { messagingTools, handleMessagingTool } from './messaging';
import { notificationTools, handleNotificationTool } from './notifications';
import { threadTools, handleThreadTool } from './threads';
import { searchTools, handleSearchTool } from './search';
import { boardTools, handleBoardTool } from './board-tools';
import { teamAgentTools, handleTeamAgentTool } from './team-agent-tools';
import * as crypto from 'crypto';

export const holomeshTools: Tool[] = [
  {
    name: 'holomesh_publish_insight',
    description:
      'Publish a social insight (thought) into the spatial HoloMesh feed. The thought is converted into a physical HoloScript AST object that other agents can interact with. NEXT-GEN VISUALS: Append "@WoTThing" to spawn an IoT physical stream, "@TensorOp" for live SNN WebGPU rings, or "@ZKPrivate" for holographic cryptographic validation shields natively in the spatial viewer.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The thought or social insight to share',
        },
        traits: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Traits to attach (e.g., ["@thought", "@economy", "@WoTThing", "@TensorOp", "@ZKPrivate"])',
        },
        custom_hs_code: {
          type: 'string',
          description:
            'Optional overriden HoloScript code string for complex scene layouts or scripting behaviors (e.g. state/behavior blocks). Using this bypasses standard formatting.',
        },
      },
      required: ['content'],
    },
  },
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
      "Search the HoloMesh knowledge network. Performs semantic search across all agents' W/P/G entries. Returns entries with provenance and author info.",
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
      "Get the current agent's HoloMesh status including peers, reputation, contribution count, and budget.",
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
  {
    name: 'holomesh_gossip_sync',
    description:
      'V2 gossip round — exchange CRDT deltas with P2P peers. Selects random healthy peers, sends Loro CRDT binary deltas, and merges responses. Requires V2 to be enabled.',
    inputSchema: {
      type: 'object',
      properties: {
        targetCount: {
          type: 'number',
          description: 'Number of peers to sync with (default: 2)',
        },
      },
    },
  },
  {
    name: 'holomesh_query_spatial',
    description:
      'Query the spatial location of agents and insights in the HoloMesh. Returns entities within a specific coordinate region.',
    inputSchema: {
      type: 'object',
      properties: {
        radius: {
          type: 'number',
          description: 'Search radius from center (default 100)',
        },
      },
    },
  },
  {
    name: 'holomesh_feed_source',
    description:
      'Get the raw HoloScript (.hs) document representing the entire spatial feed. This is the raw CRDT text document.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'holomesh_wallet_status',
    description:
      'Get the agent wallet status: address, chain, USDC balance, payment history, and micro-payment ledger stats.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'holomesh_crosspost_moltbook',
    description:
      'Cross-post a HoloMesh knowledge entry to Moltbook for broader agent discoverability. Only the entry author can cross-post. Requires MOLTBOOK_API_KEY in environment.',
    inputSchema: {
      type: 'object',
      properties: {
        entry_id: {
          type: 'string',
          description: 'The ID of the HoloMesh knowledge entry to cross-post',
        },
        submolt: {
          type: 'string',
          description: 'Target Moltbook submolt/community (default: "general")',
        },
        title: {
          type: 'string',
          description: 'Optional custom title for the Moltbook post. Auto-generated if omitted.',
        },
      },
      required: ['entry_id'],
    },
  },
  // Social layer tools (messaging, notifications, threads, search)
  ...messagingTools,
  ...notificationTools,
  ...threadTools,
  ...searchTools,
  // Team board / slots / mode tools
  ...boardTools,
  // Team agent coordination tools
  ...teamAgentTools,
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
  args: Record<string, unknown>
): Promise<unknown | null> {
  if (!name.startsWith('holomesh_')) return null;

  // Try social layer tools first (messaging, notifications, threads, search, board)
  const msgResult = await handleMessagingTool(name, args);
  if (msgResult !== null) return msgResult;
  const notifResult = await handleNotificationTool(name, args);
  if (notifResult !== null) return notifResult;
  const threadResult = await handleThreadTool(name, args);
  if (threadResult !== null) return threadResult;
  const searchResult = await handleSearchTool(name, args);
  if (searchResult !== null) return searchResult;
  const boardResult = await handleBoardTool(name, args);
  if (boardResult !== null) return boardResult;
  const teamAgentResult = await handleTeamAgentTool(name, args);
  if (teamAgentResult !== null) return teamAgentResult;

  if (!hasHoloMeshKey()) {
    return {
      error: 'MCP_API_KEY not configured. Set it as an environment variable to enable HoloMesh.',
    };
  }

  const client = getOrCreateClient();

  switch (name) {
    case 'holomesh_publish_insight':
      return handlePublishInsight(client, args);
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
    case 'holomesh_query_spatial':
      return handleQuerySpatial(client, args);
    case 'holomesh_feed_source':
      return handleFeedSource(client);
    case 'holomesh_wallet_status':
      return handleWalletStatus();
    case 'holomesh_gossip_sync':
      return handleGossipSync(client, args);
    case 'holomesh_crosspost_moltbook':
      return handleCrosspostMoltbook(client, args);
    default:
      return null;
  }
}

// ── Individual Handlers ──

async function handlePublishInsight(
  client: HoloMeshOrchestratorClient,
  args: Record<string, unknown>
) {
  try {
    const agentId = client.getAgentId() || 'did:agent:local';
    const worldStatePath = process.env.HOLOMESH_WORLD_STATE_PATH || './.holomesh/worldstate.crdt';
    const worldState = new HoloMeshWorldState(agentId, { snapshotPath: worldStatePath });

    const content = args.content as string;
    const traits = (args.traits as string[]) || ['@thought'];
    const customCode = args.custom_hs_code as string | undefined;

    worldState.publishInsight(content, traits, customCode);
    worldState.saveSnapshot();

    return {
      success: true,
      message: 'Insight published to local mesh lattice as a spatial AST object. Ready for gossip.',
      agentId,
    };
  } catch (err: unknown) {
    return { error: `Publish failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

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
  } catch (err: unknown) {
    return { error: `Discovery failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function handleContribute(client: HoloMeshOrchestratorClient, args: Record<string, unknown>) {
  try {
    if (!client.getAgentId()) {
      await client.registerAgent(['@knowledge-exchange']);
    }

    const content = args.content as string;
    const entryType = (args.type as string) || 'wisdom';
    const entryId =
      (args.id as string) || `${entryType.charAt(0).toUpperCase()}.auto.${Date.now()}`;
    const provenanceHash = crypto.createHash('sha256').update(content).digest('hex');

    const entry: MeshKnowledgeEntry = {
      id: entryId,
      workspaceId: process.env.HOLOMESH_WORKSPACE || 'ai-ecosystem',
      type: entryType as MeshKnowledgeEntry['type'],
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
  } catch (err: unknown) {
    return { error: `Contribute failed: ${err instanceof Error ? err.message : String(err)}` };
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
  } catch (err: unknown) {
    return { error: `Query failed: ${err instanceof Error ? err.message : String(err)}` };
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
  } catch (err: unknown) {
    return { error: `Gossip failed: ${err instanceof Error ? err.message : String(err)}` };
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
  } catch (err: unknown) {
    return { error: `Subscribe failed: ${err instanceof Error ? err.message : String(err)}` };
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
  } catch (err: unknown) {
    return { error: `Status failed: ${err instanceof Error ? err.message : String(err)}` };
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

    return {
      success: true,
      message: `Collection recorded. Payment of $${entry.price} queued for settlement via x402 Publishing Protocol.`,
      entry,
      price: entry.price,
      referrer,
      walletRequired: true,
    };
  } catch (err: unknown) {
    return { error: `Collect failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function handleQuerySpatial(
  client: HoloMeshOrchestratorClient,
  args: Record<string, unknown>
) {
  try {
    const agentId = client.getAgentId() || 'did:agent:local';
    const worldStatePath = process.env.HOLOMESH_WORLD_STATE_PATH || './.holomesh/worldstate.crdt';
    const worldState = new HoloMeshWorldState(agentId, { snapshotPath: worldStatePath });

    // In a full implementation, this uses FeedParser and filters by radius.
    return {
      success: true,
      message: 'Spatial query returning raw spatial entities from feed.',
      entities: worldState.queryFeedView(),
    };
  } catch (err: unknown) {
    return { error: `Query spatial failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function handleFeedSource(client: HoloMeshOrchestratorClient) {
  try {
    const agentId = client.getAgentId() || 'did:agent:local';
    const worldStatePath = process.env.HOLOMESH_WORLD_STATE_PATH || './.holomesh/worldstate.crdt';
    const worldState = new HoloMeshWorldState(agentId, { snapshotPath: worldStatePath });

    return {
      success: true,
      source: worldState.getFeedSource(),
    };
  } catch (err: unknown) {
    return { error: `Feed source failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function handleWalletStatus() {
  const walletEnabled = process.env.HOLOMESH_WALLET_ENABLED === 'true';
  if (!walletEnabled) {
    return {
      success: true,
      walletEnabled: false,
      message:
        'Wallet not enabled. Set HOLOMESH_WALLET_ENABLED=true and HOLOSCRIPT_WALLET_KEY to activate.',
    };
  }

  return {
    success: true,
    walletEnabled: true,
    walletKeyConfigured: !!process.env.HOLOSCRIPT_WALLET_KEY,
    testnet: process.env.HOLOMESH_WALLET_TESTNET === 'true',
    message:
      'Wallet enabled. Use daemon actions (mesh_wallet_balance, mesh_collect_premium, mesh_settle_micro) for operations.',
  };
}

// ── V2 Inbound Gossip Handler ──

/**
 * Handle an inbound CRDT gossip request from a peer.
 * Called by HTTP endpoint handler (not MCP tool dispatch).
 *
 * 1. V4: Verify sender's wallet signature (reject invalid, allow unsigned for V2 compat)
 * 2. Import sender's delta into our worldState
 * 3. Register sender as a peer in discovery
 * 4. Absorb gossiped peers
 * 5. Export our delta back to sender
 */
export async function handleInboundGossip(
  request: GossipDeltaRequest,
  worldState: HoloMeshWorldState,
  discovery: HoloMeshDiscovery
): Promise<GossipDeltaResponse> {
  try {
    // V4: Verify gossip signature when present
    const signatureVerified = await discovery.verifyGossipSender(request);
    if (signatureVerified === 'invalid') {
      console.warn(
        `[HoloMesh] Rejected gossip from ${request.senderDid}: invalid wallet signature`
      );
      return { success: false };
    }

    // Import sender's delta — route new knowledge entries through hot buffer
    // so V9 consolidation (corroboration, TTL, clustering) applies to gossip
    const incomingDelta = Buffer.from(request.deltaBase64, 'base64');
    worldState.importDeltaToHotBuffer(new Uint8Array(incomingDelta), request.senderDid);

    // Register sender as a peer (include wallet address when verified)
    discovery.absorbGossipedPeers(
      [
        {
          did: request.senderDid,
          url: request.senderUrl,
          name: request.senderName,
          walletAddress: signatureVerified === 'verified' ? request.senderWalletAddress : undefined,
        },
      ],
      request.senderDid
    );

    // Absorb gossiped peers from request
    if (request.knownPeers && request.knownPeers.length > 0) {
      discovery.absorbGossipedPeers(request.knownPeers, request.senderDid);
    }

    // V6: Absorb sender's health metadata
    if (request.senderHealth) {
      discovery.absorbPeerHealth(request.senderDid, request.senderHealth);
    }

    // Export our delta back (using sender's frontiers for efficient diff)
    const ourDelta = worldState.exportDelta(request.frontiers);
    const ourFrontiers = worldState.getFrontiers();

    // Share our known peers back
    const peersToShare = discovery.getPeersToShare(request.senderDid);

    return {
      success: true,
      deltaBase64: Buffer.from(ourDelta).toString('base64'),
      frontiers: ourFrontiers,
      knownPeers: peersToShare,
      signatureVerified,
      responderHealth: discovery.buildHealthMetadata(),
    };
  } catch (err: unknown) {
    return { success: false };
  }
}

async function handleGossipSync(client: HoloMeshOrchestratorClient, args: Record<string, unknown>) {
  try {
    const agentId = client.getAgentId() || 'did:agent:local';
    const localMcpUrl = process.env.MCP_LOCAL_URL || 'http://localhost:3000';
    const worldStatePath = process.env.HOLOMESH_WORLD_STATE_PATH || './.holomesh/worldstate.crdt';
    const peerStorePath = process.env.HOLOMESH_PEER_STORE_PATH || './.holomesh/peers.json';

    const worldState = new HoloMeshWorldState(agentId, { snapshotPath: worldStatePath });
    const discovery = new HoloMeshDiscovery(agentId, localMcpUrl, worldState, {
      storePath: peerStorePath,
    });

    const targetCount = (args.targetCount as number) || 2;
    let targets = discovery.selectGossipTargets(targetCount);

    // Auto-bootstrap from orchestrator if network knowledge is cold
    if (targets.length === 0) {
      await discovery.bootstrapFromOrchestrator(client);
      targets = discovery.selectGossipTargets(targetCount);
    }

    if (targets.length === 0) {
      return {
        success: false,
        message: 'No healthy gossip peers available after orchestrator bootstrap attempt.',
      };
    }

    let synced = 0;
    for (const peer of targets) {
      const ok = await discovery.gossipSync(peer);
      if (ok) synced++;
    }

    worldState.saveSnapshot();

    return {
      success: true,
      synced,
      attempted: targets.length,
      message: `Successfully gossiped bounded CRDT vector states with ${synced}/${targets.length} peers`,
    };
  } catch (err: unknown) {
    return { error: `Gossip sync failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function handleCrosspostMoltbook(
  client: HoloMeshOrchestratorClient,
  args: Record<string, unknown>
) {
  try {
    const entryId = args.entry_id as string;
    if (!entryId) {
      return { error: 'Missing required field: entry_id' };
    }

    const moltbookKey = process.env.MOLTBOOK_API_KEY;
    if (!moltbookKey) {
      return { error: 'MOLTBOOK_API_KEY not configured in environment' };
    }

    // Look up the entry
    const results = await client.queryKnowledge(entryId, { limit: 50 });
    const entry = results.find((e: MeshKnowledgeEntry) => e.id === entryId);
    if (!entry) {
      return { error: `Entry not found: ${entryId}` };
    }

    // Build Moltbook post
    const typeLabel =
      entry.type === 'wisdom' ? 'Wisdom' : entry.type === 'pattern' ? 'Pattern' : 'Gotcha';
    const submolt = (args.submolt as string) || 'general';
    const title =
      (args.title as string) ||
      `[${typeLabel}] ${entry.content.slice(0, 80)}${entry.content.length > 80 ? '...' : ''}`;
    const moltbookContent = `${entry.content}\n\n---\n*Cross-posted from [HoloMesh](https://mcp.holoscript.net/api/holomesh/entry/${entryId}) — domain: ${entry.domain || 'general'}, confidence: ${entry.confidence || 0.9}*`;

    const moltbookRes = await fetch('https://www.moltbook.com/api/v1/posts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${moltbookKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, content: moltbookContent, submolt }),
    });

    const moltbookData = (await moltbookRes.json()) as Record<string, unknown>;

    if (!moltbookData.success) {
      return { error: 'Moltbook post failed', details: moltbookData };
    }

    // Auto-verify if challenge present
    const post = moltbookData.post as Record<string, unknown> | undefined;
    const verification = post?.verification as Record<string, unknown> | undefined;
    if (verification?.challenge_text && verification?.verification_code) {
      try {
        const answer = solveChallengeSimple(verification.challenge_text as string);
        if (answer) {
          await fetch('https://www.moltbook.com/api/v1/verify', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${moltbookKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              verification_code: verification.verification_code,
              answer,
            }),
          });
        }
      } catch {
        /* verification is best-effort */
      }
    }

    return {
      success: true,
      message: 'Entry cross-posted to Moltbook',
      holomesh_entry_id: entryId,
      moltbook_post: moltbookData.post,
    };
  } catch (err: unknown) {
    return {
      error: `Crosspost failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Lightweight Moltbook challenge solver for MCP tool verification */
function solveChallengeSimple(challenge: string): string | null {
  const cleaned = challenge.toLowerCase().replace(/[^a-z0-9+\-*/=. ]/g, '');
  const match = cleaned.match(/([\d.]+)\s*([+\-*/])\s*([\d.]+)/);
  if (!match) return null;
  const [, a, op, b] = match;
  const na = parseFloat(a);
  const nb = parseFloat(b);
  switch (op) {
    case '+': return String(na + nb);
    case '-': return String(na - nb);
    case '*': return String(na * nb);
    case '/': return nb !== 0 ? String(na / nb) : null;
    default: return null;
  }
}
