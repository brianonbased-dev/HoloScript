import { LoroWebRTCProvider } from './LoroWebRTCProvider';
import { LoroDoc } from 'loro-crdt';

export class MeshNodeIntegrator {
  private webrtcProvider: LoroWebRTCProvider;
  private doc: LoroDoc;
  private teamId: string;
  private apiKey: string;
  
  constructor(room: string, teamId: string, apiKey: string) {
    this.doc = new LoroDoc();
    this.teamId = teamId;
    this.apiKey = apiKey;
    
    // Bind the WebRTC provider leveraging the internal secure signaling
    this.webrtcProvider = new LoroWebRTCProvider(this.doc, room, {
      signalingServerUrl: 'wss://mcp.holoscript.net/signaling/v1',
      // We pass HoloMesh bearer token via subprotocols for auth
    });
  }

  public connect() {
    this.webrtcProvider.connect();
    this.registerAgentPresence();
  }

  private registerAgentPresence() {
    // Standard HoloMesh presence heartbeat indicating WebRTC capability
    const heartbeat = () => {
      fetch(`https://mcp.holoscript.net/api/holomesh/team/${this.teamId}/presence`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ide_type: 'gemini',
          status: 'active',
          capabilities: ['webrtc_crdt_sync', 'text_to_universe']
        })
      }).catch(err => console.error('Failed to heartbeat HoloMesh presence', err));
    };

    heartbeat();
    setInterval(heartbeat, 60000); // 60s cadence
  }
  
  public get SpatialDoc() {
    return this.doc;
  }
}
