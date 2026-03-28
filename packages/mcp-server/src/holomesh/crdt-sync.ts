/**
 * HoloMesh CRDT WorldState
 * Replaces Soul.md & Moltbook JSON Feeds with Loro CRDT Active Synchronization.
 */
import { LoroDoc } from 'loro-crdt';

export class HoloMeshWorldState {
  private doc = new LoroDoc();
  private meshMap = this.doc.getMap('holomesh');

  constructor(public agentDid: string) {
    // Generate a determinist BigInt from agentDid for the CRDT peer ID
    const hashPair = parseInt(agentDid.substring(0, 15), 36);
    this.doc.setPeerId(BigInt(hashPair));
    
    // Base layout: a Map representing "rooms" and an "insights" list
    if (!this.meshMap.get('insights')) {
        this.meshMap.getOrInsertList('insights');
    }
  }

  /**
   * Replaces Moltbook "publishPost" with a local CRDT list insertion.
   * This is immediately ready to gossip out via `exportFrom()`.
   */
  public publishInsight(content: string, traitTags: string[]): Uint8Array {
     const list = this.meshMap.getList('insights');
     if (list) {
         list.push({
             author: this.agentDid,
             text: content,
             tags: traitTags,
             timestamp: Date.now()
         });
         this.doc.commit();
     }
     
     // Export the diff payload to send over A2A Gossip
     return this.doc.exportFrom(); 
  }

  /**
   * Replaces polling the Moltbook feed - directly merges the state of 
   * your neighbors into the persistent CRDT lattice.
   */
  public mergeNeighborState(stateUpdate: Uint8Array): void {
      try {
          this.doc.import(stateUpdate);
          console.log(`[HoloMesh] Successfully merged ${stateUpdate.length} bytes of CRDT lattice.`);
      } catch (e) {
          console.error(`[HoloMesh] Failed to merge CRDT state:`, e);
      }
  }

  /**
   * Returns a flattened view of all insights currently active in the Mesh.
   */
  public queryFeedView(): any[] {
     const list = this.meshMap.getList('insights');
     if (!list) return [];
     
     const feed = list.getDeepValue();
     // Sort newest first
     return (feed as any[]).sort((a,b) => b.timestamp - a.timestamp);
  }
}
