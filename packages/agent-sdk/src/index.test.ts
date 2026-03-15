import { describe, it, expect, beforeEach } from 'vitest';
import { MeshDiscovery, SignalService, GossipProtocol, type PeerMetadata, type MeshSignal } from './index';

describe('uAA2++ Agent SDK', () => {
  describe('MeshDiscovery', () => {
    let discovery: MeshDiscovery;
    
    beforeEach(() => {
      discovery = new MeshDiscovery('test-node');
    });

    it('should initialize with a local ID', () => {
      expect(discovery.localId).toBe('test-node');
    });

    it('should register and retrieve peers', () => {
      const peer: PeerMetadata = {
        id: 'peer-1',
        hostname: 'localhost',
        port: 8080,
        version: '1.0.0',
        agentCount: 3,
        capabilities: ['search', 'chat'],
        lastSeen: Date.now()
      };

      discovery.registerPeer(peer);
      
      expect(discovery.getPeerCount()).toBe(1);
      expect(discovery.getPeer('peer-1')).toEqual(peer);
    });

    it('should remove peers', () => {
      const peer: PeerMetadata = {
        id: 'peer-1',
        hostname: 'localhost',
        port: 8080,
        version: '1.0.0',
        agentCount: 1,
        capabilities: [],
        lastSeen: Date.now()
      };

      discovery.registerPeer(peer);
      expect(discovery.removePeer('peer-1')).toBe(true);
      expect(discovery.getPeerCount()).toBe(0);
      expect(discovery.removePeer('nonexistent')).toBe(false);
    });

    it('should prune stale peers', () => {
      const stalePeer: PeerMetadata = {
        id: 'stale-peer',
        hostname: 'localhost',
        port: 8080,
        version: '1.0.0',
        agentCount: 1,
        capabilities: [],
        lastSeen: Date.now() - 20000 // 20 seconds ago
      };

      discovery.registerPeer(stalePeer);
      const pruned = discovery.pruneStalePeers(10000); // 10 second timeout
      
      expect(pruned).toBe(1);
      expect(discovery.getPeerCount()).toBe(0);
    });
  });

  describe('SignalService', () => {
    let service: SignalService;
    
    beforeEach(() => {
      service = new SignalService('test-service');
    });

    it('should broadcast signals', () => {
      const signal = service.broadcastSignal({
        type: 'mcp-server',
        url: 'ws://localhost:3000',
        capabilities: ['search', 'write']
      });

      expect(signal.nodeId).toBe('test-service');
      expect(signal.type).toBe('mcp-server');
      expect(signal.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should discover signals by type', () => {
      service.broadcastSignal({
        type: 'mcp-server',
        url: 'ws://localhost:3000',
        capabilities: ['search']
      });

      const signals = service.discoverSignals('mcp-server');
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('mcp-server');
    });

    it('should receive and store remote signals', () => {
      const remoteSignal: MeshSignal = {
        type: 'agent-host',
        nodeId: 'remote-node',
        url: 'http://remote:4000',
        capabilities: ['chat'],
        expiresAt: Date.now() + 3600000
      };

      service.receiveSignal(remoteSignal);
      const discovered = service.discoverSignals('agent-host');
      
      expect(discovered).toHaveLength(1);
      expect(discovered[0].nodeId).toBe('remote-node');
    });
  });

  describe('GossipProtocol', () => {
    let gossip: GossipProtocol;
    
    beforeEach(() => {
      gossip = new GossipProtocol();
    });

    it('should share wisdom as gossip packets', () => {
      const payload = { message: 'hello world', data: { count: 42 } };
      const packet = gossip.shareWisdom('source-agent', payload);

      expect(packet.source).toBe('source-agent');
      expect(packet.payload).toEqual(payload);
      expect(packet.version).toBe(1);
      expect(gossip.getPoolSize()).toBe(1);
    });

    it('should perform anti-entropy sync', () => {
      const peerPool = new Map();
      peerPool.set('packet-1', {
        id: 'packet-1',
        source: 'peer',
        version: 2,
        payload: { test: 'data' },
        timestamp: Date.now()
      });

      const absorbed = gossip.antiEntropySync(peerPool);
      
      expect(absorbed).toBe(1);
      expect(gossip.getPoolSize()).toBe(1);
      expect(gossip.getPool().get('packet-1')?.version).toBe(2);
    });
  });
});