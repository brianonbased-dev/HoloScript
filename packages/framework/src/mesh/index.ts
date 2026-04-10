/**
 * Mesh Module — Peer discovery, signaling, gossip, and A2A interoperability.
 *
 * Canonical home for mesh primitives (previously in @holoscript/agent-sdk,
 * which has been deleted).
 */

import { EventEmitter } from 'events';

// =============================================================================
// MESH DISCOVERY
// =============================================================================

export interface PeerMetadata {
  id: string;
  hostname: string;
  port: number;
  version: string;
  agentCount: number;
  capabilities: string[];
  lastSeen: number;
  latency?: number;
}

export class MeshDiscovery {
  private peers: Map<string, PeerMetadata> = new Map();
  private emitter = new EventEmitter();
  readonly localId: string;

  constructor(localId?: string) {
    this.localId = localId ?? `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  registerPeer(peer: PeerMetadata): void {
    const isNew = !this.peers.has(peer.id);
    this.peers.set(peer.id, { ...peer });
    this.emitter.emit(isNew ? 'peer:discovered' : 'peer:updated', peer);
  }

  removePeer(peerId: string): boolean {
    const peer = this.peers.get(peerId);
    if (peer) {
      this.peers.delete(peerId);
      this.emitter.emit('peer:lost', peer);
      return true;
    }
    return false;
  }

  getPeers(): PeerMetadata[] {
    return [...this.peers.values()];
  }
  getPeer(id: string): PeerMetadata | undefined {
    return this.peers.get(id);
  }
  getPeerCount(): number {
    return this.peers.size;
  }

  pruneStalePeers(timeoutMs: number = 15000): number {
    const now = Date.now();
    let pruned = 0;
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > timeoutMs) {
        this.removePeer(id);
        pruned++;
      }
    }
    return pruned;
  }

  onPeerDiscovered(cb: (peer: PeerMetadata) => void): () => void {
    this.emitter.on('peer:discovered', cb);
    return () => this.emitter.off('peer:discovered', cb);
  }

  onPeerLost(cb: (peer: PeerMetadata) => void): () => void {
    this.emitter.on('peer:lost', cb);
    return () => this.emitter.off('peer:lost', cb);
  }
}

// =============================================================================
// SIGNAL SERVICE
// =============================================================================

export type SignalType = 'did-resolver' | 'mcp-server' | 'storage-node' | 'agent-host' | string;

export interface MeshSignal {
  type: SignalType;
  nodeId: string;
  url: string;
  capabilities: string[];
  expiresAt: number;
}

export class SignalService {
  private localSignals: Map<string, MeshSignal> = new Map();
  private remoteSignals: Map<string, MeshSignal> = new Map();
  readonly nodeId: string;

  constructor(nodeId?: string) {
    this.nodeId = nodeId ?? `node-${Date.now().toString(36)}`;
  }

  broadcastSignal(
    signal: Omit<MeshSignal, 'nodeId' | 'expiresAt'>,
    ttlMs: number = 3600000
  ): MeshSignal {
    const full: MeshSignal = { ...signal, nodeId: this.nodeId, expiresAt: Date.now() + ttlMs };
    this.localSignals.set(`${full.type}:${full.nodeId}`, full);
    return full;
  }

  receiveSignal(signal: MeshSignal): void {
    this.remoteSignals.set(`${signal.type}:${signal.nodeId}`, signal);
  }

  discoverSignals(type: SignalType): MeshSignal[] {
    const now = Date.now();
    for (const [key, sig] of this.remoteSignals) {
      if (sig.expiresAt < now) this.remoteSignals.delete(key);
    }
    return [...this.remoteSignals.values(), ...this.localSignals.values()].filter(
      (s) => s.type === type
    );
  }

  getLocalSignals(): MeshSignal[] {
    return [...this.localSignals.values()];
  }
}

// =============================================================================
// GOSSIP PROTOCOL
// =============================================================================

export interface GossipPacket {
  id: string;
  source: string;
  version: number;
  payload: unknown;
  timestamp: number;
}

export class GossipProtocol {
  private pool: Map<string, GossipPacket> = new Map();

  shareWisdom(sourceId: string, payload: unknown): GossipPacket {
    const packet: GossipPacket = {
      id: `pkt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      source: sourceId,
      version: 1,
      payload,
      timestamp: Date.now(),
    };
    this.pool.set(packet.id, packet);
    return packet;
  }

  antiEntropySync(peerPool: Map<string, GossipPacket>): number {
    let absorbed = 0;
    for (const [id, packet] of peerPool) {
      const local = this.pool.get(id);
      if (!local || local.version < packet.version) {
        this.pool.set(id, packet);
        absorbed++;
      }
    }
    return absorbed;
  }

  getPool(): Map<string, GossipPacket> {
    return new Map(this.pool);
  }
  getPoolSize(): number {
    return this.pool.size;
  }
}

