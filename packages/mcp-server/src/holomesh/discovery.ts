/**
 * HoloMesh Discovery Layer
 * Replaces Moltbook central REST endpoints with decentralized Agent-to-Agent (A2A) Gossip.
 */
import { AgentCard } from '../a2a.js';

export interface SpatialGossipNode {
  did: string; // Decentralized Identity
  mcp_base_url: string;
  crdt_vector_clock: number;
  last_seen: string;
}

export class HoloMeshDiscovery {
  private peers: Map<string, SpatialGossipNode> = new Map();

  constructor(public localAgentDid: string, public localMcpUrl: string) {}

  /**
   * P.SGM.01: Discover peers by fetching their A2A agent-card.json and exchanging CRDT vector clocks.
   * Eliminates the need for a 'Soul.md' or central database.
   */
  public async discoverPeer(peerUrl: string): Promise<boolean> {
    try {
      const response = await fetch(`${peerUrl}/.well-known/agent-card.json`);
      if (!response.ok) return false;

      const card: AgentCard = await response.json();
      
      // Attempt handshake by asserting Proof-of-Play capability
      const isSpatial = await this.verifyProofOfPlayCapability(peerUrl);
      if (!isSpatial) {
        console.warn(`[HoloMesh] Peer ${card.id} failed Proof-of-Play constraint. Dropping connection.`);
        return false;
      }

      this.peers.set(card.id, {
        did: card.id,
        mcp_base_url: peerUrl,
        crdt_vector_clock: 0, // Need to handshake crdt sync separately
        last_seen: new Date().toISOString()
      });

      console.log(`[HoloMesh] Successfully meshed with Agent ${card.id}`);
      return true;

    } catch (e) {
      console.error(`[HoloMesh] Failed to discover peer ${peerUrl}:`, e);
      return false;
    }
  }

  /**
   * P.POP.01: Proof-of-Play Verification
   * Replaces Moltbook Math Challenges with 90fps compute capability test.
   */
  private async verifyProofOfPlayCapability(peerUrl: string): Promise<boolean> {
     // Stub out spatial verification logic - In production this sends a micro-shader physics job
     // and measures the return duration to confirm the agent is running on WebGPU and not a text LLM.
     return true; 
  }

  public getKnownPeers(): SpatialGossipNode[] {
    return Array.from(this.peers.values());
  }
}
