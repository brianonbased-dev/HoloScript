import { describe, it, expect, beforeEach } from 'vitest';
import {
  MeshDiscovery,
  SignalService,
  GossipProtocol,
  MCP_TOOL_SCHEMAS,
  createAgentCard,
  validateAgentCard,
} from '../index';
import type { PeerMetadata, MeshSignal, GossipPacket } from '../index';

// =============================================================================
// MESH DISCOVERY TESTS
// =============================================================================

describe('MeshDiscovery', () => {
  let mesh: MeshDiscovery;

  beforeEach(() => {
    mesh = new MeshDiscovery('test-node');
  });

  it('should have a local ID', () => {
    expect(mesh.localId).toBe('test-node');
  });

  it('should register and retrieve peers', () => {
    const peer: PeerMetadata = {
      id: 'peer-1',
      hostname: 'localhost',
      port: 3001,
      version: '1.0.0',
      agentCount: 2,
      capabilities: ['holoscript'],
      lastSeen: Date.now(),
    };
    mesh.registerPeer(peer);
    expect(mesh.getPeerCount()).toBe(1);
    expect(mesh.getPeer('peer-1')).toBeDefined();
    expect(mesh.getPeer('peer-1')?.hostname).toBe('localhost');
  });

  it('should emit peer:discovered event', () => {
    let discovered: PeerMetadata | null = null;
    mesh.onPeerDiscovered((peer) => {
      discovered = peer;
    });

    mesh.registerPeer({
      id: 'new-peer',
      hostname: 'remote',
      port: 5000,
      version: '1.0.0',
      agentCount: 0,
      capabilities: [],
      lastSeen: Date.now(),
    });

    expect(discovered).not.toBeNull();
    expect(discovered!.id).toBe('new-peer');
  });

  it('should remove peers', () => {
    mesh.registerPeer({
      id: 'temp',
      hostname: 'x',
      port: 1,
      version: '1',
      agentCount: 0,
      capabilities: [],
      lastSeen: Date.now(),
    });
    expect(mesh.removePeer('temp')).toBe(true);
    expect(mesh.getPeerCount()).toBe(0);
  });

  it('should prune stale peers', () => {
    mesh.registerPeer({
      id: 'stale',
      hostname: 'x',
      port: 1,
      version: '1',
      agentCount: 0,
      capabilities: [],
      lastSeen: Date.now() - 30000,
    });
    mesh.registerPeer({
      id: 'fresh',
      hostname: 'x',
      port: 2,
      version: '1',
      agentCount: 0,
      capabilities: [],
      lastSeen: Date.now(),
    });
    const pruned = mesh.pruneStalePeers(15000);
    expect(pruned).toBe(1);
    expect(mesh.getPeerCount()).toBe(1);
  });
});

// =============================================================================
// SIGNAL SERVICE TESTS
// =============================================================================

describe('SignalService', () => {
  let signals: SignalService;

  beforeEach(() => {
    signals = new SignalService('node-test');
  });

  it('should broadcast local signals', () => {
    const sig = signals.broadcastSignal({
      type: 'mcp-server',
      url: 'http://localhost:3000',
      capabilities: ['knowledge'],
    });
    expect(sig.nodeId).toBe('node-test');
    expect(sig.expiresAt).toBeGreaterThan(Date.now());
  });

  it('should discover local signals', () => {
    signals.broadcastSignal({
      type: 'mcp-server',
      url: 'http://localhost:3000',
      capabilities: [],
    });
    const found = signals.discoverSignals('mcp-server');
    expect(found).toHaveLength(1);
    expect(found[0].url).toBe('http://localhost:3000');
  });

  it('should discover remote signals', () => {
    signals.receiveSignal({
      type: 'did-resolver',
      nodeId: 'remote-1',
      url: 'http://remote:9000',
      capabilities: ['resolve'],
      expiresAt: Date.now() + 60000,
    });
    const found = signals.discoverSignals('did-resolver');
    expect(found).toHaveLength(1);
  });

  it('should prune expired remote signals', () => {
    signals.receiveSignal({
      type: 'storage-node',
      nodeId: 'expired',
      url: 'http://old',
      capabilities: [],
      expiresAt: Date.now() - 1000,
    });
    const found = signals.discoverSignals('storage-node');
    expect(found).toHaveLength(0);
  });
});