// =============================================================================
// MCP TOOL SCHEMAS
// =============================================================================

export interface MCPToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOL_SCHEMAS: MCPToolSchema[] = [
  {
    name: 'search_knowledge',
    description: 'Semantic vector search across indexed knowledge (patterns, wisdom, gotchas)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        domain: { type: 'string', description: 'Optional domain filter' },
        limit: { type: 'number', description: 'Max results', default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'add_pattern',
    description: 'Index a new pattern (P.XXX.XX format)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        domain: { type: 'string' },
        problem: { type: 'string' },
        solution: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['id', 'domain', 'problem', 'solution'],
    },
  },
  {
    name: 'add_wisdom',
    description: 'Index a new wisdom entry (W.XXX.XX format)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        domain: { type: 'string' },
        insight: { type: 'string' },
        context: { type: 'string' },
      },
      required: ['id', 'domain', 'insight'],
    },
  },
  {
    name: 'add_gotcha',
    description: 'Index a new gotcha (G.XXX.XX format)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        domain: { type: 'string' },
        mistake: { type: 'string' },
        fix: { type: 'string' },
        severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      },
      required: ['id', 'domain', 'mistake', 'fix'],
    },
  },
  {
    name: 'get_session_context',
    description: 'Retrieve current session context and priorities',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'knowledge_stats',
    description: 'Get vector index statistics',
    inputSchema: { type: 'object', properties: {} },
  },
];

// =============================================================================
// AGENT CARD (A2A Interoperability)
// =============================================================================

export interface AgentCard {
  name: string;
  description: string;
  version: string;
  url: string;
  capabilities: AgentCapability[];
  skills: AgentSkill[];
  authentication?: AgentAuthentication;
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
}

export interface AgentCapability {
  id: string;
  name: string;
  description: string;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
}

export interface AgentAuthentication {
  type: 'none' | 'api-key' | 'oauth2' | 'bearer';
  credentials?: Record<string, string>;
}

export function createAgentCard(config: {
  name: string;
  description: string;
  version: string;
  url: string;
  skills: AgentSkill[];
  capabilities?: AgentCapability[];
  auth?: AgentAuthentication;
}): AgentCard {
  return {
    name: config.name,
    description: config.description,
    version: config.version,
    url: config.url,
    capabilities: config.capabilities ?? [],
    skills: config.skills,
    authentication: config.auth ?? { type: 'none' },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
  };
}

export function validateAgentCard(card: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!card || typeof card !== 'object') return { valid: false, errors: ['Not an object'] };

  const c = card as Record<string, unknown>;
  if (typeof c.name !== 'string' || !c.name) errors.push('name is required');
  if (typeof c.version !== 'string' || !c.version) errors.push('version is required');
  if (typeof c.url !== 'string' || !c.url) errors.push('url is required');
  if (!Array.isArray(c.skills)) errors.push('skills must be an array');

  return { valid: errors.length === 0, errors };
}
