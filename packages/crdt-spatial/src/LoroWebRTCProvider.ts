import { LoroDoc } from 'loro-crdt';
import type { LoroEventBatch } from 'loro-crdt';
import {
  FILM3D_VOLUMETRICS_ROOT,
  MAX_VOLUMETRIC_WEBRTC_SYNC_BYTES,
  ensureFilm3dVolumetricsRoot,
  isWithinVolumetricWebRtcSyncBudget,
} from './film3dVolumetricCrdt.js';
import {
  LEGAL_DOCUMENT_CONTRACTS_ROOT,
  appendLegalAuditTrailEntry,
  ensureLegalDocumentContractsRoot,
  setLegalContractSnapshot,
  setLegalSignatureBlock,
  type AuditTrailEntrySnapshot,
  type LegalContractSpatialSnapshot,
  type SignatureBlockSnapshot,
} from './legalDocumentCrdt.js';

export interface WebRTCProviderConfig {
  signalingServerUrl: string;
  iceServers?: RTCIceServer[];
  syncIntervalMs?: number;
}

export class LoroWebRTCProvider {
  private doc: LoroDoc;
  private room: string;
  private config: WebRTCProviderConfig;
  private peerConnections: Map<string, RTCPeerConnection>;
  private dataChannels: Map<string, RTCDataChannel>;
  private signalingWs: WebSocket | null = null;
  private reconnectInterval: any;