// =============================================================================
// GOSSIP PROTOCOL TESTS
// =============================================================================

describe('GossipProtocol', () => {
  let gossip: GossipProtocol;

  beforeEach(() => {
    gossip = new GossipProtocol();
  });

  it('should share wisdom and store in pool', () => {
    const packet = gossip.shareWisdom('agent-1', { insight: 'Test is good' });
    expect(packet.source).toBe('agent-1');
    expect(gossip.getPoolSize()).toBe(1);
  });

  it('should sync via anti-entropy', () => {
    const other = new GossipProtocol();
    other.shareWisdom('agent-2', { insight: 'From peer' });
    other.shareWisdom('agent-3', { insight: 'Another' });

    const absorbed = gossip.antiEntropySync(other.getPool());
    expect(absorbed).toBe(2);
    expect(gossip.getPoolSize()).toBe(2);
  });

  it('should not re-absorb known packets', () => {
    const packet = gossip.shareWisdom('agent-1', { data: 'original' });
    const peerPool = new Map<string, GossipPacket>();
    peerPool.set(packet.id, { ...packet }); // Same version

    const absorbed = gossip.antiEntropySync(peerPool);
    expect(absorbed).toBe(0);
  });

  it('should absorb newer versions', () => {
    const packet = gossip.shareWisdom('agent-1', { data: 'v1' });
    const peerPool = new Map<string, GossipPacket>();
    peerPool.set(packet.id, { ...packet, version: 2, payload: { data: 'v2' } });

    const absorbed = gossip.antiEntropySync(peerPool);
    expect(absorbed).toBe(1);
  });
});

// =============================================================================
// MCP TOOL SCHEMA TESTS
// =============================================================================

describe('MCP Tool Schemas', () => {
  it('should define 6 standard tools', () => {
    expect(MCP_TOOL_SCHEMAS).toHaveLength(6);
  });

  it('should include search_knowledge', () => {
    const tool = MCP_TOOL_SCHEMAS.find((t) => t.name === 'search_knowledge');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('Semantic');
  });

  it('should include add_pattern with required fields', () => {
    const tool = MCP_TOOL_SCHEMAS.find((t) => t.name === 'add_pattern');
    expect(tool).toBeDefined();
    const schema = tool!.inputSchema as any;
    expect(schema.required).toContain('id');
    expect(schema.required).toContain('problem');
    expect(schema.required).toContain('solution');
  });

  it('should include add_gotcha with severity enum', () => {
    const tool = MCP_TOOL_SCHEMAS.find((t) => t.name === 'add_gotcha');
    expect(tool).toBeDefined();
    const schema = tool!.inputSchema as any;
    expect(schema.properties.severity.enum).toContain('critical');
  });
});

// =============================================================================
// AGENT CARD TESTS
// =============================================================================

describe('Agent Card', () => {
  it('should create a valid agent card', () => {
    const card = createAgentCard({
      name: 'TestAgent',
      description: 'A test agent',
      version: '1.0.0',
      url: 'http://localhost:3000',
      skills: [{ id: 'code', name: 'Coding', description: 'Writes code', tags: ['dev'] }],
    });

    expect(card.name).toBe('TestAgent');
    expect(card.skills).toHaveLength(1);
    expect(card.authentication?.type).toBe('none');
    expect(card.defaultInputModes).toContain('application/json');
  });

  it('should validate a correct agent card', () => {
    const card = createAgentCard({
      name: 'Agent',
      description: 'Test',
      version: '1.0',
      url: 'http://x',
      skills: [],
    });
    const result = validateAgentCard(card);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject invalid agent card', () => {
    const result = validateAgentCard({ description: 'Missing fields' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should reject non-objects', () => {
    expect(validateAgentCard(null).valid).toBe(false);
    expect(validateAgentCard('string').valid).toBe(false);
  });
});