  constructor(doc: LoroDoc, room: string, config?: Partial<WebRTCProviderConfig>) {
    this.doc = doc;
    this.room = room;
    this.config = {
      signalingServerUrl: config?.signalingServerUrl || 'wss://signaling.holoscript.net',
      iceServers: config?.iceServers || [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      syncIntervalMs: config?.syncIntervalMs || 50,
    };
    this.peerConnections = new Map();
    this.dataChannels = new Map();

    console.log(
      `[LoroWebRTC] Initialized hardened multiplayer semantic canvas for room: ${room} (volumetric root: "${FILM3D_VOLUMETRICS_ROOT}", legal root: "${LEGAL_DOCUMENT_CONTRACTS_ROOT}")`
    );

    // Pre-initialize the volumetrics root map so it is included in all exports from t=0.
    ensureFilm3dVolumetricsRoot(this.doc);
    // Pre-initialize legal contracts root map for SignatureBlock / AuditTrail multi-agent sync.
    ensureLegalDocumentContractsRoot(this.doc);

    // Subscribe to Loro local changes to broadcast
    this.doc.subscribe((batch: LoroEventBatch) => {
      if (batch.by === 'local') {
        const update = this.doc.export({ mode: "update" }); // Send full state or deltas if tracked
        if (!isWithinVolumetricWebRtcSyncBudget(update.byteLength)) {
          console.warn(
            `[LoroWebRTC] Skipping outbound sync: ${update.byteLength} bytes exceeds volumetric WebRTC cap (${MAX_VOLUMETRIC_WEBRTC_SYNC_BYTES}); split volumetrics with chunk APIs`
          );
          return;
        }
        this.sync(update);
      }
    });

    setInterval(() => this.healthCheck(), 10000);
  }

  public connect() {
    console.log(`[LoroWebRTC] Connecting to signaling server: ${this.config.signalingServerUrl}...`);
    this.signalingWs = new WebSocket(this.config.signalingServerUrl);

    this.signalingWs.onopen = () => {
      console.log(`[LoroWebRTC] Signaling server connected. Joining room ${this.room}...`);
      this.sendMessage({ type: 'join', room: this.room });
      if (this.reconnectInterval) clearInterval(this.reconnectInterval);
    };

    this.signalingWs.onmessage = async (e) => {
      const msg = JSON.parse(e.data);
      switch(msg.type) {
        case 'peer-joined':
          await this.createPeerConnection(msg.peerId, true);
          break;
        case 'offer':
          await this.handleOffer(msg.peerId, msg.sdp);
          break;
        case 'answer':
          await this.handleAnswer(msg.peerId, msg.sdp);
          break;
        case 'ice-candidate':
          await this.handleIceCandidate(msg.peerId, msg.candidate);
          break;
        case 'peer-left':
          this.removePeer(msg.peerId);
          break;
      }
    };

    this.signalingWs.onclose = () => {
      console.warn(`[LoroWebRTC] Signaling connection lost, attempting reconnect in 5s...`);
      this.reconnectInterval = setTimeout(() => this.connect(), 5000);
    };
  }

  private async createPeerConnection(peerId: string, isInitiator: boolean) {
    const pc = new RTCPeerConnection({ iceServers: this.config.iceServers });
    this.peerConnections.set(peerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendMessage({ type: 'ice-candidate', peerId, room: this.room, candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.removePeer(peerId);
      }
    };

    if (isInitiator) {
      const dc = pc.createDataChannel('loro-sync', { ordered: false, maxRetransmits: 0 }); // Hardened for spatial sync
      this.setupDataChannel(peerId, dc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.sendMessage({ type: 'offer', peerId, room: this.room, sdp: pc.localDescription });
    } else {
      pc.ondatachannel = (event) => this.setupDataChannel(peerId, event.channel);
    }
  }

  private setupDataChannel(peerId: string, dc: RTCDataChannel) {
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => {
      console.log(`[LoroWebRTC] Data channel to ${peerId} open.`);
      this.dataChannels.set(peerId, dc);
      const state = this.doc.export({ mode: "update" }); // Full sync on connect
      if (state.length > 0) {
        if (!isWithinVolumetricWebRtcSyncBudget(state.byteLength)) {
          console.warn(
            `[LoroWebRTC] Skipping initial sync to ${peerId}: ${state.byteLength} bytes exceeds volumetric WebRTC cap (${MAX_VOLUMETRIC_WEBRTC_SYNC_BYTES})`
          );
        } else {
          dc.send(state.buffer as ArrayBuffer);
        }
      }
    };
    dc.onmessage = (event) => {
      const updateBytes = new Uint8Array(event.data);
      this.handleIncomingSync(updateBytes, peerId);
    };
    dc.onclose = () => this.dataChannels.delete(peerId);
  }

  private async handleOffer(peerId: string, sdp: RTCSessionDescriptionInit) {
    await this.createPeerConnection(peerId, false);
    const pc = this.peerConnections.get(peerId)!;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.sendMessage({ type: 'answer', peerId, room: this.room, sdp: pc.localDescription });
  }

  private async handleAnswer(peerId: string, sdp: RTCSessionDescriptionInit) {
    const pc = this.peerConnections.get(peerId);
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit) {
    const pc = this.peerConnections.get(peerId);
    if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  private sendMessage(msg: any) {
    if (this.signalingWs?.readyState === WebSocket.OPEN) {
      this.signalingWs.send(JSON.stringify(msg));
    }
  }

  public sync(updateBytes: Uint8Array) {
    if (!isWithinVolumetricWebRtcSyncBudget(updateBytes.byteLength)) {
      console.warn(
        `[LoroWebRTC] Refusing outbound sync: ${updateBytes.byteLength} bytes exceeds cap (${MAX_VOLUMETRIC_WEBRTC_SYNC_BYTES})`
      );
      return;
    }
    for (const [peerId, dc] of this.dataChannels) {
      if (dc.readyState === 'open') {
        try {
          dc.send(updateBytes.buffer as ArrayBuffer);
        } catch (err) {
          console.warn(`[LoroWebRTC] Failed to send to ${peerId}`, err);
        }
      }
    }
  }

  public handleIncomingSync(updateBytes: Uint8Array, peerId?: string) {
    if (!isWithinVolumetricWebRtcSyncBudget(updateBytes.byteLength)) {
      console.warn(
        `[LoroWebRTC] Dropped oversized volumetric sync${peerId ? ` from ${peerId}` : ''}: ${updateBytes.byteLength} bytes (max ${MAX_VOLUMETRIC_WEBRTC_SYNC_BYTES})`
      );
      return;
    }
    try {
      this.doc.import(updateBytes);
    } catch (err) {
      console.error(`[LoroWebRTC] Update rejection/conflict parsing: `, err);
    }
  }

  private removePeer(peerId: string) {
    this.dataChannels.get(peerId)?.close();
    this.dataChannels.delete(peerId);
    this.peerConnections.get(peerId)?.close();
    this.peerConnections.delete(peerId);
  }

  private healthCheck() {
    // Keep-alive or periodic full state hash checks
    if(this.signalingWs && this.signalingWs.readyState === WebSocket.CLOSED) {
      this.connect();
    }
  }

  public disconnect() {
    this.signalingWs?.close();
    if (this.reconnectInterval) clearInterval(this.reconnectInterval);
    for (const peer of Array.from(this.peerConnections.keys())) {
      this.removePeer(peer);
    }
  }

  /**
   * Sync SignatureBlock state for a legal contract into the shared CRDT graph.
   * Replication to peers is handled by the provider's local-change subscription.
   */
  public syncLegalSignatureBlock(documentId: string, signatureBlock: SignatureBlockSnapshot): void {
    setLegalSignatureBlock(this.doc, documentId, signatureBlock);
  }

  /**
   * Append a legal audit trail event for multi-agent contract execution traces.
   */
  public appendLegalAuditEvent(documentId: string, entry: AuditTrailEntrySnapshot): void {
    appendLegalAuditTrailEntry(this.doc, documentId, entry);
  }

  /**
   * Sync a full legal contract snapshot (meta + SignatureBlock + AuditTrail).
   */
  public syncLegalContractSnapshot(snapshot: LegalContractSpatialSnapshot): void {
    setLegalContractSnapshot(this.doc, snapshot);
  }
}
